"""scripts/build-course.py: the pinned package of a course, and the migration preview (--convert)."""
import contextlib
import importlib.util
import io
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/build-course.py'
FIXTURE = ROOT / 'integration/step4-course'


def load():
    spec = importlib.util.spec_from_file_location('build_course', SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class BuildCourse(unittest.TestCase):
    def setUp(self):
        self.module = load()

    def test_the_pinned_ref_of_a_course(self):
        ingmat3a = ('plugins:\n  - name: ctm-assessment\n    repo: https://github.com/Erasmus-CTM/ctm-assessment.git\n'
                    '    # Pinned during the step-4 migration.\n    ref: 9ed46a449f41518d98fbd1b0964f6b3dce1ba0d7\n')
        demo = ('plugins:\n- name: ctm-assessment\n  repo: https://github.com/Erasmus-CTM/ctm-assessment.git\n'
                '  ref: main\n  path: _extensions/ctm-assessment\n')
        self.assertEqual(self.module.pinned(ingmat3a), '9ed46a449f41518d98fbd1b0964f6b3dce1ba0d7')
        self.assertEqual(self.module.pinned(demo), 'main')
        self.assertEqual(self.module.pinned('plugins:\n  - name: other\n    ref: v1\n'), 'main')
        self.assertEqual(self.module.pinned(''), 'main')

    def test_pin_of_a_course_folder(self):
        out = io.StringIO()
        argv = sys.argv
        try:
            sys.argv = ['build-course.py', '--path', str(FIXTURE), '--pin']
            with contextlib.redirect_stdout(out):
                self.module.main()
        finally:
            sys.argv = argv
        self.assertRegex(out.getvalue().strip(), r'^[0-9a-f]{40}$')

    def test_convert_previews_the_migration_with_the_course_hand_edits(self):
        with tempfile.TemporaryDirectory() as temp:
            dest = Path(temp) / 'course'
            shutil.copytree(FIXTURE, dest)
            with contextlib.redirect_stdout(io.StringIO()):
                self.module.convert(dest)
            config = (dest / '_quarto.yml').read_text(encoding='utf-8')
            self.assertIn('- path: _extensions/ctm-assessment/tab-ids.lua', config)
            self.assertNotIn('include-after-body', config)
            self.assertNotIn('<details', (dest / '_includes/uke1.md').read_text(encoding='utf-8'))
            self.assertEqual((dest / 'styles.css').read_text(encoding='utf-8'),
                             (FIXTURE / 'migrated/styles.css').read_text(encoding='utf-8'))
            self.assertFalse((dest / 'migrated').exists())


if __name__ == '__main__':
    unittest.main()
