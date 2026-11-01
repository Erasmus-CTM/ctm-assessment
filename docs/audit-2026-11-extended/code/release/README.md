# Release/render audit harnesses

All scripts write only explicit scratch/output paths. Raw logs remain outside the report repository.

- `boundary-probes.py --root /path/to/ctm-assessment`: reproduce cached-source trust, eight-file deployment inventory, nested asset classification and version-only release guard. All changed fixture files use `TemporaryDirectory`.
- `render-combined.py --sources /workspace --snapshots /workspace/audit-snapshots --out /tmp/ctm-audit-combined`: render EN/NB combined math/Python/feedback/JSXGraph/tabset fixture from independently pinned sources.
- `run-official-integration.py --prepare-only`: create exact umbrella clone, seed caches from Git archives/independently verified snapshots. Without the flag, run the repository's actual `setup-feedback-integration.py --test --browser`. Defaults describe this audit workspace; substitute equivalent independently verified sources when rerunning elsewhere.
- `prepare-canonical-pyodide.py --lock /path/to/npm/pyodide/pyodide-lock.json --out /tmp/pyodide-packages`: fetch the0.28.3 dependency closure with configured curl HTTPS trust and verify every wheel against the unmodified lock.
- `prepare-browser-assets.py --out /tmp/ctm-audit-browser-assets`: fetch exact npm asset archives and verify registry SHA512 integrity before extraction.
- `local-browser-preload.cjs`: audit-only Playwright transport mapping CDN resource URLs to these local files; source JS, package hashes and TLS checks remain intact. Defaults use the paths above; override `CTM_AUDIT_NPM_ASSETS`, `CTM_AUDIT_PYODIDE_CORE`, `PYODIDE_PACKAGES` when needed. Set `NODE_OPTIONS=--require=/absolute/path/local-browser-preload.cjs` for the campaign's browser processes. Floating `mathjax@3` and `katex@0.16` URLs are mapped to the package's explicit3.2.2 and0.16.47 versions; this transport scope is disclosed in the report.

Canonical local example:

```sh
source /workspace/.cloud-setup/activate.sh
PYODIDE_PACKAGES=/workspace/audit-assets/pyodide-packages \
NODE_OPTIONS=--require=/workspace/audit-work/code/release/local-browser-preload.cjs \
python /workspace/audit-work/code/release/run-official-integration.py
```

The initial default campaign's remote package fetches failed; the subsequent campaign uses original-lock canonical artifacts. No trust-store changes or TLS verification bypasses were performed. A requested import of the existing environment proxy CA into persistent Chromium NSS trust was rejected by automatic approval review; the local transport fallback was used instead.
