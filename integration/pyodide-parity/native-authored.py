"""Resolve native recipes read-only through the installed, verified component CLI.

The resulting exact data is graded again inside Pyodide by authored.cjs. This
helper creates no teaching decisions and executes no substitute grading rules.
"""
import argparse
import glob
import hashlib
import json
import os
from pathlib import Path
import runpy
import signal
import subprocess
import sys

LIMIT = 16 * 1024 * 1024
EXCLUDED = {'_extensions', 'node_modules', '.git', '.quarto', '_site', '_variants-review', '_review-examples', 'work'}


def fresh_projection(row, retained, identity):
    """Bind the receipt to fresh tested data while retaining approval identity.

    History deliberately preserves the original prose and unused variables.
    Only math, teacher answers and grading semantics define approval content.
    """
    from ctm_variants.model import candidate
    neutral = {key: row[key] for key in ('id', 'hash', 'note', 'snapshot', 'data', 'tests')}
    rebuilt = candidate(row['id'], row['snapshot'], note=row['note'], data=row['data'], tests=row['tests'])
    if (neutral != rebuilt or row['tests'].get('passed') is not True
            or any(row[key] != retained[key] for key in ('id', 'hash'))
            or any(row['snapshot'][key] != retained['snapshot'][key] for key in ('math', 'teacher', 'grading'))):
        raise ValueError('native parity record differs from tested approval content')
    data = row['data']
    expected_context = dict(data['context'], variant=identity)
    if (row['options'] != data['options'] or row['teacherInputs'] != data['teacher_inputs']
            or row['context'] != expected_context):
        raise ValueError('native parity projections differ from the exact fresh tested record')
    return {**{key: row[key] for key in ('id', 'hash', 'options', 'context', 'teacherInputs')},
            'resolvedData': data}


def produce(root):
    root = Path(root).resolve()
    files = sorted(path.relative_to(root).as_posix() for path in root.rglob('*.qmd')
        if path.is_file() and not any(part in EXCLUDED or part.startswith('.') for part in path.relative_to(root).parts))
    if len(files) > 1000:
        raise ValueError('native parity source file budget exceeded')
    wrapper = root / '_extensions/math-exercise/question-variants.py'
    result = {'version': 1, 'questions': []}
    if not wrapper.exists():
        if any('\n#| variables:' in ('\n' + (root / name).read_text()) for name in files):
            raise ValueError('native variables require the canonical component wrapper')
        return result
    module = runpy.run_path(str(wrapper), run_name='ctm_parity_native_component')
    module['install_imports']()
    from ctm_variants.producer import discover, inside
    from ctm_variants import history
    from ctm_variants.model import classify
    for definition in discover(root, [glob.escape(name) for name in files], module['parse_source']):
        if 'variables' not in definition['options']:
            continue
        file, label = definition['file'], definition['label']
        source = inside(root, file)
        before = source.read_bytes()
        manifest = inside(root, '_variants/' + label + '.yml')
        prior = manifest.read_bytes() if manifest.exists() else None
        command = [sys.executable, '-I', str(wrapper), '--project', str(root), '--file', file, '--label', label, 'resolve']
        child = subprocess.Popen(command, cwd=root, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                 start_new_session=os.name != 'nt')
        try:
            stdout, stderr = child.communicate(timeout=330)
        except subprocess.TimeoutExpired:
            if os.name != 'nt':
                os.killpg(child.pid, signal.SIGKILL)
            else:
                subprocess.run(['taskkill', '/F', '/T', '/PID', str(child.pid)], timeout=2, check=False)
                child.kill()
            child.communicate()
            raise ValueError(file + ': ' + label + ': native parity resolution timed out')
        if child.returncode or len(stdout) + len(stderr) > LIMIT:
            raise ValueError(file + ': ' + label + ': native parity resolution failed: ' + stderr.decode(errors='replace')[-4000:])
        response = json.loads(stdout)
        if source.read_bytes() != before or (manifest.read_bytes() if manifest.exists() else None) != prior:
            raise ValueError(file + ': ' + label + ': read-only parity resolution changed source/history')
        staged = history.validate(response['manifest'])
        original, lease = history.load(manifest, label)
        if (response.get('version') != 1 or response.get('baseHash') != lease or staged['question'] != label
                or staged['decisions'] != original['decisions'] or staged['events'] != original['events']
                or staged['proposals'][:len(original['proposals'])] != original['proposals']):
            raise ValueError('native parity response changed retained history')
        neutral_rows = [{key: row[key] for key in ('id', 'hash', 'note', 'snapshot', 'data', 'tests')} for row in response['records']]
        classification = classify(staged['decisions'], neutral_rows)
        by_id = {item['candidate']['id']: item for item in classification['entries'] if item['candidate'] is not None}
        records = []
        seen = set()
        for row in response['records']:
            if (row['id'] in seen or row.get('tests', {}).get('passed') is not True
                    or not any(item['record']['id'] == row['id'] and item['record']['hash'] == row['hash'] for item in staged['proposals'])):
                raise ValueError('native parity requires distinct tested retained identities')
            retained = next(item['record'] for item in staged['proposals'] if item['record']['id'] == row['id'] and item['record']['hash'] == row['hash'])
            current = by_id.get(row['id'])
            identity = ({'n': current['entry']['n'], 'id': row['id'], 'hash': row['hash']}
                        if current and current['state'] in ('current', 'moved') else None)
            seen.add(row['id'])
            records.append(fresh_projection(row, retained, identity))
        if not records:
            raise ValueError('native parity requires resolved teacher candidates')
        result['questions'].append({'file': file, 'label': label,
            'sourceSHA256': hashlib.sha256(before).hexdigest(), 'records': records})
        if len(json.dumps(result, ensure_ascii=True, allow_nan=False).encode()) > LIMIT:
            raise ValueError('aggregate native parity receipt exceeds 16 MiB')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    args = parser.parse_args()
    root = args.root.resolve()
    output = root / '.ctm-parity-native.json'
    if output.is_symlink():
        raise ValueError('native parity receipt must be an ordinary file')
    value = produce(root)
    output.write_text(json.dumps(value, ensure_ascii=True, allow_nan=False) + '\n', encoding='utf-8')
    print('Resolved native parity questions:', len(value['questions']))


if __name__ == '__main__':
    main()
