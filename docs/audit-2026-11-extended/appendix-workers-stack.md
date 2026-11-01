# C8–C9: ordinary Python and STACK execution

Sources reviewed read-only: `py-exercise@5682787`, standalone `pyodide-interaktiv@793a872`, `ctm-stack@e8437f1`, and `stack-wasm-maxima@63ee8e4`. Paths below are repository-relative unless prefixed; line numbers refer to these snapshots. The ctm-stack and standalone Pyodide source copies are under `/workspace/audit-snapshots/`. These are normal-use source and behavioral observations; no adversarial probes were added.

## C8a: Python exercise authoring → check → result

1. `py-exercise/_extensions/py-exercise/py-exercise.lua:236:CodeBlock` recognizes the exercise block; `:148:parseBlockOptions` reads options, and `:162:splitCode` splits starter and tests at `## TESTS ##`. `:250` forwards both fragments to the umbrella import collector. In local asset mode its absence stops the build (`:254`).
2. `:178:ensureExerciseSetup` registers layout, asset resolver, shared Python runtime and locale dependencies, writes page configuration, and registers component JS/CSS. `:259` requires task text when shared feedback is requested. `:263` merges restrictions; `:270` derives a source fingerprint from the authored block and sorted restrictions; `:273` registers the exercise storage identity.
3. `:287` emits starter, tests, label, source, save flag and restrictions; `:104:scriptJson` escapes inline-script delimiters, and `:322` pushes the data into `window.__pyExercises`. Thus tests are present in the delivered page. “Hidden tests” describes the normal UI, not a secret held on a grading server.
4. `py-exercise.js:1002` waits for DOM readiness, starts Python and Monaco independently, and `:407:setupExercise` creates an editor and controls. `:538` registers CTMStore with `{code}` input; editor edits invalidate current evidence and schedule persistence (`:588`).
5. Check or Shift+Enter calls `:610:runCheck`; duplicate active checks are ignored (`:612`). The code/revision are captured, controls disabled and a Stop affordance scheduled (`:633`). `:21:pythonTransaction` retrieves the current runtime every time, checks the Stop epoch, and enters its shared transaction queue.
6. `:674` optionally invokes AST restriction checks (`:98:violations`); a violation returns without running learner code. `:678` loads imports from learner code. `:272:pythonCall` installs the guard and private `_ctm_py_exercise` module, places one JSON request in globals, calls the private dispatcher and JSON-decodes the reply. A missing private module is reinstalled once (`:280`).
7. Embedded Python `:209:run` creates a fresh namespace, snapshots guard state, starts bounded capture and plot hooks, then compiles and executes learner code (`:224`). Learner exceptions and SystemExit become `student_error`. Tests are parsed into top-level statements and executed one statement at a time in the learner namespace (`:236`); each statement contributes one pass/fail result, including non-assert setup statements. Assertion messages and ordinary test errors become per-statement failures. `finally` restores plotting, stdout and guard state (`:245`).
8. `:703` discards a result if the editor revision changed; `:309:renderResult` renders stdout/errors/test counts, optionally hints, and `:705` appends images. `:709` records invalid/correct/partial/wrong with passed/total score. `:736` always removes the slow notice and re-enables controls. Reset restores starter code (`:745`).

```mermaid
sequenceDiagram
  participant Q as Quarto filter
  participant UI as Monaco exercise
  participant R as shared runtime broker
  participant W as Pyodide worker
  participant S as CTMStore
  Q->>UI: starter, tests, rules, identity
  UI->>R: Check: transaction(current runtime)
  R->>W: install guard/module; JSON request
  W->>W: restrictions; load imports; fresh namespace
  W->>W: execute learner, then test statements
  W-->>UI: JSON stdout/errors/tests/images
  UI->>UI: reject stale revision; render
  UI->>S: inputs and result summary
  opt Learner presses Stop
    UI->>R: stop()
    R->>W: interrupt or replace worker
  end
```

Data/error/storage boundaries: AST restrictions are assignment rules; malformed learner syntax is reported during execution. Stdout capture is 262144 UTF-8 bytes (`py-exercise.js:152`), plot encoding has an 8 MiB write budget (`:161`). The shared interpreter transaction keeps requests from overlapping; a fresh learner namespace does not mean a fresh interpreter heap. Stop epoch changes prevent cancelled work from publishing, and code revision checks prevent stale results. `:723` distinguishes stopped, unavailable input, load failure and other errors; `:687` retries once only when another action replaced the interpreter and the request itself was not stopped. CTMStore stores edited code and result summaries (`:538`, `:709`), migrates legacy `pyex|page|label` keys (`:378`), and exports current editor/result data (`:552`). No remote gradebook submission occurs in this call chain. The optional export encoding is XOR plus Base64 (`:257`), and is not encryption or trusted assessment authentication.

## C8b: interactive notebook cells → shared worker → output / Stop

1. Standalone `pyodide-interaktiv/_extensions/pyodide-interaktiv/qpyodide-document-settings.js:11` is a Lua-filled settings template: authored packages, preload flag, exam-output flag, Stop delay, index URL and cell details.
2. `qpyodide-document-engine-initialization.js:106:qpyodideStartWorker` calls `CTMWorker.page` with an input/plot plugin URL, authored packages, default background `pyodide_http`, `micropip`, `matplotlib`, and `prepareCell`/`runCell` commands. `:148` respects the COI stay/reload gate and publishes the startup promise early so components reuse the worker.
3. Shipped `ctm-libs/runtime/pyodide-worker.js:795:start` → `:823:bootPyodideWorker` constructs the module worker (normally the sibling `pyodide-worker-core.js`, `:837`) and its RPC proxy. `:1067` sends configuration, worker `:176:init` imports `pyodide.mjs` (`:193`) and publishes stage-one readiness; `:634:setup` handles background setup. `:806:publish` exposes qpyodideReady/qpyodideInstance; `mainPyodide` is set after initialization (`:1106`).
4. `qpyodide-document-engine-initialization.js:59:qpyodideFollowWorker` waits for interpreter and `whenSetup`. On package setup failure it offers Retry (`:38`) while enabling cells that can work without the extras (`:87`); a failed worker keeps Run disabled (`:78`). Full cell readiness dispatches `qpyodide-cells-ready` (`:99`). Restart runs startup cells again (`:101`). This distinguishes core runtime readiness from notebook-cell readiness.
5. `qpyodide-cell-classes.js:134:qpyodideExecutePython` awaits the current worker/setup then enters `MathExerciseRuntime.transaction`; it invokes `prepareCell` before `runCell` (`:147`). Plugin `qpyodide-worker-plugin.js:279:prepareCell` loads imports and plot setup; `:209:runCell` captures output, executes code in the shared notebook namespace and turns uncaught exceptions into stderr output (`:218`). Returned values are rendered as HTML when allowed and recognized, otherwise as text (`:231`); result includes text entries, images, pickles and animation outputs (`:265`). Exam output suppresses HTML/pickled rich output paths.
6. Shipped `pyodide-runtime.js:535:transaction` serializes operations per interpreter, checks Stop epochs before and after execution and uses `proxy.operation` to scope stream/input ownership. Worker `pyodide-worker.js:945:operation` supplies operation IDs; `:1004:provideInput` accepts at most the shared input buffer, rejects NUL and overlong UTF-8 values.
7. Stop calls `pyodide-runtime.js:572:stop`: it cancels operation ownership, marks epochs, and, with cross-origin isolation/interrupt buffers, sends an interrupt and waits up to 2 s for idle (`:585`). Otherwise it restarts immediately; an interrupt that does not settle within 2 s also restarts. `pyodide-worker.js:1020:restart` terminates the old worker, rejects pending calls/setup, publishes the new promise and invokes the restart follower. Variables are lost on hard restart; graceful interruption can preserve them.

```mermaid
sequenceDiagram
  participant UI as Notebook / other components
  participant B as CTMWorker page broker
  participant W as Pyodide module worker
  participant P as Notebook plugin
  UI->>B: page(config, pluginURL)
  B->>W: init(indexURL, packages)
  W-->>B: core ready
  W->>W: background package setup
  W-->>UI: whenSetup / cells-ready
  UI->>B: transaction: prepareCell then runCell
  B->>P: operation-scoped RPC
  P->>W: imports, execute code, capture plots
  P-->>UI: text/HTML/images/animations
  UI->>B: Stop
  alt shared interrupt settles within 2 seconds
    B->>W: KeyboardInterrupt; keep interpreter
  else no shared buffer or interruption does not settle
    B->>W: terminate; boot replacement
    B-->>UI: restart event; rerun startup cells
  end
```

Storage: `qpyodide-storage.js:80:makeEntry` registers code only with CTMStore; Python state and output remain live-page state (`:1`). Identity descriptors include source/save metadata (`:16`); unchanged-original code stores null (`:84`). Restore displays old incompatible code separately (`:57`); legacy `qpyodide:code:<epoch>:<pathname>:<identity>` entries migrate (`:33`). Manual-save preference uses `qpyodide:local-storage-manual-mode` (`:5`), autosave updates route through the shared store (`:169`). Export may include matching current output and PNGs (`:100`), but that does not persist interpreter state.

Additional author/UI links: `qpyodide.lua:1701:enablePyodideCodeCell` extracts options (`:1713`), honors eval:false as non-executed plain code (`:1728`), and collects author imports (`:1732`); `:1596:finalizePendingCell` records cell details, while `:633:initializationPyodide` fills the settings template. `qpyodide-cell-initialization.js:9` creates each cell and `:37` starts startup cells after cell readiness. In `qpyodide-cell-classes.js:1411:runStartupCells`, setup runs before output before interactive autorun, once per runtime epoch; ordinary cell failures are logged and the sequence proceeds (`:1429`). Editor Run is wired at `:743` to `:882:runCode`, which queues clicks behind startup, locks other ordinary runs (`:920`), renders streaming terminal output, calls the execution helper (`:1021`), renders HTML/plots (`:1031`), rejects old output revisions (`:1025`), and restores controls in `finally` (`:1052`). Its temporary Stop button calls shared `MathExerciseRuntime.stop` (`:1007`); hard abort/crash becomes visible stderr (`:1042`).

Version boundary: standalone `.github/ctm-libs-source.json:3` pins shipped ctm-libs `33fd5a505c4b519d1c7261920d8424d36d66f187`; umbrella uses `b1e7ec80b198eacd04793fd1cec2adb776555b73`. Independent source comparisons found different `feedback/feedback-core.js`, `runtime/pyodide-worker.js` and `runtime/pyodide-worker-core.js` bytes. The standalone runtime findings and measurements must therefore not be silently attributed to the umbrella's newer copy. The served index version is Pyodide 0.28.3 (`runtime/pyodide-runtime.js:102`).

## C9a: ctm-stack SymPy prepare → validate → grade

1. `ctm-stack/_extensions/ctm-stack/ctm-stack.lua:73:render` recognizes `.stack-question`, reads options and resolves CAS (`:84`). At this commit default is provisional SymPy and selecting Maxima explicitly fails at build (`:87`); native transport files do not make that backend available in this card registry.
2. `:48:setup` registers shared runtime/checkers/locale/matrix/variant assets; `:105` obtains the checker Python environment and invokes `question-variants.py` using CTM_STACK_PYTHON/STACK_SYMPY_PYTHON/python3. `question-variants.py:3` restarts itself under isolated Python; `:47:install_imports` resolves canonical wheels/native authoring, validates descriptor hashes and the native-authoring file inventory (`:19`). Its `:76:supervised` bounds the whole child request, including bootstrap and teardown, with 300 s and 16 MiB output ceiling (`:88`).
3. The card shell requires payload v2 with variants (`ctm-stack.lua:123`), emits a backend descriptor with `backends/sympy.js` and isolation=false (`:151`) and escaped JSON payload (`:163`). Unsupported preparation stops publication; configured review diagnostics can become visible diagnostic cards (`:115`).
4. Browser `ctm-stack.js:8:backendFor` validates the descriptor and adapter methods; `:41:evaluate` queues by backend, superseding same-card/type requests still waiting. `:52:pump` starts the adapter outside the calculation clock; a Stop button appears after configured delay (`:60`) and the calculation ceiling is at least 120 s (`:67`).
5. `backends/sympy.js:38:start` creates a private, unpublished CTMWorker; `:12:install` loads SymPy and CTMCheckersStack with readiness timeout and epoch checks. It does not take over the notebook worker. `:50:request` calls shared `MathExerciseRuntime.callCheckers` with `stack.validate`, `stack.grade` or `stack.tests`; that runtime installs pinned checker wheels, serializes JSON requests and normalizes replies. Mathematical parser/PRT implementation belongs to ctm-checkers, outside the ctm-stack shell.
6. `ctm-stack.js:470:act` snapshots answers and generation. Grade requires an exactly matching successful validation snapshot (`:480`). `:489` sends question, variant plan and answers; `:495` discards superseded/stale input or variant results. Validation renders parsed inputs and only enables Check for valid results (`:502`); grade renders PRT/score feedback and stores its result summary (`:497`). Input edits invalidate validation and feedback (`:463`), and Enter selects valid Check or Validate (`:617`).
7. `:517` distinguishes author errors, runtime failures and learner Stop; runtime failures offer backend restart and Retry (`:523`). Adapter Stop targets its private runtime (`sympy.js:59`), and `:64:restart` starts a new private worker. Queue and start epochs prevent a late startup from replacing a newer backend.

```mermaid
sequenceDiagram
  participant Q as Quarto STACK filter
  participant A as isolated authoring Python
  participant UI as STACK card
  participant B as SymPy backend adapter
  participant W as private Pyodide/checkers worker
  Q->>A: XML/options/variant request
  A-->>Q: prepared payload v2
  Q->>UI: descriptor + prompt + plans
  UI->>B: Validate(question, variant, answers)
  B->>W: load SymPy/checker wheels; stack.validate
  W-->>UI: valid/invalid, parsed inputs
  UI->>UI: retain validated answer snapshot
  UI->>B: Check unchanged answers
  B->>W: stack.grade
  W-->>UI: PRT scores, feedback, input details
  UI->>UI: generation check; render; save summary
```

Storage is shared CTMStore (`ctm-stack.js:569`): answer strings, matrix editor data, variant identity/choice/seen state. Restore selects only matching variant hash plus id/number (`:580`), invalidates validation (`:588`), and exposes changed/withdrawn saved inputs separately (`:598`). Reset clears live state and flushes (`:543`). New variant asks before discarding entered answers (`:609`). The grade summary is a browser-local learning record, not a server-authoritative assessment.

## C9b: standalone stack-wasm-maxima native STACK workflow

This is a separate research/demo build and controller subset, not the available ctm-stack `cas:maxima` path at e8437f1.

1. `stack-wasm-maxima/scripts/milestone-three/compile.py:175:compile_question` compiles supported XML into native question plans; `:303:main` checks source revisions and writes inventory. `scripts/milestone-three/build-site.mjs:26` loads plans, records source/artifact hashes (`:40`), starts an actual browser worker (`:70`), sends init (`:93`) and prepares each question/seed using Wasm (`:98`). Thus preparation does not substitute SymPy. `scripts/milestone-two/frontend.py:29:patch_frontend` checks the exact existing shell hash before adapting its backend worker prefix; `:51` scopes a separate pool per backend wrapper.
2. `prototype/native/backend-worker.js:99` serializes requests; `:21:init` loads bounded input/feedback catalogues, opens `MaximaSession`, and creates NativeStackEngine. A NativePythonBridge is constructed without loading Python (`:41`). Requests call prepare/validate/grade/tests (`:83`). Replies include metadata and counters (`:91`); poisoned sessions are discarded and rebuilt before the next request (`:66`). A failed program is not silently replayed.
3. `prototype/runtime/maxima-session.js:35:init` → `:42:start` requires cross-origin isolation and SharedArrayBuffer, loads the STACK manifest and creates a child worker. Shared buffers have 512 Ki code-point input and 1 MiB output capacity (`:7`, `:52`); ready version must match manifest (`:76`). Default startup deadline is 240 s (`:61`). `maxima-child.js:24:preloadFiles` / `:53:fetchCompiledStack` preload runtime/source or compiled files; `:159` handles startup, hooks IO and loads Emscripten Maxima. `maxima-session.js:110:evaluate` sends engine-generated trusted programs, validates response id, length and JSON; default call deadline is 60 s (`:125`). Failures poison and terminate the child (`:151`).
4. `prototype/native/engine.js:256:prepare` validates seed and author-plan expressions, executes preparation and binds variant identity to question hash, STACK revision/version, runtime hash and prepared data (`:233:binding`). Every request verifies the prepared variant (`:244:assertVariant`).
5. `:316:admission` requires nonempty answer strings; `prototype/native/input.js:101:admit` handles string/JSON/algebraic/numerical/matrix types, Unicode, bounded input and parser admission. `_validate` (`engine.js:390`) runs actual STACK validation and checks native result shape. `:405:validate` returns valid/invalid plus parsed input feedback.
6. `:521:grade` repeats validation and refuses grading invalid answers. For each PRT it calls the native controller program until done or an optional PythonChecker continuation (`:528`). Python is loaded only on a visited continuation (`prototype/native/python-bridge.js:79:invoke` → `:35:ensure`), then a serialized request invokes the bridge's private Python module (`:91`). Required response booleans/feedback are checked (`:100`). PRT paths, notes, feedback and score are collected; final credit is the weighted mean clamped/rounded by the controller (`engine.js:551`). Native feedback passes a bounded catalogue/TeX renderer (`prototype/native/feedback.js:41:parse`, `:78:render`); unknown feedback remains escaped raw protocol.
7. Native source parity helper `scripts/milestone-three/native-reference.py:2` replays generated programs against independent native Maxima with the pinned STACK library. Its own documentation explicitly limits that evidence: it checks generated-program runtime parity, not an independent Moodle PHP controller or a proof of mathematical correctness. Its presentation policy (`:27`) permits only named display normalizations, not grade/state/note normalization.

```mermaid
sequenceDiagram
  participant Build as plan compiler / browser build
  participant UI as scoped CTM card shell
  participant B as native backend worker
  participant E as NativeStackEngine
  participant M as Maxima child + STACK
  participant P as lazy Python bridge
  Build->>B: prepare(question, seed)
  B->>M: boot verified runtime/STACK
  B->>E: prepare and bind variant
  E->>M: preparation program
  E-->>Build: question display + bound variant
  UI->>B: validate / grade answers
  B->>E: verify variant; admit answer syntax
  E->>M: STACK validation / PRT programs
  opt visited PythonChecker node
    E->>P: typed continuation request
    P-->>E: valid/correct/feedback
    E->>M: resume PRT
  end
  E-->>UI: input status, score, feedback, path/notes
```

The engine/worker itself stores live preparation/runtime state, not a remote gradebook. Cross-origin isolation is a functional requirement of this standalone transport. Native code and static author plans remain trusted inputs; supported parser/controller/feedback scope is explicit, and this code cannot establish complete Moodle STACK compatibility. Readiness targets are performance wishes, not correctness gates. The repository AGENTS.md requires keeping Maxima for full STACK compatibility, matched repeat measurements for performance claims, provenance/parity gates, and substantial benefit before adopting owned compilation; an approximately one-second startup win is insufficient by itself. No independent owned-vs-upstream or source-loaded-vs-precompiled speedup was measured in this audit.

## Independent normal-use execution evidence

Test scratch root: `/workspace/audit-tests/normal-c8c9`; Pyodide harness: `/workspace/audit-tests/python-runtime/bench.py`. Source files were copied; original repositories were not edited. Native Python is `/workspace/.cloud-setup/venv/bin/python` with SymPy 1.13.3; Quarto 1.8.27; browser executable `/usr/bin/chromium`; CPU quota `/sys/fs/cgroup/cpu.max` was `400000 100000` (four CPU-equivalents), shared with other work. No laptop latency extrapolation is justified.

Initial ctm-stack suite run could not render because Quarto tried to create an unwritable home cache (34 passed, 23 failed; `/tmp/c8c9-stack-pytest.log`). After setting XDG_CACHE_HOME under /tmp, 43 passed and 14 failed because scratch component dependencies/native-authoring distribution were not installed (`/tmp/c8c9-stack-pytest2.log`). These are harness setup failures, not evidence of component regressions. A third run was launched after copying available umbrella ctm-libs, ctm-checkers wheels and packaged native-authoring into the scratch project; final result is recorded below when available. Composition is umbrella ctm-libs b1e7ec8 + ctm-checkers 4cff6aa, not the older ctm-stack .github/pins.json pair 365eadc/57823df.

The passing unit work includes ordinary scalar function semantics and native edge-case expectations (`tests/test_corpus_functions.py:13`), replay of deployed seeds for AlgMap-14-1, Logs_1 and Complex_Convert_1 (`:55`), and an authored PRT mismatch example (`:68`). This supplies source-level/native-Python regression evidence, not fresh Wasm/native Maxima parity. The 327-program native transport replay and browser Maxima startup were not run: a staged verified runtime-v3 Wasm/STACK package was not present in the inspected workspace. Existing accepted-program fixture documentation is historical evidence only.

Browser runtime readiness/restart benchmark uses shipped standalone ctm-libs 33fd5a5, Pyodide 0.28.3, no extra/background packages, three fresh contexts and the ordinary `6*7` result. Stop is requested during a bounded `await asyncio.sleep(5)` operation, followed by another `6*7` and explicit restart. The initial CDN execution could not dynamically import pyodide.mjs (`/tmp/c8c9-python-runtime2.log`), so no latency is claimed from that attempt. A local Pyodide 0.28.3 distribution already installed in node_modules was then copied to scratch for the same normal runtime API measurements; final measurements are appended below when available. This harness exercises shared worker APIs, not full rendered Monaco notebook cell/UI readiness, plotting package preload, service-worker COI navigation, or a production remote network.

Final normal ctm-stack suite: **57 passed in 96.07 s**, including the full Quarto rendering suite, corpus seed regression checks and build-error diagnostics. Raw log: `/tmp/c8c9-stack-pytest3.log`; rendered deployable site: `/workspace/audit-tests/normal-c8c9/_site`. No failures remained after completing scratch dependency installation. The native-authoring bundle came from `/workspace/.cloud-setup/assessment-integration/site/_extensions/ctm-checkers/native-authoring`, and its inventory was accepted by the unchanged bootstrap. This result qualifies the stated installed composition, not a retest of the older CI pin pair.

Final local-runtime browser measurements (n=3, fresh contexts; plain HTTP localhost; crossOriginIsolated=false):

| Measurement | Run 1 ms | Run 2 ms | Run 3 ms | Median ms | Range ms | Sample SD ms |
|---|---:|---:|---:|---:|---:|---:|
| Core worker readiness including whenSetup, no extras | 1241.8 | 1217.1 | 1211.3 | 1217.1 | 1211.3–1241.8 | 16.2 |
| Stop through replacement readiness | 1087.1 | 1107.2 | 1095.8 | 1095.8 | 1087.1–1107.2 | 10.1 |
| Explicit restart through readiness | 1132.2 | 1130.6 | 1106.8 | 1130.6 | 1106.8–1132.2 | 14.2 |

Every run returned 42 before Stop, after Stop, and after explicit restart. The stopped bounded sleep rejected with `restarted:true` in all three runs, as expected without shared interrupt buffers. The log also contains a benign favicon 404. Raw report `/tmp/c8c9-python-runtime.json`, log `/tmp/c8c9-python-runtime3.log`. Local assets avoid the failed remote-import path; these measurements establish the normal worker/replacement behavior under the described conditions. They do not measure default matplotlib/http preload, first network download, graceful COI interrupt, full editor readiness, or Maxima startup. Three observations give a range and sample variation, not a robust cross-device performance distribution.

## Portable reproduction and additional engine/unit coverage

Reviewable preparer, benchmark, unit runner and exact command examples are in `/workspace/audit-work/code/workers/README.md`. `prepare-python-runtime.py` accepts `--standalone-repo`, `--node-modules`, `--output`, copies only the three existing runtime scripts and five installed Pyodide core files, writes index.html and a byte/hash/pin manifest, and requires Pyodide 0.28.3. Assets remain outside this report's committed code. `bench.py` accepts fixture, report, browser and repetition arguments, and uses localhost only. No prior `/workspace/audit-tests/python-runtime` fixture is needed.

The portable reproduction was actually run with:

```text
/workspace/.cloud-setup/venv/bin/python /workspace/audit-work/code/workers/prepare-python-runtime.py --standalone-repo /workspace/audit-snapshots/pyodide-interaktiv --node-modules /workspace/ctm-assessment/node_modules --output /workspace/audit-tests/python-runtime-portable
/workspace/.cloud-setup/venv/bin/python /workspace/audit-work/code/workers/bench.py --fixture /workspace/audit-tests/python-runtime-portable --report /tmp/c8c9-python-runtime-portable.json --browser all --repetitions 3
```

Both commands exited 0. Chromium 154.0.8037.57 passed all three normal semantic runs; all pre/post Stop/restart answers remained 42 and every stopped request had restarted=true. Portable-run timings (readiness / Stop through replacement / explicit restart, ms) were 1609.0 / 1923.6 / 1968.3, 2093.6 / 1759.1 / 2836.9, and 3279.4 / 2989.8 / 2796.1. This wider variation on the shared runner is material: do not present the earlier ~1.2 s observation as a stable deployment promise, or compare these two runs as an implementation speedup. No implementation changed between them.

Firefox and WebKit were explicitly **unavailable**, not counted as passes. Playwright's configured executable paths were `/home/agent/.cache/ms-playwright/firefox-1555/firefox/firefox` and `/home/agent/.cache/ms-playwright/webkit-2370/pw_run.sh`; neither existed, and no system Firefox was found. The portable report records both skips and their reason. No browsers were downloaded. Chromium used the installed `/usr/bin/chromium`. Raw report `/tmp/c8c9-python-runtime-portable.json`; log `/tmp/c8c9-python-runtime-portable.log`.

`stack-wasm-maxima/package.json` defines no `scripts` object or `npm test` entry. The repository's lightweight CI group instead directly executes files (`.github/workflows/milestone-three.yml:65`). I independently ran the existing group from a source archive of 63ee8e4, with Node 24.19.0 and Python 3.12.14. No new native probes were written. Exact checker pin c366f175aba6b62caa628bc60f57bb1167fc087b comes from CI `:44` and `scripts/milestone-three/compile.py:24`; its source/examples and wheels were archived into scratch.

Final command:

```text
/workspace/.cloud-setup/venv/bin/python /workspace/audit-work/code/workers/run-maxima-lightweight.py --repo /workspace/audit-tests/normal-maxima-unit --checkers-extension /workspace/audit-tests/maxima-pinned-checkers/_extensions/ctm-checkers --report /tmp/c8c9-maxima-lightweight-final.json --logs /tmp/c8c9-maxima-lightweight-final-logs
```

Final result: **10 script invocations passed, 0 failed**; the three Python modules contain **34 tests**, all passed. Commands run with working directory `/workspace/audit-tests/normal-maxima-unit`; the Python interpreter is `/workspace/.cloud-setup/venv/bin/python`, PYTHONPATH contains the pinned checkers base/stack wheels and PYTHONDONTWRITEBYTECODE=1.

| Exact command within scratch repository | Result | Meaning |
|---|---|---|
| `node prototype/runtime/test-maxima-session.mjs` | Pass | Mock shared-memory result/error boundaries |
| `node prototype/backend/test-worker-loading.mjs` | Pass | Deferred startup, Python routing/reuse |
| `node prototype/native/test-python-bridge.mjs` | Pass | Mock lazy bridge/serialized callbacks |
| `node prototype/native/test-engine.mjs` | Pass | Mock native controller/continuation behavior |
| `node prototype/native/test-backend-worker.mjs` | Pass | Mock worker initialization/recovery |
| `node prototype/jsxgraph/test-adapter.mjs` | Pass | Mock DOM/state/board adapter boundaries |
| `node scripts/milestone-three/test-package-boards.mjs` | Pass | Packaging bytes/assets/local-server checks |
| `python prototype/backend/test_native_adapter.py` | Pass, 8 tests | Native adapter contract with mocked CAS callback |
| `python prototype/native/test_python_bridge.py` | Pass, 12 tests | Native-value conversion to existing PythonChecker API |
| `python scripts/milestone-three/test-reference.py` | Pass, 14 tests | Replay comparator and error envelope unit checks |

An initial run using umbrella ctm-checkers 4cff6aa had two import failures because its newer layout no longer supplies `ctm_checkers.stack.checkers`; the other eight invocations passed (`/tmp/c8c9-maxima-lightweight.json`). Retrying with the correct c366f175 wheels resolved that mismatch, but one Python bridge test then lacked `.m2-sources/ctm-checkers/examples/stack/matrix-checkers.py`. Copying the exact pinned examples to that CI-expected scratch path resolved the fixture omission. The final all-pass report is `/tmp/c8c9-maxima-lightweight-final.json`, with per-command raw logs under `/tmp/c8c9-maxima-lightweight-final-logs`. These setup failures do not demonstrate a defect in the pinned repository.

Skipped groups remain explicit: full Wasm/native CAS parity/startup has no staged verified runtime-v3 package; generated pinned STACK parser/feedback catalogue replay is not staged; board-isolation browser tests are outside the selected lightweight group. The new passes are unit/contract evidence and do not upgrade the unrun real-runtime parity claim.

## Related JSXGraph own-suite failure diagnosis

Independent small-case follow-up at exact jsxgraph-quarto 49a1c7d preserved the existing own-suite result: **33 tests, 27 passed, 5 failed/timeouts, 1 skipped** (`/tmp/ctm-jsxgraph-final.log`). The five failures are the rendered iframe resize case and four MathJax browser cases. They remain failures in the assessment totals.

The ordinary generated bundled point-board renders successfully and its decoded frame contains `MathJax-script`. On loading the original generated iframe, however, the actual browser child URL becomes `chrome-error://chromewebdata/`; its DOM says “This page is blocked” and “Your organization doesn’t allow you to view this site.” It has no JXG or board. This explains why `tests/iframe-resize.browser.test.mjs:44` cannot observe a board, and why the MathJax cases time out waiting for the script element at `tests/mathjax-preload.browser.test.mjs:138`, before their actual startup checks. Bundled-runtime direct-in-page tests do not navigate a data: iframe and therefore can pass separately.

Read-only policy evidence: `/etc/chromium/policies/managed/urls.json:2` blocks all URL schemes by default; the allowlist at `:3` includes HTTP/HTTPS/WSS and a few browser pages, with no data: navigation allowance. The extension emits the data: frame at `_extensions/jsxgraph/lua/jsxgraph.lua:841` and sandbox at `:849`. The observed failure is therefore a managed-browser navigation restriction. Source/runtime behavior inside that frame remains unverified; the evidence does not establish a source defect, and a successful Quarto render does not count as browser runtime success. SharedArrayBuffer/COI flags do not repair a navigation blocked before scripts run. No policy change, browser flag bypass or alternate-engine bypass was attempted.

The reusable normal-case diagnostic is `/workspace/audit-work/code/workers/jsxgraph-diagnostic.mjs`; the compact test summary is `/workspace/audit-work/inventory/jsxgraph-own-suite-diagnostic.json`. Raw decoded frame, screenshot and console/DOM report remain under `/tmp/ctm-jsxgraph-diagnostic*`, outside repository deliverables. The script waits only 1.5 s after load and captures frame URL, document state, scripts and page/console errors; it does not repeat all five 30 s timeouts.
