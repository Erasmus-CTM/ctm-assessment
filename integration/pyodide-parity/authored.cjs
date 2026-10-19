'use strict';
// The authored tests of a source tree, run in Pyodide: with ctm-checkers in
// the build (math-exercise 0.11), through ctm_checkers.math_exercise.authored
// (authored_questions and run_question, the functions its main() runs, from
// the build's wheel); else through question-tests.py's own functions (0.10).
// Each question goes through authored_record.py (the recorder ctm-checkers
// imports as well): every check() call of the tests is recorded with its
// result and with the response it was given, as the page would send it. Each
// question comes back as canonical JSON written by Python (sorted keys,
// compact), so numbers keep Python's spelling.
const AUTHORED = String.raw`
import importlib.util, json, os, runpy, sys
from pathlib import Path
_spec = importlib.util.spec_from_file_location('_ctm_parity_authored_record', '/ctm-parity/authored_record.py')
_ar = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_ar)
if _ctm_parity_wheel:
    sys.path.insert(0, _ctm_parity_wheel)
    from ctm_checkers.math_exercise import authored as _ctm_parity_authored
    _questions = _ctm_parity_authored.authored_questions
    def _runner():
        return lambda options, base: _ctm_parity_authored.run_question(options, Path(base))
else:
    _qt = runpy.run_path('/ctm-parity/question-tests.py')
    _questions = _qt['authored_questions']
    def _runner():
        runtime = _qt['runtime_namespace']()
        return lambda options, base: _qt['run_question'](options, runtime, Path(base))
def _ctm_authored(root, files):
    os.chdir(root)
    run = _runner()
    found = []
    for name in files:
        for options in _questions(Path(root) / name):
            if not options.get('tests', '').strip():
                continue
            record = dict(_ar.record(run, options, root), file=name, label=options.get('label', ''), options=options)
            found.append(json.dumps(record, sort_keys=True, ensure_ascii=False, separators=(',', ':')))
    return json.dumps(found)
`;

module.exports = {AUTHORED};
