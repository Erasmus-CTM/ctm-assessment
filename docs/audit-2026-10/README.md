# ctm-assessment stack — pre-release audit, October 2026

> Repository copy of the audit report (October 2026, pull request #11). Files referenced as `code/…` (scripts, raw measurements) are kept in the audit's working folder, not in this repository.


Working track, updated as results come in. **Status:** fixed (branch `audit/2026-10`, PR link once opened) · proposed (awaiting AC's approval, §5) · wontfix · open.
Appendices: [A — mathematics examples](appendix-A-math-examples.md) · [B — Python, Pyodide and plain-text examples](appendix-B-python-text-examples.md) · [C — duplication inventory](appendix-C-duplication-inventory.md) · `code/` (harnesses and scripts used).

## 0. Baseline (18 Oct 2026, before any change)

Audited commits: ctm-assessment `12179c2`, ai-feedback `68abb6d`, math-exercise `5945f8f`, py-exercise `84c6647`, pyodide-interaktiv `feature/shared-feedback-integration` `108a8dc` (= umbrella pin), jsxgraph upstream `59d549c` (= tag v1.1.0; the fork `aacchhee/jsxgraph-quarto` main was still at `d94570d`, behind upstream), ctm-demo `d359890`. Prior work read first: ctm-assessment `docs/audit-2026-10-16.md` and history, merged audit PRs in all repos, math-exercise `docs/audits/matrix-input.md`, ctm-demo `docs/render-audit-2026-10-16.md`, the merged upstream JSXGraph bridge (#1). Items fixed there are not re-reported; where they did not hold it is said explicitly (Appendix A).

| Suite | Local (Quarto 1.8.27, Node 22) | GitHub Actions at main |
|---|---|---|
| ai-feedback: 69 unit + render + defaults sync | pass | pass |
| math-exercise: 14 variant + 107 Node + site render (incl. authored checker tests) + nb + example | pass | pass; Playwright browser pass |
| py-exercise: 1 unittest + 3 renders | pass | pass |
| pyodide-interaktiv: 23 unit + render | pass | pass |
| jsxgraph upstream example render | pass | (no upstream CI) |
| **ctm-assessment** `setup-feedback-integration.py --test` | **FAIL** (integration 9/10) | **FAIL**; browser tabs never run |

The umbrella had been red since math-exercise #20 (17 Oct) without anyone noticing: it resolved **unpinned `main`** of every component on every build and its CI only runs on its own pushes (F-01).

Local limits: the container cannot reach jsDelivr/cdnjs, so real-browser Pyodide runs only in GitHub Actions; GitHub log/artifact downloads are blocked here, so CI failures and timings are surfaced as annotations. A local harness runs rendered math-exercise pages in jsdom against **real Pyodide 0.27.2 + SymPy 1.13.3** from npm/PyPI (`code/harness/`), which made the runtime findings reproducible without a browser. The two example sub-audits ran every checker in CPython and Pyodide (identical in all 265 Python and 66 sampled math cases).

## 1. Findings, ranked

Severity: **critical** = wrong grading or broken install/release on the main path; **major** = learners or authors hit it in normal use; **minor**; **info**. Example-level findings (MATH-n, PY-n) are summarized here and listed fully in Appendices A/B.

### Critical
| ID | Finding | Where | Status |
|---|---|---|---|
| F-01 | Umbrella built from unpinned component `main`: releases not reproducible, main red since 17 Oct (integration harness loaded math-exercise.js without the new matrix-input.js) | ctm-assessment `integration/feedback/repos.json`, `scripts/setup-feedback-integration.py` | fixed: all components pinned by commit (incl. upstream JSXGraph), `--update-pins`, `--follow-branches`, weekly "Track component branches" workflow |
| F-02 | After pyodide-interaktiv's Stop/restart every mathematics Check fails until reload ("Unknown name „_mj" – use the input help"; during the restart a type error). Reproduced with real Pyodide (`code/harness/restart-test.cjs`) | math-exercise `math-exercise.js` (SymPy state cached on the global `mainPyodide`) | fixed (state bound to runtime object) + browser regression in the umbrella smoke test |
| F-03 | Same class in py-exercise: localized checker messages were set once in the interpreter, so every Check after a restart raised NameError | py-exercise `py-exercise.js` | fixed |
| MATH-1/2/3 | Newton sequence rejects `1.5`/decimals; `single_fraction` rejects valid fractions; "P on the circle" needs sub-pixel accuracy | Appendix A | 1, 3 fixed; 2 example worded + runtime fix proposed |
| PY-1/2 | Wrong palindrome solution passes; documented "Full Example" is a SyntaxError | Appendix B | fixed |
| F-35 | math-exercise install guide tells users to install `@feature/shared-feedback-integration`, a branch that no longer exists: the documented standalone install fails | math-exercise `docs/installation.md` | fixed (rewritten with dependency table) |

### Major
| ID | Finding | Where | Status |
|---|---|---|---|
| F-23 | A page that sets `ai-feedback: {page-policy: ...}` silently loses the project's `mode`, `base-url`, `model`, `storage` (Quarto replaces the whole mapping); e.g. an institution's `storage: session` silently became `local` for the API key | ai-feedback `feedback-quarto.lua` | fixed: runtime settings merged key by key by the same reader as policies (0.8.1) |
| F-08 | ai-feedback rendering fails with `quarto: createProcess: does not exist` when `quarto` is not on PATH (IDE-bundled Quarto, typical on Windows/macOS) | ai-feedback `feedback-policy.lua` | fixed (`quarto.config.cli_path()`), test without PATH |
| F-04 | Learner code in Pyodide cells shares the interpreter with math-exercise's checker: `symbols = ...`, `Matrix = ...`, `sqrt = None` in a cell broke every maths check on the page | math-exercise `math-exercise.js` | fixed (checker runtime in its own module) + browser regression |
| F-15 | math-exercise required ai-feedback for every HTML page, even without feedback | math-exercise `math-exercise.lua` | fixed: `math-exercise: feedback: auto\|true\|false` (auto = previous behaviour when installed; otherwise no button and one message naming the install command) |
| F-36 | Umbrella + separately added component copies (`quarto add Erasmus-CTM/…` installs under `_extensions/Erasmus-CTM/`) stopped rendering with "Multiple ai-feedback installations" | `feedback-loader.lua` ×3 | fixed in all three copies (prefer the sibling installation); archive test renders exactly this layout |
| Step 2 | Vendored JSXGraph extension in math-exercise (Lua identical to upstream v1.1.0, graph-editor.js one newline apart, no `resources/`, so static export could not work from it) | math-exercise `_extensions/jsxgraph` | fixed: deleted; upstream v1.1.0 is a declared dependency installed in CI; umbrella takes it from upstream pinned by commit; nothing needed upstreaming from the copy |
| F-37 | Graphical answers without the JSXGraph extension rendered a code listing and failed only at runtime | math-exercise | fixed: build-time error naming `quarto add jsxgraph/jsxgraph-quarto`, and for a missing `assessment_id` |
| F-05 | py-exercise showed no editors until Pyodide *and* Monaco had loaded; if Pyodide failed (offline/CDN), no exercises and no message | py-exercise | fixed (editors when Monaco is ready, Check waits for Python and reports load errors) |
| F-25 | py-exercise's copy of the Pyodide loader lacked the retry fix from math-exercise #12: after one CDN failure it stayed broken until reload | py-exercise | fixed in that copy (consolidation: §4) |
| F-11 | Native checker tests ran SymPy 1.14.0; the browser (Pyodide 0.27.2) runs SymPy 1.13.3 | math-exercise and umbrella CI, docs, ctm-demo `requirements.txt` | fixed in math-exercise/umbrella (all tests pass on 1.13.3); ctm-demo in Step 5 |
| F-24 | First render of a task (Lua) turned `Price \$5 or \$7` into math; the JS redraw did not | math-exercise `math-exercise.lua` | fixed + Lua/JS parity test |
| F-13 | pyodide-interaktiv loads micropip, pyodide_http and **matplotlib** into its worker on every page with a Pyodide cell, before any cell runs; on mixed pages the first maths/Python check waits behind it | pyodide-interaktiv `qpyodide-document-engine-initialization.js` | proposed (§5 P7; measurements §3) |
| F-14 | pyodide-interaktiv's interactive plots start a **second** Pyodide on the main thread | `qpyodide-canvas-plots.js` | proposed |
| F-38 | JSXGraph defaults loaded unversioned `jsxgraph` and `mathjax@4` from jsDelivr: JSXGraph 1.14.0 (5 Oct) has been served to published pages while static exports use the bundled 1.13.3 | upstream `jsxgraph.lua` | fixed on fork branch for an upstream PR (pinned to bundled 1.13.3 and MathJax 4.1.3) |
| F-34 | Authoring errors (`error()` in the Lua filters) were only logged by Quarto 1.8.27: the render succeeded and published a broken exercise | math-exercise, py-exercise | fixed (`assert`); authors now get a failed render — see Info |
| F-41 | ai-feedback always emitted `storage: local`, so `pyodide: feedback-storage: session` was ignored. Learners' personal API keys were then saved to localStorage on shared machines | ai-feedback `feedback-quarto.lua` | fixed: storage emitted only when set (review round 2) |
| F-42 | A failed Pyodide WebAssembly download left `loadPyodide()` pending forever: every Check and the export hung with no message | shared `pyodide-runtime.js` (math-exercise, py-exercise) | fixed: 180 s timeout, localized message, the next Check retries |
| F-43 | py-exercise reimplemented math-exercise's Pyodide loader; the copies already behaved differently | py-exercise | fixed: byte-identical shared file, checked by the package build |
| F-44 | The package's JSXGraph and a separately added `jsxgraph/jsxgraph-quarto` collide: Quarto installs the latter inside the package's folder, where it is never found, and updating the package deletes a JSXGraph added before it | umbrella | fixed: docs, a render warning, a package test (a layout change would be BC) |
| F-45 | The package archive had lost JSXGraph's MIT notice; no component licence was installed | umbrella | fixed: every component's licence in `_extensions/ctm-assessment/licenses/`, tested |
| F-46 | The package next to a newer standalone ai-feedback stopped every page ("different versions") | shared `feedback-loader.lua` | fixed: the ai-feedback next to each consumer wins; only a page mixing both sets with different versions stops |
| F-47 | py-exercise's checker wrote `json`, `sys`, `ast`, `_results` and the tests into the namespace that pyodide-interaktiv cells use as a notebook, overwriting learners' variables | py-exercise | fixed: private module, fresh namespace per check (Appendix D) |
| F-48 | Learner code and math answers could change interpreter state for every component (builtins, stdout, recursion limit, CTM modules); math answers could run arbitrary Python through `parse_expr` | py-exercise, math-exercise | fixed: shared `_ctm_guard`, dunder answers rejected (Appendix D) |
| F-49 | Pages that use `.ai-feedback` or `.jsxgraph` blocks without the extension installed were published with those blocks as plain text/code | all consumers | fixed: shared locator `requireUsed` stops the render with the install command, without loading anything |
| F-50 | Old pyodide-interaktiv projects (1.6, built-in feedback) stop rendering after updating to the shared-feedback version, because ai-feedback is not installed | pyodide-interaktiv | fixed with AC's decision: the repository ships ai-feedback (P14); 1.6-style fixture test |
| F-51 | Quarto 1.10 sends every page with `{math-exercise}`/`{py-exercise}`/`{pyodide-python}` blocks to Jupyter (upstream regex regression) | Quarto | reported upstream (text ready, P11); workaround documented |
| F-52 | ai-feedback's `deno.json` (`"nodeModulesDir": "none"`) stops every render on Quarto 1.7 and older | ai-feedback | fixed: `{"lock": false}` |
| F-53 | Action buttons had four different sizes across the components on one page (font 14.9/15.3/17 px, heights about 30 to 43 px) | all | fixed (AC 18 Oct): every component uses the same `--ctm-button-*` variables with the same defaults, also standalone; projects can override them |
| F-54 | Cross-package styling and keys: pyodide-interaktiv's global `.monaco-editor pre` rule and its page-wide Ctrl/Shift+Enter bindings applied to py-exercise's editors | pyodide-interaktiv, py-exercise | fixed: scoped CSS, Monaco context keys |
| MATH-4…13 | Decimal coordinates rejected in basis tasks, Euler checker wrong, polar/cylindrical regions, perpendicular variants accept 0-vector/complex, 2-decimal tolerance accepts 3.15, built-in modes accept `diff(...)`/`integrate(...)`, `lowest_terms` bypass, `reject` vs `form`, `x_k` | Appendix A | most fixed; 10–12 runtime proposals |
| PY-3/4/5/6 | "Must be recursive" unchecked; caption promised but never shown; stale committed HTML (still with the 16 Oct greeting bug); a setup line counted as a passed test | Appendix B | fixed (PY-4 runtime display proposed) |

### Minor
| ID | Finding | Status |
|---|---|---|
| F-07 | ai-feedback HTML dependency was versioned `0.7.0` while the extension is 0.8.x | fixed |
| F-09 | Unknown `ai-feedback:` options (`base_url`), invalid `mode`/`storage`/`base-url` and credential-like keys were silently ignored | fixed as render warnings (errors proposed, §5 P2) |
| F-17 | Shared context warnings in ai-feedback named math-exercise | fixed |
| F-26 | py-exercise Monaco theme `vs-light` does not exist | fixed |
| F-27 | py-exercise has no Norwegian UI: English controls on Norwegian pages while feedback UI is Norwegian | proposed (locales belong in a shared package, §4) |
| F-16 | Components declare `quarto-required >=1.4.549` but only 1.8.27 is tested (ai-feedback requires 1.8.27) | proposed (§5 P9) |
| F-20 | py-exercise "Publish Python examples" deploys Pages on `workflow_dispatch` from any branch | open (note for AC) |
| F-33 | math-exercise Pages workflow: one concurrency group with `cancel-in-progress: true` for all branches, so a feature push can cancel a main deployment (comment says "serializing") | open (note for AC) |
| F-55 | A restart during the first SymPy setup was not retried; an escaped dollar inside an answer marker corrupted the input; the missing-ai-feedback message appeared on every page; a JSXGraph review ref was ignored in CI | math-exercise | fixed (review round 2) |
| F-56 | The policy reader received its input (possibly including credentials) on the command line; profile order and `_quarto.yml.local` differed from Quarto's merge | ai-feedback | fixed: stdin, Quarto's order, `.local` read |
| F-57 | A Monaco editor arriving after the 60 s message was ignored; the jsdom tests initialised the page twice | py-exercise | fixed, with tests |
| F-58 | Bytecode left by tests could ship in a rebuilt archive; the timing script double-counted the offline pass and reported service-worker sizes as valid | umbrella | fixed |
| F-59 | Hidden callouts reached an activity's AI context when the component's exercise feedback was off (py-exercise, pyodide-interaktiv `feedback: false`) | py-exercise, pyodide-interaktiv | fixed: feedback need decided before callouts are marked; render tests (review round 3) |
| F-60 | Concurrent private-module installs by two components mixed their sources; a Stop from one component was retried or shown as an error by another; Stop never appeared when the worker became ready after the threshold; one failing restore step skipped the rest | shared `pyodide-runtime.js` | fixed: install per module, page-wide stop count, slow watcher, per-step restore (review round 3) |
| F-61 | The explicit ai-feedback filter bypassed the mixed-version stop; a project deno.json/package.json above the extension could stop the policy reader | ai-feedback | fixed: registration in `feedback-quarto.lua`; Deno workspace root (review round 3) |
| F-62 | math-exercise loaded ai-feedback on pages without exercises and ignored `.ai-feedback` activities with feedback off; author data with `__` was rejected; an escaped dollar in an answer kept its backslash; script config in non-HTML output | math-exercise | fixed (review round 3) |
| F-63 | py-exercise 0.3 had started running `if __name__ == "__main__":` blocks during checks (input() then blocked or prompted) | py-exercise | fixed: previous behaviour kept, test |
| F-64 | The `__` answer check re-read inputs left by an earlier check of another kind, so one rejected answer blocked other exercises; string answers containing `__` could never be accepted | math-exercise | fixed (review round 4) |
| F-65 | With released math-exercise 0.8 loaded first, the new py-exercise's Check hung (older runtime object kept); very long `stop-after` overflowed the timer; an interactive cell's own Stop surfaced as an unexpected error in py-exercise | shared runtime, py-exercise | fixed: newer runtime replaces older, clamp, retry once after other restarts (review round 4) |
| F-66 | The loading measurement waited for `cell.mathExercise`, which only generated-variant cells have, so every math-exercise scenario timed out after 180 s | ctm-assessment `loading-timing.cjs` | fixed: readiness is the first Check click that takes effect |
| F-67 | `mode: equivalent` relies on `simplify`. Large coefficients (`cos(10^8*t)/100`) ran 40 s in Pyodide and then failed (about 3 GB in CPython), freezing a page without a worker. Float coefficients in a key (`-0.06*81*sin(9t)`) made exact equivalents differ by 1e-16 and graded them wrong | math-exercise (found through ctm-demo) | ctm-demo content fixed (§8); component change proposed (P15) |
| F-68 | The `stop-after` clock counted the SymPy/package load. On a slow line (51 s SymPy, §3), a worker page offered Stop during the download, and Stop restarted it | math-exercise, py-exercise | fixed: clock starts after loading; jsdom tests in both |
| F-69 | `decplaces`/`sigfigs` rounded binary floats with Python's `round()`: 5.395 to two places gave 5.39, so an answer that rounds to the key under the documented rule was graded wrong (ctm-demo b2-15-1); exact ties used banker's rounding (0.125 → 0.12) | math-exercise | fixed: decimal rounding, half away from zero; test |
| F-70 | Removing the vendored `_extensions/jsxgraph` from math-exercise (AC's rule: no JSXGraph copy inside it) removes an install path that downstream projects use. ingmat3a installs JSXGraph from `Erasmus-CTM/math-exercise` `main`, path `_extensions/jsxgraph` (`quarto-extensions.yml`); its `scripts/setup.py` stops with "extension path not found" once PR #21 is merged | math-exercise → downstream courses | migration step added to the release order (§7): point those projects at `jsxgraph/jsxgraph-quarto` first |
| F-71 | ingmat3a's build on `main` no longer works. Its setup installs math-exercise `main`, which now requires the shared ai-feedback (the setup does not install it), and JSXGraph from math-exercise (removed by PR #21). The published site is from 1 Oct; the next push would fail | ingmat3a (downstream) | ingmat3a moved to the package (AC 18 Oct), §9 |
| F-72 | math-exercise `deb5956` (main, 16 Oct, unreleased) escapes all exercise text, so TeX `a<b<c` survives. But Markdown authors already write (`**bold**`, backticks: 2 in math-exercise, 15 in ctm-demo, 7 in ingmat3a) was shown literally, and the HTML in 35 ingmat3a exercises (`<strong>`, `&nbsp;`, `<br>`, `<code>`) showed as tags | math-exercise → ctm-demo, ingmat3a | AC (18 Oct): no HTML in Markdown, allow some inline Markdown. Fixed: `**bold**`, `*italic*`, backticks and `\*` outside math in the Lua and JS renderers, with a parity test; HTML stays text; ingmat3a's exercise text rewritten in Markdown |
| F-73 | The new course installer rendered the package's own example site, which runs math-exercise author tests and so needs SymPy; ingmat3a's CI has none and its setup failed | ctm-assessment | fixed: `--package-only` build for course installs (2 s, stdlib + PyYAML) |
| F-74 | Review round 6: after the Stop-timer move, a SymPy or package download that never finished in pyodide-interaktiv's worker left Check disabled with no Stop; computed keys such as `1.05*1.9` rounded on binary noise; `variants.py` rounded half to even, so a displayed solution (1/8 → 0.12) could be graded wrong | math-exercise, py-exercise | fixed: timer at the load limit (180 s) during loading; `.15g` decimal rounding; `round`/`sigfig`/`{{x:.Nf}}` round like the checker (no existing variant changes in ctm-demo or the examples); tests |
| F-75 | JSXGraph boards in hidden Quarto tabs or collapsed blocks started in a 0×0 iframe (NaN bounding box); `resizeContainer(w, h)` fixed the container's pixel width, so on a 390 px window boards kept their desktop width and were cut off; keep-aspect boards could be cropped (x −1…13 shown as 2…10) and drifted after desktop → mobile → desktop; `BOARDID` worked only inside `initBoard` (reported from ctm-demo's solenoid figure; reproduced in Chromium) | jsxgraph-quarto (upstream) | fixed on the fork's PR branch: the board code starts when the iframe has a size (an assessment request starts it at once); resizing follows the board's container without fixing it, fits keep-aspect boards with one scale, centred, and keeps views set by board code or the user; JSXGraph's own resize observer off by default; `var BOARDID`. Browser test `integration/feedback/jsxgraph-layout.cjs` (nested tabs, collapsed callout, mobile and back, user view, variant and legacy page code, a board beside a toolbar, hidden assessment); all 38 ctm-demo boards checked; ctm-demo's solenoid workaround removed |
| F-76 | Review round 7 on the inline-Markdown change: `\*` closed emphasis; emphasis could not contain math; `$` in a code span became math; `***x***` was wrong; the closing search was cubic (an 8000-character line rendered in 27 s); `{{` before markup or at a line end started a Quarto shortcode that swallowed the exercise. On the timer change: a SymPy reload during a retry ran under stop-after, and a pyodide-interaktiv worker that never finished starting left Check pending forever | math-exercise, py-exercise, shared runtime | fixed, with tests that fail on the previous code; Lua and JS agree on 1400 random texts; real exercises in three repositories render unchanged |
| F-77 | Backwards compatibility: after webagg, projects that pin `pyodide: base-url: …/v0.27.2/` (the old README's example) got no interactive plots, because WebAgg needs Pyodide 0.28. Separately, an old bug: `build-variant: full` produced `…/v0.27.2/fullpyodide.mjs` and broke the worker | pyodide-interaktiv | fixed: the canvas engine picks the backend from the loaded Pyodide (old frozen backend below 0.28, WebAgg from 0.28); a trailing slash is added; docs and 14 tests |
| F-78 | Course installer: `quarto add` failing left the course without its extensions; a `ctm-assessment` review ref was silently ignored; `--package-only` still assembled the example site and downloaded an asset; build paths were long for Windows; PowerShell 5.1 mangled the JSON review refs | ctm-assessment | fixed: atomic replace with restore, `NAME=SHA` refs, a rejected key, short cache names, docs on full SHAs and `--workspace`; 11 + 9 tests |
| F-18 | Internal checker errors were shown to students as input-spelling hints with „…" quotes in English | resolved by F-02/F-04 |
| PY-7…18, MATH-14…24 | see appendices | mostly fixed; runtime items proposed |

### Info
- F-34: In Quarto 1.8.27 Lua `error()` is replaced by a logger: authoring errors in math-exercise and py-exercise (e.g. "shared feedback requires `#| task:`") were printed but the render exited 0 and wrote a broken page. Proven: the umbrella's scoped-policy test rendered a py-exercise cell without `task` successfully at the old pins and fails now. Fixed by `assert(false, msg)` throughout both filters. **Behaviour change for authors:** documents with such errors now stop rendering with the same message they used to log; noted in both PRs and in the release notes (§7). Not treated as a BC break because the message always said the document was invalid.
- F-40: The first `quarto run` after a Quarto install replaces `~/.cache/quarto/deno_std`; ai-feedback's render tests run in parallel and intermittently failed in CI with "Unable to load run_import_map.json" (2 of 2 runs at 456b5cf/e83824f, 2 of 3 dispatches). Test-only; fixed with a `pretest` warm-up (4 of 4 runs green). Users render serially, so no runtime change.
- F-39: Quarto website projects render nothing inside hidden folders (the umbrella runs component tests under `.feedback-workspace/`); tests that build temporary projects must use `type: default` with an explicit render list.
- PY-21/MATH-25: tests and checkers share the learner's namespace or bypass the parser; acceptable for client-side learning tools, recorded.

## 1b. Audit notes by area (Step 3)

**Loading (3.1).** Which runtime loads where:
- math-exercise preloads Pyodide in the background after `DOMContentLoaded` (after KaTeX is imported), on every page with an exercise; SymPy loads on the first Check.
- py-exercise used to wait for Pyodide *and* Monaco before showing any editor (fixed); it now preloads in the background.
- pyodide-interaktiv starts a worker on any page with a Pyodide cell and immediately loads micropip, pyodide_http and matplotlib. On mixed pages math-exercise and py-exercise reuse that worker through `qpyodideInstance`, so their first check waits for matplotlib. Interactive plots start a second, main-thread Pyodide.
- One instance per page otherwise: all three share `__qExercisePyodide`/`qpyodideInstance`. With pyodide-interaktiv's module scripts executing before `DOMContentLoaded`, the consumers find its promise and do not start a second runtime.
- Before this audit a worker restart left math-exercise and py-exercise broken until reload (F-02/F-03). A failed CDN load left py-exercise broken (F-25). Learner code could break maths grading (F-04). All are fixed and covered by the browser smoke test.
- First visit to a pyodide-interaktiv page: coi-serviceworker registers and reloads the page once (measured in §3).
- Offline: nothing is self-hosted. Pyodide, Monaco, KaTeX, MathJax, Font Awesome and JSXGraph all come from CDNs, so a page works offline only from the browser cache. §3 measures this.
- Per-page cost: the combined example page inlines about 330 KB of extension JavaScript (not cacheable across pages).
- JSXGraph boards are `data:` URL iframes. Each loads `jsxgraphcore` and MathJax 4. §3 counts whether they are cached across boards.

**ai-feedback API and configuration (3.3).**
- The JS API is small and documented (`docs/api.md`): `createClient`/`request`, `attach`, `contextMaterials`, `resolvePolicy`/`applyPolicy`/`explainPolicy`. The headless core has no DOM, editor or Python dependency, and consumers pass only explicit evidence.
- Grading and feedback are separated cleanly. Feedback never executes code and only reuses matching earlier Check evidence. Checker source, expected answers and raw tracebacks are not sent; the integration tests verify this.
- No secrets ship client-side: there are no provider presets, keys are entered by the learner, and keys in metadata were ignored. They now also produce a warning; P2 proposes an error.
- Graceful failure: copy mode works without an account. Errors carry stable codes. Missing/oversized context is skipped with console warnings; a missing JSXGraph context fails visibly in the feedback panel. KaTeX failure keeps readable TeX.
- Weak points found:
  - page-level metadata dropped project settings (F-23, fixed);
  - no validation of option names or values (F-09, now warnings);
  - a Deno subprocess runs on every rendered page (~0.6 s per page; it now uses the running Quarto, F-08);
  - four policy keys where two would do (P2);
  - the key is persisted in localStorage by default (P3);
  - the integration list exists in three languages (consolidation step 4);
  - the version gates differ per consumer (0.5, 0.6, 0.8; P6/step 4);
  - copy-mode prompts include the full system prompt (fine, documented).
- Versioning: the extension is now 0.8.1, and the HTML dependency version comes from `_extension.yml`. The request API has `version: 1`; P2(c) adds a config schema version.

**Duplication and modularity (3.4).** See §4 and Appendix C.

**JSXGraph (3.5).**
- Rendering: boards render in sandboxed `data:` iframes. A board in a hidden tab or a collapsed exercise is refreshed by the bridge's `layout` message and on iframe resize. The umbrella browser test confirms the triangle/circle/square boards draw, grade and export images for feedback.
- Theme: the iframe content and the exported PNG are always white-background. In dark mode the board stays light; that is acceptable and noted.
- Assessment: math-exercise and ai-feedback each implement the bridge client (two diverged copies, consolidation step 6).
- Feedback context: diagram image and state are sent as `context`, never as the learner's response; a 1 MiB state limit applies.
- Risks found:
  - unpinned CDN versions (F-38, fixed upstream-side on the fork branch);
  - MathJax loaded in every board even without math (P7);
  - the vendored copy in math-exercise could not do static export (no `resources/`), now removed.

**Examples (3.6).** Appendix A (mathematics: 31 findings) and Appendix B (Python/Pyodide/plain text: 24 findings). Every randomised variant was enumerated and verified with SymPy; every checker was executed with correct and wrong answers along the browser path.

## 2. Dependency map

| Component | Required | Optional (feature → install) | Browser runtime (from jsDelivr unless noted) | Declared Quarto | Standalone without optional deps |
|---|---|---|---|---|---|
| **ai-feedback** 0.8.1 | — | provider endpoint (direct mode) | KaTeX 0.16.11 (lazy, only when a reply contains math) | ≥1.8.27 | works (copy mode needs nothing) |
| **math-exercise** | — | Feedback → ai-feedback (`feedback: auto` default); graphical answers / diagram context → jsxgraph/jsxgraph-quarto ≥1.1.0 | Pyodide 0.27.2 (preloaded at page load), SymPy 1.13.3 (first Check), KaTeX 0.16.11; `packages:` e.g. networkx 3.4.2 (pulls numpy + matplotlib in Pyodide 0.27.2) | ≥1.4.549 (tested 1.8.27) | **now** renders without ai-feedback (message), fails with an install message for JSXGraph references |
| **py-exercise** | — | `feedback: true` → ai-feedback; shared runtime with pyodide-interaktiv | Pyodide 0.27.2, Monaco 0.46.0 | ≥1.4.549 (tested 1.8.27) | works; `feedback: true` without ai-feedback stops with an install message |
| **pyodide-interaktiv** (feature branch) | ai-feedback **unless** `pyodide: feedback: false` (default true) | — | Pyodide 0.27.2 in a worker + micropip, pyodide_http, matplotlib at start; Monaco 0.46.0; Font Awesome 6.5.1 JS kit (cdnjs); coi-serviceworker | ≥1.4.549 | needs ai-feedback by default (clear message) — proposal P1 makes it auto |
| **JSXGraph** (upstream) | — | Node + puppeteer/playwright only for static SVG export | jsxgraphcore + css (now pinned 1.13.3 on the fork branch), MathJax 4 in every board iframe | ≥1.3.0 | works |
| **ctm-assessment** (umbrella) | bundles all of the above at pinned commits | — | — | ≥1.8.27 | n/a |

How the umbrella delivers components: it **bundles** one copy of each in `ctm-assessment.tar.gz` (published on the example site), at the commits pinned in `integration/feedback/repos.json`, tested together; `resolved-repos.json` inside the archive records commits and per-file SHA-256. Filter order: ai-feedback, JSXGraph, math-exercise, py-exercise, pyodide-interaktiv. Standalone installs go under `_extensions/Erasmus-CTM/…` and the umbrella keeps using its own set (tested). Python-side build dependencies: PyYAML (variants, defaults sync), SymPy 1.13.3 + NetworkX 3.4.2 for authored checker tests. CI coverage: umbrella install (archive test incl. side-by-side copies); math-exercise standalone with and without ai-feedback/JSXGraph (`tests/standalone-dependencies.test.mjs`); py-exercise with/without feedback (verified locally; py-exercise CI renders with ai-feedback installed); ai-feedback alone.

## 3. Pyodide loading measurements

**Setup.**
- **Where:** GitHub Actions, ctm-assessment PR #11, run at `f37f6d7`, with the components pinned at the PR heads.
- **Browser:** headless Chromium, service workers blocked (except in one scenario).
- **Profiles:**
  - *fast*: the runner's own network.
  - *slow*: emulated 150 ms latency, 1.6 Mbit/s down (a congested 4G or home Wi-Fi line).
- **Runs:** fast: median of 2 runs; slow: 1 run.
- **What is timed:** seconds from navigation until:
  - *controls*: the first Check click takes effect;
  - *graded*: the first result appears (correct answer).
- **Cache:** *cold* is an empty browser cache; *warm* is a second visit.
- **Offline:** network cut after a visit.
- **Script:** `integration/feedback/loading-timing.cjs`. Raw annotations are in `code/loading-timing-2026-10-18.txt`.

**Runtime alone (Pyodide 0.27.2 / 0.28.3, both ship SymPy 1.13.3)**

| Step | fast, cold | fast, warm | slow, cold (0.27.2) |
|---|---|---|---|
| Interpreter | 1.6 s | 1.6 s | 28.4 s |
| + SymPy | 5.5 s | 5.4 s | 51.2 s |
| + NetworkX | 2.3 s | 1.9 s | 57.8 s |
| + matplotlib | 1.0 s | 1.0 s | 1.4 s |
| Downloaded | 20.4 MB (0.28.3: 23.4 MB) | 0 | 20.4 MB |

**Pages (Pyodide 0.27.2)**

| Page | Profile | Controls cold / warm | Graded cold / warm | Offline graded | MB cold (Pyodide) |
|---|---|---|---|---|---|
| math-exercise alone | fast | 0.5 / 1.7 s | 5.6 / 5.4 s | 5.4 s | 10.2 (9.1) |
| math-exercise alone | slow | 6.5 / 1.7 s | 57.3 / 5.2 s | — | 10.2 (9.1) |
| py-exercise alone | fast | 2.0 / 1.9 s | 2.1 / 2.0 s | 2.0 s | 7.1 (5.3) |
| 4 JSXGraph boards + 1 math exercise | fast | 0.8 / 0.8 s | 6.1 / 6.0 s | 6.0 s | 11.3 (9.1) |
| Combined example, Python exercise | fast | 1.3 / 1.3 s | 6.6 / 6.3 s | 6.2 s | 19.8 (15.3) |
| Combined example, mathematics | fast | 1.4 / 1.3 s | 10.1 / 9.4 s | 9.6 s | 23.6 (19.1) |
| Combined example, first visit with service worker | fast | 1.7 s | 10.9 s (one reload) | — | — |

**What this means**
- **The wait is computation, not download.** The SymPy import costs about 5.5 s whether the cache is cold or warm, and offline is as fast as warm. Caching saves bytes (10–24 MB per page), not time.
- **First math check:** about 5.5 s on a good line alone and about 10 s on the combined page, where pyodide-interaktiv's worker also loads matplotlib and its own packages. On a slow line the first check takes about 1 minute, almost all of it the SymPy download.
- **py-exercise** needs no SymPy: about 2 s to the first result.
- **Every page works offline after one visit.**
- **math-exercise alone, warm controls 1.7 s against 0.5 s cold.** The likely cause: with a warm cache, Pyodide arrives at once and its start on the main thread delays the click handler. Not proven; it supports P16 drawback 1.
- **Consequences, already applied:**
  - `stop-after` (20 s) no longer counts loading time; on the slow line it would have offered Stop during the download.
  - The 180 s load timeout leaves enough margin on the slow line (57 s).
- **Pyodide 0.28.3** behaves the same and downloads 3 MB more. There is no reason to move now.

**F-66 (measurement probe) was fixed before these runs.** The earlier run timed out on every math scenario because the probe waited for a property only generated-variant cells have.

## 4. Duplication inventory and consolidation plan

Full inventory with locations, sizes, canonical copies and divergence: [Appendix C](appendix-C-duplication-inventory.md) (11 byte-identical groups; the riskiest items are *diverged* copies, where a fix landed in one place only).

**Done during the audit** (no change to public behaviour; one install path removed, see F-70): the vendored JSXGraph extension is gone (math-exercise, umbrella); the dead stale `loadScript` copy in math-exercise is gone; where a fix touched duplicated code every copy was fixed and recorded: `feedback-loader.lua` (3 copies, identical change), py-exercise's Pyodide loader (retry fix ported from math-exercise's shared runtime), math-exercise's Lua/JS task renderers (escaped-dollar rule aligned, parity test added). No new duplication was introduced.

**Round 3 (AC's comments, 18 Oct):**
- py-exercise's reimplemented Pyodide loader is replaced by a **byte-identical copy** of math-exercise's `shared/pyodide-runtime.js`. That file now also holds the private-module installer, the interpreter-state guard (`_ctm_guard`) and the Stop helpers. The package build fails if the copies differ.
- The shared `feedback-loader.lua` became the one **dependency locator** for ai-feedback and JSXGraph. math-exercise's own JSXGraph directory walk is gone.
- Deliberate copies: `feedback-loader.lua` ×3, `pyodide-runtime.js` ×2 (+ stack-sympy's pinned vendor copy), `review-dependencies.py` ×6, and **pyodide-interaktiv's shipped `_extensions/ai-feedback`**. That last one is temporary, generated by `scripts/sync-ai-feedback.py`, checked against its recorded commit in CI, and ignored by the package. It exists so old pyodide-interaktiv projects build unchanged; it is to be revisited with the team members who maintain pyodide-interaktiv (P14).

**Consolidation plan (separate job, needs approval — dependency and install-path changes):**

| Step | Moves | New home | Dependency change | Install / BC impact |
|---|---|---|---|---|
| 1 | Pyodide bootstrap + shared-instance protocol (`pyodide-runtime.js`, py-exercise's fork, the version constant ×6), `loadScript`, Monaco loader and Python-editor factory (with pyodide-interaktiv's EOL/theme fixes), KaTeX/MathJax loaders with one typeset queue, `escapeHtml`, language resolution and generic UI strings (adds `nb` to py-exercise), safe storage/autosave, worker-RPC | **`ctm-runtime`** (new Quarto extension: classic scripts + one Lua module; Erasmus-CTM) | math-exercise, py-exercise (and later pyodide-interaktiv, stack-sympy) depend on it | Umbrella: bundled, no change for users. Standalone: one more `quarto add Erasmus-CTM/ctm-runtime`; missing → render message (same mechanism as ai-feedback). Old pages keep working because the globals contract (`mainPyodide`, `qpyodideInstance`, `__qExercisePyodide`) stays |
| 2 | Single vector/matrix/dynamic-matrix renderer (removes the Lua twin) + `matrix-input.{js,css}` | `ctm-runtime/ui` (or `ctm-math-input`) | math-exercise, stack-sympy | none for authors (same syntax and HTML) |
| 3 | `_filters/example-source.lua` ×5 (3 generations) + `example-site.css` + rendered-site audit | **`ctm-docs`** (new, documentation tooling only) | example sites of every repo | none for course authors (examples only) |
| 4 | Extension locator + one minimum-version gate (Lua and `AIFeedback.requireVersion`), `AIFeedback.mount()` adapter skeleton, a JS test loader for the runtime, the integration list generated from `feedback-defaults.yml` | **ai-feedback** (existing) | consumers shrink to a ≤5-line bootstrap | none |
| 5 | The ~345-line Python checker library embedded as a JS string array (`assess_basis`, `graph_from_response`, numeric/form helpers, result contract) and the authored-test runner | **`ctm_checkers`** Python package, bundled for Pyodide like stack-sympy's `bundle_runtime.py` | math-exercise; stack-sympy instead of vendoring `assess_basis` | none for authors; removes the regex extraction in `question-tests.py` |
| 6 | Assessment-bridge client (`requestExternalResponse` / `collectVisualContexts`, two diverged copies) | upstream **jsxgraph-quarto** `assessment-client.js` next to its server half (fallback: `ctm-runtime`) | math-exercise, ai-feedback | none |
| 7 | `review-dependencies.py` ×5, the CI step ×12, toolchain pins (Quarto, Python, SymPy, Pyodide) | **`ctm-ci`** (new repo of reusable actions/workflows) | all repos' CI | none for users |

Migration order follows risk: 1 (fixes real divergence) → 2 (removes a class of render bugs) → 4 → 3 → 5 → 6 → 7. Each step: create the home, switch consumers in one PR each, pin the new package in the umbrella, keep old globals/paths as aliases for one release, then delete. Keep per repo: `LICENSE` texts, domain locale strings, domain request builders.

## 5. Backwards-compatibility proposals (need AC's approval)

Not implemented. Each needs a decision; bold where I recommend acting before the release.

- **P1 — DECIDED by AC (18 Oct), implemented:**
  - pyodide-interaktiv keeps feedback on by default and ships ai-feedback (P14);
  - py-exercise keeps `false` and loads ai-feedback only when exercise feedback is on or the page has `.ai-feedback` activities;
  - math-exercise keeps `auto`;
  - a page that uses a missing optional extension stops with the install command.

  The original proposal follows for the record.
- *(superseded)* **one `feedback` switch for all consumers (`auto|true|false`, default `auto`).** Today: math-exercise `auto` (this audit), py-exercise `false`, pyodide-interaktiv `true` (so pyodide-interaktiv *requires* ai-feedback by default). Proposal: pyodide-interaktiv adopts `auto` now (only changes behaviour when ai-feedback is missing: no button + message instead of a render error — safe); py-exercise keeps `false` until 1.0 because `auto` would require `#| task:` on every exercise. Migration: release note; nothing to change for existing pages.
- **P2 — ai-feedback configuration v1.** (a) **Make credential-like keys a render error** (today a warning; a committed key is a leak waiting to happen), unknown keys an error in 1.0. (b) Simplify the four policy keys to two: `policy-files` additive at every level (project, `_metadata`, page) and `policy` selecting (nearest wins); accept `page-policy-files`/`project-policy`/`page-policy` as deprecated aliases for one release with a warning. (c) Add `ai-feedback: {version: 1}` so future schema changes can be detected. Migration: aliases + warnings; a short note in the authoring guide.
- **P3 — API key storage.** The settings dialog stores the personal key in `localStorage` by default (`storage: local`). Proposal: store the key separately with "Remember key on this device" **off** by default (session only), keep mode/base-url/model in local storage. Migration: existing local records are read and offered once.
- **P4 — Consolidation packages** (§4 table): new `ctm-runtime`, `ctm-docs`, `ctm-ci`, `ctm_checkers`. Standalone installs gain one `quarto add`; umbrella users see nothing.
- **P5 — math-exercise grading changes** (Appendix A): `single_fraction` and factored-form checks that accept all valid forms (MATH-2, MATH-14), `lowest_terms` bypass (MATH-11), run `reject` before `form` (MATH-12), opt-in `forbid-calls` and drop `diff`/`integrate` from the student legend (MATH-10), `0.0` coloured as zero (MATH-19), `e` as Euler's number (MATH-22). These change grades of existing exercises → introduce behind an option in 0.9, make default in 1.0; the tested diff is in `code/math-audit/runtime-proposal.diff`.
- **P6 — py-exercise runtime** (Appendix B): show the caption (PY-4), keyword map for async/star forms and a render warning for unsupported keywords (PY-10), clear stale results on edit/error (PY-12), `__name__ == "__main__"` (PY-13), load packages imported by tests (PY-22), one ai-feedback version gate (PY-14). Only PY-10 changes grading (stricter); PY-13 changes behaviour of code that relied on `__main__` blocks not running.
- **P7 — Loading** (pending §3 data): lazy Pyodide start on first interaction vs. today's eager preload; pyodide-interaktiv not loading matplotlib/micropip/pyodide_http until a cell needs them and not starting a second runtime for plots; deliver extension JS as cacheable HTML dependencies instead of ~330 KB inline per page (math-exercise inlines ~110 KB, pyodide-interaktiv ~180 KB); replace the 1.2 MB Font Awesome JS kit (cdnjs) with a few inline SVG icons; JSXGraph: load MathJax only in boards that use it.
- **P8 — Pyodide version.** All components hard-code 0.27.2 (Python 3.12, SymPy 1.13.3). An upgrade changes the SymPy version and therefore grading in edge cases; do it in one place (`ctm-runtime`) with the authored tests and the Pyodide parity harness run against the new version first (data in §3).
- **P9 — DONE (AC's rule: minimum versions, pragmatic minimum = the version fully tested).**
  - Every component declares `quarto-required: ">=1.8.27"`.
  - The build accepts that version or later.
  - `quarto-versions.yml` tests 1.8.27 and the current release.
  - CDN libraries use release lines (KaTeX 0.16, Monaco 0.46, JSXGraph 1, MathJax 4).
  - npm dev dependencies are caret ranges, and Python requirements are minimums (`sympy>=1.13`, `networkx>=3.4`, `PyYAML>=6`).
  - **Kept concrete:**
    - Pyodide 0.27.2: a CDN path needs one version, and it decides the browser's SymPy.
    - CI's native checks use SymPy 1.13.3, the version Pyodide ships, for parity with the browser.
    - The package's commit pins: they are the release record.
  - **BC note:** pyodide-interaktiv users on Quarto < 1.8.27 must upgrade Quarto. The shipped ai-feedback already needed it.
- **P11 — Quarto 1.10 regression (upstream).** Quarto 1.10.19 reads `{math-exercise}`, `{py-exercise}` and `{pyodide-python}` as the languages `math`, `py` and `pyodide`, and renders those pages with Jupyter.
  - The cause is the chunk regex in `languagesWithClasses`; it is still present on Quarto's `main`.
  - Without Jupyter, every CTM page fails.
  - **Workaround:** `engine: markdown` in each page's front matter; in `_quarto.yml` it has no effect. Documented in all four installation guides.
  - **Issue text ready for AC to file:** [quarto-issue-hyphenated-chunks.md](quarto-issue-hyphenated-chunks.md).
  - The release job in `quarto-versions.yml` reports this without failing.
  - Not done: an authoring-syntax change (rename the blocks) — only if upstream declines.
- **P12 — stack-sympy without ai-feedback (later, as AC asked).** stack-sympy has its own, diverged loader, which always requires ai-feedback.
  - **Plan:** replace it with the shared `feedback-loader.lua` (`installed()`, `uses()`, `requireUsed()`, `feedback()`).
  - Give stack-sympy the same `feedback: auto|true|false` switch as math-exercise.
  - Load ai-feedback only when feedback is on or the page has `.ai-feedback` activities.
  - Vendor `pyodide-runtime.js` from the new revision (guard, timeout).
  - Add the package's byte-identity check for its copies.
  - No change for authors; standalone stack-sympy without ai-feedback then renders (no Feedback button, one message).
- **P13 — Python in a worker for standalone py-exercise/math-exercise.** An endless loop (or `9**9**9**9` as an answer) freezes a tab whose Python runs on the page itself; only a reload helps.
  - With pyodide-interaktiv on the page, checks already run in its worker. After `stop-after` seconds (default 20, AC 18 Oct; per component `math-exercise:`/`py-exercise: stop-after:`, or for all components `ctm-assessment: stop-after:`) they offer **Stop** (AC's choice: no automatic kill).
  - **Proposal:** start the shared runtime in a worker as well, through pyodide-interaktiv's worker RPC (consolidation step 1).
  - An optional `#| timeout:` per exercise could then stop automatically.
- **P14 — pyodide-interaktiv's shipped ai-feedback (temporary, AC 18 Oct).**
  - **Why:** the usual `quarto add Erasmus-CTM/pyodide-interaktiv` installs it too, so projects made for 1.6 build unchanged with feedback (tested with a 1.6-style fixture).
  - **How it is kept honest:** the copy is generated and CI-checked.
  - **Next:** discuss with the team members who maintain pyodide-interaktiv; their users' old projects must keep building. Alternatives: a release archive like the package's, or `quarto add Erasmus-CTM/ai-feedback` in their install instructions with the render message as the safety net.
- **P15 — math-exercise: numeric screening before `simplify` (F-67).**
  - **Problem:** `mode: equivalent` decides with symbolic simplification. It can run out of time or memory, and keys with float coefficients reject exact equivalents.
  - **Proposal:**
    - First evaluate the difference at a few random points of the declared variables. Large, consistent differences are wrong without calling `simplify`. Differences within float noise (relative 1e-9) count as equal when the key contains floats.
    - Cap `simplify` with a step budget; on overflow, report "could not decide" instead of freezing.
  - **Why a proposal:** the grading semantics change for float keys (some answers now graded wrong would pass). The authors should agree.
  - ctm-demo is fixed in its content meanwhile: numeric mode for numeric quantities, exact or sampled checks for decimal keys.
- **P16 — Load Python at page load, with one shared status lamp (AC 18 Oct, for the proposals round).**
  - **Today:**
    - pyodide-interaktiv starts its worker at page load and shows the status in the title block.
    - math-exercise and py-exercise start only the interpreter at page load, on the page's main thread when standalone. SymPy and the exercise's packages load on the first Check, with no indicator.
    - stack-sympy validation waits for Python on first use.
  - **Measured (§3, CI fast profile):**
    - SymPy import about 5.5 s, the same cold or warm: it is computation, not download.
    - First graded math check 5.6 s alone, 10 s on the combined page.
    - Slow network: SymPy 51 s, first check 57 s.
  - **Drawbacks of loading everything at page load:**
    1. **Freeze without a worker.** On standalone math/py-exercise pages Python runs on the main thread. Importing SymPy at page load would freeze typing, buttons and JSXGraph dragging for about 5–7 s right after the page appears; on slow devices longer. Today that wait happens after Check, where the learner expects it. So eager loading needs P13 (worker) first.
    2. **Data and battery.** 10–20 MB and several CPU seconds per page view, also for readers who never check anything. Each navigation in a multi-page site repeats the import: the cache saves bytes, not the import time.
    3. **Slow networks.** The download competes with MathJax, JSXGraph and images, so text and figures appear later.
    4. **Restart.** After Stop, everything loads again. The lamp must show that, and Check must still wait for it.
  - **Proposal (one implementation, in the shared loader `pyodide-runtime.js`):**
    - **Package list from the build.** Each filter writes the packages its blocks need (SymPy, `#| packages:`, imports it can see) into a page-level list. The runtime loads their union once.
    - **When loading starts:** `ctm-assessment: python-preload: idle | interaction | check`, overridable per component.
      - `idle`: after the page's `load` event, when the browser is idle.
      - `interaction`: on the first focus in an answer field or editor, so typing overlaps the load.
      - `check`: as today.
    - **Default:** `idle` when Python runs in a worker (pyodide-interaktiv on the page, or after P13); `check` when it runs on the page itself (drawback 1).
    - With `navigator.connection.saveData` set, always `check`.
    - **One page-wide lamp:** not started, loading (with stage), ready, failed, restarting. It is placed once per page, not per exercise, with an `aria-live` text and en/de/nb labels. Components read its state through the runtime. pyodide-interaktiv's status line can become this lamp, or show it.
    - stack-sympy's validation uses the same runtime and lamp (with P12).
    - **Measurement before deciding the default:** extend `loading-timing.cjs` with time to ready and main-thread long tasks for each mode.
  - **Not BC-breaking.** Pages behave as today unless the default changes; that change is the decision for the round.
- **P17 — `ctm-ui`: one shared UI layer, with saved inputs and a progress panel (AC 18 Oct, for the proposals round).**
  - **Today, four designs, no shared one:**

    | Component | What is kept in the browser | Opt-in | Key |
    |---|---|---|---|
    | py-exercise | learner code, always (`localStorage`); Reset clears it | no, always on | `pyex\|<path>\|<label>` |
    | pyodide-interaktiv | cell code, never run automatically; learner can switch it off in the settings gear | `pyodide: local-storage: true`, per cell `#| local-storage:` | path + label, or a hash of the original code |
    | math-exercise | only the chosen variant (`sessionStorage`); answers are lost on reload | — | pool key |
    | ai-feedback | its settings (local or session) | learner's choice | `CONFIG_KEY` |
    | stack-sympy | not audited (P12) | | |

    No component keeps marks. pyodide-interaktiv's design (stable cell identity, never run on restore, learner switch) is the most complete and is the model below.
  - **What `ctm-ui` would hold** (one package, located like ai-feedback through the shared loader):
    - the common button variables (now copied as defaults into each package's CSS, AC 18 Oct);
    - the settings gear (today separate in ai-feedback and pyodide-interaktiv);
    - the Python status lamp (P16);
    - the store and the progress panel below.
  - **Saved inputs**
    - **Design:** components register each exercise with the store: `register(component, id, {read, write, clear})`. The store handles keys, versions, the opt-in, the learner's switch and Reset.
      - One record per exercise: `{v: 1, saved, source-hash, variant, inputs, result}`.
      - Key `ctm|1|<site base path>|<page path>|<exercise id>`. The site base path matters on shared origins: all `<user>.github.io/*` sites share one `localStorage`.
    - **Opt-in per page or project:** `ctm-assessment: save: inputs | progress | none`, overridable per component and per exercise. Default `none`, except for the two components that save today:
      - py-exercise keeps saving code by default, for backwards compatibility;
      - pyodide-interaktiv keeps `local-storage`.
    - **Restore:** restored inputs fill the fields, never run Python and never re-check. A saved result is shown as "last result", greyed until checked again.
    - **Author changes:** each record stores a hash of the exercise source. If the exercise changed since saving, the inputs are offered, not filled in ("This exercise has changed; restore your answer?").
    - **Stable ids:** labels are required when saving is on. A missing or duplicate label stops the render, with the same mechanism as the missing-extension errors. Without a label, pyodide-interaktiv's hash fallback applies.
    - **Migration:** existing `pyex|…` and qpyodide keys are read once and moved.
  - **Progress panel ("like a Moodle quiz navigation")**
    - **Common event:** every graded check sends `ctm:result` `{component, id, label, score 0–1, status}`.
      - math-exercise: field and total score.
      - py-exercise: tests passed / total.
      - stack-sympy: its score (with P12).
      - pyodide-interaktiv cells are not graded and do not appear.
    - **Build-time list:** each filter writes the page's exercises (id, label, title, optional `#| marks:`, default 1) into a page manifest. The panel therefore shows every exercise from the start, also before Python loads, and works on mixed pages.
    - **Panel:** one tile per exercise, green (correct), yellow (partial), red (wrong), grey (not tried); a click scrolls to the exercise. It shows the page total, and the tiles have text labels and `aria` names (not colour alone).
      - Placement option: the right margin under the table of contents (Quarto's sidebar) or a floating button on narrow screens.
      - Opt-in per page: `ctm-assessment: progress: true`.
    - **Persistence:** with `save: progress` the tiles survive reload; otherwise they last for this visit.
    - **Quizzes: grouping exercises (AC 18 Oct).** In ingmat3a the "Moodle quizzes" are Quarto tabs, e.g. page2 has tabs 1.0–1.3 from `_includes/module1/m1_*.md`. Tabs nest, though: m1_1 has a tabset inside a tab, so "one panel per tab" has no single meaning. Options:
      1. **Per tab, automatically.** Nothing to write, but which tabset level counts is ambiguous, and moving content between tabs silently moves it between quizzes. Not recommended as the only way.
      2. **A wrapping div `::: {.ctm-quiz}`.** Explicit, but it adds a nesting level around tabsets, and a missing `:::` silently swallows the rest of the page ("runaway"). Not recommended.
      3. **A tag on each exercise: `#| quiz: m1-2`.** Flat, works across tabs and includes, and an exercise can be moved freely. The risk is typos; repeating the tag on every exercise is tedious.
      4. **A heading attribute: `## 1.2 Binære tall {quiz=m1-2}`.** Every exercise in that heading's section belongs to the quiz, including subsections and nested tabs, until the next heading of the same or a higher level. Quarto tabs are headings, so this matches how ingmat3a is written, and there is no extra nesting: Pandoc delimits sections exactly.
    - **Recommendation: 3 and 4 together, with a declaration.**
      - The page front matter lists its quizzes: `ctm-assessment: quizzes: {m1-2: {title: "1.2 Binære tall"}}`.
      - Headings assign whole sections (4).
      - `#| quiz:` on an exercise overrides its section's quiz, or `#| quiz: none` leaves it out.
      - Exercises without a quiz form the page group when `progress: true`.
      - **Build checks** (render errors, as for missing extensions):
        - an undeclared quiz name, which catches typos;
        - a declared quiz with no exercises;
        - an exercise in two quizzes.
      - **Panel placement:** at the top of the quiz's section or tab by default, or where `{{< ctm-progress m1-2 >}}` puts it. An optional margin overview lists all quizzes of the page.
      - A tile click opens the tab that holds the exercise, including nested tabs, before scrolling.
  - **Alternatives considered**
    1. **Each component saves on its own:** today's state. It duplicates code and gives four different behaviours. Rejected.
    2. **IndexedDB instead of `localStorage`:** asynchronous and larger, but nothing here needs more than a few KB per page. `localStorage` with a versioned record and an in-memory fallback is enough.
    3. **Server-side tracking** (LMS, LTI/xAPI, Moodle with STACK): the right place for marks a teacher relies on; needs accounts and a backend. Out of scope. The `ctm:result` event is the hook for a later adapter.
    4. **Export/import of a learner's record (JSON):** small; covers device changes and "send my progress to the teacher". py-exercise already has a download.
    5. **Site-wide progress across pages:** possible from the stored keys and a build-time list of pages. Phase 2.
  - **Limits, stated in the docs:**
    - Marks are kept in the learner's browser and can be edited there (Appendix D). Fine for self-study, not for grading.
    - Clearing browser data loses them.
    - On shared computers, the learner's switch and "clear this page" matter.
  - **BC:** none for authors. Saving and the panel are opt-in, and the two components that save today keep their defaults. Once `ctm-ui` exists, it is a declared dependency: a page that asks for `save`/`progress` without it installed stops with the install command.
- **P18 — No HTML in Markdown: lecture mode, learning mode and reveals as library features (AC 18 Oct; part of `ctm-ui`, P17).**
  - **Today:**
    - **Prose HTML:** ingmat3a has 495 HTML elements in its Markdown prose and ctm-demo 409:
      - `<details class="reading-step|solution-block|learning-hint">` with `<summary>`;
      - the lecture/learning mode switch (`<div class="learning-mode">` with `<button aria-pressed>` and a status line);
      - figure slots (`<div id=…>`, filled by JavaScript);
      - two `<iframe>`s.
    - **Copied site code:** both course repos carry their own copies of `_includes/site/learning-mode.html` (44/45 lines) and `tab-links.html` (108/109), which differ by one line each. That is cross-repository duplication.
  - **Proposal:** `ctm-ui` provides these with Markdown syntax: a Lua filter writes the HTML and the package ships the script and CSS.
    - **Reveals:** `::: {.reading-step summary="…"}`, `::: {.solution summary="…"}` and `::: {.hint}` replace `<details>`/`<summary>`. Solutions stay excluded from the AI context, as today.
    - **Lecture/learning mode:** `ctm-assessment: modes: [lecture, reading]` in front matter, or `::: {.learning-mode}`. The filter writes the switch, its status line and the labels (en/de/nb); the course writes no buttons.
    - **Deep links to tabs:** `tab-links.html` becomes a library feature. P17's progress panel needs the same ability to open nested tabs.
    - **Figure slots:** `::: {#week5-graph .ctm-figure}` (a fenced div with attributes) instead of `<div id>`; iframes through a `{{< ctm-embed … >}}` shortcode.
    - **Migration:** a script converts the existing HTML to the new syntax in both courses. Rendered pages are compared before and after, as in §9.
  - **BC:** none for authors who don't use it. The courses migrate in one commit each.
- **P19 — AI-feedback context: explicit context also sends the section's prose (found in ingmat3a).**
  - **Today:**
    - With `#| context: id`, only the listed blocks are sent; the prose between the heading and the exercise is dropped.
    - Without it, the prose is capped at its last 1500 characters.
  - **Effect:** in about 25 ingmat3a exercises the prompt lacks the task's data (matrices B and C, x = 12.345, the iteration table). The published site behaved the same.
  - **Proposal:** in explicit mode, send the listed blocks in addition to the section prose; the docs already describe explicit context as being for context "outside the current section". Raise the cap or count it in characters of the exercise's own section only.
  - **Course side (no component change):** wrap each data paragraph in a `.math-exercise-context` block and list it. That adds visible grey boxes, so it is the author's choice.
- **P20 — One product for authors: CTM Assessment (AC 18 Oct; replaces P4's packaging; P16–P18 become parts of it).**
  - **Principle:** judged from the course author's side. An author installs, configures and reads about one thing. Internal libraries exist for maintainers only.
  - **Install:**
    - one command, one filter (`filters: [ctm-assessment]`), one version number;
    - the internal libraries (`ctm-libs`: Pyodide runtime, dependency locator, shared UI, and **ai-feedback folded in**; `ctm-checkers`: the Python checker library) are bundled and never named in an author's project;
    - standalone component installs stay possible for advanced use.
  - **Configuration:** shared options under `ctm-assessment:` (stop-after, python-preload, save, progress, feedback defaults, language); component keys only for component-specific options. `ai-feedback:`, `pyodide: feedback`, `math-exercise: stop-after` etc. keep working as aliases with a deprecation note.
  - **Documentation:** one guide with one reference; components' pages become sections. The functions available in `#| checker:` are documented as the visible part of `ctm-checkers`.
  - **One look and vocabulary:** ctm-ui (P17/P18); en/de/nb everywhere, including py-exercise; the same words for Check, Stop and Feedback.
  - **Maintainer side (not visible to authors):**
    - docs and CI tooling (P4 steps 3 and 7) become folders in ctm-assessment, not packages;
    - whether the own components move into one repository is a separate decision.
  - **For authors:** no version-mix errors (F-61 class); one upgrade; one place to read; settings set once; consistent pages.
  - **Against, and mitigations:**
    - Upgrades are all-or-nothing, including grading changes. Grading-affecting changes go behind an option first and are flagged in the changelog (P5); a course can pin a release for a semester.
    - Standalone use (only Python cells, only feedback activities) gets a larger install. Pages still load only what they use.
    - pyodide-interaktiv's existing users: their projects must keep building (P14 until the team agrees).
    - Renamed YAML keys: aliases avoid breaks, but two spellings coexist for a while.
  - **ai-feedback retires quietly as a separate extension (AC 18 Oct); its functionality moves into ctm-libs.**
    - **Why the cost is small:** pyodide-interaktiv's shared-feedback integration is not merged yet, and math-exercise has three users.
    - **Kept:**
      - `.ai-feedback` activities and per-exercise options;
      - the settings dialog and its browser storage keys (students keep their API setup; legacy settings stay importable);
      - teaching-policy files and the build-time policy reader;
      - `ai-feedback:` options, read as an alias under `ctm-assessment:`.
    - **Removed:**
      - the repository (archived, with a pointer) and its install command;
      - the version-mix and minimum-version machinery;
      - the "install ai-feedback" messages.
    - **Timing:** fold before pyodide-interaktiv's stacked PR is reviewed, so that team integrates once, with ctm-libs; P14's shipped copy then goes.
    - **Migration:** a project listing `ai-feedback` in `filters` gets one clear message to remove it.
  - **stack-sympy:** authors already mix it with math-exercise and py-exercise on one page (shared interpreter, feedback, lamp, progress), so it becomes a component of the product, on ctm-libs and ctm-checkers.
    - Its STACK semantics (answer tests, any Moodle STACK compatibility) live in ctm-checkers as their own module, so shared code never changes how a STACK question grades.
    - Whether math-exercise and stack-sympy merge into one math-question component, with STACK compatibility as a mode, is decided after stack-sympy's own audit (with P12).
- **P10 — pyodide-interaktiv `error()` in top-level filters** and the remaining items for the members maintaining it (F-13, F-14): reported in its PR, not changed.

## 6. stack-sympy impact

stack-sympy was not changed. Checked against every change in this audit:

| Change | Effect on stack-sympy |
|---|---|
| ai-feedback 0.8.1 (settings merge, warnings, `cli_path`, version from `_extension.yml`) | Its loader requires ≥0.8 by parsing `_extension.yml` and checks `selection`/`prepare`/`context`/`markCallout`: 0.8.1 passes, the Lua API is unchanged. Its CI pins ai-feedback `68abb6d`; when it moves to 0.8.1 it gains the settings fix. New render warnings would appear only for unknown/credential keys in its own YAML (none found). |
| `feedback-loader.lua` sibling preference (math/py/pyodide) | stack-sympy has its own diverged loader without it: a project with the umbrella **and** a separately added ai-feedback **and** stack-sympy still stops with "Multiple ai-feedback installations". Fix when it joins consolidation step 4 (one locator in ai-feedback). |
| math-exercise runtime (`math-exercise.js`) | `vendor/pyodide-runtime.js` and `vendor/matrix-input.*` are untouched, so the vendored copies stay byte-identical. `assess_basis` is unchanged (its function hash still matches); `basis-helper-provenance.json` records source `5945f8f` as history and stays valid. |
| JSXGraph removed from math-exercise / pinned upstream | stack-sympy does not use JSXGraph. |
| SymPy pin 1.13.3 in math-exercise and the umbrella | stack-sympy already pins 1.13.3 for Pyodide parity; the stacks now agree. |
| Quarto `error()` vs `assert` (F-34) | stack-sympy's loader ends with `error(...)` called from a top-level filter; check whether a missing ai-feedback actually fails its render (its test at `tests/test_render.py:310` covers the version gate, which uses `assert`). |

## 7. Pull requests and branches left for AC

**Open PRs (not merged; all from `audit/2026-10`):**

| Repository | PR | Base |
|---|---|---|
| Erasmus-CTM/ai-feedback | https://github.com/Erasmus-CTM/ai-feedback/pull/18 | `main` |
| Erasmus-CTM/math-exercise | https://github.com/Erasmus-CTM/math-exercise/pull/21 | `main` |
| Erasmus-CTM/py-exercise | https://github.com/Erasmus-CTM/py-exercise/pull/6 | `main` |
| Erasmus-CTM/pyodide-interaktiv | https://github.com/Erasmus-CTM/pyodide-interaktiv/pull/4 | `feature/shared-feedback-integration` |
| Erasmus-CTM/ctm-assessment | https://github.com/Erasmus-CTM/ctm-assessment/pull/11 | `main` |
| aacchhee/ctm-demo | https://github.com/aacchhee/ctm-demo/pull/6 | `main` |
| aacchhee/ingmat3a_ntnu | https://github.com/aacchhee/ingmat3a_ntnu/pull/12 | `main` |
| jsxgraph/jsxgraph-quarto (upstream) | **for AC to open:** https://github.com/jsxgraph/jsxgraph-quarto/compare/main...aacchhee:jsxgraph-quarto:audit/2026-10 | `main` |

**Release order** (also in the ctm-assessment PR):
0. **JSXGraph:** open the upstream PR (compare link above). The umbrella pins the fork's commit, which upstream serves; after the merge, pin the merge commit and give math-exercise's CI the new release tag (`jsxgraph-ref`, default v1.1.0).
0. **ingmat3a stays as it is until this work is released (AC 18 Oct).** It installs math-exercise `main` and JSXGraph from math-exercise's `_extensions/jsxgraph` (F-70), so merging math-exercise into `main` changes ingmat3a's next build. Either merge math-exercise only together with ingmat3a's repointing, or first pin ingmat3a's two math-exercise entries to today's `main` commit. When ingmat3a is repointed, update `quarto-extensions.yml` and `scripts/setup.py`:
   - JSXGraph from `jsxgraph/jsxgraph-quarto`;
   - pyodide-interaktiv from the stacked branch below;
   - ai-feedback as its own entry.

   Other course repositories that install `_extensions/jsxgraph` from math-exercise need the same change.
1. Merge ai-feedback, math-exercise and py-exercise into `main`, keeping their commits.
2. **pyodide-interaktiv, as stacked PRs (AC 18 Oct): `issue-1-webagg` first (it fixes a serious issue), then `feature/shared-feedback-integration` on top of it, then this audit PR.**
   - **State:** webagg is 11 commits ahead of `main` and 4 behind. The feature branch is 16 ahead of `main` and does not contain webagg. PR #4 targets the feature branch.
   - **Trial stack:** main → webagg → feature → audit, done in a scratch worktree, nothing pushed.
     - Conflicts appear only in `_extension.yml` (version/author), `README.md` (the feature branch rewrites it) and `qpyodide-styling.css`. The CSS conflict is additive: WebAgg toolbar rules next to the feedback-gear rules, so keep both.
     - Result: the 28 package tests pass, `plots_test.qmd` (webagg's regression page) renders, and the 1.6-project fixture is in the test set.
   - **Version clash:** webagg is 1.7.3 and the feature branch 1.7.0. The stacked release needs a higher number, e.g. 1.8.0, with `quarto-required: ">=1.8.27"` from the audit branch.
   - **Steps:**
     1. Merge webagg into `main` (bring in `main`'s 4 commits first).
     2. Rebase or merge the feature branch onto it, and retarget PR #4 if the team wants it on top.
     3. Re-sync the shipped ai-feedback to the merged ai-feedback commit (`scripts/sync-ai-feedback.py`).
     4. Merge.
   - **Not tested here:** WebAgg plots in a real browser (the offline harness has no matplotlib). Webagg's own CI covers them.
3. In ctm-assessment's `repos.json`, set the branches back to `main` (pyodide-interaktiv: the feature branch). Run `--update-pins`, then `--test --browser`, and merge.
4. Point ctm-demo back at `ctm-assessment` `main`: drop the review-refs trailer. Set ingmat3a's `quarto-extensions.yml` ref to `main` (its PR pins the audit commit).

**Upstream Quarto issue** (AC to file): [quarto-issue-hyphenated-chunks.md](quarto-issue-hyphenated-chunks.md).

**Branches to delete after merging** (this session cannot delete remote branches):
- `audit/2026-10` in ai-feedback, math-exercise, py-exercise, pyodide-interaktiv, ctm-assessment, ctm-demo, ingmat3a_ntnu and the fork aacchhee/jsxgraph-quarto.
- Stale branches found during the audit (check before deleting):
  - math-exercise: `demo`, `feature/ai-feedback-context`, `feature/vector-matrix-input`
  - py-exercise: `extension`, `lti`, `testing`
  - pyodide-interaktiv: `test-localstorage`. **Keep `issue-1-webagg`:** ingmat3a pins it (`quarto-extensions.yml`).
  - ctm-demo: `feature/stack-build-time-variants`, `update/ctm-assessment-shared-feedback`

**Reviews:** five independent rounds (fresh reviewers, highest effort). Round 5 had one finding (py-exercise retry on non-English pages), now fixed with a test.

## 8. ctm-demo (Step 5)

**Audit of every example** against the PR branches. The scripts are kept with the audit's working folder; the results are summarised here.
- **math-exercise:**
  - 172 blocks with 388 answer fields. Each answer was recomputed independently in SymPy and graded with the real checker code, replayed in CPython. Key cases were confirmed in real Pyodide 0.27.2.
  - All 11 custom checkers.
  - All 325 generated STACK variants.
- **Boards and Python:** 39 JSXGraph boards (jsdom, JSXGraph 1.13.3); the Python cells and the numbers quoted in the text; the help page's py-exercise.
- **Render:** full site and `--profile review` with Quarto 1.8.27.

**Found and fixed in ctm-demo** (8 commits, author AC):
- **High.** 11 exercises graded correct answers wrong:
  - numeric physics quantities in `equivalent` mode, so rounded values (including the solutions' own) failed;
  - decimal coefficients in keys (−0.06·81·sin 9t ≠ −4.86·sin 9t by 1e-16);
  - a cyclotron answer that froze the page (`simplify` out of memory);
  - STACK angle readings consistent with the given two-decimal data but rejected by 1 % (10 of 71 variants).

  Fixes:
  - numeric mode with 2–3 %;
  - one shared sampling checker for oscillations;
  - a sampling checker for r(t);
  - an absolute tolerance of 0.015 rad for the angle.
- **Medium:**
  - the required input names were not stated (`mu_0`, `epsilon_0`, `B_0`, …);
  - the pendulum figure drew the reflex angle;
  - errors in worked solutions: a wrong potential and its value, a misplaced paragraph, an undefined `c`, C₃→C₁, molar mass 96.094→96.086 u, an out-of-range alternative φ₀, page constants;
  - θ₁<θ₂ was not specified;
  - the STACK triangle double rounding.
- **Low:**
  - "−0.00" displayed;
  - field labels and aria labels on all 46 multi-field physics exercises;
  - Norwegian wording;
  - stale dependency notes.
- **Not changed, for AC:**
  - L5: the phys-2025-3-4 context states v⊥=v∥=v/√2, which answers two fields. Suggested: "Finn v⊥ og v∥ uttrykt ved v".
  - Four forkurs/b2 exercises keep `decplaces` as their pages state; F-69 removes the binary-float surprise there.

**Component findings from this audit:** F-67 (`simplify` blow-up, float keys; proposal P15), F-69 (rounding; fixed).

## 9. ingmat3a moved to the package (AC 18 Oct)

**PR:** https://github.com/aacchhee/ingmat3a_ntnu/pull/12 (not merged). Its CI is green: setup and render with the current Quarto release and Jupyter, as the course builds.

**Why:**
- `main` no longer built (F-71).
- Single extensions are no longer loaded (AC).
- The pages need WebAgg plots, so pyodide-interaktiv's `issue-1-webagg` is stacked below the shared-feedback work (AC's choice).

**Changes:**
- `scripts/setup.py` fetches ctm-assessment at the ref in `quarto-extensions.yml` and runs `scripts/install-project.py`, shared with ctm-demo, which no longer carries its own copy. Set the ref to `main` after ctm-assessment#11.
- `filters: [ctm-assessment]`.
- Exercise text in Markdown (F-72).
- README.
- Pull requests are built (not published) in their own concurrency group; a failed setup is shown in the run summary.

**Checked:**
- Rendered with Quarto 1.8.27, and with 1.10.19 + Jupyter: all 24 pages render with no warnings.
- Page by page against the published site, the counts are identical: 108 math exercises with 393 fields, 29 py-exercises, 255 Python cells.
- The course also renders without SymPy installed.

**Not changed, for P18:**
- The prose HTML: lecture/learning mode, `<details>` reveals and solutions, figure slots.
- The copied `learning-mode.html` and `tab-links.html`.
- `engine: markdown` per page would remove the Jupyter dependency, which exists only because of the Quarto 1.10 regression (P11); no page has executable chunks.

