# Similar problems: design

*Design draft, 23 Oct 2026, written read-only, not yet reviewed. It records AC's decisions of the same day; they are binding and are collected in §1. References are `repo:path:line` at the commits in §0.*

## For the lecturer

Next to every math exercise, students get a "Give me a similar problem" button with an easier or harder option. A fresh problem on the same topic opens right under the original and works like the real thing: students check their answers, ask for hints, and find their work still there when they come back. It is clearly marked as generated, does not count toward scores, and is switched off in exams.

We start by letting the page ask the AI the student already uses for feedback, giving it the original exercise and the nearby notes. Wherever possible, the AI only writes the problem and the computer algebra system works out the answer, so the key can be trusted. When that is not possible, the problem is solved a second time to catch mistakes, and it is labelled as having an unverified key, so students know to take a "wrong" with a grain of salt.

Then we connect our course-notes assistant (rag_app). Problems can draw on the whole course, and students no longer need their own AI key. Courses without rag_app keep using the first version.

## 0. Baseline

| Repository | Commit read | Role |
|---|---|---|
| math-exercise | `5d62ced` (main); `839afa3` (`consolidation/2026-10-step4-store`) | button, panel, generation flow, saving |
| ctm-libs | `a1626f6` (main); `9b15fdb` (`consolidation/2026-10-step4-store`) | AI client options, settings, strings |
| ctm-checkers | `f96f017` (main) | key computation, unchanged checking |
| ctm-assessment | `97f73d3` (main) | pins, example page, browser tests, docs |
| aacchhee/rag_app | `ea9d917` (main) | phase 2: retrieval and AI relay |

Generation builds on the step-4 store (B1, B2). It starts after those merge.

## 1. Decisions (AC, 23 Oct 2026)

1. **Two phases.** Phase 1 generates directly with the learner's configured AI and the context the page already assembles. Phase 2 adds rag_app. Both are one generator with two context sources: the prompt, the answer format and all checks are written once, in the page.
2. **Checkers grade, AI explains.** Generated problems with definite answers are graded by ctm-checkers exactly like authored ones. The AI gives hints and feedback, and may say that a key looks wrong. AI grading is not used for definite answers.
3. **The key is computed where possible.** The AI writes the problem and, per field, a recipe; SymPy computes the key (§4). Where no recipe fits, an independent solve checks the AI's key, and the problem is labelled "unverified key".
4. **Agreement is not proof.** Two solutions that agree make a wrong key less likely, not impossible. Order of trust: computed key, then two different models agree, then one model agrees with itself.
5. **Reasoning for generation only.** Everyday AI work (feedback, hints) stays on fast non-reasoning models. Generation uses a reasoning model. The independent solve uses the everyday model.
6. **Browser code.** Everything runs in the browser in JavaScript except checking and key computation, which run in Pyodide (ctm-checkers). The Lua filter only places the button and reads the off switch.

## 2. What the learner sees

- A button "Similar problem" next to Check, with "Easier" and "Harder". It appears only when AI feedback is on and the exercise allows it (§6).
- A panel unfolds under the exercise and shows "Creating a problem…" with Cancel. A reasoning model can take 20–60 s.
- The generated problem is a full exercise: the same inputs, input help, Check and Feedback as the original. Several generated problems stack in the panel, newest first, and each can be removed.
- A small label says "Generated". When the key was not computed it says "Generated – unverified answer key", and a wrong answer reads "Doesn't match the generated answer" instead of the usual verdict.
- When generation fails twice (§4.3), the panel says so and offers to try again.

## 3. Generation (phase 1)

### 3.1 Request

The page builds one prompt from:
- the original task text without answer keys, as AI feedback already builds it (`AIFeedback.questionText`, `ctm-libs:feedback/feedback-dom.js:338`);
- the context AI feedback already resolves: section prose, explicit context refs, variant context (`resolveContexts`, `math-exercise.js:963`);
- the original's mode, variables and number of fields;
- the direction (easier or harder) and the previously generated problem, if any, so repeated clicks move further;
- the page language.

The prompt asks for one new problem on the same topic and method, harder or easier in one natural way (numbers, steps, guidance), and forbids copying an example or exercise from the context.

### 3.2 Reply

The model returns JSON, validated with the client's `validate` hook (one corrective retry, `feedback-core.js:288`):

```json
{"question": "Find the derivative of $f(x)=x^3\\sin x$. $f'(x)=$ _[1]",
 "fields": [{"recipe": {"op": "diff", "expr": "x^3*sin(x)", "var": "x"},
             "answer": "3*x^2*sin(x) + x^3*cos(x)"}],
 "mode": "equivalent", "vars": "x",
 "solution": "…", "change": "harder: product rule instead of power rule"}
```

- `question` uses math-exercise's marker syntax with numbered slots. The page puts the keys into the markers itself, so they never pass through rendering as model text.
- Each field has a `recipe` (§4.1) where one fits, and always the model's own `answer`.
- Allowed modes: the typed modes (`equivalent`, `exact`, `numeric`, `string`, `string_ci`, `set`) and fixed `vec[…]`/`mat[…]` answers. `custom`, JSXGraph responses and resizable `mat{…}` are not generated (§8).

### 3.3 Rendering

- The question goes through `renderTaskText` on the escaped plain-text path (`questionIsHtml = false`; `math-exercise.js:488`, `proseHtml` at `:468`). Model text is never inserted as HTML. KaTeX renders the maths.
- The generated exercise is a new `.math-exercise-cell` with the original's settings (mode options, feedback policy, context mode) and id `<label>~gen~<n>`. It is set up by `setupCell` (`math-exercise.js:1013`), which becomes a public entry (`window.MathExercise.setupCell`). Today it is reachable only through the test API (`:1493`).

## 4. Trusting the key

### 4.1 Computed keys

A recipe names one operation from a fixed list and its arguments as SymPy text. A new call `math_exercise.compute_key` in ctm-checkers parses the arguments with the same admission as learner input (no `__`; no attribute access; only SymPy's mathematical names) and applies the operation. No model text is ever run as Python.

First list (extend on demand): `value`, `simplify`, `expand`, `factor`, `diff`, `integrate` (definite and indefinite), `limit`, `series`, `solve` (equation or system), `det`, `inv`, `transpose`, `rank`, `rref`, `nullspace`, `eigenvals`, `matmul`, `dot`, `cross`, `norm`.

The computed key must agree with the model's own `answer` (by the field's mode, through `math_exercise.check`). This catches a recipe that does not match the problem text, for example text saying "differentiate" with an integration recipe. On disagreement the problem is rejected.

### 4.2 Unverified keys

For fields without a recipe, the everyday model solves the problem from scratch: a fresh context, a different prompt, and the key not shown. Its final answer is compared with the generated key by `math_exercise.check` in the field's mode. A different model is used when one is configured (always in phase 2).

### 4.3 Rejection

A rejected problem is discarded silently and generated again, at most twice per click. Then the panel reports failure. A problem is never shown before its checks have finished.

### 4.4 Grading and feedback

- Checking is unchanged: `math_exercise.check` with the stored key (`checkFieldNow`, `math-exercise.js:861`).
- For an unverified key, the feedback request says so. When the learner's work looks right but the checker says it doesn't match, the AI may say that the key may be wrong.
- The learner can mark a key as wrong ("This answer key looks wrong"). This marks the problem in the panel and in the saved record. Collecting these reports centrally is a phase-2 question.

## 5. AI client (ctm-libs)

The client's defaults are tuned for quick feedback (`feedback-core.js`): a 60 s time limit (`:297`), 8192 output tokens (`:311`), and a reply with `<think>` tags counted as a leak (`:341`). Generation needs per-call options, without changing feedback:

- a longer time limit (180 s) and a larger output budget;
- `<think>`/reasoning blocks stripped from the reply instead of rejected;
- cancellation from the panel (`options.signal` is already supported).

Settings:
- An optional "Model for generating problems" in Feedback settings, defaulting to the feedback model. Course level: `ai-feedback: generator-model:`.
- Generation needs Direct API mode. In copy mode (the default, `ai-feedback.js:20`), the button is shown disabled, with a pointer to Feedback settings. A copy-and-paste flow for copy mode is not planned.
- Interface strings go into the catalogue in en, de, nb and nn.

## 6. Settings and switches

- On wherever AI feedback is on. Off in a build without AI feedback, in the exam profile and on pages with AI off.
- Per exercise: `#| similar: false`. Per page or course: `ai-feedback: similar: false`. All settings stay under `ai-feedback:`.
- Not offered for `custom` exercises or those with a `response:` source (§8).

## 7. Saving

The store keys records by exercise id from the build manifest and, on page load, deletes this page's records whose id is not in the manifest (`ctm-libs:ui/ctm-store.js:310` on the store branch). A generated problem therefore cannot have a record of its own. Instead it lives in the original's record, whose `inputs` belong to the component (step 4 §3.2):

```json
"inputs": {"fields": {…}, "generated": [
  {"n": 3, "created": "2026-10-23T10:31:00Z", "direction": "harder",
   "spec": {"question": "…", "fields": [{"key": "…", "computed": true}], "mode": "equivalent", "vars": "x"},
   "inputs": {"fields": {"1": "3*x^2*sin(x)+x^3*cos(x)"}},
   "result": {"status": "correct", "at": "…"}, "flag": null}]}
```

- Only math-exercise's adapter changes (`math-store.js`; `register` at `:131`). The store is untouched.
- At most 10 generated problems per exercise; the oldest goes first. This stays well under the 64 KB record limit.
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

rag_app already indexes ingmat3a as course `IMAx3011` (`rag_app:ingest/ingest.py:22`). Its `/problem` (`app.py:819`, with `difficulty_adjustment` easier/harder) and `/calculate-answer` (`:933`) prototype the same idea with prose output. Phase 2 does not use them. Prompts and checks stay in the page (decision 1), and rag_app gets two thin services:

1. **Retrieval:** `/retrieve` takes a course and a query (the original task text) and returns note passages with their sources. The page adds them to the prompt as one more context block.
2. **AI relay:** an OpenAI-compatible `/chat/completions` that forwards with the server key. A course points its existing settings at it (`ai-feedback: mode: api`, `base-url:`, `model:`; `ctm-libs:lua/feedback.lua:382`), so no transport code changes in the page and learners need no key. Feedback can use it too.

Before any student traffic, the relay needs:
- an allowlist of course origins (CORS) and nginx rate limits;
- a model allowlist and a cap on output tokens per request;
- a longer LLM time limit for generation (`LLM_TIMEOUT` defaults to 30 s, `config.py:29`; nginx allows 120 s);
- a check of what is logged: request previews are logged today (`log_utils.py:12`, `app.py:88`), and feedback requests would carry learner answers.

Generator and solver are two different models by default here (decision 4). When phase 2 works, both phases are compared on a handful of ingmat3a exercises before choosing that course's default.

## 10. Pull requests

Stacked as usual; pins point at reviewed heads; AC merges in the order given.

| # | Repository | What |
|---|---|---|
| G1 | ctm-checkers | `math_exercise.compute_key` with the recipe list and its admission; tests including hostile recipe text |
| G2 | ctm-libs | per-call generation options (§5), generator-model setting, `similar` setting, strings |
| G3 | math-exercise | button, panel, generation flow, checks, `#| similar:`, store nesting, public `setupCell`; Playwright with a mocked provider |
| G4 | ctm-assessment | re-pin, example page, reference docs, browser tests |
| R1 | rag_app | `/retrieve`, the relay and its hardening |
| R2 | ctm-libs, math-exercise | retrieval as a context provider (`ai-feedback: retrieval:`), docs |

Rough size: phase 1 about a week (G1–G4), phase 2 a further 2–3 days.

## 11. Open questions

- Should the button be off by default, so that authors switch it on?
- Where do "key looks wrong" reports go in phase 2?
- Should difficulty also move sideways ("another one like this")?
