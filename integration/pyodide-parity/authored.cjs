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
import hashlib, importlib.util, json, os, runpy, sys
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
    native_file = Path(root) / '.ctm-parity-native.json'
    if native_file.exists() and native_file.stat().st_size > 16 * 1024 * 1024:
        raise ValueError('native parity receipt exceeds budget')
    native = json.loads(native_file.read_text()) if native_file.exists() else {'version': 1, 'questions': []}
    if (not isinstance(native, dict) or set(native) != {'version', 'questions'}
            or native['version'] != 1 or not isinstance(native['questions'], list)):
        raise ValueError('invalid native parity receipt')
    native_questions = {}
    for item in native['questions']:
        if (not isinstance(item, dict) or set(item) != {'file', 'label', 'sourceSHA256', 'records'}
                or item['file'] not in files or not isinstance(item['label'], str)
                or not isinstance(item['records'], list) or not item['records']):
            raise ValueError('invalid native parity question')
        file = Path(root) / item['file']
        if hashlib.sha256(file.read_bytes()).hexdigest() != item['sourceSHA256']:
            raise ValueError('native parity source changed after resolution')
        key = (item['file'], item['label'])
        if key in native_questions:
            raise ValueError('duplicate native parity source label')
        native_questions[key] = item
    native_seen = set()
    for name in files:
        for options in _questions(Path(root) / name):
            # Recipes are not ordinary unresolved questions. Legacy parameters
            # have rendered fixture coverage; native variables below require
            # their canonical source-bound receipt and real Pyodide grading.
            if 'parameters' in options:
                continue
            if 'variables' in options:
                key = (name, options.get('label', ''))
                if key not in native_questions:
                    raise ValueError('native authored recipe requires a resolved parity receipt: ' + name)
                native_seen.add(key)
                continue
            if not options.get('tests', '').strip():
                continue
            record = dict(_ar.record(run, options, root), file=name, label=options.get('label', ''), options=options)
            found.append(json.dumps(record, sort_keys=True, ensure_ascii=False, separators=(',', ':')))
    if native_seen != set(native_questions):
        raise ValueError('native parity receipt has no matching authored source question')
    if native_questions:
        if not _ctm_parity_wheel:
            raise ValueError('native authored parity requires the canonical checker wheel')
        from ctm_checkers.variants import decode_context
        from ctm_checkers.testing import Raw, _expect
        for (name, label), item in native_questions.items():
            aggregate = {'outcome': 'pass', 'calls': [], 'responses': [], 'nativeCandidates': [], 'nativeRecords': [],
                         'file': name, 'label': label, 'sourceSHA256': item['sourceSHA256']}
            identities = set()
            for candidate in item['records']:
                if (not isinstance(candidate, dict) or set(candidate) != {'id', 'hash', 'options', 'context', 'teacherInputs', 'resolvedData'}
                        or not isinstance(candidate['id'], str) or not candidate['id'] or candidate['id'] in identities):
                    raise ValueError('invalid native parity candidate')
                identities.add(candidate['id'])
                data = candidate['resolvedData']
                expected_context = dict(data['context'], variant=candidate['context'].get('variant'))
                identity = candidate['context'].get('variant')
                if (candidate['options'] != data['options'] or candidate['teacherInputs'] != data['teacher_inputs']
                        or candidate['context'] != expected_context
                        or (identity is not None and (not isinstance(identity, dict)
                            or set(identity) != {'n', 'id', 'hash'} or type(identity['n']) is not int or identity['n'] < 1
                            or identity['id'] != candidate['id'] or identity['hash'] != candidate['hash']))):
                    raise ValueError('native parity context/options differ from tested data')
                fields, variables, teacher, identity = decode_context(candidate['context'])
                teacher_inputs = candidate['teacherInputs']
                options = dict(candidate['options'])
                tests = options.get('tests', [])
                labels = options.get('field-labels')
                labels = [x.strip() for x in labels.split(',')] if isinstance(labels, str) else labels
                if (labels != fields or not isinstance(tests, list) or not isinstance(teacher_inputs, dict)
                        or set(teacher_inputs) != set(fields) or any(type(v) is not str for v in teacher_inputs.values())):
                    raise ValueError('native parity fields or teacher inputs differ')
                automatic = {'name': 'teacher answers', 'answers': {field: Raw(teacher_inputs[field]) for field in fields}, 'expect': 'correct'}
                def native_run(resolved, base):
                    reports = _ctm_parity_authored.run_question(resolved, Path(base),
                        variables=variables, teacher=teacher, variant=identity)
                    for field, actual in reports[0]['actual'].get('fields', {}).items():
                        _expect(actual, 'correct', 'native teacher answers/' + str(field))
                    return reports
                record = _ar.record(native_run, dict(options, tests=[automatic] + tests), root)
                aggregate['nativeRecords'].append({'input': {'options': options,
                    'context': candidate['context'], 'teacherInputs': teacher_inputs}, 'output': record})
                if record['outcome'] != 'pass':
                    aggregate['outcome'] = record['outcome']
                aggregate['calls'].extend(record['calls'])
                aggregate['responses'].extend(record['responses'])
                aggregate['nativeCandidates'].append({'id': candidate['id'], 'hash': candidate['hash'],
                    'outcome': record['outcome'], 'authoredTests': len(tests), 'teacherChecked': record['outcome'] == 'pass'})
            found.append(json.dumps(aggregate, sort_keys=True, ensure_ascii=False, separators=(',', ':')))
    return json.dumps(found)
`;

module.exports = {AUTHORED};
