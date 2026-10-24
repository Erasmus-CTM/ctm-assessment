# Branch disposition review — 24 October 2026

This is the branch-housekeeping report requested by AC. The 41 listed branches
are reviewed in one table per repository. Snapshot refs were checked against
GitHub again at **11:21 CEST, 24 October 2026**; table evidence comes from fresh
isolated clones, `git cherry`, merge-base diffs, exact file identities and local
hypothetical merge trees. No branch was deleted, no source ref was changed, and
no runtime or course acceptance is inferred from this documentation review.

- **a — incorporated or superseded:** the evidence says whether this is exact
  byte/tree equivalence or replacement by a maintained successor.
- **b — wanted work:** keep it until the specified narrow landing route or
  readable-note preservation is complete.
- **c — obsolete:** no product merge proposed; historical failures remain
  historical, and a successor awaiting integration is not claimed to be on main.

`git cherry +` alone does not prove missing functionality. Five assessment
branches with unmatched commit identities make no change at all when
hypothetically merged into the observed main tree. Conversely, a PR merged into
an intermediate branch does not prove its content reached main.

## Explicit keeps and merge protocol

Keep every `main` and `gh-pages`, plus the branches AC listed:

- pyodide-interaktiv: `feature/shared-feedback-integration`, `issue-1-webagg`.
- ingmat3a_ntnu: `linalg-branch`, `consolidation/2026-10-exercise-quizzes`.
- ctm-libs: `consolidation/2026-10-mathjax-opaque-adaptor`,
  `consolidation/2026-10-step5-assets-union`,
  `consolidation/2026-10-mathjax-static-cors`,
  `consolidation/2026-10-variants-authoring`, and
  `consolidation/2026-10-first-visit-readiness`.
- ctm-assessment: `consolidation/2026-10-offline-ide-zip`.

AC alone decides deletion and merges. For the next merge in a stacked set,
retarget to its real target first, update against that target, and compare a local
merge tree with the exact CI-tested tree. If they differ, update the branch and
rerun the affected checks. Preserve the reviewed pins and run
`setup-feedback-integration.py --check-pins` after the set merges
([step1 §12.1](2026-10-step1.md#121-amendment-stacked-sets-ac-20-oct-2026-binding)). No production deployment,
protected course rollout, repository rename, runtime release or tag is authorized
by this report. `stack-wasm-maxima` is owned by other workers and was not accessed.

The stranded library variants are now proposed on current main in
[ctm-libs #44](https://github.com/Erasmus-CTM/ctm-libs/pull/44). Its complete
candidate tree is byte/mode identical to reviewed #43; the optional adaptor/CORS
route stays on existing [PR37](https://github.com/Erasmus-CTM/ctm-libs/pull/37),
resolved on the reviewed recovery and retargeted to main after AC merges its
predecessor. No duplicate transport PR is proposed. Neither is declared merged here.

## ctm-libs

Observed main: `4831e145eafa481febd6af5fc5d8007d989961c2`.

| Branch / exact tip | Class | Disposition and evidence |
|---|---|---|
| [consolidation/2026-10-step3-review](https://github.com/Erasmus-CTM/ctm-libs/tree/consolidation/2026-10-step3-review) `8f22a87cb6ef2ee435d78a6e87cf916a287c7960` | a | **Already incorporated; only an empty-tree review-ref commit is unmatched.** 8f22a87 changes no tree versus its parent. The Lua checker loader and both checker test files are byte-identical to main (87a954cf / 5ee6018e / 0bfe73da); main contains #26 at59def81 with the released checker pin. Do not import the old review-only trailer. |
| [consolidation/2026-10-step5-assets](https://github.com/Erasmus-CTM/ctm-libs/tree/consolidation/2026-10-step5-assets) `2ed1a3381bb6b606e3a913905095eadd8aee0988` | a | **Superseded by merged #35.** Its entire feature delta is assets.json; branch and main blob are exactly3a01d46325dac33fa12f256cc90f9e788f37ef71. git cherry shows two unmatched patches because #35 integrated them through a union, not their identities. |
| [consolidation/2026-10-step5-assets-api](https://github.com/Erasmus-CTM/ctm-libs/tree/consolidation/2026-10-step5-assets-api) `c44cd395ce56216f8ee01017af6234c8d7f48a66` | a | **Superseded by merged #35, with later readiness/layout evolution.** assets.js, assets.json, lua/runtime.lua, lua/settings.lua and delivery-render.test.cjs are byte-identical to main. The final DOM-boolean test commit c44cd395 is patch-equivalent on main (git cherry -). The remaining API source evolved in the reviewed API3/assets union #35 and later #39; do not merge its older parallel runtime copies. |
| [handoff/2026-10](https://github.com/Erasmus-CTM/ctm-libs/tree/handoff/2026-10) `0a6798fef5edf398227b842887810d23cb954add` | b | **Preserve only unresolved follow-up notes in [the retained follow-up notes](2026-10-24-retained-handoff.md); do not merge the stale handoff wholesale.** One unique commit adds only HANDOFF-2026-10.md (68 lines). Main already has alias removal, store/assets and #30; checker cleanup and its docs are now implemented. Before AC deletes, retain the unverified small follow-ups: row-only nav-reflow test, standalone slash-include resolution, missing-font server guard, and documentation nits. These are triage leads, not newly proven runtime defects. No raw evidence archive exists in this branch delta. |

## math-exercise

Observed main: `792dcfa913696b61db1289fd066c78a078d9a0d0`.

| Branch / exact tip | Class | Disposition and evidence |
|---|---|---|
| [demo](https://github.com/Erasmus-CTM/math-exercise/tree/demo) `7c4a352b08f078485d74c07a56b278e13180ff46` | c | **Obsolete standalone showcase; no production merge proposed.** One unique commit7c4a352 adds20demo paths: generated index.html/vendor assets, source index.qmd, custom auto-expand/progress scripts and CSS. None is on main. Its hand-authored showcase/progress path predates the canonical ctm-demo/shared store+variants product; merging the generated HTML and duplicate tracker would introduce a second demo architecture. Archive the source commit if AC wants the presentation retained. |
| [feature/ai-feedback-context](https://github.com/Erasmus-CTM/math-exercise/tree/feature/ai-feedback-context) `bb0689e9b447818f8a1a301e3083c06e7ba152a0` | a | **Functionality superseded by merged shared-feedback/context route.** Two unmatched old commits atbb0689e use automatic section context plus explicit math-exercise-context. Main contains800694e (combine auto-section with explicit context), then merged shared-feedback #13/#23 and context extraction through ctm-libs. Main Lua still documents explicit context IDs/none and auto-section context; newer tests ai-context*, ordinary-context-text, source-panels and shared-feedback cover the maintained route. The old patch is not byte-equivalent and must not overwrite current scope/isolation handling. |
| [feature/vector-matrix-input](https://github.com/Erasmus-CTM/math-exercise/tree/feature/vector-matrix-input) `4f9d3c2571a3049355bfbb21c9744c3dcbd6ce37` | a | **Superseded by vector/matrix v2 #5 and subsequent shared editor refactor #20.** One unmatched old commit4f9d3c implements vec[]/mat[] markers. Main contains6226cd4 plus #5 mergee4af491, dynamic matrix #6 and shared-editor #20 merge5945f8f. Current Lua still recognizes vec[, mat[ and mat{; vector-matrix-tests.qmd and vector-matrix/matrix-input tests are present. Do not revive the original older inline editor. |
| [handoff/2026-10](https://github.com/Erasmus-CTM/math-exercise/tree/handoff/2026-10) `da912d2a60fae493cdf37e54709e07564afc6eb6` | b | **Preserve only unverified minor test/determinism follow-ups in [the retained follow-up notes](2026-10-24-retained-handoff.md).** One unique56-line HANDOFF file, no code/evidence. Store and authoring/variants work is now on main (#27–#33). Retain leads for exact form-credit:0 regression coverage, fail-closed invalid checker-folder handling in replacement variant tests, and deterministic feedback attribute ordering. Original test_variants.py is retired, so translate intent to the current native wrapper tests rather than restoring it. |

## py-exercise

Observed main: `68d2e28b43d54150248398fa9ad12385bf644eed`.

| Branch / exact tip | Class | Disposition and evidence |
|---|---|---|
| [lti](https://github.com/Erasmus-CTM/py-exercise/tree/lti) `5c51c9700284e9a0c6511320e4ebb33020186119` | b | **Keep wanted LTI experiment pending a separate fresh-main PR proposal; do not merge the old branch.** Three unmatched commits (first two are testing branch). Unique tip5c51c970 adds unconditional LTI_SUBMIT_URL placeholder, an LTI footer button and POST of exercise records to the placeholder URL. None of these are in current main. Proposed PR: optional LTI/BFF submission integration on current store/export APIs, with explicit opt-in, URL/config contract, success/failure UI and tests; exclude bulk reindent and old runtime copies. LTI product decisions are outside the approved consolidation design and remain AC-owned. |
| [testing](https://github.com/Erasmus-CTM/py-exercise/tree/testing) `b3e0b47273855352c3aa90a42ca2355a6348aaa0` | b | **Salvage the useful decoder import guard; propose modern smoke coverage separately.** Two unmatched commits d126a988 andb3e0b472 add a Playwright mini-page workflow plus decode.py __main__ guard. Main decode.py still prompts on import, so that guard is genuinely absent. Fresh-main [PR14](https://github.com/Erasmus-CTM/py-exercise/pull/14) now preserves the missing import guard with unchanged CLI behavior; head `2778d053` has one changed file and focused positive/negative import and exact CLI-output checks. A separate optional browser-smoke PR can port editor/edit/check/reset/download assertions to current fixtures, without headed sleeps, old dependencies or hard-coded /tmp downloads. Current runtime tests already cover store reset/no starter resave, but do not prove this old real-browser workflow is redundant. |
| [handoff/2026-10](https://github.com/Erasmus-CTM/py-exercise/tree/handoff/2026-10) `e0bd5561a93103bb1b9961750196eff389df3da9` | a | **No unique implementation or evidence to land; stale planning notes are superseded.** Unique54-line HANDOFF only. Its only repo-specific next work was store/reset behavior and shared Monaco ownership. Main #10 has store and reset tests (runtime.test.cjs333/520) and shared initial-UI/Monaco handling through libs. Cross-repo designs/rules already live on assessment main. No raw logs or other artifacts are in this branch delta. |

## pyodide-interaktiv

Observed main: `02cbb90dd93ebc90ac00c33c5767a0f6a6c7de33`.

| Branch / exact tip | Class | Disposition and evidence |
|---|---|---|
| [handoff/2026-10](https://github.com/Erasmus-CTM/pyodide-interaktiv/tree/handoff/2026-10) `e97017ca464c25fcf328d9d95e3419568a2f8982` | b | **Keep two small future-work notes centrally; preserve integration branch, not the stale handoff tree.** Against main this branch is69 commits ahead because upstream main intentionally remains1.6.1. Against the authorized target feature/shared-feedback-integration f16c7668 it is only one unique57-line HANDOFF file (45commits behind). No unique implementation to transplant. Preserve step8 member decision/compatibility table and the unverified figure mouse-enter focus/mouse-leave blur observation in [the retained follow-up notes](2026-10-24-retained-handoff.md). Store work is now merged in #6–#9; do not merge the old integration snapshot into main as housekeeping. |

## ctm-assessment

Observed main: `7792ca317996b91e0b98f275968826578ecfb6ad`. Five exact no-op merge proofs use main tree `a312d83df8a629054eb7e641ba326b22297410b6`.

| Branch | Class | Evidence and proposed disposition |
|---|---|---|
| `consolidation/2026-10-assets-comparison-followup` (`9489b10`) | a, obsolete alternative wrapper | Its canonical three-URL substitution/resource-order proof and explicit-true preload rule are in current `tools/compare-rendered/assets.mjs`, evolved through `f4875e8`, `68fe838`, `a9bf1e3` and recovered onto main by [#59](https://github.com/Erasmus-CTM/ctm-assessment/pull/59). Main retains the branch's step4 expectations plus the stricter renderer transition. Whole branch merge conflicts in four files because it is an old alternative, not a missing production feature. Do not restore its old CI wrapper. |
| `consolidation/2026-10-compose-pyodide-defaults` (`64a44e8`) | c, superseded by stricter composition | Adds the same preload/UI-language composition area as accepted `64e8507`, but permits any listed new UI language. Main requires the new feedback language to equal the unchanged document language; its negative calibration is preserved. The branch's private `compare-step4-defaults.yml` workflow is absent and unnecessary. Keep current strict rule; no landing PR. |
| `consolidation/2026-10-resize-upstream-controls` (`49f0c63`) | c | Hypothetical merge adds 12 diagnostic files/workflow plus changes to store observers/instrumentation. None is a missing product feature. It proposes source-phase vendor controls rather than the owned status-icon correction now consumed by main. [#50](https://github.com/Erasmus-CTM/ctm-assessment/pull/50) is closed unmerged. Retain historical failure links, not vendor patches or this workflow on main. |
| `consolidation/2026-10-step4-default-composition` (`64e8507`) | a | **Exact proof:** clean hypothetical merge into main has zero changed files and the same main tree; the branch patch also reverse-applies to main. Strict explicit-true/UI-language calibration is already there via `68fe838` and [#59](https://github.com/Erasmus-CTM/ctm-assessment/pull/59). |
| `consolidation/2026-10-step4-preload-evidence` (`d4ff37d`) | c | Only unique delta is `.github/workflows/step4-preload-evidence.yml`, a one-off retained-report inspector. No production delta; [#46](https://github.com/Erasmus-CTM/ctm-assessment/pull/46) closed unmerged. Current production comparison/calibration replaces its purpose. |
| `consolidation/2026-10-step5-assets` (`982ea3b`) | a | **Exact proof:** zero delta from its merge base `294d5b8` (a main ancestor), and clean hypothetical merge has identical main tree. It is the intermediate merge of [#33](https://github.com/Erasmus-CTM/ctm-assessment/pull/33), recovered by #59. |
| `consolidation/2026-10-step5-assets-api` (`89d7e5f`) | a | **Exact proof:** clean hypothetical merge has identical main tree. Its only added Lua behavior is recomputing `_ctm-assessment-pin-defaults` from keys actually filled by the hook; main retains that behavior and later atomically adds reviewed preloader metadata. |
| `consolidation/2026-10-step5-npm-lock` (`a7822b6`) | a | **Exact proof:** zero delta from main ancestor `1e2df49`; clean hypothetical merge has identical main tree. Intermediate merge of [#34](https://github.com/Erasmus-CTM/ctm-assessment/pull/34), recovered by #59. |
| `consolidation/2026-10-storage-descriptor-evidence` (`bec2e2b`) | c | Unique addition is the retained-report inspector workflow; inherited canonical resource proof is already current. Hypothetical merge still changes old comparator tests/wrapper and conflicts, so this is not an exact equivalent branch. [#42](https://github.com/Erasmus-CTM/ctm-assessment/pull/42) closed unmerged. No landing PR. |
| `consolidation/2026-10-store-comparison-checkpoint` (`dd4dcc8`) | a for source, c for old evidence wrapper | Main has **exact same blobs** for `tools/compare-rendered/store.mjs` (`50eb734…`) and `tests/compare-rendered-store.test.cjs` (`b9a99af…`). Comparator/calibration evolved further in accepted store route. Unique old workflow and checkpoint evidence page are not product source; do not merge whole branch or reactivate its CI. |
| `consolidation/2026-10-store-comparison-rules` (`6aa9bdf`) | a, superseded calibrated route | Same exact two source/test blobs as above; main's calibration and expectation plumbing have subsequent edits. Hypothetical whole-branch merge conflicts in four files, so preserve current accepted route rather than replaying this alternative. |
| `consolidation/2026-10-store-integration-checkpoint` (`3d8e5e1`) | a, evolved implementation | Main retains exact blobs for store README, canonical builder, changes contract and all three course fixture files. Browser/instrumentation and workflow are later accepted successors from [#28](https://github.com/Erasmus-CTM/ctm-assessment/pull/28) and recovered assembly #59. Main's current workflow deliberately gates broad campaigns manually. Do not restore the earlier harness/workflow over it. |
| `consolidation/2026-10-webkit-runtime-setup` (`31de892`) | a | **Exact proof:** clean hypothetical merge has identical main tree. Version-matched bundled-browser setup and pipefail fixes were composed in `f4875e8`/`68fe838`; broad workflow policy subsequently changed on main. |
| `docs/2026-10-variants-maxima-seeds` (`e6720c2`) | a for approved design, c for old notes | Main's step4, step5-offline and variants-review blobs are byte-identical; variants design contains the branch's decision20 plus later binding decisions21–23. [#57](https://github.com/Erasmus-CTM/ctm-assessment/pull/57) explicitly transferred these approved designs. Remaining differences are old handoff notes, not a new seed design. |
| `review/2026-10-runtime-order-input` (`a628299`) | c | This is an isolated source-review input: it changes old component pins plus inherited comparison diagnostics. Current `integration/feedback/repos.json` is different and reviewed in the accepted successor. No runtime-order feature is owned by this branch; no landing PR. |
| `handoff/2026-10` (`f1a5002`) | **b: selected readable knowledge retained here**, remainder c | Approved variants and step5 designs are already exact on main through [#57](https://github.com/Erasmus-CTM/ctm-assessment/pull/57). [The retained notes](2026-10-24-retained-handoff.md) preserve the current loading/failure-isolation contract, practical authoring route, bounded historical proof links and pending decision leads. No wholesale handoff merge is needed. Old prompts/status narratives and raw ZIP/log/archive evidence are not copied onto main. |

## ctm-checkers

Observed main: `cf6570b13f92d17a437fe5a61cd103c84adf7f1e`.

| Branch | Class | Evidence and proposed disposition |
|---|---|---|
| `codex/2026-10-stack-review-checkpoint` (`6bf69f3`) | **b: preserve as a separate deferred tool proposal**, not A1 | Four unique files/492 lines remain absent on main: an intentionally disabled workflow, two PHP/Python changed-golden collectors and their tests. It is observation tooling, not a grader correction and not demonstrated native acceptance. Proposed fresh **“Collect reviewed changed-golden native evidence on demand”** PR from main should parameterize its hard-coded `9e042dc` comparison base, preserve current manual campaign policy instead of enabling its old automatic PR trigger, and validate exact native provenance before use. This is optional follow-up for future grading changes; it does not belong in C6 or block step6 A1. If AC does not want this generalized tool, classify the old disabled experiment c; do not silently enable it. |
| `handoff/2026-10` (`d22fa3e`) | **b: current decision note retained**, remainder c | Only unique path is old `HANDOFF-2026-10.md`; no Python/wheel/golden code. The current [C6 decision note](2026-10-24-retained-handoff.md#checker-decisions-to-preserve-in-c6) records the AC-gated non-expression LowestTerms difference and accepted hyperbolic fallback until S-12. Fix ordering already lives in main notes and step2 §9/§13; do not restore old step-status tables. |

## stack-sympy

Observed main: `367f407a91d918ac8b7f47d2d4e7658a7dc26c29`. [PR28](https://github.com/Erasmus-CTM/stack-sympy/pull/28) is merged; this closes the step6 prerequisite.

| Branch | Class | Evidence and proposed disposition |
|---|---|---|
| `codex/2026-10-stack-expectations-checkpoint` (`baaf82e`) | **b: wanted test hardening** | Main still has the original four section-wide allowlists in `tests/compare-rendered/stack-checkers-0.10.yml`; checkpoint replaces them with exact text/location/markup rules and adds a mutation regression rejecting unrelated prose, controls, attributes and question payloads. Clean hypothetical merge adds/changes exactly three files; it is **not incorporated** by [#28](https://github.com/Erasmus-CTM/stack-sympy/pull/28). Propose fresh **“Narrow rendered-guide comparison expectations”** PR from main, retain the shared comparator's one home, update the checkpoint's obsolete Node22/setup-node@v4 step to current workflow policy, then run its actual Quarto/mutation checks before declaring ready. This can be an independent feature PR, separate from K6a rename. |
| `handoff/2026-10` (`4c9c0ae`) | c | Only unique path is old `HANDOFF-2026-10.md`; there is no implementation delta. Its future component work is now specified by the approved step6 design §16, the shared policies are in approved designs, and its checker pin is superseded by merged #28. Preserve current decisions in main design/log, not another dated step table or private-report handoff. |

## aacchhee/ingmat3a_ntnu

Main snapshot: `e45851080f462e84cde281528f21d4f21292a6ba`. Keep `main`, `gh-pages`, `linalg-branch` and PR17's `consolidation/2026-10-exercise-quizzes` as instructed.

| Branch / head | Class and disposition | Evidence and landing route |
|---|---|---|
| `consolidation/2026-10-quiz-document-identity` — `46ddd00bf1fb8508e2b01438fdbcf36dc73e91e5` | **(c) Superseded by the kept PR17 branch.** No separate PR needed. | `git merge-base --is-ancestor <identity> <PR17>` exits 0. PR17 is exactly one commit ahead. All course sources, checker/browser harnesses and contracts are byte-identical; the only direct tree difference is `.github/workflows/exercise-quizzes.yml`, where PR17 uses its reviewed Playwright container instead of the older browser installation steps. Its identity checks are therefore already retained by [PR17](https://github.com/aacchhee/ingmat3a_ntnu/pull/17), **not yet main**. |
| `preparation/2026-10-course17-a7-current-closure` — `9ed97fc954f005f1ae9168cf3db3c352c7d48476` | **(b) Keep wanted coherent-pin preparation until the PR17 dependency update is resolved.** | Single parent is current PR17 `23e47057806766ecb95f3cc86cf92eefa8102316`. Exactly two files differ from PR17: `quarto-extensions.yml` and `.github/workflows/exercise-quizzes.yml` (6 insertions/6 deletions). All other 119 tracked leaves and modes match PR17. Proposed landing route: reviewed dependency-update commit on PR17, refreshed to the finally accepted component closure if needed, then PR17's strict course acceptance before AC merges it. Do not merge this old preparation wholesale or treat its one-page proof as course acceptance. |
| `handoff/2026-10` — `1e5db41cfaf79fa58b59049f3755e6e383e6f228` | **(c) Historical handoff; no unique product work to land.** | Main is 66 commits beyond the handoff's common base; branch is 2 ahead. `git diff main...handoff` adds only the 56-line `HANDOFF-2026-10.md`. The note describes the pre-PR16 migration, which [PR16](https://github.com/aacchhee/ingmat3a_ntnu/pull/16) has since merged; PR18 subsequently fixed hidden applets. Do not restore older course content from a direct old-tree diff. Its still-relevant protection/merge rules are already recorded in the current campaign request and current consolidation docs. No additional main preservation PR is needed; no raw logs or archives should be copied. |

## aacchhee/ctm-demo

Main snapshot: `12044f261661613b43fc4ed5751f5bcfeb91db17`. Keep `main` and `gh-pages`.

| Branch / head | Class and disposition | Evidence and landing route |
|---|---|---|
| `stack-notes` — `f44ace4b4b15f6020cdaf64c5bbb076c67be3c02` | **(c) Explicitly withdrawn reproduction page; no landing PR.** | `git cherry main stack-notes` has one unique patch, this commit; merge-base diff is 25 files/3465 added lines for `_stack-repro`, its native oracle/captures and preview workflow wiring. [PR17](https://github.com/aacchhee/ctm-demo/pull/17) was closed unmerged; the handoff explicitly says the repro was withdrawn and its author-facing questions moved to the semantics page. It is therefore **not** already on main and should not be reintroduced to reduce branch count. |
| `handoff/2026-10` — `aaf70eeaa775dad424a52b716e85165814ba5153` | **(c) Historical handoff; preserve no additional product code on main.** | Main is 20 commits ahead of common base; branch 2 ahead. `git diff main...handoff` adds only the 65-line `HANDOFF-2026-10.md`. Its product snapshot predates [PR19](https://github.com/aacchhee/ctm-demo/pull/19), [PR20](https://github.com/aacchhee/ctm-demo/pull/20) and the actual-main recovery [PR21](https://github.com/aacchhee/ctm-demo/pull/21). Preserve the current result and stable evidence links in the campaign's concise audit/log, not old pins, old runtime state or raw captures. The note's JSXGraph upstream dependency is retained explicitly below. No new main preservation PR is needed. |

## aacchhee/jsxgraph-quarto

Fork main snapshot: `d94570dd25b0adee866c075af6fc47dc02b6d65f`. This is **not** `jsxgraph/jsxgraph-quarto` upstream. All four branch-only patches are absent from fork main; none is classified (a) on that basis.

| Branch / head | Class and disposition | Evidence and landing route |
|---|---|---|
| `audit/2026-10` — `e4ad81d82e1b56f86765026a3dd26f6975d29d57` | **(b) Keep: live upstream PR head and the reviewed, pinned renderer.** | Fresh [upstream PR2](https://github.com/jsxgraph/jsxgraph-quarto/pull/2) is open/unmerged and names **this exact head in this fork/branch**. It carries the assessment bridge, hidden/responsive board fixes, graph editor, JSXGraph1.14.1 and `src_mjx_preload` with tests; 29 commits ahead of fork main. Landing route is existing upstream PR2, under AC/maintainer control, followed by the separately reviewed umbrella upstream repin/comparison. Do not delete or substitute fork main for this branch. |
| `ci/2026-10-mathjax-issue-repro` — `ae8099c36f32158694692d8576e33a439cd0bc95` | **(c) One-off diagnostic runner; no production landing PR.** | Exactly six added files relative to fork main (149 lines): `.github/workflows/mathjax-repro.yml` and `mathjax-repro/*`. No extension code differs from main. It isolates MathJax startup/typesetting in plain/isolated pages; relevant product preload functionality and tests are already in the kept upstream PR2 head. Retain a concise diagnostic reference if needed, not this historical runner or raw captures on main. |
| `ci/2026-10-mathjax-preload-tests` — `9a1aba043a66fccba6e1df678406cbaa65d11eee` | **(c) Superseded CI-only execution branch; no separate runtime PR.** | Direct `git diff audit/2026-10 ci/...preload-tests` is **only** the 76-line `.github/workflows/mathjax-preload-tests.yml`. All 17 common tracked leaves/modes, including extension source and both test suites/support files, are exactly equal to the kept audit head. Thus no tests or product fixes are stranded here; the sole unique file is its one-off fork CI harness. Existing upstream PR2 retains the actual tests and documented results. Do not merge the divergent branch wholesale. |
| `feature/assessment-bridge` — `e9d575b0ffa67f3fdb9e1f0a1f447310109d27fb` | **(c) Superseded feature route.** | `git merge-base --is-ancestor feature/assessment-bridge audit/2026-10` exits 0; audit has 27 subsequent commits. The graph editor, bridge and original feature history are retained and improved in upstream PR2. No separate PR is needed, and no claim is made that these changes are already on fork main. |

## Retention and decisions

[Retained handoff knowledge](2026-10-24-retained-handoff.md) replaces the useful
current parts of old handoff documents: loading and failure boundaries, the
variants authoring route, the checker decisions C6 must preserve, and explicitly
unverified follow-up leads. Approved designs remain in their existing main
files. Raw test logs, captures and evidence archives belong in their original
Actions runs, not in this preservation PR.

Remaining proposals are deliberately separate features: decoder import safety,
strict rendered-guide expectations, any wanted manual changed-golden evidence
tool, and an AC-scoped LTI design. The tables are review recommendations, not
new feature approvals, branch deletion instructions or fresh runtime findings.
