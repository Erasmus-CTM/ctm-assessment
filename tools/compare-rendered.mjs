#!/usr/bin/env node
// Compares two renders of a site page by page (design §13 A1): which script and
// style files a page loads, its inline scripts (configuration objects compared
// as JSON, code by kind), and its body DOM (canonical: sorted attributes,
// normalized whitespace, render noise removed; an end tag names its element's
// class and id). Every difference is classified by the expectation files
// (YAML, tools/compare-rendered/expect/); a difference that no category
// explains fails the run. Besides the difference itself, an item says where a
// DOM difference sits (`ancestors`), what an added or removed element holds
// (`content`), what a changed text lost and gained word by word (`lost`,
// `gained`), and what the after page has (`tabsets`, `reveals`, `embeds`,
// `modes`); an element removed and added unchanged elsewhere is "moved".
//
//   node tools/compare-rendered.mjs --before DIR --after DIR [--expect FILE ...] \
//     [--name LABEL] [--report OUT.json] [--summary OUT.md] [--pages a.html,b.html] [--reveal-ends FILE]
//
// --reveal-ends FILE: how the old course's <details> ended
// (tools/migrate-course-html.py --reveal-ends on the old course); without
// it no reveal may take in the heading after it (see revealChecks).
//
// Exit status: 0 when every difference is expected, 1 otherwise, 2 on errors.
import fs from 'node:fs';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {createRequire} from 'node:module';
import {closedBySection, loadRevealEnds} from './compare-rendered/reveal-ends.mjs';
import {markStoreAdditions} from './compare-rendered/store.mjs';
import {stackTransition,markStackChanges} from './compare-rendered/stack.mjs';
import {loadAssetSources, markAssetChanges} from './compare-rendered/assets.mjs';
const require = createRequire(import.meta.url);
const vm = require('node:vm');
const {JSDOM} = require('jsdom');
const yaml = require('js-yaml');

// ---------------------------------------------------------------- options
function options(argv) {
  const o = {expect: [], pages: null, name: '', report: null, summary: null, before: null, after: null, revealEnds: null};
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (flag === '--expect') o.expect.push(value);
    else if (flag === '--pages') o.pages = value.split(',').filter(Boolean);
    else if (flag === '--asset-sources') o.assetSources = value;
    else if (flag === '--asset-pins') o.assetPins = value;
    else if (flag === '--renderer-before-sources') o.rendererBeforeSources = value;
    else if (flag === '--renderer-before-pins') o.rendererBeforePins = value;
    else if (flag === '--reveal-ends') o.revealEnds = value;
    else if (['--before', '--after', '--name', '--report', '--summary'].includes(flag)) o[flag.slice(2)] = value;
    else throw new Error('Unknown option ' + flag);
  }
  if (!o.before || !o.after) throw new Error('Usage: compare-rendered.mjs --before DIR --after DIR [--expect FILE ...]');
  return o;
}

// ---------------------------------------------------------------- pages
function htmlPages(root) {
  return fs.readdirSync(root, {recursive: true}).map(String).map(p => p.split(path.sep).join('/'))
    .filter(p => p.endsWith('.html') && !p.split('/').some(part => part === 'site_libs' || part.endsWith('_files')))
    .sort();
}

// Render noise that is not a change: JSXGraph's random board names (also inside
// the base64 iframe documents), versioned dependency folders, and the attribute
// order of HTML written into JSON attributes from a Lua table.
const JXG = /JXG[0-9a-f]{8}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{8}/g;
const normUrl = url => url.split('?')[0].replace(/(?:^|.*\/)(?:site_libs\/|[^/]*_files\/libs\/)/, '').replace(/quarto-contrib\/([\w-]+?)-\d+\.\d+\.\d+[^/]*\//, '$1/');
function noiseFree(name, value) {
  if (name === 'name' || name === 'id') value = value.replace(JXG, 'JXG*');
  if (name === 'src' && value.startsWith('data:text/html;base64,')) {
    return 'data:text/html;decoded,' + Buffer.from(value.slice(22), 'base64').toString('utf8').replace(JXG, 'JXG*');
  }
  if (name === 'data-pool' || name === 'data-variants') {
    return value.replace(/<(\w+)((?:\s+[\w-]+=\\"(?:[^"\\]|\\[^"])*\\")+)(\s*\/?)>/g, (all, tag, attrs, end) =>
      '<' + tag + ' ' + attrs.trim().match(/[\w-]+=\\"(?:[^"\\]|\\[^"])*\\"/g).sort().join(' ') + end + '>');
  }
  return value.replace(JXG, 'JXG*');
}

// Inline scripts: configuration objects as JSON, everything else by kind.
// pyodide-interaktiv writes its cells' data into its settings script.
const CELL_DETAILS = /^globalThis\.qpyodideCellDetails = (\[.*\]);$/m;
// pyodide-interaktiv's settings script (qpyodide-document-settings.js) only
// assigns globals: its values are compared as one configuration object,
// qpyodideSettings (the cells as qpyodideCellDetails), and its comments and
// layout not at all (step 3: 1.9 writes it as a classic script).
function pyodideSettings(t) {
  if (!t.startsWith('// qpyodide-document-settings.js')) return null;
  const scope = {};
  try { vm.runInNewContext(t, scope, {timeout: 1000}); } catch (_) { return null; }
  const json = JSON.parse(JSON.stringify(scope));
  const cells = json.qpyodideCellDetails || null;
  delete json.qpyodideCellDetails;
  return {kind: 'qpyodideSettings', json, cells};
}
function inlineScript(text) {
  let t = text.trim(), cells = null;
  const settings = pyodideSettings(t);
  if (settings) return settings;
  const details = CELL_DETAILS.exec(t);
  if (details && !t.startsWith('globalThis.qpyodideCellDetails')) {
    try { cells = JSON.parse(details[1]); t = t.replace(CELL_DETAILS, 'globalThis.qpyodideCellDetails = <cells>;'); } catch (_) { cells = null; }
  }
  const found = inlineKind(t);
  if (cells) found.cells = cells;
  return found;
}
function inlineKind(t) {
  let m = /^window\.(__\w+)\s*=\s*([\s\S]*?);?\s*$/.exec(t);
  if (m) { try { return {kind: m[1], json: JSON.parse(m[2])}; } catch (_) { /* code */ } }
  m = /^\(window\.__pyExercises = window\.__pyExercises \|\| \[\]\)\.push\(([\s\S]*)\);?\s*$/.exec(t);
  if (m) { try { return {kind: '__pyExercises', json: JSON.parse(m[1]), many: true}; } catch (_) { /* code */ } }
  m = /^globalThis\.qpyodideCellDetails\s*=\s*([\s\S]*?);?\s*$/.exec(t);
  if (m) { try { return {kind: 'qpyodideCellDetails', json: JSON.parse(m[1]), many: true}; } catch (_) { /* code */ } }
  if (t.includes('var ME_CFG =')) return {kind: 'math-exercise bundle', code: t};
  if (t.includes('function setupExercise(') || t.includes('var MODULE_PY = [')) return {kind: 'py-exercise bundle', code: t};
  if (t.includes('MathExerciseRuntime')) return {kind: 'runtime bundle', code: t};
  if (/^\/\/ (qpyodide|Pyodide|Preserve upstream)/.test(t)) return {kind: 'pyodide-interaktiv: ' + t.split('\n')[0].slice(3, 60), code: t};
  return {kind: 'code ' + t.slice(0, 50).replace(/\s+/g, ' '), code: t};
}

function extract(file) {
  const doc = new JSDOM(fs.readFileSync(file, 'utf8')).window.document;
  const files = [], inline = [], configs = {}, sources = {};
  for (const el of doc.querySelectorAll('script, link[rel="stylesheet"]')) {
    const where = el.closest('head') ? 'head' : 'body';
    if (el.tagName === 'LINK') { files.push(`css ${normUrl(el.getAttribute('href'))}`); continue; }
    if (el.getAttribute('src')) {
      files.push(`script ${normUrl(el.getAttribute('src'))}`);
      sources[normUrl(el.getAttribute('src'))] = path.resolve(path.dirname(file), el.getAttribute('src').split('?')[0]);
      continue;
    }
    if (el.getAttribute('type') === 'application/json') {
      // Activity data and other JSON islands: compared as JSON, keyed by their element.
      const key = el.id === 'ctm-store-manifest' ? 'ctm-store-manifest' :
        (el.className || 'json') + (el.parentElement?.id ? '#' + el.parentElement.id : '');
      let json; try { json = JSON.parse(el.textContent); } catch (_) { json = el.textContent; }
      (configs[key] ||= []).push(json);
      continue;
    }
    if (!el.textContent.trim()) continue;
    const found = inlineScript(el.textContent);
    if (found.cells) (configs.qpyodideCellDetails ||= []).push(...found.cells);
    if ('json' in found) {
      if (found.kind === 'qpyodideCellDetails') (configs.qpyodideCellDetails ||= []).push(...found.json);
      else (configs[found.kind] ||= []).push(found.json);
    } else inline.push({where, kind: found.kind, code: found.code});
  }
  const selections = [];
  for (const data of configs['ai-feedback-data'] || []) if (data && data.policySelection) selections.push(['plain-text', data.policySelection]);
  for (const cell of doc.querySelectorAll('.math-exercise-cell[data-feedback-policy]')) {
    try { selections.push(['math-exercise', JSON.parse(cell.dataset.feedbackPolicy)]); } catch (_) { /* none */ }
  }
  for (const exercise of configs.__pyExercises || []) if (exercise && exercise.policySelection) selections.push(['py-exercise', exercise.policySelection]);
  for (const cell of configs.qpyodideCellDetails || []) if (cell?.options?.policySelection) selections.push(['pyodide-interaktiv', cell.options.policySelection]);
  const domNodes = [];
  return {doc, files, inline, configs, sources, selections, dom: canonical(doc.body, domNodes), domNodes};
}

// Feedback context: the prose an exercise sends is that of its own section,
// the innermost tab (with its label) or heading section around it, without
// closed material it is not in (<details> blocks, collapsed callouts: an
// exercise inside one has the section's prose and the block's), other tabs,
// nested sections, other exercises and code blocks; an explicit context (A5)
// also leaves out every context block (the listed ones are sent on their own,
// the others belong to other exercises). `contextVerdict` gives "own-section" when the after page's
// context text is exactly that, and every piece of the section's prose that
// the before page sent is still sent; otherwise it names the first piece that
// is not and where it comes from. Text is compared as letters and digits only,
// so markup, math delimiters, punctuation and the spacing of table cells do
// not matter.
const EXERCISES = '.math-exercise-cell, .py-exercise-cell, [id^="qpyodide-insertion-location-"], .ai-feedback-activity, .ai-feedback-task';
const CONTEXT_BLOCKS = '.ai-context, .ai-feedback-context, .math-exercise-context';
const NOT_TEXT = 'script, style, noscript, template';
// Closed until the learner opens them: prose only for exercises inside them.
const CLOSED = 'details, .callout-collapse.collapse:not(.show)';
const SCOPES = '.tab-pane, section';
const NOT_PROSE = NOT_TEXT + ', pre';
const squash = value => String(value ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const pieces = value => String(value ?? '').split('\n').map(text => ({text: text.trim(), key: squash(text)})).filter(piece => piece.key);
function textOf(root, skip = node => node.matches(NOT_TEXT)) {
  const parts = [];
  (function visit(node) {
    if (node.nodeType === 3) { parts.push(node.textContent); return; }
    if (node.nodeType !== 1 || (node !== root && skip(node))) return;
    for (const child of node.childNodes) visit(child);
  })(root);
  return parts.join(' ');
}
// The exercise's own section inside its scope (innermost tab or <section>):
// from the nearest heading before the exercise (headings that Quarto did not
// wrap in a <section>, as inside tabs, start a section too; none: the start of
// the scope, with the tab's label) to the next heading. Returns its text and
// the blocks before the exercise (for the completeness check).
const HEADING = {heading: true};
const BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li, dt, dd, table, figcaption, blockquote';
function ownSection(doc, scope, element, skip) {
  const parts = [], blocks = [];
  let at = -1;
  (function visit(node) {
    if (node.nodeType === 3) { parts.push(node.textContent); return; }
    if (node.nodeType !== 1) return;
    if (node !== scope && (node === element || (skip(node) && node.contains(element)))) { at = parts.length; parts.push(''); return; }
    if (node !== scope && skip(node)) return;
    if (/^H[1-6]$/.test(node.tagName)) parts.push(HEADING);
    if (node.matches(BLOCKS)) blocks.push({index: parts.length, node});
    for (const child of node.childNodes) visit(child);
  })(scope);
  if (at < 0) at = parts.length;
  const start = parts.lastIndexOf(HEADING, at);
  let end = parts.indexOf(HEADING, at);
  if (end < 0) end = parts.length;
  const label = start < 0 && scope.matches('.tab-pane') && doc.getElementById(scope.getAttribute('aria-labelledby') || '');
  const text = (label ? label.textContent + ' ' : '') + parts.slice(start + 1, end).filter(part => part !== HEADING).join(' ');
  const before = blocks.filter(block => block.index > start && block.index < at).map(block => squash(textOf(block.node, skip)));
  if (label) before.push(squash(label.textContent));
  return {text: squash(text), before: new Set(before)};
}
function contextVerdict(doc, element, after, before, refs, explicit) {
  if (!element) return 'no exercise element';
  const scope = element.parentElement?.closest(SCOPES) || doc.body;
  const listed = String(refs ?? '').split(',').map(id => id.trim())
    .filter(id => id && id !== 'auto' && id !== 'none' && !id.startsWith('jsxgraph:')).map(id => doc.getElementById(id)).filter(Boolean);
  const skip = node => node.matches(NOT_PROSE) || node.matches(EXERCISES) || node.matches('.tab-pane, section, .nav') || listed.includes(node)
    || (node.matches(CLOSED) && !node.contains(element)) || (explicit && node.matches(CONTEXT_BLOCKS));
  const own = ownSection(doc, scope, element, skip);
  for (const piece of pieces(after)) {
    if (own.text.includes(piece.key)) continue;
    return `not prose of the own section (${origin(doc, element, scope, listed, piece)}): ${piece.text.slice(0, 100)}`;
  }
  // Every block of the section's prose before the exercise that the before
  // page sent is still sent (unless the 1500-character bound leaves it out).
  const sent = squash(after);
  for (const piece of pieces(before)) {
    if (!own.before.has(piece.key) || sent.includes(piece.key)) continue;
    if (String(after ?? '').length + piece.text.length > 1400) continue;
    return `lost prose of the own section: ${piece.text.slice(0, 100)}`;
  }
  return 'own-section';
}
function origin(doc, element, scope, listed, piece) {
  const has = el => el && squash(textOf(el)).includes(piece.key);
  const enclosing = [];
  for (let el = scope.parentElement?.closest(SCOPES); el; el = el.parentElement?.closest(SCOPES)) enclosing.push(el);
  const otherTabs = [...doc.querySelectorAll('.tab-pane')].filter(el => !el.contains(element));
  const otherLabels = [...doc.querySelectorAll('[role="tab"]')].filter(tab => !doc.getElementById(tab.getAttribute('aria-controls') || '')?.contains(element));
  const places = [
    ['a <details> block', [...doc.querySelectorAll('details')].filter(el => !el.contains(element))],
    ['a collapsed callout', [...doc.querySelectorAll('.callout-collapse.collapse:not(.show)')].filter(el => !el.contains(element))],
    ['a listed block', listed],
    ['a context block', [...doc.querySelectorAll(CONTEXT_BLOCKS)]],
    ['the exercise itself', [element]],
    ['another exercise', [...doc.querySelectorAll(EXERCISES)].filter(el => el !== element)],
    ['another tab', [...otherTabs, ...otherLabels]],
    ['a code block', [...scope.querySelectorAll('pre')]],
    ['an enclosing section', enclosing],
    ['another section', [...doc.querySelectorAll('section')].filter(el => !el.contains(element))],
  ];
  for (const [name, elements] of places) if (elements.some(has)) return 'from ' + name;
  return has(doc.body) ? 'elsewhere on the page' : 'not on the page';
}
// The context differences of a page get their verdict from the after page.
function contextItems(items, B, page) {
  const json = value => { try { return typeof value === 'string' && value.startsWith('"') ? JSON.parse(value) : value; } catch (_) { return value; } };
  for (const item of items) {
    let m, element, refs, mode;
    if (item.area === 'config' && /^ai-feedback-data/.test(item.object) && (m = /^\/(\d+)\/context$/.exec(item.path))) {
      const data = B.configs[item.object]?.[m[1]];
      element = data && B.doc.getElementById(data.id); refs = data?.contextRefs; mode = data?.contextMode;
    } else if (item.area === 'config' && item.object === 'qpyodideCellDetails' && (m = /^\/(\d+)\/options\/feedbackContext\/text$/.exec(item.path))) {
      const cell = B.configs.qpyodideCellDetails?.[m[1]];
      element = cell && B.doc.getElementById('qpyodide-insertion-location-' + cell.id); refs = cell?.options?.feedbackContext?.refs; mode = cell?.options?.feedbackContext?.mode;
    } else if (item.area === 'config' && item.object === '__pyExercises' && (m = /^\/(\d+)\/feedbackContext\/text$/.exec(item.path))) {
      const exercise = B.configs.__pyExercises?.[m[1]];
      element = exercise && B.doc.getElementById('py-exercise-' + exercise.id); refs = exercise?.feedbackContext?.refs; mode = exercise?.feedbackContext?.mode;
    } else if (item.area === 'dom' && item.attribute === 'data-context' && (item.node || item.attrs?.id)) {
      element = item.node || B.doc.getElementById(item.attrs.id); refs = item.attrs['data-context-refs']; mode = item.attrs['data-context-mode'];
    } else if (item.area === 'dom' && item.attribute === 'data-ai-feedback-context' && item.node) {
      // ctm-libs writes the context on every code block; a plain one keeps it in the page.
      element = item.node; refs = ''; mode = 'auto';
    } else continue;
    // DOM attributes from the elements themselves: the lines have their whitespace collapsed.
    const value = (node, line) => item.area === 'dom' ? node?.getAttribute?.(item.attribute) ?? line : line;
    item.context = contextVerdict(B.doc, element, json(value(item.node, item.after)), json(value(item.beforeNode, item.before)), refs, mode === 'explicit');
    item.checked = item.node ? item.node : item.object + item.path;
  }
  // Every other context of the after page gets the same check: an unchanged
  // context that is not prose of its own section is reported too (area
  // "context"), so a leak that the old page had as well is not missed.
  const checked = new Set(items.map(item => item.checked).filter(Boolean));
  for (const item of items) delete item.checked;
  for (const c of pageContexts(B, json)) {
    if (checked.has(c.node || c.object + c.path)) continue;
    const verdict = contextVerdict(B.doc, c.element, c.text, null, c.refs, c.mode === 'explicit');
    if (verdict !== 'own-section') items.push({page, area: 'context', change: 'unchanged', object: c.object, path: c.path, attribute: c.attribute,
      element: c.element ? c.element.tagName.toLowerCase() + '|' + (c.element.id || '') : null, after: c.text, context: verdict});
  }
  return items;
}
function pageContexts(B, json) {
  const found = [];
  for (const [object, list] of Object.entries(B.configs)) {
    if (!/^ai-feedback-data/.test(object)) continue;
    list.forEach((data, i) => { if (data?.context) found.push({object, path: `/${i}/context`, element: B.doc.getElementById(data.id), text: data.context, refs: data.contextRefs, mode: data.contextMode}); });
  }
  (B.configs.qpyodideCellDetails || []).forEach((cell, i) => {
    const context = cell?.options?.feedbackContext;
    if (context?.text) found.push({object: 'qpyodideCellDetails', path: `/${i}/options/feedbackContext/text`, element: B.doc.getElementById('qpyodide-insertion-location-' + cell.id), text: context.text, refs: context.refs, mode: context.mode});
  });
  (B.configs.__pyExercises || []).forEach((exercise, i) => {
    const context = exercise?.feedbackContext;
    if (context?.text) found.push({object: '__pyExercises', path: `/${i}/feedbackContext/text`, element: B.doc.getElementById('py-exercise-' + exercise.id), text: context.text, refs: context.refs, mode: context.mode});
  });
  for (const el of B.doc.body.querySelectorAll('[data-context]')) found.push({attribute: 'data-context', node: el, element: el, text: json(el.getAttribute('data-context')), refs: el.getAttribute('data-context-refs'), mode: el.getAttribute('data-context-mode')});
  for (const el of B.doc.body.querySelectorAll('[data-ai-feedback-context]')) found.push({attribute: 'data-ai-feedback-context', node: el, element: el, text: el.getAttribute('data-ai-feedback-context'), refs: '', mode: 'auto'});
  return found.filter(c => String(c.text ?? '').trim());
}

// Whether two policy configurations give every selection on the page the same
// effective policy, resolved by the after page's feedback-core.js (the browser
// contract reads the old and the new keys' JSON alike).
function samePolicies(coreFile, before, after, selections, stackMove = false) {
  if (!coreFile || !fs.existsSync(coreFile)) return 'unknown';
  const context = vm.createContext({window: {}, console});
  context.globalThis = context;
  vm.runInContext(fs.readFileSync(coreFile, 'utf8'), context);
  const core = context.AIFeedbackCore || context.window.AIFeedbackCore || context.AIFeedback || context.window.AIFeedback;
  if (!core || typeof core.resolvePolicy !== 'function') return 'unknown';
  const all = stackMove ? selections : [...selections, ...['plain-text', 'math-exercise', 'py-exercise', 'pyodide-interaktiv'].map(name => [name, {}])];
  for (const [integration, selection] of all) {
    let a, b;
    try { a = JSON.stringify(core.resolvePolicy(stackMove ? 'math-exercise' : integration, 'en', {}, before, selection)); } catch (error) { a = 'error ' + error.message; }
    try { b = JSON.stringify(core.resolvePolicy(integration, 'en', {}, after, selection)); } catch (error) { b = 'error ' + error.message; }
    if (a !== b) return 'different';
  }
  return 'equal';
}

// The body as lines; `nodes` gets the element of each line (start and end
// tags: their element; text: its parent), so a difference can find its element.
function canonical(node, nodes = []) {
  if (node.nodeType === 3) {
    const t = node.textContent.replace(/\s+/g, ' ').trim();
    if (!t) return [];
    nodes.push(node.parentElement);
    return ['text: ' + t];
  }
  if (node.nodeType !== 1) return [];
  const tag = node.tagName.toLowerCase();
  if (tag === 'script' || tag === 'style' || (tag === 'link' && node.getAttribute('rel') === 'stylesheet')) return [];
  const attrs = [...node.attributes].map(a => [a.name, noiseFree(a.name, a.value).replace(/\s+/g, ' ')]).sort((a, b) => a[0] < b[0] ? -1 : 1);
  const lines = ['<' + tag + attrs.map(([n, v]) => ` ${n}=${JSON.stringify(v)}`).join('') + '>'];
  nodes.push(node);
  for (const child of node.childNodes) lines.push(...canonical(child, nodes));
  // The end tag names the element's class and id, so that a wrapper that is
  // added or removed is told apart from the elements it holds.
  lines.push('</' + tag + attrs.filter(([n]) => n === 'class' || n === 'id').map(([n, v]) => ` ${n}=${JSON.stringify(v)}`).join('') + '>');
  nodes.push(node);
  return lines;
}

// ---------------------------------------------------------------- differences
function diffLines(a, b) {
  // Common prefix and suffix first; an LCS diff of the middle.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length, endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const x = a.slice(start, endA), y = b.slice(start, endB), n = x.length, m = y.length;
  // A long page (the table is n * m): Myers' diff, which needs time and memory
  // in proportion to the differences, not to the page. Only a page that
  // differs by more than MYERS_LIMIT lines is one hunk.
  if (n * m > 6e7) return myersHunks(x, y, start) || [{removed: x, added: y, at: start, addedAt: y.map((_, k) => start + k)}];
  const dp = Array.from({length: n + 1}, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const hunks = [];
  let i = 0, j = 0, hunk = null;
  const flush = () => { if (hunk) { hunks.push(hunk); hunk = null; } };
  while (i < n || j < m) {
    if (i < n && j < m && x[i] === y[j]) { flush(); i++; j++; }
    else if (j >= m || (i < n && dp[i + 1][j] >= dp[i][j + 1])) { (hunk ||= {removed: [], added: [], addedAt: [], at: start + i}).removed.push(x[i++]); }
    else { (hunk ||= {removed: [], added: [], addedAt: [], at: start + i}).added.push(y[j]); hunk.addedAt.push(start + j++); }
  }
  flush();
  return hunks;
}
// Myers' O(ND) difference of two long line lists, as the hunks diffLines
// returns; null when the lists differ by more than MYERS_LIMIT lines.
const MYERS_LIMIT = 6000;
function myersHunks(x, y, start) {
  const n = x.length, m = y.length, off = MYERS_LIMIT + 1, v = new Int32Array(2 * MYERS_LIMIT + 3), trace = [];
  let found = -1;
  for (let d = 0; d <= MYERS_LIMIT && found < 0; d++) {
    trace.push(v.slice(off - d - 1, off + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let i = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1, j = i - k;
      while (i < n && j < m && x[i] === y[j]) { i++; j++; }
      v[off + k] = i;
      if (i >= n && j >= m) { found = d; break; }
    }
  }
  if (found < 0) return null;
  const removed = new Set(), added = new Set();
  let i = n, j = m;
  for (let d = found; d > 0; d--) {
    const before = trace[d], k = i - j;
    const prevK = k === -d || (k !== d && before[k - 1 + d + 1] < before[k + 1 + d + 1]) ? k + 1 : k - 1;
    const prevI = before[prevK + d + 1], prevJ = prevI - prevK;
    if (prevK === k + 1) added.add(prevJ); else removed.add(prevI);
    i = prevI; j = prevJ;
  }
  const hunks = [];
  let a = 0, b = 0, hunk = null;
  const flush = () => { if (hunk) { hunks.push(hunk); hunk = null; } };
  while (a < n || b < m) {
    if (a < n && b < m && !removed.has(a) && !added.has(b)) { flush(); a++; b++; }
    else if (a < n && removed.has(a)) { (hunk ||= {removed: [], added: [], addedAt: [], at: start + a}).removed.push(x[a++]); }
    else { (hunk ||= {removed: [], added: [], addedAt: [], at: start + a}).added.push(y[b]); hunk.addedAt.push(start + b++); }
  }
  flush();
  return hunks;
}
const ATTRIBUTE = / ([\w:.@-]+)=("(?:[^"\\]|\\.)*")/g;
function parseTag(line, end = false) {
  const m = (end ? /^<\/([\w-]+)((?: [\w:.@-]+="(?:[^"\\]|\\.)*")*)>$/ : /^<([\w-]+)((?: [\w:.@-]+="(?:[^"\\]|\\.)*")*)>$/).exec(line);
  if (!m) return null;
  const attrs = {};
  for (const [, name, value] of m[2].matchAll(ATTRIBUTE)) attrs[name] = JSON.parse(value);
  return {tag: m[1], attrs};
}
// Where an element sits ("main > section#x.level2 > div.tab-pane"), and what it holds.
const describe = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + [...el.classList].map(c => '.' + c).join('');
function ancestorsOf(node) {
  const chain = [];
  for (let el = node?.parentElement; el && el.tagName !== 'BODY' && el.tagName !== 'HTML'; el = el.parentElement) chain.unshift(describe(el));
  return chain.join(' > ');
}
const contentOf = node => node?.children ? [...node.children].map(child => child.tagName.toLowerCase()).join(' ') : '';
// The words one string lost and gained against another (a word-level LCS).
function wordChanges(before, after) {
  if (typeof before !== 'string' || typeof after !== 'string') return {};
  const a = before.split(/\s+/).filter(Boolean), b = after.split(/\s+/).filter(Boolean);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length, endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const x = a.slice(start, endA), y = b.slice(start, endB);
  if (x.length * y.length > 4e6) return {lost: x.join(' '), gained: y.join(' ')};
  const dp = Array.from({length: x.length + 1}, () => new Uint32Array(y.length + 1));
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const lost = [], gained = [];
  let i = 0, j = 0;
  while (i < x.length || j < y.length) {
    if (i < x.length && j < y.length && x[i] === y[j]) { i++; j++; }
    else if (j >= y.length || (i < x.length && dp[i + 1][j] >= dp[i][j + 1])) lost.push(x[i++]);
    else gained.push(y[j++]);
  }
  return {lost: lost.join(' '), gained: gained.join(' ')};
}
// DOM hunks -> items: element lines paired by tag and identity give attribute
// changes; text lines paired in order give text changes; the rest is added or removed.
function domItems(page, hunk, nodesBefore = [], nodesAfter = []) {
  // A hunk's removed lines are consecutive from `at`; `addedAt` indexes the after lines.
  const items = [], removed = hunk.removed.map((line, k) => ({line, tag: parseTag(line), end: parseTag(line, true), node: nodesBefore[hunk.at + k]}));
  const added = hunk.added.map((line, k) => ({line, tag: parseTag(line), end: parseTag(line, true), node: nodesAfter[hunk.addedAt?.[k]]}));
  const identity = t => t.tag + '|' + (t.attrs.id ?? t.attrs['data-label'] ?? t.attrs['data-id'] ?? '');
  for (const r of removed) {
    if (!r.tag) continue;
    const a = added.find(x => x.tag && !x.used && identity(x.tag) === identity(r.tag)) || added.find(x => x.tag && !x.used && x.tag.tag === r.tag.tag && !r.tag.attrs.id && !x.tag.attrs.id);
    if (!a) continue;
    r.used = a.used = true;
    for (const name of new Set([...Object.keys(r.tag.attrs), ...Object.keys(a.tag.attrs)]))
      if (r.tag.attrs[name] !== a.tag.attrs[name])
        items.push({page, area: 'dom', change: r.tag.attrs[name] === undefined ? 'attribute added' : a.tag.attrs[name] === undefined ? 'attribute removed' : 'attribute changed',
          tag: r.tag.tag, element: identity(r.tag), attribute: name, before: r.tag.attrs[name] ?? null, after: a.tag.attrs[name] ?? null, attrs: a.tag.attrs, node: a.node, beforeNode: r.node,
          ancestors: ancestorsOf(a.node)});
  }
  // End tags of elements whose start tags pair (or differ only in class or
  // id) say nothing more; the start tag's items report the change.
  for (const r of removed) {
    if (!r.end) continue;
    const a = added.find(x => x.end && !x.used && x.end.tag === r.end.tag && (x.end.attrs.id ?? '') === (r.end.attrs.id ?? ''))
      || added.find(x => x.end && !x.used && x.end.tag === r.end.tag);
    if (a) r.used = a.used = true;
  }
  const texts = side => side.filter(x => !x.used && x.line.startsWith('text: '));
  const [rt, at] = [texts(removed), texts(added)];
  for (let k = 0; k < Math.min(rt.length, at.length); k++) {
    rt[k].used = at[k].used = true;
    items.push({page, area: 'dom', change: 'text changed', before: rt[k].line.slice(6), after: at[k].line.slice(6), ancestors: ancestorsOf(at[k].node) + ' > ' + describe(at[k].node)});
  }
  removed.forEach((r, k) => { if (!r.used) items.push({page, area: 'dom', change: 'removed', line: r.line, index: hunk.at + k, ancestors: ancestorsOf(r.node), content: r.line.startsWith('text: ') ? '' : contentOf(r.node), node: r.node}); });
  added.forEach((a, k) => { if (!a.used) items.push({page, area: 'dom', change: 'added', line: a.line, index: hunk.addedAt?.[k], ancestors: ancestorsOf(a.node), content: a.line.startsWith('text: ') ? '' : contentOf(a.node), node: a.node}); });
  return items;
}
// Elements that moved: an element removed whole (its start tag, content and
// end tag) and added whole, unchanged, elsewhere becomes one item "moved"
// (outermost elements first).
function movedElements(page, items, A, B) {
  const sides = {removed: new Map(), added: new Map()};
  for (const item of items) if (item.area === 'dom' && item.index !== undefined && sides[item.change]) sides[item.change].set(item.index, item);
  const end = (lines, start) => {
    let depth = 0;
    for (let i = start; i < lines.length; i++) {
      if (/^<[\w-]/.test(lines[i])) depth++;
      else if (lines[i].startsWith('</') && --depth === 0) return i;
    }
    return -1;
  };
  const whole = (lines, map, start) => {
    if (!map.has(start) || !/^<[\w-]/.test(lines[start])) return null;
    const last = end(lines, start);
    if (last < 0) return null;
    for (let i = start; i <= last; i++) if (!map.has(i)) return null;
    return last;
  };
  const added = new Map();
  for (const start of [...sides.added.keys()].sort((a, b) => a - b)) {
    const last = whole(B.dom, sides.added, start);
    if (last === null) continue;
    const key = B.dom.slice(start, last + 1).join('\n');
    if (!added.has(key)) added.set(key, []);
    added.get(key).push([start, last]);
  }
  const gone = new Set(), moved = [];
  for (const start of [...sides.removed.keys()].sort((a, b) => a - b)) {
    if (gone.has(sides.removed.get(start))) continue;
    const last = whole(A.dom, sides.removed, start);
    if (last === null) continue;
    const found = added.get(A.dom.slice(start, last + 1).join('\n'));
    const place = found && found.find(([from]) => !gone.has(sides.added.get(from)));
    if (!place) continue;
    for (let i = start; i <= last; i++) gone.add(sides.removed.get(i));
    for (let i = place[0]; i <= place[1]; i++) gone.add(sides.added.get(i));
    moved.push({page, area: 'dom', change: 'moved', line: A.dom[start], lines: last - start + 1,
      ancestors: ancestorsOf(A.domNodes[start]), content: contentOf(A.domNodes[start]), to: ancestorsOf(B.domNodes[place[0]]),
      switchOrder: switchOrder(A, B, A.domNodes[start], B.domNodes[place[0]])});
  }
  return [...items.filter(item => !gone.has(item)), ...moved];
}
function jsonDiff(a, b, at = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  const isObject = v => v && typeof v === 'object';
  if (isObject(a) && isObject(b) && Array.isArray(a) === Array.isArray(b)) {
    const keys = Array.isArray(a) ? [...Array(Math.max(a.length, b.length)).keys()].map(String) : [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    const out = [];
    for (const k of keys) {
      if (!(k in a)) out.push({path: at + '/' + k, before: undefined, after: b[k]});
      else if (!(k in b)) out.push({path: at + '/' + k, before: a[k], after: undefined});
      else out.push(...jsonDiff(a[k], b[k], at + '/' + k));
    }
    return out;
  }
  return [{path: at || '/', before: a, after: b}];
}
// Key order is not a change: JSON is compared after sorting object keys.
const sorted = v => Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])])) : v;

// ---------------------------------------------------------------- invariants
// The page's words in document order (outside script, style, template and
// noscript) and the word range [start, end) of an element.
function words(doc) {
  if (doc.ctmWords) return doc.ctmWords;
  const list = [], spans = new Map();
  const walker = doc.createTreeWalker(doc.body, 4);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest('script, style, template, noscript') || doc.ctmValidatedStoreBar?.contains(node)) continue;
    const found = node.textContent.split(/\s+/).filter(Boolean);
    if (!found.length) continue;
    spans.set(node, [list.length, list.length + found.length]);
    list.push(...found);
  }
  const range = el => {
    let start = null, end = null;
    const inner = doc.createTreeWalker(el, 4);
    for (let node = inner.nextNode(); node; node = inner.nextNode()) {
      const span = spans.get(node);
      if (!span) continue;
      if (start === null) start = span[0];
      end = span[1];
    }
    if (start !== null) return [start, end];
    for (const [node, span] of spans) if (el.compareDocumentPosition(node) & 4) return [span[0], span[0]];
    return [list.length, list.length];
  };
  const at = index => { for (const [node, span] of spans) if (span[0] <= index && index < span[1]) return node; return null; };
  return (doc.ctmWords = {list, range, at});
}
const same = (a, b) => a.length === b.length && a.every((w, k) => w === b[k]);
const startsWith = (a, b) => b.length <= a.length && b.every((w, k) => w === a[k]);

// Reveals: the k-th <details> of the old page against the k-th of the new
// one. A reveal must hold the same words as before ("same"). It may hold
// more only as old + what directly followed the old <details>: "heading"
// when that starts with a heading and the old <details> was closed by that
// heading's section (a raw <details> closed early, design §1.4 item 5; the
// course's Markdown tells, --reveal-ends), "swallowed" when it starts with a
// heading that old's <details> had ended before (a closing fence moved past
// the next heading, review A2b S1), else "grown" (a course's own accepted
// case). "Swallowed", fewer or other words ("shrunk",
// "changed"), or another number of <details>, is a difference that no
// expectation explains.
function revealChecks(page, A, B, ends) {
  const status = new Map(), items = [];
  const before = [...A.doc.body.querySelectorAll('details')], after = [...B.doc.body.querySelectorAll('details')];
  const bySection = closedBySection(ends, page, before);
  const [wa, wb] = [words(A.doc), words(B.doc)];
  if (before.length !== after.length)
    items.push({page, area: 'dom', change: 'reveal count changed', before: before.length, after: after.length, invariant: true});
  for (let k = 0; k < Math.min(before.length, after.length); k++) {
    const [o, n] = [before[k], after[k]];
    const [os, oe] = wa.range(o), [ns, ne] = wb.range(n);
    const ow = wa.list.slice(os, oe), nw = wb.list.slice(ns, ne);
    let found = 'changed';
    if (same(ow, nw)) found = 'same';
    else if (nw.length > ow.length && startsWith(nw, ow) && same(wa.list.slice(oe, oe + nw.length - ow.length), nw.slice(ow.length))) {
      const first = wb.at(ns + ow.length);
      const heading = first?.parentElement?.closest('h1, h2, h3, h4, h5, h6');
      found = !(heading && n.contains(heading)) ? 'grown' : bySection[k] ? 'heading' : 'swallowed';
    } else if (nw.length < ow.length && startsWith(ow, nw)) found = 'shrunk';
    status.set(o, found);
    status.set(n, found);
    if (found === 'shrunk' || found === 'changed' || found === 'swallowed') {
      const summary = n.querySelector('summary')?.textContent.replace(/\s+/g, ' ').trim() || '';
      items.push({page, area: 'dom', change: 'reveal content changed', reveal: found, line: `<details> ${k + 1}: ${summary}`,
        ancestors: ancestorsOf(n), ...wordChanges(ow.join(' '), nw.join(' ')), invariant: true});
    }
  }
  return {status, items};
}
// The reveal an item belongs to: the <details> it is, sits in, or (a removed
// section that a raw <details> was cut by) holds as its last <details>.
function revealOf(item, status) {
  let el = item.node;
  if (el && el.nodeType !== 1) el = el.parentElement;
  if (!el) return undefined;
  if (el.tagName === 'DETAILS') return status.get(el);
  const around = el.closest('details');
  if (around) return status.get(around);
  const inside = [...el.children].filter(child => child.tagName === 'DETAILS').pop();
  return inside ? status.get(inside) : undefined;
}

// The lecture/reading switch: the new one stands where the old one stood
// (the same words before it in main, outside the title block) or at the top
// of the page (no words before it). Where the old side already has the new
// switch (a migrated course compared with an earlier build), it is the same
// switch: it must stand in the same place. Anything else is a difference that
// no expectation explains.
const OLD_SWITCH = '[data-learning-mode]', NEW_SWITCH = '.ctm-modes';
function wordsBefore(doc, el) {
  const w = words(doc), main = el.closest('main') || doc.body, title = main.querySelector('#title-block-header');
  const [ms] = w.range(main), [es] = w.range(el), [ts, te] = title ? w.range(title) : [0, 0];
  return w.list.slice(ms, es).filter((_, k) => k + ms < ts || k + ms >= te).join(' ');
}
function switchCheck(page, A, B) {
  const [o, n] = [A.doc.querySelector(OLD_SWITCH) || A.doc.querySelector(NEW_SWITCH), B.doc.querySelector(NEW_SWITCH)];
  if (!n) return [];
  const now = wordsBefore(B.doc, n), was = o ? wordsBefore(A.doc, o) : null;
  if (now === '' || now === was) return [];
  return [{page, area: 'dom', change: 'switch moved', line: n.outerHTML.slice(0, 80), before: was, after: now.slice(-300), invariant: true}];
}
// Constructs that a migration may replace but never drop. A category can
// explain that the old markup is gone (the old switch's div, the inline site
// scripts, an anchor's old div) and says nothing about what replaces it, so
// the replacement is checked here and no category explains a breach:
//  - the switch: a page whose old side has one (the hand-written one or
//    ctm-libs') and reading steps has one on the new side too, of either kind
//    (a switch on a page without reading steps has nothing to switch; the
//    browser comparison treats it so too), and the new page has no more than
//    one;
//  - tabsets, tab panes, embedded pages (<iframe>) and callouts: not fewer
//    than before;
//  - the hand-written anchors (<div id="x"></div>: an empty div that has no
//    attribute but its id) that a link of the old site points to (the
//    components' empty placeholders and Quarto's are no anchors in this
//    sense): the id is still on the page (as div.ctm-tab-target, for example).
const COUNTED = [['tabset', '.panel-tabset'], ['tab pane', '.tab-pane'], ['embedded page', 'iframe'], ['callout', '.callout']];
const plainAnchors = (doc, linked) => [...doc.body.querySelectorAll('div[id]')]
  .filter(el => el.attributes.length === 1 && !el.children.length && !el.textContent.trim() && linked.has(el.id)).map(el => el.id);
// The ids (fragments) that the links of a site's pages point to, on any page.
function linkTargets(root, pages) {
  const ids = new Set();
  for (const page of pages) {
    for (const [, fragment] of fs.readFileSync(path.join(root, page), 'utf8').matchAll(/\bhref="[^"#]*#([^"]+)"/g)) {
      try { ids.add(decodeURIComponent(fragment)); } catch (_) { ids.add(fragment); }
    }
  }
  return ids;
}
function constructChecks(page, A, B, linked) {
  const items = [], count = (doc, selector) => doc.querySelectorAll(selector).length;
  const add = (change, construct, before, after, line) =>
    items.push({page, area: 'dom', change, construct, before, after, ...(line ? {line} : {}), invariant: true});
  const switches = doc => count(doc, `${OLD_SWITCH}, ${NEW_SWITCH}`);
  const [was, now] = [switches(A.doc), switches(B.doc)];
  if (was > 0 && now === 0 && count(A.doc, 'details.reading-step') > 0) add('switch dropped', 'switch', was, now);
  else if (now > Math.max(was, 1)) add('switch duplicated', 'switch', was, now);
  // A retained wrapper must still offer both modes; migration expectations
  // may explain its descendants changing, but cannot explain lost controls.
  for (const control of B.doc.querySelectorAll(`${OLD_SWITCH}, ${NEW_SWITCH}`)) {
    const missing = ['lecture', 'reading'].filter(mode =>
      ![...control.querySelectorAll(`button[data-mode="${mode}"]`)].some(button => button.textContent.trim()));
    if (missing.length) add('switch controls missing', 'switch', ['lecture', 'reading'], missing, control.outerHTML.slice(0, 160));
  }
  for (const [name, selector] of COUNTED) {
    const [before, after] = [count(A.doc, selector), count(B.doc, selector)];
    if (after < before) add(name + ' dropped', name, before, after);
  }
  const ids = new Set([...B.doc.querySelectorAll('[id]')].map(el => el.id));
  for (const id of plainAnchors(A.doc, linked)) if (!ids.has(id)) add('anchor dropped', 'anchor', 1, 0, `<div id="${id}">`);
  return items;
}
// A moved element: "above-to-below" when it stood above the old switch and
// stands directly below the new one (the switch went to the top of the
// page): the words between the new switch and it are those that stood
// before it on old, so nothing else came in between.
function switchOrder(A, B, before, after) {
  const [o, n] = [A.doc.querySelector(OLD_SWITCH) || A.doc.querySelector(NEW_SWITCH), B.doc.querySelector(NEW_SWITCH)];
  if (!o || !n || !before || !after) return 'other';
  if (!(before.compareDocumentPosition(o) & 4) || !(n.compareDocumentPosition(after) & 4)) return 'other';
  const w = words(B.doc), [, end] = w.range(n), [start] = w.range(after);
  return w.list.slice(end, start).join(' ') === wordsBefore(A.doc, before) ? 'above-to-below' : 'other';
}
// Ids: the new page may not have an id more often than the old one did.
function duplicateIds(page, A, B) {
  const count = doc => { const c = new Map(); for (const el of doc.querySelectorAll('[id]')) c.set(el.id, (c.get(el.id) || 0) + 1); return c; };
  const [ca, cb] = [count(A.doc), count(B.doc)];
  return [...cb].filter(([id, k]) => k > 1 && k > (ca.get(id) || 0))
    .map(([id, k]) => ({page, area: 'dom', change: 'duplicate id', line: `id="${id}"`, before: ca.get(id) || 0, after: k, invariant: true}));
}

// Generated author notes show the entire shipped feedback defaults. L6 adds
// STACK's copied policy there. Verify that sole addition before comparing the
// surrounding prose/reveals; any other edit still reaches every invariant.
function stackPolicyNotes(page, A, B) {
  const selector = '.example-author-notes.ai-feedback-ignore details pre > code.language-yaml';
  const old = [...A.doc.querySelectorAll(selector)], now = [...B.doc.querySelectorAll(selector)], items = [];
  if (old.length !== now.length) return items;
  for (let i = 0; i < old.length; i++) {
    if (old[i].textContent === now[i].textContent) continue;
    try {
      const a = yaml.load(old[i].textContent), b = yaml.load(now[i].textContent);
      const integrations = b?.['ai-feedback']?.integrations;
      if (!integrations || Object.hasOwn(a?.['ai-feedback']?.integrations || {}, 'stack') ||
          !Object.hasOwn(integrations, 'stack') || !Object.hasOwn(integrations, 'math-exercise') ||
          !isDeepStrictEqual(integrations.stack, integrations['math-exercise'])) continue;
      const policy = integrations.stack;
      delete integrations.stack;
      if (!isDeepStrictEqual(a, b)) continue;
      now[i].textContent = old[i].textContent;
      items.push({page, area: 'config', change: 'added', object: 'generated-policy-yaml',
        path: '/ai-feedback/integrations/stack', after: policy, effective: 'stack-copy'});
    } catch (_) { /* Malformed or edited notes stay unexplained. */ }
  }
  if (items.length) {
    B.domNodes = [];
    B.dom = canonical(B.doc.body, B.domNodes);
  }
  return items;
}

function comparePage(page, before, after, ends, linked, assets) {
  const A = extract(before), B = extract(after), items = [];
  if(stackTransition(A,B))items.push({page,area:'config',change:'changed',object:'stack-card-shell',path:'/',effective:'identical-engine-data'});
  items.push(...stackPolicyNotes(page, A, B));
  // Additive generated chrome has no authored position. Only a complete,
  // catalogue-verified store bar may leave the invariant's prose accounting.
  markStoreAdditions(A, []);
  markStoreAdditions(B, []);
  for (const [change, list, other] of [['removed', A.files, B.files], ['added', B.files, A.files]])
    for (const what of list) if (!other.includes(what)) items.push({page, area: 'file', change, what});
  const kinds = side => side.inline.map(x => x.kind);
  for (const [change, list, other] of [['removed', A.inline, kinds(B)], ['added', B.inline, kinds(A)]])
    for (const x of list) if (!other.includes(x.kind)) items.push({page, area: 'inline', change, what: x.kind, size: x.code.length});
  for (const x of A.inline) {
    const y = B.inline.find(z => z.kind === x.kind && !z.matched);
    if (!y) continue;
    y.matched = true;
    if (x.code !== y.code) items.push({page, area: 'inline', change: 'changed', what: x.kind, size: y.code.length});
  }
  for (const object of [...new Set([...Object.keys(A.configs), ...Object.keys(B.configs)])].sort()) {
    const [a, b] = [A.configs[object], B.configs[object]];
    if (!a || !b) { items.push({page, area: 'config', change: a ? 'removed' : 'added', object, path: '/', before: a, after: b}); continue; }
    const differences = jsonDiff(sorted(a), sorted(b));
    const effective = object === '__aiFeedbackPolicies' && differences.length
      ? samePolicies(Object.entries(B.sources).find(([url]) => url.endsWith('/feedback-core.js'))?.[1], a[0], b[0],
          B.stackTransitionCards ? [...B.stackTransitionCards].map(card => ['stack', JSON.parse(card.dataset.stackFeedback || '{}').policySelection || {exercise:card.dataset.stackId,name:''}]) : B.selections,
          Boolean(B.stackTransitionCards)) : undefined;
    for (const d of differences) items.push({page, area: 'config', change: 'changed', object, ...d, effective, item: (b[d.path.split('/')[1]] ?? a[d.path.split('/')[1]])});
  }
  const dom = [];
  for (const hunk of diffLines(A.dom, B.dom)) dom.push(...domItems(page, hunk, A.domNodes, B.domNodes));
  items.push(...movedElements(page, dom, A, B));
  // Invariants (review A2 S1, S3): reveals keep their words, the switch its place, constructs are not dropped, ids stay unique.
  const reveals = revealChecks(page, A, B, ends);
  for (const item of items) if (item.area === 'dom' && item.node) { const found = revealOf(item, reveals.status); if (found) item.reveal = found; }
  items.push(...reveals.items, ...switchCheck(page, A, B), ...constructChecks(page, A, B, linked), ...duplicateIds(page, A, B));
  // What a changed text lost and gained, word by word; what the page has.
  const count = selector => String(B.doc.querySelectorAll(selector).length);
  const features = {tabsets: count('.panel-tabset'), reveals: count('details.ctm-reveal'), embeds: count('iframe.ctm-embed'), modes: count('.ctm-modes')};
  for (const item of items) {
    if (item.change === 'changed' || item.change === 'text changed' || item.change === 'attribute changed') Object.assign(item, wordChanges(item.before, item.after));
    Object.assign(item, features);
    delete item.index;
  }
  markStackChanges(B,items);
  const contextual = contextItems(items, B, page);
  markStoreAdditions(B, contextual);
  markAssetChanges(A, B, contextual, assets, page, after, before);
  return contextual;
}

// ---------------------------------------------------------------- expectations
function loadExpectations(files) {
  const categories = [];
  for (const file of files) {
    const data = yaml.load(fs.readFileSync(file, 'utf8')) || {};
    for (const category of data.categories || []) categories.push({...category, file: path.basename(file)});
  }
  return categories;
}
const text = v => v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v);
function test(pattern, value) {
  return pattern === undefined || new RegExp(pattern, 's').test(text(value));
}
// A rule names the area and patterns for the item's fields; `where` tests
// fields of the configuration object the change belongs to (an array item of
// __pyExercises, ai-feedback-data, qpyodideCellDetails).
function matches(rule, item) {
  if (rule.area && rule.area !== item.area) return false;
  for (const field of ['change', 'what', 'object', 'path', 'tag', 'element', 'attribute', 'before', 'after', 'line', 'page', 'effective', 'context',
    'ancestors', 'content', 'to', 'lost', 'gained', 'tabsets', 'reveals', 'embeds', 'modes', 'reveal', 'switchOrder', 'store', 'stack', 'assets'])
    if (rule[field] !== undefined && !test(rule[field], item[field])) return false;
  for (const [field, pattern] of Object.entries(rule.where || {})) {
    const value = field.split('.').reduce((v, k) => (v == null ? v : v[k]), item.item ?? item.attrs);
    if (!test(pattern, value)) return false;
  }
  return true;
}
function classify(items, categories) {
  for (const item of items) {
    // An invariant's breach (a reveal that lost words, a moved switch, a
    // duplicate id) is never an expected difference.
    const category = item.invariant ? null : categories.find(c => (c.match || []).some(rule => matches(rule, item)));
    item.category = category ? category.id : null;
  }
  return items;
}

// ---------------------------------------------------------------- main
function main() {
  const o = options(process.argv.slice(2));
  const categories = loadExpectations(o.expect);
  const ends = loadRevealEnds(o.revealEnds);
  const assets = loadAssetSources(o.assetSources, o.assetPins, o.rendererBeforeSources, o.rendererBeforePins);
  const pagesBefore = htmlPages(o.before), pagesAfter = htmlPages(o.after);
  const pages = o.pages || [...new Set([...pagesBefore, ...pagesAfter])].sort();
  const items = [], linked = linkTargets(o.before, pagesBefore);
  let identical = 0;
  for (const page of pages) {
    const [a, b] = [path.join(o.before, page), path.join(o.after, page)];
    if (!fs.existsSync(a) || !fs.existsSync(b)) { items.push({page, area: 'page', change: fs.existsSync(a) ? 'removed' : 'added'}); continue; }
    const found = comparePage(page, a, b, ends, linked, assets);
    if (!found.length) identical++;
    items.push(...found);
  }
  classify(items, categories);
  const unexpected = items.filter(item => !item.category);
  const byCategory = {};
  for (const item of items) if (item.category) (byCategory[item.category] ||= {count: 0, pages: new Set()}).count++, byCategory[item.category].pages.add(item.page);
  const title = id => categories.find(c => c.id === id)?.title || id;
  const summary = {name: o.name, pages: pages.length, identical, differences: items.length, unexpected: unexpected.length,
    categories: Object.fromEntries(Object.entries(byCategory).map(([id, v]) => [id, {title: title(id), differences: v.count, pages: v.pages.size}]))};
  const md = [`### ${o.name || 'Rendered pages'}: ${pages.length} pages, ${identical} identical, ${items.length} differences, ${unexpected.length} unexplained`, ''];
  for (const [id, v] of Object.entries(summary.categories)) md.push(`- **${id}** ${v.title}: ${v.differences} in ${v.pages} pages`);
  if (unexpected.length) {
    md.push('', '**Unexplained differences:**');
    for (const item of unexpected.slice(0, 80)) md.push('- `' + item.page + '` ' + JSON.stringify({...item, page: undefined, item: undefined, attrs: undefined, node: undefined, beforeNode: undefined}).slice(0, 700));
  }
  const report = {summary, items: items.map(item => ({...item, item: undefined, attrs: undefined, node: undefined, beforeNode: undefined}))};
  if (o.report) fs.writeFileSync(o.report, JSON.stringify(report, null, 1));
  if (o.summary) fs.writeFileSync(o.summary, md.join('\n') + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join('\n') + '\n');
  console.log(md.join('\n'));
  process.exit(unexpected.length ? 1 : 0);
}

try { main(); } catch (error) { console.error(error); process.exit(2); }

