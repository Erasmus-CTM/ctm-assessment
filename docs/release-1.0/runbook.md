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

The order matters. A merge commit changes the commit that dependents' CI pins and the package must name, and the P13
lock binds the exact ctm-libs and pyodide-interaktiv commits. So components converge and are tagged first; the
umbrella re-pins once, to the tags; the lock is approved once (internal audit of 20 Nov, finding 4).

1. **Review** every branch above. Fixes land on the same branches.
2. **Components, in dependency order**, each with a merge commit (AC). For each one:
   1. Point its CI pins at the merged and tagged commits of its dependencies, if they moved.
   2. Bump its version and write its CHANGELOG section.
   3. Merge.
   4. Tag it.

   The order:
   1. **ctm-checkers:** v1.0.0. It depends on no CTM component.
   2. **ctm-libs:** `tests/pins.json` names the ctm-checkers tag commit; then v1.0.0.
   3. **math-exercise and py-exercise:** CI pins name the ctm-libs and ctm-checkers tag commits; then v1.0.0 each.
   4. **ctm-stack:** `.github/pins.json` names the same; v1.0.0 if the Maxima default stands, otherwise v0.5.0.
   5. **pyodide-interaktiv:** first run `python scripts/sync-ctm-libs.py <ctm-libs at its tag>` so the shipped copy
      equals the tagged ctm-libs. Then merge `feature/shared-feedback-integration` into `main` (step 8, D9; main is
      an ancestor). Then v2.0.0.
3. **JSXGraph (D8):** ask the jsxgraph-quarto maintainers for a release tag on `5cd0d1e`, or on a later commit
   (JSXGraph 1.14.3) that is then pinned. `release-check.py --remote` requires a tag on every pin.
4. **Re-pin the umbrella once**, to the tag commits, on its branch. Set pyodide-interaktiv's branch to `main` in
   `repos.json`. Then run the full test:

   ```bash
   python scripts/setup-feedback-integration.py --update-pins --only ctm-checkers,ctm-libs,math-exercise,py-exercise,ctm-stack,pyodide-interaktiv
   ```

   ```bash
   python scripts/setup-feedback-integration.py --test --browser
   ```

   Check that every component CI pin agrees with the package:

   ```bash
   python tools/ci/check-component-pins.py --strict
   ```
5. **P13 lock (AC), once:** `p13-lock-review.yml` produces the unapproved lock diff for the new ctm-libs and
   pyodide-interaktiv commits. The worker files changed (WebKit stop probe, interrupt buffer), so review them as well
   as the vendor subsets. Record the receipt (`integration/p13-complete-assets.json`, `docs/exam-site-zip.md`).
6. **Replace the expiring baseline** before 2027-01-24 (M16). `exam-site-zip.yml` downloads the #80 baseline
   artifact of run 40389684095. The A5 dry run showed that `build-p13-assets.py` reproduces the approved lock from
   upstream without it. Commit the complete lock metadata, or re-approve a baseline from a fresh run.
7. **Version and notes:**
   - Bump the umbrella to 1.0.0 (`_extensions/ctm-assessment/_extension.yml`, `package.json`).
   - Write the `## 1.0.0` CHANGELOG section naming each component with its pin.
   - Then check:

     ```bash
     python scripts/release-check.py --tag v1.0.0 --remote --manifest release-manifest.json
     ```
8. **Merge the umbrella and tag `v1.0.0`** (AC). `release.yml` publishes the package archive, its record and the
   manifest. `exam-site-zip.yml` attaches the accepted offline ZIP, `SHA256SUMS` and `README-IT.txt`, and never
   replaces assets already published.
9. **Consumers:** pin ctm-demo (and ingmat3a, for the semester) to `v1.0.0` and run their builds. A course with STACK
   questions whose variants were approved under SymPy sets `stack: cas: sympy` first (see ctm-stack's upgrade note).
10. **After the release:**
    - Run the SEB manual check on Windows, macOS and iOS and record it in [exam-seb.md](../exam-seb.md).
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
