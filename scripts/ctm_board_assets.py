#!/usr/bin/env python3
"""Produce a private board-only asset lock from the sole exact board pin home."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import tarfile

import ctm_assets as assets

PACKAGES = {"jsxgraph": "jsxgraph", "mathjax4": "mathjax",
            "mathjax-newcm-font": "@mathjax/mathjax-newcm-font"}
SELECTION = {
    "jsxgraph": {"prefixes": ("distrib/",),
                 "files": ("distrib/jsxgraphcore.js", "distrib/jsxgraph.css")},
    # Keep complete npm runtime distributions: dynamic extensions, speech
    # mathmaps, both font renderers and all WOFF2 ranges remain available.
    "mathjax4": {"all_files": True, "prefixes": ("sre/mathmaps/", "input/tex/extensions/"),
                 "files": ("tex-mml-svg.js", "sre/mathmaps/base.json")},
    "mathjax-newcm-font": {"all_files": True,
                          "prefixes": ("chtml/dynamic/", "chtml/woff2/", "svg/dynamic/"),
                          "files": ("chtml.js", "svg.js")},
}
GUST_SOURCE = "https://tug.org/fonts/licenses/GUST-FONT-LICENSE.txt"
LPPL_SOURCE = "https://www.latex-project.org/lppl/lppl-1-3c.txt"


def board_sources(pins: Path) -> dict:
    versions = assets.board_versions(pins)
    values = {}
    for line in Path(pins).read_text(encoding="utf-8").splitlines():
        found = re.fullmatch(r"\s*(src_jxg|src_css|src_mjx|mjx_fonts):\s*(.*?)\s*", line)
        if found:
            values[found[1]] = found[2].strip("'\"")
    expected = {
        "src_jxg": f"https://cdn.jsdelivr.net/npm/jsxgraph@{versions['jsxgraph']}/distrib/jsxgraphcore.js",
        "src_css": f"https://cdn.jsdelivr.net/npm/jsxgraph@{versions['jsxgraph']}/distrib/jsxgraph.css",
        "src_mjx": f"https://cdn.jsdelivr.net/npm/mathjax@{versions['mathjax4']}/tex-mml-svg.js",
        "mjx_fonts": "https://cdn.jsdelivr.net/npm/@mathjax/mathjax-newcm-font@"
                     + versions["mathjax-newcm-font"] + "/",
    }
    git = re.fullmatch(r'https://cdn\.jsdelivr\.net/gh/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)@([a-f0-9]{40})/_extensions/jsxgraph/resources/js/jsxgraphcore\.js', values.get('src_jxg', ''))
    if git:
        base = 'https://cdn.jsdelivr.net/gh/' + git[1] + '@' + git[2] + '/_extensions/jsxgraph/resources/'
        expected.update(src_jxg=base+'js/jsxgraphcore.js', src_css=base+'css/jsxgraph.css')
    if values != expected:
        raise assets.AssetError("Board asset paths differ from the canonical script/CSS/font-root contract")
    sources = {name: {"npm": PACKAGES[name], "version": version,
                   "local": f"npm/{PACKAGES[name]}@{version}/"}
            for name, version in versions.items()}
    if git:
        sources['jsxgraph'] = {'kind': 'git-build', 'repository': git[1], 'version': git[2],
                              'local': 'gh/' + git[1] + '@' + git[2] + '/'}
    return sources


def git_runtime_archive(metadata, canonical, cache):
    """Select the reviewed built Git artifact and retain its upstream evidence."""
    source = canonical['jsxgraph']
    matches = [item for item in metadata.get('archives', []) if item.get('id') == 'jsxgraph']
    if len(matches) != 1:
        raise assets.AssetError('Exactly one JSXGraph Git artifact record is required')
    entry, = matches
    repo, revision = source['repository'], source['version']
    url = 'https://codeload.github.com/' + repo + '/tar.gz/' + revision
    if (entry.get('kind') != 'git-build' or entry.get('repository') != repo
            or entry.get('version') != revision or entry.get('url') != url
            or not re.fullmatch(r'[a-f0-9]{64}', entry.get('sha256', ''))
            or not re.fullmatch(r'[a-f0-9]{64}', entry.get('runtime_manifest_sha256', ''))):
        raise assets.AssetError('JSXGraph Git artifact differs from its canonical immutable source')
    archive = Path(cache) / ('archive-' + assets.digest(assets.json_bytes({k: entry.get(k) for k in ('url', 'sha256', 'integrity')})))
    assets.download(url, archive, sha256=entry['sha256'])
    prefix = repo.split('/')[1] + '-' + revision + '/'
    manifest_name = '_extensions/jsxgraph/upstream-runtime.json'
    with tarfile.open(archive) as tar:
        def member(name, limit):
            found = [m for m in tar if m.name == prefix + name]
            if len(found) != 1 or not found[0].isfile() or found[0].size > limit:
                raise assets.AssetError('Missing, duplicate or oversized Git runtime member: ' + name)
            return tar.extractfile(found[0]).read()
        raw = member(manifest_name, 16384)
        assets.verify_bytes(raw, sha256=entry['runtime_manifest_sha256'])
        manifest = assets._availability_json(raw, 'Git runtime provenance')
        if (manifest.get('v') != 1 or {key: manifest.get(key) for key in ('repository','commit')} != entry.get('upstream')
                or not re.fullmatch(r'[a-f0-9]{40}', manifest.get('commit', ''))
                or not re.fullmatch(r'[a-f0-9]{64}', manifest.get('sourceArchiveSha256', ''))
                or not re.fullmatch(r'[a-f0-9]{64}', manifest.get('packageLockSha256', ''))
                or any(not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+', manifest.get(key, '')) for key in ('node','webpack'))
                or manifest.get('build') != ['npm ci --ignore-scripts', 'npm run buildCore']
                or manifest.get('recipe') != 'scripts/build-upstream-runtime.py'):
            raise assets.AssetError('Git runtime lacks its reviewed upstream source/lock/build evidence')
        required = {'resources/js/jsxgraphcore.js', 'resources/css/jsxgraph.css',
                    'resources/upstream/LICENSE.MIT', 'resources/upstream/LICENSE.LGPL', 'resources/upstream/COPYRIGHT'}
        if set(manifest.get('files', {})) != required:
            raise assets.AssetError('Unexpected Git runtime provenance inventory')
        files = []
        for name, checksum in sorted(manifest['files'].items()):
            name = '_extensions/jsxgraph/' + name
            assets.verify_bytes(member(name, 4*1024*1024), sha256=checksum)
            files.append({'member':name, 'path':source['local']+name, 'sha256':checksum})
        for name in (manifest_name, manifest['recipe']):
            data = member(name, 65536)
            files.append({'member':name, 'path':source['local']+name, 'sha256':assets.digest(data)})
    return {'id':'jsxgraph', 'version':revision, 'url':url, 'sha256':entry['sha256'], 'prefix':prefix,
            'licence':'MIT', 'licence_files':[source['local']+'_extensions/jsxgraph/resources/upstream/LICENSE.MIT'],
            'files':files, 'upstream':manifest}


def font_licences(metadata: dict, canonical: dict, root: Path, policy: Path | None = None):
    """Load the reviewed exception for this exact archive, never for npm generally."""
    root = Path(root)
    path = policy or root / "integration/assets-board-licences.json"
    if not path.is_file() or path.is_symlink():
        raise assets.AssetError("The exact board font needs its reviewed curated licence policy")
    raw = path.read_bytes()
    record = assets._availability_json(raw, "board font licence policy")
    if record.get("v") != 1 or record.get("kind") != "reviewed-board-font-licences":
        raise assets.AssetError("Unsupported board font licence policy")
    matches = [entry for entry in metadata.get("archives", [])
               if isinstance(entry, dict) and entry.get("id") == "mathjax-newcm-font"]
    if len(matches) != 1:
        raise assets.AssetError("The font needs exactly one official archive record")
    entry, = matches
    if (record.get("font") != {key: entry.get(key) for key in ("npm", "version", "url", "integrity", "reported_licence")}
            or entry.get("npm") != canonical["mathjax-newcm-font"]["npm"]
            or entry.get("version") != canonical["mathjax-newcm-font"]["version"]
            or entry.get("reported_licence") != "Apache-2.0"
            or record.get("licence") != "Apache-2.0 AND GUST-Font-License"):
        raise assets.AssetError("Curated font licences do not match the exact canonical font archive")
    evidence = record.get("evidence")
    if (not isinstance(evidence, dict)
            or not re.fullmatch(r"[a-f0-9]{64}", evidence.get("report_sha256", ""))
            or not re.fullmatch(r"[a-f0-9]{40}", evidence.get("report_git_blob_sha1", ""))):
        raise assets.AssetError("Curated font policy needs its independently reviewed inspection report hashes")
    members = record.get("member_sha256")
    if (not isinstance(members, dict) or not members
            or any(not re.fullmatch(r"chtml/woff2/[^/]+\.woff2", name)
                   or not isinstance(checksum, str) or not re.fullmatch(r"[a-f0-9]{64}", checksum)
                   for name, checksum in members.items())):
        raise assets.AssetError("Curated font policy needs the exact inspected WOFF2 member hashes")
    copyrights = record.get("copyrights")
    if (not isinstance(copyrights, list) or not copyrights
            or any(not isinstance(text, str) or "GUST Font License" not in text
                   or "http://tug.org/fonts/licenses/GUST-FONT-LICENSE.txt" not in text for text in copyrights)):
        raise assets.AssetError("Curated font policy needs its actual embedded copyright notices")
    expected_sources = {
        "apache": f"https://github.com/mathjax/MathJax/blob/{canonical['mathjax4']['version']}/LICENSE",
        "gust": GUST_SOURCE, "lppl": LPPL_SOURCE,
    }
    licences = record.get("licences")
    if not isinstance(licences, dict) or set(licences) != set(expected_sources):
        raise assets.AssetError("The font needs Apache, GUST and incorporated LPPL licence texts")
    generated = []
    for name, source in expected_sources.items():
        item = licences[name]
        if not isinstance(item, dict) or item.get("source") != source:
            raise assets.AssetError("Curated font licence needs its exact primary source: " + name)
        relative = assets.relative_path(item.get("file"))
        file = root.joinpath(*relative.parts)
        if not file.is_file() or file.is_symlink():
            raise assets.AssetError("Missing curated font licence text: " + name)
        data = file.read_bytes()
        if (assets.digest(data) != item.get("sha256")
                or assets.git_blob_sha1(data) != item.get("git_blob_sha1")):
            raise assets.AssetError("Curated font licence differs from its primary source bytes: " + name)
        text = data.decode("utf-8")
        if not text.strip() or text.lstrip().startswith("<"):
            raise assets.AssetError("Empty or non-text curated font licence: " + name)
        target = f"LICENSES/boards/mathjax-newcm-font/{name}.txt"
        generated.append({"path": target, "text": text, "sha256": assets.digest(data)})
    copyright_text = "\n\n".join(copyrights) + "\n"
    generated.append({"path": "LICENSES/boards/mathjax-newcm-font/COPYRIGHT.txt",
                      "text": copyright_text, "sha256": assets.digest(copyright_text.encode("utf-8"))})
    return record, {"licence": record["licence"], "files": generated}, assets.digest(raw)


def produce_board_lock(metadata: dict, pins: Path, cache: Path, *, licence_root: Path | None = None,
                       licence_policy: Path | None = None) -> dict:
    canonical = board_sources(pins)
    root = licence_root or Path(__file__).resolve().parents[1]
    record, supplement, policy_digest = font_licences(metadata, canonical, root, licence_policy)
    npm = {name: item for name,item in canonical.items() if item.get('kind') != 'git-build'}
    archives, inspection = assets.select_npm_archives(
        metadata, npm, SELECTION, cache,
        allowed_extras=set(assets.NPM_SELECTION) | {"pyodide", "jsxgraph"},
        curated_licences={"mathjax-newcm-font": supplement})
    if canonical['jsxgraph'].get('kind') == 'git-build':
        archives.append(git_runtime_archive(metadata, canonical, cache))
    font, = [item for item in inspection["archives"] if item["id"] == "mathjax-newcm-font"]
    actual = {member["member"][len("package/"):]: member["sha256"] for member in font["members"]
              if member["member"].startswith("package/chtml/woff2/") and member["member"].endswith(".woff2")}
    if actual != record["member_sha256"]:
        raise assets.AssetError("The archive fonts differ from the reviewed embedded GUST licence evidence")
    evidence = record["evidence"]
    definitions = {member["member"]: member["sha256"] for member in font["members"]}
    if (evidence.get("definition_member") != "package/def/mathjax-newcm.ts"
            or evidence.get("definition_sha256") != definitions.get("package/def/mathjax-newcm.ts")):
        raise assets.AssetError("The font definition differs from the reviewed SVG/CHTML source evidence")
    lock = {
        "v": 1, "kind": "private-partial-board-assets-lock",
        "status": "PRIVATE PARTIAL candidate: board assets only; composition and real offline/fork acceptance remain pending",
        "scope": sorted(canonical),
        "versions": {name: entry["version"] for name, entry in sorted(canonical.items())},
        "archives": archives, "generated": sorted(supplement["files"], key=lambda item: item["path"]),
        "provenance": {"metadata_sha256": assets.digest(assets.json_bytes(metadata)),
                       "board_pins_sha256": assets.digest(Path(pins).read_bytes()),
                       "font_licence_policy_sha256": policy_digest,
                       "font_evidence": record.get("evidence", {}),
                       "source_refs": dict(metadata.get("source_refs", {}))},
    }
    lock["files"] = assets.derive_lock_files(lock, cache)
    return lock


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--metadata", type=Path, required=True)
    parser.add_argument("--pins", type=Path, required=True)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--licence-root", type=Path)
    parser.add_argument("--licence-policy", type=Path)
    args = parser.parse_args(argv)
    metadata = assets._availability_json(args.metadata.read_bytes(), "official board metadata")
    lock = produce_board_lock(metadata, args.pins, args.cache, licence_root=args.licence_root,
                              licence_policy=args.licence_policy)
    assets.write_private_lock(lock, args.output)
    print(f"PRIVATE PARTIAL board lock: {len(lock['archives'])} archives / {len(lock['files'])} files")


if __name__ == "__main__":
    main()
