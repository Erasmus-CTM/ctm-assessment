"""tools/ci/review-dependencies.py, the one copy every CTM repository's CI uses."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'tools/ci/review-dependencies.py'
SHA = {'ctm-libs': '1' * 40, 'ctm-checkers': '2' * 40}


class ReviewDependencies(unittest.TestCase):
    def run_script(self, message, ref='refs/pull/1/merge'):
        with tempfile.TemporaryDirectory() as temp:
            repo = Path(temp) / 'repo'
            subprocess.run(['git', 'init', '-q', str(repo)], check=True)
            subprocess.run(['git', '-C', str(repo), '-c', 'user.name=t', '-c', 'user.email=t@example.org',
                            'commit', '-q', '--allow-empty', '-m', message], check=True)
            env_file, output_file = Path(temp) / 'env', Path(temp) / 'output'
            env = dict(os.environ, GITHUB_ENV=str(env_file), GITHUB_OUTPUT=str(output_file), GITHUB_REF=ref)
            env.pop('REVIEW_COMMIT', None)
            result = subprocess.run([sys.executable, str(SCRIPT)], cwd=repo, env=env, capture_output=True, text=True)
            written = env_file.read_text() if env_file.exists() else ''
            outputs = output_file.read_text() if output_file.exists() else ''
            return result, written, outputs

    def test_a_trailer_names_dependency_commits_including_ctm_checkers(self):
        result, env, outputs = self.run_script('Change\n\nCTM-Review-Refs: ' + json.dumps(SHA))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(env.split('=', 1)[1]), SHA)
        self.assertIn('ctm-checkers=' + SHA['ctm-checkers'], outputs)

    def test_the_old_name_is_read_as_ctm_libs(self):
        result, env, _ = self.run_script('Change\n\nCTM-Review-Refs: {"ai-feedback": "%s"}' % SHA['ctm-libs'])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(env.split('=', 1)[1]), {'ctm-libs': SHA['ctm-libs']})

    def test_main_ignores_the_trailer(self):
        result, env, _ = self.run_script('Change\n\nCTM-Review-Refs: ' + json.dumps(SHA), ref='refs/heads/main')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(env.split('=', 1)[1]), {})

    def test_unknown_names_and_short_shas_stop(self):
        for refs in ({'stack-sympy': '3' * 40}, {'ctm-libs': 'abc1234'}):
            with self.subTest(refs=refs):
                result, _, _ = self.run_script('Change\n\nCTM-Review-Refs: ' + json.dumps(refs))
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('Review refs must map known dependencies to full commit SHAs', result.stderr)


if __name__ == '__main__':
    unittest.main()
