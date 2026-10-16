"""Maintained dependencies advance; the temporary migration pin stays fixed."""
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('setup_feedback', Path(__file__).resolve().parents[1] / 'scripts/setup-feedback-integration.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class SourceSelection(unittest.TestCase):
    def test_manifest_only_pins_the_pyodide_migration(self):
        repositories = json.loads((builder.TEMPLATE / 'repos.json').read_text())['repositories']
        for name, source in repositories.items():
            with self.subTest(repository=name):
                if name == 'pyodide-interaktiv':
                    self.assertEqual(source['branch'], 'feature/shared-feedback-integration')
                    self.assertRegex(source['commit'], r'^[0-9a-f]{40}$')
                else:
                    self.assertEqual(source['branch'], 'main')
                    self.assertNotIn('commit', source)

    def test_main_is_resolved_again_on_each_build(self):
        source = {'repository': 'Erasmus-CTM/ai-feedback', 'branch': 'main'}
        with patch.object(builder.subprocess, 'check_output', side_effect=[
            'a' * 40 + '\trefs/heads/main\n', 'b' * 40 + '\trefs/heads/main\n'
        ]) as remote:
            self.assertEqual(builder.remote_revision('ai-feedback', source), 'a' * 40)
            self.assertEqual(builder.remote_revision('ai-feedback', source), 'b' * 40)
            self.assertEqual(remote.call_count, 2)

    def test_migration_pin_does_not_follow_its_branch(self):
        source = {'repository': 'Erasmus-CTM/pyodide-interaktiv', 'branch': 'feature/shared-feedback-integration', 'commit': 'c' * 40}
        with patch.object(builder.subprocess, 'check_output') as remote:
            self.assertEqual(builder.remote_revision('pyodide-interaktiv', source), 'c' * 40)
            remote.assert_not_called()

    def test_review_branch_is_explicit_and_does_not_change_defaults(self):
        source = {'repository': 'Erasmus-CTM/ai-feedback', 'branch': 'main'}
        with patch.object(builder.subprocess, 'check_output', return_value='d' * 40 + '\trefs/heads/review\n') as remote:
            self.assertEqual(builder.remote_revision('ai-feedback', source, 'review'), 'd' * 40)
            self.assertEqual(remote.call_args.args[0][-1], 'refs/heads/review')
            self.assertEqual(source['branch'], 'main')


if __name__ == '__main__':
    unittest.main()
