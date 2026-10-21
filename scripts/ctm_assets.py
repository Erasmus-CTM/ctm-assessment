#!/usr/bin/env python3
"""Verified offline asset primitives shared by package builder and installer.

Network metadata collection is separate from bundle construction. Building and
installing never trust a manifest without the reviewed lock's file hashes.
"""
from __future__ import annotations

import base64
import gzip
import hashlib
import hmac
import io
import json
from pathlib import Path, PurePosixPath
import re
import tarfile
import tempfile
import urllib.parse
import urllib.request

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


def package_closure(full_lock: dict, requested) -> dict:
    packages = full_lock.get("packages", {})
    selected, visiting = {}, set()
    def visit(name):
        if name == "all":
            raise AssetError("Name Python extras explicitly; 'all' is not supported")
        if name in selected:
            return
        if name in visiting:
            raise AssetError(f"Dependency cycle in Pyodide lock: {name}")
        if name not in packages:
            raise AssetError(f"Pyodide distribution has no package {name}")
        visiting.add(name)
        entry = packages[name]
        for dependency in entry.get("depends", []):
            visit(dependency)
        visiting.remove(name)
        selected[name] = entry
    for name in requested:
        visit(name)
    return {"info": dict(full_lock.get("info", {})), "packages": dict(sorted(selected.items()))}


def allow_licence(name: str, spdx: str | None, accepted=()) -> None:
    if not spdx:
        raise AssetError(f"{name}: unknown licence; add a reviewed licence record")
    permissive = {"MIT", "MIT-CMU", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0",
                  "MPL-2.0", "PSF-2.0", "OFL-1.1", "CC-BY-4.0", "GUST-Font-License", "UIUC"}
    if spdx not in permissive and spdx not in set(accepted):
        raise AssetError(f"{name}: {spdx} needs --accept-licence {spdx} and a source offer")


def inventory(root: Path) -> dict[str, str]:
    root = Path(root)
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


def build_from_lock(lock: dict, destination: Path, cache: Path, *, accepted_licences=()) -> Path:
    """Construct into a private stage, verify, then publish to an empty target."""
    if lock.get("v") != 1 or not lock.get("archives"):
        raise AssetError("Unsupported or empty asset lock")
    destination, cache = Path(destination), Path(cache)
    # Reusing a verified bundle must not bypass the caller's licence policy.
    accepted_licences = tuple(accepted_licences)
    for archive in lock["archives"]:
        allow_licence(archive["id"], archive.get("licence"), accepted_licences)
        if archive.get("licence") in set(accepted_licences) and not archive.get("source_offer"):
            raise AssetError(f'{archive["id"]}: accepted copyleft licence needs a source offer')
        if not archive.get("licence_files"):
            raise AssetError(f'{archive["id"]}: licence text is required')
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
        notices = ["# Third-party notices", ""]
        for archive in lock["archives"]:
            archive_file = cache / ("archive-" + digest(json_bytes({k: archive.get(k) for k in ("url", "sha256", "integrity")})))
            download(archive["url"], archive_file, sha256=archive.get("sha256"), integrity=archive.get("integrity"))
            extract_selected(archive_file, stage, archive["files"], prefix=archive.get("prefix", "package/"))
            for name in archive["licence_files"]:
                if not (stage / str(relative_path(name))).is_file():
                    raise AssetError(f"Licence file was not extracted: {name}")
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
        (stage / "THIRD-PARTY-NOTICES.md").write_bytes("\n".join(notices).encode("utf-8"))
        precompress(stage)
        manifest = {"v": 1, "versions": lock["versions"], "files": inventory(stage)}
        (stage / "manifest.json").write_bytes(json_bytes(manifest))
        # A manifest cannot list its own hash; the reviewed lock lists it.
        verify_bundle(stage, lock)
        destination.parent.mkdir(parents=True, exist_ok=True)
        stage.rename(destination)
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
        if name == "pyodide" or entry.get("npm") in {"jsxgraph", "@mathjax/mathjax-newcm-font"}:
            raise AssetError(f"{name}: version belongs to runtime/jsxgraph-pins, not assets.json")
        relative_path(entry["local"].replace("{version}", entry["version"]).rstrip("/"))
        assets[name] = dict(entry)
    runtime = runtime_path.read_text(encoding="utf-8")
    found = re.findall(r"var indexURL = 'https://cdn\.jsdelivr\.net/pyodide/v([0-9]+\.[0-9]+\.[0-9]+)/full/';", runtime)
    if len(found) != 1:
        raise AssetError("The canonical Pyodide runtime constant could not be read")
    return {"assets": assets, "pyodide": found[0], "table_sha256": digest(table_path.read_bytes()),
            "runtime_sha256": digest(runtime_path.read_bytes())}


def release_version(package_json: bytes, expected: str) -> str:
    """The release package.json owns its version; lock.info.version does not."""
    actual = json.loads(package_json)["version"]
    if actual != expected:
        raise AssetError(f"Pyodide package.json is {actual}, expected {expected}")
    return actual


def fetch_json(url: str) -> dict:
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or parsed.hostname not in {"registry.npmjs.org", "api.github.com"} or parsed.username or parsed.password:
        raise AssetError("Metadata must come from the official registry or GitHub API")
    request = urllib.request.Request(url, headers={"User-Agent": "CTM-Assets/1", "Accept": "application/json"})
    with urllib.request.build_opener(SafeRedirect()).open(request, timeout=120) as response:
        final = urllib.parse.urlsplit(response.geturl())
        if final.scheme != "https" or final.hostname not in {"registry.npmjs.org", "api.github.com"}:
            raise AssetError("Metadata redirect left the official sources")
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


def main(argv=None):
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    metadata = sub.add_parser("metadata", help="Collect official npm/release digests for review")
    metadata.add_argument("--libs", type=Path, required=True, help="ctm-libs extension folder")
    metadata.add_argument("--output", type=Path, required=True)
    metadata.add_argument("--source-ref", action="append", default=[], metavar="NAME=SHA")
    verify = sub.add_parser("verify", help="Verify a carried bundle against the reviewed external lock")
    verify.add_argument("--lock", type=Path, required=True)
    verify.add_argument("--bundle", type=Path, required=True)
    args = parser.parse_args(argv)
    if args.command == "metadata":
        refs = dict(value.split("=", 1) for value in args.source_ref)
        result = collect_metadata(args.libs, source_refs=refs)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_bytes(json_bytes(result))
    else:
        verify_bundle(args.bundle, json.loads(args.lock.read_text(encoding="utf-8")))


if __name__ == "__main__":
    main()
