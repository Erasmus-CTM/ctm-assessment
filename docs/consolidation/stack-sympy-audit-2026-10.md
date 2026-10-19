# stack-sympy audit (consolidation step 2), 19 Oct 2026

Read-only audit of `Erasmus-CTM/stack-sympy` at `origin/main` **f450bcd** (18 Oct), for CTM Assessment consolidation step 2 (ctm-checkers) and step 6 (stack-sympy onto ctm-libs). Nothing in any repository was modified. Context read first: `ctm-assessment/docs/audit-2026-10/README.md` (P12, §5b, §6), appendix C, `docs/consolidation/2026-10-step1.md`, ctm-libs PR #19 (head 840752f, README + `docs/api.md`), math-exercise PR #23 (head c5b57cc).

Severity: **Critical** = wrong grading or an answer leak on the main path; **Major** = authors or learners hit it in normal use; **Minor**; **Info**. "Verified" = reproduced by running code (port in CPython 3.12 + SymPy 1.13.3, and where stated real Pyodide 0.27.2; STACK side with the official pinned STACK answer-test functions in Maxima). "Code" = established by reading code.

## 0. Method and evidence

| What | Result |
|---|---|
| Python suite (`pytest tests`, SymPy 1.13.3, Python 3.12) | **853 passed, 1 skipped** (11 render tests need ai-feedback; passed after installing the CI pin ai-feedback 68abb6d) |
| Same suite on Python 3.13 (D4 = Pyodide 0.28.3) | 839 passed, 1 skipped (render tests excluded) |
| `bundle_runtime.py --check`, `check_corpus.py --check` | pass; corpus 35 questions: 23 replay all qtests, 1 qtest mismatch, 11 unsupported (3 import, 8 instantiate) |
| Compliance pipeline reproduced locally (pinned STACK 10d3233, Maxima 5.46.0/GCL, as CI) | Python: 2303 rows, **461 pass, 11 known defect, 0 unexpected, 1831 out of contract**. Native: 872 ok, 1431 unavailable. Compatibility: 420 match, 9 known port defect, 10 known native failure, 6 controlled-error match. **The report's claims reproduce exactly.** |
| Pyodide parity (real Pyodide 0.27.2 in Node, local SymPy 1.13.3 wheels, repo's own `evaluate_case`) | **465/465** supported fixture rows identical to CPython; all 47 + 5 audit probes identical |
| Native oracle for new probes | the repo's `maxima_runner.run_native` with a locally built GCL image; 165 probe rows, 38 real differences (§2; 2 more are author-only functions typed as answers) |
| Browser tests (`tests/browser.py`, `feedback_browser.py`) | **not run**: jsDelivr is blocked in this container; CI status not readable (no API access to this repo) |

Artifacts: the probes are kept next to this file, in [`stack-sympy-audit-2026-10/probes/`](stack-sympy-audit-2026-10/probes/) (inputs and verdicts as recorded; the scripts take their paths from `STACK_SYMPY` = stack-sympy at f450bcd, `STACK_UPSTREAM` = STACK at 10d3233, `STACK_NATIVE_IMAGE` = the Maxima 5.46/GCL image that stack-sympy's `native_compliance` tools build, `PYODIDE` and `PYODIDE_WHEELS` = Pyodide 0.27.2 for Node with its mpmath and SymPy 1.13.3 wheels): `dual.py` (port vs native harness), `cases1-4.json` + `out1-4.json` (probe inputs and both verdicts), `q/*.xml` + `qprobe.py`, `leak.py`, `crash.py` (question-level probes), `perf*.py`, `quick.py`, `pyodide_parity.cjs` (+ its output `pyodide-parity.json`), `pyodide_fixture_parity.cjs`, `overflow.cjs`, `extract_me_lib.py` (fetches math-exercise's embedded library at the umbrella's pin and decodes it; the library has its one home in math-exercise, so no copy is kept here). Written for this audit (AGPL-3.0-or-later, as the umbrella); the native verdicts in `out*.json` are output of STACK (GPL-3.0) and Maxima. Not kept: the compliance results (`test-results/compliance/*.json`), which stack-sympy's compliance pipeline at f450bcd reproduces exactly (row above), and the GCL image, which its tools rebuild.

## 1. What stack-sympy is

**Purpose.** Renders supported Moodle STACK XML questions (`<quiz><question type="stack">`) as interactive Quarto cards with build-time frozen variants and browser grading by a SymPy port of a bounded STACK subset; optional AI hints via ai-feedback.

**Size.** Python core 3,490 lines in 14 modules (`_extensions/stack-sympy/stack_sympy/`), Lua 214 + 39, JS 519 + worker 52, CSS 133, vendored 505 lines, scripts 3,308, tests 5,155 lines in 26 modules (854 tests). Questions: 17 project XMLs, 35-question native corpus, 7 upstream/corrected.

**Authoring and build flow.**
1. A `.stack-question` code block with `#| file:` and `#| question:` (+ `variants` 1–20, `seed`, `review`, `diagnostics`, `feedback`, `feedback-policy`, `feedback-language`, `context`, `label`, `python-checkers`) — `stack-sympy.lua:73-128`.
2. The Lua filter runs `python -m stack_sympy.cli render` once per block via `pandoc.pipe` with `PYTHONPATH` = extension folder (`stack-sympy.lua:114-138`; interpreter from `STACK_SYMPY_PYTHON`). Build needs native Python + SymPy.
3. `importer.py` converts XML into a JSON-safe model and rejects unsupported answer tests, input types, score modes, branch penalties, PRT cycles (`importer.py:92-239`); `engine.instantiate` freezes seeded variables with its own RNG (not Maxima's), checks precision/form preservation rules and renders CASText (`engine.py:110-341`, `rendering.py`); `checkers.preflight` executes author PythonCheckers on the model answers.
4. `cli.render` emits the card: variant select, prompt HTML, Validate/Check(/Run tests) buttons, and a `<script type="application/json">` with the **whole question model** (PRTs, teacher answers, qtests, checker source) and all variants (`cli.py:20-48`). Lua appends "Show source" and "Show STACK source" panels (full XML) to every card (`stack-sympy.lua:171-179`).

**Runtime.** `stack-sympy.js` mounts each card; Validate → Check is mandatory (two steps); requests are serialized to one dedicated Web Worker per page (`stack-sympy.js:12-57`) that `importScripts` the vendored `pyodide-runtime.js` and the generated `runtime-sources.js` (all 14 modules as one JSON blob), loads **its own Pyodide + SymPy** and calls `engine.grade/validate/run_question_tests` (`worker.js`). A 120 s timer terminates the worker. Math is typeset with its own MathJax 3.2.2 loader (`stack-sympy.js:59-135`); matrices use the vendored math-exercise `matrix-input.js`.

**Engine.** `expressions.py` is a hand-written bounded grammar (no `eval`, no `sympify`): 1200 chars, 350 tokens, depth 40, |exponent| ≤ 100, rational size 16,384 bits, collections ≤ 32 items/6 levels/128 nodes, matrices ≤ 16×16/64 entries; `insertstars` 0/1. Answer tests (`assessment.py`): AlgEquiv (numeric rejection screen at two precisions + bounded symbolic proof, binary64 path for literal decimals, logic truth tables, equations as residual products), EqualComAss (canonical held syntax), FacForm, SingleFrac, LowestTerms, NumAbsolute, NumRelative, NumDecPlaces, Sets, SameType, plus the port-only `PythonChecker`. `engine.grade` walks PRTs (`=`/`+`/`-` modes), answer notes, weighted aggregation; `run_question_tests` replays `<qtest>`s.

**Feedback.** `feedback-loader.lua` finds exactly one `_extensions/[owner/]ai-feedback/feedback-quarto.lua`, requires ≥ 0.8 by parsing `_extension.yml` and else `error()`s (`feedback-loader.lua:3-38`); the card gets `data-stack-feedback` (context, policy selection, languages); JS attaches `AIFeedback` with integration `math-exercise` and sends the task text, raw answers and only `{status, score}` of a matching Check (`stack-sympy.js:352-415`). Verified: renders unchanged against ctm-libs PR #19 through its `ai-feedback` 0.9.0 alias.

**Vendored copies and drift (verified by sha256).**

| Copy | Source pinned | State today |
|---|---|---|
| `vendor/pyodide-runtime.js` c21bbd3e (94 lines) | math-exercise 6eddf89 | **diverged**: math-exercise main 1d6d5176, ctm-libs PR #19 `runtime/pyodide-runtime.js` 9f327799 (228 lines). Missing F-42 load timeout, F-48 guard, F-60/F-65 fixes. Provenance says AGPL-3.0-**only**, header says -or-later (`vendor/provenance.json:5`) |
| `vendor/matrix-input.{js,css}` dff9b175/c993df3d | math-exercise f238da6 | identical to math-exercise main and PR #23 |
| `stack_sympy/basis_helper.py` (`assess_basis`) | math-exercise 5945f8f | function body identical (761a0283) to PR #23's embedded copy |
| `feedback-loader.lua` | own | diverged from the 3 shared copies (65 %); superseded by ctm-bootstrap in step 1 |
| MathJax 3.2.2 loader, worker RPC, `escape/readFile`, source panels | own | parallel implementations (appendix C §3.7–3.9, §4.8) |

## 2. Correctness against Moodle STACK

Answer-test level (AT) findings were run through both the port and the official pinned STACK `AT*` functions (`probes/out1-4.json`); question/PRT-level findings were checked against the pinned PHP/Maxima source with the cited lines. The compliance report's own claims are correct for what it covers (AT layer, 461 in-contract rows, 0 unexpected); the findings below sit in the layers it explicitly excludes (PHP input validation/security, PRT engine, question options) or are AT inputs not in the fixture.

### Critical

**S-01 — Students can type question-variable names: full marks and the answer appears in the preview.** Verified (CPython and Pyodide). `evaluate()` resolves any name found in the frozen variable environment, also for student input (`expressions.py:650-654`), validation evaluates with that environment (`engine.py:357-367`) and the preview prints the variable's value (`expressions.py:432-434`, `engine.py:385`). Repro (`probes/leak.py`): `polynomial-expansion.xml` answer `ta` → preview `x^{2} + 7 x + 12`, score 1; same for `rational-equivalence` (`ta`), `zero-product` (`ta`), `course-b-rank-pivots` (`r`, `P`), `determinant-one` (`T`), `python-checker` (`d`). STACK forbids exactly this: "If the teacher defines 'ta' to be the answer, the student could type in 'ta'! We forbid this." (`question.php:430-441`, `cassecurity.class.php:373-376`). Fix: student evaluation must not see question/feedback variables (validation error "forbidden variable"); qtests keep resolving them on the author side (they already go through `_qtest_answer`).

### Major

**S-02 — `I` and `E` are constants in the port, variables in STACK.** Verified natively. `_NAMES` maps `I`→i and `E`→e (`expressions.py:40-42`); STACK binds only `e`, `pi`, `Pi`, `PI`, `i` (`stackmaxima.mac:45-50`). `AlgEquiv(-R, I^2*R)` port **true**, STACK false (`probes/q/physics-I.xml`: the answer `-R` scores 1 for P = I²R); `E` vs `exp(1)`, `E*x` vs `%e*x`: port true, STACK false. Physics/engineering content (current I, energy E) is graded wrong. math-exercise has the same SymPy default but authors can override with `#| vars: I`; stack-sympy has no override.

**S-03 — AlgEquiv rejects common log/root/abs identities that STACK accepts.** Verified natively, all port false / STACK true: `2*log(x)`=`log(x^2)`, `log(x)+log(y)`=`log(x*y)`, `log(1/x)`=`-log(x)`, `log(x)-log(y)`=`log(x/y)`, `log(x^3)/3`=`log(x)`, `x`=`log(exp(x))`, `abs(x)`=`sqrt(x^2)`, `2*abs(x)`=`sqrt(4*x^2)`, `abs(x)^2`=`x^2`, `sqrt(x^2*y^2)`=`abs(x*y)`, `sqrt(x)*sqrt(y)`=`sqrt(x*y)`, `(x^3)^(1/3)`=`x`, `x^(2/3)`=`(x^2)^(1/3)`, `(-8)^(1/3)`=`-2`. Cause: SymPy principal-complex semantics (`equivalence.py:128-185`) vs STACK's `logexpand:super`/`radcan`/real-domain simplification. The semantics page documents 8 fixture rows of this family as questions for STACK (cases 50, 76, 92, 99, 101, 127, 155, 167); the probes show the everyday reach is wider. Authors can mitigate per question with `assumepositive=1` (fixes all but `(-8)^(1/3)`) or `assumereal=1` (fixes abs/exp), but imported Moodle questions behave differently. Needs an owner decision: follow STACK (port's goal) or keep principal branches and say so on every card.

**S-04 — `quiet` hides the author's branch feedback.** Verified. `engine.py:598-608` skips the rendered branch feedback when the node is quiet. STACK: "any feedback automatically generated by the answer tests is suppressed … The feedback fields in the branches are unaffected" (`lang/en/qtype_stack.php:347`; compiled PRT `prt.class.php:687`); the STACK quick start recommends exactly quiet FacForm + own feedback. Repro `probes/q/quiet.xml`: `x^2+x-2` gets 0.5 and **no** "Your answer is not factored" text.

**S-05 — Non-applicable answer-test results void the attempt instead of taking the false branch.** Verified. NumAbsolute/NumRelative with a non-real answer and NumDecPlaces with a non-decimal return `valid=False` (`assessment.py:429-433, 460-465`) and `grade` returns `status: invalid`, score 0, no PRT feedback (`engine.py:582-591`). STACK returns `[false,false,"ATNumerical_SA_not_number",…]` (`numericaltest.mac:63`) and the PRT branches on the result (`prt.class.php:696`). Repro `probes/q/numabs-branch.xml`: answer `45*x` → STACK node 1 gives 0.5 + "Use radians…"; port: "Check the input and try again", and the XML qtest fails.

**S-06 — NumDecPlaces disagrees with STACK at decimal ties.** Verified natively, 8/8 tie probes: teacher `1.015`, 2 dp → port accepts `1.02`, rejects `1.01`; STACK the reverse (same for 1.035, 1.225, 1.245). Port rounds the exact rational half-even (`assessment.py:468-472`); STACK rounds the binary64 product `round(sans*10^n)` (`numericaltest.mac` ATNumDecPlaces). Python `round(float(t)*10**n)` reproduced STACK for all 8 tie teacher values probed (16 rows; 2.675, 2.665, 0.125, 1.005 agree by chance, 1.015, 1.035, 1.225, 1.245 differ). Note: math-exercise `decplaces` rounds decimal half-up (F-69/F-74) — three rounding rules exist in the product.

**S-07 — Question-level STACK options are silently ignored.** Verified. `importer._question` never reads `complexno`, `decimals`, `scientificnotation`, `multiplicationsign`, `inversetrig`, `logicsymbol`, `sqrtsign`, `matrixparens` (`importer.py:228-239`). Repro `probes/q/options.xml` (`<complexno>j</complexno><decimals>,</decimals>`): builds; `3+4*j` graded wrong (STACK: `j:%i`, `stackmaxima.mac:220-229`); `3,5` → "Unexpected trailing text". Contradicts the README ("unsupported authoring features stop the build"). Decimal comma matters for nb/de courses. Fix: reject non-default values at import until supported.

**S-14 — Every card shows the original XML (answers, PRTs, qtests).** Verified (rendered `index.html`). `stack-sympy.lua:171-179` always adds "Show source"/"Show STACK source"; no option. Fine for the demo site, an answer key on course pages. Move to docs tooling (ctm-docs/example-source; keep its fence-length fix).

### Minor

**S-08 — PRT score rounding and qtest replay differ.** Verified (`probes/q/thirds.xml`). STACK rounds each PRT score to 3 dp (`prt.class.php:523`) and compares qtests after `round(…,3)` with 1e-5, ignoring expected score/penalty −1 and penalties for `NULL` notes (`questiontestresult.php:141-146, 203-229`); actual notes include answer-test notes (`prt.evaluatable.class.php:261-298`). Port: 10 dp, 1e-8, no −1/NULL rules, branch notes only (`engine.py:611, 645-655, 487-516`). Three `+0.3333333` nodes give 0.9999999: the card says "Partially correct (100%)" (`stack-sympy.js:169-170`) and a Moodle-exported qtest (score 1, penalty 0) fails.

**S-09 — One blank input blocks every PRT.** Verified (`probes/q/twoparts.xml`): answering only part (a) → "Check your answers before grading" (`engine.py:545-547`). STACK evaluates each PRT whose own inputs are valid (`question.php:1300-1313`).

**S-10 — `checkanswertype` checks collections only.** Verified (`probes/q/eqtype.xml`): teacher `y=2*x+1`, answer `2*x+1` is valid and graded 0 (`engine.py:377-380`). STACK makes it a validation error via `ATSameTypefun` (`validator.mac:52`).

**S-11 — Valid student input can raise author errors or show tracebacks.** Verified (CPython + Pyodide). `x=1` or `a and b` into a SameType/EqualComAss/FacForm node raises `Unsupported` (`assessment.py:360-362, 382-383`) → `UnsupportedQuestion` (`engine.py:580-581`) → "Could not check this answer: crash: prt[prt1]/node[0]: SameType supports scalar expressions and collections" (STACK: false branch). Bounded hyperbolic inputs hit "Elementary equivalence exceeds expansion bound" (`equivalence.py:124, 170, 175, 180`). `exp(exp(exp(exp(10))))` in NumAbsolute raises an uncaught `OverflowError` (`assessment.py:42`), shown as a raw Python traceback (`probes/overflow.cjs`, `worker.js:49-50`).

**S-12 — A few short inputs run for minutes.** Verified (CPython, 120 s alarm): `sin(exp(exp(exp(5))))` in AlgEquiv or NumAbsolute (mpmath argument reduction under `evalf`, `equivalence.py:93`, `assessment.py:42`), `sin(x)^99*cos(x)^99` vs `(sin(2*x)/2)^99` (unbudgeted `cancel/trigsimp/simplify` for sin/cos, `equivalence.py:140-142`; the budget at :137-138 covers only sec/csc/cot/hyperbolic). Ordinary inputs are fast (trig powers ≤ 12: < 0.4 s; 55 timing probes, `probes/perf*.py`). Today only the stack worker is killed after 120 s (`stack-sympy.js:47-49`, which also counts Pyodide download time, unlike F-68); on a shared runtime (step 6/P13) it would block every component's checks.

**S-13 — STACK input rules are only partly reproduced.** Verified port side, STACK by code. Accepted although STACK rejects: `sinx` and other ≥3-letter names (`cassecurity.class.php:378-391`), `sin*x`, `Sin(x)`, `SQRT(x)` (names lower-cased, `expressions.py:299, 310`), `0^0` (→ 1; STACK error). Rejected with technical text although STACK converts or explains: `x²`, `π` ("Unexpected character … (U+00B2)"), `3,5`, `2 x`. Inverse trig is missing from the student allowlist (`expressions.py:43-51`) and `atan(1)` gets "use atan*(...) for multiplication" (`expressions.py:300`).

**S-15 — No build without AI feedback (P22).** Verified with ctm-libs PR #19: `ai-feedback: enabled: false` removes the ai-feedback assets, but stack cards still get `data-stack-feedback` and a Feedback button that then says ai-feedback is missing (`stack-sympy.lua:153-170`, `stack-sympy.js:370-377`). Expected until step 6.

**S-16 — Second Pyodide and second math renderer on mixed pages.** Code. The worker always loads its own Pyodide via the stale vendored runtime (`worker.js:4, 9`) and MathJax 3.2.2 (`stack-sympy.js:59`) while math-exercise/ai-feedback use the page runtime and KaTeX.

**S-17 — English-only UI.** Code. `cli.py:37-46` (Variant, Validate answers, Check answer, Run question tests), `stack-sympy.lua:177-178`, `stack-sympy.js:167-171, 207, 231, 398, 468-473, 509`, `rendering.py:131, 133` (`aria-label="Answer ans1"`), and every Python validation/answer-test message. A `lang: nb` page gets an English card with a Norwegian Feedback button.

**S-18 — Accessibility gaps.** Code. Validation messages are `aria-live` but not linked to their input (`aria-describedby` missing); aria labels expose internal input names; fixed light palette with no dark-mode tokens; disabled Check shows `cursor: progress`; Enter neither validates nor checks; buttons don't use the shared `--ctm-button-*` variables (F-53).

**S-19 — Small answer-test differences.** Verified natively: `EqualComAss(x-(-1), x+1)` port true/STACK false; `LowestTerms(0.5/1)` port true/STACK false; `Sets`/`AlgEquiv` `{x^2-1}` vs `{(x-1)*(x+1)}` port false/STACK true (documented policy for `{(x+1)^2}`); NumDecPlaces `1.50e2` (2 dp) port wrong-places/STACK correct.

**S-21 — Housekeeping.** Code. `_extension.yml` 0.2.0 vs dependency version `0.1.10` (`stack-sympy.lua:60`, stale `quarto-contrib` folder name); `quarto-required: ">=1.4.0"` (P9: ≥ 1.8.27); `fail()` uses `os.exit(1)` (`stack-sympy.lua:8-14`) instead of the F-34 `assert(false, …)` convention; `feedback-loader.lua` still prints `quarto add Erasmus-CTM/ai-feedback` and stops on two installations (F-36 class); README says the runtime is "synchronized with math-exercise PR #12" (no longer true).

### Info

- **S-20** Non-PythonChecker answer-test feedback is appended to PRT HTML unescaped (`engine.py:607-608`); today it can only contain fixed text and SymPy `str()` of learner values (no `<` possible), but it shows Python syntax (`x**2`) to learners.
- **S-22** Coverage: only 461/2303 fixture rows (20 %) are in contract. Unsupported families include NumSigFigs (162 rows), Int/Antidiff/AddConst, Units*, CasEqual, PartFrac, SubstEquiv, Diff, Expanded, String/SRegExp; those questions stop the build (fail closed, as documented).
- **S-23** Client-side grading: the page JSON always contains teacher answers, PRTs, qtests and checker source (inherent; documented). No attempt state or penalties are applied in the browser.
- Maxima syntax translation is sound in the probes (`2^3^2`, `-2^2`, `a/b*c`, `x^-1`, `-x^-2`, `a/b/c`, `**`, `%e^(%i*%pi)`, `mod`, `gcd`, `cosec`, `sech` all agree with STACK).

## 3. Security, robustness, accessibility, i18n, docs

- **Code injection from learners: none found.** The grammar never evaluates Python; names become `Symbol`s (`__import__` is a symbol), calls are allow-listed (`expressions.py:299-300, 700-701`). This is safer than math-exercise's `parse_expr` + `__` guard. The answer leak S-01 is the security issue here.
- **Author content into HTML/JS:** CASText is allow-list sanitized (tags, `class`/`title`, `href` only `#`/`https://`), CASText tokens inside tags are rejected, comments rejected (`rendering.py:22-63, 81-84`); card JSON escapes `< > &` U+2028/9 (`cli.py:14-17`); Lua escapes attributes and chooses a safe fence (`stack-sympy.lua:16-49`); arguments go to Python without a shell. Author XML/checkers are trusted code by design (checker source is `exec`ed at build and in the worker, `checkers.py:83-118`).
- **Robustness:** S-11, S-12. Build-time Python has no timeout (trusted authors).
- **Accessibility:** S-18. **i18n:** S-17. **Docs:** thorough and honest about scope; issues S-07, S-21; the compliance pages are reproducible and accurate.

## 4. Overlap with math-exercise and ctm-libs

| Concern | math-exercise (PR #23 embedded lib; `probes/extract_me_lib.py` fetches it) | stack-sympy | Share in ctm-checkers? |
|---|---|---|---|
| Result contract | bool / score / dict{score\|correct, feedback, assessment{input:{axis:[…]}}, show_score} (`_normalize_custom_result`) | bool / dict{valid, correct, feedback, assessment{axis:[…]}} (`checkers.py:147-174`) | **Yes**: one `CheckResult` accepting both shapes, plus `valid` |
| Custom checker execution | `exec` in a copy of globals, `check(response, symbols)` | temp module, output discarded, signature/sync checks, `fn(student, teacher, options)` | **Yes**: one runner (stack's isolation, math-exercise's contract) |
| `assess_basis` | embedded | vendored, identical | **Yes** (`matrix`) |
| `graph_from_response`, matrix helpers (`rational_matrix`, Hermitian/PD, basis/property) | embedded | `questions/matrix-checkers.py` | **Yes** (library) |
| Authored tests | `test(check, symbols)` runner (`question-tests.py`, regex-extracts the JS array) | STACK `<qtest>` replay | runner **yes**; STACK qtests stay in the STACK module |
| Interpreter guard, Pyodide bundling | `_ctm_guard`, inline JS array | worker + `bundle_runtime.py` | **Yes** (one wheel for build and browser) |
| Parsing | SymPy `parse_expr` (eval, implicit ×, `^`), `vars` | bounded grammar, `insertstars` 0/1 | **No** (different input languages) |
| Equivalence | `simplify(d)==0` or \|N(d)\| < 1e-10 (numeric acceptance) | STACK AlgEquiv (numbers only reject) | **No** |
| Numeric tolerance | `abs(s-c) <= tol` (verified: 1.1 vs 1, tol 0.1 → wrong, 0.9 → correct) | `< tol + 1e-9`, relative with (1+1e-9) | **No** |
| Rounding | decimal half-up after `.15g` | exact half-even (STACK: binary64, S-06) | **No** |
| Form checks, lowest terms, sets | SymPy `factor/expand/together/cancel`, regex, simplify matching with partial credit | written-form AST tests, structural sets | **No** (math-exercise may later offer STACK tests as an opt-in mode) |
| Constants/branches | `I`, `E` constants unless in `vars`; principal branches | same, no override (S-02, S-03) | semantics agree today; keep separate |

ctm-libs (PR #19) duplicates to remove in step 6: `vendor/pyodide-runtime.js` → `runtime/pyodide-runtime.js`; `feedback-loader.lua` → `ctm-bootstrap.lua`; `matrix-input.*` → one shared copy (ctm-libs UI); own MathJax loader → shared typesetting; consumer version gate (`stack-sympy.js:370-377`) → removed as in step 1; language resolution (`stack-sympy.js:357-358`) → `CTMLocales`.

## 5. Plan for step 2 and stack-sympy's move

### 5.1 ctm-checkers layout (`Erasmus-CTM/ctm-checkers`, empty today)

```
ctm-checkers/
├── pyproject.toml            ctm-checkers; Python >=3.12; sympy>=1.13 (CI pins 1.13.3); networkx optional
├── CHANGELOG.md              every verdict change, with its golden-table diff
├── src/ctm_checkers/
│   ├── __init__.py           __version__, API = 1
│   ├── core/result.py        CheckResult, normalize_result(), STATUSES
│   ├── core/custom.py        run_checker(source, response, symbols): isolation, output discard, guard
│   ├── core/bounds.py        shared size guards (bit sizes, depth), no grading policy
│   ├── matrix.py             assess_basis, rational_matrix, basis/matrix_property/hermitian/positive_definite
│   ├── graph.py              graph_from_response
│   ├── testing.py            authored-test runner: test(check, symbols)
│   ├── browser.py            dispatch(request_json) -> json, the single Pyodide entry
│   ├── math_exercise/        check(request), check_custom(request); parsing.py, numeric.py, forms.py (today's semantics verbatim)
│   └── stack/                expressions, assessment, equivalence, logic, collections, collection_ops,
│                             matrix_models, importer, engine, rendering (CASText), cli
├── tests/{core,matrix,graph,testing,math_exercise,stack}/ + golden/
└── tools/                    golden.py (record/verify), build_bundle.py (wheel + sha256),
                              stack_native/ (maxima_runner, native image, compatibility, report)
```

Public API: `ctm_checkers.math_exercise.check(request)` / `check_custom(request)` (the `_math_*` globals become one request dict); `ctm_checkers.stack`: `import_xml`, `instantiate`, `validate`, `grade`, `run_question_tests`, `answer_test`, `parse`, `evaluate`, `form_latex`, `UnsupportedQuestion`, `InvalidAnswer`, `SUPPORTED_TESTS`, `LIMITS`; `python -m ctm_checkers.stack render|test`. Messages should become codes + arguments (aligned with STACK's string keys, e.g. `ATSets_duplicates`) so ctm-libs' catalogue localizes them.

Delivery: one pure-Python wheel per version, shipped as a ctm-libs resource, loaded in the browser with `loadPackage(<wheel URL>)` and at build time by zip-importing the same wheel (authors keep needing only SymPy; build and browser run identical bytes).

### 5.2 What moves, what is kept or rewritten

- **From math-exercise:** the 385-line embedded library verbatim into `math_exercise/`, `core/`, `matrix.py`, `graph.py`; `question-tests.py` → `testing.py` (keep the CLI path as a thin wrapper). `variants.py` stays in math-exercise; it may import `math_exercise.numeric` so variants and checker round by one rule (F-74).
- **From stack-sympy, kept as-is:** all of `stack_sympy/` except below, its 17 engine-level test modules and 8 compliance-tooling test modules (of 26; `test_render.py` and the browser scripts stay with the component), native fixtures + policies, port regressions (170), reference cases (65), corpus + baseline, native-comparison tooling and report generator. Code quality is high and parity is proven; rewriting would lose that evidence.
- **Replaced:** `basis_helper.py` → `matrix.assess_basis`; `checkers.py` 3-argument contract → `core.custom` (H1); `cli.py` → `ctm_checkers.stack.cli`.
- **Fixed after the move, one changelog entry each:** S-01 first (before any course page uses STACK cards), then S-02, S-04, S-05, S-06, S-07, S-08, S-09, S-10, S-11, S-12 (bound `evalf`/`simplify` with budgets and turn overruns into "cannot decide" = false branch + note), S-13. S-03 needs an owner decision (follow STACK's real/logexpand behavior, or keep principal branches and document it on cards).
- **Rewritten in the stack-sympy component (step 6):** Lua filter (ctm-bootstrap; `assert`; no source panels), JS front-end (CTMLocales, shared runtime, shared matrix input, shared typesetting, `--ctm-button-*`, aria-describedby), worker, `feedback-loader.lua` and `vendor/` deleted.

### 5.3 stack-sympy onto ctm-libs (step 6)

- **Bootstrap:** byte-identical `ctm-bootstrap.lua`, `dofile(...)("stack-sympy")`; `CTM_COMPONENT_DEV=1` in its CI.
- **Settings:** add a `stack-sympy:` section to `read-settings.ts` (`lang`, `feedback: auto|true|false`, `stop-after`, `source-panels` default false); block options unchanged plus H1's `checker`/`tests`.
- **Locale:** `locales/stack-sympy.js` (en, de, nb) for card UI and the message codes from ctm-checkers.
- **Feedback:** `ctm.feedback.request("stack-sympy", wanted, origin)` (P22), `selection`/`context` from `ctm.feedback`; JS keeps `integration: 'math-exercise'`, drops its version gate.
- **Runtime:** target is ctm-libs' page runtime in a worker (P13) with `stop-after`/Stop, one Pyodide per page, ctm-checkers wheel; if step 6 lands before P13, keep the dedicated worker but bootstrap it from ctm-libs' runtime file and the shared wheel, and start the timeout after loading (F-68).
- **Sequencing constraint:** stack-sympy's loader works with the ctm-libs alias (verified) but breaks when the alias is removed (planned with step 3). Keep stack-sympy's CI pin (ai-feedback 68abb6d) until step 6, or do step 6 first.

### 5.4 Tests: golden verdict tables (prove "no grade changes")

Record from today's code, before extraction, as JSONL `{suite, id, input, output}` compared byte-for-byte:
- **STACK** (from f450bcd): all 2,303 fixture observations (`python.json` kind/valid/correct/note); 170 port regressions; 65 reference cases; every qtest × deployed/rendered seeds for `questions/**` and the corpus (full `grade` output: status, score, notes, feedback hash); per question generated answers (teacher answer, qtest inputs, sign flips, ±1, factored/expanded forms, decimals, invalid strings); the audit probes `out1-4.json` tagged "known divergence" so fixes flip them deliberately.
- **math-exercise** (from PR #23 head c5b57cc, through the embedded library): every `.math-exercise-cell` of math-exercise's examples, ctm-demo and ingmat3a, every variant, keys + the earlier audit's challenge answers + perturbations (the umbrella parity harness inputs).
- CI: pytest on Python 3.12 and 3.13 with SymPy 1.13.3; the same goldens in Pyodide 0.27.2 and 0.28.3 (Node + local wheels, as `probes/pyodide_fixture_parity.cjs`; doubles as the D4 gate); the native STACK comparison job moves to ctm-checkers.

### 5.5 PR order

1. **ctm-checkers #1** skeleton: core, matrix, graph, testing, golden tooling, wheel build, Pyodide (Node) job. No consumer changes.
2. **ctm-checkers #2** `math_exercise` verbatim + its golden tables.
3. **ctm-libs** (after PR #19): ship and load the wheel (`installModule`-style, hash-checked); build-time zip import helper.
4. **math-exercise**: delete the embedded array, call `ctm_checkers.browser.dispatch`; `question-tests.py` imports `testing`; goldens in CI.
5. **ctm-assessment**: pin ctm-checkers; umbrella parity harness checks the goldens.
6. **ctm-checkers #3** `stack` as-is + stack goldens + native job (independent of 3–5; can go in parallel).
7. **ctm-checkers #4…** STACK fixes (S-01 first), each with changelog + golden diff.
8. **stack-sympy (step 6)**: onto ctm-libs and ctm-checkers, H1 syntax after the owner's decision; then the umbrella adds it to the package.

## 6. H1 proposal and H3 recommendation

### H1 — the author's own Python checker in a STACK question (proposal; owner decides)

Same keys and contract as math-exercise, in the Quarto block:

````markdown
```{.stack-question}
#| file: questions/multiple.xml
#| question: A positive integer multiple
#| checker: |
#|   def check(response, symbols):
#|       n = response["inputs"]["ans"]["expression"]
#|       d = response["variables"]["d"]
#|       ok = n.is_Integer and n > 0 and n % d == 0
#|       return {"correct": bool(ok),
#|               "feedback": "" if ok else "Give a positive whole multiple of the given number."}
#| tests: |
#|   def test(check, symbols):
#|       r = lambda v: {"inputs": {"ans": {"expression": Integer(v)}}, "variables": {"d": Integer(3)}}
#|       assert check(r(6), symbols)["correct"]
#|       assert not check(r(-3), symbols)["correct"]
```
````

- **Contract:** `check(response, symbols)` exactly as math-exercise: `response["kind"] == "expressions"`, `raw`/`expressions` in XML input order, `inputs[name]` = `{type, raw, expression}` (matrix: `rows, cols, raw, expressions, matrix`, as math-exercise). STACK additions: `response["variables"]` (frozen question variables) and `response["teacher"]` (evaluated `<tans>` per input). `symbols`: free symbols of teacher answers and variables (plus `#| vars:` if given). Values come from the STACK parser, so learner strings are never evaluated as Python. Returns bool | score in [0,1] | dict(`score`/`correct`, `feedback`, `assessment` keyed by input name, `show_score`, optional `valid: False` = invalid attempt, no score). `#| checker: path.py` is accepted too; `#| tests:` runs at build like math-exercise.
- **With PRTs:** by default the checker is one more response tree named `checker`, weighted by `#| checker-value:` (default 1, same unit as `<prt><value>`), feedback in `[[feedback:checker]]` or below the other trees. Inside a tree, a node `<answertest>PythonChecker</answertest><testoptions>{"checker": "check"}</testoptions>` calls it as a predicate (true when the score is 1); then no extra tree is added. Other names in `testoptions` select library checkers from ctm-checkers (`basis`, `matrix_property`, `is_hpd`, …), so supplied checkers need no file. A PRT may not be named `checker`. Inputs are validated by STACK rules before the checker runs.
- **Replaces** `#| python-checkers:` + `CHECKERS` registry and the 3-argument contract (no users, so no alias needed).
- **Alternatives considered:** Python inside the XML (portable, but CDATA Python is hard to edit and Moodle cannot run it anyway); separate file + registry (today: three places to edit).

### H3 — merge math-exercise and stack-sympy? Recommendation: not now; align them instead

Judged from the course author's side:
1. **Different starting points.** math-exercise is for writing new exercises in Markdown (`_[answer]`, `#|` options, generated variants). stack-sympy is for bringing existing Moodle STACK XML (PRTs, CASText, qtests). A merged block would still need both syntaxes.
2. **Different grading semantics that must stay apart** (§4), and the decision that math-exercise changes never move STACK grades. The engines already merge where it matters, in ctm-checkers.
3. **What authors notice is behaviour, not component count:** labels, buttons, languages, feedback, Stop, progress, no-AI builds. Step 6 gives stack-sympy all of these from ctm-libs with the same option names (`label`, `feedback`, `context`, `checker`, `tests`, `lang`).
4. **Risk:** math-exercise has real users (ctm-demo, ingmat3a); stack-sympy has none and needs grading fixes first (S-01…S-07).

Cross-use without a merge: STACK cards gain math-exercise-style checkers (H1); math-exercise may later offer STACK answer tests (`AlgEquiv`, `EqualComAss`, `FacForm`, …) as opt-in modes or checker helpers from `ctm_checkers.stack`. **Revisit after step 6** with one criterion: if stack-sympy's own Lua + JS is mostly glue (roughly < 300 lines) on ctm-libs, fold it into the math-exercise extension as a second block type with one filter and card renderer; authors see no change.
