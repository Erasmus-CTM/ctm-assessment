# Release 1.0.0 runbook

The steps from the reviewed branches to the tagged release, in order. They implement R1–R6 of the
[plan](../consolidation/2026-11-release-1.0-plan.md) §5. Every step that merges, approves, tags or changes repository
settings is AC's.

## Review branches

All work is on branches named `claude/nice-dirac-uz5r4x`.

| Repository | What it carries | Register items |
|---|---|---|
| Erasmus-CTM/ctm-checkers | inclusive decimal tolerance; token admission of learner answers | GR-1, A-01/M3 |
| Erasmus-CTM/ctm-libs | bounded SSE streams with a terminal state; `ctm-assessment: exam: true`; a local build stops at STACK questions; review of the correction path | P01, P02, M18, X-2, N-1 |
| Erasmus-CTM/math-exercise | a restored practice key is computed again; accessible names for answer fields | GR-4, UX-1 |
| Erasmus-CTM/ctm-stack | Maxima default online, SymPy/Maxima parity report, author staging of runtime-v3, CI pins | S-1, S-4, S-P, S-6, S-8, H3 |
| Erasmus-CTM/py-exercise | CI against the package's ctm-libs; one review-dependencies copy; docs | H3, L21, L10 |
| Erasmus-CTM/pyodide-interaktiv | shipped ctm-libs copy synced to the package's ctm-libs; stale target record removed | M15/B2 |
| aacchhee/ctm-demo | October acceptance workflows retired; README | D-3, M24 |
| Erasmus-CTM/ctm-assessment | plan, register, offline website (Exercises page, `serve.py`, `SHA256SUMS`, release asset), SEB guide, release chain, alias removal, JSXGraph from upstream, docs | see the CHANGELOG |

The umbrella branch's head commit names the component review heads in a `CTM-Review-Refs` trailer, so its CI builds
and tests the whole set together.

## Steps

1. **Codex review** of every branch above. Fixes land on the same branches.
2. **Merge the components** (AC), keeping their commits (merge commits), in this order: ctm-checkers, ctm-libs,
   math-exercise, py-exercise, ctm-stack, pyodide-interaktiv.
3. **Re-pin the umbrella** on its branch, then run the full test:

   ```bash
   python scripts/setup-feedback-integration.py --update-pins --only ctm-checkers,ctm-libs,math-exercise,py-exercise,ctm-stack,pyodide-interaktiv
   ```

   ```bash
   python scripts/setup-feedback-integration.py --test --browser
   ```
4. **P13 lock (AC):** the ctm-libs and pyodide-interaktiv pins move, so `p13-lock-review.yml` produces an
   unapproved lock diff. AC reviews it and records the receipt as for the earlier locks
   (`integration/p13-complete-assets.json`, `docs/exam-site-zip.md`). Vendor subsets should be unchanged.
5. **Replace the expiring baseline** before 2027-01-24 (M16). `exam-site-zip.yml` downloads the #80 baseline
   artifact of run 40389684095. The A5 dry run showed that `build-p13-assets.py` reproduces the approved lock from
   upstream without it. Either commit the complete lock metadata, or re-approve a baseline from a fresh run.
6. **pyodide-interaktiv step 8 (AC, D9):** open and merge `feature/shared-feedback-integration` → `main` (main is an
   ancestor: a fast-forward of 137 commits). Then set the package's branch for it to `main` and its version to
   2.0.0.
7. **JSXGraph (D8):** ask the jsxgraph-quarto maintainers for a release tag on `5cd0d1e` (or a later commit with
   JSXGraph 1.14.3). `release-check.py --remote` requires a tag on every pin.
8. **Merge the umbrella** (AC). Then pin ctm-demo (and ingmat3a) to the merge commit and run their builds.
9. **Versions and notes:**
   - Bump each component to its 1.0 version ([plan §5](../consolidation/2026-11-release-1.0-plan.md)), write its
     CHANGELOG section and tag it.
   - Bump the umbrella to 1.0.0 (`_extensions/ctm-assessment/_extension.yml`, `package.json`).
   - Write the `## 1.0.0` CHANGELOG section naming every pin. Check it with:

     ```bash
     python scripts/release-check.py --tag v1.0.0 --remote --manifest release-manifest.json
     ```
10. **Tag `v1.0.0`** (AC). `release.yml` publishes the package archive, its record and the manifest.
    `exam-site-zip.yml` attaches the accepted offline ZIP, `SHA256SUMS` and `README-IT.txt`.
11. **After the release:**
    - Run the SEB manual check on Windows, macOS and iOS and record it in [exam-seb.md](../exam-seb.md).
    - Pin ingmat3a to `v1.0.0` for the semester.
    - Execute the [branch cleanup](branch-cleanup.md).

## AC's actions outside the code

- Protect `main` in every repository and require the fast CI tier, so AC's gate is enforced (M0, M9, GOV-1).
- The licence questions: H7 (code inherited from coatless-quarto/pyodide), L25 (STACK data tag) and L26 (ctm-demo
  has no licence file) (D12).
- Send the prepared upstream STACK security report (S-7).
- Close or answer the open threads: #89 (WebKit notes, draft), #65 (worker ownership) and stack-wasm-maxima#14
  (handoff).
- Merge #93 as the audit baseline (D10).
- Tell the freehand_ai_assessment owner about GR-2 and GR-3. That repository is not reachable from this work.
