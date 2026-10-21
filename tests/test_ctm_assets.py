import base64
import gzip
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

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

    def test_author_ast_scanner_stops_missing_packages_without_running_code(self):
        full = {"stdlib_modules": ["os", "importlib"], "packages": {"numpy": {"imports": ["numpy"]}, "pandas": {"imports": ["pandas"]},
                             "networkx": {"imports": ["networkx"]}, "sqlite3": {"imports": ["sqlite3"]}}}
        subset = {"packages": {"numpy": {}}}
        report = A.check_python_sources([{"origin": "starter", "source": "import numpy as np\nraise RuntimeError('never executed')\nfrom . import helper\nimport local_helper"}],
                                        full, subset, local_modules=["local_helper"])
        self.assertEqual(report["imports"], ["local_helper", "numpy"])
        self.assertEqual(report["unmapped"], {})
        for code in ("import pandas", "from pandas.core import frame",
                     "__import__('pandas')", "importlib.import_module('pandas')",
                     "graph_from_response(answer)", "import sqlite3"):
            with self.subTest(code=code), self.assertRaisesRegex(A.AssetError, "absent from the local bundle"):
                A.check_python_sources([{"source": code, "origin": "exercise:solution"}], full, subset)
        with self.assertRaisesRegex(A.AssetError, "pandas"):
            A.check_python_sources([{"source": "", "packages": ["pandas"]}], full, subset)
        with self.assertRaisesRegex(A.AssetError, "cannot inspect"):
            A.check_python_sources([{"source": "def invalid("}], full, subset)
        report = A.check_python_sources([{"source": "import os\nimport js\nimport pyodide\n# import pandas"}], full, subset)
        self.assertEqual(report["unmapped"], {})
        self.assertNotIn("pandas", report["imports"])

    def test_strict_import_scanner_resolves_release_stdlib_local_files_and_dynamic_aliases(self):
        full = {"stdlib_modules": ["os", "importlib"], "packages": {"pandas": {"imports": ["pandas"]}}}
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "helper.py").write_text("raise RuntimeError('never executed')\n")
            report = A.check_python_sources([{"source": "import os\nimport helper"}], full, {"packages": {}}, local_dirs=[root])
            self.assertEqual(report["unmapped"], {})
            for code in ("import totally_unmapped", "from importlib import import_module as load\nload('pandas')",
                         "import importlib as il\nil.import_module('pandas')",
                         "name = 'pandas'\n__import__(name)"):
                with self.subTest(code=code), self.assertRaises(A.AssetError):
                    A.check_python_sources([{"source": code}], full, {"packages": {}}, local_dirs=[root])
            report = A.check_python_sources([{"source": "import diagnostic_only"}], full, {"packages": {}}, strict=False)
            self.assertIn("diagnostic_only", report["unmapped"])

    def test_private_import_index_is_release_matched_and_never_written_under_assets(self):
        full = {"info": {"python": "3.13.2"}, "packages": {"extra": {"imports": ["extra"], "sha256": "not copied"}}}
        stdlib = {"v": 1, "python": "3.13.2", "modules": ["os", "sys"]}
        index = A.private_import_index(full, stdlib)
        self.assertNotIn("sha256", index["packages"]["extra"])
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            file = A.write_private_import_index(index, root / ".private-extensions/assets-imports.json")
            self.assertEqual(json.loads(file.read_text()), index)
            with self.assertRaisesRegex(A.AssetError, "outside published"):
                A.write_private_import_index(index, root / "_ctm-assets/assets-imports.json")
        with self.assertRaisesRegex(A.AssetError, "do not match"):
            A.private_import_index(full, {**stdlib, "python": "3.12.0"})

    def test_curated_texts_keep_official_git_bytes_and_stdlib_facts_are_release_scoped(self):
        root = Path(__file__).resolve().parents[1]
        provenance = json.loads((root / "integration/assets-licences/provenance.json").read_text())
        for name, entry in provenance["entries"].items():
            with self.subTest(component=name):
                data = (root / entry["file"]).read_bytes()
                self.assertTrue(data)
                actual = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
                self.assertEqual(actual, entry["git_blob_sha1"])
                A.allow_licence(name, entry["licence"])
        facts = json.loads((root / "integration/assets-stdlib.json").read_text())
        self.assertEqual(facts["v"], 1)
        self.assertIn("os", facts["modules"])
        self.assertIn("sys", facts["modules"])
        self.assertEqual(len(facts["modules"]), len(set(facts["modules"])))

    def test_composite_licences_require_all_and_choose_permissive_or_branch(self):
        self.assertFalse(A.allow_licence("icons", "(CC-BY-4.0 AND OFL-1.1 AND MIT)"))
        self.assertFalse(A.allow_licence("board", "(MIT OR LGPL-3.0)", ["LGPL-3.0"]))
        self.assertEqual(A.allow_licence("extra", "MIT AND LGPL-2.1", ["LGPL-2.1"]), {"LGPL-2.1"})
        for expression in ("MIT AND LGPL-2.1", "MIT OR", "(MIT", "MIT WITH exception", "MIT ; BSD-3-Clause"):
            with self.subTest(expression=expression), self.assertRaises(A.AssetError):
                A.allow_licence("bad", expression)
        with tempfile.TemporaryDirectory() as tmp:
            lock = {"v": 1, "archives": [{"id": "extra", "licence": "MIT AND LGPL-2.1"}]}
            with self.assertRaisesRegex(A.AssetError, "source offer"):
                A.build_from_lock(lock, Path(tmp) / "bundle", Path(tmp) / "cache", accepted_licences=["LGPL-2.1"])

    def test_python_package_aliases_use_release_keys_and_reject_ambiguous_lock(self):
        full = {"packages": {"pyodide-http": {"depends": ["Some_Dep"]}, "some-dep": {"depends": []}}}
        self.assertEqual(set(A.package_closure(full, ["pyodide_http"])["packages"]), {"pyodide-http", "some-dep"})
        with self.assertRaisesRegex(A.AssetError, "Ambiguous"):
            A.package_closure({"packages": {"a_b": {}, "a-b": {}}}, ["a_b"])
        with self.assertRaises(A.AssetError):
            A.package_closure(full, ["ALL"])

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

    def build_fixture(self, root):
        """Independent expected inventory for a tiny reviewed archive."""
        tar = root / "official.tgz"
        code, licence = b"fixture code", b"Fixture MIT licence text"
        archive(tar, [("package/dist/app.js", code), ("package/LICENSE", licence)])
        app, text = "npm/demo@1.0.0/dist/app.js", "LICENSES/demo/LICENSE"
        notices = "# Third-party notices\n\n## demo\nLicence: MIT\n\nLICENSES/demo/LICENSE\n\n"
        buffer = io.BytesIO()
        with gzip.GzipFile(fileobj=buffer, mode="wb", filename="", mtime=0) as out:
            out.write(code)
        files = {app: A.digest(code), app + ".gz": A.digest(buffer.getvalue()),
                 text: A.digest(licence), "THIRD-PARTY-NOTICES.md": A.digest(notices.encode())}
        manifest = {"v": 1, "versions": {"demo": "1.0.0"}, "files": dict(files)}
        files["manifest.json"] = A.digest(A.json_bytes(manifest))
        lock = {"v": 1, "versions": manifest["versions"], "files": files,
                "archives": [{"id": "demo", "url": "https://registry.npmjs.org/demo/-/demo-1.0.0.tgz",
                              "sha256": A.digest(tar.read_bytes()), "licence": "MIT", "licence_files": [text],
                              "files": [{"member": "dist/app.js", "path": app, "sha256": A.digest(code)},
                                        {"member": "LICENSE", "path": text, "sha256": A.digest(licence)}]}]}
        def downloaded(url, destination, **checks):
            data = tar.read_bytes()
            A.verify_bytes(data, **checks)
            destination.write_bytes(data)
            return destination
        return lock, downloaded

    def test_successful_build_stages_on_target_filesystem_and_reuses_verified_bundle(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            lock, downloaded = self.build_fixture(root)
            target, cache = root / "project/_ctm-assets", root / "other-drive-cache"
            rename = Path.rename
            def same_filesystem(source, destination):
                self.assertEqual(source.parent.parent, target.parent,
                                 "publication stage must be under destination.parent, not cache")
                return rename(source, destination)
            with patch.object(A, "download", side_effect=downloaded) as fetch, patch.object(Path, "rename", same_filesystem):
                self.assertEqual(A.build_from_lock(lock, target, cache), target)
                A.verify_bundle(target, lock)
                self.assertEqual(A.build_from_lock(lock, target, cache), target)
                self.assertEqual(fetch.call_count, 1)
            self.assertEqual(list(target.parent.glob(".ctm-assets-*")), [])
            (target / "npm/demo@1.0.0/dist/app.js").write_bytes(b"tamper")
            with self.assertRaisesRegex(A.AssetError, "sha256"):
                A.build_from_lock(lock, target, cache)

    def test_existing_bundle_does_not_bypass_licence_consent_or_source_offer(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            lock, downloaded = self.build_fixture(root)
            target, cache = root / "bundle", root / "cache"
            with patch.object(A, "download", side_effect=downloaded):
                A.build_from_lock(lock, target, cache)
            lock["archives"][0]["licence"] = "LGPL-2.1"
            with self.assertRaises(A.AssetError):
                A.build_from_lock(lock, target, cache)
            with self.assertRaisesRegex(A.AssetError, "source offer"):
                A.build_from_lock(lock, target, cache, accepted_licences=["LGPL-2.1"])
            lock["archives"][0]["licence"] = "MIT"
            lock["archives"][0]["licence_files"] = []
            with self.assertRaisesRegex(A.AssetError, "licence text"):
                A.build_from_lock(lock, target, cache)

    def test_carried_directory_and_tar_are_verified_before_replacing_previous_assets(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            lock, downloaded = self.build_fixture(root)
            bundle = root / "verified"
            with patch.object(A, "download", side_effect=downloaded):
                A.build_from_lock(lock, bundle, root / "cache")
            target = root / "project/_ctm-assets"
            target.mkdir(parents=True)
            (target / "previous").write_bytes(b"old assets")
            A.install_carried_bundle(lock, bundle, target)
            A.verify_bundle(target, lock)
            packed = root / "carried.tar.gz"
            with tarfile.open(packed, "w:gz") as out:
                out.add(bundle, arcname="_ctm-assets")
            A.install_carried_bundle(lock, packed, target)
            A.verify_bundle(target, lock)
            (bundle / "npm/demo@1.0.0/dist/app.js").write_bytes(b"tampered")
            with self.assertRaises(A.AssetError):
                A.install_carried_bundle(lock, bundle, target)
            A.verify_bundle(target, lock)

    def test_carried_tar_rejects_extra_entries_and_failed_publish_restores_previous(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            lock, downloaded = self.build_fixture(root)
            bundle = root / "verified"
            with patch.object(A, "download", side_effect=downloaded):
                A.build_from_lock(lock, bundle, root / "cache")
            target = root / "project/_ctm-assets"
            target.mkdir(parents=True)
            (target / "previous").write_bytes(b"old assets")
            packed = root / "carried.tar.gz"
            with tarfile.open(packed, "w:gz") as out:
                out.add(bundle, arcname="_ctm-assets")
                extra = tarfile.TarInfo("_ctm-assets/unreviewed")
                extra.size = 1
                out.addfile(extra, io.BytesIO(b"x"))
            with self.assertRaises(A.AssetError):
                A.install_carried_bundle(lock, packed, target)
            self.assertEqual((target / "previous").read_bytes(), b"old assets")
            rename = Path.rename
            def fail_publish(source, destination):
                if source.name == "bundle":
                    raise OSError("simulated publication failure")
                return rename(source, destination)
            with patch.object(Path, "rename", fail_publish), self.assertRaises(OSError):
                A.install_carried_bundle(lock, bundle, target)
            self.assertEqual((target / "previous").read_bytes(), b"old assets")

    def test_carried_publish_and_rollback_failure_preserves_recoverable_previous_bundle(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            lock, downloaded = self.build_fixture(root)
            bundle = root / "verified"
            with patch.object(A, "download", side_effect=downloaded):
                A.build_from_lock(lock, bundle, root / "cache")
            target = root / "project/_ctm-assets"
            target.mkdir(parents=True)
            (target / "old-answer").write_bytes(b"recoverable")
            rename = Path.rename
            def concurrent_destination(source, destination):
                if source.name == "bundle":
                    target.mkdir()
                    (target / "concurrent").write_bytes(b"new owner")
                    raise OSError("simulated failed publication after concurrent recreation")
                return rename(source, destination)
            with patch.object(Path, "rename", concurrent_destination), self.assertRaisesRegex(A.AssetError, "previous assets retained at"):
                A.install_carried_bundle(lock, bundle, target)
            retained = list(target.parent.glob(".ctm-assets-previous-*/previous/old-answer"))
            self.assertEqual(len(retained), 1)
            self.assertEqual(retained[0].read_bytes(), b"recoverable")
            self.assertEqual((target / "concurrent").read_bytes(), b"new owner")

    @unittest.skipUnless(hasattr(os, "mkfifo"), "POSIX special-entry fixture")
    def test_carried_bundle_rejects_fifo_without_reading_it(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            os.mkfifo(root / "pipe")
            with self.assertRaisesRegex(A.AssetError, "special filesystem"):
                A.inventory(root)

    def test_selected_hardlink_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            file = root / "hardlink.tgz"
            with tarfile.open(file, "w:gz") as out:
                item = tarfile.TarInfo("package/app.js")
                item.type, item.linkname = tarfile.LNKTYPE, "package/other.js"
                out.addfile(item)
            with self.assertRaises(A.AssetError):
                A.extract_selected(file, root / "out", [{"member": "app.js", "path": "app.js", "sha256": A.digest(b"x")}])

    def test_cache_key_changes_with_any_reviewed_lock_change(self):
        self.assertEqual(A.cache_key({"v": 1, "a": 2}), A.cache_key({"a": 2, "v": 1}))
        self.assertNotEqual(A.cache_key({"v": 1, "a": 2}), A.cache_key({"v": 1, "a": 3}))



class MetadataTests(unittest.TestCase):
    def sources(self, root):
        table = {"v": 1, "assets": {"katex": {"npm": "katex", "version": "0.16.47",
                  "cdn": "https://cdn.jsdelivr.net/npm/katex@{version}/", "local": "npm/katex@{version}/"}}}
        (root / "assets.json").write_bytes(A.json_bytes(table))
        (root / "runtime").mkdir()
        (root / "runtime/pyodide-runtime.js").write_text("var indexURL = 'https://cdn.jsdelivr.net/pyodide/v0.28.3/full/';\n", encoding="utf-8")
        return table

    def test_version_sources_keep_runtime_as_the_only_pyodide_home(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            table = self.sources(root)
            found = A.version_sources(root)
            self.assertEqual(found["pyodide"], "0.28.3")
            self.assertEqual(found["assets"]["katex"]["version"], "0.16.47")
            table["assets"]["pyodide"] = dict(table["assets"]["katex"])
            (root / "assets.json").write_bytes(A.json_bytes(table))
            with self.assertRaises(A.AssetError):
                A.version_sources(root)

    def pins(self, root):
        pins = root / "jsxgraph-pins.yml"
        pins.write_text(
            "jsxgraph:\n"
            "  src_jxg: https://cdn.jsdelivr.net/npm/jsxgraph@1.2.3/distrib/jsxgraphcore.js\n"
            "  src_css: https://cdn.jsdelivr.net/npm/jsxgraph@1.2.3/distrib/jsxgraph.css\n"
            "  src_mjx: https://cdn.jsdelivr.net/npm/mathjax@4.0.0/tex-mml-svg.js\n"
            "  mjx_fonts: https://cdn.jsdelivr.net/npm/@mathjax/mathjax-newcm-font@4.0.0/\n", encoding="utf-8")
        return pins

    def test_three_canonical_version_homes_must_equal_the_lock(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.sources(root)
            pins = self.pins(root)
            versions = {"katex": "0.16.47", "pyodide": "0.28.3", "jsxgraph": "1.2.3",
                        "mathjax4": "4.0.0", "mathjax-newcm-font": "4.0.0"}
            self.assertEqual(A.validate_version_homes({"versions": versions}, root, pins), versions)
            for changes in ({"pyodide": "0.28.4"}, {"katex": "0.16.11"}, {"jsxgraph": "1.2.4"}):
                with self.subTest(changes=changes), self.assertRaises(A.AssetError):
                    A.validate_version_homes({"versions": {**versions, **changes}}, root, pins)
            pins.write_text(pins.read_text().replace("jsxgraph@1.2.3", "jsxgraph@1"))
            with self.assertRaisesRegex(A.AssetError, "exact"):
                A.board_versions(pins)

    def test_conflicting_board_home_cannot_be_hidden_by_lock_merge(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            table = self.sources(root)
            pins = self.pins(root)
            versions = {"katex": "0.16.47", "pyodide": "0.28.3", "jsxgraph": "1.2.3",
                        "mathjax4": "4.0.0", "mathjax-newcm-font": "4.0.0"}
            for name, npm, version in (("mathjax4", "mathjax", "4.1.2"),
                                       ("disguised", "mathjax", "4.1.2"),
                                       ("jsxgraph", "katex", "0.16.47"),
                                       ("python-alias", "pyodide", "0.28.3")):
                with self.subTest(name=name):
                    duplicate = {**table, "assets": {**table["assets"], name: {"npm": npm, "version": version,
                                 "local": "npm/duplicate@{version}/"}}}
                    (root / "assets.json").write_bytes(A.json_bytes(duplicate))
                    with self.assertRaisesRegex(A.AssetError, "belongs to runtime/jsxgraph-pins"):
                        A.validate_version_homes({"versions": versions}, root, pins)

    def test_profiles_preserve_authored_files_and_separate_exam_answers(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "_quarto-offline.yml").write_text("# Author profile\n", encoding="utf-8")
            (root / ".gitignore").write_text("existing/\n", encoding="utf-8")
            created = A.write_profiles(root, course_key="course")
            self.assertEqual([file.name for file in created], ["_quarto-exam.yml"])
            self.assertEqual((root / "_quarto-offline.yml").read_text(), "# Author profile\n")
            exam = (root / "_quarto-exam.yml").read_text()
            self.assertIn('storage-key: "course-exam"', exam)
            self.assertIn("save: answers", exam)
            self.assertIn("export: true", exam)
            self.assertIn("enabled: false", exam)
            self.assertIn("output-dir: _site-exam", exam)
            self.assertEqual(A.write_profiles(root, course_key="ignored"), [])
            self.assertEqual((root / ".gitignore").read_text(), "existing/\n_ctm-assets/\n")
            (root / "_quarto-offline.yml").unlink()
            A.write_profiles(root)
            offline = (root / "_quarto-offline.yml").read_text()
            self.assertIn('_ctm-assets/**', offline)
            self.assertIn('_extensions/ctm-assessment/offline.scss', offline)
            self.assertIn('assets: local', offline)

    def test_release_version_uses_package_json_not_full_lock_dev_version(self):
        self.assertEqual(A.release_version(b'{"version":"0.28.3"}', "0.28.3"), "0.28.3")
        with self.assertRaises(A.AssetError):
            A.release_version(b'{"version":"0.28.0.dev0"}', "0.28.3")

    def test_single_file_profile_uses_system_font_variant(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            A.write_profiles(root, website=False)
            self.assertIn("offline-system.scss", (root / "_quarto-offline.yml").read_text())
        extension = Path(__file__).resolve().parents[1] / "_extensions/ctm-assessment"
        website = (extension / "offline.scss").read_text()
        single = (extension / "offline-system.scss").read_text()
        self.assertIn('../../_ctm-assets/fonts/source-sans-pro.css', website)
        self.assertIn('$web-font-path: false;', single)
        self.assertNotIn('https://', website + single)

    def test_metadata_redirects_use_their_own_official_hosts_and_https_ports(self):
        original = A.urllib.request.Request("https://api.github.com/repos/pyodide/pyodide/releases")
        moved = "https://api.github.com/repos/pyodide/pyodide/releases/tags/0.28.3"
        request = A.SafeMetadataRedirect().redirect_request(original, None, 302, "", {}, moved)
        self.assertEqual(request.full_url, moved)
        for url in ("https://github.com/a", "https://evil.test/a", "http://api.github.com/a",
                    "https://api.github.com:444/a", "https://registry.npmjs.org:444/a",
                    "https://user:secret@api.github.com/a"):
            with self.subTest(url=url), self.assertRaises(A.AssetError):
                A.checked_metadata_url(url)
            with self.subTest(redirect=url), self.assertRaises(A.AssetError):
                A.SafeMetadataRedirect().redirect_request(original, None, 302, "", {}, url)

    def test_official_metadata_is_exact_and_is_not_claimed_as_a_verified_bundle(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.sources(root)
            integrity = "sha512-" + base64.b64encode(hashlib.sha512(b"archive").digest()).decode()
            def metadata(url):
                if "api.github.com" in url:
                    return {"assets": [{"name": "pyodide-0.28.3.tar.bz2", "digest": "sha256:" + "a" * 64,
                            "browser_download_url": "https://github.com/pyodide/pyodide/releases/download/0.28.3/pyodide-0.28.3.tar.bz2"}]}
                return {"name": "katex", "version": "0.16.47", "license": "MIT",
                        "dist": {"integrity": integrity, "tarball": "https://registry.npmjs.org/katex/-/katex-0.16.47.tgz"}}
            with patch.object(A, "fetch_json", side_effect=metadata):
                report = A.collect_metadata(root, source_refs={"ctm-libs": "b" * 40})
            self.assertEqual(len(report["archives"]), 2)
            self.assertEqual(report["archives"][0]["integrity"], integrity)
            self.assertEqual(report["archives"][1]["sha256"], "a" * 64)
            self.assertEqual(report["source_refs"]["ctm-libs"], "b" * 40)
            self.assertIn("still require verification", report["status"])

    def test_board_candidates_stay_in_approved_major_lines(self):
        integrity = "sha512-" + base64.b64encode(hashlib.sha512(b"archive").digest()).decode()
        def metadata(url):
            package = A.urllib.parse.unquote(url.split("registry.npmjs.org/", 1)[1])
            if re := __import__("re").search(r"/(\d+\.\d+\.\d+)$", package):
                version = re.group(1)
                return {"name": package[:re.start()], "version": version, "license": "MIT",
                        "dist": {"integrity": integrity, "tarball": "https://registry.npmjs.org/a/-/a.tgz"}}
            return {"versions": {v: {} for v in ("1.9.0", "1.10.0", "1.10.1-beta", "4.0.0", "4.1.2", "5.0.0")}}
        with patch.object(A, "fetch_json", side_effect=metadata):
            candidates = A.resolve_board_metadata()
        self.assertEqual([item["version"] for item in candidates], ["1.10.0", "4.1.2", "4.1.2"])
        self.assertEqual([item["id"] for item in candidates], ["jsxgraph", "mathjax4", "mathjax-newcm-font"])

    def test_archive_inspection_verifies_bytes_and_reports_licence_texts(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            tar = root / "source.tgz"
            archive(tar, [("package/LICENSE", b"fixture MIT text"), ("package/dist/app.js", b"code")])
            entry = {"id": "fixture", "url": "https://registry.npmjs.org/demo/-/demo.tgz", "sha256": A.digest(tar.read_bytes())}
            def downloaded(url, destination, **checks):
                data = tar.read_bytes()
                A.verify_bytes(data, **checks)
                destination.write_bytes(data)
            with patch.object(A, "download", side_effect=downloaded):
                report = A.inspect_archives({"archives": [entry], "sources": {}}, root / "cache")
                self.assertEqual(report["archives"][0]["texts"], {"package/LICENSE": "fixture MIT text"})
                members = report["archives"][0]["members"]
                self.assertEqual({x["member"]: x["sha256"] for x in members},
                                 {"package/LICENSE": A.digest(b"fixture MIT text"), "package/dist/app.js": A.digest(b"code")})
                entry["sha256"] = "0" * 64
                with self.assertRaises(A.AssetError):
                    A.inspect_archives({"archives": [entry], "sources": {}}, root / "cache")

    def test_missing_official_digest_never_becomes_a_guessed_lock_hash(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.sources(root)
            integrity = "sha512-" + base64.b64encode(hashlib.sha512(b"archive").digest()).decode()
            def metadata(url):
                if "api.github.com" in url:
                    return {"assets": [{"name": "pyodide-0.28.3.tar.bz2", "digest": None}]}
                return {"name": "katex", "version": "0.16.47",
                        "dist": {"integrity": integrity, "tarball": "https://registry.npmjs.org/katex/-/katex-0.16.47.tgz"}}
            with patch.object(A, "fetch_json", side_effect=metadata), self.assertRaisesRegex(A.AssetError, "no SHA-256"):
                A.collect_metadata(root)


if __name__ == "__main__":
    unittest.main()
