// Expected store additions, validated against the rendered manifest and catalogue.
// This never removes DOM or configuration from the ordinary comparison.
import fs from 'node:fs';

const HASH = /^[0-9a-f]{16}$/;
const COMPONENTS = new Set(['math-exercise', 'py-exercise', 'pyodide-interaktiv']);
const MESSAGE_KEYS = ('savingNotice savingDisabled savingOffNotice clearFailed storageUnavailable recordTooLarge saveOff saveOn confirmSaveOff confirmClearCourse lastResult sourceChanged showSaved outdated variantChanged variantWithdrawn statusCorrect statusPartial statusWrong statusInvalid confirmNewVariant progressTitle exercise correct partial wrong unattempted total exportTitle copyAll downloadMarkdown downloadHTML exportClose locale').split(' ');
const plain = x => x && typeof x === 'object' && !Array.isArray(x);
const keys = (x, required, optional = []) => plain(x) &&
  required.every(k => Object.hasOwn(x, k)) && Object.keys(x).every(k => required.includes(k) || optional.includes(k));
const str = x => typeof x === 'string';
const bool = x => typeof x === 'boolean';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const text = x => String(x).replace(/\s+/g, ' ').trim();
function signature(node) {
  if (node.nodeType === 3) return text(node.textContent) || null;
  if (node.nodeType !== 1) return null;
  return [node.tagName.toLowerCase(), [...node.attributes].map(a => [a.name, a.value]).sort(),
    [...node.childNodes].map(signature).filter(x => x !== null)];
}
function catalogue(B, locale) {
  const name = B.sources['ctm-locale-ui/ui.js'];
  if (!name || !fs.existsSync(name)) return null;
  const source = fs.readFileSync(name, 'utf8');
  const match = /\/\*BEGIN-JSON\*\/([\s\S]*?)\/\*END-JSON\*\//.exec(source);
  if (!match) return null;
  try {
    const data = JSON.parse(match[1]);
    return data[locale] || null;
  } catch (_) { return null; }
}
function inspect(B) {
  const scripts = [...B.doc.querySelectorAll('script#ctm-store-manifest')];
  if (scripts.length !== 1 || scripts[0].getAttribute('type') !== 'application/json') return null;
  let m;
  try { m = JSON.parse(scripts[0].textContent); } catch (_) { return null; }
  if (!keys(m, ['v', 'save', 'export', 'progress', 'exercises', 'quizzes', 'messages'], ['course']) ||
      m.v !== 1 || ![m.save, m.export, m.progress].every(bool) ||
      (Object.hasOwn(m, 'course') && !str(m.course)) ||
      !Array.isArray(m.exercises) || !m.exercises.length || !Array.isArray(m.quizzes) ||
      !keys(m.messages, MESSAGE_KEYS)) return null;
  const ui = catalogue(B, m.messages.locale);
  if (!ui || !MESSAGE_KEYS.every(k => str(m.messages[k]) && (k === 'locale' || m.messages[k] === ui[k]))) return null;
  const runtimeIds = new Set();
  for (const e of m.exercises) {
    if (!keys(e, ['component', 'id', 'source', 'save', 'runtimeId', 'order'], ['title', 'quiz']) ||
        !COMPONENTS.has(e.component) || !str(e.id) || !str(e.source) || !HASH.test(e.source) || !bool(e.save) || (e.id === '' && e.save) ||
        !/^ctm-(?:block|runtime)-[1-9]\d*(?:-\d+)?$/.test(e.runtimeId) ||
        runtimeIds.has(e.runtimeId) || !Number.isSafeInteger(e.order) || e.order < 1 ||
        (e.title !== undefined && !str(e.title)) || (e.quiz !== undefined && !str(e.quiz))) return null;
    runtimeIds.add(e.runtimeId);
  }
  if (m.save !== m.exercises.some(e => e.save)) return null;
  const quizIds = new Set();
  for (const q of m.quizzes) {
    if (!keys(q, ['id', 'title']) || !str(q.id) || !q.id || !str(q.title) || quizIds.has(q.id)) return null;
    quizIds.add(q.id);
  }
  if (m.exercises.some(e => e.quiz && !quizIds.has(e.quiz))) return null;
  // Every declaration must have its rendered component: losing all metadata
  // attributes together must not make their absence invisible.
  for (const e of m.exercises) {
    if (e.component === 'pyodide-interaktiv') {
      const present = (B.configs.qpyodideCellDetails || []).some(cell => {
        const o = cell.options || {};
        return (o['ctm-store-id'] === e.id && o['ctm-store-source'] === e.source && o['ctm-store-save'] === e.save) ||
          ('extra:' + o['ctm-store-id'] === e.id && o['ctm-extra-source'] === e.source && o['ctm-extra-save'] === e.save);
      });
      if (!present) return null;
    } else {
      const present = [...B.doc.querySelectorAll('.' + e.component + '-cell')].some(node =>
        node.getAttribute('data-ctm-component') === e.component && node.getAttribute('data-ctm-id') === e.id &&
        node.getAttribute('data-ctm-runtime-id') === e.runtimeId && node.getAttribute('data-ctm-source') === e.source &&
        node.getAttribute('data-ctm-save') === String(e.save));
      if (!present) return null;
    }
  }
  if ([...B.doc.querySelectorAll('.math-exercise-cell, .py-exercise-cell')].some(node => !rootMetadata(node, m))) return null;
  if ((B.configs.qpyodideCellDetails || []).some(cell => {
    const o = cell.options || {};
    return o.context !== 'setup' && !matchingEntry(m, 'pyodide-interaktiv', o['ctm-store-id'], o['ctm-store-source'], o['ctm-store-save']);
  })) return null;
  const bars = [...B.doc.querySelectorAll('.ctm-save-bar')];
  let bar = null;
  if (m.save || m.export) {
    if (bars.length !== 1) return null;
    bar = bars[0];
    // Build the precise generated structure with this page's shipped locale.
    // Exact text prevents unrelated prose from being hidden inside chrome.
    const expected = B.doc.createElement('div');
    expected.className = 'ctm-save-bar';
    expected.setAttribute('role', 'region');
    expected.setAttribute('aria-label', ui[m.save ? 'savingLabel' : 'exportTitle']);
    expected.hidden = true;
    const notice = B.doc.createElement('p'); notice.className = 'ctm-save-notice';
    notice.textContent = ui[m.save ? 'savingNotice' : 'savingDisabled'];
    const actions = B.doc.createElement('div'); actions.className = 'ctm-save-actions';
    for (const [attribute, key] of [...(m.save ? [['clear-page', 'clearPage'], ['clear-course', 'clearCourse'], ['save-toggle', 'saveOff']] : []),
      ...(m.export ? [['export', 'exportTitle']] : [])]) {
      if (!str(ui[key]) || !ui[key]) return null;
      const button = B.doc.createElement('button'); button.type = 'button';
      button.setAttribute('data-ctm-' + attribute, ''); button.textContent = ui[key]; actions.append(button);
    }
    const status = B.doc.createElement('span'); status.className = 'ctm-save-status';
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    expected.append(notice, actions, status);
    if (!same(signature(bar), signature(expected))) return null;
  } else if (bars.length) return null;
  const required = ['script ctm-locale-ui/ui.js', 'script ctm-copy/ctm-copy.js', 'script ctm-store/ctm-store.js', 'css ctm-ui/ctm-ui.css'];
  if (m.export) required.push('script ctm-export/ctm-export.js');
  if (m.progress || m.quizzes.length) required.push('script ctm-progress/ctm-progress.js', 'script ctm-nav/ctm-nav.js');
  if (required.some(name => !B.files.includes(name))) return null;
  return {manifest: m, bar};
}
function matchingEntry(m, component, id, source, save) {
  return m.exercises.some(e => e.component === component && e.id === id && e.source === source && e.save === save);
}
function rootMetadata(node, m) {
  if (!node?.matches('.math-exercise-cell, .py-exercise-cell')) return false;
  const component = node.classList.contains('math-exercise-cell') ? 'math-exercise' : 'py-exercise';
  return m.exercises.some(e => e.component === component &&
    node.getAttribute('data-ctm-component') === component &&
    node.getAttribute('data-ctm-id') === e.id &&
    node.getAttribute('data-ctm-runtime-id') === e.runtimeId &&
    node.getAttribute('data-ctm-source') === e.source &&
    node.getAttribute('data-ctm-save') === String(e.save));
}
export function markStoreAdditions(B, items) {
  // Setup cells have no saved-answer registration. The new author option's
  // empty default is nevertheless present in their unchanged settings data.
  for (const item of items) {
    const match = /^\/(\d+)\/options\/save$/.exec(item.path || '');
    if (item.area === 'config' && item.object === 'qpyodideCellDetails' && item.change === 'changed' &&
        item.before === undefined && item.after === '' && match &&
        B.configs.qpyodideCellDetails?.[Number(match[1])]?.options?.context === 'setup') item.store = 'cell-metadata';
  }
  const found = inspect(B);
  if (!found) return;
  const m = found.manifest;
  const dependencies = new Set(['script ctm-locale-ui/ui.js', 'script ctm-copy/ctm-copy.js',
    'script ctm-store/ctm-store.js', 'css ctm-ui/ctm-ui.css']);
  if (m.export) dependencies.add('script ctm-export/ctm-export.js');
  if (m.progress || m.quizzes.length) {
    dependencies.add('script ctm-progress/ctm-progress.js'); dependencies.add('script ctm-nav/ctm-nav.js');
  }
  if (B.doc.querySelector('.math-exercise-cell')) dependencies.add('script math-exercise/math-store.js');
  for (const item of items) {
    if (item.area === 'file' && item.change === 'added' && dependencies.has(item.what)) item.store = 'dependency';
    if (item.area === 'config' && item.change === 'added' && item.object === 'ctm-store-manifest' &&
        item.path === '/' && item.before === undefined && same(item.after, [m])) item.store = 'manifest';
    if (item.area === 'dom' && item.change === 'added' && found.bar &&
        (item.node === found.bar || found.bar.contains(item.node))) item.store = 'bar';
    if (item.area === 'dom' && item.change === 'attribute added' && item.before === null &&
        /^data-ctm-(?:component|id|runtime-id|source|save)$/.test(item.attribute) && rootMetadata(item.node, m)) item.store = 'attribute';
    if (item.area !== 'config' || item.change !== 'changed' || item.before !== undefined) continue;
    let match = /^\/(\d+)\/(save|source|storeId)$/.exec(item.path);
    if (item.object === '__pyExercises' && match) {
      const e = B.configs.__pyExercises?.[Number(match[1])];
      if (e && matchingEntry(m, 'py-exercise', e.storeId, e.source, e.save)) item.store = 'py-metadata';
    }
    match = /^\/(\d+)\/options\/(ctm-store-id|ctm-store-source|ctm-store-save|ctm-extra-source|ctm-extra-save|save)$/.exec(item.path);
    if (item.object === 'qpyodideCellDetails' && match) {
      const options = B.configs.qpyodideCellDetails?.[Number(match[1])]?.options;
      if (!options || !matchingEntry(m, 'pyodide-interaktiv', options['ctm-store-id'], options['ctm-store-source'], options['ctm-store-save'])) continue;
      const field = match[2];
      if (field.startsWith('ctm-extra-')) {
        if (matchingEntry(m, 'pyodide-interaktiv', 'extra:' + options['ctm-store-id'], options['ctm-extra-source'], options['ctm-extra-save'])) item.store = 'cell-metadata';
      } else if (field !== 'save' || item.after === '') item.store = 'cell-metadata';
    }
  }
}
