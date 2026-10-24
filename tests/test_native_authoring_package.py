"""Produced native package travels with installed extension, outside its wheel."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('builder_native', ROOT / 'scripts/setup-feedback-integration.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

class NativePackageTests(unittest.TestCase):
    def fixture_producer(self, root, *, fail_check=False):
        """Exercise the real subprocess seam without an external checkout.

        Canonical checker distribution contents belong to that producer's own
        suite. This contract verifies installer arguments, mandatory checking,
        complete file accounting and browser-payload isolation.
        """
        checker = root / 'source-checkers'
        producer = checker / 'tools' / 'build_authoring.py'
        producer.parent.mkdir(parents=True)
        producer.write_text('''import argparse, hashlib, json
from pathlib import Path
p = argparse.ArgumentParser()
p.add_argument('--install-extension', required=True, type=Path)
p.add_argument('--check', action='store_true')
a = p.parse_args()
assert (a.install_extension / 'checkers.json').is_file()
assert (a.install_extension / '_extension.yml').is_file()
log = Path(__file__).resolve().parents[1] / 'calls.jsonl'
with log.open('a') as f:
    f.write(json.dumps({'extension': str(a.install_extension), 'check': a.check}) + '\\n')
files = {'ctm-variants.py': b'# fixture launcher\\n',
         'ctm_variants/orchestration.py': b'# fixture native module\\n',
         'LICENSE': b'fixture license\\n'}
report = {'version': 1, 'files': {name: {'sha256': hashlib.sha256(data).hexdigest()}
                                for name, data in files.items()}}
files['native.json'] = (json.dumps(report, sort_keys=True) + '\\n').encode()
destination = a.install_extension / 'native-authoring'
if a.check:
    assert not FAIL_CHECK, 'fixture rejects produced output'
    assert {p.relative_to(destination).as_posix(): p.read_bytes()
            for p in destination.rglob('*') if p.is_file()} == files
else:
    for name, data in files.items():
        path = destination / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
'''.replace('FAIL_CHECK', repr(fail_check)))
        return checker

    def installed_extension(self, root):
        extension = root / 'ctm-checkers'
        extension.mkdir()
        (extension / 'checkers.json').write_text('{}\n')
        (extension / '_extension.yml').write_text('title: fixture checker\n')
        (extension / 'checker.whl').write_bytes(b'unchanged browser payload')
        return extension

    def test_producer_and_checked_file_record_leave_browser_payload_unchanged(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            checker = self.fixture_producer(root)
            extension = self.installed_extension(root)
            wheel = extension / 'checker.whl'
            before = {p.name: p.read_bytes() for p in extension.iterdir()}
            hashes = {'ctm-checkers': {'checker.whl': hashlib.sha256(wheel.read_bytes()).hexdigest()}}
            builder.produce_native_authoring({'ctm-checkers': checker}, root, hashes)
            native = extension / 'native-authoring'
            self.assertTrue((native / 'ctm-variants.py').is_file())
            self.assertEqual(wheel.read_bytes(), b'unchanged browser payload')
            self.assertEqual(hashes['ctm-checkers']['native-authoring/native.json'],
                             hashlib.sha256((native / 'native.json').read_bytes()).hexdigest())
            self.assertIn('native-authoring/ctm_variants/orchestration.py', hashes['ctm-checkers'])
            self.assertEqual(before, {p.name: p.read_bytes() for p in extension.iterdir() if p.is_file()})
            produced = {p.relative_to(extension).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
                        for p in native.rglob('*') if p.is_file()}
            self.assertEqual({key: value for key, value in hashes['ctm-checkers'].items()
                              if key.startswith('native-authoring/')}, produced)
            calls = [json.loads(line) for line in (checker / 'calls.jsonl').read_text().splitlines()]
            self.assertEqual(calls, [{'extension': str(extension), 'check': False},
                                     {'extension': str(extension), 'check': True}])

    def test_failed_canonical_verification_stops_install(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            checker = self.fixture_producer(root, fail_check=True)
            extension = self.installed_extension(root)
            hashes = {'ctm-checkers': {}}
            with self.assertRaises(subprocess.CalledProcessError):
                builder.produce_native_authoring({'ctm-checkers': checker}, root, hashes)
            self.assertEqual(hashes, {'ctm-checkers': {}})
            self.assertEqual((extension / 'checker.whl').read_bytes(), b'unchanged browser payload')

    def test_older_checker_without_new_component_wrapper_keeps_existing_install_path(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            hashes = {'ctm-checkers': {}}
            builder.produce_native_authoring({'ctm-checkers': root / 'old-checker'}, root, hashes)
            self.assertEqual(hashes, {'ctm-checkers': {}})
            self.assertFalse((root / 'ctm-checkers').exists())

    def test_new_component_cannot_silently_use_old_checker_without_native_producer(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            math = root / 'math-exercise'
            math.mkdir()
            (math / 'question-variants.py').write_text('# thin wrapper\n')
            with self.assertRaisesRegex(SystemExit, 'requires the canonical'):
                builder.produce_native_authoring({'ctm-checkers': root / 'old-checker'}, root, {})

if __name__ == '__main__':
    unittest.main()
