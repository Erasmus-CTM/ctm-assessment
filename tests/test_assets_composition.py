"""Complete composition with real archive bytes and bound private-index controls."""
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import tarfile
import unittest
from unittest.mock import Mock, patch

import test_assets_npm_lock as npm_tests
import test_assets_python_lock as python_tests
assets = npm_tests.assets


class CompleteCompositionTests(unittest.TestCase):
    def setUp(self):
        self.fixture = npm_tests.NpmPartialLockTests("test_empty_licence_refused")
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.root = self.fixture.root
        self.library = self.fixture.library
        self.cache = self.root / "cache"
        self.pins = self.root / "jsxgraph-pins.yml"
        self.pins.write_text(
            "jsxgraph:\n"
            "  src_jxg: https://cdn.jsdelivr.net/npm/jsxgraph@1.14.1/distrib/jsxgraphcore.js\n"
            "  src_css: https://cdn.jsdelivr.net/npm/jsxgraph@1.14.1/distrib/jsxgraph.css\n"
            "  src_mjx: https://cdn.jsdelivr.net/npm/mathjax@4.1.3/tex-mml-svg.js\n"
            "  mjx_fonts: https://cdn.jsdelivr.net/npm/@mathjax/mathjax-newcm-font@4.1.3/\n",
            encoding="utf-8")
        core = self.fixture.produce()
        runtime = {name: ("actual runtime " + name).encode() for name in
                   ("pyodide.js", "pyodide.mjs", "pyodide.asm.js", "pyodide.asm.wasm", "python_stdlib.zip")}
        runtime["package.json"] = assets.json_bytes({"version": "0.28.3"})
        url = "https://github.com/pyodide/pyodide/releases/download/0.28.3/pyodide-0.28.3.tar.bz2"
        py_archive = self.archive("pyodide", "0.28.3", runtime, "pyodide/0.28.3/", url=url)
        del py_archive["version"]  # Exact canonical Python-producer archive schema.
        py_packages = {name: {"imports": [name.replace("-", "_")]} for name in assets.EXAM_PACKAGES}
        subset = {"info": {"python": "3.13.2"}, "packages": py_packages}
        subset_text = assets.json_bytes(subset).decode()
        python = {"v": 1, "kind": "private-partial-python-assets-lock", "scope": ["pyodide"],
                  "versions": {"pyodide": "0.28.3"}, "archives": [py_archive],
                  "generated": [{"path": "pyodide/0.28.3/pyodide-lock.json", "text": subset_text,
                                 "sha256": assets.digest(subset_text.encode())}],
                  "python_roots": list(assets.EXAM_PACKAGES), "python_extras": [],
                  "python_packages": {name: {"licence": "MIT"} for name in py_packages}}
        python["files"] = assets.derive_lock_files(python, self.cache)
        board_versions = assets.board_versions(self.pins)
        boards = {"v": 1, "kind": "private-partial-board-assets-lock",
                  "scope": sorted(board_versions), "versions": board_versions,
                  "archives": [self.archive(name, version, {"runtime.js": b"board runtime"},
                                           "npm/" + name + "@" + version + "/")
                               for name, version in sorted(board_versions.items())],
                  "generated": [], "provenance": {"board_pins_sha256": assets.digest(self.pins.read_bytes())}}
        boards["files"] = assets.derive_lock_files(boards, self.cache)
        self.partials = [python, core, boards]
        self.reviewed = {part["kind"]: assets.digest(assets.json_bytes(part)) for part in self.partials}
        hashes = {name: assets.digest(data) for name, data in runtime.items()}
        hashes["pyodide-lock.json"] = "1" * 64  # Full private release lock is not the public subset.
        self.availability = "2" * 64
        self.index = {"v": 1, "python": "3.13.2", "stdlib_modules": ["math", "sys"],
                      "packages": py_packages,
                      "source": {"url": url, "sha256": py_archive["sha256"], "runtime_files": hashes,
                                 "candidate_source": {
                                     "url": "https://github.com/python/cpython/blob/v3.13.2/Python/stdlib_module_names.h",
                                     "git_blob_sha1": "a" * 40},
                                 "method": "Successful imports of trusted release stdlib candidates plus actual builtin/frozen inventory; network disabled; no authored execution",
                                 "kind": "pyodide-stdlib-availability", "pyodide": "0.28.3",
                                 "availability_sha256": self.availability}}
        self.index_bytes = assets.json_bytes(self.index)
        self.index_sha = assets.digest(self.index_bytes)

    def archive(self, name, version, files, local, *, url=None):
        files = {**files, "LICENSE": b"MIT fixture licence\n"}
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode="w:gz") as archive:
            for member, data in sorted(files.items()):
                info = tarfile.TarInfo("package/" + member)
                info.size = len(data)
                archive.addfile(info, io.BytesIO(data))
        raw = stream.getvalue()
        url = url or "https://registry.npmjs.org/" + name + "/-/" + name + "-" + version + ".tgz"
        self.fixture.archives[url] = raw
        return {"id": name, "version": version, "url": url, "sha256": assets.digest(raw),
                "prefix": "package/", "licence": "MIT", "licence_files": [local + "LICENSE"],
                "files": [{"member": member, "path": local + member, "sha256": assets.digest(data)}
                          for member, data in sorted(files.items())]}

    def compose(self, **kwargs):
        args = {"reviewed_partial_sha256": self.reviewed,
                "private_index_bytes": self.index_bytes, "reviewed_index_sha256": self.index_sha,
                "reviewed_availability_sha256": self.availability}
        args.update(kwargs)
        return assets.compose_asset_lock(self.partials, self.library, self.pins, self.cache, **args)

    def trust_modified_partial(self, part):
        self.reviewed[part["kind"]] = assets.digest(assets.json_bytes(part))

    def test_complete_inventory_rebuilt_and_carried_without_network(self):
        complete = self.compose()
        self.assertEqual(complete, self.compose())
        self.assertEqual(complete["kind"], "ctm-assets-lock")
        self.assertEqual(len(complete["scope"]), 9)
        self.assertEqual(complete["scope"], sorted(complete["versions"]))
        self.assertEqual(complete["private"]["import_index"]["sha256"], self.index_sha)
        self.assertFalse(any(".private-extensions" in name or "pyodide-lock.full" in name for name in complete["files"]))
        bundle = assets.build_from_lock(complete, self.root / "complete", self.cache)
        manifest = assets.verify_bundle(bundle, complete)
        self.assertEqual(manifest["versions"], complete["versions"])
        notices = (bundle / "THIRD-PARTY-NOTICES.md").read_text(encoding="utf-8")
        for name in complete["scope"]:
            self.assertIn("## " + name + "\n", notices)
        self.assertNotIn(self.partials[0]["files"]["manifest.json"], {complete["files"]["manifest.json"]})
        with patch.object(assets, "download", side_effect=AssertionError("carried install downloaded")):
            installed = assets.install_carried_bundle(complete, bundle, self.root / "carried")
        self.assertEqual(assets.inventory(installed), complete["files"])
        self.assertNotEqual(self.index["source"]["runtime_files"]["pyodide-lock.json"],
                            complete["files"]["pyodide/0.28.3/pyodide-lock.json"])

    def test_missing_duplicate_or_unreviewed_family_refused(self):
        baseline = copy.deepcopy(self.partials)
        for parts in (baseline[:-1], [baseline[0], baseline[0], baseline[2]]):
            self.partials = parts
            with self.subTest(parts=parts), self.assertRaises(assets.AssetError):
                self.compose()
        self.partials = copy.deepcopy(baseline)
        self.partials[0]["status"] = "changed after independent review"
        with self.assertRaises(assets.AssetError):
            self.compose()

    def test_actual_python_producer_output_composes(self):
        root = self.root / "actual-python-producer"
        root.mkdir()
        metadata, cache = python_tests.PythonSubsetTests().fixture(root)
        archive_bytes = (root / "official.tar.bz2").read_bytes()
        self.fixture.archives[metadata["archives"][0]["url"]] = archive_bytes
        with patch.object(assets.urllib.request, "build_opener", side_effect=AssertionError("network")):
            python = assets.produce_python_lock(metadata, cache)
        self.assertNotIn("version", python["archives"][0])
        self.partials[0] = python
        self.trust_modified_partial(python)
        subset = json.loads(next(item["text"] for item in python["generated"]
                                 if item["path"] == "pyodide/0.28.3/pyodide-lock.json"))
        self.index["packages"] = {name: {"imports": entry.get("imports", [])}
                                  for name, entry in subset["packages"].items()}
        self.index["source"]["sha256"] = metadata["archives"][0]["sha256"]
        with tarfile.open(fileobj=io.BytesIO(archive_bytes), mode="r:bz2") as archive:
            for name in self.index["source"]["runtime_files"]:
                self.index["source"]["runtime_files"][name] = assets.digest(archive.extractfile("pyodide/" + name).read())
        self.index_bytes = assets.json_bytes(self.index)
        self.index_sha = assets.digest(self.index_bytes)
        complete = self.compose()
        bundle = assets.build_from_lock(complete, self.root / "actual-complete", self.cache)
        self.assertEqual(assets.inventory(bundle), complete["files"])

    def test_reviewed_partial_cannot_publish_private_index(self):
        original = copy.deepcopy(self.partials[2])
        for path, text in ((".private-extensions/assets-imports.json", "reserved path"),
                           ("npm/innocent-name.json", self.index_bytes.decode())):
            board = copy.deepcopy(original)
            board["generated"].append({"path": path, "text": text,
                                        "sha256": assets.digest(text.encode())})
            board["files"] = assets.derive_lock_files(board, self.cache)
            self.partials[2] = board
            self.trust_modified_partial(board)
            with self.subTest(path=path), self.assertRaisesRegex(assets.AssetError, "must not enter public assets"):
                self.compose()

    def test_even_reviewed_bad_scope_or_inventory_refused(self):
        baseline = copy.deepcopy(self.partials)
        for key, value in (("scope", []), ("versions", {"pyodide": "9.9.9"}), ("files", {})):
            self.partials = copy.deepcopy(baseline)
            part = self.partials[0]
            part[key] = value
            self.trust_modified_partial(part)
            with self.subTest(key=key), self.assertRaises(assets.AssetError):
                self.compose()

    def test_cross_family_generated_collision_refused(self):
        board = self.partials[2]
        core_generated = copy.deepcopy(self.partials[1]["generated"][0])
        board["generated"].append(core_generated)
        board["files"] = assets.derive_lock_files(board, self.cache)
        self.trust_modified_partial(board)
        with self.assertRaisesRegex(assets.AssetError, "Conflicting bundle output"):
            self.compose()

    def test_reviewed_archive_version_mismatch_refused(self):
        part = self.partials[0]
        part["archives"][0]["version"] = "9.9.9"
        self.trust_modified_partial(part)
        with self.assertRaisesRegex(assets.AssetError, "archive version"):
            self.compose()

    def test_same_versions_with_changed_canonical_paths_refused(self):
        table = copy.deepcopy(self.fixture.table)
        table["assets"]["katex"]["local"] = "npm/moved-katex@{version}/"
        (self.library / "assets.json").write_bytes(assets.json_bytes(table))
        with self.assertRaisesRegex(assets.AssetError, "different canonical asset table"):
            self.compose()
        self.fixture.write_table()
        self.pins.write_text(self.pins.read_text(encoding="utf-8").replace("distrib/jsxgraphcore.js", "distrib/missing.js"), encoding="utf-8")
        with self.assertRaisesRegex(assets.AssetError, "different canonical pins"):
            self.compose()

    def test_complete_lock_stale_source_fingerprints_refused(self):
        complete = self.compose()
        table_path = self.library / "assets.json"
        runtime_path = self.library / "runtime/pyodide-runtime.js"
        for path in (table_path, runtime_path, self.pins):
            original = path.read_bytes()
            path.write_bytes(original + b"\n")
            with self.subTest(path=path), self.assertRaisesRegex(assets.AssetError, "canonical source bytes"):
                assets.validate_version_homes(complete, self.library, self.pins)
            path.write_bytes(original)

    def test_private_bytes_need_the_reviewed_digest(self):
        changed = copy.deepcopy(self.index)
        changed["stdlib_modules"].append("unreviewed_module")
        with self.assertRaises(assets.AssetError):
            self.compose(private_index_bytes=assets.json_bytes(changed))
        noncanonical = b" " + self.index_bytes
        with self.assertRaisesRegex(assets.AssetError, "canonical JSON bytes"):
            self.compose(private_index_bytes=noncanonical, reviewed_index_sha256=assets.digest(noncanonical))

    def test_private_schema_and_provenance_mutations_refused(self):
        original = copy.deepcopy(self.index)
        mutations = [
            lambda x: x.update(v=2),
            lambda x: x.update(extra="unsupported"),
            lambda x: x["source"].update(method="generic CPython candidates"),
            lambda x: x["source"].update(pyodide="0.27.2"),
            lambda x: x["source"].update(sha256="0" * 64),
            lambda x: x["source"].update(availability_sha256="0" * 64),
            lambda x: x["source"]["candidate_source"].update(url="https://github.com/python/cpython/blob/main/Python/stdlib_module_names.h"),
            lambda x: x["source"]["candidate_source"].update(git_blob_sha1="bad"),
            lambda x: x["source"]["runtime_files"].update({"pyodide.asm.wasm": "0" * 64}),
            lambda x: x.update(python="3.12.0"),
            lambda x: x["packages"]["numpy"].update(imports=["wrong_import"]),
            lambda x: x["packages"]["numpy"].update(extra="unsupported"),
        ]
        for mutation in mutations:
            changed = copy.deepcopy(original)
            mutation(changed)
            data = assets.json_bytes(changed)
            with self.subTest(changed=changed), self.assertRaises(assets.AssetError):
                self.compose(private_index_bytes=data, reviewed_index_sha256=assets.digest(data))

    def test_index_binding_is_reusable_by_installer(self):
        complete = self.compose()
        subset = self.partials[0]["generated"][0]["text"].encode()
        parsed = assets.validate_bound_import_index(self.index_bytes, complete["private"]["import_index"],
                                                   public_files=complete["files"], subset_bytes=subset)
        self.assertEqual(parsed, self.index)
        binding = copy.deepcopy(complete["private"]["import_index"])
        binding["path"] = "_ctm-assets/private-index.json"
        with self.assertRaises(assets.AssetError):
            assets.validate_bound_import_index(self.index_bytes, binding,
                                              public_files=complete["files"], subset_bytes=subset)


class DownloadCacheTests(unittest.TestCase):
    def test_predictable_partial_alias_cannot_overwrite_another_file(self):
        import tempfile
        for kind in ("symlink", "hardlink"):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                victim = root / "authored-answer.txt"
                victim.write_bytes(b"authored answer")
                destination = root / "cache-archive"
                alias = root / "cache-archive.partial"
                try:
                    if kind == "symlink":
                        alias.symlink_to(victim)
                    else:
                        os.link(victim, alias)
                except OSError as error:
                    if os.name == "nt":
                        continue  # Mandatory real aliases are exercised by Linux CI.
                    raise error
                data = b"verified archive bytes"
                url = "https://registry.npmjs.org/example/-/example-1.0.tgz"
                response = io.BytesIO(data)
                response.geturl = lambda: url
                opener = Mock()
                opener.open.return_value = response
                with patch.object(assets.urllib.request, "build_opener", return_value=opener):
                    assets.download(url, destination, sha256=assets.digest(data))
                self.assertEqual(destination.read_bytes(), data)
                self.assertEqual(victim.read_bytes(), b"authored answer")
                self.assertEqual(alias.read_bytes(), b"authored answer")
                self.assertEqual({path.name for path in root.iterdir()},
                                 {victim.name, destination.name, alias.name})


if __name__ == "__main__":
    unittest.main()

