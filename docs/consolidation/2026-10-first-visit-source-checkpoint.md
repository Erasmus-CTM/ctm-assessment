# First-visit loading — saved WIP checkpoint

AC stopped new execution because the local computer will soon be unavailable.
No test, render, download or browser run may start now. All processes owned by
resize_xhigh have finished. Root owns remote publication, using meaningful
WIP `[skip ci]` commits authored Andrey Chesnokov; AC alone merges. No main,
deployment, tag or live ingmat change is authorized by this checkpoint.

## Source locations and exact bases

All source edits are isolated under `work/first-visit-fix/`:

- `ctm-libs`: initial readiness commit b223f41fe492a3fc48403062a3ccfcab271f6802
  was published in draft PR42. Current follow-up is based on that exact commit;
  `ctm-libs-followup-publication.json` records six files and expected tree
  cdb7fd52175ff7b9904f7f12d9bf69d5cc1cdede. WIP follow-up is published at dfe7bf8f0079b8516edc3b986c09a9694f94623a in the same draft PR42, with that exact tree.
- `pyodide-interaktiv`: exact AC-merged runtime-order head
  a509540668104777a63474cbac212b03ce511341 (PR10 merged into PR9's branch).
- `py-exercise`: exact AC-merged assets/store head
  2096710d29e5fa06093d0f30e87e0ccaa6c31402 (PR12 merged into PR11's branch).
- `math-exercise`: current remote stable-variant-html branch head
  b282111da4bb208effd8bad8d7e6df7020d0db0a.

Each repository has a publication JSON/patch with full file paths, SHA256,
Git blobs and staged expected tree. Final consumer manifests now select dfe7bf8f0079b8516edc3b986c09a9694f94623a. The canonical pyo sync producer ran as a SAVE operation only; its source and target records select that same ref. No new --check or test ran. The
initial library manifest is historical; use the follow-up manifest for latest
bytes. No canonical generated file was manually patched.

## Causal correction in progress

The old COI-ready handler immediately reloads while KaTeX dynamic imports,
Monaco AMD callbacks and fonts may still be loading. Python packages also
start eagerly. Parent confirmed the immediate-reload/eager-package pattern
already exists in an August source commit; no old-browser reproduction or
exact regression date was established. Original first-visit raw failures are
retained, not waived as teardown effects. A newer baseline completed Matplotlib
ranges, so the original aborted wheel is not claimed fixed or reproducible.

The existing canonical shared runtime now has a small initial-UI contract.
Components synchronously register their UI promises before load. Load seals
registration, even if no reload barrier is requested. The barrier waits actual
registered UI, existing parent MathJax startup and `document.fonts.ready`.
Early failures are immediately console-visible and reject the barrier with
the original error. An already-loaded older runtime retains its namespace and
live methods; only missing readiness methods are composed onto it.

The Python component immediately publishes its shared startup promise, so
other components cannot start a fallback interpreter. Actual worker creation
waits for the COI decision. UI readiness does not await Python packages or
any authored setup/output/autorun/learner cell, avoiding a dependency cycle.
One automatic reload rechecks interaction and recent limits before flags and
navigation. A 30s deadline cancels navigation, leaves needs-reload and permits
Python on the current page; late readiness cannot undo that decision. Already
isolated/unavailable paths remain immediate. Existing 5s missing-SW fallback,
one-reload/hard-reload counts, recent failure expiry, input/Stop shared-buffer
eligibility and authored startup ordering are retained.

Only the initial collected IDE construction batch joins readiness. Restored
extra editors built synchronously in that batch are included; later user-added
extra editors still work after registration closes. Both Python editor owners
now reject their readiness promise on AMD, construction and layout failures.
The py-exercise loader fallback remains visible, now rejects the original
initial-UI failure, and catches/reports a later recovery setup failure.

Fatal worker errors now log the original native event, terminate/revoke once,
reject pending startup/RPC/setup, and make future calls fail immediately.
No automatic restart or replacement is published. Explicit restart makes one
replacement and retains normal restart notifications. postMessage exceptions
remove/reject only their operation; setup retry also rejects instead of hanging.
Pyo fatal package-setup failure retains engine-failed/disabled Run instead of
calling a dead runtime ready. The new fatal-worker source is saved and tested,
but has not been exercised in an actual browser or shipped consumer yet.

Root's final math fallback is saved but UNTESTED: build Check/store controls
before optional KaTeX, display a local rendering warning, retain the original
UI rejection so automatic reload is cancelled. Input-help fallback does not
hide the original initial renderer failure. Root also added en/de/nb warning
strings. Those final root changes were not in the prior math test run.

## Checks actually completed

Last started process finished exit0: **32 pass, 0 fail, 0 skip**:

- canonical worker-failures.test.cjs: 6 (initial/active fatal failure, future
  calls, explicit single restart, RPC cloning failure, retry post failure,
  message decoding and construction failure);
- original canonical worker.test.cjs: 8;
- canonical initial-ui.test.cjs: 5 (load/UI/MathJax/fonts order, early error,
  duplicate barrier, old live runtime preservation, independent load seal);
- pyo readiness.test.cjs: 13 (existing stage2/startup/restart semantics,
  synchronous shared promise/deferred worker, fatal setup failure).

Earlier focused checks: 30 pyo COI/readiness/initial-editor contracts passed
before the last fatal-setup addition; 25 py runtime contracts passed before
its final loader-rejection follow-up; 15 math store/shared contracts passed
before root's renderer fallback. Two targeted py initial-UI/AMD/create/layout
contracts and three pyo initial/lazy/error contracts passed before the last
loader-rejection follow-up. An initial math ESM jsdom resolution failure is
retained; the same tests then passed using existing local dependency junctions.
This was environment resolution, not a product fix.

No actual first-visit browser, render, full worker background/stages suite,
or renderer-fault controls ran for this WIP. No broad acceptance or static
rollout clearance exists. Original headered combined demo primary acceptance
remains a separate, previously passing gate.

## Save and resume order

1. Root publishes the library follow-up as WIP [skip ci] and records its exact
   SHA/tree. Update only component fixed library inputs/review trailers to that
   ref. Run the existing canonical pyo sync producer as a SAVE operation (not
   tests); its source/target records must agree. Do not claim generated-copy
   parity until the actual save/record check exists.
2. Refresh consumer publication manifests from the exact bases above, including
   root's final math source and canonical generated pyo files, and publish WIP
   source snapshots. Keep parent branches/AC-only merges intact.
3. On resumed execution, independently review remaining source/fault controls,
   run focused tests for final math fallback, py loader/recovery and locale
   changes, then install through canonical package sources. Render only the
   demo UI page into a separate first-visit output and run the bounded actual
   three-browser first-visit diagnostic retaining all raw failures/lifecycles.
4. The parent UI contract cannot prove opaque iframe MathJax readiness. Original
   CDP baseline also showed old-frame board-resource unknowns. Do not infer
   iframe startup complete from iframe.load, poll inaccessible DOM, waive
   unknown requests, or claim the readiness fix clears that boundary without
   new evidence. No new JSXGraph vendor/generated patch is authorized here.

Course/static rollout stays HOLD until actual first-visit findings are resolved.
Keep ctm-demo as testbox; live ingmat main stays protected. After coherent demo
acceptance and AC merging components, ASK AC before starting ingmat migration.
Next feature priority is variants authoring (Generate25 valid/distinct tested
notes, stable approved history; new unapproved questions fail unless the author
explicitly chooses recorded OPEN exception, which still warns). Offline and
STACK remain deferred. No variants implementation was made in this checkout.

## Final save update (no new execution)

All component fixed library inputs/review refs now select
`dfe7bf8f0079b8516edc3b986c09a9694f94623a`. The isolated library checkout is
clean at that exact published commit. Canonical pyo sync completed as a save,
including source record; target record was refreshed to the same SHA. Fresh
`--check` was deliberately not run after AC stopped execution.

A real module-scope bug was caught by source review during saving: classes
and cell-initialization are separate type=module files, so a bare let flag
could not cross that boundary. Both now use the explicit
`globalThis.qpyodideBuildingInitialUI` property; associated focused contracts
were updated. This necessary source correction has **not been executed** in a
real module or rerun test. The earlier classic-eval tests had not proved the
ES-module boundary. Treat all current source as WIP, not accepted browser code.

The final `*-publication.json` files and patches include all current tracked
changes from the exact component bases, final library refs and generated pyo
bytes. Root must upload them/cloud-checkpoint before the machine is stopped.
No runtime validation or first-visit acceptance has been added by these save
operations. No process owned by resize_xhigh remains running.
