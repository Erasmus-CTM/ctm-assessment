You are taking over the CTM Assessment consolidation, a set of Quarto extensions for interactive maths and Python course pages. The owner is Andrey Chesnokov (AC). You work across these GitHub repositories:

- Erasmus-CTM: ctm-assessment (the umbrella package), ctm-libs (shared library), ctm-checkers (all checker Python, including the STACK engine), math-exercise, py-exercise, pyodide-interaktiv (working branch `feature/shared-feedback-integration`) and stack-sympy.
- aacchhee: ctm-demo (test course), ingmat3a_ntnu (real course) and the fork aacchhee/jsxgraph-quarto (PR #2 to upstream jsxgraph/jsxgraph-quarto).

AC'S UPDATED PRIORITY AND DURABLE CHECKPOINT (21 Oct 2026; binding)

- Keep all substantial work committed on non-main branches through the GitHub connector, and update this prompt as work proceeds so a stalled chat can be resumed. AC authorizes writing and opening PRs in every repository listed above.
- Use the author/committer identity supplied by the GitHub connector; do not pause over identity differences. This supersedes older exact-identity requirements. Do not prepare handoff packages.
- Prioritize completion of all remaining non-STACK-sympy work: the course migration and shared CTM platform consolidation come first. Then return to the smaller STACK-specific issues. Significant ctm-checkers changes that other components need must still be implemented; do not defer shared checker work merely because it is in ctm-checkers.
- Use more parallel workers where the work permits. Engineering: 6.1 Sol, medium, up to xhigh for difficult work; independent reviews: Astra, xhigh. AC alone merges; never merge, force-push or tag.

Current checkpoint (21 Oct, cloud continuation):
- CLOUD project; desktop may close. Host execution/filesystem disconnected; use GitHub connector and Actions. Tool updates reset functions-store and may interrupt workers: recover GitHub refs and resume existing agents. Commit substantial work promptly.
- Step-4 final set REVIEWED/GREEN/MERGED by AC: libs30 reviewed1f7a3a5de7b765d108fe2ca4ec98b36635c6814f -> main45bcb2a51257151f89bbe706142f22abcd1b5a0c; assessment24 reviewedd47ccc5a492d3df0cade62f9bc21beb63511846f -> main3d9ebd94565ca302724dc619092ad9d043c1497f. Merge trees equal reviewed trees. Pins reachable except documented JSXGraph fork exception. Finalcells39660903087 eachcourse24pages/320cells/0unstable/0unexplained. WebKit ResizeObserver also on main; cause unestablished.

NON-STACK PRs (DRAFTS, none finally accepted yet):
- Assessment25 https://github.com/Erasmus-CTM/ctm-assessment/pull/25 branchcodex/2026-10-reusable-course-comparisons head4edd42835a8923ebeac1a44b158add3c2698b75c. Reusableworkflow94f04ce; cloudconverted-source emitter74e27b6; explicitPythontestsda154; optionalbounded6PNGtransport4edd. Independent Astra source reviews PASS. Coursea99prepare119484909907 actually ran source1test+PNG3tests OK. Originalreusable6tests/8mutations passed. ExactheadfullCI pending; courses/preparation green. No runner-token writes: logs checksummed bytes, connector publishes.
- Course16 https://github.com/aacchhee/ingmat3a_ntnu/pull/16 ONLYbranchconsolidation/2026-10-step4-migration HEADa99c8b52ce422e34da1b426909197e545ef9a931. Sourcecommit4426b18eb3e3f4446fa45f1a9db0f397ce2bd94d tree8f1e7e02c503d8d999c86f4a228135fad73eb52c; a99changesONLYcaller pin4edd+emitPNGs. Base maina0a34ee508fdd4d00e78e7ea782b00a343fcf682, oldpackage9ed46a4, newpackage3d9ebd9. All31recoveredsourceblobSHAs verified+2deletions+CSS31ab7f83fbecd00dedb137924b18e7fb19d5c4ef. Author AND independent-review grammarproof all30files:441constructs/190titles/227anchors+11exactdedups/12switches/1embed/448unchangedfences/440unchangedlabel-contextlines. Two historical rendered uke4 heading closures, week7blank, uke10TeXescaping reviewed. Latest source regularrender119484909020 GREEN, nativecompare119484977806 GREEN:28pages/1713intendeddiffs/0unexplained/0Quartowarnings. Finalrun39675715982 actualsourceconvert=false/browser3engines4shards;12browserjobs stillrunning/queued. Chromium1job119486322306 shouldlog6PNGbytes; requirecomplete names/courseSHA/chunkorder/bytecounts/SHA256 beforeview. Independent substantive config/CSS/boundaryreview inprogress. Require browser0failed and desktop1280/390visualinspection beforeacceptance.
- Libs31 https://github.com/Erasmus-CTM/ctm-libs/pull/31 storebranch HEAD6d5fe6f35e398d5d518919542a330383c5eb4d7a tree9a7d6122481fa7be90dff8f478e8836dabb8d17f. Independent Astra B1/B4/B7 SOURCEAPPROVED:59authoredV8+bespokestorage/cross-version+7finalprogress integration/order checks; earlier9progress/11storagechecks too. Core includes quota future-v2preservation, invalid/stalegrade protection, scopedcross-tabclear cancelsNEWpendingrecords, finalmanifestprepass disablesbothduplicatelabels beforeJSregistration, ephemeralruntimeId separateauthorlabel; allunlabeled/duplicateexercises countinprogress. Local/cross-tabclear targets right author/component/runtime, survivesordinalchangesacrossversions. B7inpage selectableMarkdown/Copyallfirst/secondaryMD+safeHTMLPNGdownload/sharedcopyfallbacks. ExactheadfullNode/Quarto/3browserfixtureCI PENDING; examplegreen. SourcefreezeafterAstraapproval. DO NOTwhole-replaceold-baselinesource trees and lose parallelchanges.
- Math27 https://github.com/Erasmus-CTM/math-exercise/pull/27 HEAD68673f993549eed10fe2574d0cfeebebd9264999 (latest436c21sourcefix +exactB1pin6d5fe6f). Authoredfield/matrixsharedadapter, readonlyoldanswers/historicalresults/copy/export. Stableexercise-relativefieldkeysfixexerciseordinalreorder, collisionguard+oldcurrentDOMreadfallback. Variantsemantichash includesresolvedparameters/derived/context/id/question/solution/checker+effectivegradingoptions, ignoreswholedefinitionfingerprint/reorderposition. Astraactual5adaptercases PASS; newNodefieldtestspassedactualCI. Old436cCI had3fixtureissues: newrender tildefences/---parsedasYAML, stale dependencyregex missingmath-store.js, cross-realmcopyequality; engineerfixing. Check NONPOOLglobalgradingdecisionbelow; codegradingunchanged.
- Py10 https://github.com/Erasmus-CTM/py-exercise/pull/10 HEADc543f45956bc085b96b36fe90e9b9da4275653d4 treea13528e5ff1d9d81c39a4ed4659e353909a2bc68. Prioridentityd311; exactB1workflowpinbc96. Latestcorrectnesshash rawblock+sortedmergedforbiddenimports/keywords only; 7pagerealrenderregression pending. IndependentAstra legacy5URLforms/results5types/staleasyncsuppressionpassed; guard-removalmutantkilled. Latesthashclarificationreview+CI pending.
- Pyodide6 https://github.com/Erasmus-CTM/pyodide-interaktiv/pull/6 branchstore, basefeature/shared-feedback-integration29c2526069f65434c35df6ef09a13b263e06166a NOTmain. HEADc190102a382bb5b37fabd3f2e90c8a165410c2cc includes11actualadapterV8cases +finalB1generationtarget6d5fe6f. Earlier61526cc canonicalgeneratedcopy15files/70chunks fromgreenrun39675502061/job119484168523 EVERYbyte/SHA256/GitSHA1verified; publishes15/15returnedblobmatch; oldgeneration9a9preliminary. Same-code labelled/unlabelledlegacycount bug fixedfd9adaf. Savedack refusals/cancel/obsoleteack bugs fixedcc9/c190; Astrareviewlatestpending. Code-onlypersistence; outputscurrentcopy/export only. Final6d5generationrunning: canonicalsync+--check/verifiedreport/connectorpublish, remove temporary.github/ctm-libs-target.json in SAMEgeneratedpublicationcommit; NEVERhandeditcopies. Prior61526 Node/library/example/plot CIpassed; finalCI+combinedpending.
- Aliaslibs32 https://github.com/Erasmus-CTM/ctm-libs/pull/32 HEADc7633d8087ce4f30817080858d9edd4b530ab8d3. IndependentAstraPASS+11sourceinvariants;257tests0fail0skip; example/runtime/worker/3browserUI green. Assessment26 https://github.com/Erasmus-CTM/ctm-assessment/pull/26 HEAD54ff136a2d78eef48799e2a004df060c71f3f2ba treed4cb647926011b01a42a0d02816ad2427cfd1ccc. U3ccorrection independentlyPASS: ONLYctm-libsbranchmain, exactc7633pinunchanged; pyodide ships-copies preserved. Reviews5606252871/5606253946posted. CombinedCI currentall5rendercompares+ctm-demo/examplecells green; parity/build/measure/ingmatcells/browser pending. Mergeorderlibs32thenassessment26, AC only; notreadyuntilallgreen/finalancestry/headcheck. Lateraliasbase-syncmustpreserve B1API3 ctm.lua togetherwithbridgeremoval.

Implementation clarification, 21 Oct independent review:
- Literal sourcehash(rawblock) missed changed project-level correctness restrictions. OptionalACquestion returned noanswer; coordinator proceedingwithrecommendednarrowfix undercontinue/bestjudgmentinstruction, NOT claiming explicitACapproval. Sourcehashincludes normalized effective correctnessrules suppliedoutsideblock (B3mergedforbiddenimports/keywords); presentation/lang/feedback/submission/timingexcluded. Retainanswers, oldscoreoutdated. B2resolvedvariantsemanticfixsamepurpose; engineercheckingwhether nonpoolmathhasoutsideblockgradingrules atall. Updated step4design onhandoffbranch; carryclarificationintoassessmentstorePR alongsideexactreviewedpins/combinedCI.

Step5parallel work started (approveddesign/lastACdecisions binding):
- Assessmentbranchconsolidation/2026-10-step5-server commitfe6114482948e02974ef126fad116e4a3c8efe0a tree8869cf213... has4paths scripts/serve-offline.py,12realHTTPtests,docs/exam-server.md,read-onlyCIworkflow. EngineeropeningdraftPR; realHTTPtests notyetclaimedrun. Serverlaneownedci_resume (B6priority).
- shared_store_core owns NEWlibsStep5assettablebranch+assessment scripts/ctm_assets.py/assetslock/licences/vendoring/hooks. Exactversions fromcurrentresolvedtestedlocks/approvedpins; officialnpm/releaseintegrities viaread-onlyCI, no guessedhashes. NoB1Lua/settings/APIeditsyet. Pyodideoneversionhome runtimeconstant; JSXGraph/MathJax4/fontonlyassessmentjsxgraph-pins; otherassetsonecanonicalassets.json. Examsetnumpy/scipy/sympy/matplotlib/networkx+dependencies+stdlib; lastACdecisionstopexamrenderifneedsotherpackage overridesearlierscannerwarning. ServerHTTPS+trustedcert+headersrequired; HTTPdegraded. NoLibrarycopiesofgitcode.
- NextavailableengineercanownsharedCTMAssetsLua/JS/settings+MathJaxswitch usingfrozenassetcontract; offlineCI/boardproof+profilesseparatelanes. JSXGraph5b/forkchangesremainblockeduntilACupstreamPR2mergenotice, don'ttouchtheirreview/contact.

Workers all7slots inclroot: core(B1thenassets), progress(B4/B2/B3fixes), ci_resume(B6/generation/server), migration(course/transport), Astrareview_step4(B1thenactualcourse), Astrareview_types(B2/B3/B6). Reusecompletedreview_options fornextindependentreviewwhenslotfree; itapprovedaliasoriginal. Remainingpriority: finishcourse/alias/B1-B7, thenoffline/exam/sharedquestiontests/variants/sharedcheckerneeds/H1/languages/steps6-8. No smallSTACK first.

DeferredSTACK: checker10/11/12/13+stack-sympy28 unchanged/unmerged; findingsposted. Nativecheckpointcheckerbranchcodex/2026-10-stack-review-checkpoint6bf69f391a8f6afd831cc4afa8d3e3fb19a1b06f (6unit+compilePASS, PHP/Maxima/AstraUNRUN, workflowdisabled). Expectationsstackbranchcodex/2026-10-stack-expectations-checkpointbaaf82e394330f413fa907545d610f8c3783a7e8 (136diff/12mutantsPASS, CI/rereviewpending). FacFormfixONLYlocalreview-resume-facform/publish-files.json baseline75284f7, NOTremotesaved/newtestsunrun. NativeevidencemustcoverchangedrowsBOTH4.13.1/4.14.0, existingCIdoesnot. LowestTermsunchanged, acceptedhyperbolicdeferral/options/scores/messagesremain. SamerepoliteralbaseancestryafterACmergesrequiresbranches/pins/sync/retest.

Updatecheckpointaftersubstantialcommits. Nevermerge/force-push/tag. Nevercallreadybeforeexact-headcombinedCI+independentreview.

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
