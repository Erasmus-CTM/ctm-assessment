"""Actual tar bytes and canonical builds; licence records here are fixtures."""
import base64
import copy
import io
import json
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import ctm_assets as assets
import ctm_board_assets as boards


class BoardLockTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.pins = self.root / "jsxgraph-pins.yml"
        self.pin_text = (
            "jsxgraph:\n"
            "  src_jxg: https://cdn.jsdelivr.net/npm/jsxgraph@1.2.3/distrib/jsxgraphcore.js\n"
            "  src_css: https://cdn.jsdelivr.net/npm/jsxgraph@1.2.3/distrib/jsxgraph.css\n"
            "  src_mjx: https://cdn.jsdelivr.net/npm/mathjax@1.2.3/tex-mml-svg.js\n"
            "  mjx_fonts: https://cdn.jsdelivr.net/npm/@mathjax/mathjax-newcm-font@1.2.3/\n")
        self.pins.write_text(self.pin_text, encoding="utf-8")
        self.canonical = boards.board_sources(self.pins)
        self.contents = {}
        for name, policy in boards.SELECTION.items():
            files = {member: ("runtime " + member).encode() for member in policy["files"]}
            for prefix in policy.get("prefixes", ()):
                files[prefix + ("fixture.woff2" if prefix.endswith("woff2/") else "runtime.js")] = b"runtime bytes"
            if name != "mathjax-newcm-font":
                files["LICENSE"] = b"MIT fixture\n" if name == "jsxgraph" else b"Apache fixture\n"
            files["src/development.js"] = b"not a JSXGraph runtime"
            files["package.json"] = assets.json_bytes({
                "name": self.canonical[name]["npm"], "version": "1.2.3",
                "license": "MIT" if name == "jsxgraph" else "Apache-2.0"})
            self.contents[name] = files
        self.contents["mathjax-newcm-font"]["svg/dynamic/extra-range.js"] = b"dynamic SVG glyph data"
        self.contents["mathjax-newcm-font"]["def/mathjax-newcm.ts"] = b"SVG and CHTML font definition fixture"
        self.contents["mathjax4"]["sre/mathmaps/extra.json"] = b'{"speech":"data"}'
        self.metadata = {"v": 1, "kind": "official-asset-metadata", "sources": {},
                         "archives": [], "source_refs": {"ctm-assessment": "a" * 40}}
        self.policy_file = self.root / "integration/assets-board-licences.json"
        self.policy_file.parent.mkdir()
        self.policy = {
            "v": 1, "kind": "reviewed-board-font-licences",
            "licence": "Apache-2.0 AND GUST-Font-License",
            "copyrights": ["Fixture font: GUST Font License -- http://tug.org/fonts/licenses/GUST-FONT-LICENSE.txt"],
            "evidence": {"report_sha256": "a" * 64, "report_git_blob_sha1": "b" * 40},
            "licences": {}}
        for name, source in {
                "apache": "https://github.com/mathjax/MathJax/blob/1.2.3/LICENSE",
                "gust": boards.GUST_SOURCE, "lppl": boards.LPPL_SOURCE}.items():
            relative = "integration/" + name + ".txt"
            data = (name + " licence text fixture\n").encode()
            (self.root / relative).write_bytes(data)
            self.policy["licences"][name] = {
                "file": relative, "source": source, "sha256": assets.digest(data),
                "git_blob_sha1": assets.git_blob_sha1(data)}
        self.refresh_archives()
        self.network = patch.object(assets, "download", side_effect=self.download)
        self.network.start()
        self.addCleanup(self.network.stop)

    def refresh_archives(self):
        self.archives = {}
        self.metadata["archives"] = []
        for name, files in sorted(self.contents.items()):
            item = self.canonical[name]
            data = io.BytesIO()
            with tarfile.open(fileobj=data, mode="w:gz") as archive:
                for member, raw in sorted(files.items()):
                    info = tarfile.TarInfo("package/" + member)
                    info.size = len(raw)
                    archive.addfile(info, io.BytesIO(raw))
            raw = data.getvalue()
            package = item["npm"]
            url = "https://registry.npmjs.org/" + package + "/-/" + package.split("/")[-1] + "-1.2.3.tgz"
            entry = {"id": name, "npm": package, "version": "1.2.3", "url": url,
                     "metadata_url": "https://registry.npmjs.org/" + package.replace("/", "%2F") + "/1.2.3",
                     "reported_licence": "MIT" if name == "jsxgraph" else "Apache-2.0",
                     "integrity": "sha512-" + base64.b64encode(__import__("hashlib").sha512(raw).digest()).decode()}
            self.archives[url] = raw
            self.metadata["archives"].append(entry)
            if name == "mathjax-newcm-font":
                self.policy["font"] = {key: entry[key] for key in
                                       ("npm", "version", "url", "integrity", "reported_licence")}
                self.policy["evidence"]["definition_member"] = "package/def/mathjax-newcm.ts"
                self.policy["evidence"]["definition_sha256"] = assets.digest(files["def/mathjax-newcm.ts"])
                self.policy["member_sha256"] = {
                    member: assets.digest(value) for member, value in files.items()
                    if member.startswith("chtml/woff2/") and member.endswith(".woff2")}
        self.write_policy()

    def write_policy(self):
        self.policy_file.write_bytes(assets.json_bytes(self.policy))

    def download(self, url, destination, *, sha256=None, integrity=None):
        raw = self.archives[url]
        assets.verify_bytes(raw, sha256=sha256, integrity=integrity)
        destination = Path(destination)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(raw)
        return destination

    def produce(self):
        return boards.produce_board_lock(self.metadata, self.pins, self.root / "cache", licence_root=self.root)

    def test_actual_bytes_full_runtime_closure_deterministic_and_carried(self):
        lock = self.produce()
        self.assertEqual(lock, self.produce())
        self.assertEqual(lock["kind"], "private-partial-board-assets-lock")
        self.assertEqual(lock["scope"], sorted(boards.PACKAGES))
        self.assertEqual(lock["versions"], assets.board_versions(self.pins))
        self.assertEqual(lock["provenance"]["board_pins_sha256"], assets.digest(self.pins.read_bytes()))
        for name, source in self.canonical.items():
            local = source["local"]
            for member in self.contents[name]:
                retained = name != "jsxgraph" or member.startswith("distrib/") or member == "LICENSE"
                self.assertEqual(local + member in lock["files"], retained, (name, member))
        self.assertTrue(any(path.endswith("/extra-range.js") for path in lock["files"]))
        self.assertTrue(any(path.endswith("/extra.json") for path in lock["files"]))
        font, = [entry for entry in lock["archives"] if entry["id"] == "mathjax-newcm-font"]
        self.assertEqual(font["licence"], "Apache-2.0 AND GUST-Font-License")
        self.assertEqual(len(font["licence_files"]), 4)
        bundle = assets.build_from_lock(lock, self.root / "bundle", self.root / "cache")
        self.assertEqual(assets.inventory(bundle), lock["files"])
        with patch.object(assets, "download", side_effect=AssertionError("carried install used network")):
            carried = assets.install_carried_bundle(lock, bundle, self.root / "carried")
        self.assertEqual(assets.inventory(carried), lock["files"])

    def test_pin_version_and_path_contract(self):
        mutations = [
            self.pin_text.replace("jsxgraph@1.2.3", "jsxgraph@1"),
            self.pin_text.replace("jsxgraph.css", "wrong.css"),
            self.pin_text.replace("src_css: https://cdn.jsdelivr.net/npm/jsxgraph@1.2.3", "src_css: https://cdn.jsdelivr.net/npm/jsxgraph@1.2.4"),
            self.pin_text.replace("font@1.2.3/", "font@1.2.3"),
            self.pin_text + "  src_css: duplicate\n",
            self.pin_text.replace("mathjax@1.2.3", "mathjax@1.2.4"),
        ]
        for text in mutations:
            with self.subTest(pins=text):
                self.pins.write_text(text, encoding="utf-8")
                with self.assertRaises(assets.AssetError):
                    self.produce()
        self.pins.write_text(self.pin_text, encoding="utf-8")

    def test_metadata_identity_and_required_sha512(self):
        baseline = copy.deepcopy(self.metadata)
        mutations = [
            lambda m: m.update(v=2),
            lambda m: m.update(kind="candidate"),
            lambda m: m["archives"].append(copy.deepcopy(m["archives"][0])),
            lambda m: m["archives"].pop(),
            lambda m: m["archives"][0].update(id="unexpected"),
            lambda m: m["archives"][0].update(npm="other"),
            lambda m: m["archives"][0].update(url="http://registry.npmjs.org/other.tgz"),
            lambda m: m["archives"][0].update(metadata_url="https://registry.npmjs.org/other/1.2.3"),
            lambda m: m["archives"][0].pop("integrity"),
        ]
        for mutation in mutations:
            self.metadata = copy.deepcopy(baseline)
            mutation(self.metadata)
            with self.subTest(metadata=self.metadata), self.assertRaises(assets.AssetError):
                self.produce()

    def test_real_archive_integrity_and_package_identity(self):
        url = next(iter(self.archives))
        self.archives[url] += b"tamper"
        with self.assertRaisesRegex(assets.AssetError, "integrity"):
            self.produce()
        self.refresh_archives()
        self.contents["mathjax4"]["package.json"] = assets.json_bytes(
            {"name": "wrong", "version": "1.2.3", "license": "Apache-2.0"})
        self.refresh_archives()
        with self.assertRaisesRegex(assets.AssetError, "package.json"):
            self.produce()

    def test_no_generic_missing_licence_exception(self):
        with self.assertRaisesRegex(assets.AssetError, "root licence text"):
            assets.select_npm_archives(self.metadata, self.canonical, boards.SELECTION, self.root / "cache")

    def test_curated_font_policy_tampering_refused(self):
        baseline = copy.deepcopy(self.policy)
        mutations = [
            lambda p: p["font"].update(version="9.9.9"),
            lambda p: p["font"].update(integrity="sha512-wrong"),
            lambda p: p.update(licence="Apache-2.0"),
            lambda p: p.update(copyrights=[]),
            lambda p: p.update(evidence={}),
            lambda p: p["evidence"].update(definition_sha256="0" * 64),
            lambda p: p["member_sha256"].update({"chtml/woff2/fixture.woff2": "0" * 64}),
            lambda p: p["licences"].pop("gust"),
            lambda p: p["licences"]["gust"].update(source="https://example.invalid/GUST.txt"),
            lambda p: p["licences"]["lppl"].update(sha256="0" * 64),
            lambda p: p["licences"]["apache"].update(git_blob_sha1="0" * 40),
        ]
        for mutation in mutations:
            self.policy = copy.deepcopy(baseline)
            mutation(self.policy)
            self.write_policy()
            with self.subTest(policy=self.policy), self.assertRaises(assets.AssetError):
                self.produce()
        self.policy = baseline
        self.write_policy()
        (self.root / "integration/gust.txt").write_text("tampered licence", encoding="utf-8")
        with self.assertRaisesRegex(assets.AssetError, "primary source bytes"):
            self.produce()

    def test_missing_runtime_directories_and_font_evidence_refused(self):
        for name, member in (("mathjax4", "sre/mathmaps/base.json"),
                             ("jsxgraph", "distrib/jsxgraph.css"),
                             ("mathjax-newcm-font", "svg.js"),
                             ("mathjax-newcm-font", "chtml/dynamic/runtime.js")):
            saved = self.contents[name].pop(member)
            self.refresh_archives()
            with self.subTest(name=name, member=member), self.assertRaises(assets.AssetError):
                self.produce()
            self.contents[name][member] = saved
        self.refresh_archives()
        self.policy["member_sha256"] = {}
        self.write_policy()
        with self.assertRaisesRegex(assets.AssetError, "WOFF2"):
            self.produce()

    def test_private_cli_and_published_destination_refusal(self):
        metadata = self.root / "metadata.json"
        metadata.write_bytes(assets.json_bytes(self.metadata))
        output = self.root / ".private-extensions/board-lock.json"
        args = ["--metadata", str(metadata), "--pins", str(self.pins), "--cache", str(self.root / "cache"),
                "--licence-root", str(self.root), "--output"]
        boards.main([*args, str(output)])
        self.assertEqual(json.loads(output.read_text()), self.produce())
        for name in ("_ctm-assets", "_site", "_site-exam"):
            with self.subTest(name=name), self.assertRaises(assets.AssetError):
                boards.main([*args, str(self.root / name / "board-lock.json")])


if __name__ == "__main__":
    unittest.main()
