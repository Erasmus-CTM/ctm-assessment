#!/usr/bin/env python3
"""Run the existing mocked/native-adapter unit group, without a Wasm artifact."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, required=True, help='Scratch source archive of stack-wasm-maxima')
    parser.add_argument('--checkers-extension', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--logs', type=Path, required=True)
    args = parser.parse_args()
    repo = args.repo.resolve()
    checkers = args.checkers_extension.resolve()
    manifest = json.loads((checkers / 'checkers.json').read_text())
    wheels = [checkers / manifest['wheel'], checkers / manifest['parts']['stack']['wheel']]
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE='1', PYTHONPATH=os.pathsep.join(map(str, wheels)))
    node = ['prototype/runtime/test-maxima-session.mjs', 'prototype/backend/test-worker-loading.mjs',
            'prototype/native/test-python-bridge.mjs', 'prototype/native/test-engine.mjs',
            'prototype/native/test-backend-worker.mjs', 'prototype/jsxgraph/test-adapter.mjs',
            'scripts/milestone-three/test-package-boards.mjs']
    python = ['prototype/backend/test_native_adapter.py', 'prototype/native/test_python_bridge.py',
              'scripts/milestone-three/test-reference.py']
    report = {'repo': str(repo), 'scope': 'existing lightweight unit group, no real Wasm/native CAS parity',
              'npmTest': 'not defined: package.json has no scripts or test entry', 'commands': []}
    args.logs.mkdir(parents=True, exist_ok=True)
    for filename in node + python:
        command = ['node' if filename in node else sys.executable, filename]
        result = subprocess.run(command, cwd=repo, env=env, text=True, capture_output=True, timeout=120)
        log = args.logs / (filename.replace('/', '_') + '.log')
        log.write_text(result.stdout + result.stderr)
        report['commands'].append({'command': command, 'exitCode': result.returncode,
                                   'status': 'passed' if result.returncode == 0 else 'failed',
                                   'log': str(log), 'output': (result.stdout + result.stderr).strip()})
    report['skipped'] = [
        {'group': 'real Wasm/native runtime parity and startup', 'reason': 'No staged verified runtime-v3 package'},
        {'group': 'input/feedback catalogue replay', 'reason': 'Generated pinned STACK parser/catalogues not staged'},
        {'group': 'board-isolation real browser test', 'reason': 'Selected pure mocked/unit group only; separate browser benchmark reports engines'},
    ]
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
    return int(any(row['exitCode'] for row in report['commands']))


if __name__ == '__main__':
    raise SystemExit(main())
