"""Converted-source recovery preserves UTF-8 bytes and tracked deletions."""
import base64
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]

class EmitConvertedSourceTests(unittest.TestCase):
    def test_lossless_chunks_deletions_and_no_untracked_output(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            def git(*args):
                return subprocess.check_output(["git", "-C", str(root), *args], stderr=subprocess.STDOUT)
            git("init", "-q")
            (root / "page.qmd").write_text("Before\n", encoding="utf-8")
            (root / "deleted.html").write_text("old", encoding="utf-8")
            (root / "unchanged.md").write_text("same", encoding="utf-8")
            git("add", ".")
            git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture")
            before = git("rev-parse", "HEAD").decode().strip()
            changed = ("Gå i dybden: α → ℝ\n" * 1000).encode("utf-8")
            (root / "page.qmd").write_bytes(changed)
            (root / "deleted.html").unlink()
            (root / "untracked-secret.txt").write_text("must not be exported", encoding="utf-8")
            output = subprocess.check_output([sys.executable, str(ROOT / "tools/ci/emit-converted-source.py"), str(root)], text=True)
            records = [json.loads(line.removeprefix("CTM_CONVERTED_SOURCE ")) for line in output.splitlines()]
            self.assertEqual(records[0], {"head": before, "files": 2})
            self.assertEqual(records[-1], {"complete": True})
            self.assertEqual({r["path"] for r in records[1:-1]}, {"page.qmd", "deleted.html"})
            self.assertIn({"path": "deleted.html", "deleted": True}, records)
            metadata = next(r for r in records if r.get("path") == "page.qmd" and "chunks" in r)
            chunks = [r for r in records if r.get("path") == "page.qmd" and "chunk" in r]
            self.assertGreater(metadata["chunks"], 1)
            self.assertEqual([r["chunk"] for r in chunks], list(range(metadata["chunks"])))
            restored = base64.b64decode("".join(r["base64"] for r in chunks), validate=True)
            self.assertEqual(restored, changed)
            self.assertEqual(metadata["bytes"], len(changed))
            expected = hashlib.sha1(b"blob " + str(len(changed)).encode() + b"\0" + changed).hexdigest()
            self.assertEqual(metadata["git_blob_sha1"], expected)

if __name__ == "__main__":
    unittest.main()
