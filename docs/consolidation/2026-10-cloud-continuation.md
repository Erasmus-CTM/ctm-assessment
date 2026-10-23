# Cloud continuation — 23 October 2026

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
| [checker25](https://github.com/Erasmus-CTM/ctm-checkers/pull/25) | `7074abf19a61bf13ea9a8f7f700fe5d66066f3b7` | Tested lazy generation, leased decisions/history, lossless complete-file G1 export, read-only next-batch route, strict changed/gone approval checks, rejection-only retirement, safe hints, pool CI, trusted producer/bot and inactive Pages templates, validated teacher displays and project reporting. |
| [libs43](https://github.com/Erasmus-CTM/ctm-libs/pull/43) | `39f9b24c94c2c7c79b18d3dcb9b21d4042834691` | Shared stable chooser/P17, explicit optional/review proposals, corrected distribution, accepted-only linked explanation reset and opt-in numbered public result events with separate identity. |
| [math32](https://github.com/Erasmus-CTM/math-exercise/pull/32) | `d1fea56a987e9e507b3f720494bd2ed2c2fb440d` | Canonical native resolver/wrapper, file CLI, connected local review with lazy actual multilingual Quarto student previews, pool checking, shared student chooser/exact custom context, single native payload, isolated board helper and late teacher presentation. |
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
before committing. A stale artifact must be regenerated. G1's extra batch route
opens GitHub's native Actions form with explicit expected-head inputs, never a
browser generator or an automatic source write.

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
implemented. The current G1 artifact still has text previews; actual component
student views for that route and legacy example/test cleanup are the next focused
source slices. Final installed deltas remain separate from earlier stage evidence.
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
assessment9504873 passes the final small native delta. All24 recorded native
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
