#!/usr/bin/env python3
"""Install the CTM Assessment package, built from this checkout, into a Quarto project.

Course projects fetch ctm-assessment at the ref they want and call:

    python <ctm-assessment>/scripts/install-project.py --project DIR [--review-refs JSON]

The package is built with setup-feedback-integration.py: every component at the
commit pinned in integration/feedback/repos.json, or at the commits given in
--review-refs for a coordinated review. The script replaces only the
extensions the package owns, keeps the project's other extensions, checks every
installed file against the package record and copies that record to
DIR/.private-extensions/resolved-repos.json.
"""
import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def run(*args, cwd=None):
    print("$", " ".join(str(a) for a in args), flush=True)
    subprocess.run([str(a) for a in args], cwd=cwd, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--project", type=Path, required=True, help="Quarto project to install into")
    parser.add_argument("--review-refs", default="{}", help="JSON map of component commits for a coordinated review build")
    parser.add_argument("--workspace", type=Path, help="Build folder (default: PROJECT/.private-extensions/ctm-assessment-build)")
    parser.add_argument("--source", action="append", default=[], metavar="NAME=PATH",
                        help="Build a component from a local Git checkout (development); repeatable")
    args = parser.parse_args()
    project = args.project.resolve()
    if not project.is_dir():
        sys.exit(f"ERROR: project folder not found: {project}")
    try:
        review_refs = json.loads(args.review_refs)
    except json.JSONDecodeError as error:
        sys.exit(f"ERROR: --review-refs is not JSON: {error}")
    if not isinstance(review_refs, dict):
        sys.exit("ERROR: --review-refs must be a JSON object")
    private = project / ".private-extensions"
    workspace = (args.workspace or private / "ctm-assessment-build").resolve()
    private.mkdir(exist_ok=True)

    run(sys.executable, ROOT / "scripts" / "setup-feedback-integration.py",
        "--workspace", workspace, "--review-refs", json.dumps(review_refs),
        *[option for source in args.source for option in ("--source", source)])
    distribution = workspace / "ctm-assessment"
    record = json.loads((distribution / "resolved-repos.json").read_text(encoding="utf-8"))

    # Replace only the extensions this package owns; keep the course's own.
    for name in record["extension_sha256"]:
        installed = project / "_extensions" / name
        if installed.exists():
            shutil.rmtree(installed)
    run("quarto", "add", distribution, "--no-prompt", cwd=project)
    for name, files in record["extension_sha256"].items():
        for relative, expected in files.items():
            installed = project / "_extensions" / name / relative
            if not installed.is_file() or hashlib.sha256(installed.read_bytes()).hexdigest() != expected:
                sys.exit(f"ERROR: installed file differs from the package record: {name}/{relative}")
    shutil.copy2(distribution / "resolved-repos.json", private / "resolved-repos.json")
    print(f"\nCTM Assessment installed in {project / '_extensions'}")
    print(f"Component commits: {private / 'resolved-repos.json'}")


if __name__ == "__main__":
    main()
