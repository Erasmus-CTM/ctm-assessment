# Independent review of the October 2026 consolidation

Review of the consolidation decided in the [October 2026 audit](../audit-2026-10/README.md) (§4, §5, §5b) and logged in
[docs/consolidation/README.md](../consolidation/README.md), as merged on 26 October 2026. The reviewer did not work on this
code. Conclusions come from reading the code and running the repositories' own tests at the snapshot below. Authors'
summaries, PR descriptions and CI logs were not taken as evidence that something works.

Every `file:line` refers to the snapshot commit of its repository:

| Repository | Ref | Commit |
|---|---|---|
| Erasmus-CTM/ctm-libs | main | `1240908d05c1` |
| Erasmus-CTM/ctm-checkers | main | `aae41a65ad29` |
| Erasmus-CTM/ctm-stack | main | `7a473b47d514` |
| Erasmus-CTM/ctm-assessment | main | `4ec5cebf02f1` |
| Erasmus-CTM/math-exercise | main | `f4c345b8f128` |
| Erasmus-CTM/py-exercise | main | `dadf3c61ca1a` |
| Erasmus-CTM/pyodide-interaktiv | feature/shared-feedback-integration | `73566eddf35e` |
| aacchhee/jsxgraph-quarto | audit/2026-10 | `49a1c7d575e0` |
| aacchhee/ctm-demo | main | `9b7e45793188` |
| aacchhee/ingmat3a_ntnu | main | `42591e760f50` |
| Erasmus-CTM/stack-wasm-maxima | main (only its contract with ctm-stack) | `0ad29867af1f` |

Out of scope:
- P13 (shared worker, SEB exam IDE). The review notes only where it attaches and the risks the current code creates
  for it (§6).
- Step 7 and the variants approval rework. These are designs; the review comments only on whether the foundation
  suits them (§7).

---

## 1. Summary for AC

**Verdict.**
- The consolidation's structural goals are mostly met. There is:
  - one shared library: ctm-libs, with the runtime, locator, settings reader, catalogue, feedback, UI and store;
  - one checker library: ctm-checkers;
  - one bootstrap, byte-identical in all four components and checked in three places;
  - one Pyodide version in shipped code;
  - one worker implementation: CTMWorker.
- The courses install only `ctm-assessment`.
- **No blocking defect was found:**
  - no wrong grade on main: ctm-checkers' 8,939 golden rows reproduce locally against the built wheels;
  - no XSS from model output: about 60,000 fuzzed renders with a positive control;
  - no forgeable cross-frame message;
  - no committed secret;
  - no exploitable workflow.
- **What did not keep up:**
  - **Release discipline:**
    - no tag or release exists in any repository;
    - ctm-libs has said `0.9.0` since 19 October;
    - API levels stopped tracking interfaces;
    - the package CHANGELOG stops at 22 October.
  - **Enforced cross-repository testing:** AC tests every umbrella merge by hand, and nothing untested has reached
    a course. But no automatic check catches a ctm-libs change that breaks a consumer, and no protected branch or
    required check makes AC's gate mandatory. ingmat3a, a live course, builds from umbrella `main`.
  - **Several user-facing documents:** an install command printed by a render error installs the September version;
    ctm-stack's README example fails to render.
- The process put most of its effort into making the merged trees equal the tested trees, and that works. The cost:
  - in the umbrella, about 470 lines of package code and about 25,000 lines of test, harness, tooling and CI code in
    one week;
  - roughly 35,000 CI job-minutes in that week;
  - many "calibration" rounds of harness fixtures.

  The things it did not check are those that reach authors and students: versions, releases, docs, branch protection
  and consumer tests on every change.

**Most important findings** (the full list is in §3):

| # | Sev. | Finding | Repo |
|---|---|---|---|
| H2 | high | ctm-checkers' grading-regression gate (golden replay and mutations) runs only on manual dispatch, and has not run since 23 Oct. Two grading mutations passed the PR gate (reproduced) | ctm-checkers |
| H3 | high | Component CI tests other dependency commits than the package ships. Nothing compares `pins.json` files with `repos.json` | all components |
| H4 | high | pyodide-interaktiv's render error and three install guides say `quarto add Erasmus-CTM/pyodide-interaktiv`. Without a ref this installs `main`, which is 1.6.1 (30 Sep): a downgrade | pyodide-interaktiv, ctm-libs, ctm-assessment |
| H5 | high (latent) | JSXGraph boards cannot load MathJax in local/exam builds (`data:` iframe plus a relative asset path). The render neither stops nor warns | jsxgraph-quarto, ctm-libs |
| H6 | high | ctm-stack's README example fails to render (`seed:` removed, `label:` missing). Its documented defaults are wrong | ctm-stack |
| H7 | high (legal, opinion) | pyodide-interaktiv's own docs say the code carried over from coatless-quarto/pyodide has no licence. The package ships it as AGPL | pyodide-interaktiv, ctm-assessment |
| M0 | medium (was H1) | Consumer testing before umbrella `main` relies on AC's manual campaign. Umbrella PRs skip the build and `--test` job, and no `main` is protected, so nothing enforces or records the gate. ingmat3a follows umbrella `main` | ctm-libs, ctm-assessment, ingmat3a |
| M1 | medium | AI-feedback maths loads a floating `katex@0.16` from jsDelivr, outside the asset resolver and lock, also in `assets: local` builds | ctm-libs |
| M2 | medium | In local/exam mode, learner code calling `micropip.install` goes to pypi.org (reproduced with real Pyodide 0.28.3) | ctm-libs |
| M3 | medium | The "fixed" learner-answer admission (`__` rule) still runs arbitrary Python (`exec(...)`) and can patch grading for the rest of the page. In SEB exams this answer box is the learner's only code channel | ctm-checkers |
| M4–M6 | medium | ctm-libs is frozen at version 0.9.0, so the "two installations" guard cannot fire. API levels lag. No release exists, and `release-check.py --tag v0.13.0` passes today with notes from 22 Oct | ctm-libs, ctm-checkers, ctm-assessment |

**Recommended order** (all small except the last):
1. Make AC's manual gate a required check and protect `main` (M0, M9). Make the cheap cross-repo tests automatic
   (H2, H3, M11).
2. Fix the user-facing commands and docs (H4, H6, DOC items).
3. Once releases exist, pin ingmat3a to a release tag for the semester (M0, M6).
4. Bump versions and API levels, write the CHANGELOG, tag a release (M4–M6).
5. Settle the licence question (H7).
6. Route feedback KaTeX through `CTMAssets` (M1). Neuter micropip's index in local mode (M2). Use the existing
   `admit_learner` allowlist for authored answers before P13 exams (M3).
7. Reduce process weight (§5): one pin source of truth, full campaigns only for release candidates.

---

## 2. Did the consolidation achieve the audit's goals? (question 1)

| Goal (audit §4, §5b) | State | Evidence |
|---|---|---|
| One shared library, ctm-libs | **mostly** | Runtime, locator, settings reader, catalogue, feedback, UI, store, nav and CTMWorker are in ctm-libs. Retired copies are guarded (`RETIRED_COPIES`, `setup-feedback-integration.py:160-196`) |
| Byte-identical copies disappear | **yes** | `feedback-loader.lua` ×3 and `pyodide-runtime.js` ×2 are gone. `ctm-bootstrap.lua` is identical in ctm-libs `bootstrap/`, math-exercise, py-exercise, pyodide-interaktiv and ctm-stack (one sha256). It is checked by the umbrella builder, ctm-stack CI (`.github/actions/ctm-dependencies/action.yml:80-82`) and pyodide-interaktiv's sync check |
| Checkers in ctm-checkers | **yes** | `check_one_home` guards it. stack-sympy's vendored runtime, matrix input and `assess_basis` are gone. ctm-stack uses `ctm.checkers.require('ctm-stack','1.1')` |
| CTM Assessment the one install | **yes for courses** | Both courses list only `ctm-assessment`. Standalone components stop with the install command (bootstrap `:41-42`) |
| Step-1 loaders and helpers (Monaco, KaTeX, MathJax, `escapeHtml`, bridge client, `AIFeedback.mount`) | **not done**, though the step table says step 1 is merged | M12 |
| Step 3 (`ctm-docs`: one `example-source.lua`) and step 7 (one `review-dependencies.py`) | **not done** | L9, L10 |
| Versioned releases | **not done** | M6 |
| P16 (preload, status lamp) | **not done**, though step 5 is "merged except P13" | M12 |

**Remaining duplication** (measured by cross-repo sha256 and diff):
- **Monaco loader and editor:** py-exercise `py-exercise.js:30-39`, `:394-404`; pyodide-interaktiv
  `qpyodide-cell-classes.js:28-33`, `:639`, `:665`. py-exercise lacks pyodide-interaktiv's CRLF→LF and dark-theme
  fixes (`grep setEOL|vs-dark` finds nothing in py-exercise).
- **KaTeX loaders:** math-exercise `math-exercise.js:58-87`; ctm-libs `feedback/feedback-dom.js:189-207` (M1).
- **MathJax loader:** ctm-stack `ctm-stack.js:97-140`, with its own `mathjax@3.2.2` fallback at `ctm-stack.lua:157`.
- **`escapeHtml` (6+ copies):**
  - math-exercise `math-exercise.js:13-23`;
  - py-exercise `py-exercise.js:48`;
  - inside ctm-libs: `feedback-dom.js:6`, `ui/ctm-matrix-input.js:5`, `ui/ctm-export.js:5`.
- **Assessment-bridge client (three diverged copies):**
  - math-exercise `math-exercise.js:644-734`, which has a `settled` guard;
  - `variants-board.js:40`;
  - ctm-libs `feedback-dom.js:388-430`, which has no `settled` guard and an English-only label at `:430`;
  - plus ctm-demo `assets/stack/figure-common.js:41`.
- **Hand-built feedback adapters:** py-exercise `py-exercise-feedback.js`, pyodide-interaktiv `qpyodide-feedback.js`.
- **New since the audit:** `variants-review.py` is 94% identical in math-exercise and ctm-stack (M13).
- `example-source.lua` ×5 in three generations. The oldest still has the sha256 that appendix C recorded (L9).
- `review-dependencies.py` ×3, with three different allow-lists (L10).
- The Lua dynamic-matrix twin in math-exercise (`math-exercise.lua:357-470`) next to ctm-libs `ui/ctm-matrix-input.js`
  (L11).

**Dead or retired code still shipped or kept:**
- "Accepted in 0.9 only" aliases are still accepted at 0.13: `setup-feedback-integration.py:155`,
  `install-project.py:55,110`, `repos.json` `review-ref-aliases`.
- `--refresh` "without effect" (`setup-feedback-integration.py:291`).
- `KEEPS_RETIRED_COPIES = ()` (`:25`).
- pyodide-interaktiv `.github/ctm-libs-target.json`.
- The ctm-libs README still documents the removed `ai-feedback` alias (L12).
- pyodide-interaktiv's 8,492-line ctm-libs copy is 47 commits old (M3).

Deliberately kept and fine:
- pyodide-interaktiv's `ai-feedback` forwarder (P14, decision 5).
- The `mainPyodide`, `qpyodideInstance` and `MathExerciseRuntime` globals as the runtime's public names.

**Component behaviour that bypasses ctm-libs:**
- the feedback KaTeX load (M1);
- ctm-stack's MathJax;
- py-exercise's Monaco loader;
- the feedback widget's own locale resolver, which maps `nn` to `nb` while `CTMLocales` resolves `nn` (L7);
- the bridge-client copies;
- consumer class names hard-coded in ctm-libs' context filter (`feedback-dom.js:254-256`).

---

## 3. Findings, ranked

Type: **R** = defect reproduced by running code; **C** = defect shown from code or measurements; **O** = opinion.

### High

#### H2. ctm-checkers' grading-regression gate runs only by hand; grading mutations pass the PR gate (R)
**Where:** ctm-checkers `.github/workflows/test.yml:99-107`. All three golden and mutation steps are
`if: workflow_dispatch && confirmation == 'broad testing campaign'`. `tests/test_mutations.py:270-271` skips the
module, including the "unchanged copy reproduces the tables" test (`:300-303`). The PR step
`golden.py check-changelog` (`:88-92`) only inspects PRs that edit golden rows.

**Evidence:**
- Mutations `round-half-even` (`numeric.py`) and `tolerance-strict` (`checks.py`, `<=`→`<`) were applied and the
  wheel rebuilt. The PR gate stayed green:
  - `build.py --check` passed;
  - `check-changelog` passed;
  - `pytest` on src and wheel gave 1670 passed, with only the same 3 missing-Quarto failures as on clean `main`.
- `golden.py verify --adapter wheel --suite recorded` catches the mutations: 1082 of 1109 rows reproduce, against
  1109 of 1109 on `main`.
- The GitHub API shows 0 `workflow_dispatch` runs of `test.yml` since the gating commit `6bbdc36` (23 Oct). 29 commits
  touched `src/` since then.
- `main` is fine today: 8,939 of 8,939 rows reproduce locally.
- 133 of the 137 skips per CI run are the mutation module. The other 4 are covered by `native-stack.yml`.

**Impact:** a change that silently alters grades merges green in ctm-checkers. This is the regression class the
goldens exist to stop, and step 7 is about to add grading options. The umbrella's manual parity campaign does exercise
grading before an umbrella merge (7,206 graded responses with zero differences on 26 Oct), so the change would be seen
there, but only at the next campaign and only for the corpora it covers.

**Fix:** run `golden.py verify --adapter wheel` (exported, recorded and STACK tables; 2–4 minutes) on every PR that
touches `src/`. Keep only the mutation suite manual.

#### H3. Component CI tests different dependency commits than the package ships, and nothing checks agreement (C)
The package (`integration/feedback/repos.json`) ships ctm-libs `6f464e6`, ctm-checkers `406df58` and JSXGraph
`aacchhee/49a1c7d`. Each component's own CI uses:

| Component CI | Tests with | Gap to the shipped commit |
|---|---|---|
| ctm-libs `tests/pins.json:5` | ctm-checkers `8c3db5e` (0.2.0, API 1) | 169 commits; the package ships 0.12.0.dev0, API "1.1" |
| pyodide-interaktiv `.github/ctm-libs-source.json:3` | ctm-libs `626b546` | 31 files differ |
| pyodide-interaktiv `assets-guards.yml:14` | ctm-libs `19b5116` | 32 files differ |
| ctm-stack `.github/pins.json:5` | ctm-libs `4a63de6` | 16 files differ |
| math-exercise `actions/quarto-dependencies/action.yml:62`, `parity.yml:88` | upstream jsxgraph `v1.1.0` | the package ships fork `49a1c7d`, JSXGraph 1.14.2 |

- Only math-exercise's `pins.json` and py-exercise `example.yml:24` match the package.
- The umbrella's own pins elsewhere range from 120 to 390 commits old: ctm-libs `tests/pins.json` and ctm-checkers
  `tools/pins.json` both point at `9ed46a4`.
- No umbrella script reads any `pins.json`.

**Impact:** "component CI green" says little about the combination students get. Only a manual umbrella campaign tests
it (M0).

**Fix:**
- Add a source-job check that each pinned component's `pins.json` (or `ctm-libs-source.json`) at its pinned commit
  agrees with `repos.json`.
- Or generate every component's pins from `repos.json` with a bot PR after each set merge.

#### H4. The "install again" command in pyodide-interaktiv's render error installs version 1.6.1 (C)
**Where:**
- pyodide-interaktiv `_extensions/pyodide-interaktiv/qpyodide.lua:9`
  (`STANDALONE = "quarto add Erasmus-CTM/pyodide-interaktiv"`, used at `:15` and `:20`), printed through
  `ctm-bootstrap.lua:44-50`;
- pyodide-interaktiv `docs/installation.md:27,30`;
- ctm-libs `docs/installation.md:42-56`;
- ctm-assessment `docs/installation.md:186-188`.

**Evidence:**
- The default branch `main` is `02cbb90` (30 Sep). `git show origin/main:_extensions/pyodide-interaktiv/_extension.yml`
  gives `version: 1.6.1`, with no `_extensions/ctm-libs`.
- The 1.9/1.10 line exists only on `feature/shared-feedback-integration`. pyodide-interaktiv's own
  `docs/installation.md:10` uses the right ref.

**Impact:** a user who follows the error message downgrades to a version with none of the documented features.

**Fix:** put `@feature/shared-feedback-integration` in `STANDALONE` and in the three guides until step 8. Or make that
branch the default branch.

#### H5. JSXGraph boards cannot load MathJax in local/exam builds, silently (C; latent)
**Where:**
- jsxgraph-quarto `_extensions/jsxgraph/lua/jsxgraph.lua:841-849`: every board is
  `<iframe src="data:text/html;base64,…" sandbox="allow-scripts">`.
- `:828`, `:839`: `src_mjx` is written verbatim into a `<script src>` inside that document.
- ctm-libs `_extensions/ctm-libs/lua/assets.lua:66-71`: in local mode `src_mjx` is rewritten to a page-relative
  `…/_ctm-assets/npm/mathjax@4.1.3/…`.

**Problem:** a relative URL has no usable base inside a `data:` document. The planned step-5b fork options (`srcdoc`,
`src_mode`, `mjx_fonts`) do not exist in the fork (grep). Nothing stops a local-mode render of a page with
`.jsxgraph`: `read-settings.ts:453-456` refuses only author `http` URLs.

**Impact:**
- In an exam or firewalled build, boards with TeX labels show raw TeX.
- The 2,174-file board subset in every bundle cannot be used.
- Today no offline artefact contains boards: the Python ZIP has none.

**Fix:** until 5b lands, stop a local-mode render when the page uses JSXGraph (`ctm.deps.uses(doc).jsxgraph`), naming
5b. Then implement 5b and add a local-mode board page to the offline checker.

#### H6. ctm-stack's README example fails to render; defaults documented wrongly (C)
**Where:** ctm-stack `README.md:50-58`. `ctm-stack.lua:78` fails on `seed:`, and `:79` requires a `label:` that the
example lacks.

| README says | Code does |
|---|---|
| `:65`: `variants` 1–20, default 1 | `ctm-stack.lua:96`: 1–100, default 25 |
| `:69`: `feedback` default false | `:5`, `:168`: `auto` |
| `:63`: source panels always shown | `:153`: off by default |
| `:23`, `:41-46`: `quarto add Erasmus-CTM/ctm-stack` plus `filters: [ctm-stack]` | the package already runs it (`_extensions/ctm-assessment/_extension.yml:11`). ctm-assessment `docs/installation.md:200-201` forbids listing both |

`docs/authoring.qmd:69` is already current.

**Impact:** the first example an author copies fails. Authors misjudge feedback, the approval workload (25 variants)
and the source panels.

**Fix:** rewrite the README from `ctm-stack.lua`. Add a test that renders the README's fenced example.

#### H7. Upstream-derived code without a licence is shipped as AGPL (O; legal)
**Where:**
- pyodide-interaktiv `docs/acknowledgements.md:12-16`: "The upstream repository currently has no LICENSE file … the
  license status of the code carried over from it is unclear".
- The repository `LICENSE` is AGPL-3.0. The umbrella ships it as the component's licence
  (`setup-feedback-integration.py:462-474`).
- Neither the file headers (`qpyodide.lua:27`), the README nor the shipped licence copy carries the caveat.

**Impact:** downstream institutions receive code whose licence the maintainers cannot grant.

**Fix:** ask the upstream author for a licence, or replace the remaining derived code. Until then, put the caveat in
the README, the file headers and the shipped `licenses/pyodide-interaktiv.txt`.

The reviewer could not reach the upstream repository, so this rests on the repository's own statement.

### Medium

#### M0. Consumer testing before umbrella `main` relies on AC's manual campaign; nothing enforces or records it (C)
This was H1 in the first version of this report. AC has stated that every pull request to umbrella `main` so far was
merged by hand after AC's own testing. The consolidation log agrees: for example, the 26 Oct re-pin merged only after the
combined gate, full parity and the course comparisons were green. So no untested combination has reached a course. The
finding is that this safeguard is a person's discipline, not a check.

**Where:**
- ctm-libs `.github/workflows/test.yml:2,49-52`: own tests only; no consumer is checked out.
- ctm-assessment `.github/workflows/examples-pages.yml:57`: `build` runs only on a push to `main` or a confirmed
  manual campaign. Asserted by `tests/ci-policy.test.cjs:96`.
- `examples-pages.yml:83-84`: `main` renders without `--test` and deploys.
- `scripts/setup-feedback-integration.py:544-552`: the consumer loop. It is manual only and leaves out ctm-stack and
  jsxgraph.
- `track-components.yml:8-14`: its schedule was removed (`docs/development/ci-policy.md:46`).
- ingmat3a `quarto-extensions.yml:11` (`ref: main`) and `.github/workflows/quarto.yml:37-55`: every push to the
  course's `main` installs and publishes whatever umbrella `main` holds.

**What the automatic checks alone would let through:**

| Stage | What runs automatically |
|---|---|
| The ctm-libs PR renames a key in `locales/math-exercise.js` or changes `ui/ctm-matrix-input.js` | ctm-libs' own tests only |
| The change merges to ctm-libs `main` | nothing downstream; math-exercise keeps testing its pin |
| An umbrella re-pin PR | source contracts, plus `similar-problems.yml`, which runs 2 checker test files, 4 ctm-libs files and one page |
| The umbrella re-pin merges to `main` | render and publish, without component tests |
| ingmat3a's next push | publishes with the change |

**Why it still matters:**
- No `main` is protected (M9). A merge without the campaign, by AC on a busy day or by another maintainer, goes
  straight to ingmat3a's next build.
- Nothing links a merge to the run that tested it. The evidence is run links in the consolidation log, often for an
  earlier head of the same set (M10).
- AC's testing gates the umbrella, not the components' own `main` branches. math-exercise's publish workflow is red on
  `main` (M8).

**Fix:**
- Make AC's gate a required check: protect umbrella `main` and require the campaign's result on the exact head being
  merged, for example a status that the campaign workflow posts on that commit.
- Run the cheap part automatically on umbrella PRs that change `repos.json`: the consumer loop plus `pytest` for
  ctm-stack. Without Quarto this takes minutes; the render tests skip themselves.
- Restore a nightly `track-components` that only warns.
- Pinning ingmat3a to an umbrella commit or tag is optional while the manual gate holds; it becomes the natural
  semester pin once releases exist (M6).

#### M1. AI-feedback maths loads a floating KaTeX from jsDelivr, bypassing the asset resolver and lock (R)
**Where:** ctm-libs `_extensions/ctm-libs/feedback/feedback-dom.js:189-206`: `'https://cdn.jsdelivr.net/npm/katex@0.16/'`,
then a stylesheet and `import(base + '+esm')`.

**Compare:**
- `assets.json` pins KaTeX 0.16.47;
- math-exercise uses `CTMAssets.url('katex', …)` (`math-exercise.js:58-86`).

**Reproduction:** under jsdom with a local `CTMAssets` mapping, a reply containing `$x^2$` appends the jsDelivr CSS and
imports from jsDelivr.

**Impact:**
- With `ctm-assessment: assets: local` and AI on, for example a firewalled course with a LAN model, the page still
  contacts jsDelivr.
- Code that is neither pinned nor integrity-checked runs in the origin that stores the learner's API key.
- Two KaTeX versions load on one page.

**Fix:** `CTMAssets.url('katex', 'dist/katex.mjs')` and the local CSS. Better: one shared `ensureKatex` (M12).

#### M2. Learner `micropip.install` reaches PyPI in local/exam builds (R)
**Where:** ctm-libs `runtime/pyodide-worker.js:132-165`. The "never ask micropip/PyPI in local mode" guard
(`:137-138`) covers only page-level `pyodide: packages`.

**Reproduction:** real Pyodide 0.28.3 with micropip 0.10.1 in Node, a lock holding only micropip, `fetch` refusing
http(s).

| Learner action | Result |
|---|---|
| `import pandas` | `ModuleNotFoundError`, no request |
| `micropip.install("requests")` | requests `https://pypi.org/simple/requests/` |

**Impact:**
- Exam network logs show pypi.org; the design requires that "only this server may appear".
- On a firewalled course network that allows PyPI, learners can install unreviewed wheels.

**Fix:** in local mode set micropip's index URLs to a same-origin path that does not exist, or patch `micropip.install`
to raise a clear "not available offline" error. Add a worker test.

#### M3. Learner answers to authored math exercises can run arbitrary Python and patch grading for the page (R)
**Where:**
- ctm-checkers `src/ctm_checkers/math_exercise/inputs.py:19-23`: the only rule is "no `__`".
- `checks.py:67-68` and `custom.py:51`: `parse_expr` with SymPy's default globals.
- The audit marks F-48 "fixed" (`docs/audit-2026-10/README.md:65`), and appendix D calls the rule "enforced"
  (`appendix-D-code-injection.md:5,18`).

**Reproduction** (CPython, real `ctm_checkers.browser.call` and ctm-libs' `_ctm_guard`):
- The answer `exec('import os; print("PWNED", os.getcwd())')` runs.
- The answer `exec('import ctm_checkers.math_exercise.checks as c' + chr(59) + ' c.simplify = lambda e: 0')` contains
  no `__`. After it, the wrong answer `x+2` against key `x+1` is graded correct. The guard restores `sys.modules`
  entries, not attributes patched on those modules.
- Generated problems are protected: they use the token allowlist `admit_learner` (`generated.py:100-125`).

**Impact:**
- In self-study this is the accepted "own browser" risk.
- In SEB exams (P13) developer tools are closed, so the answer box becomes the learner's code channel. On standalone
  pages `import js` also gives JavaScript in the exam origin.
- The audit's status is inaccurate.

**Fix:**
- Apply `admit_learner` to authored-problem answers, after checking it against the appendix-A notation sample.
- Otherwise reword F-48 and appendix D as accident protection only.

#### M4. ctm-libs' version is frozen at 0.9.0, so the "two CTM installations" guard cannot fire (R)
**Where:** ctm-libs `_extensions/ctm-libs/_extension.yml:3` and pyodide-interaktiv's shipped copy both say `0.9.0`.
`lua/ctm.lua:29` fails only when the directories differ **and** the versions differ.

**Reproduction:** `pandoc lua`, loading pyodide-interaktiv's copy first and then ctm-libs:
- one instance is returned, with no error;
- `ctm.matrix` and `ctm.variants` are nil.

The guard's tests (`tests/version-mix.test.cjs:27`, `bootstrap-render.test.cjs:80`) use only a fake `9.9.9`. The
contradicted docs are ctm-libs `docs/installation.md:58` and pyodide-interaktiv `docs/installation.md:36-38`.

**Impact:** a project with the package plus a separately added pyodide-interaktiv runs old library code or fails with
a raw Lua error.

**Fix:** bump the version with every pinned change, or compare a content identity, such as a tree hash recorded at
build.

#### M5. API levels no longer describe the interfaces (C)
**ctm-libs:**
- `lua/ctm.lua:41` has been `api = 3` since 21 Oct. `lua/matrix.lua`, `lua/variants.lua`, `ui/ctm-settings.js` and
  `locales/ctm-stack.js` came later without a bump.
- math-exercise (`math-exercise.lua:8`) and py-exercise (`py-exercise.lua:5`) request API 1 but use `ctm.progress`
  (API 3), and math-exercise also uses `ctm.matrix` and `ctm.variants`.
- ctm-stack (`ctm-stack.lua:2`) requests API 2 and uses `ctm.matrix` and `ctm.variants`.

**ctm-checkers:**
- `__init__.py:8` stays `API = "1.1"` after `compute_key`, `admit_generated` and `generated:` were added (Similar
  problems G1).
- There is no CHANGELOG entry for them, against its own `docs/api.md:25-27`.

**Impact:** the "update CTM Assessment" gates pass against libraries that lack what the component uses (see M4). This
matters for step 8 and any split release.

**Fix:**
- Bump on every added module or contract.
- Have components request the level they use.
- Add a CI check that maps `ctm.<module>` uses to levels.

#### M6. No release exists; the CHANGELOG lags; `release-check.py` would tag today's package with 22 October's notes (R)
**Where:**
- No tags or releases in ctm-assessment, ctm-libs, ctm-checkers, math-exercise, py-exercise or pyodide-interaktiv
  (`git ls-remote --tags`, GitHub API).
- ctm-assessment `CHANGELOG.md:3-17`: "Unreleased" holds only U3c. "0.13.0" lists pins (ctm-libs `1320be6`, …) that
  differ from `repos.json`. Nothing is listed for steps 5 and 6, STACK, Similar problems or JSXGraph 1.14.2.
- ctm-stack `CHANGELOG.md:3` reads "0.4.0 (step 6, for review)".
- ctm-checkers `CHANGELOG.md:9,38` has two "Unreleased" versions.
- py-exercise `CHANGELOG.md:3,17` has "Unreleased" below 0.5.0.

**Evidence:** `python3 -I scripts/release-check.py --tag v0.13.0` exits 0. The `docs/installation.md:44-50` download
URL for `v0.9.0` is a 404.

**Impact:**
- Step 1's "versioned releases" are unmet.
- ingmat3a cannot pin a semester release, as its own `quarto-extensions.yml:6-7` suggests.
- A tag pushed now would ship misleading notes.

**Fix:**
- Bump to 0.14.0, write the section and tag.
- Make `release-check.py` require the CHANGELOG section's pins to equal `repos.json`, or an empty "Unreleased".

#### M7. Parity expected-difference entries can whitelist a correct→incorrect verdict flip (R)
**Where:** ctm-assessment `integration/pyodide-parity/run.cjs:250-264`. An entry needs only `reason` plus `path` or
`case`. A path-only entry matches every difference under that path, regardless of status or score. `witness` is
optional.

**Reproduction:** the entry `{path: "math-exercise", reason: "…"}` accepts `basic-features.html#q1`, correct/1 →
incorrect/0.

**Why it matters:** math-exercise PRs supply their own expected file (`math-exercise/.github/workflows/parity.yml:123`
reads `head/.github/parity-expected.json`).

**Fix:** require `case` (or `onlyIn`) for any entry that can match a status or score change, and require a witness for
verdict changes. Keep the stale-entry detection (`run.cjs:284`).

#### M8. math-exercise's published-examples workflow is red on `main` (R)
**Where:** math-exercise `.github/workflows/examples-pages.yml:32-33` installs SymPy with the system `python3 -m pip`,
into the user site, with no `actions/setup-python`. `_extensions/math-exercise/question-variants.py:10-12` re-execs
Python with `-I`, which ignores the user site.

**Evidence:**
- Run 40357264869 on `f4c345b` fails with "No module named 'sympy'".
- The last success was 25 Oct.
- Reproduced locally: `python3 -I -c 'import sympy'` fails after `pip install --user`.

**Fix:** add `actions/setup-python` as in `test.yml`.

#### M9. No branch protection or required checks on any `main` (C)
`branches/main/protection` returns "Branch not protected" for ctm-assessment, ctm-libs, math-exercise and ctm-checkers,
and their rulesets are empty. Red runs can merge; M8 is on `main`.

**Fix:** require at least ctm-libs `test`, ctm-checkers `Python 3.12`, math-exercise `test`/`parity`/`browser`, and the
umbrella's `source` and `similar-problems`.

#### M10. Acceptance evidence is bound to package tuples and course trees that no longer exist (C)
**Where:**
- `integration/pyodide-parity/corpora.json:19,28` freezes ctm-demo `efe1d8e` (35 commits behind, without the new
  similar-problems pages) and ingmat3a `e458510`.
- The only job that grades course tips (`pyodide-parity.yml:252-343`) exits 0 regardless.
- ctm-demo `combined-demo-acceptance.yml:17` pins umbrella `503c868`. It was last green on 24 Oct, and every component
  pin has changed since.
- ctm-demo commits a prebuilt `package.tar.gz` from that older tuple.
- `store-integration.yml` (saved answers in three browsers): 34 runs, 0 successes. WebKit failed, and it has been
  manual since 23 Oct.

**Impact:**
- Documents that read as "accepted" cover a different system.
- Saved answers in WebKit have never passed in CI.

**Fix:** derive the corpus and acceptance pins from `repos.json` at re-pin time, and record which tuple each piece of
evidence covers.

#### M11. Most umbrella unit tests never run automatically, though they need no Quarto (C)
**Never run automatically:**
- `test_install_project.py`;
- `test_migrate_course_html.py`;
- `test_release.py`;
- `test_review_dependencies.py`;
- `test_one_home.py`;
- `test_build_course.py`;
- `parity-*.test.cjs`;
- `py-feedback.test.cjs`;
- `python-examples.test.cjs`;
- all of `integration/feedback/*.test.cjs`.

The automatic `source` job runs 12 node files (`examples-pages.yml:49-54`).

**Evidence:** locally `npm test` gives 124 of 136 (12 skip for Quarto) and the Python tests 235 of 236 (L19), in under
2 minutes.

**Fix:** add `npm test` and `python -m unittest discover -s tests` to the `source` job.

#### M12. Plan items not done while the step table reports "merged" (C)
- **Step 1:** Monaco loader and editor factory, KaTeX/MathJax loaders, `escapeHtml`, bridge client and
  `AIFeedback.mount` are still per component (§2). The step-1 design dropped them without recording a deferral.
- **Step 5:** "merged except P13" (`docs/consolidation/README.md:16`). Not implemented:
  - P16 (no lamp or preload in ctm-libs; components keep their own preloads at `math-exercise.js:1755` and
    `py-exercise.js:887`);
  - the 5b fork options (H5);
  - a public `--assets local` installer, which ctm-libs' error text `read-settings.ts:465-466` names but which does not
    exist;
  - a CI offline build of the courses;
  - the "Track assets" workflow;
  - course exam ZIPs.

  So no course can be built offline today.
- **Step 3:** the row still says "L3x and U3c later", but both are merged.

**Fix:** correct the table and mark deferrals. Then do the cheap ones: KaTeX, `escapeHtml` and the bridge client.

#### M13. New duplication: the token-protected variants review server exists twice (C)
**Where:** math-exercise `_extensions/math-exercise/variants-review.py` (483 lines) and ctm-stack
`_extensions/ctm-stack/variants-review.py` (495). The difflib ratio is 0.94, and the 56 differing lines are
component-specific. The capability-token loopback server (math-exercise `:376-403`) exists in both. Nothing compares
them.

**Fix:** move the server into ctm-checkers `authoring/` with per-component adapters. This also suits the approval
rework (§7).

#### M14. The package's JSXGraph is a temporary branch of a personal fork (O; risk)
**Where:**
- `repos.json` pins `aacchhee/jsxgraph-quarto` `audit/2026-10` at `49a1c7d`. The branch is unprotected, and the fork's
  `main` is the March code.
- `docs/installation.md:7-9` calls it "the upstream jsxgraph/jsxgraph-quarto extension". The pin is the head of
  upstream PR #2, not in upstream `main`.
- Audit §7 (`README.md:665`) still lists `audit/2026-10` for deletion.

**Impact:** `--follow-branches` and `--update-pins --only jsxgraph` follow whatever is pushed there. Provenance
statements to authors are wrong.

**Fix:** move the extension to an Erasmus-CTM repository or a protected, tagged branch. Correct the docs. Strike the
audit §7 entry.

#### M15. pyodide-interaktiv ships a stale ctm-libs copy and CI-checks it against the wrong commit (R)
**Where:** pyodide-interaktiv `.github/ctm-libs-source.json:3` (`626b546`, 47 commits behind ctm-libs `main`) and
`ctm-libs-target.json:3` (`19b5116`, older still; `generate-shipped-library.yml:32-33` prefers it). The docstring of
`scripts/sync-ctm-libs.py:16-17` says the recorded commit is the package's pin.

**Evidence:**
- `sync-ctm-libs.py --check` passes against `626b546`.
- Against the package pin `6f464e6` it reports 31 differences, among them missing worker fixes `8473a48` and
  `efc928e`, the Settings UI, and `lua/matrix.lua`/`variants.lua`.

**Impact:** standalone users run old runtime code, and step 8 would propose it to pyodide-interaktiv's `main`.

**Fix:**
- Re-sync to `repos.json`'s ctm-libs pin.
- Have CI assert that equality.
- Delete `ctm-libs-target.json`.

#### M16. Exam ZIP: built from an older frontend, expiring artefact, lock not committed (C)
**Where:** ctm-assessment `.github/workflows/exam-site-zip.yml:3-4,17-20`.

**Older frontend:**
- It builds pyodide-interaktiv `16561e6`, 20 commits behind the package pin `cc1625f`.
- It misses the first-visit loading, Monaco COI readiness and worker package-readiness fixes (19 files, +671/−141).

**Path filter:**
- The workflow triggers only on its own folder.
- So changes to `scripts/ctm_assets.py`, `serve-offline.py`, `tools/offline-check.mjs`, `_extensions/ctm-assessment/*`
  or `repos.json` do not re-run the ZIP's network-refused acceptance.
- `offline-browser.yml` is manual only.

**Expiring artefact, uncommitted lock:**
- The approved complete lock exists only as CI artifact `prebuilt-offline-assets` of run 40389684095, which expires
  2027-01-24 per the API. Its digest is in the workflow env.
- Design §4 calls for a committed lock.
- IT gets no checksum list with the ZIP.

**Fix:**
- Build from the package pins.
- Extend the path filter.
- Commit the complete lock (metadata only) or attach it to a release.
- Ship `SHA256SUMS` with the ZIP.

#### M17. The offline dry-run server stalls every HTTPS client behind one idle connection (R)
**Where:** ctm-assessment `scripts/serve-offline.py:232-238` wraps the listening socket, so the TLS handshake runs in
`accept()` on the main thread. `docs/exam-server.md:22-26` tells admins to use exactly `--bind 0.0.0.0 --cert --key`
for the network dry run.

**Reproduction:** with one idle TCP connection open, a second `curl -k` times out after 8 s. It succeeds in 6 ms once
the idle connection closes.

**Also distorts the documented load test:** the server speaks HTTP/1.0 and re-hashes the whole file on every range
request (`:160-166`).

**Fix:**
- `do_handshake_on_connect=False` and handshake in the handler thread with a timeout.
- HTTP/1.1.
- Cached ETags.
- Say that capacity tests need nginx or Apache.

#### M18. "AI off in exams" relies on an unchecked generated profile (O)
**Where:**
- ctm-assessment `scripts/ctm_assets.py:702-731` writes `_quarto-exam.yml` with `ai-feedback: enabled: false` only
  when no such file exists (`:723`).
- ctm-libs `lua/assets.lua:96-98` only warns when local mode has AI on.

What works: once off, the P22 switch is an AND over all levels (`read-settings.ts:263-290`). No AI script, criteria or
similar-problems generation reaches the HTML.

**Fix:** an explicit `ctm-assessment: exam: true` that forces AI off, export on and `assets: local`, and fails
otherwise.

#### M19. Exam lock binds the full bytes of the runtime file (O; P13 risk)
**Where:** ctm-assessment `scripts/ctm_assets.py:641-644` (`runtime_sha256` of `pyodide-runtime.js`) and `:693-698`.

**Evidence:** this already forced a new AC-approved lock once, with no asset change: `e2ebd44e` → `73d8b6fb`
(`docs/consolidation/README.md:171`). P13 edits exactly this file.

**Fix:** bind the parsed Pyodide version and URL line, not the whole file.

#### M20. ctm-stack's policy docs select the wrong integration (R)
**What the docs say:** ctm-stack `README.md:69,88` and `docs/authoring.qmd:377-386` say STACK uses the `math-exercise`
policy namespace and the deprecated `project-policy`/`page-policy` keys.

**What the code does:**
- Cards request integration `stack` (`ctm-stack.js:390`; ctm-libs `feedback-core.js:14`).
- Through ctm-libs' `resolvePolicy`, the documented configuration does not apply the course policy to STACK cards; the
  `{stack: …}` form does.

**Impact:** a course that follows the docs silently gets the default hint policy on STACK cards.

**Fix:** document `ai-feedback: policy: {stack: …}`.

#### M21. The umbrella and library docs do not know that the package contains ctm-stack (C)
**Where:**
- ctm-assessment `docs/installation.md:7-13,38-40` (folders), `:94-96` (filter order), `:146-148` (review-ref names);
- ctm-libs `lua/policy.lua:54-56` (error text with the old order);
- ctm-libs `docs/installation.md:17-19`;
- `authoring.md` and `reference.md`, which have no STACK entry and no `stack:` or `pyodide:` sections.

The build-time Python and SymPy requirement for `{.stack-question}` (`ctm-stack.lua:104-110`) is not stated in the
umbrella docs.

**Fix:** add ctm-stack to the lists, the order and the reference. Add a requirements line.

#### M22. Maintainability hot spots (C, measurement)
**Files over 1,500 lines:**
- pyodide-interaktiv `qpyodide.lua` (2,064);
- ctm-checkers `tools/golden.py` (1,840);
- math-exercise `math-exercise.js` (1,776, one IIFE);
- ctm-assessment `scripts/ctm_assets.py` (1,622).

**Product functions over 200 lines:**
- jsxgraph-quarto `lua/jsxgraph.lua:230-859` `CodeBlock` (630);
- ctm-checkers `authoring/ctm_variants/review.py:158-471` (291);
- math-exercise `math-exercise.lua:809-1079` `buildExercise` (268);
- ctm-checkers `stack/engine.py:146-382` `instantiate` (219);
- math-exercise `setupCell` (206);
- tools: `setup-feedback-integration.py:288-560` `main` (273).

**Worker source as a template literal:** ctm-libs `runtime/pyodide-worker.js:31-628` keeps the whole worker as a
597-line `String.raw` template literal. It gets no lint or syntax check, and stack traces point into a blob. P13 will
work in this file.

**Fix (opinion):**
- Make the worker its own `.js` file, inlined at render.
- Split `buildExercise` and `setup-feedback-integration.py main` when next touched.

#### M23. Implicit cross-repository contracts (C)
- **Event and file names from a third-party fork:** ctm-libs and math-exercise depend on `qpyodide-*` events and file
  names (`pyodide-runtime.js:136-140` has a variable named `coatless`; `math-exercise.js:111` listens to
  `qpyodide-runtime-restart`). None of these globals is listed in `docs/api.md`.
- **Umbrella tests that scrape inline scripts:** ctm-assessment tests find component data by the exact text
  `'(window.__pyExercises ='` (`integration/feedback/settings-merge.test.cjs:44-45`, `rendered.test.cjs:213`, and
  others). They also drive math-exercise through the `__mathExerciseTestApi` hook.
- **Regex scan of other repositories:** `setup-feedback-integration.py:204-205,238-246` regex-scans other repositories'
  bytes for `def _math_check|assess_basis` and keeps a hard-coded list of math-exercise file names.
- **Old harness files pinned by hash:** ctm-checkers pins the umbrella's `authored_record.py` and related files by
  sha256 at `9ed46a4` (`tools/golden.py:271-296`). That is 390 commits old.

**Fix:**
- A short contract list per repository (globals, events, files, CLI), each with a test.
- Emit component data as `<script type="application/json">`.

#### M24. CI volume (C, measurement)
In the week 19–26 October:
- about 7,000 runs and an estimated 35,000 job-minutes in six repositories, the umbrella 17,000 of them;
- about 40% of runs were the same commit run twice, once for `push` on a non-main branch and once for `pull_request`
  (for example, `ctm-libs` `test.yml:2`, `math-exercise` `test.yml:3-5`, the four umbrella asset workflows);
- the umbrella has 24 workflows (3,006 lines, 976 of them inline shell), and 13 are manual only. Some are one-off
  diagnostics: `current-closure-store-d2.yml` says "one-off diagnostic for the store PR (#28, merged)".

No flaky job was found: no workflow both failed and passed on the same commit and event.

**Fix:**
- `push: branches: [main]` plus `pull_request`.
- Retire one-off workflows once their step closes.
- Move shell blocks over 25 lines into `tools/ci/`.

### Low and nits

| # | Finding | Where | Evidence and fix |
|---|---|---|---|
| L1 | Model TeX can survive as raw text, and a later MathJax pass turns `\href{javascript:…}` into a live link | ctm-libs `feedback-dom.js:71,94-99`; ctm-stack `ctm-stack.js:133,474` | R with MathJax 3.2.2 and 4.1. Today only a first-load race is left. Add `tex2jax_ignore`/`mathjax_ignore` to the feedback body, load `ui/safe` |
| L2 | Model-supplied maths can freeze Python: `parse_math` bounds the exponent, not the result. `((((9)**100)**100)**100)**100` ran over 60 s | ctm-checkers `math_exercise/generated.py:69-72` | R. Bound the bit size of intermediate results |
| L3 | Legacy copies of the API key (`math-exercise-llm-config`, `qpyodide-feedback-config`) are never deleted, also after choosing "This tab" | ctm-libs `feedback/ai-feedback.js:22-24,62-65` | R. Remove legacy keys after migration. Add "Forget key". Storage default is `local` (`:20`), which is AC's A4 decision |
| L4 | No Content-Security-Policy, even in local/exam builds | — | O. `connect-src 'self'` in local mode would have caught M1. Needs a compatibility test |
| L5 | ingmat3a gives `contents: write` to the whole workflow, including PR builds, with persisted credentials. Publish actions are pinned by tag | ingmat3a `.github/workflows/quarto.yml:3-4,24`; ctm-demo `quarto.yml:81` | O. Scope write to the publish job, `persist-credentials: false`, SHA pins |
| L6 | "Export my answers" omits the generated question text of similar problems (parts of kind `text` print only their label) | math-exercise `math-similar.js:1175-1195`; ctm-libs `ui/ctm-export.js:22-32` | C. Serialize `text` parts |
| L7 | The feedback widget resolves `nn` to `nb`, while `CTMLocales` resolves `nn`. Server- and client-rendered feedback texts differ, and the generated `nn` strings are unreachable. Catalogues support different language sets (sv/da/es/nn pages mix languages). `reference.md:27` is wrong | ctm-libs `feedback/ai-feedback.js:10`; `locales/ctm-locale.js:33-38` | R. Use `CTMLocales.resolve`. AC to decide the fallback policy |
| L8 | Retired names past their window ("accepted in 0.9 only"), `--refresh` without effect, `KEEPS_RETIRED_COPIES = ()` | ctm-assessment `setup-feedback-integration.py:25,155,291`; `install-project.py:55,110` | C. Remove or restate the window |
| L9 | `example-source.lua` in 5 copies across 3 generations; the oldest still reads only `m['ai-feedback']` | ctm-libs, py-exercise, pyodide-interaktiv, math-exercise, ctm-assessment `_filters/example-source.lua` | C. Keep the umbrella copy, fetch it at a pin |
| L10 | `review-dependencies.py`: 3 copies, 3 allow-lists. py-exercise rejects `ctm-checkers` and `ctm-stack` review refs | py-exercise `.github/review-dependencies.py:20`; ctm-demo `.github/review-dependencies.py:20`; umbrella `tools/ci/review-dependencies.py:27` | C. Fetch the umbrella copy |
| L11 | math-exercise's Lua dynamic-matrix twin has an English-only `aria-label` and unlabelled cells until the first resize | math-exercise `math-exercise.lua:357-470`, `:458`, `:418-428` | C. Emit a placeholder and let `MatrixInput.renderHTML` build it |
| L12 | ctm-libs README still documents the removed `ai-feedback` alias, with a broken anchor | ctm-libs `README.md:52-56` | C |
| L13 | Undocumented settings: `ctm-assessment: save/progress/export/storage-key/assets`, the `pyodide:` and `stack:` sections, py-exercise `save` | ctm-libs `read-settings.ts:392-393`; ctm-assessment `docs/reference.md:7-31`; py-exercise `docs/reference.md:39-75` | C. Add them to the reference |
| L14 | "Site without AI feedback … the render succeeds" is false for a custom-mode exercise without a checker unless `without-ai:` is set | ctm-assessment `docs/installation.md:165-176`; ctm-libs `lua/policy.lua:27-36,122-135` | C |
| L15 | Stale docs and values, one item each below | — | C |
| | ctm-demo `README.md:39-40` names umbrella `503c868`; the pin is `ac10e6a` | | |
| | `exam-site-zip.md:12-14` names run 40081864918 and lock `6f8a64b5…`, not the workflow's 40389684095 and `73d8b6fb…` | | |
| | `installation.md:52-56` describes CDN "release lines"; the versions are exact pins | | |
| | `exam-server.md:8` calls the profiles "separate Step 5 work" | | |
| | `exam-server.md:29` says HTTPS is "required"; README-IT says "recommended" | | |
| | `reference.md:328-331` contains merge instructions for PR48 | | |
| | ctm-checkers README and `docs/api.md` still say "stack-sympy" | | |
| | broken anchor `py-exercise/docs/reference.md:73` | | |
| L16 | ctm-demo's approval guide does not warn about the decision-loss hazards AC recorded on 26 Oct (one tick at a time; wait for the recording commit before merging) | ctm-demo `docs/variants-approval.md:9-12` | O. Add the warning until the rework |
| L17 | `src_mjx_preload` is not checked in local mode, so it can load from a CDN | ctm-libs `read-settings.ts:453` | C. Add it to the list |
| L18 | `selectedIndexURL()` silently falls back to jsDelivr when `CTMAssets` is missing, which is always the case inside a worker | ctm-libs `runtime/pyodide-runtime.js:65-70` | C. A P13 risk (§6). Pass `indexURL` explicitly, fail closed in local mode |
| L19 | The offline server test fails on Python 3.13 (404 instead of 403 for a symlink loop); the docs promise "3.12 or newer" | ctm-assessment `tests/test_serve_offline.py:266-275`; `scripts/serve-offline.py:133-137` | R. `resolve(strict=True)`. Add 3.13 to CI |
| L20 | `cancel-in-progress` on `main` and publish groups | ctm-checkers `test.yml:20-22` (merge `cec04ec` never finished a run); math-exercise `examples-pages.yml:13-17`; ingmat3a `quarto.yml:6-9` (a push to `refactor-pyodide-interaktiv` cancels the live publish) | C. `cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}` |
| L21 | Floating or unpinned refs | py-exercise `publish-examples.yml:30` publishes against ctm-libs `main` while `example.yml:24` tests `6f464e6`; Quarto is unpinned in ingmat3a `quarto.yml:27` and pyodide-interaktiv `quarto-test.yml:22` | C |
| L22 | Branch clutter: 99 non-main branches, 22 fully merged. Every 24 Oct triage a/c branch is still present, and so are the audit §7 items math-exercise `demo`, `feature/ai-feedback-context`, `feature/vector-matrix-input` and py-exercise `lti`, `testing`. Some CI and fixture pins live only on triaged branches | e.g. ctm-assessment `assets.yml:53` → ctm-libs `2ed1a33`; pyodide-interaktiv `runtime-order.yml:25,29` | C. Delete merged branches now. Keep commits that pins need reachable (tags) before deleting the rest |
| L23 | The shipping branch is not the default branch: pyodide-interaktiv `main` is 30 Sep (115 behind the shipping branch), the jsxgraph fork's `main` is March | — | O. Linked to H4 and M14 |
| L24 | MIT notice of `coi-serviceworker.js` not reproduced | ctm-libs `runtime/coi-serviceworker.js:1-8`, pyodide-interaktiv copy | C. Add the upstream copyright and MIT text |
| L25 | STACK data tagged `GPL-3.0-or-later` in ctm-checkers. stack-wasm-maxima records "or later" as unproven for STACK | ctm-checkers `stack/stack_data.py` header | O. Use the tag that can be backed |
| L26 | ctm-demo has no licence file, and commits a 684 KB prebuilt package tarball from an old tuple | ctm-demo `.github/variants-tooling/package.tar.gz` | C |
| L27 | Backend registry named `CTMStackAdapters` in ctm-stack's contract but `CTMStackBackends` in the Maxima prototype; nothing connects them yet | ctm-stack `docs/backend-contract.qmd:32`; stack-wasm-maxima `prototype/quarto/stack-maxima.lua:37` | O. Fix the name before the Maxima backend attaches (`cas: maxima` stops the build today) |
| L28 | History in code: 89 review IDs (S-nn) in ctm-checkers comments and test names; "step N" and design-path comments in ctm-assessment. Elsewhere it is rare | e.g. ctm-checkers `stack/assessment.py:47,422`; ctm-libs `lua/settings.lua:1` "(F-79)" | O. Replace IDs with the rule they stand for |

---

## 4. Consistency across repositories (question 2)

**Pins in `integration/feedback/repos.json`.**
- All resolve.
- Each pinned commit is an ancestor of its snapshot head. Their trees differ from the heads only in `.github/` files
  (the Node-24 action bumps) and math-exercise's `.github/parity-expected.json`. So the package ships what `main`
  holds.

| Entry | Commit | On main? |
|---|---|---|
| ctm-libs | `6f464e6` | yes |
| py-exercise | `18076a4` | yes |
| math-exercise | `ac4fc45` | yes |
| ctm-checkers | `406df58` | yes |
| ctm-stack | `0eed11f` | yes |
| pyodide-interaktiv | `cc1625f` | its integration branch, deliberately (tree = `73566ed`) |
| jsxgraph | `49a1c7d` | the fork branch tip (M14) |

**Other pins.**
- Course pins: ctm-demo pins umbrella `ac10e6a`, whose package content equals the head. ingmat3a follows umbrella
  `main` (M0, M6).
- The component `pins.json` files and the umbrella commits pinned by ctm-libs, ctm-checkers, math-exercise, ctm-stack
  and pyodide-interaktiv are 5 different commits, 120–390 commits old (H3, M23).
- A few CI and fixture pins are reachable only from branches the 24 Oct triage marks superseded (L22).
- `--check-pins` could not run here (api.github.com is refused through the proxy). The same check was done with git.

**Versions and API levels:**

| Library | Version | API level |
|---|---|---|
| ctm-libs | 0.9.0 since 19 Oct | 3 since 21 Oct |
| ctm-checkers | 0.12.0-dev.0 | "1.1" after an API addition |
| package | 0.13.0 since 21 Oct, with no section for anything after it | — |

See M4–M6.

**Bootstrap copies:** identical everywhere and checked in three places (§2).

**Catalogue and locale keys:**
- `ctm-libs/scripts/check-locales.py` and `sync-feedback-defaults.py --check` pass.
- Every literal key used in component code exists in its catalogue (checked with a script).
- Language sets differ per catalogue, and the feedback widget has its own resolver (L7).

**Settings names:**
- Reference defaults checked in code are correct:
  - `stop-after` is 20 s and the load limit 180 s;
  - `tab-links`/`modes` default true, `markdown-lint` false;
  - the embed, reveal, image and context limits;
  - the similar-problems keys.
- Gaps:
  - keys accepted but not documented (L13);
  - ctm-stack documents the wrong policy namespace (M20).

---

## 5. Process: is the stacked-set protocol proportionate? (question 8)

**What the protocol guarantees, and it holds.** The step-1 §12.1 protocol requires:
- exact reviewed heads pinned across repositories;
- every branch up to date with its base;
- one combined CI run;
- one merge sitting with merge commits;
- tree equality checked before and after each merge.

It delivers what it promises. The shipped trees equal the trees that were tested, and the reviewer confirmed this for
every `repos.json` entry. The tree check itself is cheap (`git rev-parse <merge>^{tree}`) and worth keeping.

**What it costs.**
- Item 5 says that whenever any base moves, the whole set is brought up to date, pins and copies are moved, and the
  combined campaign runs again. With several sets in flight that is quadratic work.
- The 25–26 October log shows it: 24 of its 40 entries for those two days are retargets, "calibrations" of harness
  fixtures, and campaign reruns after an upstream head moved.
- Since 19 October the umbrella's `main` took 390 commits. They changed `_extensions/` by +469 lines, against
  +7,092 `integration/`, +5,393 `tools/`, +2,967 `scripts/`, +7,455 `tests/`, +2,283 `.github/` and +7,313 `docs/`.
- CI used an estimated 35,000 job-minutes in that week (M24).
- Most of the evidence it produced is bound to frozen tuples and frozen course commits that the next re-pin made
  historical (M10).

**What it did not catch.** The protocol is built around tree identity of a set at merge time. The defects this review
found lie elsewhere:
- regressions between sets: a consumer gate that only AC's discipline enforces (M0), a manual grading gate (H2),
  divergent component pins (H3);
- release state: versions, API levels, CHANGELOG, tags (M4–M6);
- user-facing text: H4, H6, M20, M21;
- unprotected `main` branches (M9), with a red publish workflow on `main` (M8).

None of these would have been caught by more exact-head pinning.

**The variants approval workflow as a data point.** AC's 26 October log records the same pattern:
- **Invariants checked at each step.** The exact candidate, content hash and exact-head producer are enforced
  rigorously at every recording step.
- **Hostile workflow:**
  - 16 minutes before checklists appear;
  - about 95 KB of comments;
  - ticks recorded only on an open same-repository PR;
  - rapid ticks cancelled in a shared concurrency group;
  - a run after the first recording commit fails with "exact-head records producer did not succeed";
  - merging first loses decisions.
- **The lesson:** checking a strong invariant at every intermediate step makes a workflow brittle and slow. Checking it
  once at the gate that matters (publication) does not.

**Recommendations.**
1. **One source of truth for pins.**
   - Derive component `pins.json`, `ctm-libs-source.json`, the corpus pins and the acceptance refs from `repos.json`
     with a bot PR after each set merge.
   - Check agreement in the umbrella's source job.
   - This removes most of the re-pin and retarget work and H3.
2. **Cheap automatic gates on every PR; heavy campaigns for release candidates only.**
   - Every PR: the consumer loop, the ctm-checkers goldens and the umbrella unit tests, all without Quarto and in
     minutes.
   - Release candidates only: full Pyodide parity (7,000+ responses), frozen-course comparisons and three-browser
     campaigns, run once per tag rather than once per base movement.
3. **Keep tree-equality checks and merge commits.** They are cheap and they work.
4. **Drop "the combined CI runs again" (item 5) for base movements** that touch only docs or CI files, and for
   movements in repositories the set does not pin.
5. **Protect `main`** and require the cheap gates. That replaces part of the human merge-sitting checklist.
6. **Make evidence current or discard it.** A log entry with run links is history, not a status. Keep one status page
   per component describing current behaviour; keep the log as history.

---

## 6. P13: where it attaches, and risks in the current code

**P13 attaches at:**
- ctm-libs `runtime/pyodide-worker.js` (CTMWorker; the local `indexURL` is forced at `:652-654`);
- ctm-libs `runtime/pyodide-runtime.js` (the version constant, `selectedIndexURL`);
- the exam ZIP (`integration/offline-ide/`, `.github/workflows/exam-site-zip.yml`);
- `scripts/serve-offline.py` for dry runs.

**Risks the current code creates:**
- **M19:** any edit to `pyodide-runtime.js` voids the approved lock and needs a new AC approval.
- **M16:** the ZIP is pinned behind the package. The approved lock lives in an expiring artifact.
- **L18:** silent jsDelivr fallback in worker contexts. A worker that boots through `ensurePyodide` in an exam build
  would go to the CDN.
- **M2:** micropip to PyPI from the exam worker.
- **M3:** answer boxes as a code channel in SEB.
- **M22:** the worker program is an unchecked 597-line template literal.
- **H5:** boards in exams.
- **M17:** the dry-run server stalls on TLS.
- **The `qpyodide-coi-unavailable-<origin>` flag** (`coi-serviceworker.js:117-130`): one failed service-worker
  registration in SEB marks the origin non-isolated for good in that profile. Only "clear site data" undoes it.

**SEB, documented against implemented:**

| Claim | State |
|---|---|
| Isolation headers, ranges, ETags, precompressed files | implemented and tested in Chromium |
| Plain-LAN degraded mode | implemented and tested in Chromium |
| URL filter including `srcdoc`/`blob:`/`data:` frames | documented only |
| Clipboard and download policy | documented only |
| Top-level window | documented only |
| HTTP cache | documented only |
| Browser Exam Key / Config Key, quit link, `.seb` configuration | documented nowhere |
| Service-worker path for the ZIP | never exercised: the checker blocks service workers |

---

## 7. Foundation for step 7 and the variants approval rework

**Step 7 (opt-in grading options)** fits the foundation: ctm-libs' key-by-key settings reader, ctm-checkers' versioned
golden tables with a CHANGELOG rule, and math-exercise's base-to-head parity on every PR. Three things should come
first, or step 7's option changes cannot be told apart from accidental grading changes:
- the golden replay must run on every ctm-checkers PR (H2);
- parity expected-difference entries must not accept verdict flips without a witness (M7);
- API levels must move with contracts (M5).

**Variants approval rework.** The semantic core is reusable:
- the ctm-checkers `ctm_variants` kernel;
- content hashes and the exact-candidate binding;
- the token-bound local review server.

The rework should:
- put the review server in ctm-checkers once (M13);
- let the local review page record decisions directly as append-only records;
- check the exact-candidate and hash invariants once, at publication, not at each recording step (§5).

---

## 8. Good, and should be kept

- **The one bootstrap**, with three independent identity checks, and the `RETIRED_COPIES` and `check_one_home` guards
  against copies returning.
- **CTMWorker as the single worker**, the single Pyodide constant, and the published-runtime identity across
  components.
- **ctm-checkers:**
  - tests both `src/` and the built wheels in a clean venv;
  - `build.py --check --released-base` keeps bundles equal to source and releases immutable;
  - the goldens reproduce in full (8,939 rows);
  - the mutation suite is worth running automatically.
- **The asset pipeline:**
  - the npm and board partial locks were rebuilt here from the npm registry to the reviewed digests;
  - `verify_bundle` re-hashes every file and refuses extra, missing, modified or symlinked files;
  - carried installs verify, copy, re-verify and swap atomically;
  - the licence allowlist demands licence files and a source offer for copyleft, and generates THIRD-PARTY-NOTICES.
- **The P22 no-AI switch:** an AND over all levels, also through `CTM_FEEDBACK=off`. Nothing of AI feedback reaches the
  HTML, and similar-problems generation is gated by the same switch.
- **Message protocols:**
  - the JSXGraph bridge checks `event.source` on both sides, with fresh request ids, size caps and strict image
    re-validation;
  - the COI-frame, MathJax-adaptor and variants-board protocols do the same.
- **Model output to the page and to Python:**
  - `renderMarkdown` and `renderTaskText` produced no script-capable markup in about 60,000 fuzzed renders;
  - KaTeX runs with `trust: false`;
  - model maths reaches Python only through the `parse_math` AST allowlist;
  - learner answers to generated problems go through `admit_learner`.
- **Storage:**
  - keys are namespaced per course, page and exercise, so `github.io` sites do not collide;
  - records are capped at 64 KiB with a memory fallback;
  - the HTML export escapes everything;
  - there is no import surface.
- **Workflows:**
  - no `pull_request_target`;
  - event text reaches shell only through `env:`;
  - the comment-triggered variants decision workflow verifies the sender's permission
    (ctm-checkers `authoring/ctm_variants/github_bot.py:262-269`) and runs default-branch code only.
- **`serve-offline.py` path handling:** traversal is rejected before normalisation, symlinks are contained, headers are
  kept on errors, and it binds `127.0.0.1` by default.
- **The exam ZIP's own acceptance** is strong for its scope: real Python, refused network, a plain-LAN run, and Stop
  with re-run.
- **About one line of test per product line** in every component, and no CI flakiness observed.
- **ci-policy tests** that assert the workflow structure, so a policy change is reviewable.

---

## 9. Open questions for AC

1. **Making the manual gate enforceable.** Every umbrella merge so far followed AC's own testing. Should that become
   a required check on a protected `main`, with the campaign posting its result on the exact head being merged (M0)?
   Should anyone other than AC be able to merge to umbrella `main`? Should ingmat3a pin a release tag for the semester
   once one exists?
2. **Releases.** Is "versioned releases" still a goal? If yes: bump ctm-libs (0.9.0 since step 1), write the package
   CHANGELOG and tag 0.14.0. If no, remove the release and tag text from the author docs.
3. **Grading gate.** May the ctm-checkers golden replay (minutes, no browser) become an automatic PR gate again?
4. **pyodide-interaktiv's default branch.** Make `feature/shared-feedback-integration` the default branch until step 8,
   or change `STANDALONE`? Today the error message installs 1.6.1 (H4).
5. **Licence.** Has the coatless-quarto/pyodide author been asked for a licence (H7)? What applies to ctm-demo's
   content (L26)?
6. **Learner admission.** Should authored math answers use the `admit_learner` allowlist before P13 brings
   math-exercise into SEB exams (M3)? Or should F-48 and appendix D be reworded?
7. **Exams.**
   - AI feedback: forbid it in `assets: local` and exam builds (M1, M18)?
   - micropip: should learners have it at all (M2)?
   - Boards: block local-mode JSXGraph pages until 5b, or prioritise 5b (H5)?
8. **Exam lock.** Should it bind runtime bytes or only the runtime's version line (M19)? Where does the approved lock
   live after the artifact expires on 24 January 2027 (M16)? Should the ZIP follow the package pins (M16)?
9. **SEB ownership and HTTPS.** Who owns the `.seb` configuration: URL filter, embedded content, quit link, Browser Exam
   Key? Is HTTPS "required" or "recommended" for IT?
10. **JSXGraph's home.** When does the extension move off `aacchhee/jsxgraph-quarto` `audit/2026-10` to an Erasmus-CTM
    home (M14)?
11. **Deferred step-1 items.** Monaco, KaTeX, MathJax, `escapeHtml` and the bridge client: deferred (then record it) or
    abandoned (M12)?
12. **Languages.** Should a page whose language only some catalogues support (sv, da, es, nn) fall back as a whole, or
    per component as today (L7)?
13. **ctm-stack in the product docs.** Should the umbrella author guides present ctm-stack now (M21), or keep it
    experimental until a Maxima backend exists?
14. **Branch cleanup.** May the 22 fully merged branches be deleted now, and the 24 Oct triage's a/c branches once the
    commits that pins need are tagged (L22)?

---

## 10. Method and limits

- **Reviewers.** Six independent reviewers, one per area: consolidation and consistency, security, offline/exam, tests
  and CI, docs, maintainability. Each received the snapshot, the goals and the out-of-scope items, and was told to
  reproduce before reporting. The coordinator re-checked the main citations of every high finding and of M1–M8 at the
  snapshot.
- **Ran locally:** all repositories' unit suites that need no Quarto.

  | Repository | Result |
  |---|---|
  | ctm-libs | 295 pass, 137 skip |
  | ctm-checkers | 1,670 pass; 3 fail, 145 skip (no Quarto) |
  | math-exercise | node 145 pass; unittest 28 of 47 pass, the rest need Quarto |
  | py-exercise | 12 + 28 pass |
  | pyodide-interaktiv | 84 + 3 pass |
  | ctm-stack | 34 pass |
  | ctm-assessment | node 124 of 136 pass; Python 235 of 236 (L19) |
  | jsxgraph-quarto | 14 pass |

  Also run:
  - ctm-checkers golden verification (8,939 rows) and two mutation experiments;
  - the npm and board asset partials, rebuilt to their reviewed digests;
  - real Pyodide 0.28.3 in Node (micropip);
  - jsdom reproductions of the feedback renderer, KaTeX loading, legacy keys and export;
  - CPython reproductions of the admission and size issues;
  - `pandoc lua` for the version guard;
  - `release-check.py`;
  - `check-locales.py`;
  - `sync-ctm-libs.py --check`.
- **Not possible here:**
  - no Quarto or Deno, so no renders;
  - jsDelivr and GitHub release downloads are blocked, so no browser runs, no Python lock or prebuilt bundle, and no
    real Maxima;
  - the GitHub REST API was refused for `--check-pins`.

  Browser-side claims are therefore from code. CI history (durations, failures, artifact expiry, branch protection) was
  read through the GitHub API. ctm-stack was read through git only.
- **Repositories untouched.** No code was changed, nothing was triggered on GitHub, and no comment was posted. The
  reproduction scripts and raw outputs stay outside the repository.
