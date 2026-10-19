"""integration/pyodide-parity/build-corpora.py: the one course list (corpora.json) and its branches."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'integration/pyodide-parity/build-corpora.py'


def load():
    spec = importlib.util.spec_from_file_location('build_corpora', SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class BuildCorpora(unittest.TestCase):
    def setUp(self):
        self.module = load()
        self.tips = {}
        self.module.branch_tip = lambda spec: self.tips.get(spec['course']['branch'])

    def run_quietly(self, function, *args):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            result = function(*args)
        return result, out.getvalue()

    def test_the_course_list_has_the_courses_and_ingmat3a_linalg_branch(self):
        courses = {name: spec['course'] for name, spec in self.module.COURSES.items()}
        self.assertEqual(courses['ctm-demo']['profiles'], ['review'])
        self.assertEqual(courses['ingmat3a-linalg'], {'branch': 'linalg-branch', 'optional': True})
        self.assertNotIn('commit', self.module.COURSES['ingmat3a-linalg'], 'it follows its branch')

    def test_pinned_courses_keep_their_commit_and_a_followed_branch_gives_its_tip(self):
        self.tips['linalg-branch'] = 'a' * 40
        refs, _ = self.run_quietly(self.module.resolve, {'ingmat3a': 'abcdef1'})
        self.assertEqual(refs['ctm-demo'], self.module.COURSES['ctm-demo']['commit'])
        self.assertEqual(refs['ingmat3a'], 'abcdef1')
        self.assertEqual(refs['ingmat3a-linalg'], 'a' * 40)

    def test_an_optional_course_whose_branch_is_gone_is_skipped_with_a_notice(self):
        refs, out = self.run_quietly(self.module.resolve, {})
        self.assertIsNone(refs['ingmat3a-linalg'])
        self.assertIn('::notice title=Course skipped::ingmat3a-linalg: branch linalg-branch', out)
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / 'output'
            os.environ['GITHUB_OUTPUT'] = str(output)
            try:
                _, out = self.run_quietly(self.module.course_matrix)
            finally:
                del os.environ['GITHUB_OUTPUT']
            matrix = json.loads(output.read_text().removeprefix('matrix='))
        self.assertIn('::notice title=Course skipped::', out)
        self.assertEqual([(m['course'], m['ref']) for m in matrix],
                         [('examples', ''), ('aacchhee/ctm-demo', 'main'), ('aacchhee/ingmat3a_ntnu', 'main')])

    def test_the_blocking_jobs_build_the_pinned_courses_and_a_followed_branch_is_informational(self):
        self.assertEqual(list(self.module.selection('pinned')), ['ctm-demo', 'ingmat3a'])
        self.assertEqual(list(self.module.selection('following')), ['ingmat3a-linalg'])
        self.tips['linalg-branch'] = 'b' * 40
        refs, _ = self.run_quietly(self.module.resolve, {'ingmat3a-linalg': 'abcdef1'}, self.module.selection('pinned'))
        self.assertEqual(set(refs), {'ctm-demo', 'ingmat3a'}, 'an override for a course outside the set is ignored')
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / 'output'
            os.environ['GITHUB_OUTPUT'] = str(output)
            try:
                self.run_quietly(self.module.course_matrix)
            finally:
                del os.environ['GITHUB_OUTPUT']
            matrix = json.loads(output.read_text().removeprefix('matrix='))
        self.assertEqual([m.get('informational') for m in matrix], [None, False, False, True])

    def test_a_course_that_is_not_optional_fails_when_its_branch_is_gone(self):
        self.module.COURSES['ingmat3a-linalg'] = dict(self.module.COURSES['ingmat3a-linalg'], course={'branch': 'linalg-branch'})
        with self.assertRaises(SystemExit):
            self.run_quietly(self.module.resolve, {})


if __name__ == '__main__':
    unittest.main()
