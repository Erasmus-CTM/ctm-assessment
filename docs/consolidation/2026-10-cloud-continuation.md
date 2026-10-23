# Cloud continuation — 23 October 2026

## Latest first-visit investigation and CI checkpoint

The active request is to continue until draft gates are green and mergeable;
this checkpoint is not completion or merge clearance. AC alone merges. No
merges, deployments, tags or protected course writes occurred.

Actual artifact-only first-start CI ran on demo20 at
`3b1df1b0da1606a2df8e220dfb20bf1b9a1b22bd`:
[run40011470907](https://github.com/aacchhee/ctm-demo/actions/runs/40011470907).
The workflow renders only step4-ui, preserves the original data frames, uses
real CDN assets, Monaco, Pyodide, grading and JSXGraph, and retains every raw
failure. This is separate from earlier substituted/stubbed proof. Its source
tuple is committed in `.github/first-start-refs.json` on that exact demo head.

Firefox baseline passed: real IDE result42, real board, speech and braille,
controlled reload, isolation/shared memory, zero raw error arrays and every
observed request terminal. Chromium and WebKit reached those functional checks
but failed strict raw-error acceptance. WebKit started Monaco workerMain after
the editor construction barrier; COI reload cancelled that request and produced
Load failed. Chromium recorded a Monaco request failure and a Matplotlib range
abort. These are retained failures, not harmless-reload waivers. Input/Stop
interaction and course-wide acceptance are not claimed.

A bounded real CDN probe explains the Matplotlib defect: browser-negotiated
Brotli ranges address compressed bytes, while fetch returns decoded body bytes.
The first524288-byte encoded range yielded524284 decoded bytes; advancing by
that count requests the wrong next compressed range and eventually aborts the
decoder. Identity encoding returned the full524288-byte ZIP range. Production
fixes are in progress: retain range prefetch for identity representations and
use hash-verified whole downloads for compressed representations. Do not
disable integrity checks or filter failed requests.

Monaco0.46 publicly accepts Promise<Worker> from MonacoEnvironment.getWorker.
The focused proposed correction gates lazy worker construction on the existing
qpyodideCoiSettled promise while allowing editor construction to finish. Gating
editor construction itself would deadlock reload against initial-UI readiness.
Custom worker factories/URLs and default AMD bootstrap must remain intact.
Implementation and fresh browser proof are still pending at this checkpoint.

All six missing-JSXGraph/missing-speech controls showed real Python and ordinary
math success in their failure snapshots, but timed out waiting for a harness
result event: CTMStore dispatches on document, while the harness listened on
window. The local focused correction listens on document; syntax passes. It
has not yet been published or rerun. Do not call these six controls passed yet.

Current source CI: libs42/59f52e8 and43/be9e755, checker25/5976f1a,
math31/97a7dc5 and assessment56/2bbb293 are green on their scoped workflows.
Math32/6216153 has four green workflows; only parity remains red. Its actual
full run has1633 responses,115 variants,38 authored cases and267 differences:
262 cases from the intentionally retired legacy generated page plus five new
native-authored cases failing the render-side PyYAML boundary. There are no
ordinary grading differences or harness timeouts. A read-only canonical native
context/options sidecar and exact legacy migration accounting are in progress;
the five cases must still be graded by real Pyodide, not skipped or waived.
Template1 now has a green focused public-source installation/CLI workflow.
No draft is declared ready solely from these statuses.

Work continues from checkpoint `28f4dcb12dbbe5df92b69a5746ce14618c685211`.
This is an incremental checkpoint, not release or merge clearance. AC alone
merges. No main writes, tags, deployments or ingmat3a rollout occurred.

## Fresh remote verification

libs41, py12, pyo10 and assessment55 are merged into their recorded feature
bases (a6161c3, 2096710, a509540, 2c288f6 respectively). Their parent routes
remain draft/unmerged. Pyo6 still targets feature/shared-feedback-integration.
Demo19 is aacchhee/ctm-demo, draft at5bd385fb, not an Erasmus-CTM repository.
All five saved WIP heads initially matched the restart table, still draft.

## Focused loading fixes and verification

- libs42 `19b511631d58c2e8edb547643860a4f6739ef297`: explicit local required
  stage1 packages now verify actual installation before readiness. Silent
  loadPackage failure rejects; plugins/background cannot turn it into success.
  Forty focused contracts passed, zero skipped, and independent source review.
- py13 `18e6f1eb00713fdefbfc3d040c6a05eb88c6c314`: failed AMD/editor construction
  displays a local explanation and disables only that editor controls. Deferred
  script initialization checks readyState. Twenty-eight runtime contracts pass,
  including slow late-AMD actual editor proof; independent review cleared source.
- math31 `6b6e4d35455a69da5fffad5b0b266257682494fa`: saved production fallback
  verified, regression added. Fifteen store and one shared contract pass.
  Chromium renderer-failure control proves handler/UI containment using actual
  component code but mocked grader/store; it is not real Python grading proof.
- pyo11 `0617c97051f51cb66cdb3b92d83e9e32af1e2bde`: canonical sync from libs19b,
  all source/target/asset guard records agree.32 UI/COI/readiness contracts,
  three generated-library contracts, Quarto runtime order in eight modes pass.
  Actual separate ES modules in Chromium prove initial editor registration,
  late-editor exclusion and AMD rejection. Monaco/AMD were stubbed in that
  narrow module test; no full first-visit acceptance is inferred.

These commits were published through the connector with expected-head leases,
verified tree identity and Andrey Chesnokov author. All PRs remain draft/HOLD.
No count above is added to earlier-stage counts.

The canonical umbrella installer at87c built one-page ctm-demo step4-ui with
clean snapshots of those four heads, original checker a1637dc and upstream
JSXGraph e4ad81d. Quarto1.8.27 render succeeded. No blanket repinning, generated
runtime hand edits, activation/main change or full-course render occurred.

## Browser boundary

First setup attempt hit browser proxy403 on localhost before exercising CTM.
Supported browser proxy bypass was corrected to
`<-loopback>,localhost,127.0.0.1`. Installed Chromium154 still rejects the proxy
CA for CDN requests. Workspace-only NSS and supported headful certificate UI
attempts did not import trust; TLS verification and HOME stayed untouched.
Firefox/WebKit downloads were denied by destination policy. These are environment
limits, not evidence that the source fixes pass or fail their product contract.
The corrected-local-proxy final-tuple Chromium diagnostic also FAILED:
functionalPassed=false, rawPassed=false, no isolated/fallback baseline, nine
failed requests and13 console errors; require-is-not-defined is retained as one
uncaught page/window/web error observation of the blocked Monaco loader (these
channels overlap, not three distinct exceptions). All observed HTTP request
lifecycles terminated in this failed environment run. That does not settle
unknown request lifecycles from earlier product runs. CDN certification errors,
Google-font tunnel denial and the raw local favicon404 remain in the report;
none are suppressed or waived.

No raw-clean static first-visit result exists. Real-engine missing JSXGraph and
speech negative controls remain outstanding; a prepared harness is not a pass.
Older Matplotlib abort and unknown old-client request completions remain open.
The earlier headered acceptance describes its old exact tuple only.

## Loading map corrections and retained limits

The saved loading lifecycle/audit remain authoritative with the focused source
updates above. Required local stage1 package verification is now implemented.
UI readiness stays independent of Python and Maxima. JSXGraph/speech failures
must remain local to enhancements or questions requiring that response source;
parent MathJax readiness does not establish opaque child speech completion.
The canvas interactive plot upgrade uses a separate main-thread Python and is
not awaited by worker readiness or authored startup-done; PNG fallback remains.
There is still no end-to-end bootstrap/lock/install/background deadline. Range
stall bounds and idle admission limits do not establish cancellation. No broad
runtime timeout redesign or offline acceptance is claimed.

## Variants authoring source checkpoint

These are the published reviewed source heads at this checkpoint, separate from
older immutable installed stages below. All are draft/HOLD. No browser checker
wheel changed and no real teaching proposals were automatically approved.

| Draft | Exact source head | Implemented boundary |
| --- | --- | --- |
| [checker25](https://github.com/Erasmus-CTM/ctm-checkers/pull/25) | `0581521595fc9eb775a818c2771faedb2052554e` | Tested lazy generation, leased decisions/history, lossless complete-file G1 export, read-only next-batch route, strict changed/gone approval checks, rejection-only retirement, safe hints, pool CI, trusted producer/bot and inactive Pages templates, validated teacher displays, project reporting and authenticated generated student-preview assets. |
| [libs43](https://github.com/Erasmus-CTM/ctm-libs/pull/43) | `39f9b24c94c2c7c79b18d3dcb9b21d4042834691` | Shared stable chooser/P17, explicit optional/review proposals, corrected distribution, accepted-only linked explanation reset and opt-in numbered public result events with separate identity. |
| [math32](https://github.com/Erasmus-CTM/math-exercise/pull/32) | `dc052637c42cfb98bf3e58df8d72ec4a9134e333` | Canonical native resolver/wrapper, file CLI, connected local review and static artifact export with actual multilingual Quarto student previews, pool checking, shared student chooser/exact custom context, single native payload, isolated board helper and late teacher presentation. |
| [assessment56](https://github.com/Erasmus-CTM/ctm-assessment/pull/56) | `9504873c236e838f644c1a2807720ad419734554` | Canonical native producer beside unchanged browser wheels; exact component adapter/review-server allowlist. Arbitrary Python, nested copies, checker definitions and foreign wheels remain rejected. |

The shared authoring UI has explicit decisions, undo, problems-only filtering,
passing bulk approval and same-answer reapproval. Generate25more preserves existing
numbers, tapes, rejections and the original page lease. Execution/grading failures
stop rather than becoming another draw. Gone approvals may be retired only with
a rejection reason, retaining their old hash, number and snapshot. Native strict
CI rejects changed/gone approvals even if normal publication can still use some
current approvals. Handwritten pools use a separate real teacher/authored-case
check and receive no proposal or approval history.

The trusted producer proves exact PR head, protected-default producer closure,
run and archive digest before privileged effects. Bot writes use expectedHeadOid,
latest comment intent and explicit next-head recheck dispatch. Its templates remain
inactive outside `.github/workflows`: fake API tests do not establish live bot,
required-check attachment or public hosting. G1 complete-file export preserves
large integer lexemes and full history; humans inspect the branch/file and diff
before committing. A stale artifact must be regenerated. G1's extra batch link
opens the workflow page and supplies separate copyable expected-head inputs. A
human chooses the PR branch and submits GitHub's native form; the review page
does not dispatch, generate in-browser or write source.

Teacher display is late optional metadata from exact decoded teacher objects,
validated by one strict shared MathML/LaTeX sanitizer. Canonical input remains
visible, including unsupported displays; no evaluation of strings, hash change
or student presentation payload is introduced. Native Chromium checks cover
fractions/matrices and hostile printer output. Project reports emit escaped job
summaries; more than30 open questions use one summary while preserving current
checklist ticks. Deleted-question comments are archived as inert text. These are
source/fake-service contracts; actual GitHub rendering and status remain unobserved.

The actual component CLI50 workflow used math9bf8a2f/checker1a42281, retained
separately from later student/UI changes: Generate25 → explicitly approve one
synthetic candidate → Generate25more passed. Fifty distinct tested notes retained
the first batch and its single approval/history unchanged. Attempt-budget,
authored-test and invalid-output faults stopped without partial manifests.
See the [author guide](2026-10-variants-authoring-guide.md) and exact evidence below.
No real teaching notes were automatically approved.

The student consumer passes35 focused source/module checks at its privacy
followup. Actual JS-produced **custom scalar/vector** packets grade correctly
through the installed native checker wheel; this is not Pyodide bootstrap or
named matrix input support. Five actual Chromium scenarios use canonical local
modules/KaTeX and an explicit runtime/grader stub: keyboard cancel/accept/focus,
saved and withdrawn answers, review proposal nulls and sibling containment.
Intentional missing-helper errors remain reported. The later privacy-only module
followup is separate from that browser report's recorded source hashes.

The optional figure transport has focused source and actual local Chromium
proof: direct explicit iframe IDs, event.source/label validation, null proposals,
structured-clone values, load/ready/layout resend and disposal. It does not wait
for JSXGraph, Python or Check. This is transport evidence, not a real missing-CDN
or speech negative. The canonical JSXGraph assessment_id/iframe_id is the target;
a surrounding heading ID is not silently treated as the iframe ID.

The Lua/native bridge passed bounded actual Quarto checks: required zero fails;
OPEN/review proposals preserve exact null context; an explicit synthetic approval
allows required publishing; changed approvals fail; ordinary questions skip
native generation; legacy parameters fails with a migration message. Question
Markdown and raw-HTML-free solutions follow approved design §3.6.i. The wrapper
reads the actual canonical Pandoc AST, rejects stale/comment/example sources,
and performs one leased write after validation. POSIX supervision is exercised;
Windows teardown remains untested. A timeout after a possible write is uncertain:
reload the manifest before retrying.

An isolated canonical installed **native-only** baseline with clean exact sources
(assessment dc1388d, libs d71a9a5, math fca53b8 before the AST refinement,
checker e1b5bb4, py18e6f1e, pyo0617c97, upstream e4ad81d) passed: installed wheel
and native provenance/hash inventory, required-zero publishing refusal,
optional two tested proposals with warning and no write, Generate2 → approve1
→ required publish with exact positive n1 context, and stale-decision no-write.
Hostile lesson imports were ignored. This proves the installed native seam,
not Lua/JS authoring activation or final later-head acceptance. A separate exact native package refresh at math f1b43323/checker1a42281
passes:18 native files/hash provenance and three affected installed-source
controls for changed teacher, outer literal fence and HTML/comment examples.
It still does not activate the Lua/JS component bridge.

Ordinary Quarto preview versus render has no verified public Lua detection
signal in1.8.27. Bounded actual preview/render probes agreed. Explicit review/
preview settings exist; automatic ordinary-preview behavior remains open rather
than weakening required publishing. Connected local multilingual student previews and trusted workflow source are
implemented. G1 source now exports actual isolated student views and generated assets;
legacy example/test cleanup is complete at mathdc052637. Final installed
deltas remain separate from earlier stage evidence.
No full variants, course or first-visit clearance is claimed.

The course template now has separate draft
[PR1](https://github.com/aacchhee/quarto-course-template/pull/1) at
`5305790a1d48adb18e854197b158ec5cf8b141c2`: active-file local review and read-only
validation tasks, guidance and `_variants/` CODEOWNERS without adding a required
code-owner gate. It documents that the existing template installer is still the
legacy route; no default source pins, workflow deployment or student main changed.

### Subsequent immutable installed stages

A frozen student/base installation at assessment9504873, libs5a067c9,
mathd0dfc46, checker38332f9, py18e6f1e, pyo0617c97 and upstream e4ad81d passes
all recorded hashes/clean source checks:21 native files including native.json,
unchanged browser wheel,15 installed consumer checks, six pure producer contracts,
actual Quarto positive/negative gates, and a read-only installed helper GET with
unrelated-origin POST refusal. This is a separate later stage from the earlier
native-only baseline; it still does not prove Pyodide/CDN/bootstrap acceptance.

The affected authoring installation at math1c3fa0c, libs39f9b24,
checkerae0d405 and assessment9504873 passes19 focused installed checks, plus an
actual installed helper student-preview GET with blank learner fields and matching
teacher keys/context. The native package has22 listed entries plus native.json,
23 recorded files. New pure authoring files are browser_manifest.py and
rejection_hint.py; the checker browser wheel is unchanged. This stage covers
ordinary authored AI context, sole native question serialization, numeric public
variant events with separate identity/P17, CI pool teachers, and helper safeguards.
The base15 and demo99 were not repeated for those small deltas. Later read-only
GitHub batch, presentation and reporting slices have their own focused checks.

### G1 student preview closure

Checker0581521 and math77e27c4 implement the previously missing actual student
view in GitHub artifact/Pages review. The unprivileged component exports one
actual Quarto catalog per question/language from the tested transient manifest;
original source/history is unchanged. Official row URLs select an exact id/hash
key. Only explicit exported review catalogs accept these keys; bare, unknown or
ambiguous selectors fail locally. Review cards bypass chooser/P17 and ordinary
answer/session persistence. Ordinary student publishing and selection are unchanged.

The trusted producer captures source bytes before resolution, verifies source and
manifest again after export, and inventories the outer page plus every generated
asset. Privileged export checks exact PR-head source, run/producer closure, archive
and per-file digests, safe paths, case/prefix collisions and bounded file counts/
bytes before copying; it never executes authored code or downloaded assets.
Aggregate limits are64 MiB assets/32 MiB HTML,4096 files,16 MiB each. The templates
remain inactive; no public URL, live dispatch or required status was established.

The actual two-candidate/two-language export produced64 generated files,2,408,029
bytes. Complete producer→artifact→fake GitHub→privileged export verified all 65
files including the outer page byte-for-byte. Six Chromium checks on that actual
catalog prove correct per-card teacher packets, blank second-card fields, no
automatic grading/storage writes and bare/unknown selector failure. Runtime/grader
transport was explicitly stubbed, KaTeX requests were blocked, raw console faults
and an initial mistaken packet assertion are retained. This is not real-engine,
CDN, first-visit or course acceptance. Module/source guards passed independently.

### Legacy authoring migration completed

Mathdc052637 (tree`0fa623699791bea8450dbdeb094dc75008a93975`) removes the dead generator/Lua bridge and obsolete generator-only
tests. Five maintained examples now use native variables, teacher fields and
authored tests. The matrix example has four scalar entries for a fixed2×2
matrix; the circle example grades typed coordinates and keeps the board as an
illustration. Neither claims native dynamic named-matrix or graphical response
support. Ordinary matrix/graphical examples and tests remain in place. The
coupled-answer example has a valid positive teacher vector, and the rounding
contract has a real native authored test.

Four integration fixtures now exercise the canonical native or ordinary-pool
paths, with explicit supersession mapping. Focused actual teacher/authored checks
pass for all five example types; required-zero refusal, review null contexts and
no-history checks pass in actual Quarto. A dedicated nonstudent profile builds
the one excluded native-example page into `_review-examples`. The ordinary
website/publish path keeps required approval and does not contain that page.
CI no longer invokes deleted tools and discovers all seven current native Python
test files, including pool and read-only generation checks. No broad npm/site
campaign was run. Initial fixture/configuration probes remain retained.

## ctm-demo native authoring migration

[Draft demo20](https://github.com/aacchhee/ctm-demo/pull/20) is stacked on unchanged
demo19 (`5bd385fbafbb6002216eb4c979426d3883358980`). Its published head is
`dee303707105a6c79aa10e45b1fe2f69b3100aea`, tree
`6554d3039b144dde767e9b39182ffc2094642d05`, authored Andrey Chesnokov.
The four angle/values/triangles/tangent sources use native variables, stable
question context, generic board/solution hooks and accepted-change AI reset.
Old course-specific generator/transport glue is removed. The branch has explicit
deployment guards and an artifact-only native review workflow; no deployment ran.

The immutable student/base tuple is assessment9504873/libs5a067c9/mathd0dfc46/
checker38332f9 plus the loading py/pyo/upstream heads recorded above. Its canonical
99 proposals passed349 real teacher fields, zero authored cases and zero approvals.
Boilerplate assertions removed during migration are not counted as authored tests.
The first review render unexpectedly covered13 pages because of profile list
merging; that receipt is retained. The command now explicitly selects the one
page; no99 repeat was done for the command correction. Required publishing with
zero approvals refused without changing manifests. An affected tangent-only
render and browser check fixed a solution target that had removed its board.

All four real pinned JSXGraph boards have bounded controlled browser proof.
The environment blocks the original data-URL frames and CDN trust. These checks
served exact decoded frame bytes over test-only HTTP with the same opaque
sandbox, used exact pinned local assets and an explicit grader stub. This is
functional figure/transport evidence, not original-frame/CDN/static or full-engine
acceptance. The older provisional mixed-native source receipt is retained and
superseded by canonical installed closure, not silently relabelled.

The demo's [evidence reconstruction instructions](https://github.com/aacchhee/ctm-demo/blob/dee303707105a6c79aa10e45b1fe2f69b3100aea/docs/consolidation/evidence/native-authoring-student-base.zip.README.md)
restore the exact1,167,192-byte ZIP from five checksummed parts; SHA256
`bcf9c313f6adf2578d34c15e4c4e53e90fb397f30b7916e3294473ee917978eb`.
Its 68 entries preserve raw failures, drivers and controlled assets. Later authoring
source/proof deltas remain separate from this older exact student/base tuple.

## Retained cloud evidence

[Incremental evidence ZIP](evidence/2026-10-23-cloud-continuation.zip), SHA256
`51b2d0651ea8d7361d747f983a3cb36e45b649a2964176aed2cb3934abafa60a`,
contains per-file hashes, exact clean loading tuple/render record, both raw
Chromium environment failures, bounded module/UI evidence and trust diagnosis.
The prepared real-runtime fault harness is clearly marked unexecuted. Original
restart ZIP and its earlier failures remain unchanged. No old failure is waived.

[Installed native baseline and preview probes](evidence/2026-10-23-authoring-native-baseline.zip),
SHA256 `07d720a00eef6aa2fc4c862bd2af7a32a05dd8b7efb6c86ef886dcdcff026061`,
retains that exact earlier native-only stage separately from later AST/bridge work.

[Focused installed CLI50 proof](evidence/2026-10-23-variants-cli50.zip), SHA256
`16ff08506d33da4bed17e1b48eb785f5fd0118e5bb8d2d782792d02cfd06684e`,
contains the exact source tuple, canonical native inventory, raw requests/results,
single synthetic approval and preserved history, expected no-write failures,
driver and per-file hashes. This is a native CLI proof, not a student browser run.

[Focused student/module/board seams](evidence/2026-10-23-variants-student-seams.zip),
SHA256 `5840ef4dae6b1c65a1f53c578a658e7adb84744692cc879c0e7511489b7340d7`,
preserves the separate source-hash browser reports, custom native packet proof,
module/privacy checks, board transport (including the initial failed favicon
fixture), ordinary handwritten pool proof and linked feedback cancellation.
Its connected helper report is explicitly a working-copy installed tuple;
final immutable installed verification follows separately. Stubs, expected
faults and stage boundaries are stated in the archive README and each report.

[Immutable installed student/base stage](evidence/2026-10-23-variants-installed-student-base.zip),
SHA256 `54875ca08d4774e12d91b6827c5f970480a4221d82fa8891bdfb7e173e5aed1a`,
retains its exact refs, provenance/inventory, installed logs and harness metadata.

[Affected installed authoring stage](evidence/2026-10-23-variants-installed-authoring-stage.zip),
SHA256 `4aed7e551a502b622a9850ee5fc3098681e2f4e4b8dfc1a55a4aa997525643ac`,
retains its separate exact tuple,19 checks and installed preview, plus scoped source
and HTTP iframe engineering evidence with stubs and raw failures. Initial harness
assumptions/environment failures are retained and explained; no product failure
or first-visit blocker is waived.


### Final installed native authoring delta

A fresh canonical installation at mathd1fea56, checker7074abf, libs39f9b24 and
assessment9504873 passes the final small native delta. All 24 recorded native
files match (23 payload entries plus native.json); project_report.py is the new
entry since the preceding stage. The browser checker wheel remains SHA256
`2c9935c6aa60041bbcb13d751db98c613feb69fd7077ebd3d4d296f8ac376f54`.
A three-choice fixture retained one proposal, then read-only resolve-more
returned all three without changing source or manifest; publishing mode refused
that action. Actual installed CLI review emitted validated fraction MathML with
canonical input1/3. Four malformed display shapes were rejected without changing
the six-key neutral record contract. The independent seven-check Chromium
presentation report's three source hashes match this installed tuple.

[Final installed delta evidence](evidence/2026-10-23-variants-installed-final-delta.zip),
SHA256 `697e22ee2cf5fea753ed4b118a20ddbe16fb23a5c289dd56f4292a0e6aa5740d`,
contains the exact refs, native inventory/provenance, raw focused logs, summary
and separate MathML browser driver/fixture/report. It does not repeat earlier15,
19 or99 checks, and does not establish later G1 export or first-visit acceptance.


### Final G1 installed/source evidence

[Final G1 evidence](evidence/2026-10-23-variants-g1-final.zip), SHA256
`e49228d456c436b21dd70b7ccad57f07e0a6e4d8234b3188e31ae20fc86564b6`
(134,472 bytes,44 entries), retains clean exact math77e27/checker058152/libs39f9/
assessment950487 installation, full hash inventory, source/render witnesses,
actual student/review HTML, complete65-file output inventory and focused
module/browser/fake-API drivers and raw receipts. Native files increase24→25
only by adding preview_assets.py; browser wheel is unchanged. All render-used
component extension files at07cb214 match published77e27, and both generated
runtime JS copies match the installed consumer. Successor mathdc052 changes only
examples/obsolete tools/tests/docs/configuration; it leaves this runtime/native
closure byte-identical. No render or generation was repeated for that source-only
successor. This proof is separate from the earlier24-file installed delta.

The final supported native authoring source is implemented and reviewed.
The fresh 16-route GitHub audit confirms four earlier feature leaves merged and
all 12 current open routes still draft/unmerged. The demo20 branch remains stacked
on demo19, and authoring leaves remain stacked on their loading/feature bases. Actual
trusted workflow installation/closure configuration, hosted Pages URL, live
sticky/decision/recheck status attachment, ordinary Quarto preview detection,
Windows teardown and real-engine/static first-visit acceptance remain separate
limits. Native STACK authoring is explicitly unsupported by this producer; no
silent discovery omission or step-6 adapter completion is claimed. AC alone merges.


[Final migration and remote-audit evidence](evidence/2026-10-23-variants-migration-final.zip),
SHA256 `6e61cb75da4585a1d15e4efcf40d816582d196af111cbfad755d508724a9bfe6`
(16,547 bytes,16 entries), preserves the 16-route API snapshot, independent source
reviews, exact published example drivers/coverage map and focused native/Quarto/
profile logs with initial failures. The four integration-fixture receipt separates
its saved importer raw log from tool-output-only results, individually checked
without-AI cases and a pre-existing compatibility skip. It does not claim a new
full-file/full-suite run. Source proof, installed proof and browser stubs retain
their distinct tuples and limits; no older failure is waived.
