"""Actual tar bytes and canonical materializer controls for the npm partial lock."""
import base64
import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("ctm_assets_npm_test", ROOT / "scripts/ctm_assets.py")
assets = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assets)


class NpmPartialLockTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.library = self.root / "library"
        (self.library / "runtime").mkdir(parents=True)
        package_names = {"font-awesome": "@fortawesome/fontawesome-free",
                         "katex": "katex", "mathjax3": "mathjax",
                         "monaco-editor": "monaco-editor",
                         "source-sans-pro": "@fontsource/source-sans-pro"}
        self.table = {"v": 1, "assets": {
            name: {"npm": package, "version": "3.2.2" if name == "mathjax3" else "1.2.3",
                   "cdn": "https://cdn.jsdelivr.net/npm/" + package + "@{version}/",
                   "local": "npm/" + package + "@{version}/"}
            for name, package in package_names.items()}}
        self.write_table()
        (self.library / "runtime/pyodide-runtime.js").write_text(
            "var indexURL = 'https://cdn.jsdelivr.net/pyodide/v0.28.3/full/';\n", encoding="utf-8")
        self.contents, self.archives = {}, {}
        for name, policy in assets.NPM_SELECTION.items():
            entry = self.table["assets"][name]
            files = {member: ("actual bytes " + member).encode() for member in policy["files"]}
            for prefix in policy.get("prefixes", ()):
                files[prefix + "retained-runtime.dat"] = b"runtime data"
            files["LICENSE"] = b"MIT licence fixture\n"
            files["src/do-not-ship.js"] = b"development-only"
            if name == "monaco-editor":
                files["ThirdPartyNotices.txt"] = b"runtime third-party notices\n"
            if name == "source-sans-pro":
                files["400.css"] = b"@font-face{src:url(./files/example.woff2)}"
                files["files/example.woff2"] = b"font"
            files["package.json"] = assets.json_bytes(
                {"name": entry["npm"], "version": entry["version"], "license": "MIT"})
            self.contents[name] = files
        self.metadata = {"v": 1, "kind": "official-asset-metadata",
                         "sources": assets.version_sources(self.library),
                         "source_refs": {"ctm-libs": "a" * 40}, "archives": []}
        self.refresh_archives()
        self.network = patch.object(assets, "download", side_effect=self.download)
        self.network.start()
        self.addCleanup(self.network.stop)

    def write_table(self):
        (self.library / "assets.json").write_bytes(assets.json_bytes(self.table))

    def refresh_archives(self):
        self.archives = {}
        self.metadata["archives"] = []
        for name, files in sorted(self.contents.items()):
            entry = self.table["assets"][name]
            data = io.BytesIO()
            with tarfile.open(fileobj=data, mode="w:gz") as archive:
                for member, value in sorted(files.items()):
                    info = tarfile.TarInfo("package/" + member)
                    info.size = len(value)
                    archive.addfile(info, io.BytesIO(value))
            raw = data.getvalue()
            url = ("https://registry.npmjs.org/" + entry["npm"] + "/-/"
                   + entry["npm"].split("/")[-1] + "-" + entry["version"] + ".tgz")
            self.archives[url] = raw
            self.metadata["archives"].append({
                "id": name, "npm": entry["npm"], "version": entry["version"],
                "url": url,
                "metadata_url": "https://registry.npmjs.org/" + entry["npm"].replace("/", "%2F") + "/" + entry["version"],
                "reported_licence": "MIT",
                "integrity": "sha512-" + base64.b64encode(hashlib.sha512(raw).digest()).decode()})

    def download(self, url, destination, *, sha256=None, integrity=None):
        raw = self.archives[url]
        assets.verify_bytes(raw, sha256=sha256, integrity=integrity)
        destination = Path(destination)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(raw)
        return destination

    def produce(self):
        return assets.produce_npm_lock(self.metadata, self.library, self.root / "cache")

    def test_actual_selection_deterministic_build_and_carried_offline(self):
        lock = self.produce()
        self.assertEqual(lock, self.produce())
        self.assertEqual(lock["scope"], sorted(self.table["assets"]))
        self.assertEqual(set(lock["versions"]), set(self.table["assets"]))
        self.assertEqual(lock["kind"], "private-partial-npm-assets-lock")
        self.assertNotIn("pyodide", lock["versions"])
        self.assertFalse(any("/src/" in name or "pyodide-lock.full" in name for name in lock["files"]))
        bundle = assets.build_from_lock(lock, self.root / "bundle", self.root / "cache")
        self.assertEqual(assets.inventory(bundle), lock["files"])
        with patch.object(assets, "download", side_effect=AssertionError("network used during carried install")):
            carried = assets.install_carried_bundle(lock, bundle, self.root / "installed")
        self.assertEqual(assets.inventory(carried), lock["files"])
        self.assertEqual((carried / "fonts/source-sans-pro.css").read_text(encoding="utf-8"),
                         ''.join('@import url("../npm/@fontsource/source-sans-pro@1.2.3/' + str(weight) + '.css");\n'
                                 for weight in (300, 400, 700)))
        self.assertIn("npm/@fontsource/source-sans-pro@1.2.3/400.css", lock["files"])
        self.assertTrue(any(name.endswith("ThirdPartyNotices.txt") for name in lock["files"]))
        self.assertIn("THIRD-PARTY-NOTICES.md", lock["files"])
        self.assertIn("fonts/source-sans-pro.css.gz", lock["files"])
        self.assertEqual(lock["provenance"]["metadata_sha256"], assets.digest(assets.json_bytes(self.metadata)))

    def test_changed_canonical_table_refused(self):
        self.table["assets"]["katex"]["version"] = "9.9.9"
        self.write_table()
        with self.assertRaisesRegex(assets.AssetError, "differs"):
            self.produce()

    def test_metadata_identity_controls(self):
        baseline = copy.deepcopy(self.metadata)
        mutations = [
            lambda m: m.update(v=2),
            lambda m: m.update(kind="candidate"),
            lambda m: m["archives"].append(copy.deepcopy(m["archives"][0])),
            lambda m: m["archives"].pop(),
            lambda m: m["archives"][0].update(id="unknown"),
            lambda m: m["archives"][0].update(npm="another-package"),
            lambda m: m["archives"][0].update(version="9.9.9"),
            lambda m: m["archives"][0].update(url="https://registry.npmjs.org/other/-/other-1.2.3.tgz"),
            lambda m: m["archives"][0].update(metadata_url="https://registry.npmjs.org/other/1.2.3"),
            lambda m: m["sources"].update(table_sha256="0" * 64),
        ]
        for mutation in mutations:
            self.metadata = copy.deepcopy(baseline)
            mutation(self.metadata)
            with self.subTest(metadata=self.metadata), self.assertRaises(assets.AssetError):
                self.produce()

    def test_archive_integrity_failure(self):
        url = next(iter(self.archives))
        self.archives[url] += b"tampered"
        with self.assertRaisesRegex(assets.AssetError, "integrity"):
            self.produce()

    def test_real_archive_package_identity_controls(self):
        for bad in ({"name": "wrong", "version": "1.2.3", "license": "MIT"},
                    {"name": "katex", "version": "9.9.9", "license": "MIT"},
                    {"name": "katex", "version": "1.2.3"},
                    {"name": "katex", "version": "1.2.3", "license": "GPL-3.0"}):
            self.contents["katex"]["package.json"] = assets.json_bytes(bad)
            self.refresh_archives()
            with self.subTest(bad=bad), self.assertRaises(assets.AssetError):
                self.produce()

    def test_missing_required_runtime_and_licence_controls(self):
        for package, member in (("katex", "dist/contrib/auto-render.mjs"),
                                ("mathjax3", "es5/tex-chtml-full.js"),
                                ("monaco-editor", "min/vs/base/worker/workerMain.js"),
                                ("monaco-editor", "ThirdPartyNotices.txt"),
                                ("source-sans-pro", "LICENSE")):
            saved = self.contents[package].pop(member)
            self.refresh_archives()
            with self.subTest(package=package, member=member), self.assertRaises(assets.AssetError):
                self.produce()
            self.contents[package][member] = saved

    def test_empty_licence_refused(self):
        self.contents["katex"]["LICENSE"] = b" \n"
        self.refresh_archives()
        with self.assertRaisesRegex(assets.AssetError, "empty"):
            self.produce()

    def test_new_table_entry_requires_policy(self):
        self.table["assets"]["future-package"] = copy.deepcopy(self.table["assets"]["katex"])
        self.write_table()
        with self.assertRaisesRegex(assets.AssetError, "selection policy"):
            self.produce()

    def test_cli_private_output_and_refused_published_destination(self):
        metadata = self.root / "metadata.json"
        metadata.write_bytes(assets.json_bytes(self.metadata))
        private = self.root / ".private-extensions/npm-lock.json"
        args = ["npm-lock", "--metadata", str(metadata), "--libs", str(self.library),
                "--cache", str(self.root / "cache"), "--output"]
        assets.main([*args, str(private)])
        self.assertEqual(json.loads(private.read_text(encoding="utf-8")), self.produce())
        for folder in ("_ctm-assets", "_site", "_site-exam"):
            published = self.root / folder / "npm-lock.json"
            with self.subTest(folder=folder), self.assertRaises(assets.AssetError):
                assets.main([*args, str(published)])
            self.assertFalse(published.exists())


if __name__ == "__main__":
    unittest.main()

