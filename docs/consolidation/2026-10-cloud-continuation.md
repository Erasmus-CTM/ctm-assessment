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

## Variants authoring in progress

The native-only checker25 foundation is now at
`1a42281c3d7332df94e9b6e9df250ba7610369c7`: tested lazy reconciliation,
Generate25more, atomic bulk decisions, disconnected review/undo, data-only
checklist planner and an **inactive** trusted-base GitHub adapter. The adapter
uses atomic expectedHeadOid, verifies exact-head producer/artifact provenance,
rechecks comment intent, and accepts the explicitly dispatched next-head run.
It was tested with fake API transports only; no live comment or dispatch ran.
Actual trusted producer/sticky-comment/rejection integration and live check
attachment proof remain unfinished. Native browser wheels were not changed.

Authoring component branches are separate and stacked on loading leaves:

| Draft | Exact source head | Boundary |
| --- | --- | --- |
| libs43 | d71a9a5f9726db75da718fcd1e20dc1d72902796 | Shared chooser/P17 session+saved identities, explicit optional proposals, leaf-wise approval setting.18 focused checks including two real Quarto renders; independent review. |
| math32 | f1b43323fa9f4d63f96ab2dc3067a4dcbffa5929 | Native resolver/wrapper only, no Lua/student activation yet. Canonical source-file AST extraction prevents approving stale/documentation examples. Nine wrapper tests and independent focused controls pass; POSIX supervisor exercised, Windows path unexecuted. |
| assessment56 | dc1388d1f15e39b5ade8fb9d51621033359561f7 | Canonical native producer installed alongside checker wheels; exact math wrapper/resolver allowlist; checker ownership preserved.12 portable contracts pass. |

These preserve rejected history, stable decisions, changed snapshots, actually
tested distinct notes and failure-stop semantics, never unchecked pools.
Required remains default; OPEN maps to existing approval:optional with warning.
Unnumbered optional proposals use a sidecar with context.variant:null, never n0.

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
preview settings exist; automatic ordinary-preview behavior from the design
remains open rather than weakening the required publish gate. Full component
rendered review/student storage and actual bot workflow remain required.

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
