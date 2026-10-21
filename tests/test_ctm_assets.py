import base64
import gzip
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("ctm_assets", Path(__file__).resolve().parents[1] / "scripts" / "ctm_assets.py")
A = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(A)


def archive(path, entries):
    with tarfile.open(path, "w:gz") as out:
        for name, value in entries:
            info = tarfile.TarInfo(name)
            if value is None:
                info.type = tarfile.SYMTYPE
                info.linkname = "/outside"
                out.addfile(info)
            else:
                info.size = len(value)
                out.addfile(info, io.BytesIO(value))


class AssetsTests(unittest.TestCase):
    def test_only_approved_https_sources_and_redirects(self):
        for url in ("http://github.com/a", "https://evil.test/a", "https://github.com.evil.test/a",
                    "https://user:secret@github.com/a", "https://registry.npmjs.org:444/a"):
            with self.subTest(url=url), self.assertRaises(A.AssetError):
                A.checked_url(url)
        for host in A.ARCHIVE_HOSTS:
            self.assertEqual(A.checked_url("https://" + host + "/a?download=1"), "https://" + host + "/a?download=1")
        with self.assertRaises(A.AssetError):
            A.SafeRedirect().redirect_request(None, None, 302, "", {}, "https://evil.test/redirect")

    def test_integrity_verifies_bytes_and_rejects_weaker_or_invalid_sri(self):
        data = b"official archive"
        integrity = "sha512-" + base64.b64encode(hashlib.sha512(data).digest()).decode()
        A.verify_bytes(data, integrity=integrity, sha256=hashlib.sha256(data).hexdigest())
        for kwargs in ({}, {"integrity": "sha256-dummy"}, {"integrity": "sha512-!bad"},
                       {"sha256": "0" * 64}, {"integrity": integrity}):
            with self.subTest(kwargs=kwargs), self.assertRaises(A.AssetError):
                A.verify_bytes(b"tampered", **kwargs)

    def test_selected_member_hash_and_output_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            package = root / "package.tgz"
            archive(package, [("package/dist/app.js", b"code"), ("package/unneeded", b"not copied")])
            A.extract_selected(package, root / "out", [{"member": "dist/app.js", "path": "npm/demo@1.0.0/dist/app.js",
                                                        "sha256": A.digest(b"code")}])
            self.assertEqual((root / "out/npm/demo@1.0.0/dist/app.js").read_bytes(), b"code")
            self.assertFalse((root / "out/unneeded").exists())
            with self.assertRaises(A.AssetError):
                A.extract_selected(package, root / "bad", [{"member": "dist/app.js", "path": "safe.js", "sha256": "0" * 64}])

    def test_archive_traversal_symlink_duplicates_missing_member(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for name, entries in {
                "traversal": [("../escaped", b"bad")],
                "absolute": [("/absolute", b"bad")],
                "backslash": [("package\\bad", b"bad")],
                "symlink": [("package/app.js", None)],
                "repeated": [("package/app.js", b"x"), ("package/app.js", b"x")],
                "missing": [("package/else.js", b"x")],
            }.items():
                with self.subTest(name=name):
                    file = root / (name + ".tgz")
                    archive(file, entries)
                    with self.assertRaises(A.AssetError):
                        A.extract_selected(file, root / name, [{"member": "app.js", "path": "app.js", "sha256": A.digest(b"x")}])
            self.assertFalse((root.parent / "escaped").exists())

    def test_lock_member_cannot_escape_or_collide(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            file = root / "ok.tgz"
            archive(file, [("package/app.js", b"x")])
            for path in ("../escape", "/root", "a\\b", "C:/file", "./file", "a//b"):
                with self.subTest(path=path), self.assertRaises(A.AssetError):
                    A.extract_selected(file, root / "out", [{"member": "app.js", "path": path, "sha256": A.digest(b"x")}])
            item = {"member": "app.js", "path": "app.js", "sha256": A.digest(b"x")}
            with self.assertRaises(A.AssetError):
                A.extract_selected(file, root / "out", [item, dict(item)])

    def test_named_dependency_closure_preserves_full_metadata_and_subset(self):
        full = {"info": {"version": "0.28.0.dev0"}, "packages": {
            "sympy": {"depends": ["mpmath"], "imports": ["sympy"]},
            "mpmath": {"depends": [], "imports": ["mpmath"]},
            "networkx": {"depends": [], "imports": ["networkx"]},
            "unneeded": {"depends": [], "imports": ["unneeded"]}}}
        subset = A.package_closure(full, ["sympy", "networkx"])
        self.assertEqual(set(subset["packages"]), {"sympy", "mpmath", "networkx"})
        self.assertIn("unneeded", full["packages"], "full lock must not be mutated")
        self.assertIn("networkx", A.EXAM_PACKAGES)
        for names in (["all"], ["not-shipped"]):
            with self.assertRaises(A.AssetError):
                A.package_closure(full, names)
        with self.assertRaises(A.AssetError):
            A.package_closure({"packages": {"a": {"depends": ["b"]}, "b": {"depends": ["a"]}}}, ["a"])

    def test_licence_unknown_and_copyleft_are_explicit_gates(self):
        for spdx in (None, "unknown", "LGPL-2.1"):
            with self.subTest(spdx=spdx), self.assertRaises(A.AssetError):
                A.allow_licence("extra", spdx)
        for spdx in ("MIT", "BSD-3-Clause", "PSF-2.0", "MPL-2.0", "OFL-1.1"):
            A.allow_licence("known", spdx)
        A.allow_licence("extra", "LGPL-2.1", ["LGPL-2.1"])
        with tempfile.TemporaryDirectory() as tmp:
            lock = {"v": 1, "archives": [{"id": "extra", "licence": "LGPL-2.1"}]}
            with self.assertRaisesRegex(A.AssetError, "source offer"):
                A.build_from_lock(lock, Path(tmp) / "bundle", Path(tmp) / "cache", accepted_licences=["LGPL-2.1"])

    def test_compression_is_deterministic_and_preserves_range_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for suffix in ("wasm", "js", "mjs", "json", "css", "whl", "zip"):
                (root / ("asset." + suffix)).write_bytes(b"asset bytes" * 20)
            A.precompress(root)
            first = {file.name: file.read_bytes() for file in root.glob("*.gz")}
            self.assertEqual(len(first), 5)
            for data in first.values():
                self.assertEqual(gzip.decompress(data), b"asset bytes" * 20)
            A.precompress(root)
            self.assertEqual(first, {file.name: file.read_bytes() for file in root.glob("*.gz")})
            self.assertFalse((root / "asset.whl.gz").exists())
            self.assertFalse((root / "asset.zip.gz").exists())

    def test_carried_bundle_is_verified_against_external_lock_not_its_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            asset = root / "app.js"
            asset.write_bytes(b"trusted")
            manifest = {"v": 1, "versions": {"demo": "1.0.0"}, "files": {"app.js": A.digest(b"trusted")}}
            (root / "manifest.json").write_bytes(A.json_bytes(manifest))
            lock = {"v": 1, "versions": manifest["versions"], "files": A.inventory(root)}
            A.verify_bundle(root, lock)
            asset.write_bytes(b"tampered")
            manifest["files"]["app.js"] = A.digest(b"tampered")
            (root / "manifest.json").write_bytes(A.json_bytes(manifest))
            with self.assertRaises(A.AssetError):
                A.verify_bundle(root, lock)

    def test_unknown_files_and_full_lock_are_never_published(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "manifest.json").write_bytes(A.json_bytes({"v": 1, "versions": {}, "files": {}}))
            lock = {"v": 1, "versions": {}, "files": A.inventory(root)}
            (root / "extra").write_bytes(b"x")
            with self.assertRaises(A.AssetError):
                A.verify_bundle(root, lock)
            (root / "extra").unlink()
            (root / "pyodide-lock.full.json").write_bytes(b"{}")
            lock["files"] = A.inventory(root)
            with self.assertRaisesRegex(A.AssetError, "full Pyodide lock"):
                A.verify_bundle(root, lock)

    def test_cache_key_changes_with_any_reviewed_lock_change(self):
        self.assertEqual(A.cache_key({"v": 1, "a": 2}), A.cache_key({"a": 2, "v": 1}))
        self.assertNotEqual(A.cache_key({"v": 1, "a": 2}), A.cache_key({"v": 1, "a": 3}))


if __name__ == "__main__":
    unittest.main()
