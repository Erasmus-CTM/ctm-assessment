#!/usr/bin/env python3
"""Focused actual Lua/Pandoc metadata contract; no project render or browser."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[2]
EXTENSION = ROOT / "_extensions" / "ctm-assessment"
KEY = "src_mjx_preload"
DEFAULT = "_extensions/ctm-libs/runtime/mathjax-opaque-adaptor.js"


def value(node):
    if node["t"] in {"MetaBool", "MetaString"}:
        return node["c"]
    assert node["t"] == "MetaInlines", node
    return "".join(" " if item["t"] == "Space" else item["c"] for item in node["c"])


def main():
    quarto = os.environ.get("QUARTO") or shutil.which("quarto")
    if not quarto:
        raise SystemExit("Set QUARTO to the executable; this contract never silently skips.")
    cases = [("default", "", DEFAULT, True),
             ("blank", 'jsxgraph:\n  src_mjx_preload: ""\n', "", False),
             ("false-metadata-only", 'jsxgraph:\n  src_mjx_preload: false\n', False, False),
             ("custom", 'jsxgraph:\n  src_mjx_preload: author-preload.js\n', "author-preload.js", False)]
    results = []
    with tempfile.TemporaryDirectory(prefix="ctm-meta-") as directory:
        folder = Path(directory)
        wrapper = folder / "metadata.lua"
        # Pandoc loads the production filter directly. Its Quarto path/log
        # services are scoped here; no component filter or asset is substituted.
        base = json.dumps(EXTENSION.as_posix())
        wrapper.write_text(
            "quarto = {utils={resolve_path=function(name) return " + base + " .. '/' .. name end},"
            "project={directory=" + json.dumps(folder.as_posix()) + "},"
            "doc={input_file='metadata.md'},log={warning=function(message) error(message) end}}\n"
            "dofile(" + json.dumps((EXTENSION / "ctm-assessment.lua").as_posix()) + ")\n",
            encoding="utf-8")
        for name, metadata, expected, defaulted in cases:
            document = folder / "metadata.md"
            document.write_text("---\ntitle: Metadata contract\n" + metadata + "---\n\nContract.\n", encoding="utf-8")
            run = subprocess.run([quarto, "pandoc", str(document), "--from", "markdown", "--to", "json",
                                  "--lua-filter", str(wrapper)], capture_output=True, text=True, timeout=30, check=True)
            meta = json.loads(run.stdout)["meta"]
            actual = value(meta["jsxgraph"]["c"][KEY])
            recorded = KEY in meta["_ctm-assessment-pin-defaults"]["c"]
            assert actual == expected and recorded is defaulted, (name, actual, recorded)
            results.append({"case": name, "value": actual, "recorded_as_default": recorded})
    print(json.dumps({"passed": True, "scope": "Umbrella Meta filter only; no downstream JSXGraph render or asset delivery", "quarto": subprocess.check_output([quarto, "--version"], text=True).strip(),
                      "filter_sha256": hashlib.sha256((EXTENSION / "ctm-assessment.lua").read_bytes()).hexdigest(),
                      "cases": results}, indent=2))


if __name__ == "__main__":
    main()
