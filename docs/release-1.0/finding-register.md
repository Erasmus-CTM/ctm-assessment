# Finding register for CTM Assessment 1.0.0

One register combining:
- the [26 October review](../audit-2026-11/README.md) (IDs H, M, L);
- the extended audit of 30 October ([#93](https://github.com/Erasmus-CTM/ctm-assessment/pull/93), `docs/audit-2026-11-extended/`; IDs GR, A, B, R, P, UX, GOV);
- items found while planning 1.0 (IDs S for STACK, X for the internet-free IDE, D for documentation).

The status is re-checked against the [freeze manifest](freeze-manifest.json) (19 Nov) and updated as review
branches (`claude/nice-dirac-uz5r4x` in each repository) close items; "fixed" means fixed on a review branch, pending
Codex review and AC's merge.

**Status:**
- **open**: present at the frozen commits;
- **partly**: mitigated or partly fixed;
- **fixed**: fixed at the frozen commits, with evidence;
- **decided**: closed by a decision in the [plan](../consolidation/2026-11-release-1.0-plan.md);
- **AC**: left to AC.

**Phase:** the plan phase that closes it.

## Grading correctness (A2)

| ID | Finding | Repository | Status (19 Nov) | Phase |
|---|---|---|---|---|
| GR-1 | Inclusive tolerance rejects valid boundary answers (`abs(sv-cv) <= tol` in floating point) | ctm-checkers `math_exercise/checks.py:27`, `numeric.py:30` | fixed on ctm-checkers `claude/nice-dirac-uz5r4x` (`ac5fd12`): decimal comparison; tests; 9,500/9,500 goldens | A2 |
| GR-2 | Fixed samples give full credit to a non-derivative | freehand_ai_assessment (consumer) | open, but not reachable from the release work; reported to its owner | A2 (consumer) |
| GR-3 | Exact tangent task accepts a small intercept error | freehand_ai_assessment (consumer) | open, same as GR-2 | A2 (consumer) |
| GR-4 | Restored practice key keeps an edited computed badge | math-exercise `math-similar.js` | fixed on math-exercise `claude/nice-dirac-uz5r4x` (`bb52c5c`): recomputed before the first check; test fails on main | A2 |
| M7 | Parity expected-difference entries can whitelist a correct→incorrect flip | ctm-assessment parity harness | to re-check | A2 |
| L2 | Model-supplied maths can freeze Python | ctm-checkers `generated.py` | fixed: result size bounded (#93 "rejected or already repaired") | — |
| S-P | SymPy vs Maxima parity never run on the shared corpora; required by D4 (Maxima default online) | ctm-stack, umbrella | open | A2 |

## Security and exam integrity (A3)

| ID | Finding | Repository | Status (19 Nov) | Phase |
|---|---|---|---|---|
| A-01 / M3 | Authored-answer admission keeps broad SymPy evaluation; the `__` rule still runs `exec`. Blocks exam use | ctm-checkers `math_exercise/inputs.py` | fixed on ctm-checkers `claude/nice-dirac-uz5r4x` (`ac5fd12`): token admission; 619 corpus strings admitted, 30 attacks refused | A3 |
| P01 | SSE stream has no byte, line or time limit | ctm-libs `feedback/feedback-core.js` | fixed on ctm-libs `claude/nice-dirac-uz5r4x` (`1aad554`): text, line, idle and total limits; `OUTPUT_LIMIT`, `TIMEOUT` | A3 |
| P02 | Premature SSE EOF succeeds; data after `[DONE]` is appended | ctm-libs `feedback/feedback-core.js` | fixed (`1aad554`): ends at `finish_reason`/`[DONE]`; `STREAM_INCOMPLETE` | A3 |
| M18 | "AI off in exams" relies on a generated profile; no forced `exam: true` | ctm-assessment `ctm_assets.py`, ctm-libs `assets.lua` | fixed: ctm-libs `claude/nice-dirac-uz5r4x` adds `ctm-assessment: exam`; the umbrella's exam profile sets it (`de87cb8`) | A3 / A5 |
| GOV-1 | AC-only approval of the exam lock receipt is not enforced | ctm-assessment | open (main unprotected) | A4 |
| N-1 | New since #93: handwriting-correction request path (`correction.note`, `previousFeedback`) | ctm-libs `972cae3` | reviewed, no defect (ctm-libs `8f9bb37`, docs/internal/2026-11-review-correction-path.md) | A3 |
| M1 | Feedback KaTeX from a floating CDN | ctm-libs | fixed (`7951db4`, goes through `CTMAssets`) | — |
| M2 | Learner `micropip.install` reaches PyPI in local mode | ctm-libs | fixed (#55) | — |
| L1 | Model TeX `\href{javascript:…}` after a late MathJax pass | ctm-libs, ctm-stack | to re-check | A3 |
| L3 | Legacy API-key copies never deleted | ctm-libs | to re-check | A3 |
| L4 | No CSP, also in local/exam builds | — | open; 1.1 (structural) | after 1.0 |
| L17 | `src_mjx_preload` not checked in local mode | ctm-libs | to re-check | A5 |
| L18 | Runtime falls back to jsDelivr without `CTMAssets` | ctm-libs | fixed (#56, explicit `indexURL`) | — |

## Release chain and versions (A4)

| ID | Finding | Repository | Status (19 Nov) | Phase |
|---|---|---|---|---|
| H2 | Golden replay ran only by hand | ctm-checkers | fixed (`12237e9`) | — |
| H3 | Component CI tests other dependency commits than the package ships | all | fixed on the review branches: py-exercise, ctm-libs, math-exercise and ctm-stack CI pins equal the package's; `release-check.py --remote` requires agreement for a release (`a23e171`) | A4 |
| M0 / M9 | Manual gate not enforced; no protected `main` | all | partly / open | A4 (AC settings) |
| M4 / B1 | ctm-libs frozen at 0.9.0; same-version mixed installs bypass the singleton guard | ctm-libs | B1 fixed on ctm-libs `claude/nice-dirac-uz5r4x` (`bed034c`): code-digest guard. M4 (version 0.9.0): runbook step 9 | A4 |
| M5 | API levels do not describe interfaces | ctm-libs, ctm-checkers, components | open | A4 |
| M6 | No release; `release-check.py` does not compare the CHANGELOG with the pins | all | fixed in tooling (`a23e171`): notes must name every pin; `--remote` requires component tags; release manifest. Tags themselves: R5 | A4 / R5 |
| R-01 | Matching cache marker accepted as a clean pinned source | ctm-assessment `setup-feedback-integration.py` | fixed (`a23e171`): snapshots reused only while they match their recorded inventory | A4 |
| R-04 | `--release` does not bind the checkout to the tag | ctm-assessment `install-project.py` | fixed (`a23e171`): a Git checkout must be the clean tag | A4 |
| M10 | Acceptance evidence bound to tuples that no longer exist | ctm-assessment | to re-check | A4 |
| M11 | Umbrella unit tests never ran automatically | ctm-assessment | fixed (`fc8cb99`) | — |
| M15 / B2 | pyodide-interaktiv ships an older ctm-libs copy | pyodide-interaktiv | fixed on pyodide-interaktiv `claude/nice-dirac-uz5r4x` (`4e8fb76`): copy synced to ctm-libs `bed034c`, stale target record removed | R2 |
| M14 | Package JSXGraph is a personal-fork branch | jsxgraph | fixed (`c8e8260`): pinned upstream 5cd0d1e, the fork pin's tree; an upstream tag is still needed | R3 |
| H4 | pyodide-interaktiv install command installed 1.6.1 | pyodide-interaktiv, docs | fixed (ref added, `81883bc`, `b04b0b1`); goes away for good with R2 | R2 |
| L20 | `cancel-in-progress` on main/publish groups | ctm-checkers, math-exercise | to re-check | A4 |
| L21 | Floating refs (py-exercise publish against ctm-libs `main`, unpinned Quarto) | py-exercise, pyodide-interaktiv | fixed for py-exercise (`claude/nice-dirac-uz5r4x`, `62661b5`) | A4 |

## Internet-free IDE (A5)

| ID | Finding | Repository | Status (19 Nov) | Phase |
|---|---|---|---|---|
| X-1 | IDE ships only two Python-cell pages; math-exercise and py-exercise run only in the `p13-worker` CI fixture | ctm-assessment `integration/offline-ide` | fixed (`1b8cf57`): Exercises page; graded offline in CI and in the [dry run](a5-offline-dry-run.md) | A5 |
| X-2 | A STACK page in a local/exam build is not refused | ctm-libs `lua/assets.lua`, ctm-stack | fixed on ctm-libs `claude/nice-dirac-uz5r4x` (`53e1a5e`) | A5 |
| X-3 | ZIP not released; no `SHA256SUMS`; `release.yml` ships only the tarball | ctm-assessment | fixed in CI (`1b8cf57`): `SHA256SUMS`; a release tag attaches the ZIP. First release: R5 | A5 / R5 |
| M16 | Baseline is a CI artifact expiring 2027-01-24; lock not committed; path filter incomplete | ctm-assessment `exam-site-zip.yml`, `p13-lock-review.yml` | partly: path filter widened (`1b8cf57`); the dry run reproduces the lock without the artifact; the baseline swap is runbook step 5 | A5 |
| M17 / R-03 | Server speaks HTTP/1.0 and re-hashes on every request; nested asset paths lack headers | ctm-assessment `serve-offline.py` | fixed (`1b8cf57`): HTTP/1.1 keep-alive, cached digests, prefix-aware asset headers; shipped as `serve.py` | A5 |
| M19 | The lock binds the full bytes of `pyodide-runtime.js`; every ctm-libs re-pin needs AC re-approval | ctm-assessment `ctm_assets.py` | open | A5 |
| R-02 | P13 manifest covers selected workers, not the whole site | ctm-assessment `p13_assets.py` | open (scope) | A5 |
| X-4 | SEB settings not documented for IT; manual SEB check not recorded | docs | documented ([exam-seb.md](../exam-seb.md)); AC's manual check pending | A5 |
| H5 | JSXGraph boards cannot load MathJax locally | jsxgraph, ctm-libs | partly: a local render with boards stops on purpose. Boards are out of the IDE (D5) | — |
| L19 | Offline server test fails on Python 3.13 | ctm-assessment | to re-check | A5 |

## STACK integration (§1 of the plan)

| ID | Finding | Repository | Status (19 Nov) | Phase |
|---|---|---|---|---|
| S-1 | Native Maxima backend not packaged; pin `e8437f1` stops on `cas: maxima`; ctm-stack main 23 commits ahead | ctm-assessment, ctm-stack | open (D3) | §4 |
| S-2 | `runtime-v3` not in any asset lock; staged by hand | ctm-stack, ctm-assessment, stack-wasm-maxima | open | §4 |
| S-3 | No Maxima browser or parity tests in the umbrella | ctm-assessment | open | §4 |
| S-4 | Default CAS is SymPy (provisional) | ctm-stack `ctm-stack.lua` | decided (D4: Maxima online, after S-P) | §4 |
| M13 / B4 | `variants-review.py` twice (≈95 % identical) | math-exercise, ctm-stack | open | A6 / 1.1 |
| S-5 | ctm-stack MathJax loader and `mathjax@3.2.2` CDN fallback | ctm-stack | open | A6 |
| H6 / M20 | README example fails to render; wrong policy docs | ctm-stack | fixed (`f9fca46`) | — |
| M21 | Umbrella docs do not know the package contains ctm-stack | ctm-assessment | fixed (`b2dc148`): STACK activity in the authoring guide | A1 |
| S-6 | ctm-stack CHANGELOG still "0.4.0 (step 6, for review)"; no M4c/M4d entries | ctm-stack | open | A1 / R5 |
| S-7 | Upstream STACK security report prepared but not sent | — | AC | — |
| S-8 | Long GC stress run cut short; repeat after packaging | ctm-stack | open | §4 |
| S-9 | stack-wasm-maxima follow-ups F-1, F-7, F-8, F-11, F-12; M4h distribution; issue #14 | stack-wasm-maxima | open; F-7 is needed for S-2 | §4 / after 1.0 |
| L25 | STACK data tagged GPL-3.0-or-later | ctm-checkers | AC (licence) | — |
| L27 | Backend registry name | ctm-stack | fixed (`CTMStackAdapters` in both backends) | — |

## Documentation (A1)

| ID | Finding | Repository | Status (19 Nov) | Phase |
|---|---|---|---|---|
| D-1 | Umbrella README says nothing about STACK; still says "`ai-feedback` is read as ctm-libs in 0.9" | ctm-assessment | fixed (`b2dc148`, `227fb85`) | A1 |
| D-2 | `docs/` mixes user guides with work logs and audits | every repository | partly: umbrella index by audience (`b2dc148`); records stay at their paths (17 are read by tooling) | A1 |
| D-3 | ctm-demo README stale (variants tooling at `503c868`, `ai-feedback` review-ref example) | ctm-demo | fixed on ctm-demo `claude/nice-dirac-uz5r4x` (`2f5fb2d`) | A1 |
| D-4 | pyodide-interaktiv `main` README installs without a ref | pyodide-interaktiv | open; goes away with R2 | R2 |
| L13 | Undocumented settings | ctm-libs, ctm-assessment, py-exercise | to re-check | A1 |
| L14 | "Site without AI feedback… render succeeds" is false for custom mode without `without-ai:` | ctm-assessment `docs/installation.md` | to re-check | A1 |
| L15 | Stale values in several docs | several | partly: exam-server HTTPS wording and Stop behaviour fixed (`b2dc148`) | A1 |
| L12 | ctm-libs README documents the removed alias | ctm-libs | fixed | — |
| L16 | Approval guide lacks the decision-loss warning | ctm-demo | to re-check | A1 |
| UX-1 | Math answer inputs have no accessible name | math-exercise | fixed on math-exercise `claude/nice-dirac-uz5r4x` (`ea409e0`): names in Lua and JS, en and nb; no screen-reader run | A2 / A3 (UI) |
| UX-2 | Consumer primary buttons fail contrast | freehand_ai_assessment (consumer) | open (consumer) | — |
| B3 / L7 | Feedback widget maps `nn` to `nb` | ctm-libs | open | A6 |

## Hygiene and duplication (A6)

| ID | Finding | Repository | Status (19 Nov) | Phase |
|---|---|---|---|---|
| L8 | "Accepted in 0.9 only" aliases, `--refresh` without effect, `KEEPS_RETIRED_COPIES = ()` | ctm-assessment | fixed (`227fb85`) | A6 |
| L22 / D11 | 46 unmerged non-main branches (gh-pages excluded) | all | listed ([branch-cleanup.md](branch-cleanup.md)): 34 delete, 65 archive then delete, 5 keep | R6 |
| M12 | Step-1 shared loaders not done (Monaco, KaTeX, MathJax, `escapeHtml`, bridge client) | components | open; partly in A6, rest 1.1 | A6 / 1.1 |
| L9 / L10 | `example-source.lua` ×5; `review-dependencies.py` ×3 | several | partly: py-exercise and ctm-demo copies of review-dependencies.py equal the umbrella's | A6 |
| L11 | Lua dynamic-matrix twin | math-exercise | open | 1.1 |
| M22 | Maintainability hot spots (files of 1,300–2,100 lines) | several | open; 1.1 | after 1.0 |
| M24 | 26 umbrella workflows; one-off `current-closure-store-d2.yml` | ctm-assessment | partly: `current-closure-store-d2.yml` removed (`60f6f8f`); five ctm-demo workflows on old tuples retired | A6 |
| L26 | ctm-demo has no licence file and commits a 684 KB tarball from an old tuple | ctm-demo | open | A6 |
| L28 | Review IDs and "step N" history in code comments | several | open; 1.1 | after 1.0 |
| B5 | Python-exercise grading stays in integration | py-exercise | accepted exception | — |
| H7 / L24 | Unlicensed inherited code shipped as AGPL; coi-serviceworker MIT notice | pyodide-interaktiv, ctm-libs | H7: AC (D12). L24: to re-check | — / A6 |
