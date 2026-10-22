"""Selected screenshot transport is lossless, bounded and explicit."""
import base64
from contextlib import redirect_stdout
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("emit_browser_shots", ROOT / "tools/ci/emit-browser-shots.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
REF = "a" * 40

class EmitBrowserShotsTests(unittest.TestCase):
    def populate(self, root):
        raw = MODULE.PNG_SIGNATURE + bytes(range(256)) * 20
        for name in MODULE.FILES:
            (root / name).write_bytes(raw)
        return raw

    def capture(self, root, ref=REF):
        out = io.StringIO()
        with redirect_stdout(out):
            MODULE.emit(root, ref)
        return [json.loads(line.removeprefix(MODULE.PREFIX)) for line in out.getvalue().splitlines()]

    def test_exact_selection_multichunk_bytes_and_checksums(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            raw = self.populate(root)
            (root / "chromium-390-switch-old.png").write_bytes(b"never emit")
            (root / "unrelated-secret.txt").write_text("never emit")
            records = self.capture(root)
            self.assertEqual(records[0], {"course_ref": REF, "files": 6, "bytes": len(raw) * 6})
            self.assertEqual(records[-1], {"complete": True})
            self.assertEqual({r["name"] for r in records[1:-1]}, set(MODULE.FILES))
            for name in MODULE.FILES:
                metadata = next(r for r in records if r.get("name") == name and "chunks" in r)
                parts = [r for r in records if r.get("name") == name and "chunk" in r]
                self.assertGreater(metadata["chunks"], 1)
                self.assertEqual([r["chunk"] for r in parts], list(range(metadata["chunks"])))
                self.assertEqual(base64.b64decode("".join(r["base64"] for r in parts), validate=True), raw)
                self.assertEqual(metadata["sha256"], hashlib.sha256(raw).hexdigest())
                self.assertEqual(metadata["bytes"], len(raw))

    def test_missing_invalid_or_oversized_files_never_emit_partial_records(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.populate(root)
            for problem in ("missing", "signature", "file-bound", "total-bound"):
                self.populate(root)
                if problem == "missing":
                    (root / MODULE.FILES[-1]).unlink()
                elif problem == "signature":
                    (root / MODULE.FILES[-1]).write_bytes(b"invalid")
                setting = "MAX_TOTAL_BYTES" if problem == "total-bound" else "MAX_FILE_BYTES"
                bound = 1 if problem in ("file-bound", "total-bound") else 512_000
                out = io.StringIO()
                with patch.object(MODULE, setting, bound), redirect_stdout(out):
                    with self.assertRaises((ValueError, FileNotFoundError)):
                        MODULE.emit(root, REF)
                self.assertEqual(out.getvalue(), "")

    def test_exact_commit_required(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                self.capture(Path(directory), "main")

if __name__ == "__main__":
    unittest.main()
