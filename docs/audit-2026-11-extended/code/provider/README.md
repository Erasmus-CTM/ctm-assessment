# Provider and browser harnesses

- `provider-matrix.cjs /path/to/ctm-libs [--real-cuts]`: actual loopback mock JSON/SSE provider; no provider keys. Real-cuts adds parallel30/60/100-second disconnects. The heartbeat experiment changes only the configured inactivity timer65,001ms to50ms; it preserves the production parser and real HTTP reads.
- `browser-provider.py /path/to/ctm-libs`: Python Playwright/system Chromium; separate loopback origins reproduce CORS-less504; same-origin different paths reproduce shared config; dummy-key copy-prompt exclusion and hint1 mock full-solution rendering/no grading events.
- `math-browser-preload.cjs`: audit-only Playwright CDN route mirror adapted from the release harness, with mathjax@4 and font@4 aliases to4.1.3. Mirrors exact npm0.16.47 KaTeX,3.2.2/4.1.3 MathJax,1.14.2 JSXGraph, and original0.28.3 Pyodide wheels. No TLS bypass.
- `math-playwright.config.mjs`: isolated-copy configuration override, system Chromium, JSON output and blocked service workers because Playwright cannot intercept COI service-worker fetches. Own test assertion sources are untouched. This configuration verifies page/board/grading interaction; it does not supply service-worker/COI lifecycle evidence.

For the math suite, first prepare exact mirrors with `../release/prepare-browser-assets.py` and `../release/prepare-canonical-pyodide.py`; render the pinned math example site and run its own `tests/build-similar-profiles.py` in an isolated copy with the pinned ctm-libs/checkers/JSXGraph extensions and native-authoring installed. Copy canonical sympy/mpmath wheels into that copy's `test-results/similar-runtime` so its own route fixture need not download them. Preserve the npm Pyodide lock for this canonical rerun. Set CTM_CHECKERS_SOURCE to the checkers **src directory**, not repository root.

```sh
export CTM_MATH_ROOT=/path/to/isolated/math-exercise
export CTM_LIBS_EXTENSION=/path/to/ctm-libs/_extensions/ctm-libs
export CTM_CHECKERS_SOURCE=/path/to/ctm-checkers/src
export NODE_OPTIONS=--require=/absolute/path/to/math-browser-preload.cjs
export PYODIDE_PACKAGES=/path/to/canonical-pyodide-packages
export CTM_AUDIT_NPM_ASSETS=/path/to/npm-mirror
export CTM_AUDIT_PYODIDE_CORE=/path/to/npm-pyodide-0.28.3
node "$CTM_MATH_ROOT/node_modules/playwright/cli.js" test --config=/absolute/path/to/math-playwright.config.mjs
```

The initial similar-problems53-case run used locally cached PyPI SymPy1.13.3/mpmath1.3.0 wheels with their hashes patched only in the private scratch npm lock; results identify this substitution. Subsequent example/graphical runs use canonical mirror packages and original lock. Initial direct-CDN failures are environmental and reported separately from mirrored results. Raw browser logs and traces remain outside the report repository.
