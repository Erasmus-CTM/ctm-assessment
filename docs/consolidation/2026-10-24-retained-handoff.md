# Retained handoff knowledge — 24 October 2026

This short replacement for useful handoff notes preserves operational contracts
and unresolved leads before AC decides branch disposition. It changes no design,
checker verdict, approval, source pin or deployment. The approved designs are
already on main; [step6 §16](2026-10-step6.md#16-revision-after-the-independent-review-binding-overrides-earlier-sections)
is binding, including AC's decisions in §16.14 and §16.15.

## Loading and failure isolation

Keep these milestones separate when changing loading code:

| Milestone | What it establishes | What it does not establish |
|---|---|---|
| Initial component UI | Registered editor/question imports, construction and required rendering have settled | Python packages, authored startup or every nested-frame request is complete |
| Document COI decision | This document stays, or navigation retires it | A replacement document is already ready; WebKit supports shared buffers |
| Interpreter stage1 | The particular Python backend accepts commands | Required checker/package closure for every component, IDE background setup or independent Maxima readiness |
| Background setup/stage2 | The configured optional IDE packages/setup have settled or their failure was reported | Every ordinary exercise must wait for all IDE background work |
| Question Check / IDE Run | That request's dependencies and execution produce its actual result | A visible control, restored answer or status icon proves successful grading |

The shared Python promise is published synchronously. A retiring document must
not release Python or optional speech startup. Initial-UI registration includes
restored editors constructed in the initial batch; later user-added editors are
not retroactively first-loading work. Registered failures retain their cause.

Required independence is preserved:

- Missing JSXGraph must not break Python exercises.
- Missing speech must not disable ordinary Check. Parent loading and ordinary
  controls do not wait for optional opaque-frame speech startup.
- Maxima readiness remains independent. Native Linux execution is not browser
  or Wasm readiness.
- Service-worker isolation/reload handling is distinct from offline caching.
  Registration alone proves neither offline completeness nor interactive input
  or Stop support.
- Optional background setup failure must not become a blanket Check failure.
  Authored setup/output/autorun order remains separate from ordinary grading.

The loading-status spinner owns an inline-block 1em square before and after SVG
replacement. The diagnostic same-document size correction matched the observed
WebKit layout discrepancy; Font Awesome CSS was already present, so it was not
proof of late stylesheet arrival. Keep the owned fix rather than importing the
old vendor-phase patches, filtering ResizeObserver errors or suppressing faults.

Step6's per-runtime Stop/restart contract is an additive change to this lifecycle,
not a reason to stop or restart the mixed page's unrelated published runtime.
The backend adapter and queue rules are in step6 §16.2–§16.3. Read that contract
instead of copying implementation from the separately owned Maxima repository.

## Practical variants authoring

Use the installed math component's canonical native wrapper. Keep a stable
question label, `variables`, field labels and a resolved question note. Teacher
answers and authored tests must pass before a proposal counts; failed grading or
tests are errors, not another silent random draw. Legacy `parameters` syntax is
retired by the approved authoring design.

For an authored question in `lesson.qmd` labelled `my-question`:

```sh
python _extensions/math-exercise/question-variants.py \
  --project . --file lesson.qmd --label my-question \
  generate25more --html work/my-question-review.html
```

Generate 25 more retains earlier proposals, stable approval numbers, decisions
and history. Duplicate resolved notes do not count toward 25; exhaustion may
return fewer. Stage explicit decisions in the disconnected review file, download
the request, then apply it through the same wrapper:

```sh
python _extensions/math-exercise/question-variants.py \
  --project . --file lesson.qmd --label my-question \
  apply /path/to/variant-decisions.json --html work/my-question-review.html
```

A read-only refresh uses `review` in place of `generate25more`. Connected local
review uses the selected file/label and a token-protected loopback page:

```sh
python _extensions/math-exercise/variants-review.py \
  --project . --file lesson.qmd --label my-question
```

Use the ordinary `_variants/LABEL.yml` path. For included questions, give the
actual source file to `--file`. Downloading or staging a request writes no
decision. Applying rebuilds against current source and the original manifest
lease; stale content/teacher hashes or another writer fail closed. A timeout
following a possible write is uncertain: inspect current history instead of
blindly retrying an old request.

`required` remains the publishing default: no current approval fails; fewer than
the target warns. The explicit `CTM_VARIANTS=optional` exception keeps unapproved
warnings. `CTM_VARIANTS=review` is a nonstudent review route. Ordinary preview is
not automatic approval. An isolated student view still needs its real runtime;
course context and diagrams need the separate course review build. No workflow,
bot, preview hosting, live check attachment or real teaching approval is
activated by these instructions.

The source CLI and loopback entry points were checked in math-exercise main
`792dcfa913696b61db1289fd066c78a078d9a0d0` while retaining these notes. This is a
source-interface check, not a newly executed generation/approval workflow.

## Checker decisions to preserve in C6

S-11 is on ctm-checkers main through the recovered feature set; stack-sympy
[PR28](https://github.com/Erasmus-CTM/stack-sympy/pull/28) is merged. C6 starts on
current main and follows [step6 §16.6](2026-10-step6.md#166-ordering-r6-replaces-12s-prerequisites):
classify learner-input failures as CAS results, question failures as `author`,
and infrastructure/unexpected failures as `runtime`. Error codes and prepare
JSON are additive API1.1; they do not authorize new verdicts.

AC's recorded S-11 decisions remain:

- A bounded hyperbolic AlgEquiv answer can remain false in this implementation
  until S-12 supplies deterministic budgets. Do not silently change it in C6.
- LowestTerms on a non-expression remains an open AC decision before any
  behavior change. Preserve the current verdict and its recorded divergence.

The original decision is in [checker PR13](https://github.com/Erasmus-CTM/ctm-checkers/pull/13).
Current checker CHANGELOG already records both limitations. Subsequent fix order
(S-12, S-04, S-08, S-09, S-06) is in checker consolidation notes and step2 §9/§13;
this note does not reorder those features. H1 remains after variants and before
JS admission, as step6 §16.10 requires.

## Unverified follow-up leads from old handoffs

These are preservation leads, **not newly proven defects or release blockers**.
Check whether current source/tests already satisfy each before implementing it.

| Owner | Lead to inspect | Source |
|---|---|---|
| ctm-libs | Row-only navigation reflow coverage; standalone slash-include resolution; missing-font server guard; remaining small documentation corrections | [Old handoff](https://github.com/Erasmus-CTM/ctm-libs/blob/0a6798fef5edf398227b842887810d23cb954add/HANDOFF-2026-10.md) |
| math-exercise | Exact `form-credit: 0` coverage; fail-closed invalid checker-folder handling in current native-wrapper tests; deterministic feedback-attribute order | [Old handoff](https://github.com/Erasmus-CTM/math-exercise/blob/da912d2a60fae493cdf37e54709e07564afc6eb6/HANDOFF-2026-10.md) |
| py-exercise | E11: Monaco loader/editor deduplication with pyodide-interaktiv remains unverified. Current py-exercise has `ensureMonaco`/editor creation and pyodide-interaktiv has `initMonaco`; shared runtime readiness/gating alone does not prove deduplication complete. Store/reset fixes are already merged. | [Old handoff](https://github.com/Erasmus-CTM/py-exercise/blob/e0bd5561a93103bb1b9961750196eff389df3da9/HANDOFF-2026-10.md); current-source witnesses: [py-exercise](https://github.com/Erasmus-CTM/py-exercise/blob/68d2e28b43d54150248398fa9ad12385bf644eed/_extensions/py-exercise/py-exercise.js#L30), [pyodide-interaktiv](https://github.com/Erasmus-CTM/pyodide-interaktiv/blob/f16c7668c6da2fa5ff4ef80691c2a56743cdca7d/_extensions/pyodide-interaktiv/qpyodide-cell-classes.js#L633) |
| pyodide-interaktiv | Figure mouse-enter focus/mouse-leave blur observation; step8's upstream-member decision and compatibility table remain separate | [Old handoff](https://github.com/Erasmus-CTM/pyodide-interaktiv/blob/e97017ca464c25fcf328d9d95e3419568a2f8982/HANDOFF-2026-10.md) |
| stack-sympy | Narrow rendered-guide allowlists and negative mutation checks not incorporated in main | [Checkpoint](https://github.com/Erasmus-CTM/stack-sympy/commit/baaf82e394330f413fa907545d610f8c3783a7e8) |
| ctm-checkers | Deferred changed-golden native observation collector: only if wanted as a separate reviewed manual tool, with a selected base and exact provenance | [Checkpoint](https://github.com/Erasmus-CTM/ctm-checkers/commit/6bf69f391a8f6afd831cc4afa8d3e3fb19a1b06f) |

## Small historical proof index

These links preserve the exercised tuples and acceptance limits. They do not
claim that a newly combined main tree, offline product or protected course has
passed the same checks.

| Evidence | Exact scope |
|---|---|
| [Assessment28 store/D2 run40035037709](https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40035037709) | Head `f358a381`, assessment `a7c300e9` and pyo `4be39083`; original store/D2 gates, separate from service-worker first visits |
| [Demo19 first visit40035232112](https://github.com/aacchhee/ctm-demo/actions/runs/40035232112) | Head `f9eb947a`; original three-browser first-visit and missing-dependency isolation controls |
| [Demo20 first visit40035241322](https://github.com/aacchhee/ctm-demo/actions/runs/40035241322) and [network40035241238](https://github.com/aacchhee/ctm-demo/actions/runs/40035241238) | Head `b50630da`; authoring tuple, real service-worker lifecycle. WebKit proves the explicit unavailable fallback, not shared-buffer Input/Stop |
| [Demo20 authoring40035241288](https://github.com/aacchhee/ctm-demo/actions/runs/40035241288) | 99 teacher vectors/349 fields; zero real approval decisions. Manifest/history and incidental display-target limits retained |
| [Readable final checkpoint](https://github.com/Erasmus-CTM/ctm-assessment/commit/f1a50029a845ffd591f56af153e86e08a9128198) | Historical source identities, original CI links and small receipts; its merge-status narrative is superseded by the present branch report |

The canonical default133 provenance record at assessment `a7c300e9` had SHA256
`319c1b0959b49e9bd6102a1fae72ef5a2331a96536e66d7cbca8f8b13cf64f02`.
This identifies that historical installation, not the later complete asset lock
or a replacement for its required review. The offline IDE asset-lock hash needs
AC's approval of the actual lock diff; old successful installation or browser
results do not authorize that hash change.

Raw logs, network captures, ZIP parts and large evidence archives remain in
original CI artifacts or historical storage. None is copied into this PR.
