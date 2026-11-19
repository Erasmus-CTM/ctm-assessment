# Branch cleanup for 1.0.0 (decision D11)

Prepared 19 November 2026 from the remote branches of every repository (gh-pages, `main` and this work's
`claude/nice-dirac-uz5r4x` branches excluded). Executed by AC after the 1.0.0 release (R6); nothing has been deleted.

- **delete:** fully merged into `main`; nothing is lost.
- **archive, delete:** not merged; tag the tip as `archive/<branch>` first, so every commit stays reachable, then delete the branch.
- **keep:** still needed, for the reason given.

Totals: 34 delete, 65 archive then delete, 5 keep.

The umbrella's `handoff/2026-10` was linked from `docs/exam-server.md` for the nginx/Apache examples; the link now points at the same file on `main`.

## Erasmus-CTM/ctm-assessment

| Branch | Tip | Action | Note |
|---|---|---|---|
| `audit/2026-11-extended` | `806097a 2026-10-30` | keep | #93, until AC merges it (D10) |
| `claude/ecstatic-hopper-5qdew3-diag` | `5a76a3c 2026-10-28` | archive, delete | 7 commits not on main |
| `claude/ecstatic-hopper-5qdew3-validate` | `1b78242 2026-10-28` | archive, delete | 3 commits not on main |
| `claude/ecstatic-hopper-5qdew3-validate2` | `f38db41 2026-10-28` | archive, delete | 5 commits not on main |
| `claude/epic-bell-ne4tnu` | `37c6dff 2026-10-28` | archive, delete | 1 commits not on main |
| `claude/epic-bell-ne4tnu-diag` | `38cf07e 2026-10-28` | archive, delete | 8 commits not on main |
| `consolidation/2026-10-assets-comparison-followup` | `9489b10 2026-10-22` | archive, delete | 2 commits not on main |
| `consolidation/2026-10-compose-pyodide-defaults` | `64a44e8 2026-10-22` | archive, delete | 1 commits not on main |
| `consolidation/2026-10-resize-upstream-controls` | `49f0c63 2026-10-23` | archive, delete | 19 commits not on main |
| `consolidation/2026-10-step4-default-composition` | `64e8507 2026-10-22` | archive, delete | 1 commits not on main |
| `consolidation/2026-10-step4-preload-evidence` | `d4ff37d 2026-10-22` | archive, delete | 1 commits not on main |
| `consolidation/2026-10-step5-assets` | `982ea3b 2026-10-24` | archive, delete | 1 commits not on main |
| `consolidation/2026-10-step5-assets-api` | `89d7e5f 2026-10-21` | archive, delete | 1 commits not on main |
| `consolidation/2026-10-step5-npm-lock` | `a7822b6 2026-10-24` | archive, delete | 1 commits not on main |
| `consolidation/2026-10-step6-u6` | `b1469d6 2026-10-25` | archive, delete | 1 commits not on main |
| `consolidation/2026-10-storage-descriptor-evidence` | `bec2e2b 2026-10-22` | archive, delete | 2 commits not on main |
| `consolidation/2026-10-store-comparison-checkpoint` | `dd4dcc8 2026-10-22` | archive, delete | 9 commits not on main |
| `consolidation/2026-10-store-comparison-rules` | `6aa9bdf 2026-10-22` | archive, delete | 9 commits not on main |
| `consolidation/2026-10-store-integration-checkpoint` | `3d8e5e1 2026-10-21` | archive, delete | 7 commits not on main |
| `consolidation/2026-10-webkit-runtime-setup` | `31de892 2026-10-22` | archive, delete | 3 commits not on main |
| `control/2026-10-u6-a1-replay-budget` | `fe2590b 2026-10-25` | archive, delete | 2 commits not on main |
| `diagnostics/2026-10-offline-lock-current-runtime` | `a523d61 2026-10-24` | archive, delete | 1 commits not on main |
| `diagnostics/2026-10-step6-a1-asset-lock` | `8ecf421 2026-10-24` | archive, delete | 1 commits not on main |
| `docs/2026-10-variants-maxima-seeds` | `e6720c2 2026-10-22` | archive, delete | 52 commits not on main |
| `handoff/2026-10` | `f1a5002 2026-10-24` | archive, delete | 95 commits not on main |
| `review/2026-10-runtime-order-input` | `a628299 2026-10-22` | archive, delete | 2 commits not on main |

## Erasmus-CTM/ctm-libs

| Branch | Tip | Action | Note |
|---|---|---|---|
| `ccr-221e25a2-0i503x` | `34ff5cf 2026-10-28` | delete |  |
| `chore/2026-10-repin` | `d1c7212 2026-10-27` | delete |  |
| `claude/charming-goldberg-fbiyfw` | `4f64b19 2026-10-27` | delete |  |
| `claude/ecstatic-hopper-5qdew3` | `d479cd8 2026-10-28` | delete |  |
| `claude/ecstatic-hopper-5qdew3-stopprobe` | `141cf51 2026-10-28` | delete |  |
| `claude/elegant-maxwell-3tv01e` | `8c90e59 2026-10-26` | delete |  |
| `claude/generation-streaming` | `ea2a48a 2026-10-29` | delete |  |
| `claude/inspiring-einstein-al3f3t` | `a85b740 2026-10-29` | delete |  |
| `codex/bounded-handwriting-corrections` | `08262b0 2026-10-31` | delete |  |
| `consolidation/2026-10-first-visit-readiness` | `0871c1e 2026-10-24` | archive, delete | 17 commits not on main |
| `consolidation/2026-10-mathjax-opaque-adaptor` | `39fc39b 2026-10-24` | delete |  |
| `consolidation/2026-10-mathjax-static-cors` | `2cdd3b4 2026-10-23` | delete |  |
| `consolidation/2026-10-step3-review` | `8f22a87 2026-10-20` | archive, delete | 2 commits not on main |
| `consolidation/2026-10-step5-assets` | `2ed1a33 2026-10-21` | archive, delete | 2 commits not on main |
| `consolidation/2026-10-step5-assets-api` | `c44cd39 2026-10-22` | archive, delete | 12 commits not on main |
| `consolidation/2026-10-step5-assets-union` | `41b2be0 2026-10-22` | delete |  |
| `consolidation/2026-10-step6-l6v` | `4a63de6 2026-10-25` | delete |  |
| `consolidation/2026-10-step6-stack-foundations` | `81ccee0 2026-10-24` | delete |  |
| `consolidation/2026-10-variants-authoring` | `d989919 2026-10-23` | archive, delete | 16 commits not on main |
| `fix/2026-10-additive-checker-api-fixture` | `7787c57 2026-10-25` | delete |  |
| `fix/2026-10-git-board-assets` | `a4216a6 2026-10-25` | delete |  |
| `fix/2026-10-offline-micropip` | `39ce81f 2026-10-27` | delete |  |
| `fix/2026-10-review-phase1` | `98f25c4 2026-10-27` | delete |  |
| `fix/2026-10-worker-index-url` | `95ba1eb 2026-10-27` | delete |  |
| `handoff/2026-10` | `0a6798f 2026-10-21` | archive, delete | 1 commits not on main |
| `p13/shared-worker` | `34af5e7 2026-10-26` | delete |  |
| `similar-problems/g2-client-policy` | `6f464e6 2026-10-25` | delete |  |
| `ui/compact-settings-and-quiz` | `c7452b3 2026-10-25` | delete |  |

## Erasmus-CTM/ctm-checkers

| Branch | Tip | Action | Note |
|---|---|---|---|
| `codex/2026-10-stack-review-checkpoint` | `6bf69f3 2026-10-21` | archive, delete | 1 commits not on main |
| `handoff/2026-10` | `d22fa3e 2026-10-21` | archive, delete | 2 commits not on main |

## Erasmus-CTM/ctm-stack

| Branch | Tip | Action | Note |
|---|---|---|---|
| `codex/2026-10-stack-expectations-checkpoint` | `baaf82e 2026-10-21` | archive, delete | 1 commits not on main |
| `handoff/2026-10` | `4c9c0ae 2026-10-21` | archive, delete | 1 commits not on main |

## Erasmus-CTM/math-exercise

| Branch | Tip | Action | Note |
|---|---|---|---|
| `chore/2026-10-repin` | `465ca6b 2026-10-27` | delete |  |
| `claude/charming-goldberg-fbiyfw` | `80a6d93 2026-10-27` | delete |  |
| `claude/elegant-maxwell-3tv01e` | `75282d9 2026-10-26` | delete |  |
| `claude/inspiring-einstein-al3f3t` | `898703c 2026-10-29` | delete |  |
| `claude/similar-tolerance` | `a68344f 2026-10-30` | delete |  |
| `consolidation/2026-10-step6-shared-matrix` | `a1f5478 2026-10-24` | delete |  |
| `control/2026-10-u6-a1-replay-budget` | `4d82ab0 2026-10-25` | archive, delete | 1 commits not on main |
| `demo` | `7c4a352 2026-08-18` | archive, delete | 1 commits not on main |
| `feature/ai-feedback-context` | `bb0689e 2026-08-20` | archive, delete | 2 commits not on main |
| `feature/vector-matrix-input` | `4f9d3c2 2026-08-20` | archive, delete | 1 commits not on main |
| `fix/2026-10-jsxgraph-layout-fixture` | `ea5607f 2026-10-25` | delete |  |
| `fix/2026-10-native-replay-budget` | `c9011da 2026-10-25` | delete |  |
| `fix/retained-student-preview-refresh` | `c2ad38e 2026-10-24` | delete |  |
| `handoff/2026-10` | `da912d2 2026-10-21` | archive, delete | 1 commits not on main |
| `p13/standalone-math` | `c0c52ad 2026-10-26` | delete |  |
| `similar-problems/g3-flow` | `ac4fc45 2026-10-25` | delete |  |

## Erasmus-CTM/py-exercise

| Branch | Tip | Action | Note |
|---|---|---|---|
| `handoff/2026-10` | `e0bd556 2026-10-21` | archive, delete | 1 commits not on main |
| `lti` | `5c51c97 2026-06-13` | keep | LTI experiment kept on purpose (audit §7); archive tag in any case |
| `testing` | `b3e0b47 2026-05-24` | archive, delete | 2 commits not on main |

## Erasmus-CTM/pyodide-interaktiv

| Branch | Tip | Action | Note |
|---|---|---|---|
| `feature/shared-feedback-integration` | `793a872 2026-10-27` | keep | the shipping branch until step 8 merges it into main (D9); then delete |
| `handoff/2026-10` | `e97017c 2026-10-21` | archive, delete | 69 commits not on main |
| `issue-1-webagg` | `6cc7e6c 2026-08-29` | archive, delete | 11 commits not on main |

## aacchhee/jsxgraph-quarto

| Branch | Tip | Action | Note |
|---|---|---|---|
| `audit/2026-10` | `49a1c7d 2026-10-26` | keep | the former package pin 49a1c7d; archive tag; delete once 1.0.0 pins upstream |
| `ccr-221e25a2-0i503x` | `6d1cd43 2026-10-26` | archive, delete | 37 commits not on main |
| `ci/2026-10-mathjax-issue-repro` | `ae8099c 2026-10-23` | archive, delete | 4 commits not on main |
| `ci/2026-10-mathjax-preload-tests` | `9a1aba0 2026-10-23` | archive, delete | 31 commits not on main |
| `feature/assessment-bridge` | `e9d575b 2026-09-02` | archive, delete | 2 commits not on main |
| `fix/2026-10-jsxgraph-115-runtime` | `e31b5d1 2026-10-25` | archive, delete | 34 commits not on main |
| `integrate/upstream-1.14.2-20261026` | `ed2cf81 2026-10-26` | archive, delete | 47 commits not on main |

## Erasmus-CTM/stack-wasm-maxima

| Branch | Tip | Action | Note |
|---|---|---|---|
| `audit/2026-10-artifact-inspection` | `ef10b79 2026-10-25` | archive, delete | 230 commits not on main |
| `benchmark/e8ad-maxima-oz-o2` | `adea9d3 2026-10-24` | archive, delete | 1 commits not on main |
| `claude/peaceful-cray-p1sz3o` | `6d08b8f 2026-10-26` | archive, delete | 4 commits not on main |
| `diagnostics/2026-10-ecl-root-localization` | `81fde49 2026-10-24` | archive, delete | 1 commits not on main |
| `evidence/maxima-oz-production` | `3db77a3 2026-10-26` | keep | only copy of the 26 Oct selection evidence; archive tag, then delete |
| `experiment/e8ad-maxima-oz` | `58cf269 2026-10-24` | archive, delete | 1 commits not on main |
| `measurements/2026-10-maxima-stack-timings` | `c142250 2026-10-25` | archive, delete | 3 commits not on main |
| `profiling/e8ad-baseline-trace-no-cpu` | `61abc65 2026-10-25` | archive, delete | 1 commits not on main |
| `profiling/e8ad-fs-error-stack` | `01ffcfe 2026-10-25` | archive, delete | 1 commits not on main |
| `profiling/e8ad-no-rebuild-stack` | `f2fb055 2026-10-25` | archive, delete | 5 commits not on main |
| `profiling/e8ad-oz-fas-load-condition` | `2c4344b 2026-10-25` | archive, delete | 1 commits not on main |
| `timing/e8ad-six-cell-guarded` | `0416865 2026-10-25` | archive, delete | 2 commits not on main |

## aacchhee/ctm-demo

| Branch | Tip | Action | Note |
|---|---|---|---|
| `claude/laughing-carson-7umocj` | `891e5ff 2026-10-28` | delete |  |
| `consolidation/2026-10-native-review-boundary` | `6a9b797 2026-10-24` | archive, delete | 2 commits not on main |
| `handoff/2026-10` | `aaf70ee 2026-10-21` | archive, delete | 2 commits not on main |
| `review/2026-10-variants-live-acceptance` | `5fee4d7 2026-10-24` | archive, delete | 8 commits not on main |
| `stack-notes` | `f44ace4 2026-10-21` | archive, delete | 1 commits not on main |

## Commands

For each repository, from a clone with push access (replace OWNER/REPO):

```bash
# archive, delete
git tag archive/BRANCH origin/BRANCH && git push origin archive/BRANCH && git push origin --delete BRANCH
```

```bash
# delete (merged)
git push origin --delete BRANCH
```

