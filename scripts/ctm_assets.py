#!/usr/bin/env python3
"""Verified offline asset primitives shared by package builder and installer.

Network metadata collection is separate from bundle construction. Building and
installing never trust a manifest without the reviewed lock's file hashes.
"""
from __future__ import annotations

import importlib.util
import base64
import gzip
import hashlib
import hmac
import io
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import tarfile
import tempfile
import urllib.parse
import urllib.request

METADATA_HOSTS = frozenset({"registry.npmjs.org", "api.github.com"})
ARCHIVE_HOSTS = frozenset({"registry.npmjs.org", "github.com",
                           "objects.githubusercontent.com", "release-assets.githubusercontent.com"})
COMPRESS = frozenset({".wasm", ".js", ".mjs", ".json", ".css"})
EXAM_PACKAGES = ("numpy", "scipy", "sympy", "matplotlib", "networkx",
                 "micropip", "pyodide_http", "sqlite3", "ssl", "lzma",
                 "pydecimal", "pydoc_data", "hashlib")


class AssetError(ValueError):
    """An input, integrity or bundle contract is invalid."""


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git_blob_sha1(data: bytes) -> str:
    return hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()


def json_bytes(value) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")


def relative_path(value: str) -> PurePosixPath:
    if not isinstance(value, str) or not value or "\\" in value or "\x00" in value:
        raise AssetError(f"Invalid asset path: {value!r}")
    path = PurePosixPath(value)
    if path.is_absolute() or any(part in {"", ".", ".."} or ":" in part for part in value.split("/")):
        raise AssetError(f"Asset path escapes its root: {value!r}")
    return path


def checked_url(url: str) -> str:
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or parsed.hostname not in ARCHIVE_HOSTS or parsed.username or parsed.password or parsed.port not in (None, 443):
        raise AssetError(f"Asset URL is not an approved HTTPS archive source: {url}")
    return url


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        checked_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def verify_bytes(data: bytes, *, sha256: str | None = None, integrity: str | None = None) -> None:
    if not sha256 and not integrity:
        raise AssetError("An archive needs a pinned sha256 or npm integrity")
    if sha256 and (not re.fullmatch(r"[a-f0-9]{64}", sha256) or not hmac.compare_digest(digest(data), sha256)):
        raise AssetError("Archive sha256 mismatch")
    if integrity:
        # Reject weaker algorithms and ambiguous unsupported SRI entries.
        candidates = integrity.split()
        if not candidates or any(not item.startswith("sha512-") for item in candidates):
            raise AssetError("npm archives require sha512 integrity")
        actual = hashlib.sha512(data).digest()
        matches = False
        for candidate in candidates:
            try:
                expected = base64.b64decode(candidate[7:], validate=True)
            except ValueError as exc:
                raise AssetError("Invalid npm integrity encoding") from exc
            matches |= len(expected) == 64 and hmac.compare_digest(expected, actual)
        if not matches:
            raise AssetError("npm archive integrity mismatch")


def download(url: str, destination: Path, *, sha256=None, integrity=None) -> Path:
    checked_url(url)
    destination = Path(destination)
    if destination.is_file():
        try:
            verify_bytes(destination.read_bytes(), sha256=sha256, integrity=integrity)
            return destination
        except AssetError:
            destination.unlink()
    opener = urllib.request.build_opener(SafeRedirect())
    request = urllib.request.Request(url, headers={"User-Agent": "CTM-Assets/1"})
    with opener.open(request, timeout=120) as response:
        checked_url(response.geturl())
        data = response.read()
    verify_bytes(data, sha256=sha256, integrity=integrity)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".partial")
    temporary.write_bytes(data)
    temporary.replace(destination)
    return destination


def extract_selected(archive: Path, destination: Path, files: list[dict], *, prefix="package/") -> dict[str, str]:
    """Stream only explicitly locked members; never extract links or paths."""
    requested, output_names = {}, set()
    for item in files:
        member = str(relative_path(item["member"]))
        output = str(relative_path(item["path"]))
        if member in requested or output in output_names:
            raise AssetError(f"Duplicate locked archive member/output: {member}")
        if not re.fullmatch(r"[a-f0-9]{64}", item.get("sha256", "")):
            raise AssetError(f"Missing member sha256: {member}")
        requested[member] = item
        output_names.add(output)
    found = {}
    destination = Path(destination)
    with tarfile.open(archive, mode="r|*") as source:
        for member in source:
            name = member.name
            while name.startswith("./"):
                name = name[2:]
            if not name or member.isdir():
                continue
            relative_path(name)
            if prefix and not name.startswith(prefix):
                continue
            name = name[len(prefix):] if prefix else name
            if name not in requested:
                continue
            if not member.isfile() or member.issym() or member.islnk():
                raise AssetError(f"Locked asset is not a regular file: {member.name}")
            if name in found:
                raise AssetError(f"Repeated archive member: {name}")
            stream = source.extractfile(member)
            data = stream.read() if stream else b""
            expected = requested[name]
            if not hmac.compare_digest(digest(data), expected["sha256"]):
                raise AssetError(f"Asset member sha256 mismatch: {name}")
            target = destination.joinpath(*relative_path(expected["path"]).parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            found[name] = digest(data)
    missing = set(requested) - set(found)
    if missing:
        raise AssetError("Archive lacks locked files: " + ", ".join(sorted(missing)))
    return found


def normalise_package(name: str) -> str:
    if not isinstance(name, str) or not name.strip():
        raise AssetError("Python package names must be nonempty strings")
    return re.sub(r"[-_.]+", "-", name).lower()


def package_closure(full_lock: dict, requested) -> dict:
    packages = full_lock.get("packages", {})
    aliases = {}
    for key in packages:
        normalised = normalise_package(key)
        if normalised in aliases:
            raise AssetError(f"Ambiguous package names in Pyodide lock: {key}")
        aliases[normalised] = key
    selected, visiting = {}, set()
    def visit(request):
        normalised = normalise_package(request)
        if normalised == "all":
            raise AssetError("Name Python extras explicitly; 'all' is not supported")
        if normalised not in aliases:
            raise AssetError(f"Pyodide distribution has no package {request}")
        name = aliases[normalised]
        if name in selected:
            return
        if name in visiting:
            raise AssetError(f"Dependency cycle in Pyodide lock: {name}")
        visiting.add(name)
        entry = packages[name]
        for dependency in entry.get("depends", []):
            visit(dependency)
        visiting.remove(name)
        selected[name] = entry
    for name in requested:
        visit(name)
    return {"info": dict(full_lock.get("info", {})), "packages": dict(sorted(selected.items()))}


def check_python_sources(sources: list[dict], full_lock: dict, subset: dict, *, local_modules=(), local_dirs=(), strict=True) -> dict:
    """Reuse the one canonical packaged AST scanner; never maintain a copy."""
    scanner = Path(__file__).resolve().parents[1] / "_extensions" / "ctm-assessment" / "author-imports.py"
    if not scanner.is_file():
        raise AssetError(f"The canonical packaged author-imports.py is missing: {scanner}")
    spec = importlib.util.spec_from_file_location("ctm_author_imports", scanner)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    try:
        return module.check_sources(sources, full_lock, subset, local_modules=local_modules, local_dirs=local_dirs, strict=strict)
    except module.ImportCheckError as error:
        raise AssetError(str(error)) from None


def private_import_index(full_lock: dict, stdlib: dict) -> dict:
    if stdlib.get("v") != 1 or stdlib.get("python") != full_lock.get("info", {}).get("python"):
        raise AssetError("Reviewed stdlib facts do not match the Pyodide release Python version")
    modules = stdlib.get("modules")
    if not isinstance(modules, list) or not modules or any(not isinstance(name, str) or not name.isidentifier() for name in modules):
        raise AssetError("Reviewed stdlib facts need canonical module names")
    return {"v": 1, "python": stdlib["python"], "stdlib_modules": sorted(set(modules)),
            "source": stdlib.get("source", {}),
            "packages": {name: {"imports": list(entry.get("imports", []))}
                         for name, entry in sorted(full_lock.get("packages", {}).items())}}


def _availability_json(data: bytes, label: str) -> dict:
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise AssetError(f"Stdlib availability: duplicate {label} key: {key}")
            result[key] = value
        return result
    def constant(value):
        raise AssetError(f"Stdlib availability: non-finite {label} value: {value}")
    try:
        value = json.loads(data.decode("utf-8"), object_pairs_hook=pairs, parse_constant=constant)
    except (UnicodeError, ValueError) as error:
        raise AssetError(f"Stdlib availability: invalid {label}: {error}") from None
    if not isinstance(value, dict):
        raise AssetError(f"Stdlib availability: {label} must be an object")
    return value


def private_import_index_from_availability(report_bytes: bytes, core: Path, *, reviewed_report_sha256: str,
                                           candidates: dict | None = None) -> dict:
    """Consume reviewed v2 evidence against the verified private probe stage.

    The digest is an independently reviewed input, never learned from this
    invocation's probe output. Rehash all staged files before using the full
    release lock. The existing v1 index/AST-scanner protocol stays unchanged.
    """
    def require(condition, message):
        if not condition:
            raise AssetError("Stdlib availability: " + message)
    def sha256(value):
        return isinstance(value, str) and re.fullmatch(r"[a-f0-9]{64}", value)
    def names(value, label):
        require(isinstance(value, list) and bool(value)
                and all(isinstance(name, str) and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name) for name in value),
                label + " need canonical module names")
        require(value == sorted(set(value)), label + " must be sorted and unique")
        return set(value)
    require(sha256(reviewed_report_sha256), "an independently reviewed report sha256 is required")
    verify_bytes(report_bytes, sha256=reviewed_report_sha256)
    facts = _availability_json(report_bytes, "report")
    require(set(facts) == {"v", "kind", "python", "pyodide", "source", "modules", "unavailable"}
            and type(facts["v"]) is int and facts["v"] == 2
            and facts["kind"] == "pyodide-stdlib-availability", "unsupported report schema")
    core = Path(core)
    require(core.is_dir() and not core.is_symlink(), "probe core must be a real directory")
    def read(name):
        file = core / name
        require(file.is_file() and not file.is_symlink(), "missing or non-regular probe file: " + name)
        return file.read_bytes()
    request = _availability_json(read("probe-input.json"), "probe request")
    require(set(request) == {"v", "python", "pyodide", "candidates", "candidate_source", "source", "runtime_files"}
            and type(request["v"]) is int and request["v"] == 1, "unsupported probe request")
    release, python = request["pyodide"], request["python"]
    require(isinstance(release, str) and re.fullmatch(r"\d+\.\d+\.\d+", release)
            and isinstance(python, str) and re.fullmatch(r"3\.\d+\.\d+", python), "probe needs exact release versions")
    require(facts["pyodide"] == release and facts["python"] == python, "report and probe release versions differ")
    archive = request["source"]
    require(isinstance(archive, dict) and set(archive) == {"url", "sha256"}
            and archive["url"] == f"https://github.com/pyodide/pyodide/releases/download/{release}/pyodide-{release}.tar.bz2"
            and sha256(archive["sha256"]), "probe needs exact official archive provenance")
    files = request["runtime_files"]
    required = {"pyodide.js", "pyodide.mjs", "pyodide.asm.js", "pyodide.asm.wasm",
                "python_stdlib.zip", "pyodide-lock.json", "package.json"}
    require(isinstance(files, dict) and set(files) == required and all(sha256(value) for value in files.values()),
            "probe needs all seven runtime sha256 values")
    source = facts["source"]
    require(isinstance(source, dict) and set(source) == {"url", "sha256", "runtime_files", "candidate_source", "method"},
            "report needs complete provenance")
    require({key: source[key] for key in ("url", "sha256")} == archive
            and source["runtime_files"] == files, "report and probe archive/runtime provenance differ")
    require(source["method"] == "Successful imports of trusted release stdlib candidates plus actual builtin/frozen inventory; network disabled; no authored execution",
            "unsupported probe method")
    if candidates is None:
        candidates = _availability_json((Path(__file__).resolve().parents[1] / "integration/assets-stdlib.json").read_bytes(), "candidates")
    require(isinstance(candidates, dict) and type(candidates.get("v")) is int and candidates["v"] == 1
            and candidates.get("python") == python, "candidate facts use another Python release")
    wanted = names(candidates.get("modules"), "candidates")
    candidate_source = candidates.get("source")
    require(isinstance(candidate_source, dict) and set(candidate_source) == {"url", "git_blob_sha1"}
            and candidate_source["url"] == f"https://github.com/python/cpython/blob/v{python}/Python/stdlib_module_names.h"
            and isinstance(candidate_source["git_blob_sha1"], str)
            and re.fullmatch(r"[a-f0-9]{40}", candidate_source["git_blob_sha1"]), "invalid candidate provenance")
    require(request["candidates"] == candidates["modules"] and request["candidate_source"] == candidate_source
            and source["candidate_source"] == candidate_source, "candidate names/provenance differ")
    available = names(facts["modules"], "available modules")
    unavailable = facts["unavailable"]
    require(isinstance(unavailable, dict)
            and all(isinstance(name, str) and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name)
                    and isinstance(error, str) and bool(error.strip()) for name, error in unavailable.items()),
            "unavailable modules need canonical names and diagnostic text")
    require(not available.intersection(unavailable), "available and unavailable modules overlap")
    require(wanted <= available.union(unavailable), "probe omitted candidate modules")
    # Extra builtin/frozen names are covered by the reviewed report digest;
    # do not silently reclassify them as CPython candidate names.
    runtime = {}
    for name in sorted(required):
        runtime[name] = read(name)
        require(hmac.compare_digest(digest(runtime[name]), files[name]), "staged runtime sha256 mismatch: " + name)
    release_version(runtime["package.json"], release)
    full_lock = _availability_json(runtime["pyodide-lock.json"], "release lock")
    require(isinstance(full_lock.get("info"), dict) and full_lock["info"].get("python") == python,
            "release lock uses another Python version")
    require(isinstance(full_lock.get("packages"), dict)
            and all(isinstance(entry, dict) and isinstance(entry.get("imports", []), list)
                    and all(isinstance(name, str) for name in entry.get("imports", []))
                    for entry in full_lock["packages"].values()), "invalid release package import map")
    provenance = dict(source, kind=facts["kind"], pyodide=release, availability_sha256=reviewed_report_sha256)
    return private_import_index(full_lock, {"v": 1, "python": python, "modules": facts["modules"], "source": provenance})


def write_private_import_index(index: dict, destination: Path) -> Path:
    destination = Path(destination).resolve()
    if any(part.lower() == "_ctm-assets" for part in destination.parts):
        raise AssetError("The full import index must stay outside published _ctm-assets")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(json_bytes(index))
    return destination


def allow_licence(name: str, spdx: str | None, accepted=()) -> frozenset[str]:
    """Validate SPDX AND/OR policy; return explicitly accepted obligations.

    OR chooses an available branch, preferring one with no extra consent.
    AND requires each branch. Unsupported syntax is refused, never guessed.
    """
    if not spdx:
        raise AssetError(f"{name}: unknown licence; add a reviewed licence record")
    permissive = {"MIT", "MIT-CMU", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0",
                  "MPL-2.0", "PSF-2.0", "OFL-1.1", "CC-BY-4.0", "GUST-Font-License", "UIUC", "OpenSSL"}
    accepted = set(accepted)
    tokens = re.findall(r"[A-Za-z0-9.+-]+|[()]", spdx)
    if re.sub(r"\s+", "", spdx) != "".join(tokens):
        raise AssetError(f"{name}: unsupported licence expression: {spdx}")
    position = 0
    def atom():
        nonlocal position
        if position >= len(tokens):
            raise AssetError(f"{name}: incomplete licence expression")
        token = tokens[position]
        position += 1
        if token == "(":
            value = either()
            if position >= len(tokens) or tokens[position] != ")":
                raise AssetError(f"{name}: unclosed licence expression")
            position += 1
            return value
        if token in {"AND", "OR", ")"}:
            raise AssetError(f"{name}: invalid licence expression")
        return frozenset() if token in permissive else frozenset({token}) if token in accepted else None
    def both():
        nonlocal position
        value = atom()
        while position < len(tokens) and tokens[position] == "AND":
            position += 1
            other = atom()
            value = value | other if value is not None and other is not None else None
        return value
    def either():
        nonlocal position
        value = both()
        while position < len(tokens) and tokens[position] == "OR":
            position += 1
            other = both()
            if value is None or (other is not None and len(other) < len(value)):
                value = other
        return value
    obligations = either()
    if position != len(tokens):
        raise AssetError(f"{name}: unsupported licence expression: {spdx}")
    if obligations is None:
        raise AssetError(f"{name}: {spdx} needs explicit --accept-licence and a source offer")
    return obligations


def inventory(root: Path) -> dict[str, str]:
    root = Path(root)
    if root.is_symlink() or not root.is_dir():
        raise AssetError("Bundle root must be a regular directory")
    out = {}
    for file in sorted(root.rglob("*")):
        if file.is_symlink():
            raise AssetError(f"Bundle contains a symlink: {file}")
        if file.is_file():
            out[file.relative_to(root).as_posix()] = digest(file.read_bytes())
        elif not file.is_dir():
            raise AssetError(f"Bundle contains a special filesystem entry: {file}")
    return out


def precompress(root: Path) -> None:
    for file in list(Path(root).rglob("*")):
        if file.is_file() and file.suffix in COMPRESS:
            buffer = io.BytesIO()
            with gzip.GzipFile(fileobj=buffer, mode="wb", filename="", mtime=0) as compressed:
                compressed.write(file.read_bytes())
            file.with_name(file.name + ".gz").write_bytes(buffer.getvalue())


def verify_bundle(root: Path, lock: dict) -> dict:
    root = Path(root)
    if lock.get("v") != 1 or not isinstance(lock.get("files"), dict):
        raise AssetError("Unsupported asset lock")
    actual = inventory(root)
    expected = lock["files"]
    if set(actual) != set(expected):
        raise AssetError("Bundle file set differs from the lock")
    for name, wanted in expected.items():
        relative_path(name)
        if not hmac.compare_digest(actual[name], wanted):
            raise AssetError(f"Bundle sha256 mismatch: {name}")
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("v") != 1 or manifest.get("versions") != lock.get("versions"):
        raise AssetError("Bundle versions differ from the lock")
    for name, wanted in manifest.get("files", {}).items():
        if actual.get(name) != wanted:
            raise AssetError(f"Manifest sha256 mismatch: {name}")
    if any("pyodide-lock.full.json" in name for name in actual):
        raise AssetError("The full Pyodide lock must stay outside published assets")
    return manifest


def cache_key(lock: dict) -> str:
    return digest(json_bytes(lock))


def validate_licence_policy(lock: dict, accepted_licences=()) -> None:
    accepted_licences = tuple(accepted_licences)
    for archive in lock["archives"]:
        obligations = allow_licence(archive["id"], archive.get("licence"), accepted_licences)
        if obligations and not archive.get("source_offer"):
            raise AssetError(f'{archive["id"]}: accepted copyleft licence needs a source offer')
        if not archive.get("licence_files"):
            raise AssetError(f'{archive["id"]}: licence text is required')


def materialize_bundle(lock: dict, stage: Path, cache: Path, *, accepted_licences=()) -> None:
    """Write canonical bundle bytes into an empty private directory."""
    stage, cache = Path(stage), Path(cache)
    validate_licence_policy(lock, accepted_licences)
    if not stage.is_dir() or stage.is_symlink() or any(stage.iterdir()):
        raise AssetError("Bundle materialization needs an empty regular stage")
    outputs = [item["path"] for archive in lock["archives"] for item in archive["files"]]
    outputs.extend(item["path"] for item in lock.get("generated", []))
    seen = set()
    for name in outputs:
        relative_path(name)
        portable = name.casefold()
        if portable in seen or portable in {"manifest.json", "third-party-notices.md"}:
            raise AssetError("Conflicting bundle output: " + name)
        seen.add(portable)
    for name in outputs:
        if Path(name).suffix in COMPRESS and (name + ".gz").casefold() in seen:
            raise AssetError("Precompressed bundle output conflicts with a source: " + name)
        if any(str(parent).casefold() in seen for parent in PurePosixPath(name).parents if str(parent) != "."):
            raise AssetError("Bundle output is also a parent file: " + name)
    cache.mkdir(parents=True, exist_ok=True)
    notices = ["# Third-party notices", ""]
    for archive in lock["archives"]:
        archive_file = cache / ("archive-" + digest(json_bytes({k: archive.get(k) for k in ("url", "sha256", "integrity")})))
        download(archive["url"], archive_file, sha256=archive.get("sha256"), integrity=archive.get("integrity"))
        extract_selected(archive_file, stage, archive["files"], prefix=archive.get("prefix", "package/"))
        notices.extend([f'## {archive["id"]}', f'Licence: {archive["licence"]}', "",
                        *archive["licence_files"], archive.get("source_offer", ""), ""])
    for item in lock.get("generated", []):
        name = relative_path(item["path"])
        if item["path"].endswith("pyodide-lock.full.json"):
            raise AssetError("Full Pyodide metadata cannot be published")
        data = item["text"].encode("utf-8")
        if digest(data) != item["sha256"]:
            raise AssetError(f"Generated asset sha256 mismatch: {name}")
        target = stage.joinpath(*name.parts)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    for archive in lock["archives"]:
        for name in archive["licence_files"]:
            if not (stage / str(relative_path(name))).is_file():
                raise AssetError(f"Licence file was not extracted: {name}")
    (stage / "THIRD-PARTY-NOTICES.md").write_bytes("\n".join(notices).encode("utf-8"))
    precompress(stage)
    manifest = {"v": 1, "versions": lock["versions"], "files": inventory(stage)}
    (stage / "manifest.json").write_bytes(json_bytes(manifest))


def derive_lock_files(lock: dict, cache: Path, *, accepted_licences=()) -> dict[str, str]:
    """Compute file hashes through the same producer used for actual builds."""
    cache = Path(cache)
    cache.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".ctm-lock-", dir=cache) as temporary:
        stage = Path(temporary) / "bundle"
        stage.mkdir()
        materialize_bundle(lock, stage, cache, accepted_licences=accepted_licences)
        return inventory(stage)


def build_from_lock(lock: dict, destination: Path, cache: Path, *, accepted_licences=()) -> Path:
    """Construct into a private stage, verify, then publish to an empty target."""
    if lock.get("v") != 1 or not lock.get("archives"):
        raise AssetError("Unsupported or empty asset lock")
    destination, cache = Path(destination), Path(cache)
    validate_licence_policy(lock, accepted_licences)
    if destination.exists():
        verify_bundle(destination, lock)
        return destination
    cache.mkdir(parents=True, exist_ok=True)
    destination.parent.mkdir(parents=True, exist_ok=True)
    # Cache and project may be on different drives; atomic publication must
    # stage on the destination filesystem rather than alongside the downloads.
    with tempfile.TemporaryDirectory(prefix=".ctm-assets-", dir=destination.parent) as temporary:
        stage = Path(temporary) / "bundle"
        stage.mkdir()
        materialize_bundle(lock, stage, cache, accepted_licences=accepted_licences)
        # A manifest cannot list its own hash; the reviewed lock lists it.
        verify_bundle(stage, lock)
        destination.parent.mkdir(parents=True, exist_ok=True)
        stage.rename(destination)
    return destination

def install_carried_bundle(lock: dict, source: Path, destination: Path, *, accepted_licences=()) -> Path:
    """Verify a directory or _ctm-assets-rooted tar before replacing the target."""
    validate_licence_policy(lock, accepted_licences)
    source, destination = Path(source), Path(destination)
    if source.is_symlink() or destination.is_symlink():
        raise AssetError("Carried bundle and destination must not be symlinks")
    if not source.exists():
        raise AssetError(f"Carried bundle not found: {source}")
    if not source.is_dir() and not source.is_file():
        raise AssetError("Carried bundle must be a regular directory or tar file")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".ctm-assets-", dir=destination.parent) as temporary:
        stage = Path(temporary) / "bundle"
        if source.is_dir():
            verify_bundle(source, lock)
            if source.resolve() == destination.resolve():
                return destination
            shutil.copytree(source, stage)
        else:
            stage.mkdir()
            wanted, seen = lock.get("files", {}), set()
            with tarfile.open(source, "r|*") as archive:
                for member in archive:
                    name = member.name.rstrip("/")
                    if name == "_ctm-assets" and member.isdir():
                        continue
                    if not name.startswith("_ctm-assets/"):
                        raise AssetError("Carried tar must contain only the _ctm-assets/ bundle")
                    relative = name[len("_ctm-assets/"):]
                    path = relative_path(relative)
                    if member.isdir():
                        continue
                    if not member.isfile() or relative in seen or relative not in wanted:
                        raise AssetError(f"Unexpected carried bundle member: {name}")
                    seen.add(relative)
                    stream = archive.extractfile(member)
                    if stream is None:
                        raise AssetError(f"Unreadable carried bundle member: {name}")
                    data = stream.read()
                    if digest(data) != wanted[relative]:
                        raise AssetError(f"Carried bundle sha256 mismatch: {relative}")
                    target = stage.joinpath(*path.parts)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(data)
        verify_bundle(stage, lock)
        # Keep the previous bundle outside the stage's auto-cleaned directory.
        # A failed rollback must leave its only copy recoverable.
        backup = None
        if destination.exists():
            backup_parent = Path(tempfile.mkdtemp(prefix=".ctm-assets-previous-", dir=destination.parent))
            backup = backup_parent / "previous"
            try:
                destination.rename(backup)
            except OSError:
                backup_parent.rmdir()
                raise
        try:
            stage.rename(destination)
        except OSError as publish_error:
            if backup is not None:
                try:
                    backup.rename(destination)
                except OSError as rollback_error:
                    raise AssetError(f"Asset publication and rollback failed; previous assets retained at {backup}: {rollback_error}") from publish_error
                backup.parent.rmdir()
            raise
        if backup is not None:
            shutil.rmtree(backup.parent)
    return destination


def version_sources(library: Path) -> dict:
    """Read the two canonical library sources; never duplicate Pyodide's pin."""
    library = Path(library)
    table_path = library / "assets.json"
    runtime_path = library / "runtime" / "pyodide-runtime.js"
    table = json.loads(table_path.read_text(encoding="utf-8"))
    if table.get("v") != 1 or not isinstance(table.get("assets"), dict):
        raise AssetError("Unsupported canonical asset table")
    assets = {}
    exact = re.compile(r"[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?")
    for name, entry in table["assets"].items():
        if not exact.fullmatch(str(entry.get("version", ""))):
            raise AssetError(f"{name}: the asset table needs an exact version")
        if (name in {"pyodide", "jsxgraph", "mathjax4", "mathjax-newcm-font"}
                or entry.get("npm") in {"pyodide", "jsxgraph", "@mathjax/mathjax-newcm-font"}
                or (entry.get("npm") == "mathjax" and entry["version"].split(".", 1)[0] != "3")):
            raise AssetError(f"{name}: version belongs to runtime/jsxgraph-pins, not assets.json")
        relative_path(entry["local"].replace("{version}", entry["version"]).rstrip("/"))
        assets[name] = dict(entry)
    runtime = runtime_path.read_text(encoding="utf-8")
    found = re.findall(r"var indexURL = 'https://cdn\.jsdelivr\.net/pyodide/v([0-9]+\.[0-9]+\.[0-9]+)/full/';", runtime)
    if len(found) != 1:
        raise AssetError("The canonical Pyodide runtime constant could not be read")
    return {"assets": assets, "pyodide": found[0], "table_sha256": digest(table_path.read_bytes()),
            "runtime_sha256": digest(runtime_path.read_bytes())}


def board_versions(pins: Path) -> dict[str, str]:
    """Read exact board pins from their sole version home, without YAML deps."""
    values = {}
    for line in Path(pins).read_text(encoding="utf-8").splitlines():
        found = re.fullmatch(r"\s*(src_jxg|src_css|src_mjx|mjx_fonts):\s*(.*?)\s*", line)
        if found:
            key, value = found.groups()
            if key in values:
                raise AssetError(f"Duplicate board pin: {key}")
            values[key] = value.strip("'\"")
    packages = {"src_jxg": ("jsxgraph", "jsxgraph"), "src_css": ("jsxgraph", "jsxgraph"),
                "src_mjx": ("mathjax4", "mathjax"), "mjx_fonts": ("mathjax-newcm-font", "@mathjax/mathjax-newcm-font")}
    versions = {}
    for key, (logical, package) in packages.items():
        url = values.get(key, "")
        pattern = r"https://cdn\.jsdelivr\.net/npm/" + re.escape(package) + r"@([0-9]+\.[0-9]+\.[0-9]+)(?:/.*)?"
        found = re.fullmatch(pattern, url)
        if not found:
            raise AssetError(f"jsxgraph-pins.yml {key} needs an exact npm version")
        if logical in versions and versions[logical] != found[1]:
            raise AssetError("JSXGraph script and CSS pins differ")
        versions[logical] = found[1]
    return versions


def validate_version_homes(lock: dict, library: Path, pins: Path) -> dict[str, str]:
    sources = version_sources(library)
    expected = {name: entry["version"] for name, entry in sources["assets"].items()}
    expected["pyodide"] = sources["pyodide"]
    boards = board_versions(pins)
    if set(expected) & set(boards):
        raise AssetError("Board asset version has a duplicate canonical home")
    expected.update(boards)
    if lock.get("versions") != expected:
        raise AssetError("Asset lock versions differ from assets.json, runtime constant or jsxgraph-pins.yml; run --update-assets and review the lock")
    return expected


def write_profiles(project: Path, *, course_key: str | None = None, website: bool = True) -> list[Path]:
    """Create missing profiles only; existing authored profiles are preserved."""
    project = Path(project)
    storage_key = (course_key or project.name) + "-exam"
    theme = "offline.scss" if website else "offline-system.scss"
    profiles = {
        "_quarto-offline.yml": (
            "# Local assets: quarto render --profile offline\n"
            "project:\n  resources: [\"_ctm-assets/**\"]\n"
            "format:\n  html:\n    theme: [_extensions/ctm-assessment/" + theme + "]\n"
            "ctm-assessment:\n  assets: local\n"),
        "_quarto-exam.yml": (
            "# Exam build: quarto render --profile offline,exam\n"
            "project:\n  output-dir: _site-exam\n"
            "ctm-assessment:\n  export: true\n  save: answers\n  storage-key: "
            + json.dumps(storage_key, ensure_ascii=False) + "\n"
            "ai-feedback:\n  enabled: false\n"),
    }
    created = []
    for name, text in profiles.items():
        target = project / name
        if not target.exists():
            target.write_text(text, encoding="utf-8")
            created.append(target)
    ignore = project / ".gitignore"
    text = ignore.read_text(encoding="utf-8") if ignore.exists() else ""
    if not any(line.strip() in {"_ctm-assets/", "/_ctm-assets/", "_ctm-assets/**", "/_ctm-assets/**"}
               for line in text.splitlines()):
        ignore.write_text(text.rstrip("\n") + ("\n" if text else "") + "_ctm-assets/\n", encoding="utf-8")
    return created


def release_version(package_json: bytes, expected: str) -> str:
    """The release package.json owns its version; lock.info.version does not."""
    actual = json.loads(package_json)["version"]
    if actual != expected:
        raise AssetError(f"Pyodide package.json is {actual}, expected {expected}")
    return actual


def checked_metadata_url(url: str) -> str:
    parsed = urllib.parse.urlsplit(url)
    if (parsed.scheme != "https" or parsed.hostname not in METADATA_HOSTS
            or parsed.username or parsed.password or parsed.port not in (None, 443)):
        raise AssetError("Metadata must come from the official HTTPS registry or GitHub API")
    return url


class SafeMetadataRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        checked_metadata_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch_json(url: str) -> dict:
    checked_metadata_url(url)
    request = urllib.request.Request(url, headers={"User-Agent": "CTM-Assets/1", "Accept": "application/json"})
    with urllib.request.build_opener(SafeMetadataRedirect()).open(request, timeout=120) as response:
        checked_metadata_url(response.geturl())
        return json.load(response)


def collect_metadata(library: Path, *, source_refs=None) -> dict:
    """Collect official archive digests for review; this is not a trusted lock."""
    sources = version_sources(library)
    archives = []
    for name, entry in sorted(sources["assets"].items()):
        package, version = entry["npm"], entry["version"]
        url = "https://registry.npmjs.org/" + urllib.parse.quote(package, safe="@") + "/" + version
        metadata = fetch_json(url)
        if metadata.get("name") != package or metadata.get("version") != version:
            raise AssetError(f"{name}: registry metadata does not match the requested version")
        dist = metadata.get("dist", {})
        integrity = dist.get("integrity", "")
        if not re.fullmatch(r"sha512-[A-Za-z0-9+/]+={0,2}", integrity):
            raise AssetError(f"{name}: official npm sha512 integrity is missing")
        if len(base64.b64decode(integrity[7:], validate=True)) != 64:
            raise AssetError(f"{name}: malformed npm sha512 integrity")
        archives.append({"id": name, "npm": package, "version": version,
                         "url": checked_url(dist["tarball"]), "integrity": integrity,
                         "reported_licence": metadata.get("license"), "metadata_url": url})
    version = sources["pyodide"]
    release_url = "https://api.github.com/repos/pyodide/pyodide/releases/tags/" + version
    release = fetch_json(release_url)
    wanted = "pyodide-" + version + ".tar.bz2"
    matching = [asset for asset in release.get("assets", []) if asset.get("name") == wanted]
    if len(matching) != 1:
        raise AssetError(f"The official Pyodide release lacks {wanted}")
    asset = matching[0]
    checksum = asset.get("digest", "")
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", checksum or ""):
        raise AssetError("The official Pyodide release has no SHA-256 digest; verify its published checksum before locking")
    archives.append({"id": "pyodide", "version": version, "url": checked_url(asset["browser_download_url"]),
                     "sha256": checksum.split(":", 1)[1], "metadata_url": release_url})
    return {"v": 1, "kind": "official-asset-metadata", "sources": sources, "source_refs": dict(source_refs or {}),
            "archives": archives, "status": "archive bytes, licence texts and bundle file hashes still require verification"}


def resolve_board_metadata() -> list[dict]:
    """Propose exact versions only within the approved production major lines."""
    result = []
    for name, package, major in (("jsxgraph", "jsxgraph", 1), ("mathjax4", "mathjax", 4),
                                 ("mathjax-newcm-font", "@mathjax/mathjax-newcm-font", 4)):
        root_url = "https://registry.npmjs.org/" + urllib.parse.quote(package, safe="@")
        registry = fetch_json(root_url)
        versions = [value for value in registry.get("versions", {})
                    if re.fullmatch(str(major) + r"\.\d+\.\d+", value)]
        if not versions:
            raise AssetError(f"{name}: no stable release in approved major line {major}")
        version = max(versions, key=lambda value: tuple(map(int, value.split("."))))
        url = root_url + "/" + version
        metadata = fetch_json(url)
        if metadata.get("name") != package or metadata.get("version") != version:
            raise AssetError(f"{name}: exact registry metadata mismatch")
        integrity = metadata.get("dist", {}).get("integrity", "")
        if not re.fullmatch(r"sha512-[A-Za-z0-9+/]+={0,2}", integrity) or len(base64.b64decode(integrity[7:], validate=True)) != 64:
            raise AssetError(f"{name}: official SHA-512 integrity missing")
        result.append({"id": name, "npm": package, "version": version, "integrity": integrity,
                       "url": checked_url(metadata["dist"]["tarball"]), "metadata_url": url,
                       "reported_licence": metadata.get("license")})
    return result


def inspect_archives(metadata: dict, cache: Path) -> dict:
    """Inspect verified source bytes for review; never publish a bundle or lock."""
    cache = Path(cache)
    cache.mkdir(parents=True, exist_ok=True)
    inspected = []
    for entry in metadata["archives"]:
        archive_file = cache / ("archive-" + digest(json_bytes({k: entry.get(k) for k in ("url", "sha256", "integrity")})))
        download(entry["url"], archive_file, sha256=entry.get("sha256"), integrity=entry.get("integrity"))
        members, texts, seen = [], {}, set()
        with tarfile.open(archive_file, "r|*") as archive:
            for member in archive:
                name = member.name.rstrip("/")
                relative_path(name)
                if name in seen:
                    raise AssetError(f"Repeated archive member: {name}")
                seen.add(name)
                if member.isdir():
                    continue
                if not member.isfile():
                    raise AssetError(f"Non-regular archive member: {name}")
                stream = archive.extractfile(member)
                if stream is None:
                    raise AssetError(f"Unreadable archive member: {name}")
                data = stream.read()
                members.append({"member": name, "bytes": len(data), "sha256": digest(data)})
                basename = PurePosixPath(name).name.lower()
                if (basename in {"package.json", "pyodide-lock.json"}
                        or re.search(r"(^|[/_.-])(licen[cs]e|copying|notice|thirdpartynotices)([/_.-]|$)", name, re.I)):
                    if len(data) > 2_000_000:
                        raise AssetError(f"Review text exceeds inspection limit: {name}")
                    try:
                        texts[name] = data.decode("utf-8")
                    except UnicodeDecodeError:
                        pass
        inspected.append({**entry, "members": members, "texts": texts})
    return {"v": 1, "kind": "verified-archive-inspection", "source_refs": metadata.get("source_refs", {}),
            "sources": metadata["sources"], "archives": inspected,
            "status": "archive digests verified; file selection and licence policy still require review"}



def prepare_stdlib_probe(metadata: dict, cache: Path, destination: Path, candidates: dict) -> Path:
    """Stage only verified trusted runtime files for a read-only availability probe."""
    entries = [entry for entry in metadata.get("archives", []) if entry.get("id") == "pyodide"]
    if len(entries) != 1:
        raise AssetError("The stdlib probe needs exactly one official Pyodide archive")
    entry = entries[0]
    if not re.fullmatch(r"\d+\.\d+\.\d+", entry.get("version", "")):
        raise AssetError("The stdlib probe needs an exact Pyodide release")
    if not re.fullmatch(r"[a-f0-9]{64}", entry.get("sha256", "")):
        raise AssetError("The Pyodide availability probe requires its official SHA-256 archive digest")
    cache, destination = Path(cache), Path(destination)
    if destination.exists():
        raise AssetError("The private stdlib probe destination must not already exist")
    cache.mkdir(parents=True, exist_ok=True)
    archive_file = cache / ("archive-" + digest(json_bytes({k: entry.get(k) for k in ("url", "sha256", "integrity")})))
    download(entry["url"], archive_file, sha256=entry.get("sha256"), integrity=entry.get("integrity"))
    required = {"pyodide.js", "pyodide.mjs", "pyodide.asm.js", "pyodide.asm.wasm",
                "python_stdlib.zip", "pyodide-lock.json", "package.json"}
    destination.mkdir(parents=True)
    files = {}
    with tarfile.open(archive_file, "r|*") as archive:
        for member in archive:
            name = member.name.rstrip("/")
            relative_path(name)
            if member.isdir():
                continue
            if not member.isfile():
                raise AssetError(f"Non-regular archive member: {name}")
            if name not in {"pyodide/" + leaf for leaf in required}:
                continue
            leaf = PurePosixPath(name).name
            if leaf in files:
                raise AssetError(f"Repeated probe runtime member: {name}")
            stream = archive.extractfile(member)
            if stream is None:
                raise AssetError(f"Unreadable probe runtime member: {name}")
            data = stream.read()
            (destination / leaf).write_bytes(data)
            files[leaf] = digest(data)
    if set(files) != required:
        raise AssetError("The verified Pyodide archive is missing core probe files")
    release_version((destination / "package.json").read_bytes(), entry["version"])
    full_lock = json.loads((destination / "pyodide-lock.json").read_text(encoding="utf-8"))
    python = full_lock.get("info", {}).get("python")
    if candidates.get("python") != python:
        raise AssetError("Stdlib candidate names and verified runtime use different Python releases")
    request = {"v": 1, "python": python, "pyodide": entry["version"],
               "candidates": candidates["modules"],
               "candidate_source": candidates.get("source", {}),
               "source": {key: entry[key] for key in ("url", "sha256") if key in entry},
               "runtime_files": files}
    (destination / "probe-input.json").write_bytes(json_bytes(request))
    return destination



def _python_archive(metadata: dict, cache: Path) -> tuple[dict, Path]:
    entries = [item for item in metadata.get("archives", []) if item.get("id") == "pyodide"]
    if len(entries) != 1:
        raise AssetError("Python subset needs exactly one official Pyodide archive")
    entry = entries[0]
    version = entry.get("version", "")
    if (not re.fullmatch(r"\d+\.\d+\.\d+", version)
            or metadata.get("sources", {}).get("pyodide") != version
            or entry.get("url") != f"https://github.com/pyodide/pyodide/releases/download/{version}/pyodide-{version}.tar.bz2"
            or not re.fullmatch(r"[a-f0-9]{64}", entry.get("sha256", ""))):
        raise AssetError("Python subset needs the exact canonical official release URL and SHA-256")
    cache = Path(cache)
    if any(part.lower() in {"_ctm-assets", "_site", "_site-exam"} for part in cache.resolve().parts):
        raise AssetError("The full Python archive cache must stay outside published assets")
    cache.mkdir(parents=True, exist_ok=True)
    archive = cache / ("archive-" + digest(json_bytes({k: entry.get(k) for k in ("url", "sha256", "integrity")})))
    download(entry["url"], archive, sha256=entry["sha256"], integrity=entry.get("integrity"))
    return entry, archive


def _python_members(archive: Path, wanted) -> dict[str, bytes]:
    """Read named regular members only; duplicates and unsafe names fail closed."""
    wanted = set(wanted)
    for name in wanted:
        relative_path(name)
    result, seen = {}, set()
    with tarfile.open(archive, "r|*") as source:
        for member in source:
            name = member.name.rstrip("/")
            relative_path(name)
            if name in seen:
                raise AssetError("Repeated Python archive member: " + name)
            seen.add(name)
            if member.isdir():
                continue
            if not member.isfile():
                raise AssetError("Non-regular Python archive member: " + name)
            if name in wanted:
                stream = source.extractfile(member)
                if stream is None:
                    raise AssetError("Unreadable Python archive member: " + name)
                result[name] = stream.read()
    if set(result) != wanted:
        raise AssetError("Python archive lacks selected files: " + ", ".join(sorted(wanted - result.keys())))
    return result


def inspect_python_subset(metadata: dict, cache: Path, *, extras=()) -> dict:
    """Inspect actual verified release bytes, not a prior generated report."""
    import email.parser
    import zipfile
    entry, archive = _python_archive(metadata, cache)
    headers = _python_members(archive, {"pyodide/package.json", "pyodide/pyodide-lock.json"})
    release_version(headers["pyodide/package.json"], entry["version"])
    full = _availability_json(headers["pyodide/pyodide-lock.json"], "release lock")
    if not isinstance(full.get("info"), dict) or not isinstance(full.get("packages"), dict):
        raise AssetError("Invalid official Python package lock")
    subset = package_closure(full, (*EXAM_PACKAGES, *extras))
    core = {"pyodide.js", "pyodide.mjs", "pyodide.asm.js", "pyodide.asm.wasm",
            "python_stdlib.zip", "package.json"}
    wanted = {"pyodide/" + name for name in core}
    package_files = set()
    for name, package in subset["packages"].items():
        leaf = package.get("file_name")
        if not isinstance(leaf, str) or len(relative_path(leaf).parts) != 1:
            raise AssetError("Invalid Python package filename: " + name)
        if leaf in core or leaf in package_files:
            raise AssetError("Conflicting Python package filename: " + leaf)
        package_files.add(leaf)
        wanted.add("pyodide/" + leaf)
    payloads = _python_members(archive, wanted)
    packages = {}
    for name, package in subset["packages"].items():
        leaf = package["file_name"]
        data = payloads["pyodide/" + leaf]
        verify_bytes(data, sha256=package.get("sha256"))
        details = {"version": package["version"], "file_name": leaf, "sha256": digest(data),
                   "package_type": package.get("package_type"), "licence_texts": {}, "metadata": {}}
        if leaf.endswith(".whl"):
            with zipfile.ZipFile(io.BytesIO(data)) as wheel:
                seen = set()
                for member in wheel.infolist():
                    path = member.filename.rstrip("/")
                    relative_path(path)
                    if path in seen:
                        raise AssetError("Repeated wheel member: " + path)
                    seen.add(path)
                    if member.is_dir():
                        continue
                    if (member.external_attr >> 16) & 0o170000 == 0o120000:
                        raise AssetError("Wheel contains a symlink: " + path)
                    if len(PurePosixPath(path).parts) == 2 and path.endswith(".dist-info/METADATA"):
                        message = email.parser.BytesParser().parsebytes(wheel.read(member))
                        if details["metadata"]:
                            raise AssetError("Wheel has ambiguous distribution metadata: " + leaf)
                        details["metadata"] = {key: message.get_all(key, []) for key in
                                               ("Name", "Version", "License", "License-Expression", "Classifier")}
                    if re.search(r"(^|[/_.-])(licen[cs]e|copying|notice|thirdpartynotices)([/_.-]|$)", path, re.I):
                        if member.file_size > 2_000_000:
                            raise AssetError("Python licence text exceeds review limit: " + path)
                        details["licence_texts"][path] = wheel.read(member).decode("utf-8")
            fields = details["metadata"]
            if (len(fields.get("Name", [])) != 1
                    or normalise_package(fields["Name"][0]) != normalise_package(name)
                    or fields.get("Version") != [package["version"]]):
                raise AssetError("Wheel metadata does not match the official package lock: " + name)
        packages[name] = details
    # Full lock remains in memory/cache only. This report contains the selected closure.
    return {"entry": entry, "archive": archive, "subset": subset, "packages": packages,
            "core": {name: digest(payloads["pyodide/" + name]) for name in sorted(core)}}


def _curated_python_licences(root: Path, release: str, python: str) -> dict:
    root = Path(root)
    provenance = _availability_json((root / "integration/assets-licences/provenance.json").read_bytes(), "licence provenance")
    result = {}
    for name, record in provenance["entries"].items():
        path = relative_path(record["file"])
        data = root.joinpath(*path.parts).read_bytes()
        blob = git_blob_sha1(data)
        if blob != record["git_blob_sha1"]:
            raise AssetError("Curated Python licence differs from its official Git blob: " + name)
        result[name] = dict(record, text=data.decode("utf-8"), sha256=digest(data))
    expected = {
        "python-stdlib": f"https://github.com/python/cpython/blob/v{python}/LICENSE",
        "pyodide": f"https://github.com/pyodide/pyodide/blob/{release}/LICENSE",
    }
    for name, source in expected.items():
        if result[name]["source"] != source:
            raise AssetError("Curated Python licence uses another release: " + name)
    basis = f"https://github.com/pyodide/pyodide/blob/{release}/Makefile.envs"
    if any(result[name].get("version_basis") != basis for name in ("python-stdlib", "emscripten")):
        raise AssetError("Curated Python/Emscripten licence uses another release basis")
    return result


def produce_python_lock(metadata: dict, cache: Path, *, extras=(), licence_policy=None,
                        accepted_licences=(), licence_root: Path | None = None) -> dict:
    """Generate a PRIVATE PARTIAL candidate; never represent complete assets."""
    report = inspect_python_subset(metadata, cache, extras=extras)
    release = report["entry"]["version"]
    curated = _curated_python_licences(licence_root or Path(__file__).resolve().parents[1], release, report["subset"]["info"]["python"])
    policy = licence_policy or {}
    generated, licenses, expressions = [], [], []
    def generate(path, text):
        generated.append({"path": path, "text": text, "sha256": digest(text.encode("utf-8"))})
    def license_text(path, text):
        if not text.strip():
            raise AssetError("Empty Python licence text: " + path)
        licenses.append(path)
        generate(path, text)
    for name in ("python-stdlib", "emscripten", "pyodide"):
        record = curated[name]
        license_text(f"LICENSES/pyodide/{name}.txt", record["text"])
        expressions.append(record["licence"])
    package_policy, source_offers = {}, []
    for name, package in report["packages"].items():
        record = policy.get(name)
        metadata_fields = package["metadata"]
        if record is not None:
            if not isinstance(record, dict) or record.get("version") != package["version"]:
                raise AssetError("Python licence policy requires exact package version: " + name)
            if (record.get("sha256") != package["sha256"]
                    or not isinstance(record.get("source"), str)
                    or not re.fullmatch(r"https://github\.com/[^/]+/[^/]+/blob/[^?#]+", record["source"])
                    or not re.fullmatch(r"[a-f0-9]{40}", record.get("git_blob_sha1", ""))):
                raise AssetError("Python licence policy needs pinned wheel and primary source evidence: " + name)
            text = package["licence_texts"].get(record.get("licence_file"))
            if text is None or git_blob_sha1(text.encode("utf-8")) != record["git_blob_sha1"]:
                raise AssetError("Python licence text differs from the primary source Git blob: " + name)
            expression = record.get("licence")
            if record.get("source_offer"):
                source_offers.append(record["source_offer"])
        elif name in curated:
            if package["file_name"] not in curated[name]["applies_to"]:
                raise AssetError("Curated Python licence uses another package version: " + name)
            expression = curated[name]["licence"]
        elif package["package_type"] == "cpython_module":
            expression = curated["python-stdlib"]["licence"]
        else:
            values = metadata_fields.get("License-Expression") or metadata_fields.get("License") or []
            if len(values) != 1:
                raise AssetError("Python package needs a reviewed exact-version licence policy: " + name)
            expression = values[0].strip()
        obligations = allow_licence(name, expression, accepted_licences)
        if obligations and not (record or {}).get("source_offer"):
            raise AssetError("Python package needs a source offer: " + name)
        texts = package["licence_texts"]
        if texts:
            for path, text in sorted(texts.items()):
                license_text(f"LICENSES/python/{name}/{path}", text)
        else:
            selected = name if name in curated else "python-stdlib" if package["package_type"] == "cpython_module" else None
            if selected is None:
                raise AssetError("Python package has no own or curated licence text: " + name)
            if selected == name and package["file_name"] not in curated[selected]["applies_to"]:
                raise AssetError("Curated Python licence uses another package version: " + name)
            license_text(f"LICENSES/python/{name}/LICENSE.txt", curated[selected]["text"])
        expressions.append(expression)
        package_policy[name] = {"version": package["version"], "licence": expression,
                                "file_name": package["file_name"], "sha256": package["sha256"]}
    prefix = f"pyodide/{release}/"
    files = [{"member": name, "path": prefix + name, "sha256": checksum}
             for name, checksum in sorted(report["core"].items())]
    files.extend({"member": package["file_name"], "path": prefix + package["file_name"],
                  "sha256": package["sha256"]} for package in report["packages"].values())
    subset_text = json_bytes(report["subset"]).decode("utf-8")
    generate(prefix + "pyodide-lock.json", subset_text)
    archive = {key: report["entry"][key] for key in ("id", "url", "sha256")}
    archive.update({"prefix": "pyodide/", "files": sorted(files, key=lambda item: item["member"]),
                    "licence": " AND ".join("(" + value + ")" for value in sorted(set(expressions))),
                    "licence_files": sorted(licenses), "source_offer": "\n".join(sorted(set(source_offers)))})
    lock = {"v": 1, "kind": "private-partial-python-assets-lock", "scope": ["pyodide"],
            "status": "PRIVATE PARTIAL candidate: Python only; npm/board composition and full offline acceptance pending",
            "versions": {"pyodide": release}, "archives": [archive],
            "generated": sorted(generated, key=lambda item: item["path"]),
            "python_packages": package_policy, "python_roots": sorted(set(EXAM_PACKAGES)),
            "python_extras": sorted(set(extras)), "provenance": {
                "metadata_sha256": digest(json_bytes(metadata)),
                "licence_policy": {name: policy[name] for name in sorted(set(policy) & set(report["packages"]))},
                "curated_licences": {key: {k: v for k, v in value.items() if k != "text"}
                                     for key, value in sorted(curated.items())}}}
    lock["files"] = derive_lock_files(lock, cache, accepted_licences=accepted_licences)
    return lock


def write_private_lock(lock: dict, destination: Path) -> Path:
    destination = Path(destination).resolve()
    if any(part.lower() in {"_ctm-assets", "_site", "_site-exam"} for part in destination.parts):
        raise AssetError("Partial lock candidates must stay in a private cache outside published assets")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(json_bytes(lock))
    return destination


# Runtime files required by the canonical asset table's consumers. Versions and
# package identities stay in assets.json; this is only the selection policy.
NPM_SELECTION = {
    "font-awesome": {"files": ("js/all.min.js",)},
    "katex": {"prefixes": ("dist/",),
              "files": ("dist/katex.mjs", "dist/katex.min.css", "dist/contrib/auto-render.mjs")},
    "mathjax3": {"prefixes": ("es5/",), "files": ("es5/tex-chtml-full.js",)},
    "monaco-editor": {"prefixes": ("min/",),
                      "files": ("min/vs/loader.js", "min/vs/editor/editor.main.js",
                                "min/vs/editor/editor.main.css", "min/vs/base/worker/workerMain.js")},
    "source-sans-pro": {"prefixes": ("files/",),
                        "files": ("300.css", "400.css", "700.css"), "root_css": True},
}


def _npm_licence_member(name: str) -> bool:
    basename = PurePosixPath(name).name
    return bool(re.search(r"(^|[_.-])(licen[cs]e|copying|notice|thirdpartynotices)([_.-]|$)",
                          basename, re.I))


def produce_npm_lock(metadata: dict, library: Path, cache: Path, *, accepted_licences=()) -> dict:
    """Generate a private, partial lock from exact canonical npm source bytes.

    This deliberately excludes Pyodide and board packages. It is not a complete
    installable offline asset set. Building and carrying this candidate exercises
    the same canonical materializer as the eventual composed lock.
    """
    if metadata.get("v") != 1 or metadata.get("kind") != "official-asset-metadata":
        raise AssetError("An official asset metadata record is required")
    sources = version_sources(library)
    assets = sources["assets"]
    if set(assets) != set(NPM_SELECTION):
        raise AssetError("The canonical npm asset table needs a reviewed file-selection policy")
    recorded = metadata.get("sources", {})
    if recorded.get("assets") != assets or recorded.get("table_sha256") != sources["table_sha256"]:
        raise AssetError("Npm metadata differs from the canonical asset table")
    entries = metadata.get("archives")
    if not isinstance(entries, list):
        raise AssetError("Official metadata archives must be a list")
    indexed = {}
    for entry in entries:
        if not isinstance(entry, dict) or not isinstance(entry.get("id"), str):
            raise AssetError("Malformed official npm metadata entry")
        name = entry["id"]
        if name in indexed:
            raise AssetError(f"Duplicate official asset metadata: {name}")
        if name not in assets and name != "pyodide":
            raise AssetError(f"Unrecognized official asset metadata: {name}")
        indexed[name] = entry
    if set(assets) - set(indexed):
        raise AssetError("Official metadata lacks canonical npm assets")
    selected_metadata = []
    for name, asset in sorted(assets.items()):
        entry = indexed[name]
        package, version = asset["npm"], asset["version"]
        metadata_url = "https://registry.npmjs.org/" + urllib.parse.quote(package, safe="@") + "/" + version
        tarball_url = "https://registry.npmjs.org/" + package + "/-/" + package.split("/")[-1] + "-" + version + ".tgz"
        if (entry.get("npm") != package or entry.get("version") != version
                or entry.get("metadata_url") != metadata_url or entry.get("url") != tarball_url):
            raise AssetError(f"{name}: npm package, version or official source URL differs from assets.json")
        selected_metadata.append(entry)
    inspection = inspect_archives({**metadata, "archives": selected_metadata}, cache)
    archives = []
    for inspected in inspection["archives"]:
        name = inspected["id"]
        asset, policy = assets[name], NPM_SELECTION[name]
        members, texts = {}, inspected["texts"]
        for item in inspected["members"]:
            original = item["member"]
            if not original.startswith("package/"):
                raise AssetError(f"{name}: npm member is outside package/: {original}")
            member = str(relative_path(original[len("package/"):]))
            if member in members:
                raise AssetError(f"{name}: duplicate normalized member: {member}")
            members[member] = item
        try:
            package_data = texts["package/package.json"]
            package_json = json.loads(package_data)
        except (KeyError, json.JSONDecodeError, TypeError):
            raise AssetError(f"{name}: verified archive has no readable package.json") from None
        if package_json.get("name") != asset["npm"] or package_json.get("version") != asset["version"]:
            raise AssetError(f"{name}: archive package.json does not match the canonical package/version")
        licence = package_json.get("license")
        if not isinstance(licence, str) or licence != inspected.get("reported_licence"):
            raise AssetError(f"{name}: archive and official metadata licence declarations differ")
        obligations = allow_licence(name, licence, accepted_licences)
        # This initial core selection has no approved source-offer record. A new
        # copyleft package needs a separate reviewed policy, not just a CLI token.
        if obligations:
            raise AssetError(f"{name}: core npm selection has no reviewed source-offer record")
        license_members = sorted(member for member in members if _npm_licence_member(member))
        root_licenses = [member for member in license_members if "/" not in member
                         and re.match(r"^(licen[cs]e|copying)([_.-]|$)", member, re.I)]
        if not root_licenses:
            raise AssetError(f"{name}: verified archive has no root licence text")
        for member in license_members:
            text = texts.get("package/" + member)
            if not isinstance(text, str) or not text.strip():
                raise AssetError(f"{name}: unreadable or empty licence/notice text: {member}")
        if name == "monaco-editor" and not any(
                re.match(r"^thirdpartynotices([_.-]|$)", PurePosixPath(member).name, re.I)
                for member in license_members):
            raise AssetError("monaco-editor: ThirdPartyNotices must accompany the runtime")
        required = set(policy["files"])
        if not required <= set(members):
            raise AssetError(f"{name}: archive lacks required runtime files: " + ", ".join(sorted(required - set(members))))
        runtime = set(required)
        for prefix in policy.get("prefixes", ()):
            matching = {member for member in members if member.startswith(prefix)}
            if not matching:
                raise AssetError(f"{name}: archive lacks required runtime directory {prefix}")
            runtime.update(matching)
        if policy.get("root_css"):
            runtime.update(member for member in members if "/" not in member and member.endswith(".css"))
        selected = runtime | set(license_members)
        local = asset["local"].replace("{version}", asset["version"])
        if not local.endswith("/"):
            raise AssetError(f"{name}: canonical local package base must end in /")
        relative_path(local.rstrip("/"))
        files = [{"member": member, "path": local + member, "sha256": members[member]["sha256"]}
                 for member in sorted(selected)]
        archives.append({
            "id": name, "version": asset["version"], "npm": asset["npm"],
            "url": inspected["url"], "integrity": inspected["integrity"], "prefix": "package/",
            "licence": licence, "licence_files": [local + member for member in license_members],
            "files": files, "package_json_sha256": digest(package_data.encode("utf-8")),
        })
    font = assets["source-sans-pro"]
    font_local = font["local"].replace("{version}", font["version"])
    css = "".join('@import url("../' + font_local + str(weight) + '.css");\n'
                  for weight in (300, 400, 700))
    generated = [{"path": "fonts/source-sans-pro.css", "text": css,
                  "sha256": digest(css.encode("utf-8"))}]
    lock = {
        "v": 1, "kind": "private-partial-npm-assets-lock",
        "scope": sorted(assets),
        "versions": {name: asset["version"] for name, asset in sorted(assets.items())},
        "archives": archives, "generated": generated,
        "provenance": {"metadata_sha256": digest(json_bytes(metadata)),
                       "table_sha256": sources["table_sha256"],
                       "source_refs": dict(metadata.get("source_refs", {}))},
    }
    lock["files"] = derive_lock_files(lock, cache, accepted_licences=accepted_licences)
    return lock



def main(argv=None):
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    metadata = sub.add_parser("metadata", help="Collect official npm/release digests for review")
    metadata.add_argument("--libs", type=Path, required=True, help="ctm-libs extension folder")
    metadata.add_argument("--output", type=Path, required=True)
    metadata.add_argument("--source-ref", action="append", default=[], metavar="NAME=SHA")
    metadata.add_argument("--resolve-board-lines", action="store_true", help="Report exact candidates in approved board major lines")
    inspection = sub.add_parser("inspect", help="Inspect verified archives for lock and licence review")
    inspection.add_argument("--metadata", type=Path, required=True)
    inspection.add_argument("--cache", type=Path, required=True)
    inspection.add_argument("--output", type=Path, required=True)
    probe = sub.add_parser("prepare-stdlib-probe", help="Stage verified Pyodide core for trusted availability inspection")
    probe.add_argument("--metadata", type=Path, required=True)
    probe.add_argument("--cache", type=Path, required=True)
    probe.add_argument("--directory", type=Path, required=True)
    probe.add_argument("--candidates", type=Path, required=True)
    verify = sub.add_parser("verify", help="Verify a carried bundle against the reviewed external lock")
    verify.add_argument("--lock", type=Path, required=True)
    verify.add_argument("--bundle", type=Path, required=True)
    index = sub.add_parser("import-index", help="Consume reviewed release availability into a private scanner index")
    index.add_argument("--availability", type=Path, required=True)
    index.add_argument("--probe-core", type=Path, required=True)
    index.add_argument("--reviewed-report-sha256", required=True, help="Digest approved independently of this probe invocation")
    index.add_argument("--candidates", type=Path)
    index.add_argument("--output", type=Path, required=True)
    python_lock = sub.add_parser("python-lock", help="Produce a PRIVATE PARTIAL official Python subset candidate")
    python_lock.add_argument("--metadata", type=Path, required=True)
    python_lock.add_argument("--cache", type=Path, required=True)
    python_lock.add_argument("--output", type=Path, required=True)
    python_lock.add_argument("--python-packages", default="", help="Explicit comma-separated extras; never all")
    python_lock.add_argument("--licence-policy", type=Path)
    python_lock.add_argument("--accept-licence", action="append", default=[])
    npm_lock = sub.add_parser("npm-lock", help="Produce a PRIVATE PARTIAL canonical npm asset candidate")
    npm_lock.add_argument("--metadata", type=Path, required=True)
    npm_lock.add_argument("--libs", type=Path, required=True)
    npm_lock.add_argument("--cache", type=Path, required=True)
    npm_lock.add_argument("--output", type=Path, required=True)
    build = sub.add_parser("build", help="Build bytes from an external reviewed lock")
    build.add_argument("--lock", type=Path, required=True)
    build.add_argument("--cache", type=Path, required=True)
    build.add_argument("--bundle", type=Path, required=True)
    build.add_argument("--accept-licence", action="append", default=[])
    carried = sub.add_parser("install-carried", help="Verify and install a carried bundle with an external reviewed lock")
    carried.add_argument("--lock", type=Path, required=True)
    carried.add_argument("--source", type=Path, required=True)
    carried.add_argument("--bundle", type=Path, required=True)
    carried.add_argument("--accept-licence", action="append", default=[])
    args = parser.parse_args(argv)
    if args.command == "metadata":
        refs = dict(value.split("=", 1) for value in args.source_ref)
        result = collect_metadata(args.libs, source_refs=refs)
        if args.resolve_board_lines:
            result["archives"].extend(resolve_board_metadata())
            result["status"] += "; board candidates require exact pin review"
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_bytes(json_bytes(result))
    elif args.command == "inspect":
        result = inspect_archives(json.loads(args.metadata.read_text(encoding="utf-8")), args.cache)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_bytes(json_bytes(result))
    elif args.command == "prepare-stdlib-probe":
        prepare_stdlib_probe(json.loads(args.metadata.read_text(encoding="utf-8")), args.cache, args.directory,
                             json.loads(args.candidates.read_text(encoding="utf-8")))
    elif args.command == "import-index":
        candidates = _availability_json(args.candidates.read_bytes(), "candidates") if args.candidates else None
        index = private_import_index_from_availability(args.availability.read_bytes(), args.probe_core,
                    reviewed_report_sha256=args.reviewed_report_sha256, candidates=candidates)
        write_private_import_index(index, args.output)
        print(f'Validated {len(index["stdlib_modules"])} available modules into the private import index')
    elif args.command == "npm-lock":
        result = produce_npm_lock(json.loads(args.metadata.read_text(encoding="utf-8")), args.libs, args.cache)
        write_private_lock(result, args.output)
        print(f'Generated PRIVATE PARTIAL npm lock for {len(result["versions"])} canonical assets; no Pyodide/board assets')
    elif args.command == "python-lock":
        policy = _availability_json(args.licence_policy.read_bytes(), "licence policy") if args.licence_policy else None
        result = produce_python_lock(_availability_json(args.metadata.read_bytes(), "metadata"), args.cache,
                    extras=tuple(name.strip() for name in args.python_packages.split(",") if name.strip()),
                    licence_policy=policy, accepted_licences=args.accept_licence)
        write_private_lock(result, args.output)
        print(f'PRIVATE PARTIAL Python lock: {len(result["python_packages"])} packages, {len(result["files"])} files')
    elif args.command == "build":
        build_from_lock(_availability_json(args.lock.read_bytes(), "lock"), args.bundle, args.cache,
                        accepted_licences=args.accept_licence)
    elif args.command == "install-carried":
        install_carried_bundle(_availability_json(args.lock.read_bytes(), "lock"), args.source, args.bundle,
                               accepted_licences=args.accept_licence)
    else:
        verify_bundle(args.bundle, json.loads(args.lock.read_text(encoding="utf-8")))


if __name__ == "__main__":
    main()
