#!/usr/bin/env python3
"""Test one canonical package's pinned generation stack, without deployment."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--workspace', type=Path, required=True)
parser.add_argument('--math-source', type=Path)
parser.add_argument('--checkers-source', type=Path)
parser.add_argument('--libs-source', type=Path)
args = parser.parse_args()
workspace = args.workspace.resolve()
record = json.loads((workspace / 'resolved-repos.json').read_text())

def source(name, explicit):
    commit = record['repositories'][name]['commit']
    path = explicit.resolve() if explicit else workspace / 'src' / (name + '-' + commit[:12])
    if not path.is_dir(): raise RuntimeError('Missing pinned source: ' + str(path))
    return path

math = source('math-exercise', args.math_source)
checkers = source('ctm-checkers', args.checkers_source)
libs = source('ctm-libs', args.libs_source)
env = dict(os.environ, CTM_COMPONENT_DEV='1', CTM_CHECKERS_SOURCE=str(checkers / 'src'))

def run(command, cwd):
    print('+ ' + shlex.join(map(str, command)), flush=True)
    subprocess.run(list(map(str, command)), cwd=cwd, env=env, check=True)

# These are the real sources that produced the canonical package, never branch tips.
run([sys.executable, '-m', 'pytest', 'tests/test_generated_keys.py', 'tests/test_browser.py', '-q'], checkers)
if not (libs / 'node_modules').exists(): (libs / 'node_modules').symlink_to(ROOT / 'node_modules', target_is_directory=True)
run(['node', '--test', 'tests/generation.test.cjs', 'tests/generation-settings.test.cjs', 'tests/core.test.cjs', 'tests/policy.test.cjs'], libs)
run([sys.executable, 'scripts/check-locales.py'], libs)
run([sys.executable, 'scripts/sync-feedback-defaults.py', '--check'], libs)
shutil.copytree(workspace / 'ctm-assessment' / '_extensions', math / '_extensions', dirs_exist_ok=True)
for folder, files in record['extension_sha256'].items():
    for relative, digest in files.items():
        actual = hashlib.sha256((math / '_extensions' / folder / relative).read_bytes()).hexdigest()
        if actual != digest: raise RuntimeError('Installed package differs: ' + folder + '/' + relative)
if not (math / 'node_modules').exists(): (math / 'node_modules').symlink_to(ROOT / 'node_modules', target_is_directory=True)
run(['quarto', 'render', 'similar-problems.qmd'], math)
run([sys.executable, 'tests/build-similar-profiles.py'], math)
launch = {'args': ['--no-sandbox', '--disable-dev-shm-usage']}
if os.environ.get('CTM_BROWSER_EXECUTABLE'): launch['executablePath'] = os.environ['CTM_BROWSER_EXECUTABLE']
config = workspace / 'similar.playwright.mjs'
settings = {
    'testDir': str(math / 'tests' / 'browser'), 'testMatch': 'similar-problems.spec.mjs',
    'timeout': 120000, 'expect': {'timeout': 30000}, 'workers': 1,
    'reporter': [['list'], ['json', {'outputFile': str(workspace / 'similar-results.json')}]],
    'outputDir': str(workspace / 'similar-browser-artifacts'),
    'use': {'baseURL': 'http://127.0.0.1:4173', 'headless': True, 'launchOptions': launch, 'screenshot': 'only-on-failure', 'trace': 'retain-on-failure'},
    'webServer': {'command': shlex.join([sys.executable, '-m', 'http.server', '4173', '--bind', '127.0.0.1', '--directory', str(math / '_site')]), 'url': 'http://127.0.0.1:4173', 'reuseExistingServer': False, 'stdout': 'ignore', 'stderr': 'ignore'},
}
config.write_text('export default ' + json.dumps(settings) + ';\n')
run(['node', ROOT / 'node_modules/playwright/cli.js', 'test', '-c', config], math)
evidence = {
    'head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
    'tree': subprocess.check_output(['git', 'rev-parse', 'HEAD^{tree}'], cwd=ROOT, text=True).strip(),
    'repositories': record['repositories'], 'extension_sha256': record['extension_sha256'],
    'testbox_sha256': hashlib.sha256((math / 'similar-problems.qmd').read_bytes()).hexdigest(),
    'browser_results': 'similar-results.json', 'status': 'passed',
}
(workspace / 'similar-evidence.json').write_text(json.dumps(evidence, indent=2) + '\n')
print('Pinned generation stack passed; evidence: ' + str(workspace / 'similar-evidence.json'))
