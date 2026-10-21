You are taking over the CTM Assessment consolidation, a set of Quarto extensions for interactive maths and Python course pages. The owner is Andrey Chesnokov (AC). You work across these GitHub repositories:

- Erasmus-CTM: ctm-assessment (the umbrella package), ctm-libs (shared library), ctm-checkers (all checker Python, including the STACK engine), math-exercise, py-exercise, pyodide-interaktiv (working branch `feature/shared-feedback-integration`) and stack-sympy.
- aacchhee: ctm-demo (test course), ingmat3a_ntnu (real course) and the fork aacchhee/jsxgraph-quarto (PR #2 to upstream jsxgraph/jsxgraph-quarto).

AC'S UPDATED PRIORITY AND DURABLE CHECKPOINT (21 Oct 2026; binding)

- Keep all substantial work committed on non-main branches through the GitHub connector, and update this prompt as work proceeds so a stalled chat can be resumed. AC authorizes writing and opening PRs in every repository listed above.
- Use the author/committer identity supplied by the GitHub connector; do not pause over identity differences. This supersedes older exact-identity requirements. Do not prepare handoff packages.
- Prioritize completion of all remaining non-STACK-sympy work: the course migration and shared CTM platform consolidation come first. Then return to the smaller STACK-specific issues. Significant ctm-checkers changes that other components need must still be implemented; do not defer shared checker work merely because it is in ctm-checkers.
- Use more parallel workers where the work permits. Engineering: 6.1 Sol, medium, up to xhigh for difficult work; independent reviews: Astra, xhigh. AC alone merges; never merge, force-push or tag.

Current checkpoint (21 Oct, cloud continuation):
- CLOUD project; desktop may close. Host execution/filesystem disconnected; GitHub connector reads/writes and Actions work. Tool reconnections reset functions-store and can interrupt agents: recover GitHub refs and resume existing workers. Commit promptly, no handoffpackages.
- Step4finalsetACMERGED: libs30reviewed1f7a3a5 ->main45bcb2a51257151f89bbe706142f22abcd1b5a0c; assessment24reviewedd47ccc5 ->main3d9ebd94565ca302724dc619092ad9d043c1497f. Exactmergetreesverifiedequalreviewedtrees; pinsreachableexceptJSXforkexception. Finalcells39660903087eachcourse24pages/320cells/0unstable/0unexplained. BaselineWebKitResizeObserveralsoreproducedmain; causeunestablished.
- Assessment combined store PR28 https://github.com/Erasmus-CTM/ctm-assessment/pull/28 head b045f850040c892636167b2d6a71ba35fd958142 branch consolidation/2026-10-step4-store, sixpaths version0.13/changelog/designclarification/exactpins. Astra sourcePASS review5606406304. Pins: libs6d5fe6f35e398d5d518919542a330383c5eb4d7a; math1bf1acfdb9de34562e23ab5952b65c141c967e93; pyb7f525c7c2ee0d990be13edddc3c1e32fe7229bc; pyodide6580e9cf7602679665fc6a296cc19f0c8c715ea7. Designated main/working branches preserved; checker9e042/JSX17de unchanged. Proposed order afterallgates/basesync: libs31,math27,py10,pyodide6,assessment28. Neverclaimreadyyet.
- Final B1libs6d5 actualNode/Quarto285/285,0fail0skip (jobs119487992510/119488022673); source59+bespokeindependentapproved. Real3enginefixture/otherjobs pending.
- Math1bf actual162tests/161pass/0fail/1EXPECTEDbaselinecapabilityskip (oldlibswithoutpolicy test); newrendersemanticrevision/reorder/collision/dynamicmatrix allran/pass, exactlibs6d5. Testfixesonlysince68673; sourceindependentlyapproved. MathnonpoolhasNOglobalgradingdefaults, so rawblocksource staysunchanged; earlieranalogywasoverbroad. Variantssemanticfixincludesenclosinggradingoptions.
- Pyb7 latesttest-onlyfixturecorrections (backtickexercise+locale50 %); productionhashsourcec543unchanged/reviewed. Actual33/33tests0skip GREENjob119492459793 exactlibs6d5; new7pagehashcase+resetpass. IndependentCOMMENT5606456343posted https://github.com/Erasmus-CTM/py-exercise/pull/10#pullrequestreview-5606456343.
- B6FINAL6580 publishescanonicalgeneratedcopy6d5, removestemporarytargetSAMEcommit. Actualfinal90/90Node/library0fail0skip; example/plotgreen; generatorzerochanges/chunks0 canonical--checkgreen. IndependentALL44generatedblobmappingsequalcanonical6d5 (40libs+3forwarder+1bootstrap), noextras/missing. IndependentreviewCOMMENT5606431950https://github.com/Erasmus-CTM/pyodide-interaktiv/pull/6#pullrequestreview-5606431950. Source11cases+mutant+4statusstates approved. Conservativeautosavestatus staysSavableuntilack/restore; nofalseSaved. Combinedrealbrowsergatepending.
- progress_quizzes nowownsnew REALrenderedmixedstoreintegrationfixture+3engineworkflow onassessmentPR28, newintegration/storepaths, boundedactualcomponentfields/matrix/variants/py/Pyodide/reset/saveoff/twotabtests, norestorePythonCheck. Maynarrowlyexportcanonicalservehelper/guardCLI ratherthanduplicateHTTPserver. Preserve rootpins/docs; includechangelogwording'Copycontrolsremainavailablewhensavingisoff'. Independentreview_typeswillreview. No featurechanges.
- Course16a99 independentSOURCEAPPROVALcomplete: all37changedpaths/all441constructs/exact190titles/448fences/440labels/25blankboundaries/CSS/config/caller reviewed;9mutationsallrejected. Nativeactual28pages1713intended0unexplained0Quarto warningsgreen. Currentbrowserrun39675715982 has8running4queued atlastcheck; selected6PNGs stillpendingChromium1job119486322306. NOTyetmerge-ready.
- Aliasset32/26 READYFORAC: libs32c7633d8087ce4f30817080858d9edd4b530ab8d3 thenassessment26head54ff136a2d78eef48799e2a004df060c71f3f2ba inonesitting. IndependentAstrareview+7librarychecks+18combinedchecksGREEN, deployintentionallyskipped. Bothheadsrecheckedunchanged/mainbasescurrent/ahead1behind0; PRsdraft=false. Finalreview5606484818. ACnotifiedcommentary; NEVERmergeourselves. WhenACmerges, verifymergetrees/pinreachability, basesyncallaffectedbranches/preserveAPI3+aliasremoval, retest.
- ServerPR27 https://github.com/Erasmus-CTM/ctm-assessment/pull/27 latestc1f509c301e786f7573b8a5c35745570a4d853d1 branchconsolidation/2026-10-step5-server. IndependentAstraSOURCEAPPROVED; actualPython3.12HTTP17/17PASS0fail0skip run39678389398/job119494131130, allprotocol/path/encodingregressionspass. Baselinefullbuildstillpending; source4pathsonly. ActualexamHTTPS/lockdown/capacitydryrunsnotclaimed.
- Assetstablelibs33 https://github.com/Erasmus-CTM/ctm-libs/pull/33 branchconsolidation/2026-10-step5-assets HEAD2ed1a3381bb6b606e3a913905095eadd8aee0988. Onlyassets.json;19schema/path/ownershipchecks+freshdelta AstraPASS. KaTeX0.16.47 matchesproductionfloating@0.16; independentlyofficialreleaseverifiedMay16,2026. Olderdevlock0.16.11wouldnotpreservecurrentruntime; nojumpbreaking0.19. Restapprovedbaselines. Officialarchiveintegrity/buildercompatibilitygatepending.
- Assetsfoundationassessment29 https://github.com/Erasmus-CTM/ctm-assessment/pull/29 branchconsolidation/2026-10-step5-assets latestcf8aa77bfe8a0ed2d84ef494f23202d4adb4c24f. scripts/ctm_assets.py+fixture/officialmetadataCI;19fixtures inclsuccessfulbuild/cachecopy. Crossdrive/specialfile/licenceconsentbypassfixespublished, Astrareview_typeschecking. Previousmetadatafixturejob119495720652passed. NOguessedofficiallockhashes; officialcollectorreportUNVERIFIEDuntilreviewedknownreleaseintegrities. Hooks/scanner/populatedlock/buildinstallerinprogress.
- APIworker migration createdlibsbranchconsolidation/2026-10-step5-assets-api FROM2ed1, separatefromtablebranch. OwnCTMAssetsLua/JS/settings/MathJax/sharedruntime URLs +assessmenthookprivateprovenancemarker onseparateassessmentAPIbranch; componentcalls later. ContractCTM_ASSETS{v:1,mode,bases}; JSabsoluteurls/document.baseURI; Luapageoffset; lazyCDNtableconsumerregistration. Manifest{v:1,versions:{logical:version},files:{relativepath:sha256}}. Builder/coreownsPythonASTauthorimportscanner; APIworkerexplicitpyodide.packages/subsetchecks. FULLlockcacheonly; noforkedimportparser. MarkeroverwrittenperMeta, recordonlyhook-filledkeys soauthorscannotspoof. NoJSXGraphforkedits.
- All7activeslotsused: root; coreassetsbuilder; migrationAPI/coursewatch; progressmixedintegration; offline_browserchecker; Astrareview_typesassets/adapters/integration; Astrareview_step4APIthenofflinechecker. ci_resumecompletedB6/serverandpausedforreviewwindow, resumeoncemonitoractualcombinedrenderdiffsavailable. Allengineering6.1Solmedium/high; allreviewsAstraxhigh.
- Allnewworkthroughconnector; user explicitlyrequestedallavailablesubagents. No localhost waits or handoffpackages. Continue nonSTACKfirst.

- APIassessmenthookcheckpoint89d7e5fbcbea4982f471d750bd6b3ce0048cd204 onassets-api branch, ONLYhookblobe6057b87c0c202450e4a2d0564ae778113b22f38; privateprovenancemarker fresh/onlyfilledkeys. Corewillcomposesingleblobintoassetsbuilderbranch, separateowners/refs.
- AssetsfoundationAstrareviewinprogress atlatestcf8; earliercrossdrive/licence/specialentriesfindingsfixesawaitindependentclosure. DoNOTclaimpopulatedofficiallock/fullinstaller/realofflinecoursedelivered.
- ComparatorlaneOWNEDci_resume(pausedforAstrareviewslot): noeditsyet; latestPR28b045comparisonrun39679120253/matrix119497110217successbutfivecomparisonsqueuedatlastcheck. Existingstep4.ymlonlyctm-nav, B1newstoreUI needsNARROWruleswhenactualdiffproven; sourcegradercontextmayneedexactgeneratedbarsexclusion, neverbroadDOM/textallowlist. Resumeengineeronceevidenceavailable. progressownsnewmixedfixtures/compare-browserserveexport; usefreshheadleases.

- APIlibs34 https://github.com/Erasmus-CTM/ctm-libs/pull/34 latestf7782b393130c7f23104a375905dcb5f793b09c7 stackedtable2ed1, separateassets-apibranch. 8initialpaths+2workerfollowup: URLs/manifest/preflight/MJ3/settings/runtime/workerlocalabsolutePyodidebase andexplicitpackagesviaPyodidesubset/loadPackage, neverlocalPyPI. JSsyntaxchecked; actualCIpending. Independentreview_step4reviewingnow. BASEAPI2vsB1API3needsuniononlaterbasesync, preserveallkeys/modules.
- Offlinecheckerassessment30 https://github.com/Erasmus-CTM/ctm-assessment/pull/30 headc5d2067dbeba3704022772a2023000237116d37a branchconsolidation/2026-10-step5-offline-checks;7NEWpaths, canonicalfullChromium/reveal/geometrychecker+syntheticcontracts/actualJSXGraphMODELcontrols/read-onlyCIserver27checkout. ExplicitlyNOTforkPR2proof; actualCIqueued; Astrareview_step4next. Readinessunclaimed.
- PR28b045metadatafix ONLYpackage.json/package-lockroot+packages[''].version0.13.0, dependencylockunchanged; independentlyreviewed. Earlierd705build94Pythontestsfailed2+1err solelyversionmismatch, fixedrerunpending. Otherproductionpinsunchanged.

Implementationclarificationafterindependentreview21Oct:
- B3rawblocksourcehashmissedproject-levelglobalforbiddenrules. OptionalACquestionreturnednoanswer; coordinatorproceededrecommendednarrowfixundercontinue/bestjudgmentinstruction, NOTexplicitACapproval. DesignhandoffamendedtoincludeNORMALIZED effectivecorrectnessrules suppliedoutsideblock; pymergedforbiddenimports/keywords only, presentation/lang/feedback/submission/timingexcluded. Savedanswersretained, oldscoresoutdated. Mathnonpoolhasnoexternalgradingrulesandrawblockunchanged; variantsemanticfixrequired. Assessment28carriesdocclarification.
- NextnonSTACKorder: finishcourse/alias/B1-B7, offline/exam, sharedquestiontests/variants/sharedcheckerneeds/H1/languages/steps6-8. Majorctm-checkerschangesneededbyothercomponentsremaininscope. JSXGraphPR2review/contact/forkchangesownedAC/Claude; onlyrepinupstreamwhenACsaysmerged.
- ApprovedStep5lastACdecisionsoverrideearlierparagraphs: examfixedsetnumpy/scipy/sympy/matplotlib/networkx+dependencies+stdlibextras; examrenderstopsifneedsanythingelse. HTTPS+trustedcertificate+headersrequired; HTTPonlydegraded. AIoff, autosaveon, separateexamstoragekey/outputdir, copytextfirst/downloadsecondary. FullPyodidelockCACHEONLY, no publish; nocopiedPythonimportparser. Allthird-partyintegrities/licencesverified; nounguessedhashes.

DeferredSTACK:
- ExistingcheckerPR10/11/12/13 andstack-sympy28stillunmerged; findingspostedon13/28. NativeevidencemustcoverchangedgradingrowsBOTHSTACK4.13.1(10d3233)/4.14.0(3338304), existingCIincomplete. LowestTermsunchanged; acceptedhyperbolicdeferral/options/scores/messagesremain.
- Nativecollectorcheckpointcheckerbranchcodex/2026-10-stack-review-checkpoint6bf69f391a8f6afd831cc4afa8d3e3fb19a1b06f (6unit+compilePASS;PHP/Maxima/AstraUNRUN;workflowdisabled). Expectationscheckpointstackbranchcodex/2026-10-stack-expectations-checkpointbaaf82e394330f413fa907545d610f8c3783a7e8 (136diff/12mutantsPASS;CI/rereviewpending).
- FacFormfixNOTremotesaved: ONLYlocalreview-resume-facform/publish-files.json baseline75284f7contains3modifiedfiles; newtests/mutations/goldensUNRUN. Recoverlater/reconstruct. Same-repoliteralbaseancestryafterACmergesrequiresupdatelaterbranches/pins/retest.

Update/reconcilecheckpointaftersubstantialcommits. Nevermerge/force-push/tag. Nevercallreadybeforeexact-headcombinedCI+independentreview+finalhead/basechecks. ACmergesinreportedorder.

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
