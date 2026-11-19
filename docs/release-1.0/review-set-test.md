# Review-set test (19 Nov 2026)

`scripts/setup-feedback-integration.py --test` was run locally with every component at its review head (the
`CTM-Review-Refs` of the umbrella branch) and a staged runtime-v3 (`--stack-native`). The builder stops at its first
failing stage, so the stages after ctm-libs' suite were run afterwards with the builder's environment.

| Component | Commit |
|---|---|
| ctm-checkers | `ac5fd12` |
| ctm-libs | `bed034c` |
| math-exercise | `844f2c2` |
| py-exercise | `62661b5` |
| ctm-stack | `9f872e4` |
| pyodide-interaktiv | `d7fe10a` |
| jsxgraph (upstream) | `5cd0d1e` |

| Stage | Result |
|---|---|
| Package build and example site render | passed |
| Umbrella unit tests (`unittest discover`) | 261 passed |
| `scripts/test-package.py` (installed archive, incl. a default-CAS Maxima card with the staged runtime) | passed |
| ctm-libs `sync-feedback-defaults.py --check`, `check-locales.py`; ctm-checkers `build.py --check` | passed |
| Umbrella `npm test` | 135 passed, 7 skipped, 0 failed |
| ctm-libs `npm test` | 482 passed, 7 failed: the Pyodide checker tests stop with `ModuleNotFoundError: sympy` because this environment's npm Pyodide has no SymPy wheel (the same 7 fail on ctm-libs `main`) |
| math-exercise `npm test` | 208 passed, 1 skipped |
| py-exercise `npm test`; `unittest` | 50 passed; OK |
| pyodide-interaktiv `npm test` | 135 passed |
| Umbrella `npm run test:integration` | 29 passed |

Not run here: the browser tests (`--browser`) and the browser suites of the components. The environment's proxy refuses
`cdn.jsdelivr.net`, where Pyodide and KaTeX come from in online builds. CI runs them on the umbrella branch through
its review refs.
