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

    def test_this_checkout_is_releasable_under_its_own_version(self):
        version = release.manifest_version()
        self.assertRegex(version, r'^\d+\.\d+\.\d+$')
        self.assertEqual(release.problems('v' + version), [])
        self.assertIn('ctm-libs', release.changelog_section(version))

    def test_the_tag_must_name_the_manifest_version(self):
        found = release.problems('v0.0.1')
        self.assertTrue(any('does not name the package version' in problem for problem in found), found)
        self.assertTrue(any('package.json has version' in problem for problem in found), found)
        self.assertTrue(any('no "## 0.0.1" section' in problem for problem in found), found)
        for tag in ('0.9.0', 'v0.9', 'v0.9.0-rc1', 'main'):
            self.assertIn('is not vMAJOR.MINOR.PATCH', release.problems(tag)[0])

    def test_every_component_but_the_package_itself_is_pinned(self):
        root = self.copy()
        manifest = root / 'integration/feedback/repos.json'
        data = json.loads(manifest.read_text())
        self.assertNotIn('commit', data['repositories']['ctm-assessment'])  # the self-entry is skipped
        del data['repositories']['math-exercise']['commit']
        data['repositories']['jsxgraph']['commit'] = 'abc1234'
        manifest.write_text(json.dumps(data))
        found = release.problems('v' + release.manifest_version(root), root)
        self.assertEqual(sorted(p.split(' is not pinned')[0] for p in found), ['repos.json: jsxgraph', 'repos.json: math-exercise'])

    def test_the_notes_are_the_changelog_section(self):
        version = release.manifest_version()
        with tempfile.TemporaryDirectory() as temp:
            notes = Path(temp) / 'notes.md'
            with patch.object(sys, 'argv', ['release-check.py', '--tag', 'v' + version, '--notes', str(notes)]):
                release.main()
            text = notes.read_text()
        self.assertEqual(text, release.changelog_section(version))
        self.assertNotIn('\n## ', text)
        with patch.object(sys, 'argv', ['release-check.py', '--tag', 'v9.9.9']), self.assertRaises(SystemExit) as stop:
            release.main()
        self.assertIn('Not a releasable state', str(stop.exception.code))


if __name__ == '__main__':
    unittest.main()
