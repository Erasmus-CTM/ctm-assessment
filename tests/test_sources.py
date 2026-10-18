"""Every component is pinned by commit; branch tips are only an explicit choice."""
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('setup_feedback', Path(__file__).resolve().parents[1] / 'scripts/setup-feedback-integration.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class SourceSelection(unittest.TestCase):
    def test_manifest_pins_every_component_by_commit(self):
        repositories = json.loads((builder.TEMPLATE / 'repos.json').read_text())['repositories']
        self.assertEqual(set(repositories), {'ai-feedback', 'py-exercise', 'math-exercise', 'pyodide-interaktiv', 'jsxgraph', 'ctm-assessment'})
        self.assertEqual(repositories['jsxgraph']['repository'], 'jsxgraph/jsxgraph-quarto')
        self.assertEqual(repositories['jsxgraph']['extension'], 'jsxgraph')
        for name, source in repositories.items():
            with self.subTest(repository=name):
                self.assertTrue(source['branch'])
                if name == 'ctm-assessment':
                    self.assertNotIn('commit', source)
                else:
                    self.assertRegex(source['commit'], r'^[0-9a-f]{40}$')

    def test_branch_tips_are_resolved_only_when_following_branches(self):
        source = {'repository': 'Erasmus-CTM/ai-feedback', 'branch': 'main', 'commit': 'c' * 40}
        with patch.object(builder.subprocess, 'check_output', side_effect=[
            'a' * 40 + '\trefs/heads/main\n', 'b' * 40 + '\trefs/heads/main\n'
        ]) as remote:
            self.assertEqual(builder.remote_revision('ai-feedback', source), 'c' * 40)
            remote.assert_not_called()
            self.assertEqual(builder.remote_revision('ai-feedback', source, follow=True), 'a' * 40)
            self.assertEqual(builder.remote_revision('ai-feedback', source, follow=True), 'b' * 40)
            self.assertEqual(remote.call_count, 2)

    def test_migration_pin_does_not_follow_its_branch(self):
        source = {'repository': 'Erasmus-CTM/pyodide-interaktiv', 'branch': 'feature/shared-feedback-integration', 'commit': 'c' * 40}
        with patch.object(builder.subprocess, 'check_output') as remote:
            self.assertEqual(builder.remote_revision('pyodide-interaktiv', source), 'c' * 40)
            remote.assert_not_called()

    def test_explicit_review_sha_is_used_without_resolving_a_branch(self):
        source = {'repository': 'Erasmus-CTM/ai-feedback', 'branch': 'main'}
        with patch.object(builder.subprocess, 'check_output') as remote:
            self.assertEqual(builder.remote_revision('ai-feedback', source, 'd' * 40), 'd' * 40)
            remote.assert_not_called()

    def test_review_branch_is_explicit_and_does_not_change_defaults(self):
        source = {'repository': 'Erasmus-CTM/ai-feedback', 'branch': 'main'}
        with patch.object(builder.subprocess, 'check_output', return_value='d' * 40 + '\trefs/heads/review\n') as remote:
            self.assertEqual(builder.remote_revision('ai-feedback', source, 'review'), 'd' * 40)
            self.assertEqual(remote.call_args.args[0][-1], 'refs/heads/review')
            self.assertEqual(source['branch'], 'main')

    def test_vendored_copies_are_found_in_every_layout(self):
        import tempfile
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for path in ['_extensions/math-exercise/_extension.yml', '_extensions/math-exercise/math-exercise.lua',
                         '_extensions/Erasmus-CTM/ai-feedback/_extension.yml', '_extensions/jsxgraph/_extension.yml',
                         '_extensions/math-exercise/_extensions/jsxgraph/lua/jsxgraph.lua']:
                (root / path).parent.mkdir(parents=True, exist_ok=True)
                (root / path).write_text('x')
            shipped = builder.tracked_extensions(root, False, 'math-exercise')
            self.assertEqual(shipped - {'math-exercise'}, {'ai-feedback', 'jsxgraph', 'nested-_extensions-in-math-exercise'})

    def test_only_declared_distribution_copies_are_allowed(self):
        repositories = json.loads((builder.TEMPLATE / 'repos.json').read_text())['repositories']
        declared = {name: spec['ships-copies'] for name, spec in repositories.items() if 'ships-copies' in spec}
        self.assertEqual(declared, {'pyodide-interaktiv': ['ai-feedback']})

    def test_update_pins_refuses_a_tip_without_the_pinned_commit(self):
        with patch.object(builder, 'remote_revision', return_value='f' * 40), \
             patch.object(builder, 'descends', return_value=False), \
             patch.object(builder.Path, 'write_text') as write, \
             patch('sys.argv', ['setup', '--update-pins']):
            with self.assertRaises(SystemExit) as stop:
                builder.main()
            self.assertIn('does not contain the pinned', str(stop.exception))
            write.assert_not_called()


if __name__ == '__main__':
    unittest.main()
