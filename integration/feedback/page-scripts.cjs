// Runs a rendered page's CTM scripts in a jsdom window in the order a browser
// loads them (D1): ctm-libs' files and the components' own scripts are HTML
// dependencies (site_libs/quarto-contrib/<name>-<version>/<file>), the
// configuration objects stay inline. Only the dependencies and inline scripts
// a test asks for are run.
const fs = require('node:fs');
const path = require('node:path');

// Dependencies of ctm-libs (feedback, runtime, catalogues) and of the components
// (math-exercise with ctm-checkers' page script, from math-exercise 0.11).
const FEEDBACK = ['ai-feedback'];
const LIBRARY = ['ai-feedback', 'ctm-runtime', 'ctm-locale', 'ctm-locale-math-exercise', 'ctm-locale-py-exercise'];
// These are actual rendered HTML dependencies used by the shared pool chooser.
// run() still executes only matching page tags, in document order.
const MATH = [...LIBRARY, 'ctm-layout', 'ctm-locale-ui', 'ctm-store', 'ctm-variants', 'ctm-checkers', 'math-exercise'];
// Inline configuration written by ctm-libs and the components.
const CONFIG = /^\s*window\.(__aiFeedbackPolicies|__aiFeedbackConfig|__mathExerciseConfig|__pyExerciseConfig) =/;

// The dependency name and file of a script src, or null.
function dependency(src) {
  const found = /(?:^|\/)quarto-contrib\/(.+?)-(\d[^/]*)\/([^/]+)$/.exec(src.split('?')[0]);
  return found ? {name: found[1], version: found[2], file: found[3]} : null;
}

// Script tags of the page that load dependency `name` (and `file`, if given).
function scriptsOf(document, name, file) {
  return [...document.scripts].filter(script => {
    const found = script.getAttribute('src') && dependency(script.getAttribute('src'));
    return found && found.name === name && (!file || found.file === file);
  });
}

// Evaluates, in document order, the inline configuration and the files of
// `dependencies` (names) of the page `htmlFile` in window `w`.
function run(w, htmlFile, dependencies = LIBRARY, {config = true, transform = {}} = {}) {
  const loaded = [];
  for (const script of [...w.document.scripts]) {
    const src = script.getAttribute('src');
    if (!src) {
      if (config && CONFIG.test(script.textContent)) w.eval(script.textContent);
      continue;
    }
    const found = dependency(src);
    if (!found || !dependencies.includes(found.name)) continue;
    let code = fs.readFileSync(path.resolve(path.dirname(htmlFile), src.split('?')[0]), 'utf8');
    if (transform[found.file]) code = transform[found.file](code);
    w.eval(code);
    loaded.push(found.name + '/' + found.file);
  }
  return loaded;
}

// The version of an installed extension (`extensionsDir/<name>/_extension.yml`)
// as [major, minor, patch]; [0, 0, 0] when it names none.
function extensionVersion(extensionsDir, name) {
  const manifest = fs.readFileSync(path.join(extensionsDir, name, '_extension.yml'), 'utf8');
  const version = ((manifest.match(/^version:\s*['"]?([\d.]+)/m) || [])[1] || '0.0.0').split('.').map(Number);
  return [0, 1, 2].map(i => version[i] || 0);
}
// Whether that version is at least major.minor.
function atLeast(extensionsDir, name, major, minor) {
  const [a, b] = extensionVersion(extensionsDir, name);
  return a > major || (a === major && b >= minor);
}
module.exports = {FEEDBACK, LIBRARY, MATH, CONFIG, dependency, scriptsOf, run, extensionVersion, atLeast};
