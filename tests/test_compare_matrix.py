"""tools/ci/compare-matrix.py: the comparisons of the workflow "Compare rendered courses"."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'tools/ci/compare-matrix.py'


def load():
    spec = importlib.util.spec_from_file_location('compare_matrix', SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


COURSES = [{'course': 'examples', 'ref': '', 'profile': ''},
           {'course': 'aacchhee/ctm-demo', 'ref': 'main', 'profile': 'review', 'informational': False},
           {'course': 'aacchhee/ingmat3a_ntnu', 'ref': 'main', 'profile': '', 'informational': False},
           {'course': 'aacchhee/ingmat3a_ntnu', 'ref': 'linalg-branch', 'profile': '', 'informational': True}]


class CompareMatrix(unittest.TestCase):
    def setUp(self):
        self.module = load()
        self.module.courses = lambda: [dict(entry) for entry in COURSES]

    def run_main(self, **env):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / 'output'
            old = dict(os.environ)
            try:
                os.environ.update({'GITHUB_OUTPUT': str(output), **env})
                with contextlib.redirect_stdout(io.StringIO()):
                    self.module.main()
            finally:
                os.environ.clear()
                os.environ.update(old)
            values = dict(line.split('=', 1) for line in output.read_text().splitlines())
            self.engines = json.loads(values['engines'])
            return json.loads(values['matrix']), json.loads(values['browsers'])

    def test_pull_requests_compare_the_courses_pinned_package_and_the_fixture_migration(self):
        matrix, browsers = self.run_main(EVENT='pull_request')
        by_key = {entry['key']: entry for entry in matrix}
        self.assertEqual(sorted(by_key), ['ctm-demo-main-review', 'examples', 'ingmat3a_ntnu-linalg-branch', 'ingmat3a_ntnu-main', 'step4-course'])
        self.assertEqual(by_key['examples']['base'], '', 'the example site: the pull request base')
        for name in ('ctm-demo-main-review', 'ingmat3a_ntnu-main', 'ingmat3a_ntnu-linalg-branch'):
            self.assertEqual(by_key[name]['base'], 'pin', name + ': before = the package the course pins')
            self.assertFalse(by_key[name]['convert'], name + ': the course on its own sources')
        self.assertTrue(by_key['ingmat3a_ntnu-linalg-branch']['informational'])
        fixture = by_key['step4-course']
        self.assertEqual((fixture['path'], fixture['base'], fixture['convert'], fixture['expect'], fixture['browser']),
                         ('integration/step4-course', 'pin', True, 'step4-migration.yml', True))
        self.assertEqual([entry['key'] for entry in browsers], ['step4-course'])
        self.assertEqual(self.engines, ['chromium', 'firefox', 'webkit'])

    def test_a_dispatch_describes_one_comparison(self):
        matrix, browsers = self.run_main(EVENT='workflow_dispatch', COURSE='aacchhee/ctm-demo', COURSE_REF='step4/migrate',
                                         COURSE_BASE_REF='main', BASE='pin', HEAD='', CONVERT='false',
                                         EXPECT='step4-migration.yml', BROWSER='true')
        self.assertEqual(len(matrix), 1)
        entry = matrix[0]
        self.assertEqual((entry['ref'], entry['base_ref'], entry['base'], entry['head'], entry['key']),
                         ('step4/migrate', 'main', 'pin', '', 'ctm-demo-step4-migrate'))
        self.assertEqual([{k: v for k, v in e.items() if k not in ('shard', 'part')} for e in browsers], matrix)
        self.assertEqual(browsers[0]['shard'], '', 'one part')
        self.run_main(EVENT='workflow_dispatch', COURSE='aacchhee/ctm-demo', BROWSER='true', BROWSERS='webkit nonsense')
        self.assertEqual(self.engines, ['webkit'])
        matrix, _ = self.run_main(EVENT='workflow_dispatch', COURSE='examples', BASE='pin')
        self.assertEqual(matrix[0]['base'], '', 'the example site pins nothing')
        matrix, _ = self.run_main(EVENT='workflow_dispatch', COURSE='step4-course', BASE='pin', CONVERT='true')
        self.assertEqual((matrix[0]['path'], matrix[0]['ref']), ('integration/step4-course', ''))

    def test_large_courses_run_their_browser_comparison_in_parts(self):
        # Every part is a job per browser (compare-browser.mjs --shard), review A2b S4.
        _, browsers = self.run_main(EVENT='workflow_dispatch', COURSE='aacchhee/ingmat3a_ntnu', COURSE_REF='linalg-branch', BROWSER='true')
        self.assertEqual([(e['shard'], e['part']) for e in browsers], [(f'{k}/4', f'-part{k}of4') for k in range(1, 5)])
        _, browsers = self.run_main(EVENT='workflow_dispatch', COURSE='aacchhee/ingmat3a_ntnu', COURSE_REF='main', BROWSER='true')
        self.assertEqual([e['shard'] for e in browsers], ['1/2', '2/2'])
        _, browsers = self.run_main(EVENT='workflow_dispatch', COURSE='aacchhee/ingmat3a_ntnu', COURSE_REF='064aefa', BROWSER='true', SHARDS='3')
        self.assertEqual([e['shard'] for e in browsers], ['1/3', '2/3', '3/3'])
        _, browsers = self.run_main(EVENT='workflow_dispatch', COURSE='aacchhee/ctm-demo', BROWSER='true')
        self.assertEqual([e['shard'] for e in browsers], [''])


if __name__ == '__main__':
    unittest.main()
