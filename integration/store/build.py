#!/usr/bin/env python3
"""Render two tiny store fixtures through the canonical package installer."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = Path(__file__).resolve().parent


def run(*args, cwd=None):
    subprocess.run([str(x) for x in args], cwd=cwd, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dest", type=Path, required=True)
    parser.add_argument("--review-refs", default="{}")
    args = parser.parse_args()
    dest = args.dest.resolve()
    if dest.exists() and any(dest.iterdir()):
        parser.error("--dest must be empty; generated fixtures never replace existing work")
    dest.mkdir(parents=True, exist_ok=True)
    before, after = dest / "before", dest / "after"
    for target in (before, after):
        shutil.copytree(FIXTURE / "course", target)
    run(sys.executable, ROOT / "scripts/install-project.py", "--project", before,
        "--workspace", dest / "package", "--review-refs", args.review_refs)
    # Both versions use the same canonical package, without a second resolver.
    shutil.copytree(before / "_extensions", after / "_extensions")
    text = (after / "index.qmd").read_text(encoding="utf-8")
    for change in json.loads((FIXTURE / "changes.json").read_text()):
        if text.count(change["before"]) != 1:
            raise SystemExit("A reviewed fixture change must match exactly once: " + change["before"])
        text = text.replace(change["before"], change["after"])
    (after / "index.qmd").write_text(text, encoding="utf-8")
    for target in (before, after):
        run("quarto", "render", cwd=target)
    shutil.copy2(before / ".private-extensions/resolved-repos.json", dest / "resolved-repos.json")


if __name__ == "__main__":
    main()
