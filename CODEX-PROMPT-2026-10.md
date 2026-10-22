You are continuing the CTM Assessment consolidation for Andrey Chesnokov (AC).

Repositories: Erasmus-CTM/{ctm-assessment,ctm-libs,ctm-checkers,math-exercise,py-exercise,pyodide-interaktiv,stack-sympy}; aacchhee/{ctm-demo,ingmat3a_ntnu,jsxgraph-quarto}. Pyodide's working base is feature/shared-feedback-integration.

AC'S UPDATED PRIORITY (21 October 2026; binding)
- Keep substantial work committed on non-main branches through the GitHub connector and update this prompt as work proceeds. AC authorizes writing and opening PRs in all repositories above.
- Accept the connector's author/committer identity. Do not pause over identity differences or prepare handoff packages.
- Finish all remaining non-STACK-sympy work first, then return to smaller STACK issues. Significant ctm-checkers work serving other components remains in scope and must be implemented.
- Use all available workers where independent work permits. Development: GPT-6.1 Sol medium, up to xhigh for difficult work. Every independent review: Astra xhigh; never review one's own code.
- AC alone merges. Never merge PRs, force-push or create tags. Review, exact-head combined CI and final head/base checks precede sending a set to AC.

AUTHORITATIVE CHECKPOINT — 22 October 2026, upload recovery
This replaces the older 21 October progress blocks. Original designs, model rules and handoffs remain binding. The task lists after START HERE describe the original assignment; use the current heads and statuses here.

AC reports Stage1 merged. Verify both merge trees, then synchronize, independently review and run combined CI for Stage2 before returning its ordered links. The upload recovery is complete for all recoverable code. Commit substantial work on its non-main branch, including clearly labelled WIP checkpoints; keep this prompt current. Finish all remaining non-STACK-sympy work first. Significant shared ctm-checkers work that serves other components must be implemented. Use all available workers where independent work permits. AC alone merges; never merge, force-push or tag.

Uploaded code ledger (question-test pair now ready; other listed work remains draft)
| Repository / PR | Current uploaded head | Upload scope |
|---|---|---|
| ctm-libs#31 | 18f03f873695a69503468beed56bf23d6fdb6b05 | explicit remote resets, optional per-entry forget; source reviewed |
| ctm-libs#35 | d0a3752b969acbf4cbd18df060a994721733f507 | six locale messages; source reviewed |
| ctm-checkers#14 | a1637dc95b9e11d8a0c838c801cd53e20997eceb | READY question set, 18/18 checks, independent final review5609256527 |
| math-exercise#28 | d9f1442765f4e1d3b791b788dcc66d5a32603c79 | READY after checker14, 10/10 checks, independent final review5609258605 |
| pyodide-interaktiv#6 | 9f5d06782a3ee2f1e7e0732e853bc7dda9fa3a72 | saved-history invalidation; source reviewed, seven CI checks green |
| ctm-assessment#28 | 842c3221ea189f5ec2979f3456132b727a8a2c1c | fixture source PASS/canaries green; full store pins/combined gates HOLD |
| ctm-assessment#29 | d96f8071969cb45a9dd2f99173e883f8f22c158d | namespace resolver fix, 42 tests/6 Quarto hooks/probe green; rereview pending |
| ctm-checkers#15 | 6bd454d5479954d5c639945c94cf98a7bc6f89fd | recovered neutral variant model WIP, bounded source reviewed |
| ctm-assessment#31 | 54e9e6d2e2fbb8ec0cbd03d98fd0dbe2a440dbf6 | recovered diagnostic WIP, not a cause/fix claim |

STAGE 1 MERGED — 22 October 2026
AC merged assessment#25 and ingmat3a#16 in order. Verified both merge trees equal the exact reviewed heads and both reviewed heads are merge parents:
- assessment#25 reviewed4edd42835a8923ebeac1a44b158add3c2698b75c -> merge/mainc5ac2af961d63cea9cea7d272f0f5135dc1995ae, tree277e76c6f5f34e978be7619c5681123b2122c121.
- ingmat3a#16 revieweda99c8b52ce422e34da1b426909197e545ef9a931 -> merge/main80c3851dd20326c039c0060ae3ada4fc97d1f9b1, tree26d3fec7126e43439e232c2196a6dbbdd8817566.
Stage2 alias set refreshed: assessment26 new7a4b0fad3e57195815964ab6d58797ee25c1a144, treef6d8e6c1243d86fd20b5f8b339651e42583423cb, ordered parents old54ff136 then newmainc5ac2af. Exactly7mainpaths overlaid; original9aliaspaths/pinc763+branchmain/ships-copies unchanged. Independent Astra xhigh SOURCE PASS, review5609161893 at https://github.com/Erasmus-CTM/ctm-assessment/pull/26#pullrequestreview-5609161893. Ahead2/behind0; libs32c763/main45bcb2 unchanged. New combined CI RUNNING: comparisons39720824374,test39720824412,parity39720824375,cells39720824498,loading39720824594. No Stage2 merge clearance until exact gates finish and final heads/base checks pass. PR26 description now explicitly states pending CI; old54ff green run is historical.

MERGE REVIEW QUEUE — Stage 1 merged, Stage 2 in preparation
1. Stage1 course set is MERGED and tree-equality verified above. Do not ask AC to merge assessment25/course16 again.
2. Stage2 next, pending CI: libs#32 @c7633d8087ce4f30817080858d9edd4b530ab8d3 -> assessment#26 @7a4b0fad3e57195815964ab6d58797ee25c1a144. Base synchronization and independent review are complete; exact combined CI is running. Libs32 remains unchanged on main45bcb2.
3. Stage3: synchronize/review/recheck assessment#27 @c1f509c301e786f7573b8a5c35745570a4d853d1 before its turn.
4. Stage4: after server27 merges, synchronize/review/recheck assessment#30 @419ccd741792d7856f28ba4fadf02d5678af4815 before merging. Its bounded checker tooling is independent of unfinished full-offline assets delivery; workflow tests exact server c1f509c. PR30 body reconciled and draft=false, but new main makes its earlier base clearance stale.

These are separate stages, not an uninterrupted six-PR clearance. Every assessment main move triggers the base/pin/copy/combined-CI protocol for later stages. AC uses merge commits only; verify each resulting tree equals its reviewed head tree. No agent merges a PR or main.

Review evidence:
- libs32 direct exact-head Astra review https://github.com/Erasmus-CTM/ctm-libs/pull/32#pullrequestreview-5606252871.
- assessment26 direct exact-head source/correction https://github.com/Erasmus-CTM/ctm-assessment/pull/26#pullrequestreview-5606253946 and final set https://github.com/Erasmus-CTM/ctm-assessment/pull/26#pullrequestreview-5606484818.
- Course25/16, server27 and checker30 independent source approvals are retained in PR descriptions and this handoff checkpoint; their GitHub review lists are empty. Do not describe these as GitHub APPROVED-state submissions. Fresh verification checks readiness, not a new full original-source audit. The original independent source verdicts/coverage and exact tested heads are recorded in the sections below.


All other work remains HOLD: store combined failures/stale pins, assets incomplete integration/overlapping aggregate, question-test pair is separately ready as set Q above, variants model-only WIP, diagnostic not a fix, STACK findings unclosed. A green component build alone is not a mergeable set.

ADDITIONAL READY SET Q — shared question tests
Checker14 @a1637dc95b9e11d8a0c838c801cd53e20997eceb -> math28 @d9f1442765f4e1d3b791b788dcc66d5a32603c79. Both now draft=false; all18/all10 exact-head checks GREEN, behind0 on their unchanged respective mains9e042/f0b063. This pair can be reviewed independently of Stage2's assessment-base refresh.
Independent Astra xhigh final set reviews:
- https://github.com/Erasmus-CTM/ctm-checkers/pull/14#pullrequestreview-5609256527
- https://github.com/Erasmus-CTM/math-exercise/pull/28#pullrequestreview-5609258605
Reviews distinguish previously accepted source audits from fresh canonical six-payload/pin/fixture verification. Native3.9/3.12/3.13 each85source+85actual built-wheel tests; four combined math render jobs each10/10 zero skips including Windows, exact d9/a163. Fresh producer six payload hashes match; synthetic trees equal reviewed heads e7c117c88dd54163b36ed6d38002168ef9dd5c9e/2a0057e619653a96422bf4052abca59b843f1ecd. No review-ref trailers. AC merge commits only, recheck heads/bases before and resulting merge trees after. Do not mark other work ready from this pair.

LATEST PARALLEL REVIEW RESULTS
- Math store27@5c06fd66eb417cb1a8644111f2b3916215e86369 SOURCE PASS,13/13,4 independent mutants: https://github.com/Erasmus-CTM/math-exercise/pull/27#pullrequestreview-5609237020 .
- Py store10 latest94454dc7f79e0ee8dabe114ae1f01e44c699c11c SOURCE PASS,5/5,6 independent mutants: https://github.com/Erasmus-CTM/py-exercise/pull/10#pullrequestreview-5609238359 . Predecessor e285 published a stale counter assertion (4/5); corrected one test line to compare pre-forget count. Source unchanged; author and Astra verified/re-ran exact published blobs. Neither hook has coherent store-set merge clearance.
- Assessment store28 latest842c3221ea189f5ec2979f3456132b727a8a2c1c, parent786: bare tab fixture restored Python-free; packaged-only genuine math cell, exact progress-marker/quiz membership/pane ownership assertions. Independent Astra SOURCE PASS35Node/JSDOM checks incl8extra mutants. Both Quarto1.8.27/release canaries119638388767/119638388680 GREEN; full builds active. Earlier resource-list fix retained. Prior786 review findings are closed. Pins remain old6f5/34116, so real remote-reset set gate remains HOLD.
- Assessment assets29 latestd96f8071969cb45a9dd2f99173e883f8f22c158d, parent317, tree267364e3b253b888811dfe847c7cb690af77bba6: exactly scannerhelper/tests, namespace regular-package/split-portion fix plus PathFinder regressions. Actual42/42 and Quarto hooks6/6 zero skips + bounded probe green in39722158470. Astra rereview underway; facts remain private/v1consumer migration unfinished. No pins/base/libs/facts/probe modifications in this commit.

Environment and recovery
- The project now has a writable Linux workspace. The earlier disconnected Windows filesystem and functions-store drafts did not survive the transition. GitHub refs, Git objects and Actions output are the recovery sources. Do not wait for a desktop app or gh CI process.
- Use GitHub connector identity as supplied. Do not prepare handoff packages. Generated copies/wheels must be recovered from canonical producers or generated by the canonical scripts, never edited by hand.
- Publish with create_tree/create_commit plus update_ref(force:false, expected_sha:fresh head), or update_file using a fresh file SHA. Compose only owned paths; do not replace an older whole tree over parallel work.
- Seven active slots including root. Development Sol 6.1 medium, up to xhigh for difficult cases; every independent review Astra xhigh. A reviewer never reviews its own work.
- Upload is not merge approval. New heads still need independent review, exact-head CI, combined set CI and final head/base checks. Dependency pins use reviewed PR heads, not merge commits; preserve designated main/working branch fields and no review-ref trailers. After AC merges, verify merge-tree equality and refresh later bases/pins.

Merged by AC and verified
- libs#30 reviewed1f7a3a5de7b765d108fe2ca4ec98b36635c6814f -> main45bcb2a51257151f89bbe706142f22abcd1b5a0c.
- assessment#24 reviewedd47ccc5a492d3df0cade62f9bc21beb63511846f -> main3d9ebd94565ca302724dc619092ad9d043c1497f.
- Both merge trees equal reviewed trees. Full parity10541 responses/720 fixtures/34 tests/28 programs, zero differences. Stage1 assessment25/course16 merges are now additionally verified above.

Ready and already reported to AC
- Course order: assessment#25 https://github.com/Erasmus-CTM/ctm-assessment/pull/25 @4edd42835a8923ebeac1a44b158add3c2698b75c, then ingmat3a#16 https://github.com/aacchhee/ingmat3a_ntnu/pull/16 @a99c8b52ce422e34da1b426909197e545ef9a931. Both now merged by AC; reviewed head and merge trees verified equal above. Course15 checks and all12 Chromium/Firefox/WebKit shards GREEN, run39675715982. Native28pages/1713intended/0unexplained/0warnings, convert=false. Independent audit37paths/441constructs,190titles/448fences/440labels and all nonblank prose exact;9negative mutants. Six desktop/390px PNGs verified and reviewed. Existing wide-equation mobile overflow is unchanged; horizontal access not proved. Only course branch consolidation/2026-10-step4-migration may be edited. Base coursea0a34ee508fdd4d00e78e7ea782b00a343fcf682. PR25 scoped followups: --no-renames plus rename regression, reject symlinks. Current converted files are regular.
- Alias order: libs#32 @c7633d8087ce4f30817080858d9edd4b530ab8d3 -> assessment#26 @54ff136a2d78eef48799e2a004df060c71f3f2ba. Branch consolidation/2026-10-step3-alias-removal, both ready. All7 library/18 combined checks green,257tests/three engines, independent review5606484818. Keep ai-feedback configuration namespace, templates forwarder and stale-extension diagnostic. Refresh assessment base after25 lands.
- Server assessment#27 @c1f509c301e786f7573b8a5c35745570a4d853d1, branch consolidation/2026-10-step5-server, ready. Source PASS, Python3.12 realHTTP17/17 zero skips job119494131130/run39678389398, all3checks green (deploy skipped). Functional server acceptance only; exam TLS/lockdown/capacity remain unproved.

PARALLEL NON-STACK PROGRESS — while Stage2 CI runs
- Core libs31@18f03f: all20 exact-head checks now GREEN; independent85-assertion review retained. Still needs alias/base composition, canonical consumer copies and full store set CI.
- Math store27 NEW5c06fd66eb417cb1a8644111f2b3916215e86369 (parentf467, tree289359a22753011d011924488d8d22438f92d4c4) and py store10 NEWe285675af46b1e1fad815efe2f29e86a885fb3b8 (parentab1, treeea7543ed516cab29c6c6df9a772786276bdecd41): each exactly source+existing tests, tiny history-forget helpers preserve live input/output/feedback. Actual math13/13, py5/5 focused tests and3 behavior mutants pass; Astra review underway, no pins/assets/copies changed.
- Assessment store28 NEW786e41dca81f0b36bd57f2e7493f4432ae632162 (parent9ca1, tree80900d64659e12b6663534d2d975dc6f3a8c5eec): exactly tests/delivery.test.cjs and tests/tab-ids/index.qmd. Expected delivery list now exactly37 assets; existing quiz m1-2 now includes a labelled standard math exercise, preserving ownership/id assertions. Actual source calibration and JS parse pass; local Quarto unavailable. New Astra review/CI pending.
- Prior9ca1 combined failures were precise: all3browser remote-reset failures use stale libs6f5/B634116, not new18f/9f5 fixes; record:null/events delivered but live input retained. Package build had2 fixture failures fixed above; no product validator waived.
- RO diagnostic54e9 actual4Node tests passed, but WebKit run119626920050 still fails against stale290 artifact. Quota exceptions trace to its old all-storage stub; WebKit RO loops remain unfiltered. Some snapshots precede Monaco observers and show Quarto BODY observer constructed in quarto.js; candidate for controlled isolation, NOT proved root cause.
- Question set: math28@d9 all10 checks GREEN including four Linux/Windows renders. Checker14@a163 latest15/18 green,3 ordinary Python mutation jobs running with no failure and within observed completion durations; still HOLD.
- Assets29@317 independently reviewed: 40/40 exact-blob tests pass, but namespace resolution remains a SOURCE BLOCKER. An earlier namespace-only directory hides a later regular package or split-namespace helper and can miss an unshipped dependency. Author preparing a bounded resolver fix and regressions; no approval/full-offline claim.
- Actual Pyodide0.28.3 core-runtime availability report independently verified from BOTH39718729518/job119629805328 and39718724465/job119629250965: 8486bytes, Gitblobd39648fe523a5f2519b8070d77c34bcf44a06414, SHA256dd9327e9be5bb2b4fb06afd905077fd72de39e345c7ec67f76a87ff4033afe28, 247importable/49unavailable. All290genericcandidates accounted;7runtime hashes match verified officialarchive. Cache-only evidence in .private-evidence/assets-probe-317a120. Availability is bounded import evidence, not module functionality/browser/full-offline proof. Current consumer accepts schema v1, reportv2; consumer/release/provenance migration must be separately reviewed before replacing generic facts. Do not publish full-lock/archive evidence.

Shared store B1–B7: published, HOLD
All use consolidation/2026-10-step4-store; eventual order libs31 -> math27 -> py10 -> Pyodide6 -> assessment28 after fixes, canonical sync, base refresh and combined gates.
- libs#31 reviewed reset-only checkpoint dcf81c7492293a0a93e9a8167be721cf86f4eb5d, parent6f5cfa7d189db238aad5a3784e76ec426c980dc7, tree9064adc4e22642cb6562d3b4e0b28284782f19bb. Newly uploaded reviewed reset-only fix: explicit remote page/course/exercise resets invoke the matched adapter clear; device opt-out/raw removal/legacy commands preserve live inputs. Boolean reset===true discriminant. EXACT2paths ctm-store.js and tests/store-core.test.cjs, blobsbc1a3c207e1e33db746f41752cb0931abe10af6c/b0a00c7efbdd96b9c9b5d6582d7b01a9a9d009c1. Actual recovered-source Node69 contract assertions pass0skip; independent reset review previously PASS. New exact CI pending.
- Prior6f5 source/20checks green,287/287 zero skips. It removes exactly3 private CodeBlock attrs after ui.finalize, fixing50 ordinary-root leaks without widening comparator allowances. API3/settings/progress/export preserved.
- Optional register({forget}) reconstruction NOW published: libs#31 latest18f03f873695a69503468beed56bf23d6fdb6b05, parentdcf81, tree55c4bf63ad396e5236541b5380505d045322b044. Exactly2paths core/tests, actual85assertions(69+16) pass0skip, baseline/missingcallback/missingcancel mutants killed. No-arg matched-entry callback after timer/history/mirror invalidation and before optional explicit clear. Local/remote reset, off, raw deletion/storage.clear and matching external overwrite invalidate cached history while preserving live input/output and didRestore. This is a contract-faithful reconstruction, not byte-identical old draft. Independent Astra SOURCE PASS with85assertions and five killed mutants (baseline,missingcallback,missingcancel,stalehistory,unscopedoverwrite); exact CI and combined gates pending. Alleged old blobs244f8a/385e42 returned404.
- math#27 f467f0459d44dcf8c0870798e67ed9ed4f39cad4, py#10 ab1fad5be6659453ab55e14c19135254e62fa5da retain old reviewed6f5 pins, prior exact checks green. Their tiny history-offer hooks have now been reconstructed and published at5c06/e285 as recorded above; new review/combined gates remain. Math remove only .math-saved-answer/.math-saved-result; py remove savedOffer/.py-exercise-saved-result, preserve live UI. Recover/reimplement with focused tests after core contract.
- Pyodide#6 NEW9f5d06782a3ee2f1e7e0732e853bc7dda9fa3a72, parent3411605e09451c4c6fa0a6a1189c3a41934948e9, treec428ceaebf8fe33e7ce756fccd1ec38319e34c57. EXACT2paths qpyodide-storage.js + tests/store-adapter.test.cjs recovered from author's prior source, native16/16 zero skips. Fixes restore-clear-before-Monaco recreation and stale Saved status after device-off; optional forget integration awaits core/canonical copy. Independent Astra source PASS plus independent16/16 rerun; all7 exact-head checks now GREEN. New-core canonical copy and combined gates remain pending. Generated copies untouched in this commit.
- Pyodide working base feature/shared-feedback-integration29c2526069f65434c35df6ef09a13b263e06166a. Prior341160 canonical6f5 record+2Lua files independently all44 mappings/modes exact, no extras, generated target deleted same commit; prior tests90/90. Generate new library copies by sync-ctm-libs.py after final core source; never hand edit.
- assessment#28 NEW9ca1fe998cf05a2d639bd8e0c98b08956237e862, parent290821648f40306c968279bb850508c09e8f2c60, tree26b7948962e4b1f76e2c1d3d244f0f79dee1daca. EXACT3 owned integration/store/{browser.mjs,instrument.mjs,instrument.test.mjs}; byte-for-byte recovered approved draft. Scope quota denial to CTM ctm|1| keys, preserving Quarto writes/native receiver/return; wait on actual clear event+empty input and retain detailed failure evidence. Actual Node8/8 plus syntax pass. Pins remain6f5/f467/ab1/341160; refresh after completed component/canonical fixes.
- Prior290 exact combined comparisons39686767398 PASS allcourses/three engines: examples133/demo1112/site+review/ingmat4219/fixture178 intended,0unexplained; eachbrowser67normal+14firstvisit pass. Parity39686767272 PASS10541/720/34/28 zero diffs. Cells39686767551 PASS bothingmat24pages/320cells/0unstable/0unexplained, demo/examplesgreen. Mixed-store39686767608 FAILED all3 engines at real Remote clear did not reset store-scalar; fix above is now published but pins still old. Never filter errors or claim combined green.
- Retain reviewed comparator sixpaths (checkpoint6aa9bdffe7e8c01bb6bf388d98f1a6d16b5235ad) and mixed integration12paths (3d8e5e18a4bcf9fa9dbabc6be4bd21f96c91c906). Composition758735 and290 source PASS, version0.13.0. Metadata-onlyswap133unexpected mutant rejected. Do not replace reusable workflow from25 when syncing.
- WebKit ResizeObserver errors remain unattributed. Recovered diagnostic NOW published assessment#31 https://github.com/Erasmus-CTM/ctm-assessment/pull/31 @54e9e6d2e2fbb8ec0cbd03d98fd0dbe2a440dbf6, NEW consolidation/2026-10-store-resize-diagnostic branch, parent2908216, tree6b543378eeecaa4596d0c1097ec21762da31e3a1. Exactly4 paths integration/store/{resize-diagnostic.mjs,resize-diagnostic.test.mjs,browser.mjs} and .github/workflows/store-resize-diagnostic.yml, byte/Gitblob equality with old draft64850d/cafa5a/ca71be/b80794 verified. Actual Node4/4 and syntax PASS. Records constructor stacks/delivered IDs+rects, no extra layout reads/mutations/error filters. WIP: independent review and actual WebKit rerun pending, base now9ca1 while source intentionally uses old290 browser boundaries. Do not merge as a fix or suppress errors. Historical main39618852909 error is not causal proof.

Shared declarative question tests: canonical payload NOW uploaded
- checker#14 https://github.com/Erasmus-CTM/ctm-checkers/pull/14 branch consolidation/2026-10-question-tests latest a1637dc95b9e11d8a0c838c801cd53e20997eceb, parent reviewedsource9b8979b40f5f1c2569a2b974dd4f3de333ea41d9. Source PASS. Producer39686283010 Python3.9/3.12/3.13 each85source+85actual both-wheel tests0skip, tools/build.py + --check green.
- All6 CTM_GENERATED records recovered from3.12 job119521532195 and verified length/SHA256/Gitblob by independent Python recovery and prior root+Astra checks. Published _extension.yml blob994b762ca45235433ed826d381a28b486809bcd0, checkers.json3c3aff7f657bd0742b61e039b3572f3644d5ae15, stackJSc3195627d0d41a3cfbc15055c39634cd4aed6518, baseJS3f454d8bace72bb2b79428c37c7f35242eb0f2ab, basewheel efe24271da0a4cd614fe4ca01994013598d7226a, stackwheel326370ad51f101629026e75ae592db80ab8ef74c. Exactly two old0.6.0 wheels removed. Version0.6.1.dev0/API1, dev dependency hashes wheelbytes not GitHEAD. Generated-source/script/payload verification preserved.
- Math#28 https://github.com/Erasmus-CTM/math-exercise/pull/28 latestd9f1442765f4e1d3b791b788dcc66d5a32603c79, tree2a0057e619653a96422bf4052abca59b843f1ecd. Pin checkpoint83682009d1528064fbeb337a70b6443041e53dd6, parente5bf77d5a5383a75a0609a54b9c3a6d19110af51, changes ONLY .github/pins.json to a1637dc. Subsequent6c5c865/d9f1442 net EXACT2testfiles correct malformed YAML/Windows fixture assumptions, no product/checker/pin change. Prior5path authored Lua/tests/docs/Linux+Windows workflow source PASS. Independent Astra composition/payload/pin review PASS; actual Linux/Windows render gates pending.
- Fresh checker workflows39718134832/39718134907/39718134937/39718134840 and math39718211601/39718211579/39718211561/39718211571/39718211629 were started; most checks still queued/running at upload checkpoint. Math Windows job119625327831 FAILED7 fixture tests: unquoted raw(\"3,2,1\") in YAML flow array is parsed as3answers; shim fixtures assume POSIX paths/LF. Narrow2test-file correction NOW published atd9f1442: JSON.stringify single answer expression, effective quoted numeric mutation plus explicit source-changed assertion; normalize only CRLF in shim capture, assert exact native missing-wheel path/messages. Actual PyYAML old3/new1 and actual helper/mutation proof PASS; JS syntax PASS. Full local shim only2/6 pass, remaining4 fail because local SymPy is absent, so do not claim a full native pass. Final independent Astra SOURCE PASS: exact two-file delta, actual YAML/helper/mutation proof independently repeated; no production/checker/pin edits. Keep gate red until exact corrected-head Linux/Windows runs pass. Upload does not imply ready. No grader/golden/STACK engine changes.

Assets/offline: partial, no full delivery claim
- libs#33 table2ed1a3381bb6b606e3a913905095eadd8aee0988, onlyassets.json; libs#34 APIc44cd395ce56216f8ee01017af6234c8d7f48a66 all20checks/270tests green. Production17112 source PASS.
- libs#35 union latest d0a3752b969acbf4cbd18df060a994721733f507, parent0328e9adf6aa92a29e23088489f947b0ba62ed0c. NEW exact1path _extensions/ctm-libs/locales/py-exercise.js, +6 editorUnavailableLocal/pythonUnavailableLocal messages in en/de/nb; actual6 V8 lookups and all old messages/languages unchanged. nn fallback remains nb. Independent Astra exact locale delta PASS; new CI pending. Prior0328 union source PASS/all20checks GREEN296/296 zero skips. Preserves API3, settings/manual UI loop/store/export/endcleanup. Finished31/34 not rewritten.
- assessment#29 assets branch consolidation/2026-10-step5-assets NEW317a120ccc7d2745d821cabffe6e5d6a2a76776a, parentaedf8eaa8191b6c2940a0c7aa1d6c86e55be96c7, tree422becbdfbd129bcf4c611828da37d46fa9f50b8. EXACT5 recovered paths: author-imports.py, scripts/ctm_assets.py, scripts/probe-pyodide-stdlib.mjs, .github/workflows/assets.yml, tests/test_ctm_assets.py. Native Python3.12.14 all40/40 PASS0skip, pycompile/Node syntax PASS. Scanner/probe blobs match pre-reset hashes; other3 recovered from exact authored construction calls/counts. Prior aedf all4workflows/36Python+6realQuarto green; new exact CI/review pending. Canonical scripts/ctm_assets.py, sole packaged author-imports.py, reused AST scanner, collector __ctmAuthorImports.add{source,packages,origin}, local-only endfilter JSONstdin, private cache-only index. Safe atomic staging/rollback/licence consent/official HTTPS443 redirect allowlist previously bounded source approved.
- Recovered scanner fixes address cross-fragment importlib aliases, recursive local-helper deps with cycle/origin, Windows explicit UTF8stdin/out, plus verified runtime/probe preparation. Target Pyodide stdlib availability remains a HOLD: generic assets-stdlib facts are unchanged until actual official release probe output is reviewed and replaces them. Probe execution/release facts/source review/full offline acceptance remain pending. Do not call40nativefixtures official release evidence.
- Official metadata4030bytes blobab32ecaae94838d695de0011d250da069f3e5342 committed45dddcec5f8f2e87e5924465a24354b8e96214ad; archive1,142,693bytes/381chunks blob495b5958ac8117adb4ba7f651c45ac3dec927512 reports in jobs119510515691/773. FullPyodide lock CACHE ONLY, no published1MB report. Default28package closure36.66MB, official hashes/licences; not yet full populated installer/offline acceptance.
- Math assets#29 latest5b13dc4b1c4f002ddc2bf029a1ae9e73529663fc: fresh independent Astra finaldelta SOURCE PASS, all7exactchecksGREEN,165pass/0fail/1expected legacy-capabilityskip. Early used-math assets guard precedes settings read without weakening canonical policy; strict registration regex extended. Union0328 pinned. Combinedassets/offline still separate.
- Py assets#11 d079c4223a6cafa30933414bc81388fdb84317d7 and B6 assets#7 1194a76b75b2aeacf37c18eec1b58eec9dd2c3c2 remain WIP, not source-approved. Prepared B5pyFiles5paths/B5cellFiles4paths did not survive stores. Recover/reimplement known fixes with fresh tests: missing assets diagnostic before Meta (B6 names umbrella+standalone reinstall), local missingcollector failclosed, eval:false exclude B6 fragments, index URL selection only at load/Meta, local server messages, legacy6f5 workflow. Canonical B6 union copies require generation, no manual edits.
- Offline checker assessment#30 @419ccd741792d7856f28ba4fadf02d5678af4815 is now draft=false, bounded tooling READY at the current base: all12checks passed/deploy skipped, fresh independent Astra readiness verification. Source+exact bounded ChromiumCI PASS17/17 run39687271868/job119524411770. Dynamic append/remove/reassign5each refused, copiedprefix/prependedauthor5refused, opaque earlyfetch/XHR/data/image caught, localpositive5loads20boardchecks. Model alwaysblank5/5/plainhidden20/20blank/refresh0/5blank. This is checker-contract and mechanism MODEL proof, NOT course/full offline or upstreamforkPR2 proof.
- AC/Claude own JSXGraph fork/upstream PR2; no fork edits. Re-pin only after AC says upstream merged. Floating board/font candidates are not pins; exact versions still a gate. Font base is package root with trailing slash.

Variants and H1
- Full approved variants design/review/ACdecisions1–19 read. Architecture independently approved: authoring/ctm_variants/{values,math,model,manifest,cli}.py outside browser wheel; tiny src/ctm_checkers/variants.py exact-value codec; neutral model/manifest no Math/STACK imports, only adapters. Reuse testing.expression/run_question, bounded generation/materialization, stable id/hash (not index), default25, preview banner, real tests allmodes, plain pools stable+seen/Newvariant now.
- Neutral model WIP NOW published checker#15 https://github.com/Erasmus-CTM/ctm-checkers/pull/15 @6bd454d5479954d5c639945c94cf98a7bc6f89fd, tree07b21137a154a465e25d487d38fa0e985ce62cd3, NEW consolidation/2026-10-variants branch from9b8979. Exactly5paths authoring/ctm_variants/{__init__.py,model.py},tests/test_variants_model.py,docs/variants-implementation.md,.github/workflows/variants.yml. Recovered author source, actual Python3.12 14/14 pass. Draft bases question-tests to isolate scope; canonical payload/base synchronization is HOLD after that branch advanced toa1637dc. Known STACK reconciliation gap and generation/runtime/approval remain unfinished; CLI/adapter/UI not implemented. Independent bounded model SOURCE PASS: Astra independently ran14tests plus1458classification scenarios; native3.9/3.12 exactCI green,3.13 pending. No whole-variants approval.
- H1 remains read-only plan, NO production code. OptionB already approved (step2§13), mathdict+valid:false -> invalid/no score and variants custom context keys approved. First implement shared core/custom.py executor + semantics-preserving Math adapter after published question/variant seam, then later STACK adapters. Shared core imports neither Math nor STACK. Proposed default weight1 finite>=0,total>0 alignPRT; document/test for AC review, do not re-ask approved syntax decisions.
- Reuse one worker-owned customrequest enrichment: answers/teacher(default labels)/exactvariables/variant{n,id,hash}; preserve component Symbol maps/assumptions. Directscript wrapper outside sibling math.py package, foreigncwd/PYTHONPATH shadow regressions. Required unchanged Mathgoldens, legacy/native3.9/12/13, both actual wheels/Pyodide0.27.2+0.28.3, crosscomponent typed-context equivalence and full10541parity. Languages/steps6–8 follow nonSTACK shared work.

Deferred STACK: do not resume small fixes first
- checkerPR10 f5e5a8a42b18e736faeacafb87b73249575ca27c;11 10ce3234170d3303de1d07ea2543f1db1c31a29c;12 0d5cb2a1d7afacb172331cbb13c47ca4ca474928;13 75284f76612f756e204306ddc91b71d47d8925ce; stack28 bcbb8d156d7e2aeba25f53db90105a4a942cbdbc.
- Independent findings5605386736/5605390572: FacForm authorerror masked, broadexpectationwaiver, actual changed rows need BOTH native4.13.1(10d3233)/4.14.0(3338304). LowestTerms unchanged/discuss first.
- Durable collector checker codex/2026-10-stack-review-checkpoint6bf69f391a8f6afd831cc4afa8d3e3fb19a1b06f (6unit+compile only; PHP/Maxima/Astra unrun, workflowdisabled), expectations stack codex/2026-10-stack-expectations-checkpointbaaf82e394330f413fa907545d610f8c3783a7e8 (136diff/12mutants, CI/review pending). FacForm oldlocal WIP may be lost, not remotely saved. Public text describes only our engine.

Approved exam decisions
numpy/scipy/sympy/matplotlib/networkx plus dependencies/stdlib extras. Exam render STOPS on any additional required package. HTTPS/trusted cert/headers required; HTTP degraded only. ai-feedback.enabled:false, autosave on, separate exam storage/output, text-first copy. Full lock cache-only. AC handles NTNU realexam questions.

Next actions
1. Upload recovery is complete for every recoverable source draft; nine draft PR branches are listed in the ledger. Py/B6 component-assets maps did not survive and remain reconstruction work. Tiny math/py history-forget hooks have since been reconstructed and published as recorded above. Do not claim these lost drafts were published.
2. Independently review new canonical checker/mathpin/B6/locale and reconstructed forget source; watch exact CI. Then canonical library sync, component forget hooks and reviewed dependency repins before mixed-store rerun.
3. Scanner/probe and neutral variant model WIP are now recovered and published. Finish their explicit remaining design/release/runtime gates with fresh review/testing during nonSTACK development; reconstruct the recorded lost component drafts separately.
4. Finish assets lock/import/installer/realoffline and variants/H1/languages/steps6–8. Keep substantial code committed. AC alone merges the already-ready sets, after rechecking current heads/bases.

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
