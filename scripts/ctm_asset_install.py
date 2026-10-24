"""Private, side-effect-free preparation of a reviewed offline installation.

This module does not install into a project or add command-line options.
The caller owns the returned private stage and any later installation transaction.
"""
from __future__ import annotations

from dataclasses import dataclass
import hmac
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import tempfile

import ctm_assets as assets


@dataclass(frozen=True)
class ProfileWrite:
    path: str
    data: bytes
    previous_sha256: str | None


@dataclass(frozen=True)
class OfflineAssetsPlan:
    staged_bundle: Path
    staged_private_index: Path
    profile_plan: tuple[ProfileWrite, ...]


def _require(condition, message):
    if not condition:
        raise assets.AssetError("Offline preparation: " + message)


def _sha(value):
    return isinstance(value, str) and re.fullmatch(r"[a-f0-9]{64}", value) is not None


def _regular_path(path: Path, *, directory=False):
    """Reject links/junctions in every existing ancestor before resolving."""
    path = Path(path)
    _require(".." not in path.parts, "parent traversal is not allowed in input paths")
    path = Path(os.path.abspath(path))
    for current in (*reversed(path.parents), path):
        if current.exists() or current.is_symlink():
            _require(not current.is_symlink()
                     and not (hasattr(current, "is_junction") and current.is_junction()),
                     "links or junctions are not allowed: " + str(current))
            _require(current.is_dir() if current != path or directory else current.is_file(),
                     "expected a regular " + ("directory: " if directory else "file: ") + str(current))
    return path


def _lock_contract(lock, library, pins, reviewed):
    _require(isinstance(lock, dict) and type(lock.get("v")) is int and lock["v"] == 1
             and lock.get("kind") == "ctm-assets-lock", "a complete reviewed asset lock is required")
    _require(_sha(reviewed), "an external reviewed lock sha256 is required")
    _require(hmac.compare_digest(assets.digest(assets.json_bytes(lock)), reviewed),
             "reviewed lock sha256 differs")
    versions = assets.validate_version_homes(lock, library, pins)
    _require(lock.get("scope") == sorted(versions), "complete lock scope must list every canonical family once")
    archives = lock.get("archives")
    _require(isinstance(archives, list) and all(isinstance(a, dict) and isinstance(a.get("id"), str) for a in archives)
             and len(archives) == len(versions)
             and {a.get("id") for a in archives} == set(versions),
             "complete lock must contain each canonical archive family once")
    files = lock.get("files")
    _require(isinstance(files, dict) and bool(files)
             and all(_sha(value) for value in files.values()), "complete lock needs public file hashes")
    folded = set()
    for name in files:
        path = assets.relative_path(name)
        _require(not any(ord(c) < 32 or ord(c) == 127 for c in name), "asset paths contain controls")
        _require(name.casefold() not in folded, "case-colliding public asset paths")
        folded.add(name.casefold())
        _require(not name.endswith("pyodide-lock.full.json"), "the full release lock must remain private")
        _require(".private-extensions" not in path.parts and path.name != "assets-imports.json",
                 "private scanner metadata cannot appear in public assets")
    for name in files:
        _require(not any(str(p).casefold() in folded for p in PurePosixPath(name).parents if str(p) != "."),
                 "a public file is also a parent directory")
    private = lock.get("private")
    _require(isinstance(private, dict) and set(private) == {"import_index"},
             "the complete lock needs exactly one private import index descriptor")
    descriptor = private["import_index"]
    _require(isinstance(descriptor, dict)
             and descriptor.get("path") == ".private-extensions/assets-imports.json"
             and _sha(descriptor.get("sha256")), "invalid private index path or digest")
    python_archive = next(a for a in archives if a["id"] == "pyodide")
    _require(descriptor.get("pyodide") == versions["pyodide"]
             and descriptor.get("source_url") == python_archive.get("url")
             and descriptor.get("archive_sha256") == python_archive.get("sha256"),
             "private index uses another locked Pyodide archive")
    return descriptor


def _regular_tree(root, *, allowed_directories=None, non_executable=False):
    """Check descendants before walking into directories or reading file bytes."""
    for parent, directories, files in os.walk(root, followlinks=False):
        for name in directories + files:
            entry = Path(parent) / name
            _require(not entry.is_symlink()
                     and not (hasattr(entry, "is_junction") and entry.is_junction()),
                     "tree links or junctions are not allowed")
            info = entry.lstat()
            if stat.S_ISDIR(info.st_mode):
                if allowed_directories is not None:
                    _require(entry.relative_to(root).as_posix() in allowed_directories,
                             "extra carried directory")
            else:
                _require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1,
                         "tree files must be regular and have no hardlinks")
                _require(not non_executable or not info.st_mode & 0o111,
                         "carried files must be non-executable")


def _envelope(root, lock, descriptor):
    root = _regular_path(root, directory=True)
    _require(root.is_dir(), "carried envelope directory is missing")
    expected = {"_ctm-assets/" + path: value for path, value in lock["files"].items()}
    expected[descriptor["path"]] = descriptor["sha256"]
    allowed_dirs = {str(parent) for name in expected for parent in PurePosixPath(name).parents if str(parent) != "."}
    _regular_tree(root, allowed_directories=allowed_dirs, non_executable=True)
    _require(assets.inventory(root) == expected, "carried envelope file set or hashes differ")
    return root


def _profiles(project, stage, *, course_key, website):
    originals = {}
    plan_dir = stage / "profile-plan"
    plan_dir.mkdir()
    for name in ("_quarto-offline.yml", "_quarto-exam.yml", ".gitignore"):
        path = _regular_path(project / name)
        if path.exists():
            originals[name] = path.read_bytes()
            (plan_dir / name).write_bytes(originals[name])
    assets.write_profiles(plan_dir, course_key=course_key or project.name, website=website)
    changes = []
    for name in ("_quarto-offline.yml", "_quarto-exam.yml", ".gitignore"):
        data = (plan_dir / name).read_bytes()
        before = originals.get(name)
        if before != data:
            changes.append(ProfileWrite(name, data, assets.digest(before) if before is not None else None))
    return tuple(changes)


def prepare_offline_assets(project, workspace, lock, library, pins, *,
                           reviewed_lock_sha256, private_index_bytes=None, cache=None,
                           carried_root=None, accepted_licences=(), course_key=None,
                           website=True) -> OfflineAssetsPlan:
    """Validate and stage a private plan; never write into the real project.

    A carried input is a directory envelope containing only _ctm-assets/ and
    .private-extensions/assets-imports.json. The caller supplies the reviewed
    complete-lock digest separately. No public install transaction is implied.
    """
    project = _regular_path(project, directory=True)
    _require(project.is_dir(), "project directory is missing")
    workspace = _regular_path(workspace, directory=True)
    _require(workspace != project and not workspace.is_relative_to(project),
             "workspace must be outside the project")
    library = _regular_path(library, directory=True)
    pins = _regular_path(pins)
    _regular_path(library / "assets.json")
    _regular_path(library / "runtime" / "pyodide-runtime.js")
    _require(not workspace.is_relative_to(library), "workspace must not modify library metadata")
    selected_cache = _regular_path(cache if cache is not None else workspace / "cache", directory=True)
    _require(not selected_cache.is_relative_to(project) and not selected_cache.is_relative_to(library),
             "cache must stay outside the project and library metadata")
    descriptor = _lock_contract(lock, library, pins, reviewed_lock_sha256)
    if selected_cache.exists():
        _regular_tree(selected_cache)
    # Validate existing profile paths before creating any private stage.
    for name in ("_quarto-offline.yml", "_quarto-exam.yml", ".gitignore"):
        _regular_path(project / name)
    if carried_root is not None:
        envelope = _envelope(carried_root, lock, descriptor)
        _require(not workspace.is_relative_to(envelope), "workspace must stay outside the carried envelope")
        data = (envelope / descriptor["path"]).read_bytes()
        _require(private_index_bytes is None or private_index_bytes == data,
                 "explicit index differs from the carried sidecar")
    else:
        envelope, data = None, private_index_bytes
    _require(isinstance(data, bytes), "private import index bytes are required")
    _require(hmac.compare_digest(assets.digest(data), descriptor["sha256"]), "private import index hash differs")
    workspace.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=".ctm-asset-prepare-", dir=workspace))
    try:
        bundle = stage / "_ctm-assets"
        if envelope is not None:
            assets.install_carried_bundle(lock, envelope / "_ctm-assets", bundle,
                                          accepted_licences=accepted_licences)
        else:
            assets.build_from_lock(lock, bundle, selected_cache, accepted_licences=accepted_licences)
        assets.verify_bundle(bundle, lock)
        python_base = bundle / "pyodide" / lock["versions"]["pyodide"]
        assets.validate_bound_import_index(data, descriptor,
            public_files=assets.inventory(bundle),
            subset_bytes=(python_base / "pyodide-lock.json").read_bytes())
        assets.release_version((python_base / "package.json").read_bytes(), lock["versions"]["pyodide"])
        index_path = stage / descriptor["path"]
        index_path.parent.mkdir()
        index_path.write_bytes(data)
        profiles = _profiles(project, stage, course_key=course_key, website=website)
        return OfflineAssetsPlan(bundle, index_path, profiles)
    except BaseException:
        shutil.rmtree(stage)
        raise
