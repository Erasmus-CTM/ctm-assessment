You are continuing the CTM Assessment consolidation for Andrey Chesnokov (AC).

Repositories: Erasmus-CTM/{ctm-assessment,ctm-libs,ctm-checkers,math-exercise,py-exercise,pyodide-interaktiv,stack-sympy}; aacchhee/{ctm-demo,ingmat3a_ntnu,jsxgraph-quarto}. Pyodide's working base is feature/shared-feedback-integration.

AC'S UPDATED PRIORITY (21 October 2026; binding)
- Keep substantial work committed on non-main branches through the GitHub connector and update this prompt as work proceeds. AC authorizes writing and opening PRs in all repositories above.
- Accept the connector's author/committer identity. Do not pause over identity differences or prepare handoff packages.
- Finish all remaining non-STACK-sympy work first, then return to smaller STACK issues. Significant ctm-checkers work serving other components remains in scope and must be implemented.
- Use all available workers where independent work permits. Development: GPT-6.1 Sol medium, up to xhigh for difficult work. Every independent review: Astra xhigh; never review one's own code.
- AC alone merges. Never merge PRs, force-push or create tags. Review, exact-head combined CI and final head/base checks precede sending a set to AC.

DURABLE CHECKPOINT — 21 October, cloud continuation
This checkpoint supersedes stale status/head numbers in the original instructions below; their design and safety requirements remain binding. All repository handoffs and relevant designs were already read by this team. Read them before taking over unfamiliar work.

Environment and publishing
- This is a cloud project: desktop may be closed. The Windows host executor/filesystem is disconnected; GitHub connector and Actions work. Do not wait on a local gh process.
- Tool reconnections can reset functions-store and interrupt workers. Recover durable GitHub refs and use followup_task to reactivate completed agents; send_message alone does not restart them.
- Seven active slots including root. Use all where useful. All substantial code is already committed; no handoff packages.
- Use create_tree/create_commit then update_ref(force:false, expected_sha:fresh head), or update_file with a fresh blob SHA. Never replace an older whole tree over parallel edits; compose only agreed owned paths.
- Generated copies/wheels must come from canonical scripts. Read-only Actions producers emit bounded base64 plus byte/SHA256/Git-blob checksums; publish recovered outputs through the connector. Never hand-edit generated copies or let runner tokens commit.
- Every cross-repo set uses reviewed head pins, designated main/working branch fields, no review-ref trailers, no behind branches. After AC merges, verify merge tree equals reviewed head tree and pin reachability, synchronize later bases/pins and retest. Do not silently waive literal ancestry.

Already merged by AC
- ctm-libs#30: reviewed 1f7a3a5de7b765d108fe2ca4ec98b36635c6814f, main 45bcb2a51257151f89bbe706142f22abcd1b5a0c, tree equality verified.
- ctm-assessment#24: reviewed d47ccc5a492d3df0cade62f9bc21beb63511846f, main 3d9ebd94565ca302724dc619092ad9d043c1497f, tree equality verified.
- Final cells run39660903087: each ingmat comparison24pages/320cells/0unstable/0unexplained. Parity10541responses/720fixtures/34tests/28programs, zero differences. WebKit ResizeObserver also reproduced on main; cause not established.

READY AND ALREADY REPORTED TO AC: alias-removal set
1. https://github.com/Erasmus-CTM/ctm-libs/pull/32 head c7633d8087ce4f30817080858d9edd4b530ab8d3.
2. https://github.com/Erasmus-CTM/ctm-assessment/pull/26 head 54ff136a2d78eef48799e2a004df060c71f3f2ba.
Both branch consolidation/2026-10-step3-alias-removal, draft=false, final heads unchanged, ahead1/behind0. Seven library checks (257tests/three engines) and all18 combined checks green; PR deployment intentionally skipped. Independent Astra original + branch-field delta review complete, final review5606484818. Exact library pin remains branch main; Pyodide ships-copies both forwarder/library, stale-extension diagnostic retained.
AC has NOT yet reported merging this set. Recheck rather than assume. After merge, synchronize later branches preserving B1 API3 and removing only the retired extension alias; ai-feedback configuration namespace remains canonical.

Course migration and reusable CI
- https://github.com/Erasmus-CTM/ctm-assessment/pull/25 draft; branch codex/2026-10-reusable-course-comparisons, head4edd42835a8923ebeac1a44b158add3c2698b75c. Source independently reviewed, focused source/PNG emitter tests pass, all10 checks green (deployment skipped). Actual caller now pins this head. Wait for final course browser gates before declaring this course set ready.
- https://github.com/aacchhee/ingmat3a_ntnu/pull/16 draft; ONLY course branch consolidation/2026-10-step4-migration, head a99c8b52ce422e34da1b426909197e545ef9a931; base/main a0a34ee508fdd4d00e78e7ea782b00a343fcf682.
- Converter source commit4426b18eb3e3f4446fa45f1a9db0f397ce2bd94d, every recovered Git blob verified. All37 changed paths and441 constructs reviewed by author and Astra:165reading/7hint/18plain details/238anchors/12switches/1embed. All190titles,448fences,440labels/contextlines and other nonblank prose exact;25 blank boundaries manually checked,9negative mutations rejected. CSS cleanup preserves generic details/layout.
- Native run39675715982 job119484977806:28pages,1713 intended differences,0 unexplained,0 Quarto warnings, convert=false. Package before9ed46a4, after3d9, actual source beforea0/aftera99.
- Latest course status:8/12 browser shards green,4 running, no failures. Remaining webkit1=119486322403, firefox4=119486322626, firefox3=119486322712, webkit4=119486322992. All Chromium green; Firefox1/2 and WebKit2/3 green. Root owns watch.
- All SIX desktop/390px PNGs recovered, signature/byte/SHA256/chunk checks verified by root and independently reviewed by Astra. Lecture/learning buttons fit390px, reading titles/content good. Wide equations already overflow mobile crop: comparator0.00% changed; do not claim horizontal access proved. Existing limitation is later small work.
- Never mark course ready before all12 shards green plus final head/base checks. Proposed course set order: assessment25 then ingmat16, AC merges.
- PR25 source emitter robustness followups: git diff --no-renames + rename regression, reject symlinks instead of read_bytes dereference. Current converter emits regular files. These are scoped followups, no general symlink/rename support claim.

Shared store B1–B7 — HOLD, not merge-ready
- libs#31 branch consolidation/2026-10-step4-store latest6f5cfa7d189db238aad5a3784e76ec426c980dc7, tree fbe20c6df8ed8cd89c107eac9cb20ed190e1ae09.
  Prior6d5fe6f35e398d5d518919542a330383c5eb4d7a passed all20 checks,285/285 tests and real storage/CopyAll/export fixtures in Chromium/Firefox/WebKit. Independent source review covers concurrency, future-schema preservation, stale scores, lastChecked, remote clear canceling never-persisted debounce, label/component/runtime identity collisions, manifest duplicates and text-first copy.
  NEW6f5 is exactly THREE paths: progress.lua cleanup, ctm-libs-end.lua post-finalize call, progress-render.test.cjs two actual Quarto regressions. Removes only __ctm-order/__ctm-quiz/__ctm-runtime-id from remaining ordinary CodeBlocks after all registration/finalization. Actual course reports found50 leaking roots; FIX producer, never whitelist. Public attributes and manifest preserved. Astra independently SOURCE APPROVED6f5; actual new287/287 Quarto/Node CI PASS zero failures/skips job119510678379 (new regressions184/185 explicitly passed). Other exact-head UI/runtime/worker jobs still pending.
- math#27 latest f467f0459d44dcf8c0870798e67ed9ed4f39cad4: sole .github/pins.json delta6d5→6f5 independently verified. Prior1bf all6checks green,161pass/0fail/1expected old-policy capability skip, browser18tests pass; source approval retained. New exact-head CI pending.
- py#10 latest ab1fad5be6659453ab55e14c19135254e62fa5da: sole workflow fallback6d5→6f5 independently verified, prior source approval retained. Priorb7 passed33/33 actualNode/render0skip, review5606456343. New exact-head CI pending.
- Pyodide#6 head6580e9cf7602679665fc6a296cc19f0c8c715ea7, base feature/shared-feedback-integration29c2526069f65434c35df6ef09a13b263e06166a:90/90 Node/library0skip, render/check green. All44 generated mappings exactly canonical6d5; review5606431950. Code-only saves, epoch/identity/legacy occurrence/status/copy cases source approved. Root staged generation at3456e4bf6d6089954bccbf387751e3ff5dc4463f, only .github/ctm-libs-target.json with exact6f5. Generate PR run39684337421/job119514459196 queued (push run39684331246 also). scripts/report-shipped-ctm-libs.py runs canonical sync+--check, emits CTM_GENERATED_MANIFEST/CHUNK{path,part,data}/COMPLETE{manifest_sha256}. Verify bytes/SHA256/Gitblob, publish exact emitted files/delete_paths, DELETE target in SAME generated commit; then verify44canonical mappings and actual90tests. Never hand-edit copies. Root owns this; ci_resume remains comparator.
- assessment#28 branch consolidation/2026-10-step4-store head b045f850040c892636167b2d6a71ba35fd958142. Version0.13.0 and exact pins to the four heads above; metadata source approved. b045 fixes root npm/package-lock version only after initial94test version mismatch. Checker9e042/JSX17de unchanged. Must refresh all store pins after B1 cleanup and compose approved slices below.
- Optional AC hash question returned empty; coordinator proceeded under continue/best-judgment instruction, NOT explicit AC approval. B3 source hash includes normalized effective project forbidden-imports/keywords; presentation/lang/feedback/submission/timing excluded. Math nonpool has no external grading defaults; raw block unchanged. Handoff design clarification amended in PR28.

Hold assessment28 ref while preparing composition
Actual producer run39679120253 produced unexplained generated-store differences: examples133, ingmat3663, demo1192, step4course32. Full reports were recovered and checksummed via read-only diagnostic runs39680311005/39681543084. No author prose/grading changes found. Some are legitimate narrowly bound additions;50 private CodeBlock attrs require B1 fix. Browser missing-artifact failure119501365749 is downstream of skipped site upload after native comparison failed; no UI result evaluated.
COMPOSE ONLY AGREED PATHS onto fresh head; exclude diagnostic/evidence files.
1. Mixed REAL component integration SOURCE APPROVED checkpoint3d8e5e18a4bcf9fa9dbabc6be4bd21f96c91c906, treeec7ffea24e29a64067f7e3649da9defd89fb796b on consolidation/2026-10-store-integration-checkpoint.
   Exactly12 paths: integration/store/course/{index.qmd,second.qmd,_quarto.yml}; integration/store/{changes.json,build.py,browser.mjs,instrument.mjs,instrument.test.mjs,README.md}; .github/workflows/store-integration.yml; tools/compare-browser.mjs (serve export only); CHANGELOG.md (copy available saving-off wording).
   Actual mixed Lua/DOM/Monaco, before/after same-origin source swap, shapes/variants/py/B6/reset/clear/saveoff/copy/export. Genuine Python boundaries globals.set('_ctm_py_request',JSON)+constantCALL_PY and B6plugin.runCell; six calibrations and old-spy mutants fail. Hold B clock before typing, observe remote clear, advance1000ms, assert no record/read/flush. Missing-clearTimeout mutant killed. Actual Quarto/browser CI still required after composition.
2. Comparator checkpoint cb23cd009bfe6c61b293c6366d7c715f8343bd62/tree2a8bcfb6290c022b99c95b3a6a230c1d754647ab is superseded by candidate f888395a2d0f5b0e57fc09d27a37fc35d3adbb8c and minimal FIVE-path tree eb112d25af7b6e9a760eaf15bc31d677bc0af2f7 (original four plus tests/compare-rendered-store-calibration.cjs). Author fixes source binding/reverse extras/descriptors are under review; do not claim final approval.
   Originally four owned paths (plus new calibration test noted above): tools/compare-rendered.mjs; tools/compare-rendered/store.mjs; tools/compare-rendered/expect/step4.yml; tests/compare-rendered-store.test.cjs.
   Narrow manifest/catalogue/dependency/bar/config/root invariants, setup-only added empty save field allowed, other code/options remain ordinary differences. Cross-Py metadata binding fixed in cb23.
   OPEN: swapping ALL new B6 metadata between unchanged unlabelled cells still passes; deleting interactive extra editor metadata together with manifest entry still passes. Both Astra actual-module reproductions delivered. Need bind source to original code/options/epoch using actual Quarto canonical JSON/hash and reverse extra coverage. Candidate fixes both: ten actual-function branch checks independently pass for reverse extras. Author calibrating source hash/descriptors against real Quarto then full3-page replay, CI39684302591/job119514342190 head1230a779 running15CLI groups before calibration. Earlier blocked trees remain unapproved. Additional14 descriptor bindings/two validated-bar position adjustments from full reports pending.
   Do not ship old comparator trees as approved. Wait final exact4path tree, independent approval, actual CLI/fullreport checks, then compose with integration and refreshed pins in one umbrella commit.
After all gates and base synchronization, proposed store merge order libs31 → math27 → py10 → Pyodide6 → assessment28.

Step5 parallel lanes — partial, no complete offline claim
- assessment#27 server branch consolidation/2026-10-step5-server headc1f509c301e786f7573b8a5c35745570a4d853d1. Independent Astra source pass, actual Python3.12 HTTP17/17 zero skips run39678389398/job119494131130. All three regular checks green, deployment skipped. NOW draft=false, reported READY to AC. Fresh exact head/base checks unchanged, ahead7/behind0; all3checks green and deployment skipped. Can merge independently; recheck base after other AC merges. Real exam HTTPS/lockdown/capacity dry runs unproved; AC handles NTNU questions.
- libs#33 asset table branch consolidation/2026-10-step5-assets head2ed1a3381bb6b606e3a913905095eadd8aee0988; ONLY assets.json. Five homes: Monaco0.46.0/KaTeX0.16.47/FA6.5.1/MathJax3.2.2/SourceSansPro5.3.0. Independent schema/path/ownership and official current0.16 patch review pass. Pyodide runtime and JSXGraph/MathJax4/font versions have other single homes.
- libs#34 API branch consolidation/2026-10-step5-assets-api stacked from table2ed1; SOURCE APPROVED head17112c0ff280a3e506cc6ebbf7611a825079b65f. CTM_ASSETS{v:1,mode,bases}, absolute URLs/lazy CDN consumer registration, Lua page offset, local manifest/version/path/theme/resource/author overrides, shared runtime/worker/packages. Actual CI test119503473752 FAILED six setup/expectation cases; all other latest jobs green. Core owns narrow fixture corrections now: missing CTM_COMPONENT_DEV for probe; invalid empty format.html; delivery list missing ctm-assets script; known-options expectation missing assets. Do not weaken preflight negatives; production17112 frozen unless actual issue. Later base synchronization MUST union API3 B1 modules (this branch started API2).
  Assessment hook only checkpoint89d7e5fbcbea4982f471d750bd6b3ce0048cd204, blobe6057b87c0c202450e4a2d0564ae778113b22f38, already composed by builder79. Private provenance overwritten per Meta and only hook-filled keys recorded; author lookalike/forgedmarker checks real Quarto3/3 pass.
- assessment#29 assets builder branch consolidation/2026-10-step5-assets latest89679ca191e511682928bb7b116d80968fd6fef3,8paths: scanner release-stdlib/local-file resolution, literal dynamic aliases/nonliteral refusal, private-index publish exclusion, curated Pyodide/OpenBLAS/OpenSSL licences. New35fixtures pending; prior79f bounded source approved and32+3 actual tests green. Bounded source approved; actual Python32/32 job119507803376 and actual Quarto provenance3/3 job119507803594 pass zero skips.
  Canonical scripts/ctm_assets.py plus ONLY packaged author-imports.py, builder dynamically reuses it. Safe destination-local staging, licence consent before cache, special-file rejection, board/library home conflict rejection, atomic install/rollback with recoverable external backup on double failure, strict HTTPS443/no credentials/allowlisted redirect/final metadata URLs.
  Official4030byte metadata blobab32ecaae94838d695de0011d250da069f3e5342 committed45dddcec5f8f2e87e5924465a24354b8e96214ad independently verified. Official npm/Pyodide integrities only; no guessed hashes. Curated CPython3.13.2/Emscripten4.0.9 licences independently upstream equal. Archive inspector reports members/licences/full Pyodide lock for curation; actual reports SUCCEEDED: board candidates5322bytes/blob072ba22b7a8ea74c10c5573f990bf9f911288ef0, archive report1,142,693bytes/381chunks/blob495b5958ac8117adb4ba7f651c45ac3dec927512 reconstructed and cryptographically verified. Large full-lock report remains in CI logs, not committed/published. Candidate board versions are NOT pin changes; canonical jsxgraph-pins untouched.
  Still unfinished: complete populated asset lock/installer/render gate, import policy semantics and real parsed component fragment wiring, actual complete offline render. Never claim full delivery.
  One canonical Python AST helper, no copied parser. Proposed assessment-owned __ctmAuthorImports.add{source,packages,origin}; math/py/qpy supply already-parsed fragments, end filter pipes JSON into helper. Full lock/minimal index CACHE ONLY outside published assets/manifest. Not implemented yet.
- assessment#30 offline checker branch consolidation/2026-10-step5-offline-checks latest6f1079149a4e146506b6e2a56f551fe0ae85a5d5, tree9c46f6c440c9598cace97e4123dbe52bba3c876d: canonical audit script injected before HTML/srcdoc/data-frame authors using JSDOM source offsets, early-event parent ACK bridge, fail-closed install/drain checks and source-preservation unit. Fresh Astra review/actualCI pending; priorf857 remains8pass4fail. Astra source review found timing blockers; actual CI119509231481 remains8pass/4fail. Opaque iframe early scripts run before audit/init/binding; negatives falsely accepted, genuine local requests succeed but audit misses them. No blanket pageerror ignore or false proof.
  Synthetic JSXGraph model controls: pinned fork disables core resize; model now faithfully does so. Strict no-refresh negative must fail20/20, positive5/5; leave CI red if mechanism unproved. Actual fork PR2 proof remains AC-dependent; never label model as fork proof.
  Correct real math-exercise-cell selector, visibility/opacity ancestry checks and guarded SW refusal independently reviewed; actual early-frame timing fix ongoing.

Approved exam decisions
Fixed numpy/scipy/sympy/matplotlib/networkx + dependencies/stdlib extras. Exam render STOPS if anything else required (latest AC decisions override earlier warning-only text). HTTPS/trusted cert/headers required; HTTP degraded only. AI off via canonical ai-feedback.enabled:false, autosave on, separate exam storage/output, text-first copy. Complete Pyodide lock cache-only, no published copy. Actual board src_mode=link/srcdoc/font-root mapping proof waits AC notice upstream PR2 merged; no fork edits. Font base package root with trailing slash.

NEW major shared ctm-checkers lane (authorized, not smaller STACK work)
- Worker progress_quizzes now owns consolidation/2026-10-question-tests branches in checker and math, from main9e042dc5e57a1636be64ca5d08910c9af5ff1371 / f0b063fec90a78ef18b8a0cc761123a9bcc28b85. Keep store branches untouched.
- Draft checker https://github.com/Erasmus-CTM/ctm-checkers/pull/14 head03462a6399610d6d9b730bf71fd259c563c2cc7d, treef03e907e09c08487bf786a4062a795511a978c67; eight paths canonical shared declarative tests + real check/check_custom adapter + focused tests/docs/workflow. Version0.6.1.dev0 avoids reserved0.7–0.10, no tags. Generated payload pending read-only Actions producer.
- Read step2 §9/§13 and full variants design/review/AC decisions including amendment19. Named/positional answers are expressions in question variables or raw("studentstring"); expected per-field/overall/partial/score; REAL grading every mode, failure stops build/CI naming exercise; keep old custom test(check,symbols). Shared before variants; H1 OptionB already approved.
- Python floor3.9, CI3.9/3.12/3.13, direct script --stdin (avoid stdlib shadow via python-m). Canonical wheel/payload generated by existing build.py, emit checksummed binary/UTF8 output and connector publish. No grader/golden/STACK engine edits; licences retained.
- Early Astra source blockers: null/empty expectation silently passes; actual browser partial-credit-off and raw-answer trim/empty semantics differ from adapter. Author fixing; no source approval. Early checkpoint f176 fixes null expectations/label collision, native custom Rational serialization issue also found. Math Lua/tests/direct-script integration next. Astra review_types assigned independent review now. No native test pass claimed yet.

Current workers (root + six slots)
- ci_resume: Sol medium, comparator source/replay; root owns B6 regeneration.
- shared_store_core: Sol high, B1 cleanup CI, narrow API fixture repairs, then assets builder/import gate/lock.
- progress_quizzes: Sol medium, shared question tests (mixed integration3d8 frozen/approved; resume for integration CI findings).
- offline_browser: Sol high, opaque-frame preexecution audit and faithful model negative.
- review_step4_resume: Astra xhigh, B1/API/offline/comparator independent review.
- review_stack_types_undecided: Astra xhigh, shared question tests now; comparator source-binding findings remain open.
Completed migration worker owns API17112/course source proof; can reactivate when a slot opens.

Deferred STACK — do not resume small fixes first
Checker PR10 f5e5a8a42b18e736faeacafb87b73249575ca27c; PR11 10ce3234170d3303de1d07ea2543f1db1c31a29c; PR12 0d5cb2a1d7afacb172331cbb13c47ca4ca474928; PR13 75284f76612f756e204306ddc91b71d47d8925ce; stack-sympy28 bcbb8d156d7e2aeba25f53db90105a4a942cbdbc.
Findings reviews5605386736/5605390572: FacForm author error masked by early nonexpression; STACK28 broad expectation allows unrelated advice/UI; native CI incomplete for changed rows BOTH4.13.1(10d3233)/4.14.0(3338304). LowestTerms unchanged, discuss before change. Accepted S07 none/'(', S05 four0.7, S10 nested message, S11 hyperbolic laterS12 remain.
Durable native collector checkpoint checker codex/2026-10-stack-review-checkpoint6bf69f391a8f6afd831cc4afa8d3e3fb19a1b06f (6unit+compile; PHP/Maxima/Astra unrun; workflowdisabled).
Expectation checkpoint stack codex/2026-10-stack-expectations-checkpointbaaf82e394330f413fa907545d610f8c3783a7e8 (136diff/12mutants; CI/review pending).
FacForm WIP only local review-resume-facform/publish-files.json baseline75284f7; NOT remotely saved, tests unrun. Recover/reconstruct later. Public wording describes only our engine.

Next coordinator actions
1. Watch remaining four course browser shards, final source/head/base checks, then report course set25→16 if all green.
2. B1cleanup6f5 source approved; wait actual CI, refresh math/py pins, canonical regenerate B6, refresh umbrella pins.
3. Do not compose blocked comparator. Once final4path review+actual calibration/replay pass, compose only its paths and integration3d8's12 paths onto fresh umbrella head, then actual mixed three-engine CI and full combined comparison/parity.
4. Continue assets lock/import/installer and fix offline audit timing; shared question tests parallel. Then variants/H1/languages/steps6–8 before smaller STACK.
5. Keep all substantial work committed and this checkpoint reconciled. Never declare ready without exact-head review/combined CI/final base check.

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
