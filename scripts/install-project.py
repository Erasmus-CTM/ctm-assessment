#!/usr/bin/env python3
"""Install the CTM Assessment package, built from this checkout, into a Quarto project.

Course projects fetch ctm-assessment at the ref they want and call:

    python <ctm-assessment>/scripts/install-project.py --project DIR [--review-refs REFS]

The package is built with setup-feedback-integration.py --package-only (no
example site, so no SymPy or Node are needed): every component at the
commit pinned in integration/feedback/repos.json, or at the commits given in
--review-refs for a coordinated review. REFS is NAME=SHA[,NAME=SHA...] or a
JSON object {"NAME": "SHA"}; each SHA is a full 40-character commit. The
script replaces only the extensions the package owns, keeps the project's other
extensions, checks every installed file against the package record and copies
that record to DIR/.private-extensions/resolved-repos.json. If `quarto add` or
the check fails, the previous extensions are put back.

On Windows, keep the build folder short (for example --workspace C:\\ctm-build)
when the project path is long.
"""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FULL_SHA = re.compile(r"[0-9a-f]{40}")


class InstallError(Exception):
    """A failure reported as one line, without a traceback."""


def run(*args, cwd=None):
    print("$", " ".join(str(a) for a in args), flush=True)
    subprocess.run([str(a) for a in args], cwd=cwd, check=True)


def components():
    return set(json.loads((ROOT / "integration" / "feedback" / "repos.json").read_text(encoding="utf-8"))["repositories"])


def parse_review_refs(text, known):
    """NAME=SHA[,NAME=SHA...] or a JSON object -> {name: sha}; raises InstallError."""
    text = text.strip()
    if text.startswith(("{", "[")):
        try:
            refs = json.loads(text)
        except json.JSONDecodeError as error:
            raise InstallError(f"--review-refs is not valid JSON ({error}). "
                               "In PowerShell use the form NAME=SHA[,NAME=SHA...] instead.") from None
        if not isinstance(refs, dict):
            raise InstallError("--review-refs must be a JSON object or NAME=SHA[,NAME=SHA...]")
    else:
        refs = {}
        for entry in filter(None, (part.strip() for part in text.split(","))):
            name, separator, sha = entry.partition("=")
            if not separator:
                raise InstallError(f"--review-refs entry {entry!r} is not NAME=SHA")
            if name.strip() in refs:
                raise InstallError(f"--review-refs names {name.strip()} twice")
            refs[name.strip()] = sha.strip()
    if "ctm-assessment" in refs:
        raise InstallError("--review-refs cannot set ctm-assessment: the installer always builds the "
                           "checkout it is part of. Fetch ctm-assessment at the ref you want instead.")
    for name, sha in refs.items():
        if name not in known:
            raise InstallError(f"--review-refs names an unknown component: {name} "
                               f"(known: {', '.join(sorted(known - {'ctm-assessment'}))})")
        if not isinstance(sha, str) or not FULL_SHA.fullmatch(sha):
            raise InstallError(f"--review-refs {name}: {sha!r} is not a full 40-character commit SHA")
    return refs


def first_mismatch(project, record):
    """The first installed file that differs from the package record, or None."""
    for name, files in record["extension_sha256"].items():
        for relative, expected in files.items():
            installed = project / "_extensions" / name / relative
            if not installed.is_file() or hashlib.sha256(installed.read_bytes()).hexdigest() != expected:
                return f"{name}/{relative}"
    return None


def restore(extensions, owned, backup):
    """Remove whatever was installed for `owned` and move the backed-up folders back."""
    for name in owned:
        if (extensions / name).exists():
            shutil.rmtree(extensions / name)
    if backup.exists():
        for saved in backup.iterdir():
            saved.rename(extensions / saved.name)
        backup.rmdir()


def replace_extensions(project, distribution, record, backup):
    """Install the package; on failure put the previous owned folders back."""
    extensions = project / "_extensions"
    owned = list(record["extension_sha256"])
    if backup.exists():
        raise InstallError(f"{backup} is left from an interrupted install and may hold the previous "
                           "extensions. Move its folders back into _extensions/ (or delete it), then run again.")
    backup.mkdir(parents=True)
    try:
        for name in owned:
            if (extensions / name).exists():
                (extensions / name).rename(backup / name)
    except OSError as error:
        try:
            restore(extensions, [], backup)
        except OSError:
            raise InstallError(f"could not move the installed {name} aside ({error}); "
                               f"the folders already moved are in {backup}") from None
        raise InstallError(f"could not move the installed {name} aside ({error}); nothing was changed.") from None
    try:
        run("quarto", "add", distribution, "--no-prompt", cwd=project)
        failure = first_mismatch(project, record)
        if failure:
            failure = f"installed file differs from the package record: {failure}"
    except subprocess.CalledProcessError as error:
        failure = f"quarto add failed (exit status {error.returncode}; see its output above)"
    except OSError as error:
        failure = f"could not run quarto add ({error})"
    if failure:
        try:
            restore(extensions, owned, backup)
        except OSError as error:
            raise InstallError(f"{failure}; restoring failed ({error}): the previous extensions are in {backup}") from None
        raise InstallError(failure + "; the previous extensions were restored.")
    shutil.rmtree(backup)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--project", type=Path, required=True, help="Quarto project to install into")
    parser.add_argument("--review-refs", default="", metavar="REFS",
                        help="Component commits for a coordinated review build: NAME=SHA[,NAME=SHA...] "
                             "or a JSON object; full 40-character SHAs")
    parser.add_argument("--workspace", type=Path,
                        help="Build folder (default: PROJECT/.private-extensions/ctm-assessment-build; "
                             r"on Windows a short path such as C:\ctm-build avoids long-path errors)")
    parser.add_argument("--source", action="append", default=[], metavar="NAME=PATH",
                        help="Build a component from a local Git checkout (development); repeatable")
    args = parser.parse_args()
    project = args.project.resolve()
    try:
        if not project.is_dir():
            raise InstallError(f"project folder not found: {project}")
        review_refs = parse_review_refs(args.review_refs, components())
        private = project / ".private-extensions"
        workspace = (args.workspace or private / "ctm-assessment-build").resolve()
        private.mkdir(exist_ok=True)
        try:
            run(sys.executable, ROOT / "scripts" / "setup-feedback-integration.py",
                "--workspace", workspace, "--review-refs", json.dumps(review_refs), "--package-only",
                *[option for source in args.source for option in ("--source", source)])
        except subprocess.CalledProcessError:
            raise InstallError("building the package failed (see the output above); the project was not changed.") from None
        distribution = workspace / "ctm-assessment"
        record = json.loads((distribution / "resolved-repos.json").read_text(encoding="utf-8"))
        replace_extensions(project, distribution, record, private / "previous")
        shutil.copy2(distribution / "resolved-repos.json", private / "resolved-repos.json")
    except InstallError as error:
        sys.exit(f"ERROR: {error}")
    print(f"\nCTM Assessment installed in {project / '_extensions'}")
    print(f"Component commits: {private / 'resolved-repos.json'}")


if __name__ == "__main__":
    main()
