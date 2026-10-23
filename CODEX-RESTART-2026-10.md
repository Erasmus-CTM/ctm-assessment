# CTM restart — 23 October 2026

Use this as the current entry point. It supersedes status summaries in CODEX-PROMPT-2026-10.md; that file is historical detail, not required startup reading.

## Goal and boundaries

Continue development towards a clean, fast pure CTM Pyodide IDE, quiz/progress support, and a rendered static website ZIP. Local IT extracts the ZIP onto an existing webserver, preferably with no setup. No installer framework, transaction/CAS/journal infrastructure, or new server.

Finish pure CTM first. New STACK integration and bundled Maxima deployment remain deferred (“stage 55+”). Existing bounded STACK cleanup is allowed only when useful spare capacity exists; it must not delay CTM. Preserve the neutral question/manifest boundaries for future backend-specific generation; the current variants design has a binding Maxima amendment. Do not implement that backend now.

Work autonomously within the approved designs. AC alone merges. Never merge PRs, write main, force-push, or create release tags. Use the GitHub connector and its supplied identity for publishing. Preserve authored content and existing grading behavior; one canonical home per implementation, generated copies only through their canonical producer.

AC authorized parallel workers. Engineering agents: 6.1 Sol, medium, up to xhigh for difficult work. Independent reviewers: Astra, xhigh; never the author. Pin dependencies at reviewed PR heads, keep branches current with their bases, and test the combined set before presenting its merge order. Preserve license notices; public STACK text describes only our engine. Get substantive changes independently reviewed and run appropriate actual-runtime tests before declaring a PR ready. Keep tasks bounded and updates concise. No agents remain active from the previous chat.

## Verified merged state

Shared libraries/runtime consolidation, course migration, reveal/mode/tab-link work, alias cleanup, and shared question-test foundations are merged. Do not redo them.

ctm-checkers #15 merged the neutral variant model, exact codec and trusted teacher context. AC has now also merged:
- #16, supervised native variable-execution kernel: merge 03e5e0f79d4430067568464bb47f897991a8a6b7; reviewed head 8efd45d75f151125c675e44b025ef5caac4db063.
- #17, shared custom-checker executor and behavior-preserving Math adapter: merge f96f01725874934e1de60e08da15b3c0fde807ce; reviewed head e832667a3a6a51b003af502fad08cdeb6618f131.

Checker main is f96f01725874934e1de60e08da15b3c0fde807ce, tree 357a10e916e6340ede3dca5e2e6e48acc73af44d. Its first parent is the #16 merge. #16's merge tree equals its reviewed head; #17 adds exactly the same 11 file/blob changes as its reviewed head onto #16. Both PR heads passed their complete native/wheel/Pyodide gates and independent reviews. Fresh merged-main Pyodide 0.27.2/0.28.3 checks pass; five native Python jobs were still running at checkpoint. Recheck these once; do not assume they finished.

Neither PR completes variants or full H1 authoring/scoring integration.

## Open delivery work

All links below are on github.com.

| Repository / PR | Exact current head | State |
|---|---|---|
| Erasmus-CTM/ctm-assessment #34 | 68fe838ca76ce7dfc4297f8ed4db1ccf1dc29a8b | Draft assembly: saved answers, autosave, progress, quizzes, export and offline assets. 52 checks pass, 4 conditional skips, strict-store WebKit fails. |
| aacchhee/ingmat3a_ntnu #17 | 23e47057806766ecb95f3cc86cf92eefa8102316 | Draft course: 26 quizzes, 176 graded exercises, 12 progress pages. Source/render and Chrome/Firefox navigation pass; WebKit blocked. |
| Erasmus-CTM/ctm-assessment #40 | e96ff37cb5d1c2820c2497dfd17ca93c005da686 | Basic IDE ZIP complete and independently reviewed; still draft, stacked on #34. |
| Erasmus-CTM/ctm-assessment #48 | e88617031296b139a97c637c434c7cd9416a6062 | Worker-origin diagnostic only. |
| Erasmus-CTM/ctm-assessment #50 | 7781b9f7cf89965ec9282d44ba59e2bbc9de90c4 | Resize diagnostic only. |

#34's all-nine comparison run 39857803985 passes, including actual Chromium/Firefox/WebKit old/new comparisons. Comparison equivalence does not clear strict raw-error acceptance. The complete asset materializer/lock is implemented: 3,211 files, nine families, carried installation with zero downloads. Numerous stacked component/asset PRs remain: inspect #34's pins and current PR bases to establish the exact merge set. Do not blindly merge diagnostics or changes already incorporated into #34.

#40 artifact:
https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/39825226656/artifacts/12446047963

It is the actual python-offline-website.zip, index.html at root, README-IT.txt included; no server-side Python/Node/Quarto install. SHA256 491e06d4819ef7328243f1b22faa28c58e57c6e4d07c0846bd7334efaaa1d81e. Twenty strict plus four plain-LAN browser cases pass at root and /dept/python/: editing, Run, Stop/restart, rerun and optional NumPy. Plain LAN needs no custom headers for this basic scope. Input prompts, full offline courses/boards, and real exam hosting are not cleared. Screenshots were generated but not visually inspected; do not claim general performance/visual improvement. AC handles NTNU exam IT questions.

## Next plan, in order

1. Recheck merged checker main and current delivery heads; reuse published evidence. Resolve the two WebKit production blockers in their canonical homes:
   - Resize: #50 implicates Quarto's synchronous BODY geometry read during the actual enhanced layout; stock/plain controls are clean. Replacing it with contentRect changes width semantics and is not accepted. Delaying Math setup was refuted: errors preceded setup. Removing the whole enhancement group stopped errors but changed layout. Removing Font Awesome alone did NOT fix them (8/12 original, 4/12 omitted; no frequency-effect claim). Latest run 39864679683, independent review 5621629478. Choose a bounded, evidence-driven next experiment; seek a behavior-preserving fix.
   - Worker: MathJax 4.1.3 speech/braille startup inside an opaque JSXGraph iframe creates a blob:null worker blocked by WebKit COEP; actual SVG formula rendering stalls. #48's controls pass in all engines. Setting BOTH document and menu speech/braille flags initially false avoids the worker, but disables accessibility features; it is diagnostic evidence, not an approved product fix. Preserve sandbox/isolation. No error filtering, blanket observer removal, arbitrary delays, generated Quarto/frame patches, or silent accessibility regression.
   - jsxgraph/jsxgraph-quarto #2 remains open at 21c5f9cabcd434f2f79f93e08adaf41aafb727a8. AC/Claude own upstream review/contact. Do not edit the fork or take over that PR. Re-pin only after AC confirms merge. If a proper worker fix needs an upstream configuration hook, report the precise requirement to AC without sending external messages.
2. After reviewed fixes, run fresh combined strict store/course acceptance in all three engines, including desktop/390px navigation, raw errors and real isolation. Then present AC the exact component/assembly/course merge order. Keep variants independent of this release. Deliver the simple ZIP; validate the actual IT server separately.
3. Independent next pure CTM slice is now unblocked by #16/#17: exact round/sigfig helpers in canonical src/ctm_checkers/math_exercise/numeric.py, then bind the existing native helper catalogue. Half away from zero on exact values, including sigfig(sin(r1), 2). Preserve legacy float round_places, sigfigs_round, parse_tolerance and all grading call sites. Read the approved design before coding; use focused tests/docs and canonical generated outputs. No implementation exists yet.
4. Complete variants incrementally: candidate enumeration/sampling, constraints/deduplication, placeholders, real-grader tests per approved variant, manifests and teacher approval, then student selection/storage and demo migration. Sampling stability as the space grows needs an explicit policy; do not invent one silently. Respect design-deferred extras.
5. Finish remaining pure CTM H1 work, language catalogs/content validation (including Nynorsk), and approved optional grading work. STACK adapters/consolidation and final Pyodide upstream/main handoff follow later; maintainer agreement is needed for the latter.

## Read only what the next task needs

All design paths are in Erasmus-CTM/ctm-assessment:
- main: docs/consolidation/2026-10-step2.md (H1 §13), 2026-10-step3.md, 2026-10-step4.md.
- handoff/2026-10: docs/consolidation/2026-10-step5-offline-exam.md, 2026-10-variants.md and 2026-10-variants-review.md.
- main: docs/audit-2026-10/README.md for later stages.

Binding AC decisions/amendments override earlier proposals. Read the relevant current PR body/reviews and source before changing it. Treat local old work folders as supplemental evidence, not unpublished work to adopt automatically. Keep future checkpoints short: current heads, blockers, next task and evidence links; avoid appending another chronological history.
