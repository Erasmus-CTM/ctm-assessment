#!/usr/bin/env python3
"""Inspect private official partials; compose only with separately reviewed digests."""
from __future__ import annotations

import argparse
import importlib.util
from pathlib import Path
import subprocess
from unittest.mock import patch

AVAILABILITY_SHA256 = "dd9327e9be5bb2b4fb06afd905077fd72de39e345c7ec67f76a87ff4033afe28"
KINDS = {"python": "private-partial-python-assets-lock",
         "npm": "private-partial-npm-assets-lock",
         "board": "private-partial-board-assets-lock"}
SOURCES = {"composer": "63980a231771f63a4d20000f9fafadea73b136c9",
           "board": "56b36b43d602eda3971afc144e65a73f9f6cfcbb",
           "ctm-libs": "8f21ff0110814766c6590e8a9bfe67e90c190af0"}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--composer-root", type=Path, required=True)
    parser.add_argument("--board-root", type=Path, required=True)
    parser.add_argument("--library", type=Path, required=True)
    parser.add_argument("--pins", type=Path, required=True)
    parser.add_argument("--cache", type=Path, required=True)
    for name in KINDS:
        parser.add_argument("--" + name + "-lock", type=Path, required=True)
    parser.add_argument("--private-index", type=Path, required=True)
    parser.add_argument("--availability", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--reviewed-digests", type=Path)
    args = parser.parse_args(argv)
    helper = args.composer_root / "scripts/ctm_assets.py"
    spec = importlib.util.spec_from_file_location("canonical_composer_assets", helper)
    assets = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(assets)
    roots = {"composer": args.composer_root, "board": args.board_root,
             "ctm-libs": args.library.parent.parent}
    actual_sources = {name: subprocess.check_output(
        ["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
        for name, root in roots.items()}
    if actual_sources != SOURCES:
        raise assets.AssetError("Candidate source checkouts differ from the frozen reviewed heads")
    if args.pins.resolve() != (args.board_root / "_extensions/ctm-assessment/jsxgraph-pins.yml").resolve():
        raise assets.AssetError("Board pins must come from the frozen board producer checkout")
    availability = args.availability.read_bytes()
    assets.verify_bytes(availability, sha256=AVAILABILITY_SHA256)
    index = args.private_index.read_bytes()
    index_record = assets._availability_json(index, "private scanner index")
    if index != assets.json_bytes(index_record):
        raise assets.AssetError("Expected canonical private scanner index bytes")
    partials, digests, summaries = [], {}, {}
    for name, kind in KINDS.items():
        path = getattr(args, name + "_lock")
        raw = path.read_bytes()
        lock = assets._availability_json(raw, name + " private partial lock")
        if lock.get("kind") != kind or raw != assets.json_bytes(lock):
            raise assets.AssetError("Expected canonical private partial bytes: " + name)
        actual = assets.derive_lock_files(lock, args.cache)
        if actual != lock.get("files"):
            raise assets.AssetError("Partial inventory differs from canonical materialization: " + name)
        partials.append(lock)
        digests[kind] = assets.digest(raw)
        summaries[name] = {"raw_sha256": assets.digest(raw),
                           "canonical_sha256": assets.digest(assets.json_bytes(lock)), "kind": kind,
                           "files": len(actual), "archives": len(lock["archives"]),
                           "scope": lock["scope"], "versions": lock["versions"],
                           "provenance": lock.get("provenance", {})}
    candidate = {"v": 1, "partial_sha256": digests,
                 "import_index_sha256": assets.digest(index),
                 "availability_sha256": AVAILABILITY_SHA256}
    summary = {"v": 1, "kind": "private-complete-assets-inspection",
               "status": "Candidate digests require independent review before composition",
               "candidate_digests": candidate, "partials": summaries,
               "source_refs": actual_sources,
               "inputs": {"core_metadata_sha256": assets.digest((args.composer_root / "integration/assets-metadata.json").read_bytes()),
                          "board_metadata_sha256": assets.digest((args.board_root / "integration/assets-board-metadata.json").read_bytes()),
                          "board_font_policy_sha256": assets.digest((args.board_root / "integration/assets-board-licences.json").read_bytes()),
                          "python_licence_policy_sha256": assets.digest((args.composer_root / "integration/assets-python-licences.json").read_bytes()),
                          "stdlib_candidates_sha256": assets.digest((args.composer_root / "integration/assets-stdlib.json").read_bytes())},
               "private_index": {"raw_sha256": assets.digest(index),
                                 "canonical_sha256": assets.digest(assets.json_bytes(index_record)),
                                 "python": index_record["python"],
                                 "stdlib_modules": len(index_record["stdlib_modules"]),
                                 "packages": len(index_record["packages"]),
                                 "source": index_record["source"]},
               "composer_sha256": assets.digest(helper.read_bytes()),
               "board_pins_sha256": assets.digest(args.pins.read_bytes()),
               "version_sources": assets.version_sources(args.library)}
    args.output.mkdir(parents=True, exist_ok=True)
    if args.reviewed_digests is not None:
        reviewed = assets._availability_json(args.reviewed_digests.read_bytes(), "reviewed digests")
        if reviewed != candidate:
            raise assets.AssetError("Actual candidates differ from the independently reviewed digests")
        lock = assets.compose_asset_lock(partials, args.library, args.pins, args.cache,
            reviewed_partial_sha256=reviewed["partial_sha256"], private_index_bytes=index,
            reviewed_index_sha256=reviewed["import_index_sha256"],
            reviewed_availability_sha256=reviewed["availability_sha256"])
        assets.write_private_lock(lock, args.output / "complete-lock.json")
        built, carried = args.output / "complete-built", args.output / "complete-carried"
        assets.build_from_lock(lock, built, args.cache)
        assets.verify_bundle(built, lock)
        with patch.object(assets, "download", side_effect=AssertionError("Carried install attempted download")), \
             patch.object(assets.urllib.request, "build_opener", side_effect=AssertionError("Carried install attempted network")):
            assets.install_carried_bundle(lock, built, carried)
        if assets.inventory(carried) != lock["files"]:
            raise assets.AssetError("Complete carried inventory differs from the reviewed lock")
        summary.update({"kind": "private-complete-assets-build",
                        "status": "Reviewed official composition and carried bytes; runtime acceptance pending",
                        "complete_lock_sha256": assets.digest(assets.json_bytes(lock)),
                        "files": len(lock["files"]), "scope": lock["scope"],
                        "versions": lock["versions"], "private": lock["private"],
                        "carried_network_calls": 0})
    # Only this bounded digest/provenance summary is emitted. Full locks and the
    # release import index remain in the private runner directory.
    report = assets.json_bytes(summary)
    (args.output / "inspection-summary.json").write_bytes(report)
    print(report.decode("utf-8"), end="")


if __name__ == "__main__":
    main()
