# Cloud restart checkpoint — 23 October 2026

AC asked to stop starting work because the local computer will become unavailable.
All agents' already-started processes finished. No corrected-source render or
browser test was launched before stopping. Code, this checkpoint, the loading
audit and retained evidence are saved in GitHub; local paths are not prerequisites.

## Authority and immediate objective

Continue first-visit loading fixes and audit, then finish variants authoring.
Use xhigh reasoning repeatedly where useful across the CTM pack. Keep checks
focused and commit meaningful fixes promptly. AC alone merges with merge commits.
Do not merge, force-push, tag, deploy, write main or change ingmat3a main.
Author commits as Andrey Chesnokov. Use canonical source/producers and exact
reviewed commits; never hand-patch vendor/generated runtime copies.

Priority remains saving, quiz, variants/tests, ingmat3a migration, offline, then
STACK/Python parity. ctm-demo is the no-user testbox. Ingmat3a has students:
isolated preparation is allowed, but ask AC before course rollout after demo
acceptance and component merges. Broad campaigns are manual and require AC's
explicit request; do not rerun every matrix on small commits.

AC's new loading requirement: **keep working what can work when another part
fails**. Missing JSXGraph must not stop py-exercise; missing speech must not
disable ordinary Check. A required dependency can fail its own question with a
local explanation. Distinguish optional enhancement failure from an unavailable
grading engine. The loading sequence must be explicit before the future Maxima
layer; Maxima readiness does not depend on Python readiness.

## Durable source set: all draft / WIP, not ready to merge

| Repository / PR | Branch | Exact saved head |
| --- | --- | --- |
| [ctm-libs42](https://github.com/Erasmus-CTM/ctm-libs/pull/42) | consolidation/2026-10-first-visit-readiness | dfe7bf8f0079b8516edc3b986c09a9694f94623a |
| [py-exercise13](https://github.com/Erasmus-CTM/py-exercise/pull/13) | consolidation/2026-10-first-visit-readiness | 4e6bc07e7457e2b1b097556f1236ca2006a7b238 |
| [math-exercise31](https://github.com/Erasmus-CTM/math-exercise/pull/31) | consolidation/2026-10-first-visit-readiness | e1245d77ae837d2bb679633bc938d8b96417dd81 |
| [pyodide-interaktiv11](https://github.com/Erasmus-CTM/pyodide-interaktiv/pull/11) | consolidation/2026-10-first-visit-readiness | 9a5920afc10c00c208a8fa6e7ad20c6d39606ad9 |
| [ctm-checkers25](https://github.com/Erasmus-CTM/ctm-checkers/pull/25) | consolidation/2026-10-authoring-workflow | 53c16f4750b42de75adf03c2bd0544b9690dd96a |

Trees: libs cdb7fd52175ff7b9904f7f12d9bf69d5cc1cdede;
py 9e6f258773108a3680cc019a9ebd1734360ea7d6;
math 2a4e102b00bed25b3cb5cadb31faea409a43469c;
pyo 2beded8d9abac6a9d589797d7b1db93852664c37;
checkers 621e015fbd50b43724b27908650b4a46c988d5fd.
Root verified the first four complete trees, blob identities, author and parents;
the native authoring agent verified the same for checker25.

The first four retain existing feature bases, not main: libs layout-integration
(a6161c3ef6dfd161d8b2d6f39344c434efe5bf7e), py step5-assets
(2096710d29e5fa06093d0f30e87e0ccaa6c31402), math stable-variant-html
(b282111da4bb208effd8bad8d7e6df7020d0db0a), pyo preserve-runtime-order
(a509540668104777a63474cbac212b03ce511341). Verify fresh refs before writing.
The previous libs41/py12/pyo10/assessment55 leaves were AC-merged into their
feature bases; this does not establish ancestor/main/course release clearance.
The approved pyo route ultimately targets feature/shared-feedback-integration.

## First-visit fix and exact limits

The main causal race is a COI automatic reload interrupting asynchronous UI
work. Python also started eagerly in the document about to be replaced.
See `2026-10-loading-lifecycle.md` and `2026-10-loading-audit-xhigh.md` here.

The saved implementation adds an initial-UI contract in the existing shared
runtime, with actual KaTeX/editor promises. It waits for load, registered UI,
parent MathJax and fonts before allowing a reload. The pyo startup promise is
published synchronously for shared reuse, while actual worker creation waits
for the COI decision. UI must never wait for Python/packages/authored startup:
that would create a cycle. Duplicate signals, interaction, recent reloads,
30-second UI deadline and five-second missing-outcome fallback are handled;
a deadline retains a usable current page rather than scheduling a late reload.

Later user-added IDE editors are excluded from the initial batch. AMD and
editor construction errors reject actual UI readiness. An older loaded runtime
retains its live namespace and receives missing readiness capabilities.
Fatal worker errors now reject pending work/setup rather than leave promises
hanging; a later explicit restart can recover. Optional setup failure remains
distinct from fatal worker failure.

Root's final math change installs Check/store handlers before awaiting KaTeX,
so renderer failure cannot disable them. It retains the actual readiness error
and adds a localized plain-formatting notice. Input help can fall back to raw
notation. This final change and the en/de/nb catalogue addition are UNTESTED.

### What actually ran

- Last source-owner suite: **32 passed, zero skipped**: worker-failures6,
  original worker8, registry5, pyo readiness13.
- Earlier focused stages: py runtime25 (including slow late-AMD case), math
  store/shared15; new pyo3 and py2 AMD/create/layout tests also passed before
  subsequent save corrections. Do not add these counts as disjoint totals.
- Root independently ran the initial four registry tests and native history4
  plus native distribution2. Their passes describe those recorded stages.
- The final pyo shared initial-batch flag was corrected from module-local `let`
  to explicit `globalThis` because cell-classes and cell-initialization are
  separate ES modules. Classic-eval tests missed this. That correction is
  UNEXECUTED; actual rendered ES-module linkage must be tested first.
- Final py loader rejection follow-up, root math fallback and locale edits have
  not all been rerun. **No fixed-source Quarto render or first-visit browser
  acceptance exists.** All five new PRs remain draft/HOLD.
- Pyo's shipped library and both source/target records were regenerated using
  its canonical sync producer at exact library dfe7bf8f. No generated copy was
  hand-edited. Final sync was a save operation, not fresh browser evidence.

### Remaining audit findings / next checks

1. Re-read the audit against the saved exact sources: some findings were
   repaired after the auditor's snapshot. Do not reapply fixes blindly.
2. Run focused source/module contracts for final edits, especially real module
   linkage and math rendering failure with functional Check/store.
3. Build the one-page demo fixture with the canonical umbrella installer using
   these four exact review refs (or explicit local sources for engineering).
   Keep original upstream JSXGraph e4ad81d pin and original37 adaptor unchanged.
   Do not make a blanket --update-pins call or quietly activate anything on main.
4. Run focused first-visit cases in Chromium, Firefox and WebKit with the
   byte-preserving static server/diagnostic; then targeted negative controls
   for missing JSXGraph/speech and optional renderer failure. Intentional fault
   reports retain the injected errors; they are not normal raw-clean passes.
5. Preserve strict distinctions: functional success, raw errors, current-document
   settlement, and observation of every old request lifecycle. The UI barrier
   does not await arbitrary opaque-frame MathJax/SRE startup.
6. Audit still flags local explicit stage1-package readiness verification and
   missing end-to-end bounds for lock/bootstrap/install/background code.
   A range-fetch stall timeout is not a total setup timeout; INSTALL_CEILING is
   idle admission, not cancellation. Evaluate narrowly before more runtime work.
7. Document the separate main-thread canvas-plot Pyodide upgrade: authored
   startup-done and shared worker readiness do not await it; PNG fallback exists.

The earlier coherent HEADERED demo CI39973870063 at course5bd385fb/activation87c
passed all three browsers on one artifact, including saved answers and grading.
That result remains valid for that older exact tuple only. It is not evidence
for the new WIP or raw-clean static first visit. Live-course/static go-ahead HOLD.

## Retained evidence, available from GitHub

`evidence/2026-10-23-cloud-restart.zip` contains the full old first-visit reports,
strict targeted Chromium CDP report, passive harness/analysis, provenance summary
and loading drafts. ZIP SHA256:
`b13fc0c4ae34e27c594a1018860da3f751c0bc2595780abaa87d48b2541d9c69`.
It contains a per-file SHA256 manifest. Existing GHA CI artifacts remain linked
from demo19 and the earlier checkpoint.

The targeted Chromium run had functional success and zero actual raw errors,
but strict pending failure: one replaced-loader font and three retired-board
requests had unknown client completion. SW downstream completion is not proof
of old-client consumption. All thirteen observed Matplotlib ranges completed;
the original Chromium Matplotlib ERR_ABORTED was not reproduced or explained.
Do not relabel it as a harmless reload or teardown error.

## Variants continuation after first-visit closure

Checker25 is a partial native authoring foundation, not a completed teacher
workflow. It combines actual checker main76ec14e with reviewed open21/0f58fade
placeholder and23/b615e8 stream heads as explicit parents. Its first commit
9a5bab0f preserves those parents; final53c16f47 adds saved seed/CLI work.
No browser wheel/payload change is claimed.

Before stopping, focused model/history/distribution/seed/safeCLI contracts passed;
the final distribution launcher inclusion was not rerun. Read its committed
workflow/interface/checkpoint docs before coding. Persisted proposal/decision
history, optimistic atomic writes, native-only distribution and lazy label-seeded
domain traversal are saved; full resolution/orchestration, installed native seam,
review UI, required day-one bot, component bridge/student selection are unfinished.

Root/native-agent interface: wrapper question-variants.py --stdin takes version1
source/question/options/file/label/projectRoot/sourceFile/approval/renderMode/action/
manifest/baseHash. Native authoring stays outside browser wheels. Existing exact
context codec is version1 with fields, encoded variables/teacher and variant:null
before a decision or positive {n,id,hash} after a decision. Do not invent n=0.
The bridge owns Lua/JS, native resolver/CLI/review UI is the native author's seam.

AC's policy is binding: Generate25more means 25 actually tested, valid, distinct
resolved notes; constraints/duplicates do not count, rejected history is retained,
execution/grading/test failures stop rather than resample. Approved identities,
numbers, decisions and proposal order survive range growth. No unchecked20k pool.
Required remains default; explicit OPEN means existing approval:optional, with a
warning, not a new option spelling. Preview/review can show unapproved banners;
publishing/CI stop at zero approved and warn below target. Finish bulk approval,
undo, changed snapshots, stable student seed/seen/restore and safe serial bot.

Read only the next needed approved design sections. Do not start ingmat3a main,
offline expansion or unrelated STACK parity while first-visit/variants are open.
