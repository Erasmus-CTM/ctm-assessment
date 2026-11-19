"""Release checks (design §10.6, §16.12): a dry run on this checkout and on broken copies of it."""
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('release_check', ROOT / 'scripts/release-check.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseCheck(unittest.TestCase):
    def copy(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        for name in ('_extensions/ctm-assessment/_extension.yml', 'integration/feedback/repos.json', 'package.json', 'CHANGELOG.md'):
            (root / name).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / name, root / name)
        return root

    def notes_naming_the_pins(self, root):
        """Give the copy's version a CHANGELOG section that names every pin."""
        version = release.manifest_version(root)
        repositories = json.loads((root / 'integration/feedback/repos.json').read_text())['repositories']
        named = ', '.join(f'{name} at {spec["commit"][:7]}' for name, spec in repositories.items() if 'commit' in spec)
        (root / 'CHANGELOG.md').write_text(f'# Changelog\n\n## {version}\n\nComponents: {named}.\n', encoding='utf-8')
        return version

    def test_a_copy_whose_notes_name_the_pins_is_releasable(self):
        root = self.copy()
        version = self.notes_naming_the_pins(root)
        self.assertRegex(version, r'^\d+\.\d+\.\d+$')
        self.assertEqual(release.problems('v' + version, root), [])
        self.assertIn('ctm-libs', release.changelog_section(version, root))

    def test_notes_that_predate_the_pins_are_refused(self):
        # M6 of the 26 Oct review: a tag passed with notes written for older pins.
        root = self.copy()
        version = self.notes_naming_the_pins(root)
        manifest = root / 'integration/feedback/repos.json'
        data = json.loads(manifest.read_text())
        data['repositories']['ctm-libs']['commit'] = 'f' * 40
        manifest.write_text(json.dumps(data))
        self.assertEqual(release.problems('v' + version, root),
                         [f'CHANGELOG.md "## {version}" does not name ctm-libs at fffffff (the notes describe the pinned components)'])

    def test_remote_requires_a_release_tag_on_every_pin_and_agreeing_component_pins(self):
        root = self.copy()
        repositories = json.loads((root / 'integration/feedback/repos.json').read_text())['repositories']
        pinned = {name for name, spec in repositories.items() if 'commit' in spec}
        tags = lambda repository, commit: [] if repository == repositories['jsxgraph']['repository'] else ['v1.0.0']
        found, components = release.remote_problems(root, tags=tags, pin_check=lambda r: [
            ('ctm-stack', '.github/pins.json', 'ctm-libs', 'a' * 40, 'b' * 40)])
        self.assertEqual(set(components), pinned)
        self.assertIsNone(components['jsxgraph']['tag'])
        self.assertEqual(components['ctm-libs']['tag'], 'v1.0.0')
        self.assertEqual(len(found), 2, found)
        self.assertIn('jsxgraph', found[0])
        self.assertIn('has no release tag', found[0])
        self.assertIn('ctm-stack .github/pins.json pins ctm-libs aaaaaaaaaaaa; the package ships bbbbbbbbbbbb', found[1])
        found, _ = release.remote_problems(root, tags=lambda r, c: ['runtime-v3'], pin_check=lambda r: [])
        self.assertEqual(found, [])

    def test_release_tag_names(self):
        for name in ('v1.0.0', 'v12.3.45', 'runtime-v3'):
            self.assertTrue(release.RELEASE_TAG.fullmatch(name), name)
        for name in ('1.0.0', 'v1.0', 'v1.0.0-rc.1', 'handoff', 'runtime-v'):
            self.assertFalse(release.RELEASE_TAG.fullmatch(name), name)

    def test_the_tag_must_name_the_manifest_version(self):
        found = release.problems('v0.0.1')
        self.assertTrue(any('does not name the package version' in problem for problem in found), found)
        self.assertTrue(any('package.json has version' in problem for problem in found), found)
        self.assertTrue(any('no "## 0.0.1" section' in problem for problem in found), found)
        for tag in ('0.9.0', 'v0.9', 'v0.9.0-rc1', 'main'):
            self.assertIn('is not vMAJOR.MINOR.PATCH', release.problems(tag)[0])

    def test_every_component_but_the_package_itself_is_pinned(self):
        root = self.copy()
        self.notes_naming_the_pins(root)
        manifest = root / 'integration/feedback/repos.json'
        data = json.loads(manifest.read_text())
        self.assertNotIn('commit', data['repositories']['ctm-assessment'])  # the self-entry is skipped
        del data['repositories']['math-exercise']['commit']
        data['repositories']['jsxgraph']['commit'] = 'abc1234'
        manifest.write_text(json.dumps(data))
        found = release.problems('v' + release.manifest_version(root), root)
        self.assertEqual(sorted(p.split(' is not pinned')[0] for p in found), ['repos.json: jsxgraph', 'repos.json: math-exercise'])

    def test_the_notes_are_the_changelog_section(self):
        root = self.copy()
        version = self.notes_naming_the_pins(root)
        notes = root / 'notes.md'
        with patch.object(release, 'ROOT', root), \
                patch.object(sys, 'argv', ['release-check.py', '--tag', 'v' + version, '--notes', str(notes)]):
            release.main()
        text = notes.read_text()
        self.assertEqual(text, release.changelog_section(version, root))
        self.assertNotIn('\n## ', text)
        with patch.object(sys, 'argv', ['release-check.py', '--tag', 'v9.9.9']), self.assertRaises(SystemExit) as stop:
            release.main()
        self.assertIn('Not a releasable state', str(stop.exception.code))


if __name__ == '__main__':
    unittest.main()
