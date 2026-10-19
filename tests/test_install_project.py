"""Course installer: review-ref parsing and the atomic replacement of owned extensions."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('install_project', Path(__file__).resolve().parents[1] / 'scripts/install-project.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)

KNOWN = {'ctm-libs', 'math-exercise', 'py-exercise', 'pyodide-interaktiv', 'jsxgraph', 'ctm-assessment'}
RENAMED = {'ai-feedback': 'ctm-libs'}
A, B = 'a' * 40, 'b' * 40

# Stands in for `quarto add DIST --no-prompt`: copies DIST/_extensions/* into
# ./_extensions, then behaves as FAKE_QUARTO says (ok, fail, corrupt).
FAKE_QUARTO = '''#!{python}
import os, shutil, sys
from pathlib import Path
mode = os.environ.get('FAKE_QUARTO', 'ok')
source = Path(sys.argv[2]) / '_extensions'
for folder in source.iterdir():
    shutil.copytree(folder, Path('_extensions') / folder.name, dirs_exist_ok=True)
    if mode == 'fail':
        sys.exit(1)  # after a partial copy
if mode == 'corrupt':
    (Path('_extensions') / 'math-exercise' / 'filter.lua').write_text('changed')
'''


class ReviewRefs(unittest.TestCase):
    def test_json_and_name_sha_forms_agree(self):
        expected = {'math-exercise': A, 'py-exercise': B}
        self.assertEqual(installer.parse_review_refs(json.dumps(expected), KNOWN), expected)
        self.assertEqual(installer.parse_review_refs(f'math-exercise={A},py-exercise={B}', KNOWN), expected)
        self.assertEqual(installer.parse_review_refs(f' math-exercise = {A} , py-exercise={B}, ', KNOWN), expected)

    def test_empty_means_no_overrides(self):
        for text in ('', '{}', '  '):
            self.assertEqual(installer.parse_review_refs(text, KNOWN), {})

    def test_ctm_assessment_is_rejected_in_both_forms(self):
        for text in (json.dumps({'ctm-assessment': A}), f'ctm-assessment={A}'):
            with self.assertRaisesRegex(installer.InstallError, 'always builds the checkout it is part of'):
                installer.parse_review_refs(text, KNOWN)

    def test_only_full_shas_of_known_components(self):
        for text, message in ((f'math-exercise={A[:7]}', 'full 40-character'),
                              (json.dumps({'math-exercise': 'main'}), 'full 40-character'),
                              (json.dumps({'math-exercise': 1}), 'full 40-character'),
                              (f'other={A}', 'unknown component'),
                              (f'math-exercise={A},math-exercise={B}', 'twice'),
                              ('math-exercise', 'not NAME=SHA'),
                              (json.dumps([A]), 'JSON object')):
            with self.subTest(text=text), self.assertRaisesRegex(installer.InstallError, message):
                installer.parse_review_refs(text, KNOWN)

    def test_json_with_quotes_stripped_by_powershell_points_to_the_other_form(self):
        with self.assertRaisesRegex(installer.InstallError, 'NAME=SHA'):
            installer.parse_review_refs('{math-exercise: ' + A + '}', KNOWN)

    def test_the_old_name_ai_feedback_is_read_as_ctm_libs(self):
        # ai-feedback became ctm-libs; course review refs keep working for 0.9.
        import contextlib, io
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(installer.parse_review_refs(f'ai-feedback={A}', KNOWN, RENAMED), {'ctm-libs': A})
            self.assertEqual(installer.parse_review_refs(json.dumps({'ai-feedback': A, 'math-exercise': B}), KNOWN, RENAMED),
                             {'ctm-libs': A, 'math-exercise': B})
        self.assertIn('ai-feedback is now part of ctm-libs', out.getvalue())
        with self.assertRaisesRegex(installer.InstallError, 'names ctm-libs twice'):
            installer.parse_review_refs(f'ai-feedback={A},ctm-libs={B}', KNOWN, RENAMED)
        with self.assertRaisesRegex(installer.InstallError, 'unknown component: ai-feedback'):
            installer.parse_review_refs(f'ai-feedback={A}', KNOWN)

    def test_the_manifest_declares_the_alias(self):
        self.assertEqual(installer.aliases(), RENAMED)
        self.assertEqual(installer.components(), KNOWN)

    def test_installer_rejects_ctm_assessment_before_building(self):
        with tempfile.TemporaryDirectory() as temp, \
                patch.object(sys, 'argv', ['install-project.py', '--project', temp, '--review-refs', f'ctm-assessment={A}']), \
                patch.object(installer.subprocess, 'run') as run:
            with self.assertRaises(SystemExit) as stop:
                installer.main()
            self.assertIn('cannot set ctm-assessment', str(stop.exception.code))
            run.assert_not_called()
            self.assertFalse((Path(temp) / '.private-extensions').exists())


class Release(unittest.TestCase):
    """--release vX.Y.Z: the checkout is that release, built from pins only."""

    def manifest(self, **changes):
        repositories = {name: {'commit': c * 40} for name, c in zip(sorted(KNOWN - {'ctm-assessment'}), 'abcde')}
        repositories['ctm-assessment'] = {'branch': 'main'}
        for name, spec in changes.items():
            repositories[name] = spec
        return {'repositories': repositories}

    def test_the_checkout_of_the_tag_passes(self):
        with patch.object(installer, 'package_version', return_value='0.9.0'), \
                patch.object(installer, 'manifest', return_value=self.manifest()):
            installer.check_release('v0.9.0')
            installer.check_release('0.9.0')

    def test_another_version_or_an_unpinned_component_stops(self):
        with patch.object(installer, 'package_version', return_value='0.9.0'), \
                patch.object(installer, 'manifest', return_value=self.manifest(**{'math-exercise': {'branch': 'main'}})):
            with self.assertRaisesRegex(installer.InstallError, 'version 0.9.0, not 0.9.1'):
                installer.check_release('v0.9.1')
            with self.assertRaisesRegex(installer.InstallError, 'math-exercise not pinned by commit'):
                installer.check_release('v0.9.0')
            with self.assertRaisesRegex(installer.InstallError, 'not a release tag'):
                installer.check_release('main')

    def test_this_checkout_has_a_version(self):
        self.assertRegex(installer.package_version(), r'^\d+\.\d+\.\d+')

    def test_a_release_cannot_take_review_refs_or_sources(self):
        for extra in (['--review-refs', f'math-exercise={A}'], ['--source', 'math-exercise=../math-exercise']):
            with self.subTest(extra=extra), tempfile.TemporaryDirectory() as temp, \
                    patch.object(sys, 'argv', ['install-project.py', '--project', temp, '--release', 'v0.9.0', *extra]), \
                    patch.object(installer.subprocess, 'run') as run:
                with self.assertRaises(SystemExit) as stop:
                    installer.main()
                self.assertIn('cannot be combined with --review-refs or --source', str(stop.exception.code))
                run.assert_not_called()


@unittest.skipIf(os.name == 'nt', 'the fake quarto is a POSIX script')
class AtomicReplacement(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        bin_dir = root / 'bin'
        bin_dir.mkdir()
        quarto = bin_dir / 'quarto'
        quarto.write_text(FAKE_QUARTO.format(python=sys.executable))
        quarto.chmod(0o755)
        path = patch.dict(os.environ, {'PATH': f'{bin_dir}{os.pathsep}{os.environ["PATH"]}'})
        path.start()
        self.addCleanup(path.stop)
        # The package: two owned extensions and their record.
        self.distribution = root / 'dist'
        files = {'ctm-assessment': {'_extension.yml': 'title: CTM'}, 'math-exercise': {'filter.lua': 'return {}', 'shared/x.js': 'new'},
                 'ctm-libs': {'_extension.yml': 'title: CTM libraries'}, 'ai-feedback': {'feedback-quarto.lua': 'alias'}}
        self.record = {'extension_sha256': {}}
        for name, contents in files.items():
            for relative, text in contents.items():
                target = self.distribution / '_extensions' / name / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(text)
            self.record['extension_sha256'][name] = {k: hashlib.sha256(v.encode()).hexdigest() for k, v in contents.items()}
        # The course: its own extension and an older copy of one owned extension.
        self.project = root / 'course'
        self.extensions = self.project / '_extensions'
        (self.extensions / 'my-own').mkdir(parents=True)
        (self.extensions / 'my-own' / '_extension.yml').write_text('title: mine')
        (self.extensions / 'math-exercise').mkdir()
        (self.extensions / 'math-exercise' / 'stale.txt').write_text('old')
        # The ai-feedback 0.8 folder of an earlier package: now the alias of ctm-libs.
        (self.extensions / 'ai-feedback').mkdir()
        (self.extensions / 'ai-feedback' / 'feedback-core.js').write_text('0.8.1')
        self.backup = self.project / '.private-extensions' / 'previous'

    def install(self, mode):
        with patch.dict(os.environ, {'FAKE_QUARTO': mode}):
            installer.replace_extensions(self.project, self.distribution, self.record, self.backup)

    def snapshot(self):
        return sorted(str(p.relative_to(self.extensions)) for p in self.extensions.rglob('*'))

    def test_success_replaces_owned_folders_and_drops_the_backup(self):
        self.install('ok')
        self.assertFalse((self.extensions / 'math-exercise' / 'stale.txt').exists())
        # Owned folders come from the record: ctm-libs and its alias replace the old ai-feedback.
        self.assertFalse((self.extensions / 'ai-feedback' / 'feedback-core.js').exists())
        self.assertEqual((self.extensions / 'ai-feedback' / 'feedback-quarto.lua').read_text(), 'alias')
        self.assertTrue((self.extensions / 'ctm-libs' / '_extension.yml').is_file())
        self.assertEqual((self.extensions / 'math-exercise' / 'shared' / 'x.js').read_text(), 'new')
        self.assertTrue((self.extensions / 'my-own' / '_extension.yml').is_file())
        self.assertFalse(self.backup.exists())

    def test_failed_quarto_add_restores_the_previous_extensions(self):
        before = self.snapshot()
        with self.assertRaisesRegex(installer.InstallError, 'quarto add failed.*restored'):
            self.install('fail')
        self.assertEqual(self.snapshot(), before)
        self.assertEqual((self.extensions / 'math-exercise' / 'stale.txt').read_text(), 'old')
        self.assertFalse(self.backup.exists())

    def test_hash_mismatch_restores_the_previous_extensions(self):
        before = self.snapshot()
        with self.assertRaisesRegex(installer.InstallError, 'differs from the package record: math-exercise/filter.lua.*restored'):
            self.install('corrupt')
        self.assertEqual(self.snapshot(), before)
        self.assertFalse(self.backup.exists())

    def test_missing_quarto_restores_the_previous_extensions(self):
        before = self.snapshot()
        with patch.dict(os.environ, {'PATH': ''}), self.assertRaisesRegex(installer.InstallError, 'could not run quarto add'):
            self.install('ok')
        self.assertEqual(self.snapshot(), before)

    def test_a_backup_left_by_an_interrupted_install_is_not_overwritten(self):
        (self.backup / 'math-exercise').mkdir(parents=True)
        with self.assertRaisesRegex(installer.InstallError, 'interrupted install'):
            self.install('ok')
        self.assertTrue((self.backup / 'math-exercise').is_dir())
        self.assertTrue((self.extensions / 'math-exercise' / 'stale.txt').is_file())


if __name__ == '__main__':
    unittest.main()
