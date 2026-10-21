# Handoff: Erasmus-CTM/ctm-assessment (umbrella package)

main `2857d1c` (21 Oct). Ships ctm-libs, ctm-checkers, math-exercise, py-exercise, pyodide-interaktiv, jsxgraph (fork pin) as CTM Assessment. Pins in `integration/feedback/repos.json`. Designs: `docs/consolidation/2026-10-step{2,3,4}.md`, merge protocol in the step-1 doc §12.1. The common context is at the end of this file.

## Open at hand-off

- **#24** `consolidation/2026-10-step4-final` (head 6f98bfe at hand-off; may move), set with **ctm-libs #30**. Contents (planned):
  - ctm-demo expectations: remove the `collapsed-callout-target` known failure (fixed by ctm-libs #30);
  - compare-rendered: flag a migration that drops a construct (e.g. the lecture/learning switch); mutation test;
  - pin ctm-libs at #30's head;
  - re-pin ctm-checkers 8c3db5e (0.2.0) → 9e042dc (0.6.0) only if the parity job shows L2 = 0 for math (STACK-only changes);
  - previews: ctm-demo, ingmat3a main and linalg-branch (migration variant, sharded, 3 engines): 0 unexplained, 0 failed.
  - **Needs:** independent review, then AC merges ctm-libs #30, then #24.

## Next work, in order

1. **ingmat3a migration set** (ingmat3a is STAGED for migration (21 Oct, 19:50): AC merged `linalg-branch` into ingmat3a main (a0a34ee, PR #15); main builds green on the old pin 9ed46a4. Branch `consolidation/2026-10-step4-migration` (commit 5ad31ab) holds the first commit: `ref: main` in quarto-extensions.yml and `/_extensions/ctm-checkers/` in .gitignore (G1). No PR yet. Do the migration on that branch AFTER AC has merged the step-4 final set (ctm-libs #30, then ctm-assessment #24), which adds the callout fix and the dropped-construct check the migration relies on.) Tools here: `build-course.py --convert` (runs ctm-libs' own Lua via `quarto pandoc lua`; no Python ports), `tools/compare-rendered`, `compare-browser.mjs --shard i/n`, `--first-visit`, `--reveal-ends`, `expect/*.yml` (migration-only expectation files are loaded only by the migration dispatch).
2. **Step 3 tail: L3x/U3c** (step-3 design §10, §18.6, §18.10): ctm-libs deletes the ai-feedback alias, bridge, legacy tests and `moved-worker.yml` (keeps `templates/ai-feedback`); U3c here removes `ai-feedback` from ships-copies/packaging, re-pins, keeps the version-mix check with a migration message. Precondition: stack-sympy main has no `ai-feedback/` path (true since S1).
3. **Step 4 phase B** (step-4 design): B1 store (one store API in ctm-libs), B2 math-exercise answers, B3 py-exercise, B4 progress, quizzes, B6 pyodide cells in the store, **B7 export** ("Eksporter svarene mine": in-page text + "Kopier alt" first, downloads second; copy buttons always on; see `ctm-assessment` `docs/consolidation/2026-10-step5-offline-exam.md` §9). Autosave and tab links are on by default (AC). Phase C: languages (bilingual text, profiles, switch, nn strings).
4. **Step 5 offline/exam build** (`ctm-assessment` `docs/consolidation/2026-10-step5-offline-exam.md`, AC's decisions at the end are binding): `ctm-assessment: assets: local` + profiles `offline`, `exam` (AI off, autosave on, export on, `_site-exam`); package builder vendors assets with hashes (npm + Pyodide release); exam Python set numpy, scipy, sympy, matplotlib, networkx; https + COOP/COEP/CORP required; exact pins with a weekly "Track assets" proposal; CI "Offline build". The exam server is NTNU's `eksamensvedlegg.it.ntnu.no` (the old `pyth_site` used it, with CDN proxy openings). AC has a Nynorsk letter to exam IT with open questions (top-level window vs iframe, headers, clipboard, capacity).
5. **Question tests PR** (shared design with STACK; first PR after step 2 per AC), then **variants** (`ctm-assessment` `docs/consolidation/2026-10-variants.md`, AC's decisions 1–19), then **H1** (STACK checker syntax = math-exercise's `#| checker:`/`#| tests:`, after variants).
6. Steps 6–8 per `docs/audit-2026-10/README.md` §5b.

## Known follow-ups

- step2.yml / step4.yml expectations stay narrow; every new expectation needs a mutation test.
- `--reveal-ends` flags one rare shape (no course has it).
- WebKit: two hard reloads within 2 min disable `input()` for that page view (heals on next page) — accepted.
- Tests miss 5 of 14 ctm-libs scan-rule mutations (converter follows them; tests could be added).

---

## Common context (same in every repo)

This file hands the remaining work to another agent (e.g. Codex). Published designs live in `Erasmus-CTM/ctm-assessment` `docs/consolidation/` (the step-5 offline/exam design and the variants design are added there by the handoff branch of ctm-assessment).

## Where things stand

| Step | State |
|---|---|
| 1 ctm-libs (shared library, ai-feedback renamed) | merged |
| 2 ctm-checkers (all checker Python in one place) | merged; STACK fix chain in progress (S-01, S-02, S-13 merged; S-07/S-05/S-10/S-11 in progress) |
| 3 pyodide-interaktiv onto ctm-libs | merged (ctm-libs #27, math-exercise #26, py-exercise #9, pyodide-interaktiv #5, ctm-assessment #22); alias removal L3x/U3c not started |
| 4 UI (reveals, modes, tab links, autosave) | phase A merged; ctm-demo migrated; final set open (ctm-libs #30 + ctm-assessment #24); ingmat3a is staged for migration (linalg-branch merged; branch `consolidation/2026-10-step4-migration`); phases B (store/progress/quizzes/export) and C (languages) not started |
| 5 runtime + offline/exam build | designed and approved (`ctm-assessment` `docs/consolidation/2026-10-step5-offline-exam.md`), not started; December exam is a target, not a constraint |
| 6 stack-sympy onto shared runtime, packaged | not started |
| 7 grading options | not started |
| 8 PR to pyodide-interaktiv `main` | not started (AC's members decide) |
| Variants redesign | designed and approved (`ctm-assessment` `docs/consolidation/2026-10-variants.md`), not started; after the question-tests PR |

Open PRs at hand-off: ctm-libs #30 and ctm-assessment #24 (one set, see their files); a ctm-checkers + stack-sympy STACK set may appear (S-07/S-05/S-10/S-11), opened by an agent still running at hand-off. **None of these has had its independent review yet.** Review before AC merges.

## Rules (binding, from AC)

- **AC merges everything.** Agents never merge, never force-push a published branch, never create release tags. Merge commits only.
- **Merge protocol for sets** (ctm-assessment `docs/consolidation`, step-1 §12.1): a set of cross-repo PRs pins its dependencies at the reviewed PR head commits (never merge commits), carries no review-ref trailers, every branch is up to date with its base, one combined CI run tests the whole set, and AC merges it in one sitting in a stated order. Before sending: head SHAs unchanged, not behind; after merging: merge tree equals head tree.
- **Commits** are authored AND committed as `Andrey Chesnokov <aacchhee@gmail.com>`. Add a trailer naming the agent that did the work (earlier commits used `Co-Authored-By: Claude … <noreply@anthropic.com>`); keep AC's identity as author/committer.
- **Independent review** of every PR (fresh reviewer, max effort) until nothing substantive remains; CI watched until green. Reviews before every merge request to AC.
- **No code duplication across repos.** One home per piece of code (ctm-libs: runtime/UI/bootstrap/feedback; ctm-checkers: all checker Python; components keep only their own Lua/JS/CSS). Generated copies (shipped ctm-libs copy in pyodide-interaktiv, bootstrap copies) must be produced and CI-checked by script.
- **No backwards-compatibility break without AC's approval.**
- **Licence:** AGPL-3.0-or-later for code. Question XML: CTM's own CC BY-SA 4.0; STACK fixtures GPL-3.0 with notice; HELM rows CC BY-NC (test data only, labelled).
- **No HTML in Markdown authoring.**
- **ingmat3a must build green and clean** (0 warnings). Course `main` branches change only through migration PRs that AC merges.
- **Wording rule (STACK):** two upstream STACK security issues were reported privately (feedback-variable names; question-variable names with Greek letters or underscores). In anything public, describe only what our engine does ("student answers may not use question- or feedback-variable names"); never describe STACK's behaviour on this.
- **Courses:** ingmat3a is pinned to ctm-assessment `9ed46a4` until its migration PR; ctm-demo follows `ref: main`.

## Environment notes (from this session; may differ for you)

- GitHub GraphQL, codeload.github.com and jsDelivr were blocked; Actions logs could not be downloaded (read check-run annotations instead). Browser tests that need CDN files route them to local copies (see `ctm-assessment` tools and the Pyodide dist notes).
- Only Chromium ran locally; Firefox and WebKit run in CI.
- Quarto 1.8.27; Pyodide 0.28.3 (0.27.2 also tested).

## Housekeeping for AC

- Delete branches: ctm-demo `stack-repro`, `stack-notes`; ctm-assessment `diag/s10-webkit`; ctm-libs `consolidation/2026-10-step3-review`, `probe/webkit-tabs`.
- Optional: delete ctm-demo Actions artifact 12325605804 (old PR #15 build).
- STACK author: send the "semantics page updated" note once https://erasmus-ctm.github.io/stack-sympy/compliance/semantics.html#author-attention shows eight rows (it was deployed; the CDN was still serving the old page at hand-off). Second private STACK report (question-variable names) is ready in `ctm-audit-2026-10/stack/private/stack-question-variable-names.zip` if not yet sent.
- jsxgraph-quarto PR #2 (fork aacchhee/jsxgraph-quarto `audit/2026-10`, head 0b64e98) bundles 1.14.1 and is ready; paste `jsxgraph/pr2-update-1.14.1.md` into its description and send `jsxgraph/reply-2026-10-21.txt`.
