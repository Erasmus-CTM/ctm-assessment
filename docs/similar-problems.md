# Similar problems: design

*Design of 23 Oct 2026, re-baselined and reviewed on 25 Oct for Step 0. AC's binding decisions are in §1 and §11; the binding review findings are in §12 and override earlier text where needed. References are `repo:path:line` at the commits in §0. This revision is documentation only; report to AC and stop before G1.*

## For the lecturer

When an author enables it for a course, page or exercise, students get a "Similar problem" button beside Check, with Easier, Harder and "Another one like this" (same difficulty). It is off by default. A fresh problem on the same topic opens right under the original and works like the real thing: students check their answers, ask for hints, and find their work still there when they come back. It is clearly marked as generated, does not count toward scores, and is switched off in exams.

We start by letting the page ask the AI the student already uses for feedback, giving it the original exercise and the nearby notes. Wherever possible, the AI only writes the problem and the computer algebra system works out the answer, so the key comes from a specified calculation. This does not prove that the recipe matches the question. When that is not possible, the problem is solved a second time to catch mistakes, and it is labelled as having an unverified key, so students know to take a "wrong" with a grain of salt.

Then we connect our course-notes assistant (rag_app). Problems can draw on the whole course, and students no longer need their own AI key. Courses without rag_app keep using the first version.

## 0. Baseline

| Repository | Commit read | Role |
|---|---|---|
| math-exercise | `971acc6f16638dec9a5f7899109556703142b438` (main) | button, panel, generation flow, saving |
| ctm-libs | `56e3952176d608db871e82690d3e36685ba12a45` (main) | AI client options, settings, strings, shared runtime and matrix editor |
| ctm-checkers | `6ad893bee950dc43a1b1cf9ba39fd677349a373d` (main) | key computation, unchanged checking |
| ctm-assessment | `0494065d3f20b6bf29437f85d119acebbd0c797c` (main) | pins, example page, browser tests, docs |
| aacchhee/rag_app | `ea9d917` (23 Oct historical snapshot only; not re-baselined) | phase 2 only: retrieval and AI relay |

The four phase-1 main heads above were confirmed against GitHub on 25 Oct;
source review used matching local trees. Paths below are repository-relative.
Generation's step-4 store prerequisites B1/B2 are merged (ctm-libs and
math-exercise #27); there is no dependency on the old store branches.

Changes since the original baseline:

- L6 (ctm-libs #45, merge `98a555a`) extends the feedback policy/request
  machinery for STACK, and runtime cancellation can target a specific proxy.
  Generation must use `createClient().complete` with its own messages and
  per-call options; ordinary feedback and STACK's context contract stay intact
  (`ctm-libs:_extensions/ctm-libs/feedback/feedback-core.js:172`, `:288`;
  `ctm-libs:_extensions/ctm-libs/runtime/pyodide-runtime.js:430`, `:473`).
- M6 (math-exercise #34, merge `e9860ee`) moved the dynamic matrix editor to
  `ctm-libs:_extensions/ctm-libs/ui/ctm-matrix-input.js:1`; math-exercise
  calls `window.MatrixInput.create`
  (`math-exercise:_extensions/math-exercise/math-exercise.js:358`). Fixed
  vectors/matrices remain supported by its task renderer; resizable matrices
  remain outside this feature. Do not copy the editor back into math-exercise.
- The umbrella's shipped dependency pins are not the same as these main
  heads. Step 0 does not change pins; G4 pins the reviewed G1–G3 heads.

## 1. Decisions (AC, 23 Oct 2026)

1. **Two phases.** Phase 1 generates directly with the learner's configured AI and the context the page already assembles. Phase 2 adds rag_app. Both are one generator with two context sources: the prompt, the answer format and all checks are written once, in the page.
2. **Checkers grade, AI explains.** Generated problems with definite answers are graded by ctm-checkers exactly like authored ones. The AI gives hints and feedback, and may say that a key looks wrong. AI grading is not used for definite answers.
3. **The key is computed where possible.** The AI writes the problem and, per field, a recipe; SymPy computes the key (§4). Where no recipe fits, an independent solve checks the AI's key, and the problem is labelled "unverified key".
4. **Agreement is not proof.** Two solutions that agree make a wrong key less likely, not impossible. Order of trust: computed key, then two different models agree, then one model agrees with itself.
5. **Reasoning for generation only.** Everyday AI work (feedback, hints) stays on fast non-reasoning models. Generation uses a reasoning model. The independent solve uses the everyday model.
6. **Browser code.** Everything runs in the browser in JavaScript except checking and key computation, which run in Pyodide (ctm-checkers). The Lua filter only places the button and reads the off switch.

## 2. What the learner sees

- A button "Similar problem" next to Check, with "Easier", "Harder" and "Another one like this". It appears only when explicitly enabled and AI feedback is on (§6); in copy mode it is disabled (§5).
- A panel unfolds under the exercise and shows "Creating a problem…" with Cancel. A reasoning model can take 20–60 s.
- The generated problem is a full exercise: the same inputs, input help, Check and Feedback as the original. Several generated problems stack in the panel, newest first, and each can be removed.
- A small label says "Generated". When the key was not computed it says "Generated – unverified answer key", and a wrong answer reads "Doesn't match the generated answer" instead of the usual verdict.
- When generation fails twice (§4.3), the panel says so and offers to try again.

## 3. Generation (phase 1)

### 3.1 Request

The page builds one prompt from:
- the original task text without answer keys, as AI feedback already builds it (`AIFeedback.questionText`, `ctm-libs:_extensions/ctm-libs/feedback/feedback-dom.js:338`);
- the context AI feedback already resolves: section prose, explicit context refs, variant context (`resolveContexts`, `math-exercise:_extensions/math-exercise/math-exercise.js:973`);
- the original's mode, variables and number of fields;
- the direction (`easier`, `harder` or `same`) and the previously generated problem, if any, so repeated clicks move further for easier/harder and preserve difficulty for same;
- the page language.

The prompt asks for one new problem on the same topic and method, adjusted in one natural way (numbers, steps, guidance) for easier/harder, or at the same difficulty for same, and forbids copying an example or exercise from the context.

### 3.2 Reply

The model returns JSON, validated with the client's `validate` hook (one corrective retry, `ctm-libs:_extensions/ctm-libs/feedback/feedback-core.js:342`):

```json
{"question": "Find the derivative of $f(x)=x^3\\sin x$. $f'(x)=$ _[1]",
 "fields": [{"recipe": {"op": "diff", "expr": "x^3*sin(x)", "var": "x"},
             "answer": "3*x^2*sin(x) + x^3*cos(x)"}],
 "mode": "equivalent", "vars": "x",
 "solution": "…", "change": "harder: product rule instead of power rule"}
```

- `question` uses math-exercise's marker syntax with numbered slots. The page puts the keys into the markers itself, after validating their content and slot mapping; marker insertion is not a trust boundary (§12.1–§12.2).
- Each field has a `recipe` (§4.1) where one fits, and always the model's own `answer`.
- Allowed modes: the typed modes (`equivalent`, `exact`, `numeric`, `string`, `string_ci`, `set`) and fixed `vec[…]`/`mat[…]` answers. `custom`, JSXGraph responses and resizable `mat{…}` are not generated (§8).

### 3.3 Rendering

- The question goes through `renderTaskText` on the escaped plain-text path (`questionIsHtml = false`; `math-exercise:_extensions/math-exercise/math-exercise.js:496`, `proseHtml` at `:476`). Model text is never inserted as HTML. KaTeX renders the maths.
- The generated exercise is a new `.math-exercise-cell` with the original's settings (mode options, feedback policy, context mode) and id `<label>~gen~<n>`. It is set up by `setupCell` (`math-exercise:_extensions/math-exercise/math-exercise.js:1031`), which becomes a public entry (`window.MathExercise.setupCell`). Today it is reachable only through the test API (`math-exercise:_extensions/math-exercise/math-exercise.js:1696`).

## 4. Trusting the key

### 4.1 Computed keys

A recipe names one operation from a fixed list and its arguments as SymPy text. A new call `math_exercise.compute_key` in ctm-checkers treats every argument as untrusted learner input: no `__`, no attribute access, only admitted mathematical SymPy names and declared symbols. The current learner admission does not enforce all these requirements; G1 must supply the stricter recipe admission (§12.2) before applying the operation. No model text is ever run as Python.

First list (extend on demand): `value`, `simplify`, `expand`, `factor`, `diff`, `integrate` (definite and indefinite), `limit`, `series`, `solve` (equation or system), `det`, `inv`, `transpose`, `rank`, `rref`, `nullspace`, `eigenvals`, `matmul`, `dot`, `cross`, `norm`.

The computed key must agree with the model's own `answer` (by the field's mode, through `math_exercise.check`). This detects disagreement between the two answers. It cannot establish that either answer or the recipe matches the question: a model can give an integration recipe and its integral while asking for a derivative. Agreement is not proof (§1.4). On disagreement the problem is rejected.

### 4.2 Unverified keys

For fields without a recipe, the everyday model solves the problem from scratch: a fresh context, a different prompt, and the key not shown. Its final answer is compared with the generated key by `math_exercise.check` in the field's mode. A different model is used when one is configured (always in phase 2).

### 4.3 Rejection

A rejected problem is discarded silently and generated again, at most twice per click. Then the panel reports failure. A problem is never shown before its checks have finished.

### 4.4 Grading and feedback

- Checking is unchanged: `math_exercise.check` with the stored key (`checkFieldNow`, `math-exercise:_extensions/math-exercise/math-exercise.js:869`).
- For an unverified key, the feedback request says so. When the learner's work looks right but the checker says it doesn't match, the AI may say that the key may be wrong.
- The learner can mark a key as wrong ("Key looks wrong"). G3 saves and displays the flag, includes it in copy/export, and triggers one independent re-check. Disagreement marks the key "answer key disputed"; wrong answers then read "Can't confirm against the generated key", and the panel offers regeneration. Agreement is shown as "key was re-checked", with the flag retained. See §11 and the stable record format in §12.6.

## 5. AI client (ctm-libs)

The client's defaults are tuned for quick feedback (`ctm-libs:_extensions/ctm-libs/feedback/feedback-core.js`): a 60 s time limit (`:297`), 8192 output tokens (`:311`), and a reply with `<think>` tags counted as a leak (`:341`). Generation needs per-call options, without changing feedback:

- a longer time limit (180 s) and a larger output budget;
- `<think>`/analysis/reasoning blocks stripped from the reply before JSON validation instead of rejected (generation only);
- cancellation from the panel (`options.signal` is already supported).

Settings:
- An optional "Model for generating problems" in Feedback settings, defaulting to the feedback model. Course level: `ai-feedback: generator-model:`.
- Generation needs Direct API mode. In copy mode (the default, `ctm-libs:_extensions/ctm-libs/feedback/ai-feedback.js:20`), the button is shown disabled, with a pointer to Feedback settings. A copy-and-paste flow for copy mode is not planned.
- Interface strings go into the catalogue in en, de, nb and nn, including the same-direction action and all flag/re-check states. Current catalogues have different language lists: `ui` lists en/de/nb/nn, `math-exercise` en/de/nb and `feedback` en/de/nb/es. Add nn where the new strings require it, preserve existing completeness (including es in feedback), and add sv/da if the target catalogue requires them when G2 is prepared. Run the locale checker and generated-string sync checks (§12.5).

## 6. Settings and switches

- **Off by default.** Authors enable it per course or page with `ai-feedback: {similar: true}`, or per exercise with `#| similar: true`. The nearest course/page setting applies unless the exercise overrides it. `#| similar: false` disables it even when the course enables it.
- AI feedback must also be enabled for that exercise. A build without AI feedback, the exam profile and a page with AI off keep generation off, even with `similar: true` and saved browser API settings. Shared settings stay under `ai-feedback:`.
- Not offered for `custom` exercises or those with a `response:` source (§8).

## 7. Saving

The store keys records by exercise id from the build manifest and, on page load, deletes this page's records whose id is not in the manifest (`ctm-libs:_extensions/ctm-libs/ui/ctm-store.js:375`). A generated problem therefore cannot have a record of its own. Instead it lives in the original's record, whose `inputs` belong to the component (step 4 §3.2):

```json
"inputs": {"fields": {…}, "generated": [
  {"n": 3, "created": "2026-10-23T10:31:00Z", "direction": "harder",
   "spec": {"question": "…", "fields": [{"key": "…", "computed": true}], "mode": "equivalent", "vars": "x"},
   "inputs": {"fields": {"1": "3*x^2*sin(x)+x^3*cos(x)"}},
   "result": {"status": "correct", "at": "…"}, "flag": null}]}
```

- Only math-exercise's adapter changes (`math-exercise:_extensions/math-exercise/math-store.js:135`; `read` at `:34`, `write` at `:59`, `exportItem` at `:104`). The store is untouched.
- At most 10 generated problems per exercise; the oldest goes first. Count alone does not bound size: G3 must also bound serialized UTF-8 bytes within the complete 64 KB parent record (§12.3).
- Restore rebuilds the panel from `spec` without AI and without Python, in line with step 4's rule that restoring never runs Python.
- Copy and export include generated problems after the original (`exportItem`).
- Generated problems emit no `ctm:result`, so progress and quizzes count only authored exercises.
- When the original exercise changes (the store's "changed" state), its generated problems stay. They are self-contained.

## 8. Not in phase 1

- `custom` checkers: generating them would mean running model-written Python.
- JSXGraph responses and resizable matrices.
- Open answers ("show that…") with AI assessment as feedback: a later step, if wanted.
- A copy-mode flow.

## 9. Phase 2: rag_app

Historical context at the frozen rag_app snapshot in §0 (not a claim about its current main): rag_app indexes ingmat3a as course `IMAx3011` (`rag_app:ingest/ingest.py:22`). Its `/problem` (`app.py:819`, with `difficulty_adjustment` easier/harder) and `/calculate-answer` (`:933`) prototype the same idea with prose output. Phase 2 does not use them. Prompts and checks stay in the page (decision 1), and rag_app gets two thin services:

1. **Retrieval:** `/retrieve` takes a course and a query (the original task text) and returns note passages with their sources. The page adds them to the prompt as one more context block.
2. **AI relay:** an OpenAI-compatible `/chat/completions` that forwards with the server key. A course points its existing settings at it (`ai-feedback: mode: api`, `base-url:`, `model:`; `ctm-libs:_extensions/ctm-libs/lua/feedback.lua:383`), so no transport code changes in the page and learners need no key. Feedback can use it too.

Before any student traffic, the relay needs:
- an allowlist of course origins (CORS) and nginx rate limits;
- a model allowlist and a cap on output tokens per request;
- a longer LLM time limit for generation (`LLM_TIMEOUT` defaults to 30 s, `config.py:29`; nginx allows 120 s);
- a check of what is logged: request previews were logged at the historical snapshot (`log_utils.py:12`, `app.py:88`), and feedback requests would carry learner answers.

Generator and solver are two different models by default here (decision 4). When phase 2 works, both phases are compared on a handful of ingmat3a exercises before choosing that course's default.

## 10. Pull requests

Step 0 is one docs-only PR to ctm-assessment. Stop and report to AC before
starting G1. G1–G4 are one PR each, prepared as a stacked set under
[step 1 §12.1](consolidation/2026-10-step1.md#121-amendment-stacked-sets-ac-20-oct-2026-binding).
Pins and required shipped copies point at exact reviewed heads, without
`CTM-Review-Refs` head trailers. AC alone merges in the order given, using merge
commits only; no tag or deployment is part of this work.

Before each merge, compare the local merge of the current base and reviewed head
with the CI-tested head tree. If they differ, merge the base into the branch,
update affected pins/copies and re-run combined CI before returning the set to
AC. Do not rebase or squash. After each merge, its tree must equal the tested
head tree. See step 1 §12.1 for the complete checks.

| # | Repository | What |
|---|---|---|
| G1 | ctm-checkers | `math_exercise.compute_key` with the recipe list and its admission; tests including hostile recipe text |
| G2 | ctm-libs | per-call generation options (§5), generator-model setting, `similar` setting, strings |
| G3 | math-exercise | button, panel, generation flow, checks, `#| similar:`, store nesting, copy/export and local key reports/re-check (§11), public `setupCell`; Playwright with a mocked provider |
| G4 | ctm-assessment | re-pin, example page, reference docs, browser tests, log line in `docs/consolidation/README.md` |
| R1 | rag_app | `/retrieve`, the relay and its hardening |
| R2 | ctm-libs, math-exercise | retrieval as a context provider (`ai-feedback: retrieval:`), docs |

R1/R2 and the later `/report` relay are phase 2. They do not start until AC explicitly starts phase 2; no rag_app changes are part of this set.

## 11. AC's answers (25 Oct 2026; binding)

These answers settle the original §11 questions and apply to phase 1:

1. **Author opt-in.** The button is OFF by default. Authors enable it per
   course/page (`ai-feedback: similar: true`) or per exercise
   (`#| similar: true`). `#| similar: false` wins over a course enabling it.
   AI-off and exam gates still win over either opt-in.
2. **Same difficulty.** Add "Another one like this" beside Easier and Harder.
   It uses direction `same` with the same generator, checks and storage.
3. **Local reports now (option 1).** Implement in G3: save the flag inside the
   generated problem's record, show it in the panel, and include it in copy
   and export. Flagging triggers one independent solve, using a different
   model if one is configured. If it disagrees with the key, mark the problem
   "answer key disputed"; wrong answers read "Can't confirm against the
   generated key" instead of a verdict, and offer a regenerated problem. If
   it agrees, say the key was re-checked; the student may keep the flag.
   Agreement does not remove the unverified-key label or prove correctness.
4. **Central reports later.** No central collection now, and reports must
   never be collected as GitHub issues. The intended later route is a
   rate-limited rag_app relay `/report` endpoint receiving only the problem
   spec and course, with no student answer or identity. This is phase 2 and
   waits until AC starts phase 2. Keep the saved flag format stable so the
   future relay can read it (§12.6); do not add a report transport in G3.

## 12. Independent design review (25 Oct 2026; binding)

This is a fresh source-to-design review against the four main trees in §0,
covering model output, recipe admission, store lifecycle and feature gates.
It is a static design review, not evidence that the unimplemented feature has
passed tests. The findings below are implementation requirements for G1–G4.
The open contract question in §12.8 must go to AC before G1.

### 12.1 Model output is data, including restored specs

**Finding:** the plain-text renderer is suitable only when explicitly selected.
`renderTaskText(..., false)` escapes prose and TeX via `proseHtml`
(`math-exercise:_extensions/math-exercise/math-exercise.js:476`, `:496`).
The nearby variable named `generated` means authored variants, some of which
use the Pandoc HTML path (`:1077`, `:1163`); it must not select that path for AI
problems. Newly generated and restored AI specs always use the escaped path.
Render solution/change/flag/error text with text nodes or the escaped plain-text
path too; never interpolate raw model text into HTML, CSS, attributes or ids.
Keep math rendering untrusted (no trusted HTML/URL TeX commands).

Validate JSON types, supported mode, variable names, finite sizes and exact
numbered-slot/field correspondence before rendering. Reject custom checkers,
`response:` sources, resizable matrices, extra markers and marker-breaking key
text. Construct ids and controls in browser code; do not let model strings set
`data-checker`, packages, HTML flags, policy or response sources. Fixed matrix
and vector entries need the same admission and escaping as scalar entries.
Stored specs are untrusted input and pass the same structural/rendering checks
on restore, without recomputing keys. Test script/event markup, quote/bracket
injection, hostile TeX and forged restored records.

### 12.2 Recipe admission is stricter than current learner admission

**Finding (G1 security blocker):** current `inputs.admit` rejects only `__`
in learner strings, and does not inspect `correct`, `vars` or recipe arguments
(`ctm-checkers:src/ctm_checkers/math_exercise/inputs.py:7`, `:19`).
`checks.check` parses both student and correct text using SymPy `parse_expr`
with its default globals (`ctm-checkers:src/ctm_checkers/math_exercise/checks.py:43`,
`:64`; `ctm-checkers:src/ctm_checkers/math_exercise/parsing.py:7`).
Calling that admission function alone does not meet §4.1. SymPy parsing is not
itself a sandbox. The runtime guard restores interpreter state; it does not
make arbitrary expressions safe.

G1 must define a positive mathematical grammar/name admission for every recipe
argument before parsing: reject dunders, attribute access, Python statements,
imports, comprehensions, lambdas, arbitrary calls and non-mathematical names.
Allow declared symbols, approved mathematical SymPy names and the numeric/list
forms needed by §4.1. Do not treat all SymPy exports as automatically safe.
Use a fixed operation dispatch table, explicit arities/types and bounded
argument sizes/orders/dimensions. Model text is never executed as a Python
program or interpolated into Python source; admitted maths is parsed as data.

Apply the same protection to model answers and independent-solve answers,
including the unverified path, before passing them as either side of
`math_exercise.check`; validate model-supplied `vars` too. Otherwise a safe
recipe could be followed by unsafe answer parsing. Keep authored checker
semantics unchanged. Register the new browser call in the fixed dispatcher
(`ctm-checkers:src/ctm_checkers/browser.py:26`) and expose the package API.
Direct/native and Pyodide calls must enforce the same contract. Hostile tests
must cover every textual argument, nested matrices/systems, unsafe answer text,
unknown operations/names, attributes without dunders, and invalid sizes.
Reject parse/compute/check errors and non-agreement; do not fall back to an
unverified label after a supplied recipe fails. Agreement must never be described
as proof that the recipe implements the question (§4.1).

### 12.3 The parent owns storage, limits, results and exports

**Finding:** manifest cleanup deletes separate generated records
(`ctm-libs:_extensions/ctm-libs/ui/ctm-store.js:375`); `handle.result` also
emits `ctm:result` (`:297`, `:318`). G3 must register only the authored parent.
Generated checks update `inputs.generated[].result` through math-store.js and
never call the parent's `result` method or emit `ctm:result`. Parent field
queries must exclude generated descendants, or their answers would contaminate
authored checks/results/exports. Parent results must not change when a generated
answer changes. Disable recursive generation on generated cells.

Extend the adapter's `read`, `write`, `forget`, `clear` and `exportItem`
(`math-exercise:_extensions/math-exercise/math-store.js:34`, `:45`, `:59`,
`:104`, `:135`), using CTMStore only. A generated-only record must survive even
when all original fields are empty (today `read` returns null). Nested answers,
flags and re-check state follow the parent's save opt-out, clear, cross-tab clear
and export lifecycle. No separate localStorage key or direct CTMStore adapter
for a child. Copy/export include the question, generated label, key trust state,
answers and flag/re-check/dispute state, after the original.

Ten is a count limit, not a byte limit. The store measures the complete
serialized UTF-8 record against 64 * 1024 bytes and refuses oversize writes
(`ctm-libs:_extensions/ctm-libs/ui/ctm-store.js:222`, `:232`). Bound specs and
metadata before admitting them and enforce both limits in the adapter, accounting
for original answers, Unicode, results and flags. Evict oldest generated entries
first as needed; never truncate original answers or silently lose a flag update.
An entry that cannot fit must have an explicit failure/copy path. Existing
oversize authored-answer behavior remains the store's responsibility.
Test count and byte boundaries, multibyte text and generated-only records.

### 12.4 Restore must handle changed originals without AI or Python

**Finding:** CTMStore calls `options.write` only for state `restored`; for
`changed`/`withdrawn` it returns the saved record without calling write
(`ctm-libs:_extensions/ctm-libs/ui/ctm-store.js:274`, `:291`). G3 must hydrate
self-contained generated specs from the returned record in these cases as well
(`math-exercise:_extensions/math-exercise/math-store.js:89`, `:144`), while
preserving the original's changed-source warning and answer rules. Variant
changes must not silently drop the parent's generated list.

Public `window.MathExercise.setupCell` must support generated cells without
attaching a second store registration, auto-checking or starting Python.
Restore paints the stored result/flag state as saved state; it does not call the
provider, compute a key, grade, or repeat a report re-check. Test reload with
provider and Python calls trapped, including changed originals and clearing.

### 12.5 Defaults, L6, copy mode and build gates

**Finding:** the settings reader currently knows neither `similar` nor
`generator-model` (`ctm-libs:_extensions/ctm-libs/read-settings.ts:193`).
G2 must admit and validate both, resolve precedence, and emit them through
`lua/feedback.lua` (`ctm-libs:_extensions/ctm-libs/lua/feedback.lua:369`).
Missing `similar` is false. Exercise booleans override course/page `similar`;
they do not override AI-off or unsupported exercise types.

Use the existing hard AI-off decision (`ctm-libs:_extensions/ctm-libs/lua/feedback.lua:86`),
including `CTM_FEEDBACK=off`. The carried exam profile writes
`ai-feedback: enabled: false`
(`ctm-assessment:scripts/ctm_assets.py:703`). No generation controls, restored
practice panel or provider requests may be revived in either build by
`similar: true`, saved practice records or saved API settings. Test the actual
exam profile and both no-AI routes, not merely a browser toggle. Copy-mode
controls are disabled with a Feedback settings explanation; changing to Direct
API updates availability without submitting anything automatically.

L6's complete/validate path is at
`ctm-libs:_extensions/ctm-libs/feedback/feedback-core.js:288` and `:339`.
Per-call generation options set 180 s and a larger output budget, permit
reasoning for generation and strip reasoning blocks before validating final
JSON. Do not inherit model-policy options that disable thinking for generation;
do not change ordinary feedback's 60 s/8192 defaults, leak rejection, fast-model
policy or STACK request/context normalization. The generator-model fallback in §5 is not an exemption from §1.5: when the
feedback model is unsuitable for reasoning generation, require a configured
reasoning generator before generation can proceed. Do not switch everyday
feedback to reasoning merely to share a model. Separate reasoning-only provider
fields must not reach the panel; empty/truncated/unclosed reasoning output must
not become an accepted problem. Cancel uses `options.signal` (`:295`) across
retries and independent solves. Cancelled/removed/stale operations cannot insert
or save a late response. Keep the two generated-candidate attempts (§4.3)
distinct from the client's one JSON-correction retry; cancellation stops both.

Checking/key computation use the existing queued checker transport
(`math-exercise:_extensions/math-exercise/math-exercise.js:858`;
`ctm-libs:_extensions/ctm-libs/runtime/pyodide-runtime.js:430`). Preserve L6's
runtime-specific stop/restart behavior (`:473`); cancelling an AI request must
not stop an unrelated STACK/Python worker. The moved shared matrix editor
remains in ctm-libs (§0).

Catalogue completeness is per namespace, enforced by
`ctm-libs:scripts/check-locales.py:1`; generated feedback strings must stay in
sync. Cover all required languages in §5, including new settings and dispute
messages, and retain every existing language's keys.

### 12.6 Stable local report record (G3)

Keep `flag: null` for an unflagged problem. A flagged generated record uses:

```json
"flag": {"v": 1, "flagged": true, "at": "2026-10-25T10:31:00Z",
         "recheck": {"status": "pending", "at": null, "model": null}}
```

`at` is an ISO timestamp. Re-check `status` is `pending`, `agreed`, `disagreed`
or `failed`; the nested `at` records completion and `model` the solver model
when known. The flag contains no student answer or identity. Preserve version 1
and unknown future fields on round-trip; never reinterpret an unknown version
as permission to send a report. Dispute is derived from `disagreed`, independently
of `spec.fields[].computed`. An agreed re-check leaves the student's flag and
original trust label intact. Do not silently replace the stored answer key.

One flag action starts one fresh independent solve of the flagged problem,
with neither key nor learner response included. Prefer a configured different
model; otherwise use the everyday model in a fresh context (§1.5, §4.2).
Compare admitted final answers with the existing key through the checker, not
by AI verdict. Persist the outcome and include it in copy/export. Pending or
failed re-checks must not be presented as agreement; restore must not trigger
another solve. Disagreement invalidates any cached wrong verdict and changes
future wrong-answer text to "Can't confirm against the generated key". Offer
regeneration through the existing generation/check/storage flow, preserving
the flagged original until the learner removes it or retention evicts it.
No network report, GitHub issue or background central collection is authorized.
A later phase-2 relay reads the stable local record but sends only the problem
spec and course, never this whole parent/generated record (§11.4).

### 12.7 Required implementation evidence

- **G1:** successful operation/argument cases for all §4.1 operations, strict
  admission failures above, compatible serialized keys and mode-aware agreement
  through the real checker, in native Python and the browser dispatcher.
- **G2:** per-call generation timeout/output/reasoning/cancel tests alongside
  unchanged feedback defaults and STACK request tests; settings precedence and
  catalogue/sync checks.
- **G3:** Playwright with a mocked provider for computed and unverified keys,
  mismatches/two-attempt failure, cancellation/late replies, public setup,
  reload without provider/Python, changed originals, no generated `ctm:result`,
  copy/export, count/byte caps, opt-in/override, copy mode, exam and no-AI builds.
  Add flag re-check agreement/disagreement/failure, retained flags after reload,
  disputed cached verdicts and regeneration. Hostile output/restore tests must
  exercise the real renderer and actual recipe/checker admission.
- **G4:** exact reviewed-head pins and copies, example/reference docs, browser
  tests and consolidation log line. Run the combined stacked-set CI and the
  course comparisons required by step 1 §12.1. These are later implementation
  gates; Step 0 does not claim them passed or dispatch a deployment.

### 12.8 Contract requiring AC's answer before G1

The operation list does not define how compound SymPy outputs map onto typed
fields. In particular, `rref` returns a matrix plus pivots; `nullspace` a list
of vectors; `eigenvals` a value-to-multiplicity map; and system `solve` may
return dictionaries or tuples. The existing scalar/set checker cannot compare
all these structures as one equivalent expression. String equality would lose
mathematical equivalence and is not an implicit replacement.

**Question for AC:** should recipes explicitly select a mathematical result
component for each existing scalar/vector/matrix field (for example rref matrix
entries, a nullspace vector entry, an eigenvalue or its multiplicity, and a
solution variable), or should G1 define compound result schemas with dedicated
comparison rules? The first keeps the existing checker modes; the second expands
the checker contract. Record AC's choice here before implementing G1, including
how non-unique bases/solution ordering and multiplicity are represented. Do not
silently narrow the §4.1 list or invent a new checker mode.
