# Question variants: audit of math-exercise and a shared design with stack-sympy

19 Oct 2026. Read-only audit; no repository was changed. Sources were exported with `git archive` into the scratch folder (no branch switches):

| Repository | Commit | Export |
|---|---|---|
| math-exercise | `origin/main` 8ab1b25 | `scratchpad/variants/me/` |
| ctm-demo | `origin/main` 7f9cbec | `scratchpad/variants/demo/` |
| ctm-libs | `origin/main` df4799e | `scratchpad/variants/libs/` |
| stack-sympy | `origin/main` f450bcd (checkout, read only) | — |
| ingmat3a_ntnu | `origin/main` d7ddfc6 (`git grep`, read only) | — |

Also read: `ctm-assessment/docs/audit-2026-10/README.md` (F-67, F-69, F-74, P5, P15, P17, P21) and appendix A; the STACK documentation in `scratchpad/upstream-stack/doc/en/` (Variables, CASText, Question_note, Random, Deploying, Deploying_systematically, Deploying_matched_variants, Testing, Bulk_testing); `scratchpad/stack-audit/AUDIT.md`; `scratchpad/consolidation/step2-design.md`.

Evidence produced for this report (all in `scratchpad/variants/`): `scripts/repro.py` (reproductions R1–R10 against the real `variants.py`), `scripts/run_fixtures.py` (every authored fixture natively), `scripts/measure.py` (page payload), `render/` (a Quarto project rendering broken and working variant exercises), and a working prototype of the proposed variables language and manifest in `proto/` (`variables.py`, `manifest.py`, `compare.py`, `scenarios.py`, and the four ctm-demo exercises rewritten in `proto/examples/`).

Owner requirements taken into account (AC, 19 Oct): variants are raw and ugly and used only by ctm-demo, so the syntax may be replaced and ctm-demo migrated in the same campaign; the design should be more STACK-like, with question tests and approve/reject; **one** variant model and approval mechanism for math-exercise **and** stack-sympy, shared parts in ctm-checkers (Python) and ctm-libs (Lua/JS), with an approval page as part of authoring; approval must work both with GitHub alone and with local VS Code, with the same manifest format. Constraints: one CTM Assessment install; no HTML in Markdown (inline Markdown in exercise text is fine); P17 saved answers keyed by exercise label; P21 bilingual text via a `#| lang: nb` separator line in the body; Pyodide in the browser and native Python at build time; exact arithmetic preferred.

---

## 0. Summary

**Today.** A `{math-exercise}` block with `#| parameters:` is expanded at build time by `variants.py` into the Cartesian product of the parameter lists (floats for derived values), with `{{name}}` string substitution into the question, solution, AI context, *checker source* and YAML test fixtures. Every valid combination is shipped to the page (ctm-demo: 325 variants, 1.66 MB of a 2.30 MB page) and the browser picks one with `Math.random()`, remembered only in `sessionStorage`. An optional review build adds a table to each exercise; approval is a pasted `#| include-variants: [...]` list of 20-hex IDs plus a fingerprint of the *whole* definition, so any edit (even the caption) stops the student build. The authored per-variant tests run only when someone clicks a button in that review table; no course build or CI runs them. ctm-demo needs 76 lines of page script and a course filter to keep figures, solutions and AI activities in step with the chosen variant. stack-sympy has a different model again (consecutive seeds, the learner picks "Variant N" from a menu).

**Proposal (recommended option B).** One variant model for both components:

- **Variables in each component's own language.** math-exercise gets a `#| variables:` block, a small Python/SymPy subset with exact arithmetic and finite random choices (`pick`, `sample`, `shuffle`, `require`). STACK keeps its XML question variables.
- **STACK's text placeholders** `{@expr@}` (LaTeX) and `{#expr#}` (raw value) in the exercise text, solution, note and answer keys.
- **A teacher-facing note** per variant, as in STACK.
- **The teacher approves or rejects each variant.** Decisions go in a small YAML manifest per exercise, `_variants/<label>.yml`, holding a stable number `n`, the variant's id, a content hash, the status and who decided.
- **Automatic checks on every deployed variant** at build time and in CI: the teacher answers must be graded correct, generated wrong answers are flagged when they are accepted, and the authored tests run.
- **One approval page** generated for the whole project, the same page for both flows. Locally it saves decisions through a small helper. From a GitHub Pages preview it produces the file to paste into GitHub's web editor (or, optionally, a bot records ticks from a PR checklist).
- **Stable variant per learner.** Each learner gets a stable variant (their saved choice, else a per-learner hash), sees "Variant 3", and checkers receive `response["variables"]` (exact SymPy values), `response["teacher"]` and `response["variant"]`.

The prototype regenerates all 325 ctm-demo variants from the new syntax with identical parameter sets and equivalent answer keys, in half the source lines (135 vs 260). It also turns `\frac{ -1-(-3) }{(x-(-3))^2}` in today's worked solution into `\frac{2}{\left(x + 3\right)^{2}}`.

---

## 1. How variants work today, and what is wrong

### 1.1 Where variants are used

| Where | What | Count |
|---|---|---|
| ctm-demo `pages/stack-oppgaver.qmd` (`_includes/stack/{triangles,values,angle,tangent}.qmd`) | generated variants (`#| parameters:`); the only course use | 4 definitions, 24 + 71 + 71 + 159 = **325 variants**, all deployed (no selection) |
| math-exercise `_includes/variants/*.qmd`, `generated-variants.qmd` | examples (review page) | 5 definitions, 16 variants |
| ingmat3a `_includes/module1/m1_2_exercises.md`, `m1_3.md` | hand-written **pools** (`#| pool: true`, tasks separated by `---`) | 7 pools |
| ctm-demo `pages/physics.qmd`, `fysikk-forkurs.qmd`, `bevegelse-ii.qmd` | no variants and no pools | — |
| stack-sympy `.stack-question` blocks | its own seeds (`#| seed:`, `#| variants:` 1–20) | no course users |

### 1.2 End to end, with references

| Stage | What happens | Where |
|---|---|---|
| Syntax | `#| parameters:` (finite lists or inclusive integer ranges, ≤ 10 000 combinations), `derived:` (expressions), `constraints:`, `{{name}}` and `{{name:.Nf/.Ng}}` placeholders, `solution: |`, `solution-target:`, `variant-context:`, `tests:` (YAML fixture list), `review:`, `include-variants:`/`exclude-variants:`, `reviewed-fingerprint:` | `docs/build-time-variants.md:17-52`; `variants.py:87-171`; not in the options table of `docs/reference.md:114-138` |
| Generation (build) | Lua detects `#| parameters:` and pipes the whole block to `python3 variants.py` (interpreter hard-coded, not `MATH_EXERCISE_PYTHON`) | `math-exercise.lua:757-758`, `variants.lua:24-33` (`:27`) |
| Option parsing | Every `#|` line anywhere in the block is YAML header; the rest is the question | `variants.py:173-193` (`:178-181`) |
| Values | Restricted AST interpreter over Python floats; `round`/`sigfig` half away from zero (F-69/F-74 fix) | `variants.py:11-71` |
| Enumeration and ID | Cartesian product in sorted name order; ID `v-` + sha256(base parameters)[:20] | `variants.py:124-151` |
| Substitution | `{{x}}` → `str(int(v))` if integral else `str(v)`; `.Nf`/`.Ng` → rounded `format()`; applied to question, solution, variant-context, **checker source** and **test fixtures** | `variants.py:75-85, 152-160` |
| Rendering | Question and solution Markdown → HTML through Pandoc (answer markers protected), math wrapped in `data-ai-feedback-tex` spans | `variants.lua:3-23, 28-31` |
| Page data | Exercise becomes a pool: `data-pool` = question HTML per variant; `data-variants` = the **whole** result: every variant's question HTML again, solution, substituted checker, tests, context, plus `options` holding the raw templates | `math-exercise.lua:845-852`; checked on `render/tri.html` |
| Selection (browser) | Stored ID in `sessionStorage['math-pool|<path>|<label>|id']`, else `Math.random()`; ↻ picks a different random index and clears the fields | `math-exercise.js:1468-1482, 1771-1791` |
| Per variant | `checkOpts.checker = record.checker` (templated source); solution injected into a `<details>` titled "Løsningsforslag / Solution"; `math-exercise:variant-change` event; `cell.mathExercise.getVariant()` | `math-exercise.js:1437-1467` |
| Checker data | custom mode: `response['variant'] = {id, parameters, derived, fingerprint, context}`, values are JSON numbers (floats for derived) | `math-exercise.js:1314-1318` |
| AI feedback | the rendered question is the task; `variant-context` is added as "Variant context" material; solution and tests are excluded | `math-exercise.js:1342-1350, 1454` |
| Review build | `math-exercise-review: true` in front matter (top-level key, not under `math-exercise:`) or `#| review: true` ships all candidates; a table per exercise (checkbox, "index · id", JSON parameters, "Run N tests" in Pyodide) and **Copy selection** → `#| reviewed-fingerprint:` + `#| include-variants: [...]` to paste into the QMD | `math-exercise.lua:995`; `math-exercise.js:1356-1390` |
| Staleness | fingerprint = sha256 of the whole definition minus selection keys; a mismatch outside review raises "Reviewed definition changed; enable review, then replace the selection block" | `variants.py:127-129` |
| Tests | variant fixtures: YAML `answers`/`response` + `expected`, run only by the browser review table, and in math-exercise's own repository by `tests/variants.test.mjs:47-53` (Python embedded in JS). The other `tests:` (Python `test(check, symbols)`, custom checkers) runs at build via `question-tests.py`, but is **rejected** in variant exercises ("tests must be a list") | `variants.py:108-117`; `math-exercise.lua:745-755`; `question-tests.py:29-44`; `docs/question-tests.md:117-119` |
| ctm-demo review | `_quarto-review.yml` renders `stack-oppgaver` into `_review-site` (not published, no artifact); CI renders both and `scripts/check-stack-variants.py` only asserts counts, resolved templates and that tests **exist** | ctm-demo `.github/workflows/quarto.yml:40-45`, `check-stack-variants.py:19-28` |
| ctm-demo glue | `assets/stack/page.js` (76 lines) reads `getVariant().parameters/derived`, posts them to the JSXGraph iframes (own `ctm-stack-figure` protocol), closes solution callouts, clears the AI activity, gives the question an id for `.ai-feedback` context, and adds `aria-label`s; `_filters/stack-content.lua` loads it | ctm-demo `assets/stack/page.js:18-74` |
| stack-sympy | seeds `seed … seed+variants-1` with Python's `random.Random` (not Maxima's); all frozen variants embedded; the learner chooses from a `<select>` "Variant N"; the question note is rendered but never shown; the XML's `<deployedseed>`s are parsed and unused; qtests run by `stack_sympy.cli test` or a review-only button | `stack-sympy.lua:104-118`; `cli.py:20-48`; `engine.py:110-337`; `importer.py:239` |

### 1.3 Problems

Severity follows the earlier audit: **major** = authors or learners hit it in normal use; **minor**; **info**.

**V-01 (major) — nobody can name "variant 3".**

- The learner gets `Math.random()` per tab (`math-exercise.js:1480`), kept in `sessionStorage`. A new tab or the next day gives a different variant.
- The card shows no number. The ID is a 20-hex hash in a data attribute.
- The review table numbers candidates in enumeration order and includes excluded ones, so its "3" is not the student's third.
- A student cannot tell the teacher which variant they had, except by reading out the numbers. The teacher cannot send a link to one variant.

**V-02 (major) — authored variant tests never run in a course build or CI.**

- ctm-demo's 650 fixtures over 325 variants are executed only when someone clicks *Run all authored tests* in a review build. CI only checks that they exist (`check-stack-variants.py:28`).
- Run natively they take about 3 s, together with math-exercise's examples (`scripts/run_fixtures.py`: 720 fixtures, 0 failures).
- The key `tests:` has two incompatible meanings: a YAML list in variant exercises, Python `test(check, symbols)` otherwise. Each form is refused or ignored in the other kind of exercise.
- Every authored test in ctm-demo is boilerplate: "model answers → correct" and "model answer + 1 → wrong", repeated per field (values.qmd: 8 + 8 lines of `expected`). Both can be generated automatically.

**V-03 (major) — approval is all-or-nothing, fragile and stored in the source.**

- **Any edit voids the approval.** The fingerprint covers the whole definition (`variants.py:127`), so a caption typo, a new test or a changed tolerance voids every approval. The student build then stops.
- **The stop message names neither file nor label.** It reads `math-exercise variants: Reviewed definition changed; …` (R7).
- **Copy selection pastes opaque IDs into the QMD.** For tangent it would paste a line of 159 twenty-hex IDs, about 4 KB, into the exercise source.
- **Nothing stops a review build reaching students.** `#| review: true` left in a file publishes the review table and all candidates; only ctm-demo's own script guards against that.
- **There is no GitHub-only way to review.** The review site is not published or uploaded anywhere.

**V-04 (major) — numbers are pasted into text and code as strings.** Reproduced with the real generator (`scripts/repro.py`):

| # | Source | Result |
|---|---|---|
| R1 | `{{ratio}}` with `ratio: bc/sqrt(ab^2+bc^2)` | `0.7682212795973759`; `{{x}}` of `0.1*3` → `0.30000000000000004` |
| R2 | `$y={{a}}x+{{b}}$`, a ∈ {1, −1}, b = −3 | `$y=1x+-3$`, `$y=-1x+-3$`; ctm-demo works around it with `x-({{p1}})`, so students read `\dfrac{x-(-1)}{x-(-3)}` |
| R3 | `{{x:.3g}}` of 12345 | `$1.23e+04$` in TeX |
| R4 | `{{s:.2f}}` of a rounded value just below 0 | `$-0.00$` (ctm-demo's `+0` workaround in `values.qmd:19-26`) |
| R5 | TeX `$e^{{x}^2}$` | build error "Unknown or malformed template placeholder"; ctm-demo writes `\frac{{{bc}}}{\sqrt{{{ab}}^2+{{bc}}^2}}` |
| R9 | fixture `-0.{{b}}` (math-exercise's perpendicular example) | b = 4 → `-0.4` (perpendicular, correct); b = 10 → `-0.10` (dot product 1.8): the fixture silently tests the wrong thing |

The checker source is templated too (`variants.py:152-153`). A Python checker therefore gets numbers pasted into its code as well as in `response['variant']`: two channels, one of them code generation.

Worked solutions show the unsimplified templates. Today's tangent variant p1 = −1, p2 = −3, x0 = −2 reads `f'(x)=\frac{ -1-(-3) }{(x-(-3))^2}` and `y=\frac{ -2-(-1) }{ -2-(-3) }+\frac{ -1-(-3) }{(-2-(-3))^2}(x-(-2))`. STACK would show the CAS-simplified forms.

**V-05 (major) — floats in variant data.**

- Derived values are binary floats (`variants.py:39-71`), so `response['variant']['derived']` hands checkers floats.
- Answer keys built from derived values (`_[{{ratio}}]`) become decimal strings, the F-67 class of bug. The docs ask authors to keep keys symbolic (`build-time-variants.md:41-42`), a rule the generator cannot enforce.

**V-06 (major) — size and leakage.**

- ctm-demo's `stack-oppgaver.html` is 2,296,033 bytes, of which 1,659,895 (72 %) are variant attributes (`scripts/measure.py` on `scratchpad/review-s1-final/courses/demo-new/_site/pages/stack-oppgaver.html`). Per exercise: tangent 895 KB, values 436 KB, angle 229 KB, triangles 100 KB.
- Each question's HTML is stored twice. Every student downloads 443 KB of worked solutions for all variants, 105 KB of test fixtures, and the raw templates (`options.question`, `options.solution`).
- The solution "reveal" is cosmetic, and there is no way to build a site without solutions (an exam site).

**V-07 (major) — two text dialects and two option parsers in one exercise type.**

- **Text.** Variant text goes through Pandoc's full Markdown (`variants.lua:15-21`; `reference.md:34-35`), so raw HTML in a variant body is passed through, against the owner's rule. Ordinary exercise text uses the inline subset, where HTML stays text (F-72).
- **Options.** Variant options are parsed as YAML; ordinary ones by the Lua line parser. ctm-demo's multi-line `field-labels` (`values.qmd:7-9`) and quoted `tolerance: '0.0005'` only work because the block has `parameters:`. Removing variants silently changes how the other options read.
- **P21's separator is swallowed.** A `#| lang: nb` line inside the body becomes the exercise option `lang: nb`, and both languages merge into one question with two answer fields (reproduced: `'Compute 1+1: _[1+1]\nRegn ut 1+1: _[1+1]'`). The Lua parser does the same (`math-exercise.lua:187`).

**V-08 (minor) — build errors are cryptic.**

- An unknown placeholder `{{b}}` stops the render with `math-exercise variants: 'b'` / `Error running python3 (error code 1): <no output>` and about 50 lines of Lua stack trace, with no file, label or line (`render/broken.log`).
- `python3` is hard-coded (`variants.lua:27`), while question tests honour `MATH_EXERCISE_PYTHON`. On Windows `python3` may not exist.

**V-09 (major) — the course has to write glue.**

- **Sync script.** ctm-demo's 76-line `page.js` plus a course filter keep figures, solutions, AI activities and aria labels in step with the variant, using its own postMessage protocol.
- **Out-of-card solutions.** `solution-target` exists so solutions can live in a callout elsewhere on the page.
- **Every course would need the same.** Nothing of this is reusable by another course.

**V-10 (minor) — accessibility and language.**

- **↻ button.** It has only a `title` (`math-exercise.lua:855`), clears typed answers without warning (`selectTask`), and announces nothing. Focus stays on the button.
- **Review table.** Checkboxes are labelled "Include v-a2c4…", and parameters are raw JSON.
- **Hard-coded strings.** All review strings and the bilingual solution title "Løsningsforslag / Solution" (`math-exercise.js:1358-1386, 1455`) are outside ctm-libs' catalogue, which holds only `poolReloadTitle`.

**V-11 (major for P17) — saved answers cannot work as is.**

- **Choice is per tab.** The variant choice lives in `sessionStorage` per tab, and the feedback snapshot records the pool index, not the ID (`math-exercise.js:1534`).
- **What P17 needs.** P17's record `{v, saved, source-hash, variant, inputs, result}` needs a stable variant identity that survives rebuilds and approvals, and a rule for a saved variant that was later withdrawn.

**V-12 (info) — other formats.**

- **Non-HTML output.** It prints the raw block, including answer keys, fixtures and `{{…}}` templates (`render/tri.md`, rendered to GFM).
- **Printing.** The HTML page prints the current variant.

**V-13 (minor) — stack-sympy behaves differently.**

- **Learner picks the variant.** The learner chooses from a menu, so there is no random assignment and no persistence.
- **No note, no deployed seeds.** The STACK question note, which is how STACK tells variants apart, is computed but unused. Moodle's `<deployedseed>`s are imported but meaningless, because the port's RNG is not Maxima's (its authoring guide says so).
- **No tests in the build.** qtests are not run during the build.

**V-14 (minor) — pools.**

- **Index identity.** Pool tasks are identified by index (`math-pool|<path>|<label>` = index), so inserting a task shifts what a returning student sees.
- **No key check.** Answer keys are never tested; a typo in a key is invisible.
- **Used in ingmat3a.** The 7 pools there must keep working.

**Worth keeping:**

- deterministic, fast generation (all 325 in 0.1 s);
- value-based IDs that survive reordering;
- no `eval` (AST whitelist);
- rounding that matches `decplaces`/`sigfigs` (F-69/F-74);
- solutions and tests excluded from AI requests;
- one browser protocol (`getVariant()` plus an event);
- refusal to build with stale approvals rather than silently publishing them.

---

## 2. STACK's model: what to adopt and what not

| STACK concept | What STACK does | Adopt? | How here |
|---|---|---|---|
| Question variables | Maxima assignments evaluated once per variant; random functions `rand`, `rand_with_step`, `rand_with_prohib`, `rand_selection`; values used in text, inputs' teacher answers, PRTs and tests (`Authoring/Variables.md`, `CAS/Random.md`) | **Yes**, in each component's own language | math-exercise: `#| variables:` (Python/SymPy subset); stack-sympy: XML `questionvariables` unchanged |
| "Enumerate, don't loop" | STACK advises picking from lists and avoiding conditional loops (`Random.md`) | **Yes** | math-exercise random choices are finite (`pick`, `sample`, `shuffle`) and constraints filter (`require`), so the space can be enumerated and every candidate regenerated from its values |
| Seeds | a variant is an integer seed; `stack_seed` allows systematic deployment | **Partly** | STACK questions keep seeds as their locator. math-exercise uses the picked values as the locator: readable and robust when a list grows. Both show a small stable number `n` |
| CASText `{@…@}` / `{#…#}` | `{@e@}` inserts LaTeX, adds math delimiters outside math and keeps the outer braces inside math; `{#e#}` inserts the raw value (`Authoring/CASText.md`) | **Yes**, same syntax in math-exercise | ends `{{…}}`, the `x-({{p}})` idiom and triple braces; signs and fractions come from SymPy |
| Question note | "Two question variants are equal if and only if the question notes are equal"; the teacher can put the answer in it (`Question_note.md`) | **Yes** | `#| note:` template (math-exercise), `<questionnote>` (STACK). Teacher-facing only: review page, manifest, lookup of "variant 7". Never sent to students or to the AI. Duplicate notes are skipped when proposing |
| Deploying variants | pre-generate, run all question tests on each, drop the ones you do not like; "deploy # of variants"; deploy specific seeds (`Deploying.md`) | **Yes** | proposals of N candidates, approve/reject per variant, the manifest is the deployed list, tests run per deployed variant |
| Question tests | per variant; inputs are CAS expressions in the question variables (`simp:false`), plus `RAW:` strings; "every question should have a test on the teacher's answer and one incorrect response" (`Testing.md`) | **Yes** | test inputs are expressions in the variables language (no string templating), with `raw("…")` for literal input; the teacher-answer test and wrong-answer probes are automatic |
| `s_assert` | guard in question variables that makes a variant unusable | **Yes** | `require(…)` |
| Bulk tester | runs all tests on all deployed variants; lists questions with no tests, no deployed variants or no worked solution (`Bulk_testing.md`) | **Yes** | `ctm variants check` in CI, with a job summary |
| Matched variants | "Random group" shares seeds between questions; fragile by STACK's own account (`Deploying_matched_variants.md`) | **Not now** | possible later as `#| variables-from: <label>` |
| Attempt state, penalties, Moodle question bank, capabilities, re-grading, statistics grouped by note | server-side, per attempt | **No** | static pages; the browser keeps a learner's variant and answers (P17); GitHub permissions and CODEOWNERS replace Moodle capabilities |
| Maxima RNG compatibility | Moodle's seed 17 is a particular variant | **No** (state it) | stack-sympy's RNG differs; Moodle deployed seeds cannot be reused, so imported questions are approved again |

---

## 3. Design options

### 3.1 What the design must deliver

1. **Authoring in plain Markdown.**
   - Variables written once, exact arithmetic.
   - Placeholders that display numbers and formulas correctly.
   - Worked solution and translations in the body without `#|   ` prefixes.
   - No HTML.
2. **Per variant: identity, note and approval.**
   - Each variant has a stable identity and a number people can say.
   - A teacher-facing note.
   - An approve/reject decision tied to the variant's *content*, so an approval stops counting when the generated numbers or answers change.
3. **Tests that cannot be skipped.**
   - Automatic per-variant tests (teacher answer, wrong answers) plus authored ones.
   - Run at build time and in CI, natively, with the same code as the browser.
4. **The same model for STACK questions,** with STACK semantics kept for STACK grading and display.
5. **A simple student side.**
   - Learners keep their variant across visits, which works with P17.
   - Teachers can link to a variant.
   - Only approved variants are shipped.
6. **Two approval flows, one file format.**
   - Local VS Code and GitHub-only, both simple for a teacher who is not a programmer.
   - CI enforcement, with clear permissions.

### 3.2 Option A: repair today's model in place

- **What changes.** Keep `parameters`/`derived`/`constraints` and exhaustive enumeration. Fix the parts that hurt:
  - exact derived values (Python `fractions` plus a few exact functions);
  - `{@…@}`/`{#…#}` instead of `{{…}}`;
  - solution in the body;
  - one `tests:`;
  - approvals in a per-exercise manifest instead of the QMD;
  - fixtures run at build time and in CI;
  - number display and a stable per-learner choice.
- **stack-sympy.** It only adopts the manifest format.
- **For.**
  - Smallest change.
  - No SymPy needed to generate.
- **Against.**
  - Numbers only, so formulas in answers and solutions still come from string templates. The ugliest output (R2, tangent solutions) stays.
  - Two variant models remain (STACK seeds, math-exercise products).
  - Not STACK-like in what matters: CAS-computed teacher answers and simplified display.

### 3.3 Option B (recommended): one shared variant model, native variable languages

The model, records, manifest, proposals, tests per variant, approval page, CI, student-side selection and checker contract are shared. Each component keeps its natural way of *computing* variables:

- **math-exercise** gets a Python/SymPy subset (its checkers are Python/SymPy already). Values are exact; `diff`, `factor`, `subs` and others are available; display goes through SymPy's LaTeX.
- **stack-sympy** keeps the XML's Maxima question variables and CASText, evaluated by its bounded port under STACK semantics (decided: STACK checks follow STACK rules).

The shared code lives in ctm-checkers (`ctm_checkers.variants`, Python) and ctm-libs (Lua plumbing, review page and student UI in JS). Details in §3.6.

- **For.**
  - Fixes every problem in §1.3.
  - One approval flow and one student experience for both components.
  - STACK-like where it matters: CAS values, notes, deployed variants, tests per variant.
  - Exact arithmetic.
  - ctm-demo loses its glue.
- **Against.**
  - The largest change.
  - Pages with `variables` need native SymPy at build time (ctm-demo has it; ingmat3a has no variables).
  - Two variable languages remain, deliberately.

### 3.4 Option C: STACK's language everywhere

math-exercise variables would be written in STACK's Maxima subset (`a : rand(5)+2;`) and evaluated by `ctm_checkers.stack`'s bounded evaluator, with seeds as identity for both components.

- **For.**
  - One language and one generator (already audited, with proven Pyodide parity).
  - STACK authors feel at home.
- **Against.**
  - A math-exercise block would mix Maxima variables with Python checkers.
  - The STACK port rejects floats in frozen variants and lacks much of SymPy.
  - Values computed under STACK semantics would be graded under SymPy semantics (`I`/`E`, branch cuts: S-02/S-03 in the stack audit), a quiet source of mismatches.
  - Seeds make "all variants" and readable IDs awkward (systematic deployment through `stack_seed` arithmetic).
- **Not recommended.**

| | A: repair | **B: shared model** | C: STACK language |
|---|---|---|---|
| Formulas in answers, display and solutions | string templates | **SymPy, exact** | Maxima port |
| One approval model and UI for both components | format only | **yes** | yes |
| Language a math-exercise author already knows | YAML expressions | **Python/SymPy, like checkers** | Maxima |
| Grading semantics stay per component | yes | **yes** | risk of mismatch |
| Build dependency for variant pages | PyYAML | PyYAML + SymPy | PyYAML + SymPy (port) |
| Work | small | medium | medium |

### 3.5 Recommendation

**Option B.**

### 3.6 The recommended design in detail

#### a. Authoring syntax (math-exercise)

Rules:

1. **Options are the leading `#|` lines only (YAML).** Later `#|` lines in the body are separators, which also fixes P21's case (V-07):
   - `#| solution` starts the worked solution of the current language;
   - `#| lang: xx` starts the text of another language (P21).
2. **`#| variables: |`** takes one statement per line:
   - `name = expression` or `require(condition, …)`;
   - `#` starts a comment, and `^` means power.
3. **Values are exact.** Integers stay integers, `0.1` is 1/10, and `1/3` is a rational.
   - Random choices must be the whole right-hand side: `pick([…])`, `pick(low, high[, step=…, exclude=[…]])` (inclusive), `sample(list, k)`, `shuffle(list)`.
   - A variant is identified by its picked values, for example `p1=-3 p2=2 x0=1`.
4. **Functions available:**
   - `sqrt`, `sin`… `atan2`, `exp`, `log`/`ln`, `abs`, `floor`, `ceiling`, `min`, `max`, `gcd`, `lcm`;
   - `diff`, `integrate`, `expand`, `factor`, `simplify`, `together`, `cancel`, `apart`;
   - `subs(expr, x, value)`, `Matrix`, `det`, `inv`, `transpose`.
   - Rounding to exact values: `round(x, n)` and `sigfig(x, n)` (half away from zero on the exact value, one rule with `decplaces`/`sigfigs`; F-69/F-74 cannot recur).
   - Display-only decimals: `dispdp(x, n)` (fixed places) and `dispsf(x, n)` (significant figures). These are STACK's names; using them in arithmetic is an error.
   - No attributes, imports, loops or definitions. Errors name the file, label and variables line.
5. **Placeholders**, in the text, solution, note, `context-text` and answer markers:
   - `{@expr@}` gives LaTeX: `$…$` is added outside math, and the outer braces are kept inside math, so `\dfrac{@x - p1@}{@x - p2@}` works.
   - `{#expr#}` gives the value in input syntax, as a student would type it (`2/(x + 3)^2`).
   - The expression is evaluated in the variables. `\{@` gives a literal.
6. **Other options:**
   - `#| note:` is the teacher-facing description.
   - `#| variants: N | all` sets how many approved variants are wanted (default 10); the tools propose that many.
   - `#| context-text:` replaces `variant-context` and works in any exercise.
7. **Removed:** `parameters`, `derived`, `constraints`, `solution`, `solution-target`, `variant-context`, `review`, `include-variants`, `exclude-variants`, `reviewed-fingerprint`, and front-matter `math-exercise-review`.

ctm-demo's tangent exercise in the new syntax (`proto/examples/tangent.qmd`; 41 lines, today 76):

````markdown
```{math-exercise}
#| label: stack-tangent
#| context: stack-conventions, stack-tangent-context
#| mode: equivalent
#| vars: x
#| partial-credit: true
#| field-labels: u derivert, v derivert, f derivert, Tangentens høyreside
#| variables: |
#|   p1 = pick([-3, -2, -1, 2, 3, 4])
#|   p2 = pick([-3, -2, -1, 1, 2, 3, 4], exclude=[p1])
#|   x0 = pick(-2, 2, exclude=[p2])
#|   f  = (x - p1)/(x - p2)
#|   df = factor(diff(f, x))
#|   y0 = subs(f, x, x0)
#|   k  = subs(df, x, x0)
#|   tangent = y0 + k*(x - x0)
#| note: f(x) = {#f#}, x0 = {#x0#}, tangent y = {#expand(tangent)#}
#| variants: 20

Finn den deriverte og tangenten til $f(x)=\dfrac{@x - p1@}{@x - p2@}$ i punktet $({@x0@},f({@x0@}))$.
Funksjonen er ikke definert når $x={@p2@}$.
Bruk brøkregelen $\left(\dfrac{u}{v}\right)'=\dfrac{u'v-uv'}{v^2}$, med $u(x)={@x - p1@}$ og $v(x)={@x - p2@}$.
Skriv **eksakte uttrykk**; bruk brøker i stedet for avrundede desimaltall.

$u'(x)=$ _[1], $v'(x)=$ _[1]

$f'(x)=$ __[{#df#}]

Tangenten har likning $y=$ __[{#tangent#}]

#| solution
Vi har $u'(x)=1$ og $v'(x)=1$. Brøkregelen gir

$$f'(x)=\frac{({@x - p2@})-({@x - p1@})}{({@x - p2@})^2}={@df@}.$$

Tangentpunktets høyde er $f({@x0@})={@y0@}$, og stigningstallet er $f'({@x0@})={@k@}$, så

$$y={@y0@}+{@k@}\,({@x - x0@})={@expand(tangent)@}.$$

Algebraisk likeverdige former godtas.
```
````

For p1 = −1, p2 = −3, x0 = −2 the prototype produces:

- the question `f(x)=\dfrac{x + 1}{x + 3}`;
- the keys `2/(x + 3)^2` and `2*x + 3`;
- the solution `f'(x)=\frac{(x + 3)-(x + 1)}{(x + 3)^2}=\frac{2}{\left(x + 3\right)^{2}}`, then `y=-1+2\,(x + 2)=2 x + 3`.

Today's version of the same variant appears under V-04.

The other three exercises are in `proto/examples/`:

- **triangles** (28 lines, today 47): `ab = pick(3, 8)`, `offset = pick(1, 4)`, `ratio = bc/ac`, `$\frac{EF}{DF}=\frac{@bc@}{@ac@}\approx{@dispdp(ratio, 3)@}$`.
- **angle** (27 lines, today 41).
- **values** (39 lines, today 96): the eight keys become `{#sigfig(sin(r1), 2)#}` and so on, with no `+0` tricks and no boilerplate tests.

**Tests** (one key, both forms everywhere, each run once per deployed variant):

```yaml
#| tests:
#|   - name: sign error in f'
#|     answers: [1, 1, -df, tangent]          # expressions in the variables
#|     expect: [correct, correct, wrong, correct]
#|   - name: decimals typed by a student
#|     answers: [1, 1, raw("2/(x+3)^2"), raw("2x+3")]
#|     expect: correct
```

- **Python form.** `#| tests: |` with `def test(check, symbols, variant)` is the programmer's form. `variant.variables`, `variant.teacher` and `respond(*raw_strings)` are provided; `respond` goes through the real parser (MATH-25).
- **Custom responses.** JSON responses use `response: {point: {x: radius, y: 0}}`, with values evaluated, never pasted into strings (R9).

**Checker contract** (H1, one key in both components). Recommended: the question data goes under **`variables`**. That is STACK's term, the key the STACK proposal used, and the name of the new math-exercise option. `variant` keeps only the identity, so a checker cannot come to depend on which variant it grades.

- `response["variables"]`: every variable as an exact SymPy object, rebuilt in Pyodide from `srepr` strings.
- `response["teacher"]`: the teacher answers in the same shape as the learner's part of the response (math-exercise: per field; STACK: by input name).
- `response["variant"]`: `{n, id, hash}`, identity only. Checkers should not branch on it.

`response["variant"]["parameters"]` and the templated checker source disappear.

#### b. STACK questions (stack-sympy)

````markdown
```{.stack-question}
#| label: expand-product
#| file: questions/polynomial-expansion.xml
#| question: Expand a product (form-sensitive)
#| variants: 12
#| checker: |          # H1, optional
#|   ...
#| tests: ...          # H1, optional; the XML qtests always run
```
````

- **No XML edits.** Question variables, CASText and the question note come from the XML.
- **Proposals.** Seeds 1, 2, 3… are proposed, skipping a seed whose question note repeats an earlier one (STACK's equality rule) and seeds whose qtests fail. The locator is `seed=17`.
- **Removed.** `#| seed:` and the learner's `<select>`.
- **Tests per approved seed.** The XML qtests, plus "teacher answers score 1 on every PRT" when the XML has no such test, plus wrong-answer probes on algebraic inputs. STACK semantics apply, including its rounding (S-06 decision pending).

#### c. Identity, number and content hash

| Field | What | Who sets it |
|---|---|---|
| `id` | the locator: math-exercise `p1=-3 p2=2 x0=1` (picked values in order), STACK `seed=17` | generator |
| `n` | display number, given at the first decision, never reused, never renumbered ("Variant 7") | tools |
| `hash` | sha256 (16 hex) of **what the generator produced**: the answer keys in field order, and the set of resolved placeholder values in input syntax across question, solution and all languages | generator |
| `note` | copy of the resolved note, for people reading the file | tools |
| `status`, `reason`, `by`, `date` | the decision | teacher, through the tools |

Why this hash:

- **What voids an approval.** A changed number or answer voids it; so does a new or different generated value shown to students.
- **What does not.** Hand-written prose is reviewed in the source diff, so a typo fix, a translation that reuses the same placeholders or an unused helper variable leaves approvals intact.
- **SymPy printing.** LaTeX is not hashed, so a SymPy printing change does not void approvals; input syntax is far more stable.

Scenarios run with the prototype on the converted tangent exercise, after 18 approvals and 1 rejection (`proto/scenarios.py`):

| Edit | Result |
|---|---|
| typo in the prose | 18 deployable, nothing to review |
| English section added (same placeholders) | 18 deployable |
| unused helper variable added | 18 deployable |
| `x0` range widened from −2…2 to −3…3 | 18 deployable; 221 candidates, 202 undecided (new ones appear) |
| `p1` renamed `a` everywhere | IDs change, content does not: all 19 decisions **carried over by hash** ("moved") |
| solution additionally shows `k` as a decimal | 18 "changed", 0 deployable: review needed |
| bug: `tangent = y0 - k*(x - x0)` | 18 "changed", 0 deployable: the bug cannot reach students |

#### d. The manifest

**One file per exercise, `_variants/<label>.yml`.**

- Labels are already the stable exercise keys for P17.
- The `_` folder is neither rendered nor published.
- One small file per exercise means few merge conflicts and an easy target for the web editor.
- The build finds it without knowing which include file defined the exercise. Quarto inlines includes before filters run, so a file *beside* the include could not be located.
- The format is deterministic. Hand edits of `status`/`reason` are allowed; the tools validate everything else.
- A renamed label orphans its file. `check` reports it, and when its hashes match the new label's candidates the tools offer to rename it.

`_variants/stack-tangent.yml`, as written by the prototype (`proto/manifest.py`). The label is repeated inside so that a misnamed file is caught, and the comment names the source that defines the exercise:

```yaml
# Variant decisions for _includes/stack/tangent.qmd. Written by the CTM review page or
# `ctm variants`; you may change status (approved/rejected) and reason by hand.
schema: 1
stack-tangent:
  - n: 1
    id: p1=2 p2=-1 x0=1
    hash: 7380452c28c64da4
    status: approved
    note: "f(x) = (x - 2)/(x + 1), x0 = 1, tangent y = 3*x/4 - 5/4"
    by: aacchhee
    date: 2026-10-20
  # … n: 2 to 18 …
  - n: 19
    id: p1=-1 p2=-2 x0=0
    hash: 482f8f101079ef9f
    status: rejected
    reason: too easy with x0 = 0
    note: "f(x) = (x + 1)/(x + 2), x0 = 0, tangent y = x/4 + 1/2"
    by: aacchhee
    date: 2026-10-20
```

The build classifies each entry:

- **current**: same id, same hash;
- **changed**: same id, different hash; the approval no longer counts;
- **moved**: id gone, exactly one candidate has the same hash; the decision carries over;
- **gone**: no match.

Undecided candidates are "new".

#### e. Generation, proposals, deployment

- **Where it runs.** Generation runs at build time only, natively. The browser never generates.
- **Candidates.** The adapter enumerates the candidate space; limit 20 000, beyond which candidates are sampled deterministically.
- **Proposals** follow a fixed order seeded by the label, so they are reproducible.
  - The first `variants:` minus already approved, undecided candidates are proposed.
  - Candidates with duplicate notes and candidates failing the automatic teacher-answer test are skipped and listed.
  - A rejection makes the next candidate appear.
- **Deployment modes** (`ctm-assessment: variants: approval: …`, read key by key per P20/F-79; also `CTM_VARIANTS=…` for CI):
  - `optional` (proposed default, for authoring). Approved current variants are deployed. An exercise with none deploys its proposals, with a build warning ("stack-tangent: 20 unreviewed variants deployed"). Rejected variants are never deployed.
  - `required` (for publishing builds; ctm-demo sets it). Only approved current variants are deployed; an exercise with none stops the build with "*file*: *label*: no approved variants (12 new, 6 changed). Review: Terminal → Run Task → CTM: Review variants, or the review page of this pull request."
  - `review` (the review profile). All candidates are shipped, with statuses, a "Review build — not for students" banner and `?variant=` links.
- **Cache.** Results are cached in `.quarto/ctm-variants/` by definition, manifest entry and ctm-checkers version, so `quarto preview` stays fast. All 325 ctm-demo variants take about 3.5 s from cold in the prototype.
- **Errors** always name file, label, variant `n`/id and line.

#### f. Tests per variant, at build time and in CI

The same runner in ctm-checkers runs natively at build time, in CI and for the review page; the browser runs the same wheel (step-2 design). For each variant it checks:

1. **Teacher answers.** Every field's key, or STACK's `tans`, must be graded correct. A failure is an error.
2. **Wrong-answer probes**, generated from each key and kept only if they differ numerically from the key at sample points:
   - expressions: `k+1`, `2k`, `−k`, `k(x+1)`;
   - numbers: just outside the tolerance or the rounding, and just inside it, which must be correct;
   - sets: one element dropped or added;
   - strings: one character changed.

   A probe graded correct is a **warning** ("suspicious: `2*k` accepted"), shown on the card and in CI, not a failure; a course may make it strict.
3. **Authored tests** (§a), and the XML qtests for STACK. A failure is an error.

- **At build:** only for deployed variants; failure stops the render with a precise message.
- **In CI:** `ctm variants check --strict` runs everything over all approved variants of the project. It fails on failing tests, changed or gone approvals, or exercises without approved variants (when approval is required), and writes a Markdown table to the job summary.
- **Cost.** About 3 s for all of ctm-demo natively (V-02).
- **Pools** get checks 1 and 2 in `check` when SymPy is installed. Rendering never needs it (ingmat3a's CI has no SymPy, F-73).

#### g. The approval page

**How it is built.**

- `ctm variants page` scans the project's sources for exercise blocks with `variables` and for `stack-question` blocks.
- It writes a git-ignored `variants-review.qmd` with one block per exercise, marked `#| review: cards`, plus a JSON report of all candidates, statuses and test results.
- `quarto render --profile variants-review` then renders it, together with the course pages in review mode, into `_variants-review/`.
- ctm-libs supplies the profile template (5 lines, copied once into the course), the card UI (`review.js`, `review.css`) and the strings (en/de/nb).
- The page is rendered by the real filters, so questions look exactly as students see them.

What it shows:

```text
CTM variants review · ctm-demo · branch tangent-fix · 3f2a9c1 · 20 Oct 2026
● Connected: decisions are saved to _variants/*.yml          [Rebuild]
stack-tangent  20 wanted: 12 new · 6 approved · 1 changed · 1 rejected   [Show problems only]
stack-angle    71 wanted: 71 approved
──────────────────────────────────────────────────────────────────────────────
stack-tangent · _includes/stack/tangent.qmd          [Approve all new that pass]
┌ New 4 ──────────────────────────────────────────────────────── ✓ all tests ┐
│ Note: f(x) = (x + 3)/(x - 2), x0 = 1, tangent y = 1 - 5*x                 │
│ Student view  [nb | en]                                                    │
│   Finn den deriverte og tangenten til f(x) = (x+3)/(x−2) i punktet (1, f(1))│
│   f'(x) = [ −5/(x−2)² ]   y = [ 1 − 5x ]          (teacher answers)        │
│ Checks: teacher answers 4/4 correct · wrong answers 11/11 rejected ·       │
│         authored tests 1/1                                                 │
│ ▸ Variables  ▸ Worked solution  ▸ Try it (Check)  ▸ Open in page           │
│ [ Approve ]  [ Reject… ]                                                   │
└────────────────────────────────────────────────────────────────────────────┘
┌ Variant 7 · CHANGED since approval by aacchhee on 20 Oct ──────────────────┐ …
```

- **Content per card:** the note, the student view per language, teacher answers (rendered, plus how to type them), the verdicts on the teacher answers and on each generated wrong answer, authored tests and qtests with expected and actual, variables, the solution, a live "Try it", and "Open in page" (the course page in the review build with `?variant=`, for figures and context).
- **Bulk actions:** "Approve all new that pass" and "Approve again: changed, answers unchanged" (for example after a SymPy upgrade changed a display).
- **Accessibility:** ordinary buttons with names such as "Approve new 4: f(x) = …"; status is shown in text, not only colour.

**Two modes, same page:**

- **Connected** (served by the local helper). Each click is saved at once and the card shows "Saved".
- **Read-only** (Pages preview, artifact, `quarto preview`). Choices are kept in the browser, and per exercise the page offers:
  - **Copy file**: the complete new `_variants/<label>.yml`, emitted by the page in the same deterministic format; a golden test keeps the JS and Python writers byte-identical;
  - **Open in GitHub editor**: the file on the branch; for a new file GitHub's new-file link can prefill name and content;
  - **Download all**.

#### h. Recording decisions: the two flows

Options compared:

| Way to record | Teacher effort | Infrastructure | Security | Use |
|---|---|---|---|---|
| Local helper (`ctm variants review`) | click | Python on the teacher's machine | 127.0.0.1 only, random token, Host/Origin check, writes only `_variants/<known label>.yml` | **VS Code flow** |
| Copy file → GitHub web editor | 3 clicks + paste per exercise | none beyond the preview | the commit is the teacher's own | **GitHub flow (default)** |
| PR checklist ticked → bot commit | tick boxes | one privileged workflow | see below | GitHub flow, optional |
| `workflow_dispatch` form (label, approve list, reject list) | fill a form | same workflow | dispatch needs write access | GitHub fallback, bulk |
| CLI `ctm variants approve <label> 3 4 5` | type | Python | — | programmers, scripts |
| Hand-editing YAML | edit text | none | — | small fixes (`status`, `reason`) |
| `quarto preview` plus a helper reached by CORS | click | two processes, token file | CORS for one origin | possible alternative; the single-process helper is simpler |

**Local VS Code flow.** The course template ships tasks "CTM: Review variants" and "CTM: Check variants" next to ctm-demo's existing "Preview website".

1. Edit `_includes/stack/tangent.qmd` and save.
2. **Terminal → Run Task → CTM: Review variants.** The task runs `python _extensions/ctm-libs/ctm.py variants review` (written `ctm variants …` elsewhere in this report), which generates, tests, writes the page, renders the review profile, serves `_variants-review/` at `http://127.0.0.1:<port>/?token=…` and opens the browser. **Rebuild** (or saving the source, which the helper watches) refreshes it.
3. Click **Approve** / **Reject** on the cards, or **Approve all new that pass**. `_variants/stack-tangent.yml` is written immediately.
4. Source Control shows the two changed files; commit and push. CI (below) checks the same things. `quarto preview` meanwhile shows only approved variants and prints warnings for undecided ones.

**GitHub-only flow (G1, default; no privileged workflow needed for decisions).**

1. On github.com, edit the exercise (pencil icon) → **Commit changes… → Create a new branch and start a pull request** → **Create pull request**.
2. The course workflow `variants.yml` runs in a few minutes. It comments on the PR: "CTM variants: stack-tangent 12 new, 6 changed. Open the review page", linking the Pages preview `…/previews/variants-<branch>/variants-review.html`; the same table is in the job summary. The publish job must keep `previews/` when it deploys `main`; math-exercise's examples workflow clears them.
3. On the review page, approve or reject, then per exercise click **Copy file** → **Open in GitHub editor** → select all, paste → **Commit changes** (to the PR branch).
4. That human commit triggers CI normally. The `variants / check` status turns green, and the teacher merges. The publish build on `main` runs with `approval: required`.
   - If the source changed after the preview was built, the pasted hashes no longer match, and the check names the variants to look at again.

**GitHub-only, optional automation (G2/G3).**

- **The checklist comment.** The bot comment lists each proposed variant as a task-list line: ``- [ ] stack-tangent · new 4 · f(x) = (x + 3)/(x - 2), x0 = 1 · tests ✓ · `p1=-3 p2=2 x0=1 #d5b03d0ab9deee5b` ``. Anyone with write access may edit (tick) comments, including the bot's (GitHub: "Anyone with write access to a repository can edit comments on issues, discussions, pull requests, and commits").
- **Recording.** `variants-decide.yml` (`on: issue_comment: types: [created, edited]`) reads ticked lines and `/variants reject stack-tangent 4 "reason"` commands. It verifies, records and commits:
  - the sender's permission (`gh api repos/{repo}/collaborators/{user}/permission` ∈ admin, maintain, write; optionally an `approvers:` list);
  - that the comment is the bot's;
  - that the PR is **not** from a fork.

  It records the ids and hashes from the comment with the tool from the *base* branch, editing YAML only and running no course code. It commits to the PR branch with `by: <login>`.
- **Re-running the checks.** A push made with `GITHUB_TOKEN` does not start the PR workflows by itself (GitHub creates no run, or one waiting for approval), so the job ends with `gh workflow run variants.yml --ref <branch>`. `workflow_dispatch` always creates a run, and its checks attach to the head commit.
- **G3.** The same job behind **Actions → Variants: record decisions → Run workflow** (branch, label, `approve: all-passing` or `3,4,5`, `reject: 2`).

**Permissions and security.**

| Job | Trigger | `permissions` | Notes |
|---|---|---|---|
| `check` | `pull_request`, `push`, `workflow_dispatch` | `contents: read` | runs course code (variables, checkers) unprivileged; fork PRs work, with no secrets |
| `preview` | same, only when `head.repo == base repo` | `contents: write` (gh-pages via `peaceiris/actions-gh-pages`, as math-exercise's `previews/<branch-slug>/`), `pull-requests: write` (sticky comment) | no previews or comments for forks |
| `decide` (G2/G3) | `issue_comment`, `workflow_dispatch` | `contents: write`, `pull-requests: write`, `actions: write` | workflow from the default branch; never checks out and executes PR code; same-repo PRs only; sender permission verified |
| publish (existing) | `push` to `main` | `contents: write` | `CTM_VARIANTS=required` |

- **Who may approve.** People with write access, enforced natively: branch protection requires the `variants / check` status, and CODEOWNERS `/_variants/ @<teachers>` with "Require review from Code Owners" makes every approval change pass a named teacher. `by:` is informational; git history is the audit trail.
- **No `pull_request_target` builds.**
- **Public previews.** On a public repository the Pages preview is public and contains every candidate's answers, including rejected ones. Fine for ctm-demo, whose student pages contain all deployed answers anyway. For a sensitive course, use the artifact only (the verdicts are precomputed, so the page is readable from a downloaded zip; only "Try it" needs a server), private Pages (Enterprise), or the local flow.

#### i. The student side

- **Payload.** One `<script type="application/json">` per exercise, holding only deployed variants: `{n, id, hash, question (Markdown with markers), solution (HTML), variables (srepr), values (JSON numbers/strings for figures)}`.
  - No tests, no templates, no duplicates.
  - The question goes through the same renderer as ordinary exercise text: inline Markdown subset, HTML shown as text (ends V-07's dialects). Solutions are Pandoc Markdown with raw HTML removed.
  - Estimated from the prototype (Markdown text; HTML solutions add some): about 0.35–0.45 MB for all 325 ctm-demo variants (today 1.66 MB), about 0.2 MB with tangent at 20.
- **Choosing.** Shared in ctm-libs `variants.js`, used by both components:
  1. a variant saved in the learner's P17 record, if still deployed;
  2. else a `?variant=<label>:<n>` link;
  3. else **rendezvous hashing**: the variant with the highest hash of (learner seed, page, label, id). The learner seed is a random value kept once in `localStorage` under P17's key scheme, `ctm|1|<site base>|<page>|…`.

  The same learner then gets the same variant on every visit without saving anything. Approving another variant moves only about 1/N learners; withdrawing one moves only those who had it.
- **↻ "New variant".** It walks that learner's ranking, so all variants come before repeats. It asks first if fields are filled, announces "Variant 5" in an `aria-live` region and moves focus to the question. The choice is stored with the P17 rules: `localStorage` when saving is on, else `sessionStorage`.
- **Number.** "Variant 3 of 18" is shown near ↻ (option to hide), so a student can say it and the teacher looks up `n: 3` in the manifest or the review page.
- **Saved answers (P17).** The record's `variant` is the id; its `source-hash` is the variant `hash`.
  - If the saved variant was withdrawn or changed, the answer is offered, not filled in ("This variant is no longer used; show your answer?").
  - `ctm:result` carries `variant: n`.
- **Accessibility.** Covered above; strings are in ctm-libs' catalogue (en/de/nb).

#### j. Checkers, AI feedback, figures

- **Checkers.** As in §a: `variables`, `teacher`, `variant`, the same in both components and at build time.
- **AI feedback.**
  - Sent: the rendered question of the active variant and `context-text`.
  - Never sent: the note, teacher answers, variables or solution (unless the author writes them into `context-text`).
  - Each exercise's question carries the id `<label>-question`, so an `.ai-feedback` activity can list it in `context=` without a page script (ctm-demo's `page.js:32-35` today).
- **Figures.** A new option `#| boards: stack-tangent-board` makes math-exercise post `{protocol: "ctm-variant", label, n, id, values}` to that JSXGraph iframe on load and on every change, resending on its "ready". The board code listens with a few lines. A helper `JXG.QuartoAssessment.onVariant(fn)` in the jsxgraph-quarto fork is optional; the protocol needs no upstream change.

#### k. Pools

- **Syntax unchanged** (ingmat3a's 7 pools need nothing).
- **Inside the shared model,** pools are hand-written variants with no approval:
  - `n` is the position;
  - `id` is a short hash of the task text, so P17 notices edits;
  - selection, ↻, number, links and saving are shared;
  - teacher-answer and probe checks run in `ctm variants check`.

#### l. Where the code lives

| Piece | Repository | Notes |
|---|---|---|
| `ctm_checkers.variants`: record, content hash, manifest load/dump/classify/decide, proposals, deployment modes, per-variant runner (teacher answer, probes, authored tests), report, CLI (`page`, `review`, `check`, `approve`, `reject`, `record`, `migrate`), local helper (stdlib `http.server`) | **ctm-checkers** | component-neutral core; adapters register with it (H2: no import between `math_exercise` and `stack`) |
| `ctm_checkers.math_exercise.variables`: language, enumeration, placeholders | **ctm-checkers** | rounding from `math_exercise.numeric` (one rule with `decplaces`) |
| `ctm_checkers.stack.variants`: seed → record (note, tans, CASText outputs), note-dedupe proposals, qtests per seed | **ctm-checkers** | small additions to `engine`/`rendering` (collect placeholder outputs) |
| `lua/variants.lua`: runs `python -m ctm_checkers.variants build` in `ctm.checkers.environment()`, maps errors to file/label messages, embeds deployed records | **ctm-libs** | the Lua side reads no YAML: the rules live in Python, once |
| `variants/variants.js` (selection, ↻, number, links, P17 hook, `ctm:variant-change`), `variants/review.js` + CSS, `locales/variants.js`, `tools/ctm.py` launcher, templates (`_quarto-variants-review.yml`, `variants.yml` workflow, `tasks.json`) | **ctm-libs** | the review page emits the manifest text (golden-tested against Python) |
| option parsing, body separators, marker rendering of variants, `boards`, question context id; delete `variants.py`, `variants.lua` and the review table | **math-exercise** | pools onto `variants.js` |
| seeds → proposals and manifest; card selection from `variants.js`; delete `<select>`, `#| seed:` | **stack-sympy** (step 6) | qtests per approved seed at build |
| docs ("Variants and approval", one guide), course templates, umbrella tests | **ctm-assessment** | reusable workflow for courses |

**Sequence in the consolidation:**

| Step | Repository | Work |
|---|---|---|
| V1 | ctm-checkers | variants core plus `math_exercise.variables`, with goldens for the 325 ctm-demo variants and the 16 examples |
| V2 | ctm-libs | Lua, JS, review page, launcher |
| V3 | math-exercise | new syntax, old code removed |
| V4 | ctm-demo | migration |
| V5 | stack-sympy | adapter, in step 6 |
| V6 | ctm-assessment | docs and templates |

- **Ordering.** V1 can follow step 2's C2 directly.
- **P17.** `variants.js` uses the P17 store when present, otherwise its own keys under the same scheme.
- **Goldens.** The intended `data-variants` change is a separate, explicit golden update. The verdicts per variant must not move (`proto/compare.py`'s check).

### 3.7 Migration plan for ctm-demo (and math-exercise's examples)

1. **Rewrite** the four `_includes/stack/*.qmd` as in `proto/examples/` (260 → 135 lines).
   - Drop the boilerplate tests; the automatic checks cover them.
   - Solutions move into the exercise body, and the empty `#stack-*-solution` callouts in `pages/stack-oppgaver.qmd` go.
2. **Approve.** Set `ctm-assessment: variants: approval: required` in `_quarto.yml`, run **CTM: Review variants**, and approve: all 24/71/71 and 20 tangent (owner's choice, §4). Commit `_variants/stack-{triangles,values,angle,tangent}.yml`.
3. **Replace the old review setup.**
   - `_quarto-review.yml` → `_quarto-variants-review.yml` (template).
   - Delete `scripts/check-stack-variants.py`.
   - Workflow: add `ctm variants check --strict`, render the review profile, add the preview job for same-repo PRs, set `CTM_VARIANTS=required` for publishing.
   - `.gitignore`: `_variants-review/` and `variants-review.qmd` instead of `_review-site/`.
4. **Delete the glue.** Remove `assets/stack/page.js` and `_filters/stack-content.lua`.
   - Figures get `#| boards:` and a 5-line `ctm-variant` listener in `scripts/generate-stack-figures.py`'s board template.
   - `.ai-feedback` activities reference `stack-*-question`.
   - Aria labels come from `field-labels`.
5. **Verify.**
   - Every approved variant's keys match today's (as `proto/compare.py` already shows for all 325).
   - Both builds render; the page shrinks (expected to about 0.85–1.1 MB from 2.3 MB, since 0.64 MB of it is not variant data).
   - CI is green; the README and `help.qmd` describe the two tasks.
6. **math-exercise's own examples.** Convert the 5 definitions (perpendicular, matrix, coupled and geometry read `response['variant']['parameters']`, which becomes `response['variables']`). `generated-variants.qmd` becomes a normal page plus the review profile. Tests: `test_variants.py` moves to ctm-checkers V1; `variants.test.mjs` and `variants-render.test.mjs` test the new client.

**One-release alias, if wanted.**

- **What it would keep:**
  - the old path next to the new one: `variants.py` (197 lines), `variants.lua` (34), the review table (~40 lines of JS), the old `getVariant()` shape and `math-exercise:variant-change`, and `response['variant']['parameters'|'derived']`;
  - `include-variants`/`reviewed-fingerprint` read side by side with the manifest, with a deprecation warning;
  - both documented, and both test suites (14 Python, 3 Node) run against both.
- **Cost.** Roughly one to two days, plus a doubled test matrix for a release, to protect one repository that migrates in the same campaign.
- **Recommendation: no alias.** `#| parameters:` stops the build with "math-exercise 0.11 replaced parameters/derived/constraints by `variables:`; see docs … or run `ctm variants migrate <file>`". `migrate` is a small optional converter: lists to `pick`, `{{x}}` to `{#x#}`, `{{x:.2f}}` to `{@dispdp(x, 2)@}`, `solution:` into the body. Its output still needs a human look, which the review page provides.

### 3.8 Prototype evidence

- **Variables language.** `proto/variables.py` (345 lines) implements the language (AST interpreter over SymPy, `pick`/`require`, enumeration, regeneration from an id, placeholders with math detection). `proto/manifest.py` implements hash, YAML writer, classification and decisions.
- **Equivalence with today.** `python3 -I proto/compare.py me demo proto`: all 325 ctm-demo variants regenerated from the new syntax.
  - Parameter sets are identical.
  - Answer keys are symbolically equal (tangent) or numerically identical: maximum difference 1.8e-16 for values, which is today's float noise against exact keys.
  - Enumeration takes 0.5 s in all, text and keys 2–3 s.
- **Approval scenarios.** `python3 -I proto/scenarios.py proto` produces the scenario table in §3.6c.

---

## 4. Open questions for AC

1. **Default approval mode.** `optional` by default (unreviewed proposals deploy with a warning; enforcement in CI and publishing builds via `required`), or `required` everywhere? Also: should ctm-demo deploy all 24/71/71 candidates as its README promises, and how many tangent variants (20 proposed)?
2. **Variables language and placeholders.** Confirm the Python/SymPy subset for math-exercise (option B, not STACK's Maxima syntax, option C) and STACK's `{@…@}`/`{#…#}` replacing `{{…}}`. Should STACK's random-function names (`rand`, `rand_with_step`, `rand_with_prohib`) also be accepted in math-exercise as aliases of `pick`?
3. **What an approval covers.** The proposal: generated values and answer keys, so prose edits and translations keep approvals and the source diff covers them. The alternative is STACK-strict: any change to the exercise voids every approval.
4. **GitHub flow to ship.** G1 only (copy into the web editor; no write-permission workflow for decisions), or also the PR checklist bot (G2) and the dispatch form (G3)? Should CODEOWNERS for `_variants/` be part of the course template?
5. **Public review previews.** For public course repositories, the Pages preview exposes all candidates' answers and solutions. Acceptable as the default (ctm-demo), or artifact-only by default with previews opt-in?
6. **Moodle deployed seeds.** stack-sympy's random generator is not Maxima's, so Moodle's deployed seeds cannot be reproduced. Accept "imported STACK questions are approved again in CTM", or is a Maxima-compatible generator worth pursuing?

## AC's decisions (19 Oct 2026, binding; override the sections above)

1. **Build mode:** `required` is forced as the default: students get only approved, unchanged variants. `optional` exists but is never a default (ctm-libs, components, umbrella, templates). `review` is for the approval page. **Default `#| variants:` is 25 per question** (all of them when the question has fewer); ctm-demo uses the default unless a question says otherwise.
2. **Variable language:** the Python/SymPy subset with `{@ @}` / `{# #}` placeholders, plus aliases for STACK's random-function names (`rand`, `rand_with_step`, `rand_with_prohib`, …).
3. **Approval scope:** an approval is voided only by changed generated values or answer keys; prose edits, translations and variable renames keep it.
4. **GitHub flow:** the checklist bot ships from day 1 (permission check, no forks, dispatches the re-check), alongside the web-editor path; CODEOWNERS for `_variants/` in the course template.
5. **Public previews:** allowed by default (nothing is secret; the published pages carry answers for in-browser checking anyway).
6. **Moodle seeds:** imported STACK questions are re-approved here; no Maxima-compatible generator.
7. **Old syntax:** broken, no alias. ctm-demo is refactored (and stack-sympy where needed) in the same round. No converter. The old `#| parameters:` key gives a one-line build error that names the new key and the docs page (no users, so nothing more).
8. **Checker key (H1):** `response["variables"]` (exact SymPy values) and `response["teacher"]` in both components; `response["variant"]` holds only `{n, id, hash}`.
9. **Saving restores the exact variant:** a student's saved record (P17) stores the variant's id and hash, never an index, and reopening the page restores that variant with its answers. If that variant is no longer deployed (rejected or changed), the student is told so in one line, the old answers stay readable, and a new variant is offered.
10. **New variant on request:** a visible, labelled "New variant" button (not just ↻), keyboard-accessible and localized; it asks before clearing entered answers, does not repeat a variant until the student has seen them all, announces the new number ("Variant 7 of 25"), and the choice is saved like everything else.
11. **Approval views work like STACK's deployed-variants and question-tests screens:** for each question an overview first, one row per candidate variant: number, status, the parameter values (the generated variables, compact, or the `#| note:`), the computed correct answers (teacher answers, rendered as maths), and the test verdict; the student view and solution open from the row. This holds for the approval page and for the PR bot. In the bot's comment each variant is a checklist item (GitHub can't tick boxes inside a table), carrying the same facts on one line with GitHub's `$…$` maths and a link to its card in the preview; one comment section per question, collapsed with a summary line when long.

## Amendments after the independent review (REVIEW.md) and AC's answers of 19 Oct (binding)

**AC's answers.**
12. **Grading options void approvals:** the hash also covers `mode`, `tolerance` and the other grading options (see B1 below).
13. **Answer shape (B3):** fields are named by their labels; `#| variables:` makes `#| field-labels:` obligatory (build error naming the exercise otherwise). Keys are the labels exactly as written in the exercise's default language; a translation changes only what is shown. STACK uses its input names. In both components a checker gets `response["answers"]` and `response["teacher"]` as dicts keyed by those names, `response["variables"]` for question data, and `response["expressions"]` stays the positional list as today (existing checkers keep working). A checker shared by a math-exercise and a STACK question works when the labels equal the input names; the cross-component test checks one such pair. No `ans1…` convention is imposed.
14. **Pools join the shared model now** (AC approved the visible change for ingmat3a): stable per student, restored on save, "New variant" button. The pool id is computed in Lua, so pool pages still need no Python at build time; hand-written pool tasks need no approval.
15. **`required` and previews:** non-publishing renders (`quarto preview`, the review profile) show unapproved variants with a visible "not approved" banner; publishing renders and CI stop when an exercise has no approved variant.

**Review findings, decided by the coordinator within AC's decisions.**
- **B1 hash:** the content hash covers the resolved maths segments of question and answers in order, the answer keys and the grading options — so swapping placeholders or changing a value in the prose voids approvals; rewording, translations and variable renames still do not.
- **B2 identity:** restore looks up by hash, then by number `n`, then by id; selection and the no-repeat cycle key on `n`, so renaming a variable reshuffles nobody.
- **Trust model:** `#| variables:` is author code with the same trust as the rest of a Quarto render (which already runs author code); no string reaches `sympify`; each variable and each variant has a time budget, and an over-long generation stops the build naming the exercise.
- **Step-2 fit:** tools are run as scripts, never `python -m`; the authoring tooling is a separate module outside the browser wheel; the migration message names no version.
- **Option parsing stays as today** (Lua line parser); only the block values `variables:` and `tests:` are parsed as blocks, so no existing exercise breaks.
- **STACK classification** matches on hash first; **`rand` aliases follow STACK's semantics exactly**, including `rand(n)` excluding n and arithmetic around `rand(...)`.
- **Students see the stable number** ("Variant 31"), not a position; the total is not shown as "of N".
- **Storage:** one key per course (not per language profile, P21), the saved record includes the variants already seen, the variant hash replaces P17's source-hash rule for variant exercises, and without the save opt-in the choice lasts for the session only.
- **Fewer than 25 approved:** the approved ones deploy; a publishing build warns below the target and stops at zero. The approval page has bulk approve with undo.
- **Bot:** one sticky comment per question listing only undecided or changed variants (a summary comment linking the review page beyond about 30 open questions); each line carries a hidden `label n id hash` token and the bot reads only its own comments by token; one decide job at a time per PR, reprocessing the whole state; recorded lines lose their checkbox; the preview job merges unrecorded ticks before rewriting. Tick = approve; reject with `/variants reject <n…>` or on the page. Numeric keys print as decimals; maths uses `` $`…`$ ``. Concurrency group per PR, script-injection guards, permission check, no forks; whether a dispatched check satisfies the required check is tested in the first PR. CODEOWNERS on `_variants/` without "require review from code owners" (a solo maintainer must be able to merge); the required check is the gate.
- **ctm-demo's `page.js`:** iframe titles, the layout resend on tab switch and clearing the explanation activity on variant change move into the components; the page script goes.
- **Deferred:** wrong-answer probes, the dispatch form, file watching in the helper, the build cache, byte-identical JS/Python manifest writers.
- **Corrections to §1:** variant data is 2.07 MB of the 2.30 MB page as served (152 KB vs 75 KB gzipped); R9 is a latent trap, not a live bug; the `#| lang:` swallowing matters once P21 is built.
16. **`required` stays the default (AC, after discussion);** `optional` is a one-line project setting, documented for fast iteration. Revisit the default after ctm-demo has gone through review. **Bulk approval in the bot:** each question's comment starts with one "Approve all passing variants of this question" checkbox; ticking it approves every listed variant whose tests pass (failing ones stay undecided and are named in the bot's reply). It is processed like any other tick (one decide job per PR, idempotent), and the approval page offers the same action with undo.
17. **"Was → now" for changed variants (AC):** each manifest entry stores a compact snapshot of what was approved — the generated variable values and the teacher answers (canonical strings, the same ones the hash covers) — next to the hash. A changed variant is shown on the approval page and in the bot as "was → now" per value and answer, with unchanged ones greyed; no git history is needed. The snapshot is written by the tools only; hand edits to it are rejected by `check`. Low effort is the goal (AC: many STACK authors skip pre-testing variants because it is work): the page and the bot offer "approve again" for changed variants whose answers are unchanged, and the default view shows only what needs a decision.
18. **Hint after many rejections (AC):** when a question's rejections pass a threshold (for example a third of its decided variants, at least 5), the approval page and the bot show one hint: add a `require(...)` condition to `#| variables:` so such cases are never proposed. The hint lists the rejection reasons and, where the rejected variants share a value the approved ones never have (e.g. `x0 = 0` in all of them), suggests the matching condition (`require(x0 != 0)`) as text to copy — never applied automatically. Kept rejections and approvals are unaffected by adding the condition, since identities are value-based.
19. **Question tests for every mode, common with STACK (AC, 19 Oct):** one declarative `tests:` key (each test: a name, the answers per field — expressions in the question's variables or `raw("…")` student strings — and the expected verdict per field or overall, optionally score/partial) runs through the exercise's real grading in every mode (`equivalent`, `numeric`, … and `custom`), at build time and in CI; a failure stops the build naming the exercise. Today's `mode: custom` `test(check, symbols)` keeps working. It is its own PR, the first after step 2 (ctm-checkers `testing` runs it), before the variants PRs, which then run the same tests per approved variant; stack-sympy's H1 adopts the same key and format, aligned with STACK's question tests (inputs + expected score/answer note), so one format serves both components.

## Amendment for STACK questions on the Maxima backend (AC, 22 Oct 2026, binding; overrides decision 6 for that backend)

Source: the system design audit of native Maxima, Erasmus-CTM/stack-wasm-maxima
`reports/2026-10-22-system-design-audit.md` (§4 F-8 and §8, D1).

20. **Each STACK backend generates its own variants.** A STACK question is
    graded either by the SymPy engine or by native Maxima (`stack: cas: sympy |
    maxima`, `#| cas:` on a block; the component becomes ctm-stack at step 6).
    The generator is the grading backend's; there is no shared generator.
    - **SymPy backend:** decision 6 stands unchanged: imported STACK questions
      are approved again here.
    - **Maxima backend:** the seed is STACK's (`stack_randseed`, as STACK seeds
      a question), so a seed means the same variant as in Moodle once the
      acceptance test below has passed. The variant tools then import the
      XML's `<deployedseed>`s into `_variants/<label>.yml` as approved entries
      (`reason: imported from Moodle`, with the "was → now" snapshot of
      decision 17 and the resolved question note), so a teacher can bring a
      course whose variants they are happy with. The XML question tests still
      run on every imported seed, as for any approved variant (decision 19); a
      failure stops the build. The approval page shows each imported seed's
      question note, which the teacher compares with Moodle's "Deploy
      variants" list (STACK: equal notes, equal variants).
    - **Acceptance test before the import is offered:** the seed path from
      STACK's PHP to `stack_randseed` confirmed; Maxima's Lisp Mersenne Twister
      giving the same numbers under ECL (the Wasm build) as on a Moodle server;
      and, for STACK sample questions with deployed seeds, equal question notes
      from desktop STACK and from the Maxima backend. Until it passes, the
      Maxima backend proposes seeds like any other generator and imported
      seeds are not marked approved.
    - **Moving a question from SymPy to Maxima** (moves go one way only) gives
      it new variants: its manifest entries become "changed" or "gone" by the
      usual classification and need approval again; saved student answers
      follow decision 9 (the student is told in one line).

## Amendment for routine author review (AC, 23 Oct 2026, binding)

21. **Small tested batches, stable approvals.** Routine generation proposes 25 valid, different candidates per question (or fewer when the space is exhausted). The approval page has a labelled, keyboard-accessible and localized **Generate 25 more** action. New proposals preserve existing approved candidates, their stable numbers and decisions; expanding author ranges must not replace them or reorder existing proposals. Only candidates surviving constraints and resolved question-note deduplication count towards the requested batch. A grading or authored-test failure is an error naming the question and candidate, never a reason to silently discard it and draw another.
22. **Review is part of authoring.** Keep `required` as the default. Publishing builds and CI fail when a new variant question has no approved candidate; below the requested target they warn, as already decided. An explicitly selected `optional` mode permits unapproved deployment with a warning; non-publishing/review previews remain available with the unapproved banner. AC described this explicit exception as “OPEN”; this does not introduce a new option spelling.
23. **No routine unchecked 20,000-candidate pool.** Generate the requested batch and run its checks automatically; offer another small batch on demand. Large unchecked spaces are forbidden in the normal review workflow. The low-level exhaustive API's raw-path safety limit is a diagnostic resource bound, not a normal candidate target or a switch to another proposal policy. Implement finite attempt/time bounds so impossible or heavily constrained requests stop with a useful diagnostic rather than looping indefinitely. These resource limits do not count invalid or duplicate candidates towards 25.
