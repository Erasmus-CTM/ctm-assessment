# Audit harnesses and rerunning

These scripts document/reproduce the report. Run from disposable snapshots, not live course checkouts. They use synthetic mathematics, dummy configuration keys and a loopback mock provider; no production AI key is needed. Large package/runtime caches and raw logs are not committed.

## Prerequisites and snapshot layout

Use the report's full SHAs. Keep sibling Git checkouts named `ctm-assessment`, `ctm-libs`, `ctm-checkers`, `math-exercise`, `py-exercise`, `pyodide-interaktiv`, `ctm-stack`, `jsxgraph-quarto`, `ctm-demo`, `ingmat3a_ntnu`, `stack-wasm-maxima`; freehand was under `audit-snapshots/freehand_ai_assessment`. Some available workspace branches differed from their audit pins, so use exact archives/clones for execution and `git show COMMIT:path` for citations. `architecture-snapshots.json` explicitly records object-store paths and commits; adapt paths, retain SHAs.

Tool versions used: Node24.19.0, Quarto1.8.27, CPython3.12.14, SymPy1.13.3, Pyodide0.28.3, networkx3.4.2, PyYAML, pytest, jsdom, Playwright and axe-core4.14.0. Install Node dependencies using each snapshot's lock. `ctm-checkers/tools/build.py` builds the matching wheels and `tools/build_authoring.py` the native-authoring distribution; do not replace them with arbitrary installed checker versions. The worker lightweight Maxima tests intentionally need their own checker pin, documented below.

In this workspace `source /workspace/.cloud-setup/activate.sh` selected installed tools. This is environment-specific setup, not a repository requirement. Listening on loopback and launching browser children require the execution tool's network permission. Failures from sandbox EPERM or missing browser executables are not source-test passes.

## Harness catalogue

| Harness | Invocation / purpose |
|---|---|
| `run-suites.py` | `CTM_AUDIT_ROOT=/workspace python code/run-suites.py`; archives exact pins into audit-tests, runs own npm/Python/JSX suites, puts logs in /tmp. Optional trailing job names select reruns. Set the tool/cache paths near the top for another host. |
| `architecture/inventory.py` | `python code/architecture/inventory.py architecture-snapshots.json /tmp/inventory`; Git-blob ownership, bytes/hashes, exact and normalized near copies. |
| `architecture/contracts.py` | `python code/architecture/contracts.py architecture-snapshots.json /tmp/contracts.json`; literal globals/data-attribute references, including built-ins/test hooks. |
| `architecture/contract-probes.py` | `python code/architecture/contract-probes.py /workspace`; actual Lua singleton and embedded Python grader observations. |
| `architecture/locale-probe.cjs` | `node code/architecture/locale-probe.cjs /workspace/ctm-libs`; Nynorsk widget vs shared resolver. |
| `architecture/consumer-renders.py` | Disposable source archives with exact package/native-authoring and isolated Quarto caches; JSON excludes raw logs. Inspect CLI defaults before running elsewhere. |
| `architecture/summarize-skips.py` | Summarizes a completed `pytest -ra` log; raw logs remain outside Git. |
| `security/source-controls.py` | `python code/security/source-controls.py --workspace /workspace`; source admission/bounds observations plus ordinary parsing/bind_data, not an exploitation test. |
| `grading/grading_probe.py` | `PYTHONPATH=/workspace/ctm-checkers/src python code/grading/grading_probe.py`; seeded math properties, inclusive tolerance boundaries and bounded parser/binding timings; redirect JSON to /tmp. |
| `grading/freehand_probe.py` | `PYTHONPATH=/workspace/ctm-checkers/src python code/grading/freehand_probe.py /workspace/audit-snapshots/freehand_ai_assessment /workspace/math-exercise`; exact extracted authored checkers, properties and GR-2/GR-3 counterexamples. |
| `grading/pyodide_probe.cjs` | `node code/grading/pyodide_probe.cjs PYODIDE_PACKAGE PURE_SOURCE_ZIP GRADING_PROBE_JSON`; same requests under three hash seeds. See grading appendix for archive provenance; imports from local sources, not a worker/UI benchmark. |
| `grading/similar_probe.cjs` | `node code/grading/similar_probe.cjs /workspace PYTHON`; actual public MathSimilar attach/restore/variant behavior and real CPython dispatch. Add `--memory` and Node `--expose-gc` for3×100bounded panel generations; deterministic provider/grader/setup substitutions are stated in output. |
| `grading/run_math_parity.py` | Recreates PR45 base/head Quarto builds and the umbrella's actual `integration/pyodide-parity/run.cjs`; accepts `--wheels` for downloaded pure wheels or an explicit local-repack fallback. `--help` lists paths. |
| `provider/provider-matrix.cjs` | `node code/provider/provider-matrix.cjs /workspace/ctm-libs --real-cuts`; loopback JSON/SSE server, provider bodies/retries, resource/terminal controls and concurrent real30/60/100s cuts. Omit real-cuts for the quick matrix. |
| `provider/browser-provider.py` | `python code/provider/browser-provider.py /workspace/ctm-libs`; Chromium CORS-less504, same-origin path sharing, dummy-key copy exclusion, mock hint output and grade-event observation. |
| `provider/math-playwright.config.mjs` and transport helpers | See `provider/README.md`; original own math assertions, system Chromium and local transport substitutions. Reports distinguish mirrored assets, scratch locks, service-worker exclusion, and policy-blocked graphical cases. |
| `release/boundary-probes.py` | `python code/release/boundary-probes.py`; temporary source-cache marker, deployment-list scope, prefixed asset classifier and release guard reproductions. No audited receipt/lock changes. |
| `release/render-combined.py` | `python code/release/render-combined.py --sources /workspace --snapshots /workspace/audit-snapshots --out /tmp/ctm-audit-combined`; actual clean EN/NB Quarto fixture. |
| `release/run-official-integration.py` | Creates exact isolated umbrella campaign sources and runs actual `setup-feedback-integration.py --test --browser`; inspect path flags/defaults. Source assertions and setup script remain unmodified. |
| `release/prepare-canonical-pyodide.py` | Fetches the19-package original-lock closure via configured HTTPS trust and verifies SHA256; `PYODIDE_PACKAGES` selects the local cache. |
| `release/prepare-browser-assets.py` | Fetches exact npm asset tarballs and verifies registry SHA512 SRI for local test transport. |
| `release/local-browser-preload.cjs` | Browser route transport for matching CDN URLs to canonical local files. Does not disable TLS or managed navigation policy; unknown files continue normally and log a mirror miss. |
| `release/preload-playwright.cjs` | Ensures ESM browser suites share the preloaded CommonJS Playwright object. |
| `release/summarize-official.py` | Summarizes campaign sections, exit and missing mirrors; retain original failing run separately. |
| `accessibility.py` | `python code/accessibility.py --site /tmp/ctm-audit-combined/_site --paths en.html nb.html --out /tmp/axe.json`; WCAG tags, keyboard/state observations and390/1280px width; blocks external fetches. Four freehand page arguments appear in accessibility appendix. |
| `measure-bundles.py` | `python code/measure-bundles.py SITE PAGE...`; uncompressed HTML and unique direct local JS/CSS bytes; excludes dynamic imports/fetches. |
| `workers/prepare-python-runtime.py`, `bench.py` | [Separate portable instructions](workers/README.md); exact standalone older-worker local fixture, normal readiness/Stop/restart and explicit engine availability. |
| `workers/run-maxima-lightweight.py` | Existing seven JS+three Python CI scripts against Maxima's own checker pin c366f175;34Python cases. No fresh full Wasm/realSTACK certification. |
| `workers/jsxgraph-diagnostic.mjs` | Captures actual frame navigation/DOM/events and separately decoded original iframe source. Confirms managed Chromium blocks data: navigation before code; no policy bypass. |

Some scripts intentionally assume the established workspace sibling layout; adapt only paths/environment and preserve exact snapshot/input semantics.

## Local browser/runtime transport

Node/browser direct fetches through the hosted proxy did not work uniformly. The canonical official fallback is reproducible without changing source or security settings:

1. Prepare canonical0.28.3 package closure with `release/prepare-canonical-pyodide.py`, verifying the untouched npm lock. Prepare pinned npm browser assets with `release/prepare-browser-assets.py` and registry SRI.
2. Set `PYODIDE_PACKAGES` to the wheel cache, `CTM_AUDIT_NPM_ASSETS` to mirrored npm root, `CTM_AUDIT_PYODIDE_CORE` to npm Pyodide0.28.3, and `CHROMIUM_EXECUTABLE` to the authorized installed browser.
3. Use `NODE_OPTIONS='--require /absolute/path/code/release/local-browser-preload.cjs'` for CommonJS browser suites, or `preload-playwright.cjs` for ESM fixtures. Keep source assertions and the official setup command intact.
4. Retain actual failures/not-run counts. Managed policy in this host blocks data: iframes; local asset mirroring cannot establish graphical/MathJax iframe correctness. Firefox/WebKit executables and actual SEB were unavailable. No browser policy/trust setting was changed.

Separate parity and own similar-browser runs used patched **scratch dependency** locks and PyPI pure wheels when original CDN packages were not yet mirrored. Their hashes/provenance are recorded; they do not attest original CDN wheel-byte identity. This does not change Python mathematical version1.13.3, but the distinction matters for reproducibility.

## Summaries vs raw artifacts

The report commits source harnesses, ownership/contracts, case counts, selected repeated measurements and summarized diagnostics. Keep /tmp raw logs, screenshots, decoded HTML, full parity row sets, Pyodide/npm caches and wheel binaries outside Git. Never copy an API key or credential-bearing environment dump into a reproduction.
