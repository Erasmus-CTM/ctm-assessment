// tools/compare-rendered.mjs reads pyodide-interaktiv's settings script by its
// values (qpyodideSettings, the cells as qpyodideCellDetails): comments and
// the script type are not differences, a changed value is, and step 3's
// expected categories explain only their own changes (expect/step3.yml).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const ROOT = path.join(__dirname, '..');

function settings({type, comment, lang, uiLanguage, cells}) {
  return `<script type="${type}">\n// qpyodide-document-settings.js – document-wide settings\n// ${comment}\n`
    + `globalThis.qpyodideInstallPythonPackagesList = [''];\n`
    + `globalThis.qpyodideSetupPythonPackages = !(qpyodideInstallPythonPackagesList.indexOf("") !== -1);\n`
    + `globalThis.qpyodideLang = "${lang}";\n`
    + `globalThis.qpyodideCellDetails = ${JSON.stringify(cells)};\n`
    + `globalThis.qpyodideFeedbackOptions = {\n  enabled: true,\n  hints: true${uiLanguage ? `,\n  uiLanguage: "${uiLanguage}"` : ''}\n};\n</script>`;
}
function compare(before, after) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-settings-'));
  try {
    for (const [side, html] of [['before', before], ['after', after]]) {
      fs.mkdirSync(path.join(dir, side));
      fs.writeFileSync(path.join(dir, side, 'page.html'), `<!doctype html><html><head>${html}</head><body><div id="qpyodide-insertion-location-1"></div></body></html>`);
    }
    const run = spawnSync(process.execPath, [path.join(ROOT, 'tools/compare-rendered.mjs'), '--before', path.join(dir, 'before'), '--after', path.join(dir, 'after'),
      '--expect', path.join(ROOT, 'tools/compare-rendered/expect/step3.yml'), '--report', path.join(dir, 'report.json')], {encoding: 'utf8'});
    return {status: run.status, items: JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8')).items};
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}
const cells = [{id: 1, code: 'print(1)', options: {context: 'interactive'}}];

test('comments and the script type are no difference; no -> nb and the new uiLanguage are step 3\'s', () => {
  const result = compare(settings({type: 'module', comment: 'old words', lang: 'no', cells}),
    settings({type: 'text/javascript', comment: 'new words', lang: 'nb', uiLanguage: 'nb', cells}));
  assert.equal(result.status, 0, JSON.stringify(result.items));
  assert.deepEqual(result.items.map(item => [item.path, item.category]).sort(),
    [['/0/qpyodideFeedbackOptions/uiLanguage', 'pyodide-ui-language'], ['/0/qpyodideLang', 'pyodide-lang']]);
});

test('any other changed value, and a changed cell, stay unexplained', () => {
  const result = compare(settings({type: 'module', comment: '', lang: 'en', cells}),
    settings({type: 'text/javascript', comment: '', lang: 'de', cells: [{...cells[0], code: 'print(2)'}]}));
  assert.equal(result.status, 1);
  assert.deepEqual(result.items.filter(item => !item.category).map(item => item.object).sort(), ['qpyodideCellDetails', 'qpyodideSettings']);
});
