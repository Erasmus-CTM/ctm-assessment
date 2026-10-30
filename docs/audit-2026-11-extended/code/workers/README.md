# Reproduce the normal Python worker benchmark

Only source scripts are committed here; existing runtime files are copied to a
scratch fixture. The preparer requires the shipped standalone ctm-libs copy and
an already installed `pyodide@0.28.3` npm package. It downloads nothing.

```bash
/workspace/.cloud-setup/venv/bin/python /workspace/audit-work/code/workers/prepare-python-runtime.py \
  --standalone-repo /workspace/audit-snapshots/pyodide-interaktiv \
  --node-modules /workspace/ctm-assessment/node_modules \
  --output /workspace/audit-tests/python-runtime-portable

/workspace/.cloud-setup/venv/bin/python /workspace/audit-work/code/workers/bench.py \
  --fixture /workspace/audit-tests/python-runtime-portable \
  --report /tmp/c8c9-python-runtime-portable.json \
  --browser all --repetitions 3
```

The benchmark binds an ephemeral localhost HTTP port, so the managed executor
needs its local networking permission. Assets are served locally; no remote
browser requests are necessary. `--chromium-executable` defaults to
`/usr/bin/chromium`; Firefox/WebKit use installed Playwright browser paths.
Missing executables are recorded as `unavailable`, not downloaded. A failed
available browser produces status `failed` and process exit code 1.

The benchmark waits for core readiness with no extra packages, checks `6*7`,
presses the public Stop API during a bounded five-second asyncio sleep, checks
`6*7` on the replacement, explicitly restarts, and checks `6*7` again. Every
repetition uses a new browser context. Plain localhost serving intentionally
does not supply COI headers, so Stop replaces the worker. `fixture.json` records
copied byte sizes/hashes, Pyodide version and shipped ctm-libs pin. This does not
measure Monaco readiness, default plotting preload, CDN download, graceful COI
interrupt, or Maxima startup.

# Reproduce existing lightweight Maxima unit checks

The source repository has no `npm test` script. Its CI invokes test files
directly (`.github/workflows/milestone-three.yml:65`). Use an isolated source
archive and its exact checker dependency pin, including example files used by
the native Python bridge tests:

```bash
mkdir -p /workspace/audit-tests/normal-maxima-unit /workspace/audit-tests/maxima-pinned-checkers
git -C /workspace/stack-wasm-maxima archive 63ee8e434339f6553a7bd2a263e794769f40ad9a | tar -x -C /workspace/audit-tests/normal-maxima-unit
git -C /workspace/ctm-checkers archive c366f175aba6b62caa628bc60f57bb1167fc087b | tar -x -C /workspace/audit-tests/maxima-pinned-checkers
mkdir -p /workspace/audit-tests/normal-maxima-unit/.m2-sources/ctm-checkers
cp -a /workspace/audit-tests/maxima-pinned-checkers/examples /workspace/audit-tests/normal-maxima-unit/.m2-sources/ctm-checkers/
/workspace/.cloud-setup/venv/bin/python /workspace/audit-work/code/workers/run-maxima-lightweight.py \
  --repo /workspace/audit-tests/normal-maxima-unit \
  --checkers-extension /workspace/audit-tests/maxima-pinned-checkers/_extensions/ctm-checkers \
  --report /tmp/c8c9-maxima-lightweight-final.json \
  --logs /tmp/c8c9-maxima-lightweight-final-logs
```

The runner uses the requested checkers wheels in PYTHONPATH, disables bytecode
writes, records each exact command, exit status and stdout/stderr, and executes
seven existing JavaScript test scripts and three existing Python test modules.
The board-packaging tests also bind localhost and need local networking
permission. These mocked transport/controller and Python adapter checks do not
execute Wasm or prove Moodle PHP controller parity. Full real Maxima/Wasm
parity needs the separately staged, verified runtime artifact.

# Inspect a normal JSXGraph rendered frame

The separate `jsxgraph-diagnostic.mjs` renders one ordinary bundled point board,
loads the exact generated iframe, waits 1.5 seconds, and records the actual
frame URL/DOM/scripts and browser events. It preserves managed browser policy.
The source checkout needs its existing Quarto/Playwright test prerequisites.

```bash
source /workspace/.cloud-setup/activate.sh
NODE_PATH=/workspace/ctm-assessment/node_modules \
JXG_TEST_PLAYWRIGHT=/workspace/ctm-assessment/node_modules/playwright/index.mjs \
NODE_OPTIONS=--require=/workspace/audit-work/code/release/preload-playwright.cjs \
node /workspace/audit-work/code/workers/jsxgraph-diagnostic.mjs \
  /workspace/audit-tests/jsxgraph-git /tmp/ctm-jsxgraph-diagnostic.json
```

The local-render helper and board source remain unchanged. Output includes a
decoded source frame and screenshot under `/tmp`, not in repository artifacts.
In this managed Chromium, the data: frame navigated to a policy error page
before JSXGraph or MathJax executed; this diagnostic classifies the existing
timeouts without converting them into passes.
