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


def check_python_sources(sources: list[dict], full_lock: dict, subset: dict, *, local_modules=()) -> dict:
    """Reuse the one canonical packaged AST scanner; never maintain a copy."""
    scanner = Path(__file__).resolve().parents[1] / "_extensions" / "ctm-assessment" / "author-imports.py"
    if not scanner.is_file():
        raise AssetError(f"The canonical packaged author-imports.py is missing: {scanner}")
    spec = importlib.util.spec_from_file_location("ctm_author_imports", scanner)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    try:
        return module.check_sources(sources, full_lock, subset, local_modules=local_modules)
    except module.ImportCheckError as error:
        raise AssetError(str(error)) from None


def allow_licence(name: str, spdx: str | None, accepted=()) -> frozenset[str]:
    """Validate SPDX AND/OR policy; return explicitly accepted obligations.

    OR chooses an available branch, preferring one with no extra consent.
    AND requires each branch. Unsupported syntax is refused, never guessed.
    """
    if not spdx:
        raise AssetError(f"{name}: unknown licence; add a reviewed licence record")
    permissive = {"MIT", "MIT-CMU", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0",
                  "MPL-2.0", "PSF-2.0", "OFL-1.1", "CC-BY-4.0", "GUST-Font-License", "UIUC"}
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
        backup = Path(temporary) / "previous"
        if destination.exists():
            destination.rename(backup)
        try:
            stage.rename(destination)
        except OSError:
            if backup.exists():
                backup.rename(destination)
            raise
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
    expected.update(board_versions(pins))
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
    verify = sub.add_parser("verify", help="Verify a carried bundle against the reviewed external lock")
    verify.add_argument("--lock", type=Path, required=True)
    verify.add_argument("--bundle", type=Path, required=True)
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
    else:
        verify_bundle(args.bundle, json.loads(args.lock.read_text(encoding="utf-8")))


if __name__ == "__main__":
    main()
