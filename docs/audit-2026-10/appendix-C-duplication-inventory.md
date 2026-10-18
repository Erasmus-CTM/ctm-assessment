# Duplication inventory: CTM Quarto extensions

Input for the consolidation plan. This is a read-only audit: no repository was modified.

Rule being enforced: **no code exists in more than one place across the repos.** Vendored copies kept in sync by commit or sha256 still count as duplication. Generic code buried in one extension that others could reuse is listed too.

## 0. Baseline and method

All line numbers refer to the **committed HEAD** of each repo, listed below. Other agents were working in these clones during the audit, and some repos moved to branch `audit/2026-10` part-way through. The scripts read `git cat-file HEAD:<path>`, not the working tree.

| Repo | Branch at report time | HEAD | Date | Notes |
|---|---|---|---|---|
| ctm-assessment | audit/2026-10 | 12179c2 | 2026-10-16 | umbrella |
| ai-feedback | audit/2026-10 | ea0c8ab (0.8.1) | 2026-10-18 | moved from 68abb6d during the audit. The diff touches only feedback-dom.js warning text, policy/settings code and docs. No finding changes |
| math-exercise | audit/2026-10 | 5945f8f | 2026-10-17 | **uncommitted** edit to `math-exercise.lua` by another agent (+108 lines). It adds a further copy of the `_extensions` discovery walk (see D3) |
| py-exercise | audit/2026-10 | 84c6647 | 2026-10-16 | |
| pyodide-interaktiv | audit/2026-10 (= feature/shared-feedback-integration) | 108a8dc | 2026-10-16 | same commit as the umbrella pin in `integration/feedback/repos.json` |
| upstream/jsxgraph-quarto | main | 59d549c | 2026-10-01 | not ours. It is the canonical home of `graph-editor.js` and the assessment bridge |
| ctm-demo | main | d359890 | 2026-10-16 | consumes only the umbrella (`quarto-extensions.yml`) |
| erasmus-ctm/stack-sympy | main | f450bcd | 2026-10-18 | **exempt**, reported for impact only. The shallow clone has 1 commit, so it has no history |

(At the time of this inventory the local jsxgraph-quarto checkout was an older fork, aacchhee/jsxgraph-quarto at d94570d from 2026-03-04. It was not in scope and is not analysed.)

Scripts (in `code/dup/` of the audit's working folder):

| File | What it does |
|---|---|
| `hash_inventory.py` → `hash_inventory.out` | sha256 of every tracked file at HEAD, plus a hash of comment- and whitespace-stripped text (JS/CSS/Lua/Py/YAML/HTML) |
| `similarity.py --intra` → `similarity.out` | file-level: 5-token-shingle containment prefilter, then `difflib` ratio over normalised lines. Unit-level: JS functions (brace matched), Lua functions, Python defs (ast), CSS rules and 15-line windows, workflow steps. Pairs are compared with 4-shingle Jaccard and then confirmed with `difflib` |
| `filter_units.py` → `similarity.filtered.out` | drops unit pairs whose files are already byte-identical, and the jsxgraph leftover |
| `doc_similarity.py` → `doc_similarity.out` | same-named docs/README across repos |
| `qmd_similarity.py` → `qmd_similarity.out` | example `.qmd` content copied across repos |
| `check_math_delims.lua` / `check_math_delims.mjs` | reproduces the Lua/JS divergence in finding D2 |
| `sizes.txt` | line counts of the code files |

Similarity % below is the `difflib.SequenceMatcher` ratio on normalised lines (×100) unless marked J (Jaccard) or C (containment).

---

## 1. Top 10 by risk (diverged copies first)

| # | What | Copies | State | Risk |
|---|---|---|---|---|
| 1 | **Pyodide bootstrap and script loader** (`ensurePyodide` / `loadScript`, the `__qExercisePyodide` protocol) | math-exercise `shared/pyodide-runtime.js` (canonical, PR #12, 2026-10-15); stack-sympy `vendor/pyodide-runtime.js` (byte copy); **py-exercise `py-exercise.js:103-141` (stale fork)**; **math-exercise `math-exercise.js:186-206` (dead stale loadScript)** | **Diverged.** The retry fixes exist only in the shared runtime: a rejected init is cleared, a failed `<script>` is removed, `once:` listeners are used, `let`-declared globals are read, and worker `importScripts` is supported. py-exercise still has the 2026-03 logic. After one transient CDN failure, py-exercise awaits a permanently rejected promise until the page is reloaded | High |
| 2 | **math-exercise task rendering exists twice: Lua (first draw) and JS (pool redraw and variants)** | `math-exercise.lua:266-545` vs `math-exercise.js:696-923` and `matrix-input.js:25-75` | **Diverged, with a bug fixed only in JS.** `normalizeTaskMathDelimiters` in JS skips escaped `\$`. The Lua version (`:479-482`) does not: `Price \$5 or \$7` becomes `Price \\(5 or \\)7` (reproduced by `check_math_delims.*`). Dynamic-matrix cells rendered by Lua have no `aria-label`. JS adds one, in a third wording that differs from `L.dynamicMatCell` | High |
| 3 | **`_filters/example-source.lua`** ("Show Quarto source" panels) | 5 copies in 3 generations: ai-feedback, py-exercise and pyodide-interaktiv (58 L, identical, 2026-09-26); math-exercise (104 L, 2026-10-16); ctm-assessment (139 L, 2026-10-16) | **Diverged.** Only math-exercise has the "Author tests" panel. Only ctm-assessment has `example-source-group` and the JSXGraph split. The old three lack the default-policy panel and separate panels. Summary strings differ in all three generations. All copies emit a fixed ```` ``` ```` fence. stack-sympy's `authoredSource` (`stack-sympy.lua:32-49`) is the only code that lengthens the fence when the body contains backticks | High |
| 4 | **Shared-feedback locator and version gating** (`feedback-loader.lua` plus the JS version checks) | Lua: 3 identical copies (math, py, pyodide; 31 L) + stack-sympy (38 L, 65%). JS gates: `math-exercise.js:1685-1691`, `qpyodide-feedback.js:18-23`, `py-exercise-feedback.js:6-14`, `stack-sympy.js:369-378` | **Diverged.** The Lua gates require "0.6.0 (`shared.selection`)" in 3 copies, and stack-sympy parses `_extension.yml` and requires 0.8 plus the API surface. The JS gates require ≥0.5 (math, pyodide), "has `contextMaterials`" (py) and ≥0.8 plus the API surface (stack). Every consumer encodes its own idea of the minimum ai-feedback version | High |
| 5 | **Monaco loading and editor setup** | py-exercise `ensureMonaco` `:145-154` and `monaco.editor.create` `:434-481`; pyodide-interaktiv `qpyodide-monaco-editor-init.html:1-10`, `qpyodide.lua:635`, `qpyodide-cell-classes.js:20-36,606-640`. Version `0.46.0` is in 4 places | **Diverged.** The CRLF→LF EOL fix (coatless#94) and the dark-theme sync exist only in pyodide-interaktiv. py-exercise passes `theme: 'vs-light'`, which is not a built-in Monaco theme name | Med-High |
| 6 | **iframe assessment-bridge client** (`jsxgraph-quarto-assessment` v1) | `math-exercise.js:1014-1096` (`requestExternalResponse`, layout notify) vs `ai-feedback feedback-dom.js:387-427` (`collectVisualContexts`). The server side is upstream `jsxgraph.lua:558-674`. A third ad-hoc protocol, `ctm-stack-figure`, is in ctm-demo `assets/stack/page.js` | **Diverged.** Request ids, the 5 s timeout and the 1 MB limit are re-implemented in each copy. Only math-exercise has a `settled` guard. Only ai-feedback requires `ai.image`. The size limits differ ("1 MB" vs "1 MiB" wording; both 1024²) | Medium |
| 7 | **UI language resolution and the `no`/`nb` alias** | `resolveLang` in `math-exercise.lua:747-768`, `py-exercise.lua:196-216` (91%) and `qpyodide.lua:324-344` (74-76%); JS `ai-feedback.js:13`, `qpyodide-feedback.js:8-9`, `stack-sympy.js:357-358`, `qpyodide-locales.js:882`; the Lua `meta` handler in every example-source.lua | **Diverged.** The supported sets differ: math {en,de,nb}, py {en,de}, pyodide {en,de,sv,no,nb,da}, ai-feedback {en,de,nb,es}, example-source {en,nb,de}. py-exercise has no `nb`, so on Norwegian pages (ctm-demo is `nb`) the py-exercise UI falls back to English while the Feedback UI is Norwegian | Medium |
| 8 | **Math typesetting loaders** (KaTeX and MathJax) | KaTeX ESM: `feedback-dom.js:189-207` and `math-exercise.js:217-254`. MathJax: `stack-sympy.js:59-141` (3.2.2), ctm-demo `page.js:3-17` (queue), upstream `jsxgraph.lua:732-734` (`mathjax@4`, unpinned) | **Diverged.** ai-feedback de-duplicates the stylesheet and clears a failed promise. math-exercise appends the stylesheet without checking and does not memoise the in-flight import. Three MathJax majors or pins are in use (3.2.2, 4.x unpinned, devDeps `mathjax-full@3.2.2` and `@mathjax/src@4.1.3`). Two separate "MathJax is not reentrant" queues exist | Medium |
| 9 | **matrix-input editor** (JS + CSS) | math-exercise `matrix-input.js` (230 L) and `.css` (181 L), canonical (f238da6, 2026-10-17); stack-sympy `vendor/` (byte copies, provenance pinned to f238da6). Also `math-exercise.js:939-955` `dynamicSpecFromElement` is 100% identical to `matrix-input.js:77-93`, a left-over copy after the extraction | In sync now, but a sha-pinned vendored copy plus a stale in-file duplicate. When both extensions are on one page, the script and CSS load twice and the second load overwrites `window.MatrixInput` | Medium |
| 10 | **`.github/review-dependencies.py` and the CI step blocks** | 5 byte-identical copies (ctm-assessment, math-exercise, py-exercise, pyodide-interaktiv, ctm-demo; 25 L, all last touched 2026-10-16). The "Select explicit review dependencies" step (5 L) is 100% identical in 12 workflow files. "Fetch shared feedback dependency" is in 4 | Identical. The `allowed` set is hard-coded (`{'ai-feedback','math-exercise','py-exercise','pyodide-interaktiv','ctm-assessment'}`), so adding a repo (stack-sympy, ctm-demo) means 5 edits | Medium (maintenance) |

Next in line: the Python checker library embedded as a JS string array (§4.1), stale rendered HTML snapshots in py-exercise (§5), the feedback-adapter boilerplate (§3.10), and the test-harness loaders of the ai-feedback runtime (§3.14).

---

## 2. Byte-identical and normalised-identical files

### 2.1 Byte-identical across repos (sha256)

| sha256 (12) | Lines | Locations | Canonical (evidence) | Proposed single home |
|---|---|---|---|---|
| 4c1ee07ea7db | 743 | math-exercise:`_extensions/jsxgraph/lua/jsxgraph.lua` = upstream:`_extensions/jsxgraph/lua/jsxgraph.lua` | upstream (log shows the bridge and graph editor landed 2026-08-29 to 09-02, then synced upstream) | upstream jsxgraph-quarto. **The math-exercise copy is being removed.** Note: `ctm-assessment/scripts/setup-feedback-integration.py:150-151` copies jsxgraph **from math-exercise** into the umbrella, and `math-exercise/tests/graph-construction.test.mjs:13-14` reads it. Both must switch to upstream first |
| dff9b175a5f3 | 230 | math-exercise:`_extensions/math-exercise/matrix-input.js` = stack-sympy:`_extensions/stack-sympy/vendor/matrix-input.js` | math-exercise f238da6 (2026-10-17); `vendor/matrix-input-provenance.json` | new shared package (see §7: `ctm-math-input`) |
| c993df3dad24 | 181 | `matrix-input.css`, same pair | same | same |
| c21bbd3e4890 | 94 | math-exercise:`_extensions/math-exercise/shared/pyodide-runtime.js` = stack-sympy:`vendor/pyodide-runtime.js` | math-exercise 6eddf89 (2026-10-15, PR #12); `vendor/provenance.json`. Provenance says **AGPL-3.0-only**; every other header says **-or-later** | new `ctm-runtime` (§7) |
| c37659469c88 | 58 | ai-feedback, py-exercise, pyodide-interaktiv:`_filters/example-source.lua` | none of these. They are the oldest generation (2026-09-26) | one copy in a docs-tooling extension (§7: `ctm-docs`) |
| 56e859288e9d | 31 | math-exercise, py-exercise, pyodide-interaktiv:`_extensions/<ext>/feedback-loader.lua` | all three were added 2026-09-26 in the same "Load the shared feedback extension" commits | ai-feedback (§3.4). Also note: the umbrella distribution ships all 3 copies |
| ac366d609cae | 25 | ctm-assessment, math-exercise, py-exercise, pyodide-interaktiv, ctm-demo:`.github/review-dependencies.py` | identical, all touched 2026-10-16 | `ctm-ci` reusable action (§7) |
| 8486a10c4393 | 661 | `LICENSE` (AGPL-3.0 text) in ctm-assessment, ai-feedback, math-exercise, py-exercise, pyodide-interaktiv, stack-sympy | n/a | **keep per repo.** Licence text is legally required per distribution and is not code |
| c6305e702432 | 14 | `docs/acknowledgements.md`: ctm-assessment = ai-feedback | n/a | docs (low) |
| fa279973f50f | 12 | `docs/acknowledgements.md`: math-exercise = py-exercise | n/a | docs (low) |
| 7da9f0a73c6f | 9 | `docs/README.md`: math-exercise = py-exercise = pyodide-interaktiv | n/a | docs (low) |

### 2.2 Identical modulo whitespace or comments

| Lines | Locations | Difference |
|---|---|---|
| 399/400 | math-exercise:`_extensions/jsxgraph/graph-editor.js` vs upstream:`_extensions/jsxgraph/graph-editor.js` | trailing newline only. **Being removed** with the jsxgraph leftover |
| 10/9 | math-exercise:`_extensions/jsxgraph/LICENSE` vs upstream:`LICENSE` | whitespace. Being removed |
| 7/7 | `_extensions/jsxgraph/_extension.yml` (71%) | title "JSXGraph with assessment bridge" and author. Being removed |

The math-exercise jsxgraph leftover has no `resources/` (no `jsxgraphcore.js` or `jsxgraph.css`). Its `jsxgraph.lua:144` embed path therefore cannot work standalone. This is one more reason to drop it.

---

## 3. Near-duplicates and parallel implementations, by concern

Each row gives the location (repo:path:lines), size, relationship, canonical copy, divergence, and proposed home.

### 3.1 Pyodide loading and the shared-instance protocol (globals `mainPyodide`, `qpyodideInstance`, `qpyodideReady`, `__qExercisePyodide`, `MathExerciseRuntime`)

| Location | Lines | Relationship | Notes |
|---|---|---|---|
| math-exercise:`_extensions/math-exercise/shared/pyodide-runtime.js:1-94` | 94 | **canonical** | Reads `qpyodideInstance` → `mainPyodide` → own load. Retryable. Works in workers. Exports `MathExerciseRuntime.{indexURL,loadScript,ensurePyodide}` |
| stack-sympy:`_extensions/stack-sympy/vendor/pyodide-runtime.js` | 94 | identical (vendored) | Used in the grading worker (`worker.js:4`) and the parity harness (`scripts/native_compliance/pyodide_worker.js:4`) |
| py-exercise:`_extensions/py-exercise/py-exercise.js:103-141` | 39 | **parallel fork, diverged** (`loadScript` 100% identical to math-exercise's dead copy) | Missing all PR #12 fixes (§1 #1). Comments still in German. Pyodide version hard-coded at `:133` |
| math-exercise:`_extensions/math-exercise/math-exercise.js:186-206` | 21 | identical to py-exercise `loadScript` (100%) | **Dead code.** Defined and never called (`ensurePyodide` delegates to the runtime at `:209-211`) |
| pyodide-interaktiv:`qpyodide-document-engine-initialization.js:400-572` | 173 | producer side of the protocol (worker plus RPC proxy) | Defines `qpyodideReady` / `qpyodideInstance` / `mainPyodide` (a worker proxy: `globals.set`, `runPythonAsync`, `loadPackage`, and `toPy` = identity). The protocol is documented only in the comment at `:15-21`. The consumers depend on that proxy's subset of the API |
| pyodide-interaktiv:`qpyodide-canvas-plots.js:488-525` | 38 | second (main-thread) Pyodide instance via `import(indexURL+'pyodide.mjs')` | by design, for plots |
| stack-sympy:`worker.js:1-52` + `stack-sympy.js:12-57`; `scripts/native_compliance/pyodide_worker.js:1-65` | 52+46+65 | parallel worker-RPC implementation (the 2nd and 3rd worker bootstraps, mounting `STACK_SYMPY_SOURCES` into the FS ~ twice, 70% similar by inspection) | by design (timeout kill), but the worker/RPC machinery is parallel to pyodide-interaktiv's |
| Pyodide version `0.27.2` | — | the same constant in 6 places | `pyodide-runtime.js:8` (×2 copies), `py-exercise.js:133`, `qpyodide.lua:45`, stack `scripts/run_compliance_pyodide.py:27` |

**Proposed home.** Create a new `ctm-runtime` Quarto extension, a tiny classic script that owns the protocol: one `ensurePyodide`, `loadScript`, the Pyodide version constant, and the documented contract with pyodide-interaktiv. py-exercise and math-exercise then drop their copies, and stack-sympy installs it instead of vendoring. pyodide-interaktiv keeps its worker but publishes `qpyodideInstance` through the same documented contract. Alternative: host the runtime inside ai-feedback. Not recommended, because Pyodide is not a feedback concern.

### 3.2 Script loader helpers
`loadScript` is defined 3 times: runtime `:10-53` (canonical), py-exercise `:103-120`, and math-exercise `:186-206` (dead). py-exercise's `ensureMonaco` uses its own copy. stack-sympy `ensureMathJax` and ctm-demo `page.js` do ad-hoc `<script>` injection and polling. **Home:** `ctm-runtime.loadScript`.

### 3.3 Monaco loading and editor configuration
See §1 #5. Locations: py-exercise `py-exercise.js:145-154` (AMD loader plus `require.config`) and `:434-481` (create options, height autosize, Shift+Enter, autosave). pyodide-interaktiv `qpyodide-monaco-editor-init.html:1-10`, `qpyodide.lua:635` (CSS link) and `:676`, `qpyodide-cell-classes.js:20-36` (theme) and `:606-640` (create plus EOL fix). The editor option blocks are ~70% the same set (`automaticLayout`, `scrollBeyondLastLine`, `minimap`, `renderLineHighlight`, `hideCursorInOverviewRuler`). The 17-line JS units fall below the matcher's unit threshold, so this comes from manual comparison. **Home:** `ctm-runtime.ensureMonaco()` plus `createPythonEditor(el, opts)`. Fold in the EOL and theme fixes from pyodide-interaktiv. That code is coatless-derived, so keep its attribution.

### 3.4 Shared-feedback locator and version gating
See §1 #4. Note that `_filters/example-source.lua` (math-exercise `:33-50` and ctm-assessment `:43-60`, which are 100% identical to each other) runs **a third copy of the same `_extensions/*/ai-feedback` discovery walk** to find `feedback-defaults.yml`. The uncommitted math-exercise work adds `jsxgraphInstalled()`, a fourth copy of the walk. **Home:** ai-feedback should export one `locate(name, file)` and one `require(minVersion)` (Lua), plus `AIFeedback.requireVersion('0.8')` (JS). Keep only a ≤5-line bootstrap in each consumer. The umbrella manifest already uses fixed relative paths (`../ai-feedback/…`), which is an alternative.

### 3.5 Matrix and vector input UIs
| Location | Lines | Relationship |
|---|---|---|
| math-exercise `matrix-input.js:1-230` / `.css:1-181` | 411 | canonical (extracted 2026-10-17) |
| stack-sympy `vendor/matrix-input.{js,css}` | 411 | identical (vendored, provenance f238da6) |
| math-exercise `math-exercise.js:939-955` `dynamicSpecFromElement` | 17 | 100% identical to `matrix-input.js:77-93`; left over after the extraction |
| math-exercise `math-exercise.lua:374-425` (`dynamicMatrixCellHtml`, `buildDynamicMatrix`) | 52 | parallel Lua port of `matrix-input.js:25-75` (`renderHTML`). **Diverged:** no `aria-label` |
| math-exercise `math-exercise.lua:292-311,427-469` vs `math-exercise.js:709-766` (`scalarFieldHtml`, `matrixCellHtml`, `buildVector`, `buildMatrix`) | ~60 + ~60 | parallel Lua/JS implementations, equivalent today |
| math-exercise `math-exercise.lua:315-372` vs `math-exercise.js:768-812` (`parseDynamicMatrixSpec`, `MAX_DYNAMIC_DIMENSION=12`) | 58 + 45 | parallel, equivalent today. matrix-input's own validator allows up to 20 |
| ctm-demo `styles.css` | 17 | overrides `.math-input*` / `.math-mat-cell` |

**Home.** Move the matrix editor into its own package (`ctm-math-input`, or the `ctm-runtime` UI module). Remove the Lua renderer: emit a placeholder `<span data-matrix-spec=…>` from Lua and let `MatrixInput.renderHTML` build it client-side. Alternatively, keep a single Lua port with a shared conformance fixture.

### 3.6 Answer parsing, normalisation and checker-result contracts
| Location | Lines | Relationship |
|---|---|---|
| math-exercise `math-exercise.js:302-646` (Python embedded as a JS string array: `_split_top`, `_sigfigs_round`, `_parse_tol`, `_canon_form`, `_num_equal`, `_build_locals`, `graph_from_response`, `assess_basis`, `_math_check`, `_normalize_custom_result`, `_math_check_custom`) | ~345 | canonical for math-exercise. `question-tests.py:14-26` decodes it by regex, so CPython tests share it (good). But it is invisible to linters and coverage, and copying it into other repos is hard |
| stack-sympy `stack_sympy/basis_helper.py:1-90` | 90 | **vendored copy of `assess_basis`** (byte-equal function body, hash-checked by `tests/test_python_basis.py:242-246`, provenance at math-exercise 5945f8f). In sync |
| `splitTop` ×3 | — | Lua `math-exercise.lua:266-285`, JS `math-exercise.js:696-707`, Python `_split_top` (embedded). Parallel, equivalent |
| stack-sympy `checkers.py:147-174` `_result` vs math-exercise `_normalize_custom_result` (embedded) | 28 / 26 | parallel checker-result contracts. They are not compatible: math uses score/correct/feedback/assessment `{name:{axis:[…]}}`, stack uses valid/correct/feedback/assessment `{axis:[…]}`. The colour-status vocabularies overlap (`correct` / `incorrect` / `dependent`) |
| stack-sympy `expressions.py` (938 L) vs math-exercise `parse_expr` + `implicit_multiplication_application` | — | parallel parsers (STACK semantics vs SymPy parse). Intentionally different. Flag only |
| py-exercise `py-exercise.js:180-300` (`CHECKER_PY`, `RUNNER_PY`, `ENCODER_PY` as JS string arrays) | ~120 | same "Python-in-JS-strings" pattern as math-exercise. `tests/test_greeting_example.py` re-implements the runner with plain `exec` instead of decoding it |

**Home.** Create a Python package `ctm_checkers` (proposed name) in a real `.py` source tree, bundled into JS by a generator like stack-sympy's `bundle_runtime.py`. It would contain `assess_basis`, `graph_from_response`, the result normaliser, and a single assessment-status vocabulary. math-exercise and stack-sympy import it, and question-tests imports it directly.

### 3.7 Source and example panels ("Show Quarto source"), example-source filters
| Location | Lines | Sim. to ai-feedback copy |
|---|---|---|
| ai-feedback, py-exercise, pyodide-interaktiv `_filters/example-source.lua` | 58 | 100% |
| math-exercise `_filters/example-source.lua` | 104 | 60% (C 92%) |
| ctm-assessment `_filters/example-source.lua` | 139 | 44% (C 84%); 64% vs math-exercise |
| stack-sympy `stack-sympy.lua:32-54` (`authoredSource`, `sourcePanel`) and `:175-180` | 30 | parallel. English-only "Show source". It has the fence-length fix |
| math-exercise `example-site.css:1-35` (`.math-example-source`) | 35 | the only stylesheet for the panels. The other 4 repos render them unstyled |
| ai-feedback `feedback-dom.js:253` and `feedback-quarto.lua:29` | — | hard-code `.example-author-notes` |

Unit-level matches: `policySummaryTarget` and `defaultPolicySource` are 100% identical between math-exercise and ctm-assessment. `code()` is 91% (ctm vs old), 76% (math vs old) and 74% (ctm vs math). `meta()` is 75-82%. Canonical: the **ctm-assessment and math-exercise copies were both changed on 2026-10-16 and each has a feature the other lacks** (math: author-tests panel; ctm: source groups and diagram split). Merge both into one copy. **Home:** a `ctm-docs` extension (example-site tooling: this filter and its CSS) that each repo's example site installs. Keep it out of the runtime extensions.

### 3.8 Locale and i18n tables
| Location | Languages | Content |
|---|---|---|
| ai-feedback `ai-feedback.js:7-12` | en, de, nb, es | feedback UI (button, settings, …) |
| math-exercise `math-exercise.js:4-146`; `math-exercise.lua:119-156` (`supportedLangs`, `langAliases`, `uiText`) | en, de, nb | domain UI, the error messages, matrix labels, "Feedback" and "Reconfigure AI" labels (`uiText.feedback`, `reconfig`) |
| matrix-input `matrix-input.js:6` (`defaults`) | en | matrix labels. These duplicate the `L.matrix*` keys that math-exercise passes in |
| py-exercise `py-exercise.js:8-93`; `py-exercise.lua:55-64` | en, de | domain UI and noscript |
| pyodide-interaktiv `qpyodide-locales.js:14-886`; `qpyodide.lua:72-89` | en, de, sv, no(=nb), da | cell UI. It also still holds feedback-adjacent strings (`feedbackTitle`, `feedbackLabel`, `outputNotRun…`, lines ~34-75) |
| example-source.lua ×5 (`meta`) | en, nb/no, de | panel summaries. These are 3 different wordings across the generations |
| stack-sympy `stack-sympy.js` / `.lua` | en only | hard-coded English strings ("Show source", "Enter an answer before requesting feedback.") |

Shared concepts appear in several tables: the "Feedback" button label (×4), "Check" and "Reset" (math/py/pyodide), noscript messages (py and pyodide, different wording), "Please enter an answer first" (math `needAnswerFirst`, stack). Language normalisation is in §1 #7. **Home:** `ctm-runtime/i18n` should own one `normalizeLanguage()` (JS and Lua), the canonical supported set, and the generic UI strings. ai-feedback keeps feedback strings only. Each extension keeps only domain strings.

### 3.9 HTML escaping, markdown rendering, KaTeX/MathJax typesetting
| Helper | Locations |
|---|---|
| JS `escHtml`/`escapeHtml` | ai-feedback `feedback-dom.js:6`; math-exercise `math-exercise.js:156-160` **and** `promptXmlEsc` `:162-166` (byte-identical body, intra-file); `matrix-input.js:5` (also escapes `'`), plus its stack-sympy vendor copy; py-exercise `py-exercise.js:156-162` |
| Lua `escape`/`attrEsc` | example-source.lua ×5 `:4-6`; math-exercise `math-exercise.lua:228-230`; stack-sympy `stack-sympy.lua:16-18` |
| Markdown | single implementation in ai-feedback `feedback-dom.js:7-187`. math-exercise wraps it (`:184`). Good |
| KaTeX / MathJax | see §1 #8 |
| `$…$` → `\(…\)` | math-exercise Lua `:479-482` and JS `:836-862` (**diverged**, §1 #2) |

**Home:** `ctm-runtime` (JS `escapeHtml`, `ensureKatex`, `ensureMathJax` plus a serialized typeset queue) and a small shared Lua module (`escape`, `readFile`, `resolveLang`, `locate`).

### 3.10 Feedback adapters (each consumer's call to `AIFeedback.attach`)
| Location | Lines | Built by hand |
|---|---|---|
| math-exercise `math-exercise.js:1678-1735` | 58 | output div, version gate, gear swap, `getRequest` (profile `mathematics`, evidence = private check results, attachments from the JSXGraph bridge) |
| py-exercise `py-exercise-feedback.js:1-58` | 58 | button, output, gear, version gate, `getRequest` (profile `python`, evidence allow-list, criteria from forbidden imports) |
| pyodide-interaktiv `qpyodide-feedback.js:1-48` | 48 | output, version gate, gear, `getRequest` (profile `python`, `no`→`nb`) |
| stack-sympy `stack-sympy.js:355-415` | 61 | button, output, gear, version gate, `getRequest` (profile `mathematics`, `integration: 'math-exercise'`) |

All four repeat the same skeleton: create a button and output with `aria-live`, gate on version, add `settingsButton`, call `attach({integration, policySelection, id, button, output, uiLanguage, getRequest})`, and invalidate or reset on edit. Only `getRequest` is domain-specific. The two Python adapters build nearly the same request (`responses:[{id:'code',format:'code',language:'python'}]`). **Home:** ai-feedback should provide `AIFeedback.mount({container|buttonBar, integration, …, getRequest})`, which returns `{invalidate, reset, dispose}`. Consumers keep only `getRequest`.

### 3.11 Storage and settings helpers
- ai-feedback `ai-feedback.js:16-28` (`store`, `loadConfig`, `saveConfig`, key `ai-feedback-config-v1`). It also knows the legacy keys of math-exercise and pyodide (`:63`).
- py-exercise `py-exercise.js:393-396,470-477,538`: per-page code autosave (`pyex|path|label`, try/catch, 500 ms debounce).
- pyodide-interaktiv `qpyodide-storage.js:1-263`, `qpyodide-storage-settings.js` (133 L), `qpyodide-document-settings.js`: full autosave with identities, epoch, opt-out and clear-all.

These are parallel implementations of "safe localStorage" and "code autosave". **Home:** `ctm-runtime.storage` (safeGet/Set/Remove) and one code-autosave module, generalised from pyodide-interaktiv, that py-exercise reuses.

### 3.12 CI workflow steps
| Step | Copies |
|---|---|
| "Select explicit review dependencies" (5 L) | 12 workflow files in 5 repos, 100% |
| "Fetch shared feedback dependency" / checkout ai-feedback plus `quarto add ./_feedback-source` | math-exercise (`test.yml`, `examples-pages.yml`, `browser.yml`), pyodide-interaktiv (`example.yml`, `feedback.yml`), py-exercise (×2), ctm-assessment. stack-sympy `site.yml:52-61` does the same but pins the SHA and copies with `cp -a` |
| "Render standalone example" + upload-artifact | ai-feedback, math-exercise and pyodide-interaktiv `example.yml` (97% math↔pyodide; 75-78% vs ai-feedback); py-exercise 69-90% |
| Toolchain pins | Quarto `1.8.27` (×13), Node `22` (×5), Python `3.12` (×13), `sympy==1.14.0` (×5 in workflows and requirements) |

**Home:** a `ctm-ci` repo with composite actions (`select-review-deps`, `install-ai-feedback`, `setup-ctm-toolchain`) and a reusable `render-example.yml`. The pins go in one file there.

**Pin divergence worth noting.** CPython checker tests pin `sympy==1.14.0` (math-exercise, ctm-assessment, ctm-demo). The browser runs Pyodide 0.27.2, whose SymPy is what stack-sympy pins for parity (`requirements.txt: sympy==1.13.3`, `run_compliance_pyodide.py:27-28`). math-exercise's CPython tests therefore run a different SymPy from the one students' browsers use.

### 3.13 Python test-runner and helper scripts
- math-exercise `question-tests.py` (95 L) is the authored-test runner for `#| tests:`, invoked from `math-exercise.lua:600`.
- stack-sympy `engine.py:628-659` `run_question_tests` is a parallel concept (STACK question tests).
- py-exercise `tests/test_greeting_example.py` is ad hoc and does not use a runner.
- HTTP serving for browser tests: stack-sympy `tests/browser.py:322-335` `serve` vs `scripts/run_compliance_pyodide.py:110-123` `serve_repo` (85%, intra-repo).
- Rendered-HTML parsing: stack-sympy `tests/rendered_html.py`, ctm-demo `scripts/check-stack-variants.py` (`HTMLParser`) and `scripts/audit-rendered.py` (bs4). These are parallel and small.

**Home:** low priority. A shared `ctm-testkit` (Python: serve, parse rendered HTML; Node: the loader in §3.14) if the repos converge.

### 3.14 JS test harness (loading the ai-feedback runtime into JSDOM or vm)
The same loop `for (file of ['feedback-core.js','feedback-dom.js','ai-feedback.js']) eval(read(AI_FEEDBACK_EXTENSION/file))` appears in:
- ctm-assessment `tests/py-feedback.test.cjs:15`, `tests/render.test.cjs:24`, `integration/feedback/rendered.test.cjs:173`
- pyodide-interaktiv `tests/feedback.test.cjs:12`, `tests/storage-settings.test.cjs:5`
- math-exercise `tests/helpers/ai-context.mjs:7`, `tests/graph-construction.test.mjs:35`, `markdown-table.test.mjs:26`, `model-policy.test.mjs:51`, `nb-language.test.mjs:39`

Within math-exercise, the `loadBundle` helpers are 63-95% similar across 5 test files (`markdown-table`, `vector-matrix`, `graph-construction`, `model-policy`, `nb-language`). The file order duplicates the injection order in `feedback-quarto.lua`. **Home:** ai-feedback ships `testing/load-runtime.cjs` (exported from its package.json). math-exercise consolidates `loadBundle` into `tests/helpers/`.

### 3.15 Context extraction
- ai-feedback owns it: `feedback-quarto.lua:23-70` (Lua, AST) and `feedback-dom.js:209-345` (JS, DOM). These are two intra-repo parallel exclusion lists: Lua `excluded()` `:23-31` vs JS `el.matches(...)` `:252-256`. The JS list hard-codes consumer classes (`.math-exercise-cell`, `.py-exercise-cell`, `.qpyodide-*`, `.math-legend-panel`, `.math-dynamic-matrix-controls`), which inverts the dependency. stack-sympy instead uses the generic `.ai-feedback-ignore`, which is the pattern every consumer should follow.
- math-exercise `math-exercise.lua:77-104,783-797` still documents "auto-context capped at ~1500 chars / 6000 explicit", and `:813` still creates `state.sectionCtx`. That state is **dead** (never read). The behaviour now lives in ai-feedback (`bounded()` `:60-69`, `MAX_FEEDBACK_CONTEXT_CHARS`), so the comments are stale duplicated documentation.

### 3.16 Graph helpers
Upstream `graph-editor.js:8-66` `summarizeGraph` (JS) and math-exercise's embedded `graph_from_response` (`math-exercise.js:381-426`, Python/networkx) are two halves of one graph-response contract, living in different repos and languages. **Home:** keep `graph_from_response` beside the editor contract in `ctm_checkers` (§3.6), with a fixture shared with upstream's tests.

### 3.17 Other parallel items (low)
- `readFile` (Lua): `math-exercise.lua:163-170` vs `py-exercise.lua:69-79` (74%); `stack-sympy.lua:24-30`. `splitCsv`/`splitCommaList` (71%).
- pyodide-interaktiv intra-repo: `qpyodideSetRunButtonsEnabled` (`qpyodide-cell-classes.js:99-105`) vs `qpyodideSetInteractiveButtonState` (`qpyodide-document-status.js:97-105`), 62%.
- ctm-demo `assets/stack/page.js:3-17` (MathJax queue) parallels stack-sympy `math()` (`:128-135`).
- Example and policy content: ctm-assessment `feedback/comparison.yml` vs math-exercise `feedback/policy-comparison.yml` (73%). stack-sympy `questions/course-sources/determinant-original.qmd` is fully contained (C 100%) in math-exercise `_includes/custom-assessment.qmd` and carries a provenance record. Docs: `docs/reference.md` ctm-assessment↔ai-feedback 86%; `docs/authoring.md` 79-86% across 4 repos; `docs/graph-editor.md` math-exercise↔upstream 35% (diverged docs for the same component).

---

## 4. Generic code buried in one extension

| # | Code | Where | Lines | Who could reuse | Proposed home |
|---|---|---|---|---|---|
| 4.1 | Python checker helpers (`assess_basis`, `graph_from_response`, numeric tolerance and sig-figs, form canonicalisation, the custom-result normaliser) as a **JS string array** | math-exercise `math-exercise.js:302-646` | ~345 | stack-sympy (already vendors `assess_basis`), question-tests, ctm-demo checkers | `ctm_checkers` Python package with a generated JS bundle |
| 4.2 | Shared Pyodide runtime | math-exercise `shared/pyodide-runtime.js` | 94 | py-exercise (fork), stack-sympy (vendored), pyodide-interaktiv (protocol producer) | `ctm-runtime` |
| 4.3 | Matrix editor | math-exercise `matrix-input.{js,css}` | 411 | stack-sympy (vendored) | `ctm-math-input` (or `ctm-runtime/ui`) |
| 4.4 | Variant generator (deterministic, no code execution, digests, review fingerprints) | math-exercise `variants.py` (175) + `variants.lua` (34) | 209 | ctm-demo stack pages (already "generation belongs to math-exercise"), stack-sympy seeds and variants | its own module in the math package; expose it as a CLI |
| 4.5 | Authored-test runner | math-exercise `question-tests.py` | 95 | py-exercise (`## TESTS ##` checks), stack-sympy question tests | `ctm-testkit` or the math package |
| 4.6 | Assessment-bridge client (postMessage request/response, layout notify) | math-exercise `math-exercise.js:1014-1096` and ai-feedback `feedback-dom.js:387-427` | 83 + 41 | ctm-demo `ctm-stack-figure` protocol | upstream jsxgraph-quarto should ship `assessment-client.js` next to its server half (or `ctm-runtime`) |
| 4.7 | Code-editor autosave and storage settings | pyodide-interaktiv `qpyodide-storage*.js` | ~400 | py-exercise | `ctm-runtime` |
| 4.8 | Worker-RPC with timeout and terminate | stack-sympy `stack-sympy.js:12-57`, pyodide-interaktiv boot `:400-562` | 46 / 163 | math-exercise (long SymPy checks freeze the page today) | `ctm-runtime.worker` |
| 4.9 | Extension locator (`_extensions/*/name` walk) | `feedback-loader.lua` and example-source `defaultPolicySource` | 18-31 | every consumer, plus the new jsxgraph check | ai-feedback Lua API or the shared Lua module |
| 4.10 | Rendered-site audit | ctm-demo `scripts/audit-rendered.py` | 113 | every example site (math-exercise CI `test.yml:80-113` uses `grep -c` instead) | `ctm-ci` |

---

## 5. Intra-repo generated copies and intra-repo duplicates

### 5.1 Generated from a single source (acceptable if checked in CI)
| Repo | Source → generated | Generator | Enforced |
|---|---|---|---|
| ai-feedback | `feedback-defaults.yml` → `feedback-core.js:11-13` (`shippedPolicies`, between the `BEGIN/END GENERATED` markers) | `scripts/sync-feedback-defaults.py` | yes: `test.yml` runs `--check`, and ctm-assessment's builder runs it again |
| stack-sympy | `stack_sympy/*.py` (14 modules, ~3.4 kL) → `runtime-sources.js` (2 lines, one JSON blob) | `scripts/bundle_runtime.py` | yes: `site.yml:71 --check` and `run_compliance_pyodide.py:98-100`. All 14 entries match HEAD (verified) |
| math-exercise | the embedded Python in `math-exercise.js` → executed by `question-tests.py:14-26` (regex plus `ast.literal_eval`) | not a copy (single source, decoded at test time) | implicitly. **Fragile:** it depends on the exact `runPythonAsync([\n … \n    ].join('\n'))` layout |
| ctm-assessment | component repos → `.feedback-workspace/ctm-assessment/_extensions/*` (distribution tarball) with `resolved-repos.json` sha256 per file | `scripts/setup-feedback-integration.py:142-164` | yes (hash record, ctm-demo `scripts/setup.py:124-133` verifies). Note: the distribution contains 3 copies of `feedback-loader.lua` and takes jsxgraph from math-exercise |

### 5.2 Not generated: stale or committed duplicates
| Repo | Items | Note |
|---|---|---|
| py-exercise | `example-en.html` (3810 L, 1.2 MB), `example-mini.html` (3665 L, 1.2 MB) | Rendered snapshots committed 2026-08-20 (aea0311). They embed **stale copies** of `py-exercise.js` (pre-feedback `ensurePyodide`) and CSS, plus Quarto/Bootstrap bundles. No generator or check exists. Delete them, or produce them in CI |
| math-exercise | `_includes/tests/ex-jsxgraph-editable-freehand-monotonicity.py` = `ex-jsxgraph-freehand-monotonicity.py` (13 L); `jsxgraph-bipartite-construction.py` = `jsxgraph-euler-construction.py` (11 L); `dynamic-*-basis.py` ×5 are 62-85% similar | authored tests. They could share one file via `#| tests:` |
| math-exercise | `escHtml` = `promptXmlEsc` (`math-exercise.js:156-166`); dead `loadScript` (`:186-206`); `dynamicSpecFromElement` (`:939-955` = `matrix-input.js:77-93`); Lua/JS twin renderers (§3.5, §1 #2) | |
| ai-feedback | the integration-name list in 3 languages: `feedback-core.js:14`, `feedback-policy.lua:18`, `read-policies.ts:107`. Lua/JS context-exclusion lists (§3.15) | generate them from `feedback-defaults.yml` (which already has `integrations:`) with the existing sync script |
| stack-sympy | `feedback/course.yml` = `tests/fixtures/browser/policies.yml`; `questions/corpus/COPYING.txt` = `questions/upstream/COPYING.txt` (427 L); worker FS bootstrap ×2 (`worker.js`, `scripts/native_compliance/pyodide_worker.js`); `serve` ×2 (85%) | |
| ctm-demo | `_includes/bevegelse-ii/accessibility.html` vs `_includes/fysikk-forkurs/accessibility.html` (95%) | content |

---

## 6. stack-sympy (exempt): what it duplicates from the others

| stack-sympy file | Duplicates | Relationship | State |
|---|---|---|---|
| `vendor/pyodide-runtime.js` (94) | math-exercise `shared/pyodide-runtime.js` | byte-identical, provenance 6eddf89 | in sync. Licence string differs (AGPL-3.0-only vs -or-later) |
| `vendor/matrix-input.js` (230), `vendor/matrix-input.css` (181) | math-exercise `matrix-input.*` | byte-identical, provenance f238da6 | in sync |
| `stack_sympy/basis_helper.py` (90) | `assess_basis` embedded in math-exercise `math-exercise.js:427-510` | function body byte-equal, hash-checked | in sync with 5945f8f |
| `feedback-loader.lua` (38) | math/py/pyodide `feedback-loader.lua` (31) | near-identical, 65% | **diverged** (stricter 0.8 gate; reads `_extension.yml`) |
| `stack-sympy.js:355-415` | feedback-adapter skeleton (§3.10) | parallel | stricter API check |
| `stack-sympy.js:59-141` | KaTeX/MathJax loaders (§1 #8) | parallel | MathJax 3.2.2 |
| `stack-sympy.lua:16-18,24-30,32-54` | `escape`/`readFile`/source panel (§3.7, §3.9) | parallel | it has the fence-length fix the others lack |
| `stack-sympy.js:12-57` + `worker.js` | worker-RPC (§4.8) | parallel | — |
| `.github/workflows/site.yml:52-61` | the "fetch ai-feedback" CI step (§3.12) | parallel | pins the SHA (`68abb6d`, now behind ai-feedback 0.8.1) |
| `questions/course-sources/determinant-original.qmd` | math-exercise `_includes/custom-assessment.qmd` | content copy (C 100%) with provenance | — |

Impact if stack-sympy later joins the rule: everything in this table moves to the same homes proposed for the others. Its vendoring and provenance pattern (pinned SHA plus sha256 test) is the best of the current approaches, but under the rule it is still duplication.

---

## 7. Proposed homes (summary)

| Home | New or existing | Takes |
|---|---|---|
| **ai-feedback** | existing | one Lua locator and `require(minVersion)` (replaces 4× `feedback-loader.lua` and the walk in example-source); `AIFeedback.mount()` adapter skeleton (§3.10); `requireVersion` (JS); `testing/load-runtime.cjs` (§3.14); the integration list generated from YAML; consumers mark non-context UI with `.ai-feedback-ignore` instead of ai-feedback naming their classes |
| **ctm-runtime** (proposed name; small Quarto extension of classic scripts plus one Lua module) | new | the Pyodide shared-instance protocol and version (`pyodide-runtime.js`), `loadScript`, `ensureMonaco` and the Python editor factory (with EOL and theme fixes), `ensureKatex` / `ensureMathJax` with a typeset queue, `escapeHtml`, `normalizeLanguage` and the generic UI strings, safe storage and code autosave, worker-RPC. Lua: `escape`, `readFile`, `resolveLang`, `locate` |
| **ctm-math-input** (or the `ctm-runtime/ui` module) | new | `matrix-input.{js,css}`; the single renderer for vector/matrix/dynamic-matrix markup (removes the Lua twin) |
| **ctm_checkers** (Python package, bundled for Pyodide like stack-sympy's `bundle_runtime.py`) | new | the embedded Python of math-exercise: `assess_basis`, `graph_from_response`, the numeric and form helpers, the custom-result contract and status vocabulary; question-tests imports it |
| **upstream jsxgraph-quarto** | existing (not ours) | graph editor, bridge server and (proposed) `assessment-client.js`. Delete math-exercise `_extensions/jsxgraph`, then repoint `setup-feedback-integration.py:150-151` and `tests/graph-construction.test.mjs:13-14` |
| **ctm-docs** | new | the single `example-source.lua` (merging the math and ctm features plus stack's fence fix), `example-site.css`, `audit-rendered.py` |
| **ctm-ci** | new repo of reusable actions and workflows | `review-dependencies.py` (allowed set from a config, including stack-sympy and ctm-demo), the fetch-ai-feedback step, the render-example workflow, toolchain and pip pins |
| **per repo, keep** | — | `LICENSE` text; domain locale strings; domain `getRequest` builders |

The suggested order follows the risk ranking:
1. py-exercise drops its Pyodide fork, which fixes a real bug.
2. The Lua and JS math renderers collapse into one, which fixes the `\$` bug and the a11y gap.
3. example-source.lua becomes one copy.
4. The feedback locator and version gate move into ai-feedback.
5. Monaco, i18n and the bridge client move into ctm-runtime.
6. CI reuse goes into ctm-ci.
7. The jsxgraph leftover is removed after repointing the umbrella.
