# Review-set test (19 Nov 2026, repeated 20 Nov after the internal audit)

`scripts/setup-feedback-integration.py --test` was run locally with every component at its review head (the
`CTM-Review-Refs` of the umbrella branch) and a staged runtime-v3 (`--stack-native`). The builder stops at its first
failing stage, so the stages after ctm-libs' suite were run afterwards with the builder's environment.

| Component | 19 Nov | 20 Nov (after the [internal audit](audit-2026-11-20.md)) |
|---|---|---|
| ctm-checkers | `ac5fd12` | `8ece8a1` |
| ctm-libs | `bed034c` | `fbb721e` |
| math-exercise | `844f2c2` | `68dfac1` |
| py-exercise | `62661b5` | `648409c` |
| ctm-stack | `9f872e4` | `c3c32e2` |
| pyodide-interaktiv | `d7fe10a` | `f8bf0c2` |
| jsxgraph (upstream) | `5cd0d1e` | `5cd0d1e` |

| Stage | Result (20 Nov; 19 Nov the same unless noted) |
|---|---|
| Package build and example site render | passed |
| Umbrella unit tests (`unittest discover`) | 265 passed (19 Nov: 261) |
| `scripts/test-package.py` (installed archive, incl. a default-CAS Maxima card with the staged runtime) | passed |
| ctm-libs `sync-feedback-defaults.py --check`, `check-locales.py`; ctm-checkers `build.py --check` | passed |
| Umbrella `npm test` | 135 passed, 7 skipped, 0 failed |
| ctm-libs `npm test` | 487 passed of 495 (19 Nov: 482 of 490), 7 failed: the Pyodide checker tests stop with `ModuleNotFoundError: sympy` because this environment's npm Pyodide has no SymPy wheel (the same 7 fail on ctm-libs `main`) |
| math-exercise `npm test` | 208 passed, 1 skipped |
| py-exercise `npm test`; `unittest` | 50 passed; OK |
| pyodide-interaktiv `npm test` | 135 passed |
| Umbrella `npm run test:integration` | 29 passed |

Not run here: the browser tests (`--browser`) and the browser suites of the components. The environment's proxy refuses
`cdn.jsdelivr.net`, where Pyodide and KaTeX come from in online builds. CI runs them on the umbrella branch through
its review refs.
