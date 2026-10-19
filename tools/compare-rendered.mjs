#!/usr/bin/env node
// Compares two renders of a site page by page (design §13 A1): which script and
// style files a page loads, its inline scripts (configuration objects compared
// as JSON, code by kind), and its body DOM (canonical: sorted attributes,
// normalized whitespace, render noise removed). Every difference is classified
// by the expectation files (YAML, tools/compare-rendered/expect/); a difference
// that no category explains fails the run.
//
//   node tools/compare-rendered.mjs --before DIR --after DIR [--expect FILE ...] \
//     [--name LABEL] [--report OUT.json] [--summary OUT.md] [--pages a.html,b.html]
//
// Exit status: 0 when every difference is expected, 1 otherwise, 2 on errors.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const vm = require('node:vm');
const {JSDOM} = require('jsdom');
const yaml = require('js-yaml');

// ---------------------------------------------------------------- options
function options(argv) {
  const o = {expect: [], pages: null, name: '', report: null, summary: null, before: null, after: null};
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (flag === '--expect') o.expect.push(value);
    else if (flag === '--pages') o.pages = value.split(',').filter(Boolean);
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
function inlineScript(text) {
  let t = text.trim(), cells = null;
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
      const key = (el.className || 'json') + (el.parentElement?.id ? '#' + el.parentElement.id : '');
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
  return {doc, files, inline, configs, sources, selections, dom: canonical(doc.body)};
}

// Feedback context (A5): the prose an exercise sends is that of its own
// section, the innermost tab or heading section around it, without raw
// <details> blocks, other tabs, nested sections, other exercises, code blocks
// and the blocks the exercise lists itself (those are sent on their own).
// `contextVerdict` gives "own-section" when the after page's context text is
// exactly that, and every piece of the section's prose that the before page
// sent is still sent; otherwise it names the first piece that is not and where
// it comes from. Text is compared as letters and digits only, so markup, math
// delimiters, punctuation and the spacing of table cells do not matter.
const EXERCISES = '.math-exercise-cell, .py-exercise-cell, [id^="qpyodide-insertion-location-"], .ai-feedback-activity, .ai-feedback-task';
const NOT_TEXT = 'script, style, noscript, template';
const NOT_PROSE = NOT_TEXT + ', pre, details';
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
function contextVerdict(doc, element, after, before, refs) {
  if (!element) return 'no exercise element';
  const scope = element.parentElement?.closest('.tab-pane, section') || doc.body;
  const listed = String(refs ?? '').split(',').map(id => id.trim())
    .filter(id => id && id !== 'auto' && id !== 'none' && !id.startsWith('jsxgraph:')).map(id => doc.getElementById(id)).filter(Boolean);
  const skip = node => node.matches(NOT_PROSE) || node.matches(EXERCISES) || node.matches('.tab-pane, section, .nav') || listed.includes(node);
  const label = scope.matches('.tab-pane') && doc.getElementById(scope.getAttribute('aria-labelledby') || '');
  const own = squash((label ? label.textContent + ' ' : '') + textOf(scope, skip));
  for (const piece of pieces(after)) {
    if (own.includes(piece.key)) continue;
    return `not prose of the own section (${origin(doc, element, scope, listed, piece)}): ${piece.text.slice(0, 100)}`;
  }
  // Everything of the section's prose that the before page sent is still sent
  // (unless the 1500-character bound of the context leaves it out).
  const sent = squash(after);
  for (const piece of pieces(before)) {
    if (!own.includes(piece.key) || sent.includes(piece.key)) continue;
    if (String(after ?? '').length + piece.text.length > 1400) continue;
    return `lost prose of the own section: ${piece.text.slice(0, 100)}`;
  }
  return 'own-section';
}
function origin(doc, element, scope, listed, piece) {
  const has = el => el && squash(textOf(el)).includes(piece.key);
  const enclosing = [];
  for (let el = scope.parentElement?.closest('.tab-pane, section'); el; el = el.parentElement?.closest('.tab-pane, section')) enclosing.push(el);
  const otherTabs = [...doc.querySelectorAll('.tab-pane')].filter(el => !el.contains(element));
  const otherLabels = [...doc.querySelectorAll('[role="tab"]')].filter(tab => !doc.getElementById(tab.getAttribute('aria-controls') || '')?.contains(element));
  const places = [
    ['a <details> block', [...doc.querySelectorAll('details')]],
    ['a listed block', listed],
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
function contextItems(items, B) {
  const json = value => { try { return typeof value === 'string' && value.startsWith('"') ? JSON.parse(value) : value; } catch (_) { return value; } };
  for (const item of items) {
    let m, element, refs;
    if (item.area === 'config' && /^ai-feedback-data/.test(item.object) && (m = /^\/(\d+)\/context$/.exec(item.path))) {
      const data = B.configs[item.object]?.[m[1]];
      element = data && B.doc.getElementById(data.id); refs = data?.contextRefs;
    } else if (item.area === 'config' && item.object === 'qpyodideCellDetails' && (m = /^\/(\d+)\/options\/feedbackContext\/text$/.exec(item.path))) {
      const cell = B.configs.qpyodideCellDetails?.[m[1]];
      element = cell && B.doc.getElementById('qpyodide-insertion-location-' + cell.id); refs = cell?.options?.feedbackContext?.refs;
    } else if (item.area === 'config' && item.object === '__pyExercises' && (m = /^\/(\d+)\/feedbackContext\/text$/.exec(item.path))) {
      const exercise = B.configs.__pyExercises?.[m[1]];
      element = exercise && B.doc.getElementById('py-exercise-' + exercise.id); refs = exercise?.feedbackContext?.refs;
    } else if (item.area === 'dom' && item.attribute === 'data-context' && item.attrs?.id) {
      element = B.doc.getElementById(item.attrs.id); refs = item.attrs['data-context-refs'];
    } else continue;
    item.context = contextVerdict(B.doc, element, json(item.after), json(item.before), refs);
  }
  return items;
}

// Whether two policy configurations give every selection on the page the same
// effective policy, resolved by the after page's feedback-core.js (the browser
// contract reads the old and the new keys' JSON alike).
function samePolicies(coreFile, before, after, selections) {
  if (!coreFile || !fs.existsSync(coreFile)) return 'unknown';
  const context = vm.createContext({window: {}, console});
  context.globalThis = context;
  vm.runInContext(fs.readFileSync(coreFile, 'utf8'), context);
  const core = context.AIFeedbackCore || context.window.AIFeedbackCore || context.AIFeedback || context.window.AIFeedback;
  if (!core || typeof core.resolvePolicy !== 'function') return 'unknown';
  const all = [...selections, ...['plain-text', 'math-exercise', 'py-exercise', 'pyodide-interaktiv'].map(name => [name, {}])];
  for (const [integration, selection] of all) {
    let a, b;
    try { a = JSON.stringify(core.resolvePolicy(integration, 'en', {}, before, selection)); } catch (error) { a = 'error ' + error.message; }
    try { b = JSON.stringify(core.resolvePolicy(integration, 'en', {}, after, selection)); } catch (error) { b = 'error ' + error.message; }
    if (a !== b) return 'different';
  }
  return 'equal';
}

function canonical(node) {
  if (node.nodeType === 3) { const t = node.textContent.replace(/\s+/g, ' ').trim(); return t ? ['text: ' + t] : []; }
  if (node.nodeType !== 1) return [];
  const tag = node.tagName.toLowerCase();
  if (tag === 'script' || tag === 'style' || (tag === 'link' && node.getAttribute('rel') === 'stylesheet')) return [];
  const attrs = [...node.attributes].map(a => [a.name, noiseFree(a.name, a.value).replace(/\s+/g, ' ')]).sort((a, b) => a[0] < b[0] ? -1 : 1);
  const lines = ['<' + tag + attrs.map(([n, v]) => ` ${n}=${JSON.stringify(v)}`).join('') + '>'];
  for (const child of node.childNodes) lines.push(...canonical(child));
  lines.push('</' + tag + '>');
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
  if (n * m > 6e7) return [{removed: x, added: y, at: start}];
  const dp = Array.from({length: n + 1}, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const hunks = [];
  let i = 0, j = 0, hunk = null;
  const flush = () => { if (hunk) { hunks.push(hunk); hunk = null; } };
  while (i < n || j < m) {
    if (i < n && j < m && x[i] === y[j]) { flush(); i++; j++; }
    else if (j >= m || (i < n && dp[i + 1][j] >= dp[i][j + 1])) { (hunk ||= {removed: [], added: [], at: start + i}).removed.push(x[i++]); }
    else { (hunk ||= {removed: [], added: [], at: start + i}).added.push(y[j++]); }
  }
  flush();
  return hunks;
}
const ATTRIBUTE = / ([\w:.@-]+)=("(?:[^"\\]|\\.)*")/g;
function parseTag(line) {
  const m = /^<([\w-]+)((?: [\w:.@-]+="(?:[^"\\]|\\.)*")*)>$/.exec(line);
  if (!m) return null;
  const attrs = {};
  for (const [, name, value] of m[2].matchAll(ATTRIBUTE)) attrs[name] = JSON.parse(value);
  return {tag: m[1], attrs};
}
// DOM hunks -> items: element lines paired by tag and identity give attribute
// changes; text lines paired in order give text changes; the rest is added or removed.
function domItems(page, hunk) {
  const items = [], removed = hunk.removed.map(line => ({line, tag: parseTag(line)})), added = hunk.added.map(line => ({line, tag: parseTag(line)}));
  const identity = t => t.tag + '|' + (t.attrs.id ?? t.attrs['data-label'] ?? t.attrs['data-id'] ?? '');
  for (const r of removed) {
    if (!r.tag) continue;
    const a = added.find(x => x.tag && !x.used && identity(x.tag) === identity(r.tag)) || added.find(x => x.tag && !x.used && x.tag.tag === r.tag.tag && !r.tag.attrs.id && !x.tag.attrs.id);
    if (!a) continue;
    r.used = a.used = true;
    for (const name of new Set([...Object.keys(r.tag.attrs), ...Object.keys(a.tag.attrs)]))
      if (r.tag.attrs[name] !== a.tag.attrs[name])
        items.push({page, area: 'dom', change: r.tag.attrs[name] === undefined ? 'attribute added' : a.tag.attrs[name] === undefined ? 'attribute removed' : 'attribute changed',
          tag: r.tag.tag, element: identity(r.tag), attribute: name, before: r.tag.attrs[name] ?? null, after: a.tag.attrs[name] ?? null, attrs: a.tag.attrs});
  }
  const texts = side => side.filter(x => !x.used && x.line.startsWith('text: '));
  const [rt, at] = [texts(removed), texts(added)];
  for (let k = 0; k < Math.min(rt.length, at.length); k++) {
    rt[k].used = at[k].used = true;
    items.push({page, area: 'dom', change: 'text changed', before: rt[k].line.slice(6), after: at[k].line.slice(6)});
  }
  for (const r of removed) if (!r.used) items.push({page, area: 'dom', change: 'removed', line: r.line});
  for (const a of added) if (!a.used) items.push({page, area: 'dom', change: 'added', line: a.line});
  return items;
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

function comparePage(page, before, after) {
  const A = extract(before), B = extract(after), items = [];
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
      ? samePolicies(Object.entries(B.sources).find(([url]) => url.endsWith('/feedback-core.js'))?.[1], a[0], b[0], B.selections) : undefined;
    for (const d of differences) items.push({page, area: 'config', change: 'changed', object, ...d, effective, item: (b[d.path.split('/')[1]] ?? a[d.path.split('/')[1]])});
  }
  for (const hunk of diffLines(A.dom, B.dom)) items.push(...domItems(page, hunk));
  return contextItems(items, B);
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
  for (const field of ['change', 'what', 'object', 'path', 'tag', 'element', 'attribute', 'before', 'after', 'line', 'page', 'effective', 'context'])
    if (rule[field] !== undefined && !test(rule[field], item[field])) return false;
  for (const [field, pattern] of Object.entries(rule.where || {})) {
    const value = field.split('.').reduce((v, k) => (v == null ? v : v[k]), item.item ?? item.attrs);
    if (!test(pattern, value)) return false;
  }
  return true;
}
function classify(items, categories) {
  for (const item of items) {
    const category = categories.find(c => (c.match || []).some(rule => matches(rule, item)));
    item.category = category ? category.id : null;
  }
  return items;
}

// ---------------------------------------------------------------- main
function main() {
  const o = options(process.argv.slice(2));
  const categories = loadExpectations(o.expect);
  const pagesBefore = htmlPages(o.before), pagesAfter = htmlPages(o.after);
  const pages = o.pages || [...new Set([...pagesBefore, ...pagesAfter])].sort();
  const items = [];
  let identical = 0;
  for (const page of pages) {
    const [a, b] = [path.join(o.before, page), path.join(o.after, page)];
    if (!fs.existsSync(a) || !fs.existsSync(b)) { items.push({page, area: 'page', change: fs.existsSync(a) ? 'removed' : 'added'}); continue; }
    const found = comparePage(page, a, b);
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
    for (const item of unexpected.slice(0, 80)) md.push('- `' + item.page + '` ' + JSON.stringify({...item, page: undefined, item: undefined, attrs: undefined}).slice(0, 700));
  }
  const report = {summary, items: items.map(item => ({...item, item: undefined, attrs: undefined}))};
  if (o.report) fs.writeFileSync(o.report, JSON.stringify(report, null, 1));
  if (o.summary) fs.writeFileSync(o.summary, md.join('\n') + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join('\n') + '\n');
  console.log(md.join('\n'));
  process.exit(unexpected.length ? 1 : 0);
}

try { main(); } catch (error) { console.error(error); process.exit(2); }
