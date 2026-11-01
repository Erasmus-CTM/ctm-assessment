## Part A — Threat model and security review

**Verdict:** the model-to-HTML and generated-mathematics paths have deliberate safety controls. They do not make the browser a trustworthy grading authority or isolate sites that share an origin. Authored-answer admission retains the earlier November M3 concern. No new exploitable XSS was established in this pass. Source review is distinguished below from execution evidence; this is not a claim that every hostile-input/browser combination was exercised.

### Assets, actors and trust boundaries

| Asset | Actor and entry | Boundary and requirement |
|---|---|---|
| Learner answers, photos, code and execution evidence | Learner; provider; another same-origin page | Treat as data; selected materials alone go to the provider; avoid rendering executable HTML. |
| Correctness, score, progress and saved practice records | Learner and AI outputs | Deterministic checker must decide correctness; client persistence is an editable convenience record, not an authenticated gradebook. |
| Provider bearer key | Another page, dependency or learner Python with JS bridge | Browser origins, rather than URL paths or storage-key names, separate authorities. A dedicated origin is needed to protect a key from an independently administered site. |
| Author filesystem, CI tokens and rendered content | Trusted teachers can make mistakes; dependency supplier may be compromised | Author Python and JSXGraph code are executable build/page content. Author-supplied source must not be confused with inert model/learner data. |
| Worker runtime, wheels and offline assets | CDN, package registry, earlier same-origin session | Digest validation, bounded messages and cancellation; isolation headers enable features but do not establish code sandboxing. |
| Variant identity and approval | Author, review tooling, persisted learner selection | Identity hashes bind content; approval and grade authority remain separate properties. |

The principal boundaries are QMD/options → Lua/Pandoc → HTML; DOM/model JSON → JS validation → worker RPC → Python; provider text → safe Markdown/TeX; localStorage → restore adapter → checker; and upstream artifacts → pinned installer → offline bundle. A Web Worker prevents ordinary UI blocking and removes direct DOM access. It still has an origin and network APIs, and Python's `js` bridge can reach its JavaScript environment. The `_ctm_guard` is state recovery for cooperative code, not process isolation or an adversarial sandbox.

### A1. Rendering paths

| Path | Source at snapshot | Control observed | Status / remaining limit |
|---|---|---|---|
| Shared AI Markdown | ctm-libs `_extensions/ctm-libs/feedback/feedback-dom.js:6`, `:65`, `:86` | Escape HTML before adding the small Markdown vocabulary. TeX/code placeholders escape content and data attributes. Markdown links/raw HTML are not interpreted as arbitrary tags. | Existing outside-only jsdom suite: 29 pass. It includes inert HTML-escaping assertions; it does not execute injected scripts. SVG, MathML and javascript-link browser matrix was not run. |
| Feedback TeX | same file `:200`, `:215` | KaTeX `trust:false`, `maxExpand:1000`, `maxSize:10`, fresh macros. | Source confirms link/HTML trust disabled. Full MathJax/KaTeX payload coverage unverified. |
| Generated question and change text | math-exercise `_extensions/math-exercise/math-similar.js:296`, `:433`, `:1200`; `math-exercise.js:513`, `:534` | Candidate schema/size validation; generated prose uses the ordinary escaped task renderer. | No new source-level executable-HTML route found; end-to-end hostile generation/restore matrix unverified here. |
| `{{name}}` substitution and given LaTeX | math-similar.js `:98`, `:477`, `:506`; ctm-checkers `src/ctm_checkers/math_exercise/generated.py:241`, `:254` | Bind mathematical data first, substitute brace-grouped LaTeX, then escaped task rendering. Every opened given must appear in the question. | Stored display must match freshly bound LaTeX. Mathematical correctness of the question still needs independent checking. |
| Variant HTML/solution | math-exercise.js `:513`, `:1165` | Pre-rendered author variants deliberately retain HTML (`questionIsHtml`); source authoring, rather than model feedback, owns this boundary. | Do not pass generated provider HTML into this trusted path. Content hashes are identity checks, not sanitizers. |
| JSXGraph summary | jsxgraph `_extensions/jsxgraph/graph-editor.js:46`, `:232`, `:343` | Summary is structured data; instruction/UI text uses textContent. | Protocol validation and images reviewed with C5; author board code is executable by design. |
| py-exercise stdout, error, assertion hint | py-exercise `_extensions/py-exercise/py-exercise.js:300`, `:316`, `:325`, `:359` | Escape dynamic strings before innerHTML. | Source review; full browser rendering matrix unverified. |
| IDE stdout/stderr | pyodide-interaktiv `_extensions/pyodide-interaktiv/qpyodide-cell-classes.js:170` | Lines use textContent. | Distinct from deliberate HTML output below. |
| IDE rich HTML/animations | same file `:253`, `:261`, `:263` | Outside exam mode HTML is inserted and scripts are cloned for execution; exam output uses pre.textContent at `:255`. | This is a deliberate page-code capability, not a sanitized output path. A lesson offering arbitrary Python must treat its learner runtime as powerful origin code. Exam-mode enforcement is reviewed in C10. |
| STACK CASText/feedback | ctm-checkers `src/ctm_checkers/stack/rendering.py:23`, `:29`, `:72`; ctm-stack `_extensions/ctm-stack/ctm-stack.js:121`, `:125` | Python allowlists tags/attributes and escapes substitution; JS trusts backend-provided HTML feedback parts. | The backend contract must preserve sanitization. Native Maxima rendering path was not executed by this pass. |
| Source panels, original | math-exercise `_filters/example-source.lua:5`, `:24` | Escape the entire source before putting it in pre/code; id and policy-name attributes are escaped. | Trusted source display, no executable HTML route identified. |
| Source panels, freehand copy | freehand_ai_assessment `_filters/example-source.lua:9`, `:13`, `:45` | Same four-character HTML escape for source and referenced tests. | Copy is adapted, not byte-identical: no policy panel; gated by example-source:true. No source-panel XSS established. |

### A2. Authoring and raw HTML

`math-exercise.lua:269` escapes all characters significant in its double-quoted attributes. Inline-script JSON escapes `<`, `>` and `&` at `:279`; policy, checker, variable, context and similar-data attributes use attribute escaping at `:999`–`:1025`. `py-exercise.lua:104` performs script-safe JSON encoding, and storage attributes are escaped before concatenation at `:307`. `ctm-libs/lua/feedback.lua:135` performs the same script-safe JSON encoding, including `window.__aiFeedbackConfig` at `:388`. The pinned qpyodide Lua likewise escapes captured code JSON before its inline program (`qpyodide.lua:639`), and escapes string substitution at `:315`; this is distinct from intentionally executing authored setup/cell code.

**Trusted authored HTML remains:** math-exercise captions are concatenated as raw HTML in the no-AI path at `math-exercise.lua:938` and regular caption body at `:949`; their source attribute separately uses attrEsc. This does not establish a learner/model injection vulnerability: authors already control executable QMD/JS/Python. It does mean captions are not inert strings and cannot be included in a blanket “all options are escaped” claim. Render-time generated author variants also intentionally preserve Pandoc-rendered markup. py-exercise captions are metadata, not visibly inserted (`py-exercise.js:419`).

Source-panel titles are selected fixed translations. The freehand filter's reconstructed fence/attributes become escaped code text at `_filters/example-source.lua:47`, so quoted JSXGraph attributes are not active browser attributes in that panel. Referenced test/policy files are trusted author filesystem reads; they should never be populated from a learner upload or provider output.

The exact pinned JSXGraph Lua escapes the optional preload script URL at `lua/jsxgraph.lua:820`, but interpolates authored resource URLs at `:839` and outer iframe assessment_id at `:848` without the same escaping. This is a trusted-author robustness gap: malformed quoted IDs/URLs can break generated markup, so escaping should be consistent even though author code is already executable. Its iframe is sandboxed with allow-scripts at `:849`, and the bridge verifies parent source, protocol, version and assessment identity at `:767`. These author-code paths require a trusted-author interpretation. A complete hostile-option render matrix across all Lua modules was not executed; no universal authoring-injection clearance is claimed.

### A3. Python execution and resources

Current adversarial authored-input exploitation is **unverified**: the planned execution probe did not complete after an agent execution safeguard interrupted that subtask. No current exploit output is available. The retained A-01 assessment therefore uses source evidence and completed ordinary regression checks, not a claim to have replayed the earlier audit exploit.

- `ctm_checkers.browser.CALLS` is an explicit callable allowlist (`src/ctm_checkers/browser.py:25`); the request is popped from caller state and decoded at `:61`, then admission runs before its handler at `:67`. Arbitrary function-name dispatch was not found.
- Authored mathematical responses go through `inputs.py:19` before `checks.py:67`/`:68` or `custom.py:51`. This rule rejects dunders; it does not implement the generated-answer token grammar. Retained concern A-01 below.
- Model mathematics uses an AST interpreter, not `eval`, `exec` or `sympify`: `generated.py:36`. It bounds input 4096 chars, AST 512 nodes, recursion depth 32, variables 16, integer literal 512 bits, literal list 64 entries, call arity 16, matrix axes 12, and exponent magnitude 100. Exact rational power result-size estimation rejects values exceeding 4096 bits at `:74`.
- Float literals must be finite and are converted through their decimal spelling at `:55`; nested Rational calls receive already interpreted scalar objects. Lists/matrices are prohibited in scalar calls at `:92`; factorial/binomial numeric arguments are integers in [0,100] at `:94`, and numeric gamma magnitude is bounded at `:96`. No remaining nested-Rational/huge-float bypass was demonstrated. These syntactic bounds are not a worst-case symbolic CPU/memory proof: simplification, integration and symbolic matrix operations can still be costly.
- `admit_learner` (`generated.py:107`) permits mathematical tokens and implicit multiplication, rejects other names, strings, dot attributes, statements and comments, and bounds length/token count. Only the learner side takes this grammar; model keys stay on parse_math (`:135`). Native-vs-generated notation parity was checked with ordinary fixtures.
- `bind_data` validates exact opened names and original data kinds (`generated.py:218`, `:241`, `:247`). Finite real number originals cannot become arbitrary expressions; expression givens retain only the declared variables. `e` normalization and `ln` support are notation behavior, not execution permission.
- Variant transport is a tagged exact-value codec: `variants.py:66` validates complete trees before `decode` at `:128`, and reconstructs expressions with evaluate=False. No Python-source deserialization was found in that codec.
- `question-variants.py:154` resolves canonical imports, wheel SHA and native manifests before execution; it uses Python `-I` and a child process plus aggregate time/output watcher (`:390`, `:395`, `:400`). This mitigates mistaken imports and runaway author generators; it does not sandbox trusted author code from filesystem/network access. The legacy `test(check,symbols)` route is also trusted author Python.

**Retained A-01 — authored learner-answer grammar is weaker than the generated route.** Severity **high** for a browser-only exam deployed as an integrity boundary; **medium** for practice. Confidence **plausible**, current exploitation **unverified**: no exploit developed or executed in this pass. Repository ctm-checkers, `src/ctm_checkers/math_exercise/inputs.py:19`, `checks.py:67`, `custom.py:51`; recovery scope ctm-libs `runtime/pyodide-runtime.js:251`, `:270`. The dunder-only rule still reaches SymPy parse_expr with its general globals; guard snapshots module objects, not their attributes. This is retained November M3, not a new discovery or a claim the October fix held. `code/security/source-controls.py` independently reports the difference in admission rules without evaluating an attack. Impact: the ordinary input surface does not establish an adversarial Python boundary, and shared checker state is not protected by independent process isolation. Fix: route authored learner mathematics through a compatibility-tested notation grammar, and treat all browser scores as untrusted if used for exams. Do not broaden restrictions on trusted authored checker code as a substitute. No fix PR proposed in this pass.

**Fixed/not re-reported:** November L2's exact nested-power growth now has a specific bit-size guard (`generated.py:74`) and dedicated regression fixtures (`tests/test_generated_keys.py:169`). The source change is established; this pass did not execute a resource-exhaustion payload. November M1's normal feedback KaTeX path now resolves the page's pinned CTMAssets (`feedback-dom.js:192`). Resolver exceptions still fall back to CDN at `:197`; whether that reaches an offline bundle is a C10 boundary, not an independently verified new finding here.

### A4. Runtime/worker boundary

The guard restores builtins, streams, hooks, recursion limit, sys.path, cwd and named module entries (`pyodide-runtime.js:242`–`:270`). It is not a module-attribute rollback. Importing or deleting a protected module and then reinstalling it is different from mutating functions inside a live module. A shared notebook interpreter deliberately retains learner state; this does not make trusted checker code a security realm.

Worker creation supports static URLs and Blob/plugin programs (`pyodide-worker.js:913`). Stop uses a revoked Blob URL plus an interrupt adapter (`:147`, `:924`), with shared-memory SIGINT when crossOriginIsolated (`:1166`). These are lifecycle/cancellation features. Neither COOP/COEP nor SharedArrayBuffer restricts Python's JavaScript bridge, fetch, or postMessage. A worker cannot directly access document/localStorage; a page-thread runtime can, and intentional rich HTML output can execute on the page outside exam mode. Browser-matrix Stop behavior and runtime restart measurements belong to C8.

`coi-serviceworker.js:43` intercepts requests from controlled clients, removes credentials for no-cors fetches at `:51`, and appends COOP same-origin and COEP credentialless headers at `:59`. It has no application cache of its own. Registration at `:146` uses default script-directory scope, not an explicit origin-wide scope; the script is emitted at the project root. The origin-wide unavailable flag (`:75`) can affect another project path, and is permanent until an isolated load clears it (`:98`). Verified-wheel Cache Storage uses name `ctm-pyodide-wheels` (`pyodide-worker.js:489`), but cached bytes are SHA checked before being held (`:508`); a shared cache name alone does not prove executable cache poisoning. Cold-session/service-worker contamination was not browser-tested here.

### A5–A9. Cross-cutting conclusions

Provider bodies, streaming, keys, model-list CORS, and failure UX are covered in C4/C5 and the provider focus topic. The key is origin-global (`ai-feedback.js:6`, `:15`, `:22`); a path-prefixed key would prevent accidental configuration collision but not same-origin access. The direct browser base URL is chosen by the user, not a server-side SSRF endpoint. A network/CORS error does not distinguish a blocked preflight from a remote proxy failure.

Prompt policy instructions are not authorization controls. Learner text/photos and generated questions can steer the tutor, and a solver using a different model is an independent request, not a trusted oracle. Standard feedback attachment renders prose rather than emitting `ctm:result`; generated practice can acquire a persistent exercise/key and must be evaluated separately (C6). “AI can never affect a grade” must be scoped to authored deterministic grading, not assumed to cover generated exercises.

The shared store separates course/page/exercise keys (`ctm-store.js:74`, `:85`), caps newly saved records at 64 KiB (`:234`), rejects future schema writes and uses memory recovery. Source/variant mismatches clear stale result state (`:279`, `:293`). Records are not authenticated: restored result is read at `:277` and emitted at `:296`. Progress listens to DOM events (`ctm-progress.js:6`), so neither a storage identity hash nor event-name validation makes it a secure grade record. Exports escape textual content and admit only narrow data-image formats (`ctm-export.js:5`, `:25`, `:31`); no generic import route was identified. Generated givens are re-bound and their display compared before checking (`math-similar.js:506`).

Supply-chain pinning, copies, workflow token permissions, P13 receipts and offline ZIP acceptance belong to C2/C10. No receipt, lock or pin was changed by this review. SEB with devtools closed does not remove deliberately exposed code/input/export channels; host policy, frontend profile and independent grading authority must be assessed together. Clipboard/download restrictions need a real SEB run; none is claimed here.

### A10. CSP proposal and cost

No single strict CSP was browser-validated across the component tuple. Start in Report-Only with an **offline profile** using local assets and AI disabled, then add explicitly configured provider/CDN hosts for online lessons. A compatibility starting point is:

```text
default-src 'self';
base-uri 'self'; object-src 'none';
script-src 'self' data: 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval';
style-src 'self' data: 'unsafe-inline';
worker-src 'self' blob:;
img-src 'self' data: blob:;
font-src 'self' data:;
connect-src 'self' blob:;
frame-src 'self' data: blob:;
form-action 'self';
```

This is a **compatibility draft**, not a strict-XSS defense or a proven working policy. The data: script/style allowances are needed by the fork's bundled/preload URLs (jsxgraph.lua:144–145,219); they materially weaken script confinement and should disappear with a redesigned asset transport. Opaque frames may also need the explicit reviewed course asset origin because self is not a general same-origin promise for an opaque document. Online use needs only reviewed asset/provider origins added per directive; do not solve configurability by allowing every HTTPS destination. `unsafe-eval` is included conservatively for third-party Pyodide/Monaco/JSXGraph dynamic-code paths and must be removed if a browser/runtime exercise proves it unnecessary. The shipped application JS search did not find an application `eval` or `new Function`; dependency bundles require separate inspection and browser violation testing.

Concrete blockers/cost:

| Today | Evidence | Cost to remove or confine |
|---|---|---|
| Inline executable bootstrap/config | `ctm-libs/lua/feedback.lua:388`, `py-exercise.lua:318`; author board programs | Medium: inert JSON islands plus external loaders; author code needs generated hash/nonce integration. |
| Inline style attributes and runtime dimensions | `math-exercise.lua:452`, `:485`, `:1107`; progress.js:68 | Medium: classes/CSS rules or generated per-page style hashes. Runtime dimensions remain dynamic. |
| Blob worker/plugin and Stop probe | `pyodide-worker.js:913`, `:924`; `runtime/mathjax-opaque-adaptor.js:85` | Medium/structural: preserve static worker option; test Stop alternative before dropping blob:. |
| Wasm compilation and dependency JS generation | Pyodide runtime; Monaco AMD; JSXGraph third-party bundle | Browser-specific campaign; wasm-unsafe-eval is narrower than unsafe-eval, but cannot be assumed sufficient. |
| data/blob iframe renderers | JSXGraph board transport and opaque MathJax adapter | Structural: shared named-origin sandbox/renderer design; regression coverage for board images, variants and MathJax. |
| Notebook rich-output scripts | pinned pyodide-interaktiv `qpyodide-cell-classes.js:253` | Structural: sandbox an output realm, or use the existing restricted exam text/image mode. |

Engineering estimates, not measured delivery commitments: 2–3 days for inventory/Report-Only and browser diagnostics; 1–2 weeks for external/inert configuration plus generated hashes/nonces and component regression checks; a further 2–4 weeks if board/rich-output/worker transport must be redesigned.

`frame-ancestors` must be an HTTP header and institution-specific; a generic `'self'` would break intended LMS embedding. CSP cannot stop authorized Python from altering its own browser's data; dedicated origins and independent grading remain necessary.

### Evidence and rerun notes

- `code/security/source-controls.py`: source inspection plus ordinary Rational, gamma, factorial, matrix, float and bind_data cases, all completed normally (6 value/binding observations; no exploit evaluation). Execute with the audit Python and `--workspace` pointing at the snapshot layout.
- `PYTHONPATH=/workspace/ctm-checkers/src /workspace/.cloud-setup/venv/bin/python -m pytest -q /workspace/ctm-checkers/tests/test_generated_keys.py -k 'operation_and_explicit_component_agree or generated_learner_notation_matches_original or parse_math_keeps_ordinary_powers or givens_give_a_custom_checker or bind_data_binds_declared_givens or givens_read_ln'`: **40 pass, 70 deselected** in 0.27 s. Ordinary-notation regression selection, not a repository-wide suite count.
- `node /workspace/ctm-libs/tests/dom.test.cjs`: **29 pass, 0 fail, 0 skip** in 0.31 s. Existing jsdom outside-only renderer/context/key-redaction tests; no real provider or credentials. The `node --test` wrapper in this environment reported a single file pass without nested counts; direct execution produced the individual test evidence. Do not count that wrapper result as 29 individual tests.
- SymPy for the first failed command used default Python 1.14.0, but no tests ran because pytest was absent. The successful 40-case command used the prepared audit venv with **SymPy 1.13.3**. Raw logs remain outside the report tree.

Not established here: exhaustive hostile browser rendering, adversarial provider/learner injection reproduction, resource-bound measurements under worst-case symbolic workloads, SEB, or a fully enforcing CSP. These are explicit coverage gaps, not passing checks.


### Finding-register row for synthesis

| ID | Title | Severity | Confidence | Repository / evidence | Reproduction | Proposed fix | Fix PR |
|---|---|---|---|---|---|---|---|
| A-01 | Authored-answer admission retains general SymPy evaluation boundary | High for an integrity-dependent browser exam; medium practice | Plausible; current exploitation unverified | ctm-checkers `src/ctm_checkers/math_exercise/inputs.py:19`, `checks.py:67`, `custom.py:51`; ctm-libs `_extensions/ctm-libs/runtime/pyodide-runtime.js:251` | `code/security/source-controls.py` verifies retained source control mismatch only; no exploit executed. Earlier November M3 explicitly remains unclosed in this source path. | Compatibility-tested mathematical token grammar for authored learner inputs; independent authority for exam grades. | None |

Quick work: correct any documentation claiming Pyodide cannot make network requests; make trusted-author raw-HTML conventions explicit; unify attribute/script-data escaping. Medium work: ordinary-notation corpus before authored-answer admission changes, browser CSP Report-Only matrix, dependency-specific dynamic-code inventory. Structural work: independent exam grading authority, dedicated course/provider origin, isolated rich-output realm. Admission and isolation changes may touch a P13-locked application file; obtain AC approval through the existing receipt process before changing that lock. This report changes no locks.
