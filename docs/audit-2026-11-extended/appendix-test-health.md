# D8 — Test-suite health and documentation drift

**Verdict:** substantial direct source, built-wheel, DOM, render and browser coverage exists. A plain `npm test` / `pytest` result is not a whole-stack assurance result: opt-in mutation and browser matrices, upstream/legacy fixture prerequisites and browser executable versions matter. The earlier claim that wheel golden replay was not an automatic PR gate is **fixed** at this snapshot (`ctm-checkers/.github/workflows/test.yml:108–115`); do not carry November H2 forward unchanged.

## Exact skip accounting

The first full source pytest run recorded by the coordinator at ctm-checkers4cff6aa, Python3.12, had **1760 passed, 3 failed, 147 skipped**. The request's148 is not a fixed suite invariant. All three failures were browser-launch infrastructure errors: Python Playwright expected `chromium_headless_shell-1248`, absent from this environment's cache. They are neither grading regressions nor silently counted as passes; the coordinator's installed-browser rerun then passed **1763 / 0 failures /147 skips in85.69s**; this confirms the three initial failures were missing-browser setup.

| Source / reason | Count | Source evidence / how to enable |
|---|---:|---|
| Mutation golden baselines |3| `tests/test_mutations.py:301`; three suite parameterizations |
| Mutation vs golden suite rows |102| `tests/test_mutations.py:307`;102 mutation/suite combinations |
| Unchanged targeted-tests baseline |1| `tests/test_mutations.py:315` |
| Targeted test mutations |27| `tests/test_mutations.py:322` |
| **Mutation subtotal** |**133**| Module skip at `tests/test_mutations.py:271`: `CTM_MUTATION_TESTS` absent **or** `CTM_CHECKERS_WHEEL` nonempty |
| Exact pinned upstream fixture checkout absent |1| `tests/stack/test_fixture_import.py:86` |
| STACK security-map checkout absent |1| `tests/stack/test_input_text.py:170`; set `STACK_UPSTREAM` |
| Three-browser admission explicitly disabled |3| `tests/stack/test_shared_admission.py:174`; `CTM_ADMISSION_BROWSER=all` |
| Legacy authored source absent |6| `tests/test_authored.py:109`; `CTM_LEGACY_MATH_EXERCISE` |
| Exact umbrella authored recorder absent |2| `tests/test_golden_tables.py:127,146`; pinned `_ci/ctm-assessment` recorder |
| Legacy STACK source absent |1| `tests/test_golden_tables.py:255`; `CTM_LEGACY_STACK_SYMPY` |
| **Prerequisite subtotal / total** |**14 / 147**| Observed output, not an estimate |

`pytest --collect-only -q -p no:cacheprovider tests/test_mutations.py` independently collected133 cases. Setting `CTM_MUTATION_TESTS=1` alone while testing installed wheels still skips them deliberately: these tests mutate copies of `src/`, not the installed wheel. Their subprocesses compare changed results against goldens or require targeted tests to fail; they are not133 unimplemented assertions. Standard PR/main runs test source and wheels and replay wheel goldens; expensive mutation/legacy replay runs on nightly schedule or explicit dispatch with the exact confirmation string `broad testing campaign` (`test.yml:38,46,110–115`). Manual opt-in is thus not the only way they run.

The small `code/architecture/summarize-skips.py` extracts reason/count groups from coordinator pytest logs into summarized JSON. Keep raw logs out of the report repository. If fixture paths or browser availability change, the skip count changes; report each invocation rather than combining disjoint configurations into a misleading green total.

## Browser-only code and network dependency

| Surface | Actual tests present | Limits |
|---|---|---|
| `math-similar.js` | `math-exercise/tests/browser/similar-problems.spec.mjs` has40 top-level `test(...)` declarations, mock provider, render profiles, recipe/custom/givens/restore/report tests | It runs under `test:browser`, **not** `npm test`. Pyodide and Python wheels must be materialized; many stubs do not substitute for CPython/Pyodide semantic parity. No statement/branch coverage percentage measured |
| `feedback-dom.js` and `ai-feedback.js` | ctm-libs `tests/dom.test.cjs:35` hostile Markdown;89 typesetting;98 stale responses;118 credentials;251 diagram request;293 missing/oversized context;310 local KaTeX | JSDOM tests exercise logic with mocks; real layout/fonts/CSP/worker/CORS require browsers. D5/provider sections provide that evidence |
| `ctm-store.js` | ctm-libs `tests/store-core.test.cjs:276` durable quota recovery; dedicated browser store scripts in browser workflow; math `tests/store.test.mjs:1` adapter tests with store boundary mocked | Mock adapter coverage intentionally does not duplicate shared revision matching; browser storage denial/quota/channel/session races need dedicated runs |
| Quarto rendering | ctm-libs bootstrap/context/settings tests and math render tests; source-panel/author-import tests | Tests may skip when Quarto absent. `ctm-libs/tests/prepare-quarto.cjs:1` serializes first-use cache/theme warmup before parallel renders to avoid Deno/Sass cache locks |

ctm-libs `tests/browser/runtime-smoke.mjs:3` explicitly requires network; `sympy-parity.mjs:66,77` embeds CDN Pyodide for the old runtime comparison. The similar-problems browser fixture routes CDN requests to local npm/cached files (`similar-problems.spec.mjs:43,60`), so local prefetching can make it self-contained. Merely allowing a browser request to proceed against a blocked CDN produces environmental timeouts, not a successful offline test. CI browser workflow installation and local executable revisions must match the Playwright package. A single completed run establishes no general flakiness rate; no flakiness or historical Python3.9 CI failure is asserted from old reports/CI badges.

## Node/Python homes and Python3.9

Build tools have no single source comparable to the browser asset lock. ctm-libs ordinary/browser tests select Node24 and Python3.12 (`.github/workflows/test.yml:20,24`, `browser.yml:36`), while P13 tests choose Node22 (`p13.yml:19`). ctm-checkers main tests use Node24/Python3.12 by default; only authorized broad campaigns use3.9–3.13 (`test.yml:38,82`). Several focused variants/question workflows still explicitly matrix3.9/3.12/3.13. This is an explicit compatibility matrix, not proof of a version conflict; `validate_version_homes` does not enforce it.

ctm-checkers advertises Python>=3.9 (`pyproject.toml:11`). Its CI dependencies already account for the NetworkX compatibility boundary:3.4.2 on Python>=3.10,3.2.1 below3.10 (`ci/requirements.txt:5–6`). SymPy1.13.3, mpmath1.3.0, pytest8.4.2 and PyYAML6.0.3 are pinned. This session runs3.12; Python3.9 execution and old runner-install failure reports remain **unverified** here. Reproduce them on an actual3.9 interpreter and separate setup/download failures from import/runtime failures before reopening an old environmental finding.

## Documentation drift catalogue

| ID / status | Exact source contradiction or resolved lead | Impact / proposed action |
|---|---|---|
| D8-1 low, verified source contradiction | py-exercise `docs/reference.md:304–306` describes standalone Python on the page thread and endless loops requiring reload. Current `py-exercise.lua:15,194` requires the shared page worker. Cancellation is scoped: ctm-libs `pyodide-runtime.js:533` prevents stopped transactions from entering a replacement; py-exercise `py-exercise.js:681–689` nevertheless retries once after an external interpreter replacement if the Stop epoch is unchanged | Rewrite the definitely stale standalone-thread guidance and explain the conditional external-replacement retry. A changed Stop epoch cancels the check; blanket claims that all restarts replay or that no top-level check ever retries are inaccurate. Browser behavior evidence belongs in C8; no application code/P13 lock change needed |
| D8-2 low, verified documentation omission | math `docs/reference.md:131,454` documents `tests` only as Python assertions / legacy `test(check,symbols)`; `ctm-checkers/tests/test_question_tests.py:101,159,198` and `authored.py:147` implement declarative answer/expect/score tests across modes | Authors cannot discover current safer declarative coverage; document syntax and named fields with executable rendered examples. Preserve supported legacy API |
| B1/B3 retained | ctm-libs `docs/api.md:49` says Lua API2 instead of actual3; feedback nn widget uses nb despite nn catalogue | Already in Part B; do not duplicate in final register |
| Retained py save omission | py-exercise reference cell/global option tables (`docs/reference.md:40,65`) omit shared save controls that `py-exercise.lua` and0.5.0 changelog implement | Add `save` and per-cell behavior to reference; no grading/runtime change |
| Prior L13 partially fixed | assessment `docs/reference.md:26–38` **now lists** save, progress, export, storage-key, assets and variants approval; the old audit's blanket claim that umbrella docs omit them is stale | Do not re-report that fixed portion; ctm-libs own abbreviated settings table and component docs may still lag |
| Current similar/givens docs present | math `docs/reference.md:133–134` lists `givens` and `similar-data`; tests and implementation exist | No undocumented-option finding for these recently added options |
| Locale parity checked | All keys/type/argument parity pass in every supported language; languages differ by catalogue (Part B table) | No missing-key claim. Exact en/nb/nn/de/es coverage across **all** components is not implemented; evaluate fallback/product policy separately |

The option/reference comparison above is a concrete sample, not proof that every documented example renders or every implementation option is documented. Existing math `tests/documentation.test.mjs:11,21,29` checks selected heading/link/math-fence structure, not semantic correspondence for the entire options table. The C1/consumer render runs are stronger evidence for exercised examples; untouched examples remain unverified.

## Recommended work

Quick: update shared-worker Stop and conditional-retry guidance and API/language references; document declarative tests and shared save; report skip reason groups in CI summaries and pin browser/runtime installations together. Medium: split required local unit/render gates from explicit network/browser prerequisite jobs with a machine-readable capability manifest; run40 similar-problem browser cases with a repeatable local Pyodide/SymPy fixture. Structural: derive toolchain compatibility policies and source-pin/copy checks from a release manifest, retaining the cheap automatic source/wheel/golden gates already fixed. Documentation/tests-only changes need not change selected application bytes. Repinning any changed ctm-libs or IDE commit still changes its exact application_ref and requires a matching reviewed P13 lock/receipt, even when all eight selected file bytes remain identical.
