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
        self.assertEqual(set(repositories), {'ctm-libs', 'py-exercise', 'math-exercise', 'pyodide-interaktiv', 'jsxgraph', 'ctm-assessment'})
        self.assertEqual(repositories['jsxgraph']['repository'], 'jsxgraph/jsxgraph-quarto')
        self.assertEqual(repositories['jsxgraph']['extension'], 'jsxgraph')
        # ai-feedback became ctm-libs: one repository, its library and the alias extension.
        self.assertEqual(repositories['ctm-libs']['repository'], 'Erasmus-CTM/ctm-libs')
        self.assertEqual(repositories['ctm-libs']['extensions'], ['ctm-libs', 'ai-feedback'])
        self.assertEqual(repositories['ctm-libs']['review-ref-aliases'], ['ai-feedback'])
        for name, source in repositories.items():
            with self.subTest(repository=name):
                self.assertTrue(source['branch'])
                if name == 'ctm-assessment':
                    self.assertNotIn('commit', source)
                else:
                    self.assertRegex(source['commit'], r'^[0-9a-f]{40}$')

    def test_branch_tips_are_resolved_only_when_following_branches(self):
        source = {'repository': 'Erasmus-CTM/ctm-libs', 'branch': 'main', 'commit': 'c' * 40}
        with patch.object(builder.subprocess, 'check_output', side_effect=[
            'a' * 40 + '\trefs/heads/main\n', 'b' * 40 + '\trefs/heads/main\n'
        ]) as remote:
            self.assertEqual(builder.remote_revision('ctm-libs', source), 'c' * 40)
            remote.assert_not_called()
            self.assertEqual(builder.remote_revision('ctm-libs', source, follow=True), 'a' * 40)
            self.assertEqual(builder.remote_revision('ctm-libs', source, follow=True), 'b' * 40)
            self.assertEqual(remote.call_count, 2)

    def test_migration_pin_does_not_follow_its_branch(self):
        source = {'repository': 'Erasmus-CTM/pyodide-interaktiv', 'branch': 'feature/shared-feedback-integration', 'commit': 'c' * 40}
        with patch.object(builder.subprocess, 'check_output') as remote:
            self.assertEqual(builder.remote_revision('pyodide-interaktiv', source), 'c' * 40)
            remote.assert_not_called()

    def test_explicit_review_sha_is_used_without_resolving_a_branch(self):
        source = {'repository': 'Erasmus-CTM/ctm-libs', 'branch': 'main'}
        with patch.object(builder.subprocess, 'check_output') as remote:
            self.assertEqual(builder.remote_revision('ctm-libs', source, 'd' * 40), 'd' * 40)
            remote.assert_not_called()

    def test_review_branch_is_explicit_and_does_not_change_defaults(self):
        source = {'repository': 'Erasmus-CTM/ctm-libs', 'branch': 'main'}
        with patch.object(builder.subprocess, 'check_output', return_value='d' * 40 + '\trefs/heads/review\n') as remote:
            self.assertEqual(builder.remote_revision('ctm-libs', source, 'review'), 'd' * 40)
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

    def test_update_pins_only_repins_the_named_repositories(self):
        # After the consolidation merges: re-pin ctm-libs, math-exercise and
        # py-exercise; the JSXGraph fork pin (not on upstream main) and
        # pyodide-interaktiv stay as they are. The old name ai-feedback is read as ctm-libs.
        before = json.loads((builder.TEMPLATE / 'repos.json').read_text())
        tips = {'ctm-libs': 'a' * 40, 'math-exercise': 'b' * 40, 'py-exercise': 'c' * 40}
        resolved = []
        def tip(name, spec, review_ref=None, follow=False):
            resolved.append(name)
            return tips[name]
        with patch.object(builder, 'remote_revision', side_effect=tip), \
             patch.object(builder, 'descends', return_value=True), \
             patch.object(builder.Path, 'write_text') as write, \
             patch('sys.argv', ['setup', '--update-pins', '--only', 'ai-feedback, math-exercise,py-exercise']):
            builder.main()
        self.assertEqual(sorted(resolved), sorted(tips))
        written = json.loads(write.call_args.args[0])['repositories']
        for name, spec in before['repositories'].items():
            with self.subTest(repository=name):
                self.assertEqual(written[name].get('commit'), tips.get(name, spec.get('commit')))
                self.assertEqual({k: v for k, v in written[name].items() if k != 'commit'},
                                 {k: v for k, v in spec.items() if k != 'commit'})

    def test_following_branches_keeps_a_pin_outside_its_branch(self):
        # The JSXGraph pin is the fork commit of upstream pull request #2, not
        # on upstream main: the weekly tracking build keeps it, with a log line.
        import contextlib, io
        spec = {'repository': 'jsxgraph/jsxgraph-quarto', 'branch': 'main', 'commit': 'c' * 40}
        out = io.StringIO()
        with patch.object(builder, 'remote_revision', return_value='a' * 40) as remote, \
             patch.object(builder, 'descends', return_value=False) as descends, contextlib.redirect_stdout(out):
            self.assertEqual(builder.followed_revision('jsxgraph', spec), ('c' * 40, True))
        remote.assert_called_once_with('jsxgraph', spec, follow=True)
        descends.assert_called_once_with('jsxgraph/jsxgraph-quarto', 'c' * 40, 'a' * 40)
        self.assertIn(f'jsxgraph: main @ {"a" * 40} does not contain the pinned {"c" * 40}; following keeps the pin', out.getvalue())
        # A branch that contains its pin is followed; a tip equal to the pin needs no check.
        with patch.object(builder, 'remote_revision', return_value='a' * 40), patch.object(builder, 'descends', return_value=True):
            self.assertEqual(builder.followed_revision('ctm-libs', dict(spec, repository='Erasmus-CTM/ctm-libs')), ('a' * 40, False))
        with patch.object(builder, 'remote_revision', return_value='c' * 40), patch.object(builder, 'descends') as descends:
            self.assertEqual(builder.followed_revision('jsxgraph', spec), ('c' * 40, False))
            descends.assert_not_called()

    def test_follow_branches_builds_the_tips_and_the_kept_pin(self):
        import tempfile
        config = json.loads((builder.TEMPLATE / 'repos.json').read_text())['repositories']
        built = {}

        class Resolved(Exception):
            pass

        def followed(name, spec):
            return (spec['commit'], True) if name == 'jsxgraph' else ('a' * 40, False)

        def snapshot(repository, sha, cache):
            built[repository] = sha
            if len(built) == len(config) - 1:  # every repository but this checkout
                raise Resolved()
            return Path(cache)
        with tempfile.TemporaryDirectory() as temp, \
             patch.object(builder, 'followed_revision', side_effect=followed) as follow, \
             patch.object(builder, 'remote_revision') as remote, \
             patch.object(builder, 'snapshot', side_effect=snapshot), \
             patch.object(builder.subprocess, 'check_output', return_value='1.8.27'), \
             patch('sys.argv', ['setup', '--follow-branches', '--workspace', temp]):
            with self.assertRaises(Resolved):
                builder.main()
        remote.assert_not_called()
        self.assertEqual(sorted(call.args[0] for call in follow.call_args_list), sorted(set(config) - {'ctm-assessment'}))
        self.assertEqual(built['jsxgraph/jsxgraph-quarto'], config['jsxgraph']['commit'])
        self.assertEqual(built['Erasmus-CTM/ctm-libs'], 'a' * 40)

    def test_only_needs_update_pins_and_known_names(self):
        for argv, message in ((['--only', 'ctm-libs'], 'use it with --update-pins'),
                              (['--update-pins', '--only', 'jsxgraph-fork'], 'jsxgraph-fork'),
                              (['--update-pins', '--only', 'ctm-assessment'], 'ctm-assessment'),
                              (['--update-pins', '--only', ','], 'none given')):
            with self.subTest(argv=argv), patch.object(builder, 'remote_revision') as remote, \
                    patch.object(builder.Path, 'write_text') as write, patch('sys.argv', ['setup', *argv]):
                with self.assertRaises(SystemExit) as stop:
                    builder.main()
                self.assertIn(message, str(stop.exception))
                remote.assert_not_called()
                write.assert_not_called()

    def test_ctm_libs_owns_its_library_and_the_alias(self):
        config = json.loads((builder.TEMPLATE / 'repos.json').read_text())
        folders = builder.extension_folders(config)
        self.assertEqual(folders['ctm-libs'], ['ctm-libs', 'ai-feedback'])
        self.assertEqual(folders['jsxgraph'], ['jsxgraph'])
        self.assertEqual(folders['math-exercise'], ['math-exercise'])
        clash = {'repositories': {'a': {'extensions': ['x', 'y']}, 'b': {'extension': 'y'}}}
        with self.assertRaisesRegex(SystemExit, 'both own the extension folder y'):
            builder.extension_folders(clash)

    def test_the_old_name_is_an_alias_with_one_notice(self):
        import contextlib, io
        config = json.loads((builder.TEMPLATE / 'repos.json').read_text())
        notices, out = set(), io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(builder.canonical_name('ai-feedback', config, '--source', notices), 'ctm-libs')
            self.assertEqual(builder.canonical_name('ai-feedback', config, '--ref', notices), 'ctm-libs')
            self.assertEqual(builder.canonical_name('math-exercise', config, '--source', notices), 'math-exercise')
            self.assertEqual(builder.canonical_name('unknown', config, '--source', notices), 'unknown')
        self.assertEqual(out.getvalue().count('ai-feedback is now part of ctm-libs'), 1)

    def test_nested_copies_are_found_in_every_own_folder(self):
        import tempfile
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for path in ['_extensions/ctm-libs/_extension.yml', '_extensions/ai-feedback/_extension.yml',
                         '_extensions/ai-feedback/_extensions/math-exercise/_extension.yml']:
                (root / path).parent.mkdir(parents=True, exist_ok=True)
                (root / path).write_text('x')
            shipped = builder.tracked_extensions(root, False, ['ctm-libs', 'ai-feedback'])
            self.assertEqual(shipped - {'ctm-libs', 'ai-feedback'}, {'math-exercise', 'nested-_extensions-in-ai-feedback'})


    def test_snapshot_uses_short_names_and_drops_the_archive_root(self):
        # A GitHub archive has one top folder, <repo>-<sha>/; the snapshot keeps
        # only its contents under <repo>-<sha[:12]> (Windows path length).
        import io, shutil, tarfile, tempfile
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            sha, other = 'ab' * 20, 'ab' * 6 + 'cd' * 14
            def archive(commit):
                data = io.BytesIO()
                with tarfile.open(fileobj=data, mode='w:gz') as tar:
                    for name, text in ((f'repo-{commit}/_extensions/x/_extension.yml', commit), (f'repo-{commit}/LICENSE', 'L')):
                        info = tarfile.TarInfo(name)
                        info.size = len(text)
                        tar.addfile(info, io.BytesIO(text.encode()))
                return data.getvalue()
            archives = {sha: archive(sha), other: archive(other)}
            fetched = []
            def download(url, target):
                fetched.append(url)
                target.write_bytes(archives[url.rsplit('/', 1)[1]])
            cache = root / 'src'
            cache.mkdir()
            with patch.object(builder, 'download', side_effect=download):
                target = builder.snapshot('Org/repo', sha, cache)
                self.assertEqual(target, cache / ('repo-' + sha[:12]))
                self.assertEqual((target / '_extensions/x/_extension.yml').read_text(), sha)
                self.assertEqual(json.loads((target / '.integration-source.json').read_text())['commit'], sha)
                self.assertEqual(sorted(p.name for p in cache.iterdir()), [target.name])
                builder.snapshot('Org/repo', sha, cache)
                self.assertEqual(len(fetched), 1)  # cached
                # Same short name, other commit: replaced, never reused.
                self.assertEqual(builder.snapshot('Org/repo', other, cache), target)
                self.assertEqual((target / '_extensions/x/_extension.yml').read_text(), other)
                self.assertEqual(len(fetched), 2)
            archives[sha] = archive(sha)[:-40]  # truncated download
            shutil.rmtree(target)
            with patch.object(builder, 'download', side_effect=download), self.assertRaises(Exception):
                builder.snapshot('Org/repo', sha, cache)
            self.assertEqual(list(cache.iterdir()), [])


class SharedFiles(unittest.TestCase):
    """ctm-bootstrap.lua is byte-identical everywhere; retired copies are gone."""

    def setUp(self):
        import hashlib, tempfile
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        libs = Path(temp.name) / 'ctm-libs'
        (libs / 'bootstrap').mkdir(parents=True)
        (libs / 'bootstrap' / 'ctm-bootstrap.lua').write_text('-- canonical\n')
        self.digest = hashlib.sha256(b'-- canonical\n').hexdigest()
        self.config = json.loads((builder.TEMPLATE / 'repos.json').read_text())
        self.folders = builder.extension_folders(self.config)
        self.sources = {'ctm-libs': libs}
        self.hashes = {folder: {'_extension.yml': 'x'} for folders in self.folders.values() for folder in folders}
        for name in ('math-exercise', 'py-exercise'):
            self.hashes[name]['ctm-bootstrap.lua'] = self.digest
        self.hashes['pyodide-interaktiv']['feedback-loader.lua'] = 'old loader until step 3'

    def check(self):
        builder.check_shared_files(self.config, self.sources, self.folders, self.hashes)

    def test_identical_copies_pass(self):
        self.check()

    def test_a_different_or_missing_copy_fails(self):
        self.hashes['py-exercise']['ctm-bootstrap.lua'] = 'f' * 64
        with self.assertRaisesRegex(SystemExit, r'py-exercise/ctm-bootstrap.lua=ffffffffffff'):
            self.check()
        del self.hashes['py-exercise']['ctm-bootstrap.lua']
        with self.assertRaisesRegex(SystemExit, r'py-exercise/ctm-bootstrap.lua=missing'):
            self.check()

    def test_any_other_copy_must_match_too(self):
        self.hashes['pyodide-interaktiv']['lua/ctm-bootstrap.lua'] = 'e' * 64
        with self.assertRaisesRegex(SystemExit, r'pyodide-interaktiv/lua/ctm-bootstrap.lua'):
            self.check()

    def test_retired_copies_fail_except_in_pyodide_interaktiv(self):
        for name, path in (('math-exercise', 'feedback-loader.lua'), ('py-exercise', 'shared/pyodide-runtime.js')):
            with self.subTest(component=name):
                self.hashes[name][path] = 'x'
                with self.assertRaisesRegex(SystemExit, f'{name} still ships {name}/{path}'):
                    self.check()
                del self.hashes[name][path]


if __name__ == '__main__':
    unittest.main()
