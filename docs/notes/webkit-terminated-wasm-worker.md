# WebKit: a terminated worker keeps running WebAssembly

Investigation notes, 28 October 2026. These are diagnostic findings for AC, not a decision. No deployed runtime file was changed. The prototypes live on the diagnostic branch [`claude/epic-bell-ne4tnu-diag`](https://github.com/Erasmus-CTM/ctm-assessment/tree/claude/epic-bell-ne4tnu-diag/tools/wkz), which is not for merge.

**How claims are marked**

- **[measured]**: CI measurement; the link goes to the job log.
- **[source]**: read in WebKit or CPython source; the link is pinned to a commit.
- **[inferred]**: reasoning that goes beyond what was measured or read.

All job links are listed in [§10](#10-evidence-index). CI runs:
- smoke: [40670907284](https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40670907284)
- matrix: [40674684033](https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40674684033)
- host-call callbacks / warm Pyodide: [40678458756](https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40678458756)
- WKWebView environment: [40678667490](https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40678667490)

The minimal repro for WebKit is [`webkit-terminated-wasm-worker-repro.html`](webkit-terminated-wasm-worker-repro.html), next to this file.

## 1. Summary

1. **Mechanism (confirmed).** `worker.terminate()` only sets a JavaScriptCore trap bit and kills the worker's run loop. There is no timeout and no thread or process kill for dedicated workers. [source]
   - **Wasm never checks the bit inside a loop.** IPInt, BBQ and OMG have no check at loop back-edges. BBQ and OMG prologues ignore the stop request; only the IPInt (interpreter) prologue honours it, and only since August 2025. [source]
   - **Signal-based delivery doesn't help.** On Apple silicon the trap is delivered by suspending the thread every 1 ms and patching *JS* code. That does nothing while the thread is in wasm. [source]
   - **Our guess was right, and incomplete.** A wasm→JS call lands termination only while the JS callee is still interpreted or Baseline-compiled. Once the callee is DFG/FTL-optimized (after ~1000 calls), landing depends on a 1 ms sample happening to hit the callee. [measured, §3.3–3.4]
   - **Confirmed by experiment:**
     - with `JSC_usePollingTraps=1` every JS call terminates within ≤52 ms;
     - with `JSC_useJIT=0` all JS-call variants terminate, but pure wasm loops still do not.
2. **Scope.**
   - **Every WebKit tested** has it: Safari 26.6, 26.6.1 and 26.6.2 (macOS 14, 15, 26), Safari Technology Preview (UA 27.0), Playwright WebKit 18.2, 26.0 and 26.6 (macOS and Linux/WPE), the iOS 26.2 Simulator, and a WKWebView app (as SEB uses). [measured]
   - **What leaks:** pure loops, memory ops, wasm→wasm `call` and `call_indirect`, `memory.grow`, wasm exceptions, and calls to native imports. [measured]
   - **Every worker type:** dedicated, module, nested, SharedWorker, and both isolated and non-isolated pages. [measured]
   - **SEB lever:** an embedding app can pass `__XPC_JSC_usePollingTraps=1` to WKWebView. In my test app that made every JS callback terminate deterministically; it does not help pure wasm loops. [measured]
   - **Main-thread loops are never interrupted** either: no slow-script dialog, and navigation away times out. [measured, source]
   - **Chromium** stops every case after ~2 s. [measured]
3. **Zombie lifetime.**
   - **What ends it:** only the content process exiting. [measured]
   - **Safari is worst.** The zombie survived same-origin navigation, reload, bfcache, iframe removal, cross-site navigation, and even closing the tab: WebKit caches a closed page's process for up to 30 minutes. [measured, source]
   - **Other hosts:** in Playwright WebKit and a plain WKWebView app, closing the tab or app, or a cross-site navigation, ended it. [measured]
   - **What it costs:** the zombie keeps its wasm memory (+260 MB RSS for a 256 MB heap in Safari) and writes to shared memory. With 3–4 zombies, a fresh worker took 0.5–1.6 s to start instead of 7–19 ms. [measured]
   - **What it cannot do:** reach `postMessage`, `fetch` or IndexedDB without calling JS, and such a call is where termination lands. [measured, source]
   - **iOS Simulator:** backgrounding Safari suspended the zombie in 3 of 4 runs; foregrounding resumed it. [measured]
4. **Pyodide with ctm-libs#60.**
   - **Depends on the worker's history.** The fix works while the interrupt callback is still "cold". After the worker has run Python for a while (the callback is JIT-compiled), Stop still leaks for C-heavy loops: `sum(range(10**6))`, `sorted`, `json.loads`, `re`, NumPy, and short C calls in a loop. Pure-Python loops, big-int arithmetic, `time.sleep`, hashing and recursion still stop. [measured, §5]
   - **A single long C call** (`sum(range(10**11))`) leaks in every variant. [measured]
5. **Best mitigation found.**
   - **The change:** give CPython an interrupt "buffer" whose `[0]` getter makes one cheap host call (`JSON.parse('0')` or `Reflect.apply`). The host call checks the trap bit regardless of tier, so termination lands at the next callback. [measured, §6]
   - **Effect:** with a warm callback, every C-heavy pattern that leaked with `Uint8Array(1)` stopped, in Safari 26.6.1 and WebKit 26.0 and 26.6. [measured]
   - **Cost:** not measurable in Safari; +4% to +30% in single WebKit runs, on a worst-case empty Python loop. [measured]
   - **What it is:** a one-function change to `pyodide-worker.js`, so it needs a P13 lock. It does not need SharedArrayBuffer and works on plain LAN HTTP.
   - **Residual:** a single long-running C call still leaks.
6. **Isolation.** Plain-HTTP LAN IPs are not secure contexts in WebKit. COOP/COEP headers then give no isolation, and `navigator.serviceWorker` is undefined, so coi-serviceworker cannot work there. [measured]
7. **Upstream.** WebKit [289686](https://bugs.webkit.org/show_bug.cgi?id=289686) (2025) reported exactly this and was closed after only its `atomic.wait` part was fixed. [328618](https://bugs.webkit.org/show_bug.cgi?id=328618) (23 Oct 2026, NEW) is the open report. A comment for 328618 is drafted in §7; **not filed**.

## 2. Mechanism

Source read at WebKit `main` [`67584e6`](https://github.com/WebKit/WebKit/commit/67584e641e47bf541775cc6cd0e9f883793f1240) (28 October 2026). Links below are pinned to that commit.

### 2.1 What `worker.terminate()` does

1. `Worker::terminate` calls `WorkerMessagingProxy::terminateWorkerGlobalScope`, which calls `WorkerOrWorkletThread::stop(nullptr)` without a completion callback. [source: [Worker.cpp#L175-L179](https://github.com/WebKit/WebKit/blob/67584e641e47bf541775cc6cd0e9f883793f1240/Source/WebCore/workers/Worker.cpp#L175-L179), [WorkerMessagingProxy.cpp#L509-L522](https://github.com/WebKit/WebKit/blob/67584e641e47bf541775cc6cd0e9f883793f1240/Source/WebCore/workers/WorkerMessagingProxy.cpp#L509-L522)]
2. `stop` does two things and returns ([WorkerOrWorkletThread.cpp#L257-L312](https://github.com/WebKit/WebKit/blob/67584e641e47bf541775cc6cd0e9f883793f1240/Source/WebCore/workers/WorkerOrWorkletThread.cpp#L257-L312)):
   - It asks the script controller to terminate execution. That ends in `VM::notifyNeedTermination()`, which only sets the `NeedTermination` trap bit ([VM.h#L1079](https://github.com/WebKit/WebKit/blob/67584e641e47bf541775cc6cd0e9f883793f1240/Source/JavaScriptCore/runtime/VM.h#L1079), [WorkerOrWorkletScriptController.cpp#L133-L147](https://github.com/WebKit/WebKit/blob/67584e641e47bf541775cc6cd0e9f883793f1240/Source/WebCore/workers/WorkerOrWorkletScriptController.cpp#L133-L147)).
   - It posts a cleanup task and kills the worker's message queue (`postTaskAndTerminate`).
3. There is no wait, join, timeout, thread kill or process kill for dedicated workers. [source: the same functions; inferred from their absence]
   - Service workers do have a fallback: a timer that kills the service-worker process ([SWContextManager.cpp#L215-L224](https://github.com/WebKit/WebKit/blob/67584e641e47bf541775cc6cd0e9f883793f1240/Source/WebCore/workers/service/context/SWContextManager.cpp#L215-L224), [#L271-L289](https://github.com/WebKit/WebKit/blob/67584e641e47bf541775cc6cd0e9f883793f1240/Source/WebCore/workers/service/context/SWContextManager.cpp#L271-L289)).
4. The page stops seeing the worker at once: `hasPendingActivity` turns false once termination was asked for ([Worker.cpp#L202-L205](https://github.com/WebKit/WebKit/blob/67584e641e47bf541775cc6cd0e9f883793f1240/Source/WebCore/workers/Worker.cpp#L202-L205)), and messages to and from it are dropped. [source]
5. An idle worker exits because killing the queue wakes its run loop ([WorkerRunLoop.cpp#L220-L247](https://github.com/WebKit/WebKit/blob/67584e641e47bf541775cc6cd0e9f883793f1240/Source/WebCore/workers/WorkerRunLoop.cpp#L220-L247)). A busy worker can only exit by returning from the running script, which needs a `TerminationException` to unwind it. [source]

### 2.2 How the trap bit is noticed

JavaScriptCore notices a pending trap only at polling points. On Apple-silicon and x86-64 builds, signal-based traps are compiled in ([PlatformEnable.h#L965-L967](https://github.com/WebKit/WebKit/blob/67584e641e47bf541775cc6cd0e9f883793f1240/Source/WTF/wtf/PlatformEnable.h#L965-L967)), and `usePollingTraps` defaults to false ([OptionsList.h#L551](https://github.com/WebKit/WebKit/blob/67584e641e47bf541775cc6cd0e9f883793f1240/Source/JavaScriptCore/runtime/OptionsList.h#L551)).

| Code | Termination check | Source |
|---|---|---|
| JS in LLInt (interpreter) | `op_enter` (every call) and every loop hint | [LowLevelInterpreter64.asm#L860-L863](https://github.com/WebKit/WebKit/blob/67584e641e47bf541775cc6cd0e9f883793f1240/Source/JavaScriptCore/llint/LowLevelInterpreter64.asm#L860-L863), [LowLevelInterpreter.asm#L2483-L2500](https://github.com/WebKit/WebKit/blob/67584e641e47bf541775cc6cd0e9f883793f1240/Source/JavaScriptCore/llint/LowLevelInterpreter.asm#L2483-L2500) |
| JS in Baseline JIT | fast check in `op_enter` and loop hints | [JITOpcodes.cpp#L1391](https://github.com/WebKit/WebKit/blob/67584e641e47bf541775cc6cd0e9f883793f1240/Source/JavaScriptCore/jit/JITOpcodes.cpp#L1391) |
| JS in DFG/FTL | none by default; only an `InvalidationPoint`, made live by the signal sender. `CheckTraps` only with `usePollingTraps` | [DFGByteCodeParser.cpp#L7827-L7830](https://github.com/WebKit/WebKit/blob/67584e641e47bf541775cc6cd0e9f883793f1240/Source/JavaScriptCore/dfg/DFGByteCodeParser.cpp#L7827-L7830) |
| C++ runtime with an exception scope | `RETURN_IF_EXCEPTION` handles pending traps | [ExceptionScope.h#L131-L137](https://github.com/WebKit/WebKit/blob/67584e641e47bf541775cc6cd0e9f883793f1240/Source/JavaScriptCore/runtime/ExceptionScope.h#L131-L137) |
| Wasm IPInt (interpreter) | function prologue only, since 298805@main (Aug 2025) | [InPlaceInterpreter.asm#L415-L441](https://github.com/WebKit/WebKit/blob/67584e641e47bf541775cc6cd0e9f883793f1240/Source/JavaScriptCore/llint/InPlaceInterpreter.asm#L415-L441), [WasmIPIntSlowPaths.cpp#L1451-L1470](https://github.com/WebKit/WebKit/blob/67584e641e47bf541775cc6cd0e9f883793f1240/Source/JavaScriptCore/wasm/WasmIPIntSlowPaths.cpp#L1451-L1470) |
| Wasm IPInt `loop` | none; tier-up counter only | [InPlaceInterpreter64.asm#L286-L291](https://github.com/WebKit/WebKit/blob/67584e641e47bf541775cc6cd0e9f883793f1240/Source/JavaScriptCore/llint/InPlaceInterpreter64.asm#L286-L291) |
| Wasm BBQ (baseline JIT) | none; the prologue compares the plain stack limit, and the loop header has only an OMG tier-up counter (a no-throw operation) | [WasmBBQJIT.cpp#L3337-L3344](https://github.com/WebKit/WebKit/blob/67584e641e47bf541775cc6cd0e9f883793f1240/Source/JavaScriptCore/wasm/WasmBBQJIT.cpp#L3337-L3344), [#L3646-L3711](https://github.com/WebKit/WebKit/blob/67584e641e47bf541775cc6cd0e9f883793f1240/Source/JavaScriptCore/wasm/WasmBBQJIT.cpp#L3646-L3711), [WasmOperations.cpp#L893](https://github.com/WebKit/WebKit/blob/67584e641e47bf541775cc6cd0e9f883793f1240/Source/JavaScriptCore/wasm/WasmOperations.cpp#L893) |
| Wasm OMG (optimizing JIT) | none; the prologue compares the plain stack limit | [AssemblyHelpers.cpp#L2045-L2060](https://github.com/WebKit/WebKit/blob/67584e641e47bf541775cc6cd0e9f883793f1240/Source/JavaScriptCore/jit/AssemblyHelpers.cpp#L2045-L2060) |

The commit that added the IPInt prologue check says JIT tiers were left for later. 37f1943 / 298805@main, [bug 297402](https://bugs.webkit.org/show_bug.cgi?id=297402), "Add VMTraps stop-the-world using stack checks [Interpreters only for now]":

> "For now, none of the stack checks in JIT generated code are changed to check m_trapAwareSoftStackLimit."

### 2.3 The signal sender cannot help in wasm

With signal traps, `VMTraps::SignalSender` works like this ([VMTraps.cpp#L283-L343](https://github.com/WebKit/WebKit/blob/67584e641e47bf541775cc6cd0e9f883793f1240/Source/JavaScriptCore/runtime/VMTraps.cpp#L283-L343), [#L93-L167](https://github.com/WebKit/WebKit/blob/67584e641e47bf541775cc6cd0e9f883793f1240/Source/JavaScriptCore/runtime/VMTraps.cpp#L93-L167)):

1. Every 1 ms while a trap is pending, it suspends the worker thread and walks its stack for a JS `CodeBlock`.
2. It patches breakpoints only into DFG/FTL code ([CodeBlock.cpp#L3658-L3672](https://github.com/WebKit/WebKit/blob/67584e641e47bf541775cc6cd0e9f883793f1240/Source/JavaScriptCore/bytecode/CodeBlock.cpp#L3658-L3672)).

Wasm frames hold an instance pointer, not a `CodeBlock`, so a thread inside wasm gives it nothing to patch. It returns ("Let the SignalSender try again later") and retries 1 ms later, forever. [source]

### 2.4 Consequences, confirmed by experiment

- **Pure wasm loop, wasm→wasm calls and `memory.grow`:** no tier checks the trap, so terminate never lands. [measured, §3; source above]
- **wasm→JS call:**
  - Termination lands at the next call while the JS callee is still interpreted (LLInt) or in Baseline, roughly its first ~500–1000 calls ([OptionsList.h#L369-L372](https://github.com/WebKit/WebKit/blob/67584e641e47bf541775cc6cd0e9f883793f1240/Source/JavaScriptCore/runtime/OptionsList.h#L369-L372)).
  - Once the callee is DFG/FTL-compiled, it lands only if a 1 ms sample happens to find the thread inside the callee. The expected time therefore grows with the interval between calls. [measured, §3.3; inferred from source]
- **`JSC_usePollingTraps=1`** turns the DFG/FTL entry check into a real poll, and every wasm→JS call then terminates within one call. [measured, §3.4]
- **Interpreter-only wasm** (`JSC_useBBQJIT=0 JSC_useOMGJIT=0`) also stops at the next wasm function entry, but only in builds with 298805@main. WebKit 26.6 has it; Playwright's WebKit 26.0 build does not. [measured, §3.4]
- **A JS `for(;;)` loop** in a worker stops at once in every WebKit tested: its loop hint polls, or is patched by the signal sender. [measured]

## 3. Scope matrix

**Method** ([`tools/wkz`](https://github.com/Erasmus-CTM/ctm-assessment/tree/claude/epic-bell-ne4tnu-diag/tools/wkz)):
- Each experiment opens a fresh browser, app or simulator Safari on a self-driving page.
- The page starts 2 workers (1 for lifetime and Pyodide), waits 0.5 s (1.5 s for Pyodide), calls `terminate()`, and reports each phase to a local server.
- At each phase the server samples the content processes:
  - CPU from cumulative process time over a 2 s window (`ps` on macOS, `/proc` on Linux);
  - thread count, running threads and RSS.
- "Leak" is content-process CPU 8–10 s after `terminate()` minus the baseline before the workers started, in cores. One spinning zombie ≈ 1.0.

The runners are GitHub-hosted macOS 14/15/26 (Apple silicon; the page sees 4 logical cores) and Ubuntu 24.04 (4 vCPU). Each cell is one run unless stated. Cases that depend on JIT timing are probabilistic (§3.3), so a single clean or leaking run of those is not a rate.

### 3.1 Engines

| Engine | Pure wasm loop after terminate | Evidence |
|---|---|---|
| Safari 26.6.1, macOS 15.7 | leaks (2 workers → 2.0 cores) | [measured][s15] |
| Safari 26.6, macOS 14 | leaks | [measured][s14] |
| Safari 26.6.2, macOS 26.6 | leaks | [measured][s26] |
| Safari Technology Preview (Homebrew cask, UA `Version/27.0`), macOS 26 | leaks | [measured][stp] |
| WKWebView host app (system WebKit, macOS 15), as in SEB | leaks | [measured][wkapp] |
| iOS 26.2 Simulator, MobileSafari | leaks | [measured][sim26a], [measured][sim26b] |
| Playwright WebKit 18.2 (1.49.1), macOS | leaks | [measured][pw149] |
| Playwright WebKit 26.0 (1.55.1, the repo's pin), macOS and Linux/WPE | leaks | [measured][pw155full], [measured][lin155] |
| Playwright WebKit 26.6 (1.63.0), macOS and Linux/WPE | leaks | [measured][pw163mac], [measured][lin163] |
| Chromium 140 (control) | stops after ~2 s | [measured][chromium] |

Not covered:
- **Safari 18:** no runner image has it. `macos-14` already ships Safari 26.6.
- **Safari 27:** it is only on macOS 27, which no runner has. Bug 328618 reports the same behaviour in Safari 27.0.1 and STP 255.
- **iOS 18 runtime and real iOS devices:** neither is available on the runners.

### 3.2 Loop shapes, worker types, isolation

Results are cores still busy ≈ 8 s after terminating 2 workers (1.0 means one worker stopped and one did not).

| Case | Safari 26.6.1 | Playwright WebKit 26.0 macOS | STP (UA 27.0) | Chromium 140 |
|---|---|---|---|---|
| idle worker (control) | 0 | 0 | 0 | 0 |
| `(loop br 0)` | 2.0 | 2.0 | 2.0 | 0 |
| loads/stores to memory | 2.0 | 2.0 | | |
| wasm→wasm `call` | 2.0 | 2.0 | 2.0 | 0 |
| `call_indirect` | 2.0 | 2.0 | | |
| `memory.grow 0` (runtime call) | 2.0 | 2.0 | 2.0 | 0 |
| `throw`/`catch` (legacy EH) | 1.0 | 1.8 | | |
| JS `for(;;){}` | 0 | 0 | 0 | 0 |
| JS import every iteration | 0 | 0 | 0 | 0 |
| JS import that runs 200 ms of JS | 0 | 0 | | |
| native import (`Math.random`) every iteration | **2.0** | **2.0** | | |
| native import every 2^20 iterations | 2.0 | 2.0 | | |
| JS import every 2^20 iterations (~0.3 ms) | 1.0 | 1.0 | 0 | 0 |
| … after a 10 s hold | 2.0 | 2.0 | 2.0 | 0 |
| … callee pre-warmed (10^6 calls) | 2.0 | 2.0 | 2.0 | 0 |
| JS import every 2^24 iterations, pre-warmed | 2.0 | 1.6 | | |
| module worker | 2.0 | 2.0 | | |
| nested: page terminates the parent | 2.0 | 2.0 | | |
| nested: parent terminates the child | 2.0 | 2.0 | | |
| SharedWorker, page navigates away | 1.0 (1 worker) | 1.0 (1 worker) | | |
| cross-origin isolated page | 2.0 | 2.0 | | |

Sources: Safari [measured][s15full], Playwright WebKit [measured][pw155full], STP [measured][stp], Chromium [measured][chromium]. The smoke run on Safari 26.6.1 agrees ([measured][s15]).

The native-import row matters. A host function called from wasm does not poll the trap bit, so "calls something every iteration" is not enough; it has to be a *JS* function that is not yet optimized. [measured, source: §2.2]

### 3.3 Time to stop vs. how often the loop calls JS

Each worker stores an iteration counter in shared memory, so the page can see exactly when a terminated worker stops. The loop calls a trivial JS import every 2^k iterations, from about 80 ns (k = 8) to about 1.3 s (k = 32). "Pre-warmed" means the import was called 10^6 times from JS first, so it is already optimized. Cells are the two workers' stop times; "–" means not stopped within 20 s.

| k | WebKit 26.6 Linux | pre-warmed | Safari 26.6.1 | pre-warmed | STP | pre-warmed | Chromium | WebKit 26.0 Linux, `usePollingTraps=1` |
|---|---|---|---|---|---|---|---|---|
| 0 | 51 / 51 ms | 0 / 51 | 51 / 51 | 0 / 51 | 51 / 51 | 51 / 51 | 2.1 s | 0 / 0 |
| 8 | 101 / 51 | 51 / 51 | 53 / 53 | 51 / 155 | 206 / 519 | 153 / 512 | 2.1 s | 0 / 0 |
| 12 | 866 / 606 | 151 / 151 | 1313 / 6200 | 3065 / 1676 | 725 / 2114 | 3256 / 307 | 2.0 s | 0 / 0 |
| 16 | 7678 / 814 | 5079 / 6691 | 721 / 2978 | 13077 / 1142 | 17810 / 3276 | 8499 / 727 | 2.0 s | 0 / 0 |
| 20 | – / – | – / – | 0 / 51 | 2156 / – | 53 / 53 | 1998 / – | 2.1 s | 0 / 0 (pre-warmed 51 / 51) |
| 24 | 51 / 0 | 51 / 51 | 53 / 53 | 52 / 52 | 51 / 51 | 946 / 1000 | 2.0 s | 51 / 51 |
| 32 (first call ~1–3 s in) | 608 / 608 | | 2868 / 2925 | | 3210 / 3321 | | 2.1 s | 1606 / 1606 |

Sources: [measured][lin163], [measured][s15full], [measured][stp], [measured][chromium], [measured][lin155poll]. Playwright WebKit 26.0 and 26.6 on macOS behave the same way ([measured][pw155full], [measured][pw163mac]). The same probe with `usePollingTraps=1` on macOS stopped every case within ≤53 ms or at the first call: [measured][mac155poll].

How to read the table:
- **Rare calls (k = 24, 32):** the callee has been called fewer than ~500 times, so it still runs in the interpreter, which checks the trap at every call. Termination lands at the next call.
- **Frequent calls (k ≤ 8):** the callee is optimized, but the thread spends so much time inside it that the 1 ms sampler catches it within ~50–500 ms.
- **In between (k = 12–20):** the callee is optimized and rarely sampled. Landing takes seconds or never happens.
- **With `usePollingTraps`** optimized code polls too, and every k stops at the next call.

The pattern matches §2.2–2.3. [measured, inferred]

### 3.4 JSC options (Playwright WebKit; `JSC_*` env, `__XPC_JSC_*` on macOS)

The options take effect: with `JSC_useWasm=0` the page sees no `WebAssembly`, on Linux and on macOS (Playwright's WebKit.framework). [measured][lin155canary], [measured][mac155canary]

| Option | Pure loop | wasm→wasm call | JS every 2^20 (warm callee) | Pyodide `sum(range(10**6))` | Pyodide `sum(range(10**11))` (one C call) |
|---|---|---|---|---|---|
| default, 26.0 | leaks | leaks | leaks | stops (fresh worker) | leaks |
| `usePollingTraps=1`, 26.0 | leaks | leaks | **stops** | stops | leaks |
| `useJIT=0`, 26.0 | leaks | leaks | **stops** | leaks (inferred: the next callback is ~25 s away when interpreted) | leaks |
| `useBBQJIT=0 useOMGJIT=0`, 26.0 | leaks | leaks | mixed (10 s hold leaks; pre-warmed stops) | leaks | leaks |
| `useBBQJIT=0 useOMGJIT=0`, **26.6** | leaks | **stops** | leaks | **stops** | **stops** |

Sources:
- 26.0 Linux: [default][lin155], [polling][lin155poll], [nojit][lin155nojit], [ipint][lin155ipint]
- 26.6 Linux: [ipint][lin163ipint]
- macOS: [polling][mac155poll], [ipint][mac155ipint]

What the table shows:
- Playwright's WebKit 26.0 build predates the IPInt prologue check (298805@main); 26.6 has it. [measured, inferred]
- Even with every wasm function interpreted, the pure loop never stops, because a loop that makes no calls never reaches a prologue. [measured, source]
- **For SEB:** the embedding app's environment does reach the WKWebView content process. In my WKWebView host app, `JSC_useWasm=0` passed as `__XPC_JSC_useWasm=0` removed WebAssembly, and `__XPC_JSC_usePollingTraps=1` made every JS-call case stop within ≤52 ms, including the pre-warmed sparse callee that never stopped by default, and made Pyodide `sum(range(10**6))` stop. The pure loop, the wasm→wasm call and a single long C call still leaked. [measured][r3bcanary], [measured][r3bpoll], default for comparison [measured][r3bdefault]. Whether a signed, hardened app such as SEB gets the same behaviour was not tested.

### 3.5 Main thread

A main-thread wasm loop and a main-thread JS `for(;;)` both kept one core busy for 25 s or more.
- Navigating away timed out after 20 s, through Playwright in WebKit and through WebDriver in Safari. [measured][pw155full], [measured][s15full]
- The loop ended only when the browser session was closed.
- WebCore installs no JSC watchdog (no `ensureWatchdog`/`setTimeLimit` in `Source/WebCore` or `Source/WebKit`) and has no slow-script termination for pages or workers. The window's `shouldInterruptScript` is only consulted when a watchdog exists ([JSDOMWindowBase.cpp#L214-L232](https://github.com/WebKit/WebKit/blob/67584e641e47bf541775cc6cd0e9f883793f1240/Source/WebCore/bindings/js/JSDOMWindowBase.cpp#L214-L232)). [source]
- Even a watchdog would use the same trap delivery, so it could not interrupt a wasm loop. [inferred]

### 3.6 Isolation and plain-HTTP LAN

| Page origin | `isSecureContext` | `crossOriginIsolated` with COOP/COEP | `SharedArrayBuffer` | `navigator.serviceWorker` |
|---|---|---|---|---|
| `http://127.0.0.1` | true | true | yes | yes |
| `http://<LAN IP>` | **false** | **false** | no | **undefined** |

The same result was seen in every WebKit tested (Safari 26.6.1/26.6.2, STP, WKWebView, iOS Simulator, Playwright WebKit). [measured][s26], [measured][stp], [measured][wkapp], [measured][sim26a], [measured][pw155full]

So on plain-HTTP LAN deployments:
- the COOP/COEP headers do nothing;
- coi-serviceworker cannot register;
- there is no SharedArrayBuffer interrupt buffer.

Stop is then always the hard restart. [measured; runtime logic: [`pyodide-runtime.js` `stop()`](https://github.com/Erasmus-CTM/ctm-libs/blob/a144d2a/_extensions/ctm-libs/runtime/pyodide-runtime.js#L585)]

## 4. Lifetime and side effects of a zombie

| Event after the zombie exists | Playwright WebKit 26.0 | WKWebView app | iOS 26.2 Simulator | Safari 26.6.1 | Chromium |
|---|---|---|---|---|---|
| same-origin navigation (terminated first) | survives | survives | survives | survives | ends |
| same-origin navigation with the worker still live | survives | | | survives | ends |
| reload | survives | survives | survives | survives (also after the WebDriver session ended) | ends |
| back/forward (navigate, then `history.back()`) | survives (fresh load) | | | survives; the page is restored from bfcache with the zombie still spinning | ends |
| remove the iframe that created it | survives | | | survives | ends |
| cross-site navigation (127.0.0.1 → localhost) | **ends** (process swap) | **ends** | unclear (new process at ~0.6 core) | **survives** (1 core 10 s later) | ends |
| close the tab or window / quit the app | **ends** | **ends** | **ends** (Safari terminated) | **survives** (1 core 10 s after closing; process cache, see below) | ends |

Sources: [measured][pw155full], [measured][wkapp], [measured][sim26a], [measured][sim26b], [measured][chromium], Safari [measured][s15full].

**Why closing the tab does not end it in Safari:**
- On Apple platforms WebKit keeps a closed page's content process in its `WebProcessCache` for reuse. A cached process lives up to 30 minutes, or 5 minutes after the app goes to the background, and loses its background activity after 30 s ([WebProcessCache.cpp#L47-L56](https://github.com/WebKit/WebKit/blob/67584e641e47bf541775cc6cd0e9f883793f1240/Source/WebKit/UIProcess/WebProcessCache.cpp#L47-L56)). [source]
- The zombie lives in that process. In Safari it kept spinning for the full 10 s after the tab closed and through the end of the WebDriver session. [measured][s15full]
- Whether it is throttled once the 30 s background-activity grace ends was not measured; the window ended at ~12 s.
- Inferred: a learner who closes and reopens the exam tab in Safari may get the *same* process back, zombies included. Only quitting Safari, or the cache evicting the process, reliably ends it.
- A plain WKWebView app with the default configuration terminated the process when the app quit (measured) and on cross-site navigation (measured). SEB's own configuration was not tested.

**Side effects:**
- **CPU:** one core per zombie, indefinitely. [measured]
- **Memory:** a zombie that allocated and touched 256 MB kept the content process at 348 MB, against 93 MB for the same worker terminated while idle, in Playwright WebKit 26.0. In Safari it was 486 MB against 226 MB. The memory is not released. [measured][pw155full], [measured][s15full]
- **Shared memory (isolated pages):** the zombie keeps writing.
  - In the landing probe (§3.3), every "–" cell is a terminated worker whose shared-memory counter kept advancing for the whole 20 s.
  - In the shared-memory variant, CPU stayed up 15 s after terminate.
  - [measured][s15full], [measured][lin163], [measured][pw155full]
- **`postMessage`, `fetch`, IndexedDB:**
  - Without calling JS, a wasm zombie cannot reach any of them.
  - With calls, the first host call it makes is where termination lands. A pre-warmed sparse-callback worker that also tried `postMessage`/`fetch`/IndexedDB every 250 ms stopped, and the server saw no request after `terminate()` (`fetchHitsAfterTerminate: 0`). [measured][pw155full]
  - This agrees with §6.1: host calls check the trap. [source]
  - Inferred: a zombie cannot touch the network or storage; its harm is CPU, memory, and anything it shares through SharedArrayBuffer.
- **Other work in the process:** each zombie takes a whole core. Pages are not separated:
  - In Safari, the earlier evidence showed idle Pyodide restarts taking 12–18 s instead of ~2 s after a few zombies.
  - Here, starting a fresh worker took 7–19 ms with 0–2 zombies, 1.2–1.6 s with 3–4 zombies in Playwright WebKit, and 0.5–0.8 s in Safari. [measured][pw155full], [measured][s15full]
- **Other tabs:** zombies in one tab's process do not run in other tabs' processes. They do compete for the same cores, so the whole machine slows once zombies outnumber idle cores. [inferred from the CPU accounting]
- **iOS background and memory pressure** (Simulator):
  - With Safari in the background (Settings app foreground), the zombie's CPU fell to ~0.1 core after 15 s in 3 of 4 runs: the process was suspended, not killed.
  - Back in the foreground it resumed at one core.
  - The WebKit low-memory notification (`org.WebKit.lowMemory`) did not end it.
  - [measured][sim26a], [measured][sim26b]
  - A real device under jetsam memory pressure may kill the whole content process, which would end the zombie and the exam page with it. Not tested.

## 5. Pyodide exposure with ctm-libs#60

**Setup:**
- Pyodide 0.28.3 (CPython 3.13.2) in a minimal worker that mirrors #60: `setInterruptBuffer(new Uint8Array(1))` right after `loadPyodide`.
- The runaway program runs for 1.5 s, then the worker is terminated.
- "Fresh" means the worker ran nothing else first. "Warm" means it first ran `for _ in range(2*10**6): pass`, which calls the interrupt callback ~80 000 times and gets it optimized, as in an IDE session after a few runs.

**Why it behaves this way:**
- CPython calls the JS callback `_Py_CheckEmscriptenSignals_Helper` once per 50 eval-breaker checks ([emscripten_signal.c](https://github.com/python/cpython/blob/v3.13.2/Python/emscripten_signal.c#L11-L54)).
- Those checks happen at backward jumps and after calls ([ceval_macros.h#L136-L143](https://github.com/python/cpython/blob/v3.13.2/Python/ceval_macros.h#L136-L143)).
- `PyErr_CheckSignals` also calls the callback directly ([signalmodule.c#L1790](https://github.com/python/cpython/blob/v3.13.2/Modules/signalmodule.c#L1790)). Big-int arithmetic and `str()` (`SIGCHECK` in [longobject.c](https://github.com/python/cpython/blob/v3.13.2/Objects/longobject.c#L105-L108)) call it, and so does `re` every 4096 steps ([sre_lib.h#L565](https://github.com/python/cpython/blob/v3.13.2/Modules/_sre/sre_lib.h#L565)).
- `sum()`, `sorted()`, `json.loads()` and NumPy kernels do not call it. [source]
- Whether termination then lands depends on the callback's JIT tier and call rate (§3.3).

| Pattern | Safari 26.6.1, fresh | Playwright WebKit 26.0, fresh | Playwright WebKit 26.0, warm | Safari 26.6.1, warm |
|---|---|---|---|---|
| `while True: pass` without #60 (control) | leaks | leaks | | |
| `while True: pass` | stops | stops | stops | stops |
| `while True: sum(range(10**6))` | stops | stops | **leaks** | **leaks** |
| … after running 10 s | stops | stops | | |
| `sum(range(10**11))` (one C call) | **leaks** | **leaks** | **leaks** | **leaks** |
| `x = 7**200000` / `x*x` / `str(x)` loops | stop | stop | stop | stop |
| `re.match(r'(a+)+$', 'a'*40+'b')` (one call) | stops | **leaks** | **leaks** | **leaks** |
| `re` catastrophic match in a loop | stops (by 10 s) | stops | **leaks** | stops (by 10 s) |
| `time.sleep(5)` loop | stops | stops | stops | stops |
| `sorted()` of 10^6 floats, loop | **leaks** | **leaks** | **leaks** | **leaks** |
| `hashlib.sha256` of 100 MB, loop | stops | stops | stops | stops |
| `b'x' * 10**8`, loop | stops | stops | stops | stops |
| `json.loads` of a 10^6 list, loop | **leaks** | **leaks** | **leaks** | **leaks** |
| list comprehension loop | stops | stops | stops | stops |
| recursion to `RecursionError`, loop | stops (4–10 s) | partly (0.5 core at 10 s) | stops | stops |
| catches `KeyboardInterrupt` around `sum(range(10**6))` | stops | stops | **leaks** | **leaks** |
| NumPy `a @ a` (600×600), loop | **leaks** | **leaks** | **leaks** | **leaks** |
| NumPy `a.sum()` (10^7), loop | **leaks** | **leaks** | **leaks** | **leaks** |

Sources:
- fresh: [Safari][s15py], [Playwright][pw155py]
- warm: [Playwright][r3pw155warm], [Safari][r3s15warm]

**Length of the C call.** `while True: sum(range(n))` was swept from n = 10^3 to 10^7, measured at 0.03 to 780 ms per call. In a fresh worker:

| n | ms per call | Safari 26.6.1 | Playwright WebKit 26.0 |
|---|---|---|---|
| 10^3 | 0.03 | stops | leaks |
| 10^4 | 0.35–0.41 | leaks | leaks |
| 10^5 | 4.4–5.1 | stops | stops |
| 3·10^5 | 19–20 | stops | stops |
| 10^6 | 69–77 | stops | stops |
| 3·10^6 | 203–231 | stops | stops |
| 10^7 | 687–784 | stops | stops |

Sources: [Safari][s15py], [Playwright][pw155py].

There is no clean time threshold. The variable that matters is how often the callback runs compared with its JIT tier:
- **Short C calls (≤ ~0.5 ms):** the callback runs often enough to get optimized during the 1.5 s run, but too rarely to be sampled, so termination misses.
- **Long C calls in a fresh worker:** the callback stays interpreted, so termination lands at its next call, which is ≤ 50 checks after Stop.
- **Warm worker:** every C-heavy loop is exposed.

[measured, inferred from §3.3]

## 6. Mitigations

### 6.1 Candidates and what was measured

**A. Interrupt buffer whose read makes a host call** (prototype: `stopflag: 'getter-host:jsonparse'` / `'getter-host:apply'` / `'proxy-buffer'` in [`wkz-pyworker.js`](https://github.com/Erasmus-CTM/ctm-assessment/blob/claude/epic-bell-ne4tnu-diag/tools/wkz/wkz-pyworker.js))

Instead of `new Uint8Array(1)`, the worker passes an object whose `[0]` getter calls `JSON.parse('0')` (or `Reflect.apply`), or a `Proxy` around the array.
- **Why it works:** the C++ host path runs `RETURN_IF_EXCEPTION`, which services the pending termination in any JIT tier ([ExceptionScope.h#L131-L137](https://github.com/WebKit/WebKit/blob/67584e641e47bf541775cc6cd0e9f883793f1240/Source/JavaScriptCore/runtime/ExceptionScope.h#L131-L137)). [source]
- **Landing probe, pre-warmed callee, k = 16 and 20:**
  - `JSON.parse('0')`, `Reflect.apply`, `eval`, `Proxy` stopped within ≤57 ms in Safari 26.6.2, Safari 26.6.1, Playwright WebKit 26.0 (macOS) and 26.6 (Linux). [measured][r3s26host], [measured][r3s15host], [measured][r3pw155host], [measured][r3lin163host]
  - A plain arrow callee took 1.3–14 s or never stopped; in Safari 26.6.1 neither worker stopped within 20 s.
  - `JSON.stringify(0)` and, in WPE, `performance.now()` were not reliable.
- **Pyodide, warm callback, Playwright WebKit 26.6 Linux** ([measured][r3lin163host]):
  - `Uint8Array(1)` leaked for all five C-heavy patterns: `sum(range(10**6))` after 10 s, `sorted`, `json.loads`, `sum(range(10**4))`, `sum(range(10**7))`.
  - The `JSON.parse` getter, the `Reflect.apply` getter and the Proxy buffer stopped all five: by 1 s for the first, third and fourth, and by 4–10 s for `sorted` and `sum(range(10**7))`, i.e. after the C call in flight returns plus up to 50 checks.
  - Safari 26.6.1 and Playwright WebKit 26.0 (macOS) gave the same result: `Uint8Array(1)` leaked for all five, and the `JSON.parse` and `Reflect.apply` getters stopped all five. The Proxy buffer left `sum(range(10**7))` running once on 26.0, so it is the less robust choice. [measured][r3s15host], [measured][r3pw155host]
- **Cost** (empty Python loop of 3·10^6 iterations, the worst case at ~60 000 callbacks):
  - `Uint8Array(1)` 0.170 s, `JSON.parse` getter 0.177 s (+4%), `Reflect.apply` getter 0.179 s (+5%), Proxy 0.192 s (+13%). [measured][r3lin163host]
  - Same loop, single runs: Safari 26.6.1 0.184 / 0.178 / 0.144 / 0.135 s; Playwright WebKit 26.0 (macOS) 0.249 / 0.323 / 0.239 / 0.241 s. [measured][r3s15host], [measured][r3pw155host]
  - Run-to-run noise on these runners is about ±25%: the `Uint8Array(1)` baseline alone ranged from 0.134 to 0.184 s in Safari. So the getter cost is "not measurable" in Safari and between +4% and +30% in WebKit 26.x single runs. A repeated benchmark should settle it before shipping.
  - Real programs call the callback far less often than this loop does. [inferred]
- **Limits:**
  - A single long C call still leaks: it never reaches the callback until it returns.
  - When the page is cross-origin isolated, the runtime replaces the buffer with its SharedArrayBuffer (`setInterrupt`), so the same getter has to wrap the shared buffer: read `sab[0]` after the host call and forward writes.

**B. Stop flag polled from the callback (sync XHR to a revocable blob URL)** — prototype `stopflag: 'getter-xhr'`
- Chromium: soft stop in 245 ms (KeyboardInterrupt). [measured locally]
- Playwright WebKit 26.0: soft stop in 45 ms for `while True: pass`. [measured][pw155py]
- Safari 26.6.1: **no soft stop within 2 s for any pattern**, and a tight loop ran 9× slower (1.21 s against 0.13 s). [measured][s15py]
- **Rejected:** it does not work in Safari, costs a lot there, and only helps code that reaches the callback.

**C. Tune the interrupt-check frequency**
- `PY_EMSCRIPTEN_SIGNAL_INTERVAL` (50) is a compile-time constant in CPython ([emscripten_signal.c#L41](https://github.com/python/cpython/blob/v3.13.2/Python/emscripten_signal.c#L41)), so changing it needs a custom Pyodide build. [source]
- More frequent calls of an optimized callback raise the chance of a sample hit (k ≤ 8 lands in ≤0.5 s, §3.3) but do nothing for long C calls. [inferred]
- A is cheaper and deterministic. **Not recommended.**

**D. COOP/COEP isolation (SharedArrayBuffer interrupt, soft Stop)**
- When isolated, the runtime first interrupts and waits up to 2 s for idle before restarting ([`stop()`](https://github.com/Erasmus-CTM/ctm-libs/blob/a144d2a/_extensions/ctm-libs/runtime/pyodide-runtime.js#L585-L599)). For Python-level loops that avoids `terminate()` altogether.
- It is impossible on plain-HTTP LAN IPs, which are not secure contexts (§3.6, [measured]). It needs HTTPS or `localhost`.
- C-heavy loops still reach the hard restart after 2 s, and then leak like the non-isolated case unless A is also applied. [inferred]

**E. Reload the page or iframe instead of terminating** (§4)
- Reload, same-origin navigation, bfcache and iframe removal leave the zombie running. [measured]
- Only a process exit ends it. In Safari even closing the tab or a cross-site navigation left it running, because the process is cached for reuse (§4). In Playwright WebKit and the WKWebView app, closing the tab or app and a cross-site navigation ended it.
- Not usable inside an exam session. [inferred]

**F. JSC options from the embedding app (SEB only)**
- `__XPC_JSC_usePollingTraps=1` in the app's environment took effect in my unsigned WKWebView host app on macOS 15 (§3.4). [measured][r3bpoll]
- It makes every JS callback land termination deterministically (§3.4) at a small cost. It does nothing for pure wasm or long C calls, and only an app vendor can set it.
- Worth raising with the SEB developers, not something we can ship.

**G. Other ideas, not prototyped**
- **Fresh worker per run:** a fresh worker keeps the callback interpreted for its first ~1000 calls, but it costs a Pyodide start per run. A covers the same ground more cheaply.
- **Warn after a hard restart in WebKit:** count hard restarts and, after N, tell the learner how to free the CPU:
  - in Safari, quit Safari; closing the tab is not enough (§4);
  - in SEB, restart SEB (inferred).
- **Avoid hard restarts when the worker is idle:** an idle worker ends cleanly. [measured]

### 6.2 Ranking

| Rank | Mitigation | Effect | Cost | Exam-runtime risk |
|---|---|---|---|---|
| 1 | **A. Host-call interrupt buffer** (`JSON.parse('0')` getter; wrap the SAB the same way when isolated) | Closes every leak that reaches the eval breaker, in any JIT tier; tested in Safari 26.6.1 and 26.6.2 and WebKit 26.0/26.6 | Not measurable in Safari; +4% to +30% (single runs) in WebKit 26.x on a worst-case Python loop. One function in `pyodide-worker.js` (P13 lock) | Low. Same Pyodide API, but it relies on Pyodide reading `buffer[0]` (true in 0.28.3; recheck on upgrades) |
| 2 | D. HTTPS/localhost + COOP/COEP | Soft Stop for Python-level loops; no `terminate()` | Deployment change (certificates on the LAN server) | Medium. Not possible for plain-HTTP LAN; does not cover C-heavy code |
| 3 | G. Warn after N hard restarts in WebKit | Limits the damage that remains: long C calls | Small UI change (pyodide-interaktiv, P13 lock) | Low |
| 4 | F. Polling traps via SEB | Deterministic for callbacks | Outside our control | n/a |
| 5 | C. Tune check frequency | Probabilistic only | Custom CPython build | High |
| – | B. XHR stop flag | Fails in Safari | High in Safari | – |
| – | E. Reload instead of terminate | Does not free the thread | Loses state | – |

### 6.3 Recommendation for Safari and SEB deployments

- **Plain LAN HTTP (no isolation possible):**
  - Ship A (proposed below; needs an AC-approved P13 lock) so that hard restarts no longer leak for Python-level and most C-heavy code.
  - Keep #60's position, right after `loadPyodide`.
  - Optionally add G, to cover single long C calls.
- **Isolated (HTTPS or localhost, COOP/COEP or coi-serviceworker):**
  - Keep the soft Stop.
  - Apply A to the shared buffer too, so the 2 s fallback restart does not leak.
  - Isolation alone is not enough.

**Proposed change** (not applied; `pyodide-worker.js` and the generated `pyodide-worker-core.js` are P13-locked). A sketch for ctm-libs:

```js
// WebKit lands terminate() only where a host call checks pending traps; an
// optimised JS callback never does. Reading the buffer through JSON.parse
// makes every interrupt check such a point.
function interruptView(buffer) {
  return {get 0() { JSON.parse('0'); return buffer[0]; }, set 0(v) { buffer[0] = v; }};
}
pyodide.setInterruptBuffer(interruptView(new Uint8Array(1)));
// and in case "setInterrupt": pyodide.setInterruptBuffer(interruptView(msg.buffer));
```

`Reflect.apply(noop, undefined, [])` worked as well in every run. `JSON.parse('0')` is proposed because a JIT is less likely to turn it into an intrinsic that skips the C++ path. Either way, the landing probe (`plans.landhost`) should be part of the checks when the WebKit version changes. [inferred]

**For Safari learners:** after a hard restart that leaked, closing the tab is not enough (§4); quitting Safari is. For SEB, restarting SEB ends the processes. [measured for Safari tab close; inferred for quit]

Validation before shipping:
- Rerun ctm-libs `tests/worker.test.cjs` and the P13 probes (8× runaway Stop, idle restart) with C-heavy programs in Safari and WebKit.
- Check that `pyodide.checkInterrupt()` and KeyboardInterrupt still work with the shared buffer when isolated.
- Measure the cost on the exam's own Python checks.

## 7. Upstream

### 7.1 What already exists

All bug data was read through the Bugzilla REST API in CI ([bugzilla job][bugz]). bugs.webkit.org itself is not reachable from the investigation environment.

| Bug | State | What it says |
|---|---|---|
| [289686](https://bugs.webkit.org/show_bug.cgi?id=289686) "WebAssembly worker spin loop after `worker.terminate()` or page reload" (Mar 2025, Safari 18, macOS 15) | RESOLVED FIXED (20 Aug 2026, 319508@main) | Our issue, first reported 19 months ago. The reporter noted in comment 1 that the core problem remained: "a WebAssembly function that actively spins prevents a worker from being terminated". The fix that closed it ([03e836d](https://github.com/WebKit/WebKit/commit/03e836de2f7b)) only makes `Atomics.wait` / `memory.atomic.wait` terminable. |
| [328618](https://bugs.webkit.org/show_bug.cgi?id=328618) "Worker.terminate() does not stop a running WebAssembly function; the worker's Web Locks and OPFS access handles stay held until it returns" (23 Oct 2026, STP 255 / Safari 27.0.1, component WebAssembly) | NEW, no comments | Same engine gap, seen through a finite (~5 s) wasm call that holds a lock and an OPFS handle. It does not mention infinite loops, CPU, the thread leak, the trap mechanism or the JIT dependence. |
| [297402](https://bugs.webkit.org/show_bug.cgi?id=297402) "Add VMTraps stop-the-world using stack checks [Interpreters only for now]" | FIXED (298805@main, Aug 2025) | Added the IPInt prologue check. JIT support is "a future patch". |
| rdar://103455312 "[wasm] —watchdog should work for WebAssembly code" | Apple-internal | Cited in skipped JSTests ([omg-stack-overflow.js](https://github.com/WebKit/WebKit/blob/67584e641e47bf541775cc6cd0e9f883793f1240/JSTests/wasm/stress/omg-stack-overflow.js#L1-L2), [backwards-graph-multi-backedge-licm.js](https://github.com/WebKit/WebKit/blob/67584e641e47bf541775cc6cd0e9f883793f1240/JSTests/wasm/gc/backwards-graph-multi-backedge-licm.js#L96-L102)). Same root cause. |
| [JSTests/wasm/v8/worker-running-empty-loop-interruptible.js](https://github.com/WebKit/WebKit/blob/67584e641e47bf541775cc6cd0e9f883793f1240/JSTests/wasm/v8/worker-running-empty-loop-interruptible.js#L1-L36) | skipped | V8's test for exactly this case. It is skipped in JSC because the shell has no `Worker`, so the case is untested in WebKit. |

Elsewhere:
- [oven-sh/bun#44886](https://github.com/oven-sh/bun/issues/44886): Bun, which uses JSC, has the same symptom.
- [wasm-oj/forge#106](https://github.com/wasm-oj/forge/pull/106) works around it with an instrumented `Atomics.wait` safepoint.
- [browser-sqlite#10](https://github.com/lalexdotcom/browser-sqlite/issues/10) cites 328618.

The WebKit commit log up to `67584e6` (28 Oct 2026) has no commit that adds trap checks to wasm loops or to the BBQ/OMG prologues. [source: message search, 120 000 commits back to Sept 2018]

### 7.2 Recommendation

Add the material below as a comment on **328618**, which is open, current and in the WebAssembly component, rather than filing a duplicate. A new bug is only worth it if AC wants the infinite-loop thread leak tracked separately from 328618's lock/OPFS framing. The draft below works for either; for a new bug, use the title given and link 328618 and 289686.

**Not filed. AC decides.**

### 7.3 Draft (comment on 328618, or a new bug)

> **Title (if a new bug):** Worker.terminate() never stops a worker running a WebAssembly loop; the thread spins at 100% until the web process exits (no trap checks in wasm loops / BBQ / OMG prologues)
>
> **Component:** WebAssembly (or JavaScriptCore) · **Version:** Safari 26.6.1, Safari Technology Preview (UA 27.0, Oct 2026) · **OS:** macOS 14, 15, 26; iOS 26.2 Simulator; Linux WPE
>
> **Summary.** A dedicated worker that is executing a WebAssembly loop is not stopped by `worker.terminate()`.
> - For the page the worker is gone (no events, `hasPendingActivity` false).
> - Its thread keeps running, one core at 100% per worker, until the WebContent process exits.
> - In Safari that survives same-origin and cross-site navigation, reload, back/forward (the page is restored with the zombie still spinning), removing the iframe, and even closing the tab, because the process stays in `WebProcessCache`.
> - The thread keeps its wasm memory (RSS) and keeps writing to shared memory.
> - Chrome stops such workers after ~2 s.
>
> **Repro.** The attached `repro.html` (single file, inline wasm, no headers needed):
> 1. Serve it over HTTP and open it.
> 2. Click "Pure wasm loop `(loop br 0)`".
> 3. Watch the tab's web-content process in Activity Monitor: 2 workers stay at 200% CPU indefinitely.
>
> The other buttons are controls: a loop that calls JS every iteration, a JS `for(;;)`, and a loop calling a pre-warmed JS function every 2^20 iterations (that one leaks too).
>
> **Measured** (GitHub-hosted macOS runners; `ps` thread and CPU sampling of the WebContent process; 2 workers per case, terminated after 0.5 s, sampled 8 s later):
>
> | Loop body | Safari 26.6–26.6.2, STP (UA 27.0), WebKit 18.2–26.6, iOS 26.2 Simulator, WKWebView, WPE | Chrome |
> |---|---|---|
> | `(loop br 0)`, memory ops, wasm→wasm `call`, `call_indirect`, `memory.grow 0`, `throw`/`catch` | never stops | stops after ~2 s |
> | calls a native import (`Math.random`) | never stops | stops |
> | calls a JS import every iteration | stops | stops |
> | calls a JS import every ~0.3 ms after the import got DFG/FTL-compiled | usually does not stop within 20 s | stops |
> | JS `for(;;){}` | stops | stops |
>
> Time to stop when the loop calls a JS import every 2^k iterations, read from a shared-memory progress counter (Playwright WebKit 26.6, Linux):
> - k ≤ 8: ~50 ms
> - k = 12: 0.15–0.9 s
> - k = 16: 0.8–7.7 s
> - k = 20: > 20 s
> - with `JSC_usePollingTraps=1`: ≤ 52 ms for every k.
>
> **Cause (from source at 67584e6):**
> - `Worker::terminate` → `WorkerOrWorkletThread::stop` only fires `VMTraps::NeedTermination` and kills the run loop. There is no timeout or fallback for dedicated workers; service workers do have one (`SWContextManager::serviceWorkerFailedToTerminate`).
> - No wasm tier checks traps on loop back-edges:
>   - IPInt's `loop` has only the tier-up counter.
>   - BBQ's loop header only calls the NOEXCEPT `operationWasmTriggerOSREntryNow`.
>   - BBQ and OMG prologues compare the plain soft stack limit, not `m_trapAwareSoftStackLimit` (298805@main was "interpreters only").
> - The signal-based `SignalSender` only installs breakpoints in DFG/FTL JS CodeBlocks, so with the thread in wasm it retries every 1 ms forever.
> - A wasm→JS call lands termination only while the callee still polls (LLInt/Baseline `op_enter`), or when a 1 ms sample happens to catch the DFG/FTL callee.
> - Confirmed with `JSC_usePollingTraps=1` (every JS call terminates) and `JSC_useBBQJIT=0 JSC_useOMGJIT=0` (wasm→wasm calls terminate in WebKit 26.6; the pure loop still does not).
>
> **Impact.**
> - Python (Pyodide/CPython), SQLite and other interpreters compiled to wasm cannot be stopped from the page. An IDE's Stop button therefore leaks one spinning thread per press.
> - In Safari the leaked threads stay in the reused tab process. After a few of them, worker start-up goes from ~10 ms to 0.5–1.6 s on a 4-core CI Mac. Closing the tab does not recover it; quitting Safari does.
> - Exam and kiosk browsers built on WKWebView (e.g. Safe Exam Browser on macOS and iOS) have the same behaviour.
>
> **Suggested fix direction:** a trap check on wasm loop back-edges in IPInt, BBQ and OMG (the trap-aware stack limit or the trap bits; V8 and SpiderMonkey interrupt wasm loops), plus trap-aware prologues in BBQ and OMG. V8's `worker-running-empty-loop-interruptible.js` is already in `JSTests/wasm/v8/` and could be made runnable.
>
> Related: bug 289686 (closed after the `atomic.wait` part was fixed; the spinning-loop part remains) and rdar://103455312.

## 8. Method, limitations, reproduction

- **Tooling:** [`tools/wkz`](https://github.com/Erasmus-CTM/ctm-assessment/tree/claude/epic-bell-ne4tnu-diag/tools/wkz) on `claude/epic-bell-ne4tnu-diag`:
  - `wat/*.wat` → `wasm.js`;
  - `wkz.html` and `wkz-py.html` are the self-driving pages;
  - `server.mjs` is the static server plus the host sampler;
  - `drive.mjs` drives Playwright, Safari/STP through safaridriver, the iOS Simulator through `simctl openurl`, and a WKWebView app;
  - `ci.json` with `.github/workflows/wkz-diag.yml` runs it on push.
- **Raw logs** stay in the CI job logs ([§10](#10-evidence-index)); nothing large is committed.
- **Probabilistic cases** (sparse JS calls, short C calls) were mostly run once or twice. Rows marked "leaks" or "stops" for them show one outcome, not a rate. A 3× repetition plan (`pyrepeat`) exists but was not run.
- **Measurement noise:** CPU is per content process. Prewarmed spare processes and simulator infrastructure can add up to ~0.5 core of noise; the simulator readings are noisier, with one reading above the core count.
- **The iOS Simulator** runs iOS WebKit on the Mac CPU, without device power management or jetsam. No real device was tested.
- **Not tested:** Safari 18 or 27, a real SEB build, Service Workers, Pyodide inside the real exam IDE with prototype A (the minimal worker mirrors #60 instead).
- **To reproduce one case locally:**
  1. `node tools/wkz/server.mjs 8790`
  2. `WKZ_BACKEND=safari WKZ_PLAN=core node tools/wkz/drive.mjs` (macOS, after `sudo safaridriver --enable`).

## 9. Open questions for AC

1. **Prototype A (host-call interrupt buffer).** Should it be proposed for ctm-libs `pyodide-worker.js`, with the same wrapper for the shared buffer, behind a new P13 lock review? On a worst-case Python loop the cost was not measurable in Safari and +4% to +30% in single WebKit runs; a repeated benchmark should come first.
2. **Upstream.** Should the §7.3 text go to WebKit, as a comment on 328618 (recommended) or as a new bug? Who should post it, and should the repro HTML be attached?
3. **Plain-HTTP LAN deployments.** Is serving the exam over HTTPS (or from `localhost` on each machine) an option for any site? That is the only way to get isolation and the soft Stop (§6.1 D).
4. **Single long C calls.** For a call like `sum(range(10**11))` no page-side fix exists. Should the IDE warn after repeated hard restarts in WebKit (G)? If so, what should it tell learners? In Safari only quitting Safari helps; for SEB, restarting SEB is the likely equivalent, but SEB was not tested.
5. **SEB contact.** Should the SEB developers be asked about `__XPC_JSC_usePollingTraps` (§6.1 F) and about the issue in general?
6. **More runs.** Is it worth another CI round:
   - 3× repetitions of the probabilistic Pyodide cases (`pyrepeat`);
   - the real exam IDE with prototype A, including the 8× Stop probe;
   - a real iOS device, if one is available?

## 10. Evidence index

Job logs on GitHub Actions (runs 40670907284, 40674684033, 40678458756, 40678667490):

| Key | Job | What |
|---|---|---|
| s15 | [smoke-safari-mac15][s15] | Safari 26.6.1, macOS 15, core plan |
| s14 | [smoke-safari-mac14][s14] | Safari 26.6, macOS 14 |
| s26 | [safari-mac26][s26] | Safari 26.6.2, macOS 26, core + Pyodide quick |
| s15full | [safari-mac15-full][s15full] | Safari 26.6.1 full matrix, lifetime, landing |
| s15py | [safari-mac15-py][s15py] | Safari 26.6.1 Pyodide map, threshold, mitigations |
| stp | [stp-mac26][stp] | Safari Technology Preview (UA 27.0), macOS 26 |
| wkapp | [wkapp-mac15][wkapp] | WKWebView host app, macOS 15 |
| sim26a | [sim-ios26-mac26][sim26a] | iOS 26.2 Simulator on macOS 26 |
| sim26b | [sim-ios18-mac15][sim26b] | iOS 26.2 Simulator on macOS 15 (job name is a misnomer) |
| pw149 | [pw149-webkit-mac15][pw149] | Playwright WebKit 18.2 |
| pw155full | [pw155-webkit-mac15-full][pw155full] | Playwright WebKit 26.0 full matrix |
| pw155py | [pw155-webkit-mac15-py][pw155py] | Playwright WebKit 26.0 Pyodide |
| pw163mac | [pw163-webkit-mac15][pw163mac] | Playwright WebKit 26.6, macOS |
| chromium | [chromium-mac15-control][chromium] | Chromium 140 control |
| lin155 | [opt-default-pw155-linux][lin155] | WPE 26.0 default |
| lin155poll | [opt-polling-pw155-linux][lin155poll] | WPE 26.0, `usePollingTraps=1` |
| lin155nojit | [opt-nojit-pw155-linux][lin155nojit] | WPE 26.0, `useJIT=0` |
| lin155ipint | [opt-ipint-pw155-linux][lin155ipint] | WPE 26.0, BBQ/OMG off |
| lin155canary | [opt-canary-pw155-linux][lin155canary] | `JSC_useWasm=0` canary, Linux |
| lin163 | [opt-default-pw163-linux][lin163] | WPE 26.6 default |
| lin163ipint | [opt-ipint-pw163-linux][lin163ipint] | WPE 26.6, BBQ/OMG off |
| mac155poll | [opt-polling-pw155-mac15][mac155poll] | Playwright WebKit 26.0 macOS, `__XPC_JSC_usePollingTraps=1` |
| mac155ipint | [opt-ipint-pw155-mac15][mac155ipint] | same, BBQ/OMG off |
| mac155canary | [opt-canary-pw155-mac15][mac155canary] | `__XPC_JSC_useWasm=0` canary, macOS |
| r3s26host | [r3-safari-mac26-host][r3s26host] | host-call callbacks, Safari 26.6.2 |
| r3s15host | [r3-safari-mac15-host][r3s15host] | host-call callbacks + Pyodide, Safari 26.6.1 |
| r3s15warm | [r3-safari-mac15-warm][r3s15warm] | Pyodide warm callback, Safari 26.6.1 |
| r3pw155host | [r3-pw155-mac15-host][r3pw155host] | host-call callbacks + Pyodide + repro check, WebKit 26.0 |
| r3pw155warm | [r3-pw155-mac15-warm][r3pw155warm] | Pyodide warm callback, WebKit 26.0 |
| r3lin163host | [r3-pw163-linux-host][r3lin163host] | host-call callbacks + Pyodide, WPE 26.6 |
| r3bcanary | [r3b-wkapp-canary][r3bcanary] | WKWebView app, `__XPC_JSC_useWasm=0` |
| r3bpoll | [r3b-wkapp-polling][r3bpoll] | WKWebView app, `__XPC_JSC_usePollingTraps=1` |
| r3bdefault | [r3b-wkapp-default][r3bdefault] | WKWebView app, default |
| bugz | [bugzilla][bugz] | WebKit Bugzilla REST output |

[s15]: https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40670907284/job/122757177218
[s14]: https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40670907284/job/122757177384
[s26]: https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40674684033/job/122770020895
[s15full]: https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40674684033/job/122770021059
[s15py]: https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40674684033/job/122770020822
[stp]: https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40674684033/job/122770020988
[wkapp]: https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40674684033/job/122770020858
[sim26a]: https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40674684033/job/122770020978
[sim26b]: https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40674684033/job/122770020912
[pw149]: https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40674684033/job/122770020976
[pw155full]: https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40674684033/job/122770020935
[pw155py]: https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40674684033/job/122770020958
[pw163mac]: https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40674684033/job/122770021171
[chromium]: https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40674684033/job/122770021090
[lin155]: https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40674684033/job/122770020915
[lin155poll]: https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40674684033/job/122770020930
[lin155nojit]: https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40674684033/job/122770020921
[lin155ipint]: https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40674684033/job/122770021042
[lin155canary]: https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40674684033/job/122770021030
[lin163]: https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40674684033/job/122770021172
[lin163ipint]: https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40674684033/job/122770021206
[mac155poll]: https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40674684033/job/122770020919
[mac155ipint]: https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40674684033/job/122770021123
[mac155canary]: https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40674684033/job/122770021168
[r3s26host]: https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40678458756/job/122782810228
[r3s15host]: https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40678458756/job/122782810147
[r3s15warm]: https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40678458756/job/122782810351
[r3pw155host]: https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40678458756/job/122782810193
[r3pw155warm]: https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40678458756/job/122782810001
[r3lin163host]: https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40678458756/job/122782810013
[r3bcanary]: https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40678667490/job/122783509018
[r3bpoll]: https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40678667490/job/122783509061
[r3bdefault]: https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40678667490/job/122783508960
[bugz]: https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/40670907284/job/122757117169
