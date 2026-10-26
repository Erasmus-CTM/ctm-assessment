#!/usr/bin/env python3
"""Bind the exam's executable worker files to the canonical complete asset lock.

The old frozen asset inspector remains unchanged. This extension accepts only
clean, exact Git source bytes and checks the actual rendered deployment copies.
"""
from __future__ import annotations

import argparse
import gzip
import json
from pathlib import Path
import re
import subprocess

import ctm_assets as assets

SOURCES = {
    "ctm-libs": [
        "_extensions/ctm-libs/runtime/pyodide-runtime.js",
        "_extensions/ctm-libs/runtime/pyodide-worker.js",
        "_extensions/ctm-libs/runtime/pyodide-worker-core.js",
        "_extensions/ctm-libs/runtime/coi-serviceworker.js",
    ],
    "pyodide-interaktiv": [
        "_extensions/pyodide-interaktiv/qpyodide-worker-plugin.js",
        "_extensions/pyodide-interaktiv/qpyodide-worker-module.js",
        "_extensions/pyodide-interaktiv/qpyodide-document-engine-initialization.js",
    ],
}


def bind_application(lock, roots, refs, cache):
    """Extend a canonical lock with exact immutable application source records."""
    if set(roots) != set(SOURCES) or set(refs) != set(SOURCES):
        raise assets.AssetError("Both exact application sources are required")
    result = json.loads(json.dumps(lock))
    if "application" in result:
        raise assets.AssetError("Application assets are already bound")
    records, licences = [], []
    for name, paths in SOURCES.items():
        root, ref = Path(roots[name]), refs[name]
        if not isinstance(ref, str) or not re.fullmatch(r"[a-f0-9]{40}", ref):
            raise assets.AssetError("Application sources require full commit SHAs")
        actual = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
        if actual != ref:
            raise assets.AssetError("Application checkout differs from pinned head: " + name)
        licence = subprocess.check_output(["git", "-C", str(root), "show", ref + ":LICENSE"])
        licence_path = "application/" + name + "/" + ref + "/LICENSE"
        licences.append({"repository": "Erasmus-CTM/" + name, "licence": "AGPL-3.0",
                         "path": licence_path, "sha256": assets.digest(licence),
                         "source": "https://github.com/Erasmus-CTM/" + name + "/tree/" + ref})
        result["generated"].append({"path": licence_path, "text": licence.decode("utf-8"),
                                    "sha256": assets.digest(licence)})
        for source in paths:
            data = subprocess.check_output(["git", "-C", str(root), "show", ref + ":" + source])
            file = root / source
            if file.is_symlink() or file.read_bytes() != data:
                raise assets.AssetError("Application working bytes differ from the commit: " + source)
            path = "application/" + name + "/" + ref + "/" + Path(source).name
            sha = assets.digest(data)
            records.append({"repository": "Erasmus-CTM/" + name, "commit": ref,
                            "source": source, "path": path, "sha256": sha,
                            "deployed_name": Path(source).name})
            result["generated"].append({"path": path, "text": data.decode("utf-8"), "sha256": sha})
    result["application"] = sorted(records, key=lambda item: item["path"])
    # The repository licence does not replace the upstream MIT notice in
    # coi-serviceworker. Curated bytes are independently bound to its Git blob.
    supplemental = Path(__file__).resolve().parents[1] / 'integration/assets-licences/coi-serviceworker-MIT.txt'
    data = supplemental.read_bytes()
    assets.verify_bytes(data, sha256='3ee2c88cec9f3036fd4b0cba94e94485bb8b4673be7b8e0f3b1496c5baff75cb')
    path = 'application/coi-serviceworker/LICENSE-MIT.txt'
    result['generated'].append({'path':path, 'text':data.decode('utf-8'), 'sha256':assets.digest(data)})
    licences.append({'repository':'gzuidhof/coi-serviceworker', 'licence':'MIT',
                     'path':path, 'sha256':assets.digest(data),
                     'source':'https://api.github.com/repos/gzuidhof/coi-serviceworker/git/blobs/4932a51208be9921237d2105082f105fee6a1833'})
    result["application_licences"] = licences
    result["generated"].sort(key=lambda item: item["path"])
    result["files"] = assets.derive_lock_files(result, cache)
    return result


def verify_deployment(site, lock):
    """Reject missing or modified worker files actually served by Quarto."""
    site = Path(site)
    assets.verify_bundle(site / "_ctm-assets", lock)
    records = lock.get("application")
    if not isinstance(records, list) or len(records) != sum(map(len, SOURCES.values())):
        raise assets.AssetError("Complete lock lacks the application worker inventory")
    expected = {item["deployed_name"]: item for item in records}
    if len(expected) != len(records) or set(expected) != {Path(p).name for paths in SOURCES.values() for p in paths}:
        raise assets.AssetError("Ambiguous application deployment names")
    found = {name: [] for name in expected}
    for file in site.rglob("*"):
        if file.name not in expected or "_ctm-assets" in file.relative_to(site).parts:
            continue
        record = expected[file.name]
        if file.is_symlink() or not file.is_file() or assets.digest(file.read_bytes()) != record["sha256"]:
            raise assets.AssetError("Deployed worker differs from the locked source: " + str(file))
        compressed = file.with_name(file.name + ".gz")
        if compressed.exists():
            if compressed.is_symlink() or not compressed.is_file():
                raise assets.AssetError("Invalid compressed worker: " + str(compressed))
            with gzip.open(compressed, "rb") as stream:
                data = stream.read(2 * 1024 * 1024 + 1)
            if assets.digest(data) != record["sha256"]:
                raise assets.AssetError("Compressed deployed worker differs from locked source: " + str(compressed))
        found[file.name].append(file.relative_to(site).as_posix())
    missing = [name for name, paths in found.items() if not paths]
    if missing:
        raise assets.AssetError("Missing deployed worker assets: " + ", ".join(missing))
    return {name: sorted(paths) for name, paths in sorted(found.items())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    bind = sub.add_parser("bind")
    bind.add_argument("--lock", type=Path, required=True)
    bind.add_argument("--library-root", type=Path, required=True)
    bind.add_argument("--library-ref", required=True)
    bind.add_argument("--ide-root", type=Path, required=True)
    bind.add_argument("--ide-ref", required=True)
    bind.add_argument("--cache", type=Path, required=True)
    bind.add_argument("--output", type=Path, required=True)
    verify = sub.add_parser("verify")
    verify.add_argument("--lock", type=Path, required=True)
    verify.add_argument("--site", type=Path, required=True)
    args = parser.parse_args()
    lock = json.loads(args.lock.read_bytes())
    if args.command == "bind":
        bound = bind_application(lock,
            {"ctm-libs": args.library_root, "pyodide-interaktiv": args.ide_root},
            {"ctm-libs": args.library_ref, "pyodide-interaktiv": args.ide_ref}, args.cache)
        args.output.write_bytes(assets.json_bytes(bound))
    else:
        print(json.dumps(verify_deployment(args.site, lock), indent=2))


if __name__ == "__main__":
    main()
