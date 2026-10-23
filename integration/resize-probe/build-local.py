#!/usr/bin/env python3
"""Render the frozen authored store fixture with verified carried local assets."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
from unittest.mock import patch

LOCK_SHA256 = "93e96c89432d46f90be347fe8c65a6596e3467f9cbf2ee8cbc15f59ab08ec3be"
INDEX_SHA256 = "b8177517815176b3d38d99bbe6ae7d046de51768e5175d1cbabb367a5d9e4ebc"
ARTIFACT_SHA256 = "44892a23abc87005579ce34c1fcbfff3a24824f029ce6639e5a0bc4ff0e33571"


def run(*args, cwd=None):
    subprocess.run([str(arg) for arg in args], cwd=cwd, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--producer", type=Path, required=True)
    parser.add_argument("--baseline-record", type=Path, required=True)
    parser.add_argument("--prebuilt", type=Path, required=True)
    parser.add_argument("--dest", type=Path, required=True)
    args = parser.parse_args()
    producer, prebuilt, dest = args.producer.resolve(), args.prebuilt.resolve(), args.dest.resolve()
    actual_producer = subprocess.check_output(["git", "-C", str(producer), "rev-parse", "HEAD"], text=True).strip()
    assert actual_producer == "7fa0b25bed9f459c5f18f700f327ad3e804b55cf"
    if dest.exists() and any(dest.iterdir()):
        parser.error("--dest must be empty; generated fixtures never replace existing work")
    dest.mkdir(parents=True, exist_ok=True)
    baseline = json.loads(args.baseline_record.read_bytes())
    refs = {name: entry["commit"] for name, entry in baseline["repositories"].items() if name != "ctm-assessment"}
    project = dest / "course"
    shutil.copytree(producer / "integration/store/course", project)
    run(sys.executable, producer / "scripts/install-project.py", "--project", project,
        "--workspace", dest / "package", "--review-refs", json.dumps(refs))

    # Reuse the canonical reviewed preparation/materializer APIs. The prebuilt
    # ZIP digest is checked by the workflow before download; lock/index digests
    # bind the actual extracted bytes here, outside the generated public site.
    sys.path.insert(0, str(producer / "scripts"))
    import ctm_assets as assets
    import ctm_asset_install as install
    lock_bytes = (prebuilt / "inspection/complete-lock.json").read_bytes()
    index_bytes = (prebuilt / "assets-imports.json").read_bytes()
    assert hashlib.sha256(lock_bytes).hexdigest() == LOCK_SHA256
    assert hashlib.sha256(index_bytes).hexdigest() == INDEX_SHA256
    lock = json.loads(lock_bytes)
    assert len(lock["files"]) == 3211 and len(lock["scope"]) == 9
    source = prebuilt / "inspection/complete-built"
    assets.verify_bundle(source, lock)
    envelope = dest / "carried"
    shutil.copytree(source, envelope / "_ctm-assets")
    private = envelope / ".private-extensions"
    private.mkdir()
    (private / "assets-imports.json").write_bytes(index_bytes)
    library = project / "_extensions/ctm-libs"
    pins = project / "_extensions/ctm-assessment/jsxgraph-pins.yml"
    with patch.object(assets, "download", side_effect=AssertionError("carried assets attempted a download")):
        plan = install.prepare_offline_assets(project, dest / "asset-stage", lock, library, pins,
            reviewed_lock_sha256=LOCK_SHA256, carried_root=envelope,
            private_index_bytes=index_bytes, website=True)
    shutil.copytree(plan.staged_bundle, project / "_ctm-assets")
    target_index = project / ".private-extensions/assets-imports.json"
    target_index.parent.mkdir(exist_ok=True)
    shutil.copy2(plan.staged_private_index, target_index)
    # Use the existing canonical offline profile unchanged. It selects local
    # families, their real theme fonts and resource copying; exam settings stay
    # outside this ordinary fixture.
    offline = next(write for write in plan.profile_plan if write.path == "_quarto-offline.yml")
    (project / offline.path).write_bytes(offline.data)
    run("quarto", "render", "--profile", "offline", cwd=project)
    site = project / "_site"
    assets.verify_bundle(site / "_ctm-assets", lock)
    assert not list(site.rglob("assets-imports.json"))
    assert not list(site.rglob("complete-lock.json"))
    resolved = json.loads((project / ".private-extensions/resolved-repos.json").read_bytes())
    actual_refs = {name: value["commit"] for name, value in resolved["repositories"].items()}
    for name, commit in refs.items():
        assert actual_refs[name] == commit, (name, commit, actual_refs[name])
    proof = {"producer": "7fa0b25bed9f459c5f18f700f327ad3e804b55cf", "profile": "offline",
        "artifactId": 12442968305, "artifactSha256": ARTIFACT_SHA256,
        "completeLockSha256": LOCK_SHA256, "privateIndexSha256": INDEX_SHA256,
        "assetFiles": len(lock["files"]), "versions": lock["versions"],
        "carriedAssetDownloads": 0, "componentRefs": actual_refs,
        "fixtureHtmlSha256": hashlib.sha256((site / "index.html").read_bytes()).hexdigest()}
    (dest / "local-asset-proof.json").write_text(json.dumps(proof, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(proof, sort_keys=True))


if __name__ == "__main__":
    main()
