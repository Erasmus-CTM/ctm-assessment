# CTM restart — 23 October 2026

Use this as the current entry point. It supersedes status summaries in CODEX-PROMPT-2026-10.md; that file is historical detail, not required startup reading.

## Goal and boundaries

Continue development towards a clean, fast pure CTM Pyodide IDE, quiz/progress support, and a rendered static website ZIP. Local IT extracts the ZIP onto an existing webserver, preferably with no setup. No installer framework, transaction/CAS/journal infrastructure, or new server.

Finish pure CTM first. New STACK integration and bundled Maxima deployment remain deferred (“stage 55+”). Existing bounded STACK cleanup is allowed only when useful spare capacity exists; it must not delay CTM. Preserve the neutral question/manifest boundaries for future backend-specific generation; the current variants design has a binding Maxima amendment. Do not implement that backend now.

Work autonomously within the approved designs. AC alone merges. Never merge PRs, write main, force-push, or create release tags. Use the GitHub connector and its supplied identity for publishing. Preserve authored content and existing grading behavior; one canonical home per implementation, generated copies only through their canonical producer.

AC authorized parallel workers. Engineering agents: 6.1 Sol, medium, up to xhigh for difficult work. Independent reviewers: Astra, xhigh; never the author. Pin dependencies at reviewed PR heads, keep branches current with their bases, and test the combined set before presenting its merge order. Preserve license notices; public STACK text describes only our engine. Get substantive changes independently reviewed and run appropriate actual-runtime tests before declaring a PR ready. Keep tasks bounded and updates concise. Three workers are active: bounded native placeholder/display implementation, independent review, and candidate validation/batch orchestration.

## Verified merged state

Shared libraries/runtime consolidation, course migration, reveal/mode/tab-link work, alias cleanup, and shared question-test foundations are merged. Do not redo them.

ctm-checkers #15 merged the neutral variant model, exact codec and trusted teacher context. AC has now also merged:
- #16, supervised native variable-execution kernel: merge 03e5e0f79d4430067568464bb47f897991a8a6b7; reviewed head 8efd45d75f151125c675e44b025ef5caac4db063.
- #17, shared custom-checker executor and behavior-preserving Math adapter: merge f96f01725874934e1de60e08da15b3c0fde807ce; reviewed head e832667a3a6a51b003af502fad08cdeb6618f131.

Checker main is f96f01725874934e1de60e08da15b3c0fde807ce, tree 357a10e916e6340ede3dca5e2e6e48acc73af44d. Its first parent is the #16 merge. #16's merge tree equals its reviewed head; #17 adds exactly the same 11 file/blob changes as its reviewed head onto #16. Both PR heads passed their complete native/wheel/Pyodide gates and independent reviews. Fresh merged-main Pyodide 0.27.2/0.28.3 checks pass. Rechecked on 23 October: all five native Python 3.9–3.13 jobs passed in [run 39905221192](https://github.com/Erasmus-CTM/ctm-checkers/actions/runs/39905221192); merged-main Pyodide [run 39905221332](https://github.com/Erasmus-CTM/ctm-checkers/actions/runs/39905221332) also passed. This verification is complete; reuse this evidence.

Neither PR completes variants or full H1 authoring/scoring integration.

## Open delivery work

All links below are on github.com.

| Repository / PR | Exact current head | State |
|---|---|---|
| Erasmus-CTM/ctm-assessment #34 | 68fe838ca76ce7dfc4297f8ed4db1ccf1dc29a8b | Draft assembly: saved answers, autosave, progress, quizzes, export and offline assets. 52 checks pass, 4 conditional skips, strict-store WebKit fails. |
| aacchhee/ingmat3a_ntnu #17 | 23e47057806766ecb95f3cc86cf92eefa8102316 | Draft course: 26 quizzes, 176 graded exercises, 12 progress pages. Source/render and Chrome/Firefox navigation pass; WebKit blocked. |
| Erasmus-CTM/ctm-assessment #40 | e96ff37cb5d1c2820c2497dfd17ca93c005da686 | Basic IDE ZIP complete and independently reviewed; still draft, stacked on #34. |
| Erasmus-CTM/ctm-assessment #48 | 5ce8bd9b1fe00e3a50135f34a5a360a13f43228b | Canonical accessible-worker pre-loader proof passes all three browsers; activation gated. |
| Erasmus-CTM/ctm-assessment #50 | 49f0c63d3fa691bd544df49cc5d905a69d37fc5e | Quarto/Monaco source-phase patch pair passes bounded three-browser controls; canonical delivery gated. |
| Erasmus-CTM/ctm-libs #37 | 62235ae386da9ce591d956caae3b54aa7da9785d | Inactive canonical opaque-worker component; all gates and independent reviews pass, stacked on #35. |
| Erasmus-CTM/ctm-checkers #18 | 6ce9ccc2fd94e22d1920d6b9788f46a55d5498a9 | Exact numeric helpers/catalogue complete; all gates and independent final review pass. Draft retained for AC. |
| Erasmus-CTM/ctm-checkers #19 | ca3b3fd22aad0ed3e9aa9a84a45137dbbf2f5fa7 | Bounded exhaustive native enumeration complete; all gates and independent final review pass. Stacked on #18. |
| Erasmus-CTM/ctm-checkers #20 | e5bf1150772494a72d4436fb2a55ffb485f04d94 | Draft bounded resolved-candidate validation through the real grader, stacked on #19. Focused source/wheel and Pyodide gates pass; full native gates and independent final review pending. |

#34's all-nine comparison run 39857803985 passes, including actual Chromium/Firefox/WebKit old/new comparisons. Comparison equivalence does not clear strict raw-error acceptance. The complete asset materializer/lock is implemented: 3,211 files, nine families, carried installation with zero downloads. Numerous stacked component/asset PRs remain: inspect #34's pins and current PR bases to establish the exact merge set. Do not blindly merge diagnostics or changes already incorporated into #34.

#40 artifact:
https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/39825226656/artifacts/12446047963

It is the actual python-offline-website.zip, index.html at root, README-IT.txt included; no server-side Python/Node/Quarto install. SHA256 491e06d4819ef7328243f1b22faa28c58e57c6e4d07c0846bd7334efaaa1d81e. Twenty strict plus four plain-LAN browser cases pass at root and /dept/python/: editing, Run, Stop/restart, rerun and optional NumPy. Plain LAN needs no custom headers for this basic scope. Input prompts, full offline courses/boards, and real exam hosting are not cleared. Screenshots were generated but not visually inspected; do not claim general performance/visual improvement. AC handles NTNU exam IT questions.

## Next plan, in order

1. Reuse completed merged-checker verification and current delivery heads; do not repeat the exhausted baselines. Production WebKit blockers now have tested source candidates, but canonical activation remains required:
   - Resize: [#50 source patch pair](https://github.com/Erasmus-CTM/ctm-assessment/tree/49f0c63d3fa691bd544df49cc5d905a69d37fc5e/integration/resize-probe/upstream) moves Quarto layout work and Monaco's leading layout out of native observer delivery. It preserves Quarto's 50 ms throttle, original transformed border-box width and width-first storage short circuit. Exact-head [run 39909782938](https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/39909782938), independent [review 5625206329](https://github.com/Erasmus-CTM/ctm-assessment/pull/50#pullrequestreview-5625206329): 68 loads per engine, all 102 candidates have zero pageerrors, window ErrorEvents, request failures and console errors. Native WebKit fails all 34 loads (37 pageerrors / 41 window events); native Chromium/Firefox each retain eight window events. One Firefox retry resolved a retained Pillow CDN encoding failure; no source or assertion changed. This is an upstream candidate, not a generated product patch. Canonical Quarto delivery must coalesce pending frames for background behavior and preserve current-main synchronization/trailing-throttle work; both publishers need an approved build/version path. Original strict fake-clock/course/store gates are still unvalidated. Earlier contentRect substitution, predicate reordering, bulk-math delay and enhancement/Font Awesome omission are not product fixes; do not repeat them.
   - Worker: canonical ctm-libs #37 preserves the original SRE worker, speech and braille using data transport only for opaque default-browser adaptors. Ordinary origins and authored custom startup/adaptors retain ownership. Assessment #48 consumes the exact canonical file before the unchanged original async vendor loader. [Run 39909375175](https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/39909375175) passes 11 cases in each browser; independent reviews [37/5624616544](https://github.com/Erasmus-CTM/ctm-libs/pull/37#pullrequestreview-5624616544) and [48/5624616951](https://github.com/Erasmus-CTM/ctm-assessment/pull/48#pullrequestreview-5624616951) pass. Actual SVG, native speech/braille parity, setting combinations, opaque sandbox, real parent isolation, data-only worker CSP and original vendor-load event pass; original WebKit blob controls still fail. Library CI passes 304 tests. The component is deliberately inactive: the pinned JSXGraph template has no synchronous pre-loader seam, and replacing src_mjx with a loader wrapper changes authored load-event behavior. [Precise requirement and insertion sample](docs/consolidation/2026-10-webkit-worker-requirement.md) are ready for AC/Claude. No accessibility-disable flags, referrer workaround or generated frame patch is adopted.
   - jsxgraph/jsxgraph-quarto #2 is still open at 21c5f9cabcd434f2f79f93e08adaf41aafb727a8. AC/Claude own upstream review/contact. Do not edit the fork or take over that PR. Re-pin only after AC confirms merge. Canonical pre-loader activation and relative local-asset/base support remain separate gates. No external maintainer messages were sent.

2. After reviewed canonical delivery/activation, run fresh combined strict store/course acceptance in all three engines, including desktop/390px navigation, raw errors and real isolation. Then present AC the exact component/assembly/course merge order. Keep variants independent of this release. Deliver the simple ZIP; validate the actual IT server separately. Assembly #34 and course #17 remain HOLD; their old strict WebKit failures have not been waived or replaced by diagnostic passes.

3. Exact round/sigfig helper implementation is complete in checker #18. It binds the existing native catalogue, uses exact half-away-from-zero behavior including sigfig(sin(r1), 2), and leaves legacy float helpers/grading call sites unchanged. All five Python 3.9–3.13 jobs, canonical producer, model/execution and Pyodide 0.27.2/0.28.3 gates pass; independent final [review 5625182382](https://github.com/Erasmus-CTM/ctm-checkers/pull/18#pullrequestreview-5625182382) passes. Each native job has 1,201 source and wheel tests, 90 inherited conditional skips per suite, 87 mutation passes and unchanged 9,276-row goldens. Core wheel SHA256 is 2c9935c6aa60041bbcb13d751db98c613feb69fd7077ebd3d4d296f8ac376f54. Ready for AC's scoped merge decision; no merge was performed.

4. Checker #19 adds a bounded native exhaustive API on reviewed #18. It reuses the evaluator/domains, handles dependent choices and require rejection, deduplicates exact tapes and enforces source/IPC/frontier/deadline limits without partial returns. It has no browser payload delta. All supported source/wheel execution, five native regression and both Pyodide gates pass; independent final [review 5625218000](https://github.com/Erasmus-CTM/ctm-checkers/pull/19#pullrequestreview-5625218000) passes. Each native job has 1,213 source and wheel tests plus the same goldens/mutations. AC order for these independent checker slices is #18 then #19.
   - Next unblocked slice: read the approved placeholder/display sections, implement their bounded native evaluation, then resolved-note deduplication and real-grader tests per candidate; manifests/teacher approval and student selection/storage follow.
   - AC resolved the routine generation policy on 23 October; see binding decisions 21–23 in the variants design. Propose 25 tested, valid, resolved-note-distinct candidates, with a Generate 25 more action; preserve existing approvals, stable numbers and proposal order. Constraints/duplicates do not count, but grading/test failures stop rather than silently resample. Required publishing/CI fails at zero approved; explicit optional warns; review previews remain available. Normal authoring must not create an unchecked 20,000-candidate pool. #19's raw_path_limit remains only a diagnostic resource bound. Use finite attempt/time limits with useful exhaustion diagnostics. Implement this workflow after the bounded placeholder and candidate-validation foundations; approval UI and manifests remain to be built.

5. Finish remaining pure CTM H1 work, language catalogs/content validation (including Nynorsk), and approved optional grading work. STACK adapters/consolidation and final Pyodide upstream/main handoff follow later; maintainer agreement is needed for the latter.

## Read only what the next task needs

All design paths are in Erasmus-CTM/ctm-assessment:
- main: docs/consolidation/2026-10-step2.md (H1 §13), 2026-10-step3.md, 2026-10-step4.md.
- handoff/2026-10: docs/consolidation/2026-10-step5-offline-exam.md, 2026-10-variants.md and 2026-10-variants-review.md.
- main: docs/audit-2026-10/README.md for later stages.

Binding AC decisions/amendments override earlier proposals. Read the relevant current PR body/reviews and source before changing it. Treat local old work folders as supplemental evidence, not unpublished work to adopt automatically. Keep future checkpoints short: current heads, blockers, next task and evidence links; avoid appending another chronological history.
