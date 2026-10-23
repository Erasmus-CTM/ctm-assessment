#!/usr/bin/env python3
"""Actual Quarto Meta producer contract, with neutral local resource fixtures."""
import base64
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
EXTENSION = ROOT / "_extensions" / "ctm-assessment"
KEY = "src_mjx_preload"
HELPER = b"window.__opaqueFixture = true;\n"
CAPABILITY = b'globalThis.CTM_COI_FRAME_STARTUP={protocol:"ctm-coi-frame-startup",version:1};\n'


def value(node):
    if node["t"] in {"MetaBool", "MetaString"}:
        return node["c"]
    assert node["t"] == "MetaInlines", node
    return "".join(" " if item["t"] == "Space" else item["c"] for item in node["c"])


class Scripts(HTMLParser):
    def __init__(self):
        super().__init__(); self.scripts = []; self.in_head = False
    def handle_starttag(self, tag, attrs):
        if tag == "head": self.in_head = True
        if tag == "script": self.scripts.append((dict(attrs), self.in_head))
    def handle_endtag(self, tag):
        if tag == "head": self.in_head = False


def main():
    quarto = os.environ.get("QUARTO") or shutil.which("quarto")
    if not quarto:
        raise SystemExit("Set QUARTO to the executable; this contract never silently skips.")
    cases = [("default", "", None, True),
             ("blank", 'jsxgraph:\n  src_mjx_preload: ""\n', "", False),
             ("false-metadata-only", 'jsxgraph:\n  src_mjx_preload: false\n', False, False),
             ("custom", 'jsxgraph:\n  src_mjx_preload: author-preload.js\n', "author-preload.js", False)]
    results = []
    with tempfile.TemporaryDirectory(prefix="ctm-meta-") as directory:
        folder = Path(directory); extension = folder / "_extensions/ctm-assessment"
        extension.mkdir(parents=True)
        for name in ["ctm-assessment.lua", "jsxgraph-pins.yml", "author-imports.lua"]:
            shutil.copy2(EXTENSION / name, extension / name)
        library = folder / "_extensions/ctm-libs/runtime"; library.mkdir(parents=True)
        (library / "mathjax-opaque-adaptor.js").write_bytes(HELPER)
        (library / "coi-frame-startup.js").write_text("window.__coordinatorFixture = true;\n")
        (folder / "capture.lua").write_text("function Pandoc(doc) local f=assert(io.open('metadata.json','w')); f:write(pandoc.write(doc,'json')); f:close(); return doc end\n")
        (folder / "_quarto.yml").write_text("project:\n  type: default\nformat:\n  html:\n    theme: none\nfilters:\n  - _extensions/ctm-assessment/ctm-assessment.lua\n  - capture.lua\n")
        for name, metadata, expected, defaulted in cases:
            (folder / "metadata.qmd").write_text("---\ntitle: Metadata contract\n" + metadata + "---\n\nContract.\n")
            run = subprocess.run([quarto, "render", "metadata.qmd", "--to", "html"], cwd=folder,
                                 capture_output=True, text=True, timeout=45)
            assert run.returncode == 0, (run.stdout, run.stderr)
            meta = json.loads((folder / "metadata.json").read_text())["meta"]
            actual = value(meta["jsxgraph"]["c"][KEY])
            recorded = KEY in meta["_ctm-assessment-pin-defaults"]["c"]
            scripts = Scripts(); scripts.feed((folder / "metadata.html").read_text())
            coordinator = [(attrs, head) for attrs, head in scripts.scripts if "ctm-coi-frame-startup" in attrs.get("src", "")]
            if defaulted:
                assert actual.startswith("data:text/javascript;base64,"), actual
                assert base64.b64decode(actual.split(",", 1)[1]) == CAPABILITY + HELPER
                assert len(coordinator) == 1 and coordinator[0][1]
                assert not any(key in coordinator[0][0] for key in ["async", "defer", "type"]), coordinator
            else:
                assert actual == expected, (name, actual)
                assert coordinator == [], (name, coordinator)
            assert recorded is defaulted, (name, recorded)
            results.append({"case": name, "recorded_as_default": recorded,
                            "coordinator_head_scripts": len(coordinator), "value_sha256": hashlib.sha256(str(actual).encode()).hexdigest()})
    print(json.dumps({"passed": True, "scope": "Production Meta + actual Quarto dependency emission; neutral local resource fixtures, no JSXGraph/vendor/browser acceptance", "quarto": subprocess.check_output([quarto, "--version"], text=True).strip(),
                      "filter_sha256": hashlib.sha256((EXTENSION / "ctm-assessment.lua").read_bytes()).hexdigest(), "cases": results}, indent=2))


if __name__ == "__main__":
    main()
