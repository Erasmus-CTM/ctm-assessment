"""Deterministic PRIVATE PARTIAL Python lock producer contracts."""
import copy
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("ctm_assets", ROOT / "scripts/ctm_assets.py")
A = importlib.util.module_from_spec(spec)
spec.loader.exec_module(A)


def wheel(name, *, licence="MIT", text=True, duplicate=False):
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as out:
        out.writestr(f"{name}-1.0.dist-info/METADATA", f"Name: {name}\nVersion: 1.0\nLicense: {licence}\n")
        if text:
            out.writestr(f"{name}-1.0.dist-info/LICENSE", "Official fixture licence text\n")
        if duplicate:
            out.writestr(f"{name}-1.0.dist-info/METADATA", "License: MIT\n")
    return output.getvalue()


class PythonSubsetTests(unittest.TestCase):
    def fixture(self, root, *, extra=None, mutate=None):
        payloads, packages = {}, {}
        for name in sorted(set(A.normalise_package(name) for name in A.EXAM_PACKAGES) | {"dependency"}):
            data = wheel(name)
            filename = f"{name}-1.0.whl"
            payloads["pyodide/" + filename] = data
            packages[name] = {"name": name, "version": "1.0", "file_name": filename,
                              "sha256": A.digest(data), "imports": [name.replace("-", "_")],
                              "depends": ["dependency"] if name == "numpy" else [], "package_type": "package"}
        if extra:
            name, data, kind = extra
            payloads["pyodide/" + name + "-1.0.whl"] = data
            packages[name] = {"name": name, "version": "1.0", "file_name": name + "-1.0.whl",
                              "sha256": A.digest(data), "imports": [name], "depends": [], "package_type": kind}
        full = {"info": {"python": "3.13.2", "version": "0.28.0.dev0"}, "packages": packages}
        payloads.update({"pyodide/" + name: ("fixture-" + name).encode() for name in
                         ("pyodide.js", "pyodide.mjs", "pyodide.asm.js", "pyodide.asm.wasm", "python_stdlib.zip")})
        payloads["pyodide/package.json"] = A.json_bytes({"version": "0.28.3"})
        payloads["pyodide/pyodide-lock.json"] = A.json_bytes(full)
        if mutate:
            mutate(payloads, full)
        archive = root / "official.tar.bz2"
        with tarfile.open(archive, "w:bz2") as out:
            for name, data in payloads.items():
                info = tarfile.TarInfo(name)
                info.size = len(data)
                out.addfile(info, io.BytesIO(data))
        metadata = {"sources": {"pyodide": "0.28.3"}, "archives": [{
            "id": "pyodide", "version": "0.28.3",
            "url": "https://github.com/pyodide/pyodide/releases/download/0.28.3/pyodide-0.28.3.tar.bz2",
            "sha256": A.digest(archive.read_bytes())}]}
        cache = root / "cache"
        cache.mkdir()
        entry = metadata["archives"][0]
        target = cache / ("archive-" + A.digest(A.json_bytes({key: entry.get(key) for key in ("url", "sha256", "integrity")})))
        target.write_bytes(archive.read_bytes())
        return metadata, cache

    def test_actual_bytes_deterministic_build_and_carried_bundle(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            metadata, cache = self.fixture(root)
            with patch.object(A.urllib.request, "build_opener", side_effect=AssertionError("network")):
                first = A.produce_python_lock(metadata, cache)
                second = A.produce_python_lock(metadata, cache)
                self.assertEqual(A.json_bytes(first), A.json_bytes(second))
                self.assertEqual(first["scope"], ["pyodide"])
                self.assertIn("PRIVATE PARTIAL", first["status"])
                self.assertEqual(len(first["python_packages"]), len(A.EXAM_PACKAGES) + 1)
                bundle = A.build_from_lock(first, root / "bundle", cache)
                self.assertEqual(A.inventory(bundle), first["files"])
                subset = json.loads((bundle / "pyodide/0.28.3/pyodide-lock.json").read_bytes())
                self.assertEqual(set(subset["packages"]), set(first["python_packages"]))
                self.assertFalse(any("full" in name for name in A.inventory(bundle)))
                A.install_carried_bundle(first, bundle, root / "installed")
                self.assertEqual(A.inventory(root / "installed"), first["files"])
                tar = root / "carried.tar"
                with tarfile.open(tar, "w") as out:
                    out.add(bundle, arcname="_ctm-assets")
                A.install_carried_bundle(first, tar, root / "installed-tar")
                self.assertEqual(A.inventory(root / "installed-tar"), first["files"])
                victim = root / "installed-tar/pyodide/0.28.3/pyodide.js"
                victim.write_text("corrupt")
                with self.assertRaisesRegex(A.AssetError, "sha256 mismatch"):
                    A.verify_bundle(root / "installed-tar", first)

    def test_named_extras_never_guess_unknown_or_all(self):
        with tempfile.TemporaryDirectory() as tmp:
            metadata, cache = self.fixture(Path(tmp), extra=("extra", wheel("extra"), "package"))
            self.assertNotIn("extra", A.produce_python_lock(metadata, cache)["python_packages"])
            self.assertIn("extra", A.produce_python_lock(metadata, cache, extras=("extra",))["python_packages"])
            for name in ("all", "unknown", "unknown.module"):
                with self.subTest(name=name), self.assertRaises(A.AssetError):
                    A.produce_python_lock(metadata, cache, extras=(name,))

    def test_exact_official_release_and_archive_digest_required(self):
        with tempfile.TemporaryDirectory() as tmp:
            metadata, cache = self.fixture(Path(tmp))
            for key, value in (("url", "https://github.com/other/release.tar.bz2"),
                               ("sha256", ""), ("version", "0.28.4")):
                changed = copy.deepcopy(metadata)
                changed["archives"][0][key] = value
                with self.subTest(key=key), self.assertRaises(A.AssetError):
                    A.produce_python_lock(changed, cache)
            changed = copy.deepcopy(metadata)
            changed["sources"]["pyodide"] = "0.28.4"
            with self.assertRaises(A.AssetError):
                A.produce_python_lock(changed, cache)

    def test_payload_hash_and_actual_release_version_are_checked(self):
        for kind in ("payload", "release", "missing"):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as tmp:
                def mutate(payloads, full):
                    if kind == "payload":
                        payloads["pyodide/numpy-1.0.whl"] += b"tampered"
                    elif kind == "release":
                        payloads["pyodide/package.json"] = A.json_bytes({"version": "0.28.4"})
                    else:
                        del payloads["pyodide/numpy-1.0.whl"]
                metadata, cache = self.fixture(Path(tmp), mutate=mutate)
                with self.assertRaises(A.AssetError):
                    A.produce_python_lock(metadata, cache)

    def test_unknown_licence_missing_text_and_wrong_version_fail_closed(self):
        for licence, text in (("Unrecognised custom licence", True), ("MIT", False)):
            with self.subTest(licence=licence, text=text), tempfile.TemporaryDirectory() as tmp:
                metadata, cache = self.fixture(Path(tmp), extra=("extra", wheel("extra", licence=licence, text=text), "package"))
                with self.assertRaises(A.AssetError):
                    A.produce_python_lock(metadata, cache, extras=("extra",))
        with tempfile.TemporaryDirectory() as tmp:
            metadata, cache = self.fixture(Path(tmp))
            with self.assertRaisesRegex(A.AssetError, "exact package version"):
                A.produce_python_lock(metadata, cache, licence_policy={"numpy": {"version": "2.0", "licence": "MIT"}})

    def test_copyleft_extra_requires_consent_and_source_offer(self):
        with tempfile.TemporaryDirectory() as tmp:
            metadata, cache = self.fixture(Path(tmp), extra=("extra", wheel("extra", licence="LGPL-2.1"), "package"))
            with self.assertRaises(A.AssetError):
                A.produce_python_lock(metadata, cache, extras=("extra",))
            with self.assertRaisesRegex(A.AssetError, "source offer"):
                A.produce_python_lock(metadata, cache, extras=("extra",), accepted_licences=("LGPL-2.1",))
            policy = {"extra": {"version": "1.0", "licence": "LGPL-2.1", "source_offer": "https://example.test/source"}}
            lock = A.produce_python_lock(metadata, cache, extras=("extra",), licence_policy=policy, accepted_licences=("LGPL-2.1",))
            with self.assertRaises(A.AssetError):
                A.build_from_lock(lock, Path(tmp) / "bundle", cache)
            A.build_from_lock(lock, Path(tmp) / "bundle", cache, accepted_licences=("LGPL-2.1",))

    def test_private_lock_output_guard_preserves_public_destination(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for dirname in ("_ctm-assets", "_site", "_site-exam"):
                output = root / dirname / "candidate.json"
                output.parent.mkdir()
                output.write_bytes(b"existing")
                with self.subTest(dirname=dirname), self.assertRaises(A.AssetError):
                    A.write_private_lock({}, output)
                self.assertEqual(output.read_bytes(), b"existing")
            output = A.write_private_lock({"kind": "private"}, root / ".private/candidate.json")
            self.assertEqual(json.loads(output.read_bytes()), {"kind": "private"})

    def test_build_and_carried_clis_use_external_lock(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            metadata, cache = self.fixture(root)
            lock = A.produce_python_lock(metadata, cache)
            lockfile = A.write_private_lock(lock, root / "candidate.json")
            for args in (["build", "--cache", str(cache), "--bundle", str(root / "bundle")],
                         ["verify", "--bundle", str(root / "bundle")],
                         ["install-carried", "--source", str(root / "bundle"), "--bundle", str(root / "installed")]):
                result = subprocess.run([sys.executable, str(ROOT / "scripts/ctm_assets.py"), *args, "--lock", str(lockfile)],
                                         text=True, capture_output=True)
                self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(A.inventory(root / "installed"), lock["files"])


if __name__ == "__main__":
    unittest.main()
