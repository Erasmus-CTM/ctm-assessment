"""Focused preparation tests use tiny real canonical bundles, not a full asset claim."""
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
import ctm_assets as assets
import ctm_asset_install as install


class Preparation(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.project = self.root / "course"
        self.workspace = self.root / "workspace"
        self.library = self.root / "library"
        self.cache = self.root / "cache"
        self.project.mkdir()
        self.library.mkdir()
        (self.library / "runtime").mkdir()
        (self.project / "_extensions" / "old").mkdir(parents=True)
        (self.project / "_extensions/old/source").write_bytes(b"old extension")
        (self.project / "_ctm-assets").mkdir()
        (self.project / "_ctm-assets/old.js").write_bytes(b"old assets")
        (self.project / ".private-extensions").mkdir()
        (self.project / ".private-extensions/assets-imports.json").write_bytes(b"old private index")
        (self.project / ".gitignore").write_bytes(b"keep\n")
        self.release, self.python = "0.28.3", "3.13.2"
        table = {"v": 1, "assets": {name: {"version": version, "npm": package,
                 "local": "npm/" + package + "@{version}/", "cdn": "https://cdn.test/"}
                 for name, version, package in [
                     ("monaco-editor", "0.46.0", "monaco-editor"), ("katex", "0.16.47", "katex"),
                     ("font-awesome", "6.5.1", "@fortawesome/fontawesome-free"),
                     ("mathjax3", "3.2.2", "mathjax"), ("source-sans-pro", "5.3.0", "@fontsource/source-sans-pro")]}}
        (self.library / "assets.json").write_bytes(assets.json_bytes(table))
        (self.library / "runtime/pyodide-runtime.js").write_text(
            "var indexURL = 'https://cdn.jsdelivr.net/pyodide/v0.28.3/full/';\n", encoding="utf-8")
        self.pins = self.root / "jsxgraph-pins.yml"
        self.pins.write_text("jsxgraph:\n"
            "  src_jxg: https://cdn.jsdelivr.net/npm/jsxgraph@1.14.1/distrib/jsxgraphcore.js\n"
            "  src_css: https://cdn.jsdelivr.net/npm/jsxgraph@1.14.1/distrib/jsxgraph.css\n"
            "  src_mjx: https://cdn.jsdelivr.net/npm/mathjax@4.0.0/tex-mml-svg.js\n"
            "  mjx_fonts: https://cdn.jsdelivr.net/npm/@mathjax/mathjax-newcm-font@4.0.0/\n", encoding="utf-8")
        self.archives = {}
        self.archive_dir = self.root / "archives"
        self.archive_dir.mkdir()
        self.runtime = {
            "pyodide.js": b"fixture javascript", "pyodide.mjs": b"fixture module",
            "pyodide.asm.js": b"fixture assembly javascript", "pyodide.asm.wasm": b"fixture wasm",
            "python_stdlib.zip": b"fixture stdlib",
            "package.json": assets.json_bytes({"version": self.release}),
        }
        full_lock = {"info": {"python": self.python}, "packages": {
            "numpy": {"imports": ["numpy"]}, "networkx": {"imports": ["networkx"]}}}
        full_bytes = assets.json_bytes(full_lock)
        subset_bytes = assets.json_bytes({"info": {"python": self.python},
                                         "packages": {"numpy": {"imports": ["numpy"]}}})
        files = dict(self.runtime, **{"pyodide-lock.json": full_bytes, "LICENSE": b"MIT fixture"})
        source_url = "https://github.com/pyodide/pyodide/releases/download/0.28.3/pyodide-0.28.3.tar.bz2"
        py_archive = self.archive("pyodide", source_url, files, "pyodide/", "pyodide/0.28.3/",
                                  selected=set(self.runtime) | {"LICENSE"})
        versions = {name: value["version"] for name, value in table["assets"].items()}
        versions.update({"pyodide": self.release, "jsxgraph": "1.14.1",
                         "mathjax4": "4.0.0", "mathjax-newcm-font": "4.0.0"})
        archive_entries = [py_archive]
        for name in sorted(set(versions) - {"pyodide"}):
            archive_entries.append(self.archive(name, "https://registry.npmjs.org/" + name + "/fixture.tgz",
                {"runtime.js": ("fixture " + name).encode(), "LICENSE": b"MIT fixture"},
                "package/", "npm/" + name + "@fixture/"))
        runtime_hashes = {name: assets.digest(data) for name, data in dict(self.runtime, **{"pyodide-lock.json": full_bytes}).items()}
        candidate_source = {"url": "https://github.com/python/cpython/blob/v3.13.2/Python/stdlib_module_names.h",
                            "git_blob_sha1": "a" * 40}
        method = "Successful imports of trusted release stdlib candidates plus actual builtin/frozen inventory; network disabled; no authored execution"
        source = {"url": source_url, "sha256": py_archive["sha256"],
                  "runtime_files": runtime_hashes, "candidate_source": candidate_source, "method": method}
        candidates = {"v": 1, "python": self.python, "modules": ["json", "math"], "source": candidate_source}
        report = {"v": 2, "kind": "pyodide-stdlib-availability", "python": self.python,
                  "pyodide": self.release, "source": source, "modules": ["json", "math"], "unavailable": {}}
        core = self.root / "probe-core"
        core.mkdir()
        for name, data in dict(self.runtime, **{"pyodide-lock.json": full_bytes}).items():
            (core / name).write_bytes(data)
        (core / "probe-input.json").write_bytes(assets.json_bytes({
            "v": 1, "python": self.python, "pyodide": self.release,
            "candidates": candidates["modules"], "candidate_source": candidate_source,
            "source": {"url": source_url, "sha256": py_archive["sha256"]},
            "runtime_files": runtime_hashes}))
        report_bytes = assets.json_bytes(report)
        self.index = assets.private_import_index_from_availability(report_bytes, core,
            reviewed_report_sha256=assets.digest(report_bytes), candidates=candidates)
        self.index_bytes = assets.json_bytes(self.index)
        self.lock = {"v": 1, "kind": "ctm-assets-lock", "scope": sorted(versions), "versions": versions,
            "archives": archive_entries,
            "generated": [{"path": "pyodide/0.28.3/pyodide-lock.json",
                           "text": subset_bytes.decode(), "sha256": assets.digest(subset_bytes)}],
            "provenance": {
                "table_sha256": assets.version_sources(self.library)["table_sha256"],
                "runtime_sha256": assets.version_sources(self.library)["runtime_sha256"],
                "board_pins_sha256": assets.digest(self.pins.read_bytes())},
            "private": {"import_index": {
                "path": ".private-extensions/assets-imports.json", "sha256": assets.digest(self.index_bytes),
                "availability_sha256": assets.digest(report_bytes), "pyodide": self.release,
                "python": self.python, "archive_sha256": py_archive["sha256"],
                "source_url": source_url, "runtime_files": runtime_hashes}}}
        with patch.object(assets, "download", self.download):
            self.lock["files"] = assets.derive_lock_files(self.lock, self.cache)
            self.bundle = assets.build_from_lock(self.lock, self.root / "fixture-bundle", self.cache)
        self.envelope = self.root / "carried"
        shutil.copytree(self.bundle, self.envelope / "_ctm-assets")
        (self.envelope / ".private-extensions").mkdir()
        (self.envelope / ".private-extensions/assets-imports.json").write_bytes(self.index_bytes)

    def tearDown(self):
        self.temporary.cleanup()

    def archive(self, name, url, files, prefix, destination, selected=None):
        path = self.archive_dir / (name + ".tgz")
        with tarfile.open(path, "w:gz") as archive:
            for relative, data in sorted(files.items()):
                info = tarfile.TarInfo(prefix + relative)
                info.size, info.mode, info.mtime = len(data), 0o644, 0
                archive.addfile(info, io.BytesIO(data))
        self.archives[url] = path
        selected = set(files) if selected is None else selected
        return {"id": name, "url": url, "sha256": assets.digest(path.read_bytes()),
                "prefix": prefix, "licence": "MIT", "licence_files": [destination + "LICENSE"],
                "files": [{"member": relative, "path": destination + relative, "sha256": assets.digest(files[relative])}
                          for relative in sorted(selected)]}

    def download(self, url, destination, **checks):
        data = self.archives[url].read_bytes()
        assets.verify_bytes(data, **checks)
        Path(destination).parent.mkdir(parents=True, exist_ok=True)
        Path(destination).write_bytes(data)
        return Path(destination)

    def state(self):
        return {path.relative_to(self.project).as_posix(): ("directory" if path.is_dir() else path.read_bytes())
                for path in self.project.rglob("*")}

    def prepare(self, lock=None, **kwargs):
        lock = self.lock if lock is None else lock
        options = {"carried_root": self.envelope}
        options.update(kwargs)
        return install.prepare_offline_assets(self.project, self.workspace, lock, self.library, self.pins,
            reviewed_lock_sha256=assets.digest(assets.json_bytes(lock)), **options)

    def bound_index(self, lock, index):
        data = assets.json_bytes(index)
        lock["private"]["import_index"]["sha256"] = assets.digest(data)
        (self.envelope / ".private-extensions/assets-imports.json").write_bytes(data)
        return data

    def rebuild_envelope(self, lock):
        self.rebuilt = getattr(self, "rebuilt", 0) + 1
        with patch.object(assets, "download", self.download):
            lock["files"] = assets.derive_lock_files(lock, self.cache)
            bundle = assets.build_from_lock(lock, self.root / ("rebuilt-" + str(self.rebuilt)), self.cache)
        shutil.rmtree(self.envelope / "_ctm-assets")
        shutil.copytree(bundle, self.envelope / "_ctm-assets")

    def test_public_subset_python_is_checked_after_successful_hash_verification(self):
        lock = copy.deepcopy(self.lock)
        subset = json.loads(lock["generated"][0]["text"])
        subset["info"]["python"] = "3.12.0"
        data = assets.json_bytes(subset)
        lock["generated"][0].update(text=data.decode(), sha256=assets.digest(data))
        self.rebuild_envelope(lock)
        before = self.state()
        with self.assertRaisesRegex(assets.AssetError, "Python"):
            self.prepare(lock)
        self.assertEqual(self.state(), before)

    def test_actual_package_version_cannot_be_replaced_by_matching_file_hashes(self):
        lock, index = copy.deepcopy(self.lock), copy.deepcopy(self.index)
        entry = next(item for item in lock["archives"] if item["id"] == "pyodide")
        with tarfile.open(self.archives[entry["url"]]) as archive:
            files = {member.name[len("pyodide/"):]: archive.extractfile(member).read()
                     for member in archive.getmembers() if member.isfile()}
        files["package.json"] = assets.json_bytes({"version": "0.27.2"})
        new = self.archive("pyodide", entry["url"], files, "pyodide/", "pyodide/0.28.3/",
                           selected=set(self.runtime) | {"LICENSE"})
        lock["archives"] = [new if item["id"] == "pyodide" else item for item in lock["archives"]]
        descriptor = lock["private"]["import_index"]
        descriptor["archive_sha256"] = new["sha256"]
        index["source"]["sha256"] = new["sha256"]
        descriptor["runtime_files"]["package.json"] = assets.digest(files["package.json"])
        index["source"]["runtime_files"]["package.json"] = descriptor["runtime_files"]["package.json"]
        self.bound_index(lock, index)
        self.rebuild_envelope(lock)
        before = self.state()
        with self.assertRaises(assets.AssetError):
            self.prepare(lock)
        self.assertEqual(self.state(), before)

    def test_index_canonical_bytes_and_missing_sidecar_refused(self):
        lock = copy.deepcopy(self.lock)
        data = self.index_bytes + b" "
        lock["private"]["import_index"]["sha256"] = assets.digest(data)
        sidecar = self.envelope / ".private-extensions/assets-imports.json"
        sidecar.write_bytes(data)
        with self.assertRaises(assets.AssetError): self.prepare(lock)
        sidecar.unlink()
        with self.assertRaises(assets.AssetError): self.prepare()

    def test_carried_has_no_network_and_preserves_all_project_bytes(self):
        before = self.state()
        with patch.object(assets, "download", side_effect=AssertionError("network forbidden")):
            plan = self.prepare()
        self.assertEqual(self.state(), before)
        self.assertEqual(assets.inventory(plan.staged_bundle), self.lock["files"])
        self.assertEqual(plan.staged_private_index.read_bytes(), self.index_bytes)
        self.assertNotIn("assets-imports.json", assets.inventory(plan.staged_bundle))
        edits = {edit.path: edit for edit in plan.profile_plan}
        self.assertEqual(set(edits), {"_quarto-offline.yml", "_quarto-exam.yml", ".gitignore"})
        self.assertIn(b'course-exam', edits["_quarto-exam.yml"].data)
        self.assertIn(b'save: answers', edits["_quarto-exam.yml"].data)
        self.assertIn(b'export: true', edits["_quarto-exam.yml"].data)
        self.assertIn(b'enabled: false', edits["_quarto-exam.yml"].data)
        self.assertEqual(edits[".gitignore"].previous_sha256, assets.digest(b"keep\n"))

    def test_repeated_plan_and_noncarried_canonical_build_are_equal(self):
        before = self.state()
        first = self.prepare()
        second = self.prepare()
        with patch.object(assets, "download", self.download):
            third = self.prepare(carried_root=None, private_index_bytes=self.index_bytes, cache=self.cache)
        self.assertEqual(first.profile_plan, second.profile_plan)
        self.assertEqual(first.profile_plan, third.profile_plan)
        self.assertEqual(assets.inventory(first.staged_bundle), assets.inventory(third.staged_bundle))
        self.assertEqual(self.state(), before)

    def test_authored_profiles_are_preserved_and_system_font_plan_is_available(self):
        for name in ("_quarto-offline.yml", "_quarto-exam.yml"):
            (self.project / name).write_bytes(b"authored profile \xff\n")
        before = self.state()
        plan = self.prepare(website=False, course_key="chosen")
        self.assertEqual([edit.path for edit in plan.profile_plan], [".gitignore"])
        self.assertEqual(self.state(), before)
        for name in ("_quarto-offline.yml", "_quarto-exam.yml"):
            (self.project / name).unlink()
        plan = self.prepare(website=False, course_key="chosen")
        edits = {edit.path: edit.data for edit in plan.profile_plan}
        self.assertIn(b"offline-system.scss", edits["_quarto-offline.yml"])
        self.assertIn(b"chosen-exam", edits["_quarto-exam.yml"])

    def test_partial_missing_version_and_path_collisions_refused_before_stage(self):
        cases = []
        for key, value in [("kind", "private-partial-python-assets-lock"), ("scope", ["pyodide"])]:
            lock = copy.deepcopy(self.lock); lock[key] = value; cases.append(lock)
        lock = copy.deepcopy(self.lock); del lock["versions"]["katex"]; cases.append(lock)
        lock = copy.deepcopy(self.lock); lock["archives"].pop(); cases.append(lock)
        for extra in ("../escape", "A.js", "parent", "assets-imports.json"):
            lock = copy.deepcopy(self.lock)
            if extra == "A.js":
                lock["files"]["a.js"] = "a" * 64
            if extra == "parent":
                lock["files"]["parent/child"] = "a" * 64
            lock["files"][extra] = "a" * 64
            cases.append(lock)
        before = self.state()
        for lock in cases:
            with self.subTest(kind=lock.get("kind"), scope=lock.get("scope")):
                with self.assertRaises(assets.AssetError):
                    self.prepare(lock)
                self.assertFalse(self.workspace.exists())
                self.assertEqual(self.state(), before)

    def test_same_version_source_path_and_runtime_changes_are_refused_before_stage(self):
        changes = [
            (self.library / "assets.json",
             lambda data: data.replace(b"npm/monaco-editor@", b"relocated/monaco-editor@")),
            (self.library / "runtime/pyodide-runtime.js", lambda data: data + b"// changed source bytes\n"),
            (self.pins, lambda data: data.replace(b"jsxgraphcore.js", b"different-script.js")),
        ]
        before = self.state()
        for file, change in changes:
            original = file.read_bytes()
            file.write_bytes(change(original))
            try:
                with self.assertRaises(assets.AssetError): self.prepare()
                self.assertFalse(self.workspace.exists())
                self.assertEqual(self.state(), before)
            finally:
                file.write_bytes(original)

    def test_external_reviewed_lock_digest_is_required(self):
        before = self.state()
        with self.assertRaisesRegex(assets.AssetError, "reviewed lock sha256"):
            install.prepare_offline_assets(self.project, self.workspace, self.lock, self.library, self.pins,
                reviewed_lock_sha256="0" * 64, carried_root=self.envelope)
        self.assertEqual(self.state(), before)
        self.assertFalse(self.workspace.exists())

    def test_index_python_provenance_and_selected_import_mutations_refused(self):
        mutations = [
            lambda index: index.update(python="3.12.0"),
            lambda index: index["source"].update(kind="generic-cpython"),
            lambda index: index["source"].update(availability_sha256="a" * 64),
            lambda index: index["packages"]["numpy"].update(imports=["different"]),
            lambda index: index["stdlib_modules"].append("math"),
        ]
        before = self.state()
        for change in mutations:
            lock, index = copy.deepcopy(self.lock), copy.deepcopy(self.index)
            change(index); self.bound_index(lock, index)
            with self.assertRaises(assets.AssetError):
                self.prepare(lock)
            self.assertEqual(self.state(), before)
        (self.envelope / ".private-extensions/assets-imports.json").write_bytes(self.index_bytes)

    def test_runtime_provenance_must_match_actual_public_files(self):
        lock, index = copy.deepcopy(self.lock), copy.deepcopy(self.index)
        lock["private"]["import_index"]["runtime_files"]["pyodide.js"] = "a" * 64
        index["source"]["runtime_files"]["pyodide.js"] = "a" * 64
        self.bound_index(lock, index)
        before = self.state()
        with self.assertRaisesRegex(assets.AssetError, "runtime"):
            self.prepare(lock)
        self.assertEqual(self.state(), before)

    def test_wrong_hash_extra_file_and_extra_empty_directory_refused(self):
        before = self.state()
        target = self.envelope / "_ctm-assets/pyodide/0.28.3/pyodide.js"
        original = target.read_bytes()
        target.write_bytes(b"corrupt")
        with self.assertRaises(assets.AssetError): self.prepare()
        target.write_bytes(original)
        extra = self.envelope / "extra"
        extra.write_bytes(b"extra")
        with self.assertRaises(assets.AssetError): self.prepare()
        extra.unlink()
        extra.mkdir()
        with self.assertRaisesRegex(assets.AssetError, "extra carried directory"): self.prepare()
        self.assertEqual(self.state(), before)

    def test_project_cache_workspace_and_carried_stage_collisions_refused(self):
        before = self.state()
        for options in ({"cache": self.project / "cache"},):
            with self.assertRaises(assets.AssetError): self.prepare(**options)
        for workspace in (self.project / "stage", self.envelope / "stage", self.library / "stage"):
            with self.assertRaises(assets.AssetError):
                install.prepare_offline_assets(self.project, workspace, self.lock, self.library, self.pins,
                    reviewed_lock_sha256=assets.digest(assets.json_bytes(self.lock)), carried_root=self.envelope)
        self.assertEqual(self.state(), before)

    def test_failed_build_cleans_stage_and_keeps_project_unchanged(self):
        before = self.state()
        def fail(lock, destination, cache, **kwargs):
            destination.mkdir()
            (destination / "partial").write_bytes(b"unfinished")
            raise assets.AssetError("controlled preparation failure")
        with patch.object(assets, "build_from_lock", side_effect=fail):
            with self.assertRaisesRegex(assets.AssetError, "controlled preparation failure"):
                self.prepare(carried_root=None, private_index_bytes=self.index_bytes)
        self.assertEqual(list(self.workspace.iterdir()), [])
        self.assertEqual(self.state(), before)

    def test_carried_regular_hardlink_is_refused_even_with_matching_bytes(self):
        target = self.project / ".private-extensions/assets-imports.json"
        target.write_bytes(self.index_bytes)
        linked = self.envelope / ".private-extensions/assets-imports.json"
        linked.unlink()
        try:
            os.link(target, linked)
        except OSError as error:
            self.skipTest("real hardlink creation unavailable: " + str(error))
        before = self.state()
        with self.assertRaisesRegex(assets.AssetError, "hardlink"):
            self.prepare()
        self.assertEqual(self.state(), before)

    def test_cache_partial_hardlink_cannot_alias_project_bytes(self):
        target = self.project / "_extensions/old/source"
        archive = self.lock["archives"][0]
        name = "archive-" + assets.digest(assets.json_bytes(
            {key: archive.get(key) for key in ("url", "sha256", "integrity")})) + ".partial"
        try:
            os.link(target, self.cache / name)
        except OSError as error:
            self.skipTest("real hardlink creation unavailable: " + str(error))
        before = self.state()
        with patch.object(assets, "download", self.download):
            with self.assertRaisesRegex(assets.AssetError, "hardlink"):
                self.prepare(carried_root=None, private_index_bytes=self.index_bytes, cache=self.cache)
        self.assertEqual(self.state(), before)
        self.assertFalse(self.workspace.exists())

    @unittest.skipIf(os.name == "nt", "Windows does not expose POSIX execute permission bits")
    def test_executable_carried_file_refused(self):
        file = self.envelope / ".private-extensions/assets-imports.json"
        file.chmod(0o755)
        try:
            with self.assertRaisesRegex(assets.AssetError, "non-executable"): self.prepare()
        finally:
            file.chmod(0o644)

    def test_symlink_ancestors_envelope_and_profiles_refused(self):
        link = self.root / "linked-envelope"
        try:
            link.symlink_to(self.envelope, target_is_directory=True)
        except OSError as error:
            self.skipTest("real symlink creation unavailable: " + str(error))
        before = self.state()
        with self.assertRaises(assets.AssetError): self.prepare(carried_root=link)
        metadata = self.library / "assets.json"
        original_metadata = metadata.read_bytes()
        metadata.unlink()
        metadata.symlink_to(self.pins)
        with self.assertRaises(assets.AssetError): self.prepare()
        metadata.unlink()
        metadata.write_bytes(original_metadata)
        profile = self.project / "_quarto-offline.yml"
        profile.symlink_to(self.pins)
        with self.assertRaises(assets.AssetError): self.prepare()
        profile.unlink()
        linked_file = self.envelope / "linked-source"
        linked_file.symlink_to(self.pins)
        with self.assertRaises(assets.AssetError): self.prepare()
        self.assertEqual(self.state(), before)


if __name__ == "__main__":
    unittest.main()
