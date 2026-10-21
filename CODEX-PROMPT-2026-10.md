You are taking over the CTM Assessment consolidation, a set of Quarto extensions for interactive maths and Python course pages. The owner is Andrey Chesnokov (AC). You work across these GitHub repositories:

- Erasmus-CTM: ctm-assessment (the umbrella package), ctm-libs (shared library), ctm-checkers (all checker Python, including the STACK engine), math-exercise, py-exercise, pyodide-interaktiv (working branch `feature/shared-feedback-integration`) and stack-sympy.
- aacchhee: ctm-demo (test course), ingmat3a_ntnu (real course) and the fork aacchhee/jsxgraph-quarto (PR #2 to upstream jsxgraph/jsxgraph-quarto).

AC'S UPDATED PRIORITY AND DURABLE CHECKPOINT (21 Oct 2026; binding)

- Keep all substantial work committed on non-main branches through the GitHub connector, and update this prompt as work proceeds so a stalled chat can be resumed. AC authorizes writing and opening PRs in every repository listed above.
- Use the author/committer identity supplied by the GitHub connector; do not pause over identity differences. This supersedes older exact-identity requirements. Do not prepare handoff packages.
- Prioritize completion of all remaining non-STACK-sympy work: the course migration and shared CTM platform consolidation come first. Then return to the smaller STACK-specific issues. Significant ctm-checkers changes that other components need must still be implemented; do not defer shared checker work merely because it is in ctm-checkers.
- Use more parallel workers where the work permits. Engineering: 6.1 Sol, medium, up to xhigh for difficult work; independent reviews: Astra, xhigh. AC alone merges; never merge, force-push or tag.

Current checkpoint (21 Oct, cloud continuation):
- CLOUD project; desktop may be closed. Host execution/filesystem is disconnected. GitHub connector reads/writes work; use Actions for conversion/build/tests/browser/screenshots. Tool reconnects reset functions-store and can interrupt agents: recover GitHub refs and resume existing workers. Commit source promptly.
- Step-4 final set REVIEWED/GREEN/MERGED by AC: libs#30 reviewed1f7a3a5de7b765d108fe2ca4ec98b36635c6814f -> main45bcb2a51257151f89bbe706142f22abcd1b5a0c; assessment#24 reviewedd47ccc5a492d3df0cade62f9bc21beb63511846f -> main3d9ebd94565ca302724dc619092ad9d043c1497f. Merge trees equal reviewed trees; pins reachable (documented JSXGraph fork exception). Final cells run39660903087: each course24pages/320cells/0unstable/0unexplained. WebKit ResizeObserver also occurs on main; cause unestablished.

Published NON-STACK drafts (not merge-ready):
- Assessment#25 https://github.com/Erasmus-CTM/ctm-assessment/pull/25 branch codex/2026-10-reusable-course-comparisons HEAD4edd42835a8923ebeac1a44b158add3c2698b75c. Reusable comparison workflow94f04ce, converted-source emitter74e27b6, explicit Python unit invocationda154fad, optional selectedPNG transport4edd. Independent Astra static review passed all stages; original reusable helper6tests/8mutations passed. Actual course prepare job119483269230 confirmed source-emitter unittest executes/OK at da154. PNG helper tests/current exact-head CI still required. Read-only runner logs checksummed source/PNGs; connector publishes, never runner token commits.
- ingmat3a#16 https://github.com/aacchhee/ingmat3a_ntnu/pull/16 ONLY branch consolidation/2026-10-step4-migration HEAD4426b18eb3e3f4446fa45f1a9db0f397ce2bd94d, actual migrated source committed (tree8f1e7e02c503d8d999c86f4a228135fad73eb52c). Base maina0a34ee508fdd4d00e78e7ea782b00a343fcf682. Bootstrap3583630 converted via cloud run39673782044/native119478272631:28pages/1713intended differences/0unexplained/0renderwarnings. Complete manifest31UTF8files+2deletions,1,242,979bytes, every returned Gitblob SHA verified before tree. Manual audit ALL441constructs/30Markdown:190detailtitles preserved;238anchors->227+11exactduplicates;12switches removed;1iframe preserved;448codeblocks+440label/context lines unchanged; remaining bodies unchanged. Two historical uke4 heading closures + week7 blank + uke10 TeX escaping reviewed. CSS blob31ab7f83fbecd00dedb137924b18e7fb19d5c4ef preserves generic summary rules. Final actual-source run39675244262 started: convert=false, base old package9ed46a4/coursebasea0a34ee, package3d9ebd9,3engines4shards. Caller scoped to migration branch. Worker will repin workflow/tooling to4edd and enable optional PNG logs for actual desktop1280/390 inspection. Require0warnings/0unexplained/0failed + screenshots before acceptance; NOT claimed yet.
- libs#31 https://github.com/Erasmus-CTM/ctm-libs/pull/31 store branch HEAD9a9b0f314ac6c2b5952b95d91ead12d1a897886f treedb3fae0e5945c563587518400c9d67fd78f5d209. B1/B4/B7 core+progress+copy/export+CSS+new3engine storage fixture. Composed frozen5998 six core paths +785eaa four progress paths onto dd9; NEVER replace whole old-baseline tree and drop parallel edits. dd9 standard CI green; new head needs CI. Independent Astra exercised41authored+11bespoke core+9progress V8 checks; found pending fixes: scoped clear must cancel NEW unpersisted debounce in other tabs, and changed/withdrawn oldscore must never become current via invalid Check. Minimal stalegrade fix tree6e3387b600d6841d77ab515c7d97106d09e86c15 onlystore.js+tests, not yet composed; worker integrating full fixes. Unlabeled/duplicate math+py exercises MUST count in progress but never persist: shared generic AST prepass, separate data-ctm-runtime-id, final manifest disables both duplicate labels before JS registration; spec.block=el maps per-occurrence quiz unambiguously. B1/progress workers implementing this, not yet acceptance.
- math#27 https://github.com/Erasmus-CTM/math-exercise/pull/27 store branch HEAD6bdf282065d8dc5947c7cedf28465756ca2b09f6. Shared field/matrix adapter, stable generated variant ID matching, copy, readonly old inputs/historical result/export.19focused V8 assertions+syntax passed, Node/Lua/browser exactB1pin/Astra still required. Consumer identity-only followup tree3584e5d2594b655b32e98fe580c2572212dea838 (Lua addsblock=el), ready to commit.
- py#10 https://github.com/Erasmus-CTM/py-exercise/pull/10 HEAD2c32b382fd97df633894d70376c178ad1c934d4b. Shared code store, prioritized legacy migration, reset/async race guards, copy.26adapter+3copy V8 assertions passed; fullCI/exactB1pin/Astra pending. Identity-only followup tree7d6a13ace2884372868e64a61a80aa319524888b (Lua block=el+runtime attribute), ready to commit.
- pyodide-interaktiv#6 https://github.com/Erasmus-CTM/pyodide-interaktiv/pull/6 store branch base feature/shared-feedback-integration29c2526069f65434c35df6ef09a13b263e06166a (NOT main). First code commit3361dcd43e1d1f11033520ce4786180923a2d992 treed8a3ad3068824afea6316770ee344935328dfbcb,13paths. Preliminary exactB1target staging commitdd696a890674e71fa6e150bda6602716b08234b2 pins9a9; generator CI underway. Seven actual adapter cases/syntax passed. Astra found legacy same-code labelled/unlabelled occurrence counting shifts oldanswer keys; engineer fixing+regression now. Code-only persistence; outputs only current export/copy. New read-only generator calls canonical sync+--check and emits bytes/SHA256/Gitblob report; recover/verify and publish generated copies via connector, NEVER handedit. Refresh exact final reviewed B1pin and fullCI.
- libs#32 https://github.com/Erasmus-CTM/ctm-libs/pull/32 alias branch HEADc7633d8087ce4f30817080858d9edd4b530ab8d3. L3x independent Astra source+11invariants PASS; actual257tests/0fail/0skip plus examples/runtime/worker/3browserUI all green. Keeps forwarder templates/stale diagnostic; no current consumer feedback-loader. Assessment#26 https://github.com/Erasmus-CTM/ctm-assessment/pull/26 U3c same alias branch HEAD54ff136a2d78eef48799e2a004df060c71f3f2ba treed4cb647926011b01a42a0d02816ad2427cfd1ccc,9paths. Corrected reviewer finding: library branch remains main, exact c7633pin. Pyodide retains ships-copies both ai-feedback/ctm-libs. Final correction check+combined exact-headCI required. Merge order libs32 then assessment26, AC only. Alias bridge-removal ctm.lua overlaps B1API3; preserve BOTH changes on base sync.

Workers: engineering shared_store_core(B1/B7), progress_quizzes(B4+consumeridentity), ingmat3a_migration(course/CItransport), ci_resume(B6/generation); independent Astra review_step4_resume(B1/B4/B7/CItransport), review_stack_types_undecided(B2/B3/B6). All7slots including root active. Completed independent reviewer review_stack_options_numerical accepted L3x and found U3c branch correction; resume for final alias review when slot available. Completed remove_feedback_alias and stack_oracle_engineering can be reused.

Remaining NON-STACK order: finish course/L3x-U3c/B1-B7, approved step5 offline/exam, shared question tests/variants/shared checker needs, H1/languages/steps6-8; no smallSTACK first. Step5 parallel lanes identified: assets/locks/licences/vendoring; Range/ETag/security-header server; networkblocked browser+board checks; profilefonts/CSS after builder contract. Shared CTMAssets Lua/settings lane touchesB1, coordinate. JSXGraph task waits for AC upstream-merge notice.

Deferred STACK:
- Existing checker10/11/12/13 and stack-sympy28 unmerged, findings posted. Major ctm-checkers work needed by shared components remains in scope.
- Native collector checkpoint branch codex/2026-10-stack-review-checkpoint6bf69f391a8f6afd831cc4afa8d3e3fb19a1b06f (6unit+compile passed; PHP/Maxima/Astra unrun; workflowdisabled). Expectations checkpoint stack-sympy branch codex/2026-10-stack-expectations-checkpointbaaf82e394330f413fa907545d610f8c3783a7e8 (136intended diffs/12mutants rejected; CI/rereview pending).
- FacForm fix NOT remotely saved, local review-resume-facform/publish-files.json baseline75284f7 only. Newtests/mutations/goldens unrun; recoverlater/reconstruct. LowestTerms unchanged; accepted hyperbolic deferral/options/scores/messages remain.
- Native evidence must cover changed grading rows at BOTH STACK4.13.1/4.14.0; existing CI does not establish that. Literal same-repo base ancestry after AC merges still applies, sync subsequent branches/pins/retest.

Update checkpoint after substantial commits. Never merge/force-push/tag; never call drafts ready before exact-head combinedCI and independent review.

AGENTS AND MODELS (AC's instruction)
- For software development (engineering subagents), use model 6.1 Sol at medium reasoning. Raise it, up to xhigh, for difficult cases: concurrency and runtime races, browser timing bugs, golden-table or grading changes, and cross-repo set mechanics.
- For every independent review, use Astra at xhigh. A reviewer never reviews its own code.

START HERE
1. In every repo, read `HANDOFF-2026-10.md` on the branch `handoff/2026-10`. Each file holds that repo's state, its open PRs, the next work in order and its known follow-ups. Each ends with the same "Common context", and those rules are binding.
2. Designs: Erasmus-CTM/ctm-assessment `docs/consolidation/`. The step-2, step-3 and step-4 designs are on main. The step-5 offline/exam design and the variants design (with its review) are on the `handoff/2026-10` branch. "AC's decisions" and "Revision after review" sections override the rest of a design.

BINDING RULES (summary; the handoff files have the details)
- AC merges everything. You never merge, never force-push a published branch and never create tags. Merges are merge commits only.
- Merge protocol for sets of cross-repo PRs (ctm-assessment docs, step-1 §12.1):
  - Pin dependencies at the reviewed PR head commits, never at merge commits, and add no review-ref trailers.
  - Every branch must be up to date with its base.
  - One combined CI run must test the whole set.
  - AC merges the set in one sitting, in the order you state.
  - Check before sending: head SHAs unchanged and not behind. Check after AC merges: each merge tree equals its head tree.
- Use the GitHub connector app and accept the author/committer identity it supplies (AC, 21 Oct 2026). Do not pause over author or email differences; this overrides earlier exact-identity requirements.
- Every PR gets an independent review: a reviewer that did not write the code, at maximum effort. Repeat it until nothing substantive remains, and watch CI until it is green. Only then send the PR to AC.
- No code duplication across repos: one home per piece of code. Generated copies are made and CI-checked by script.
- No backwards-compatibility break without AC's approval.
- Licences: code is AGPL-3.0-or-later. CTM question XML is CC BY-SA 4.0. STACK fixtures are GPL-3.0, with a notice. HELM rows are CC BY-NC (test data only).
- No HTML in Markdown authoring. ingmat3a must build green and clean.
- Wording rule (STACK): two upstream STACK security issues were reported privately. In anything public (code, docs, CHANGELOG, PR bodies, commit messages), describe only what OUR engine does. Never describe how STACK handles feedback-variable names or which question-variable names it lets students type.
- Courses: ingmat3a stays pinned to ctm-assessment 9ed46a4 until its migration PR. ingmat3a's `linalg-branch` is merged into main; other people may still work on ingmat3a, so touch only your migration branch. ctm-demo follows `ref: main`.

IMMEDIATE TASKS, in order

A. Review the two finished but unreviewed sets. Report each to AC with a verdict, a merge order and the links.
   1. Step-4 final set: ctm-libs #30 (head a3df529), then ctm-assessment #24 (head f215775, 0.12.0). It covers:
      - links into collapsed callouts;
      - flagging a dropped construct in migrations;
      - a Myers diff fallback for long pages;
      - re-pinning ctm-checkers 0.2.0 → 0.6.0 (parity showed 0 differences over 10,541 responses).
      Check carefully that the diff fallback and the new expectation rules cannot hide real differences: mutate them. A WebKit ResizeObserver console error on ingmat3a/linalg pages also occurs on main, and is likely JSXGraph's; confirm.
   2. STACK set: ctm-checkers #10 (S-07, 0.7.0), #11 (S-05, 0.8.0), #12 (S-10, 0.9.0), #13 (S-11, 0.10.0), then stack-sympy #28 (pins #13's head). All target main. Check:
      - every golden-row change, against the native STACK oracle (PHP + Maxima 5.46 at STACK 4.13.1 10d3233 and 4.14.0 3338304);
      - the mutation coverage;
      - the wording rule.
      AC has already decided the open points recorded in the PR bodies:
      - S-07 accepts multiplicationsign none and matrixparens "(";
      - S-05's 4 rows becoming 0.7 is fine;
      - S-10's nested-list message is fine;
      - S-11's hyperbolic case is fixed later, with S-12;
      - S-11's LowestTerms case is to be discussed with AC before any change.
B. jsxgraph-quarto PR #2 is NOT yours: AC and Claude handle its review and the contact with the maintainer. It now requires JSXGraph >= 1.14.1 (head 21c5f9c). Your only JSXGraph task is in D: re-pin the courses from the fork to upstream after AC tells you PR #2 is merged.
C. The ingmat3a migration set. ingmat3a is STAGED for migration (21 Oct, 19:50): AC merged `linalg-branch` into ingmat3a main (a0a34ee, PR #15); main builds green on the old pin 9ed46a4. Branch `consolidation/2026-10-step4-migration` (commit 5ad31ab) holds the first commit: `ref: main` in quarto-extensions.yml and `/_extensions/ctm-checkers/` in .gitignore (G1). No PR yet. Do the migration on that branch AFTER AC has merged the step-4 final set (ctm-libs #30, then ctm-assessment #24), which adds the callout fix and the dropped-construct check the migration relies on. Then, the same method as ctm-demo:
   - first commit `ref: main`;
   - run the converter (ctm-assessment `build-course.py --convert`) and review every construct by hand;
   - add `.gitignore` `/_extensions/ctm-checkers/`;
   - get 0 warnings;
   - compare old and new, rendered and in the browser (3 engines, `--shard`);
   - AC's acceptance: screenshots at desktop and 390 px showing that the "Gå i dybden" blocks look good and the lecture/learning buttons work.
D. Small sets:
   - L3x + U3c: remove the ai-feedback alias (step-3 design §10 / §18.6).
   - Re-pin courses from the JSXGraph fork to upstream, once PR #2 is merged.
   - The remaining STACK chain: S-12, S-04, S-08, S-09, S-06, then S-14 in stack-sympy.
E. Larger work, in this order unless AC says otherwise:
   - step-4 phase B: the store, autosave, progress, quizzes, and B7 export ("Eksporter svarene mine": in-page text with "Kopier alt" first);
   - step 5: the offline/exam build. The December exam is a target, not a constraint. AC is clarifying the exam-server questions with NTNU's exam IT;
   - question tests shared with STACK;
   - variants;
   - H1;
   - step-4 phase C (languages);
   - steps 6–8.

ENVIRONMENT HINTS from the previous session (they may not apply to you):
- GitHub GraphQL, codeload.github.com and jsDelivr were blocked. Actions logs could not be downloaded, so read the check-run annotations instead. Browser tests route CDN requests to local files.
- Only Chromium ran locally; Firefox and WebKit run in CI.
- Quarto is 1.8.27 and Pyodide 0.28.3; 0.27.2 is also tested.

HOW TO REPORT TO AC
- Report only what he needs: the PR links, the merge order, and his decisions with a recommendation for each. Keep it short and plain.
- Ask before anything irreversible, anything that touches a course's main branch, and any choice the designs don't cover.
- Before making changes, read the prior work: the handoff files, the designs, the PR bodies and the earlier reviews. Don't start from scratch.
