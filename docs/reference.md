# Detailed functionality reference

[Start here](../README.md) · [Authoring guide](authoring.md)

## Settings for all components

Every CTM section (`ctm-assessment`, `math-exercise`, `py-exercise`,
`ai-feedback`) is read key by key across the levels Quarto knows, so a page
that sets one key keeps the project's other keys of that section:

1. the page's front matter;
2. Quarto's merged metadata (`metadata-files`, `format: html:` settings,
   notebooks, `-M`);
3. the files, the later winning: `_quarto.yml`, the active profiles
   (`_quarto-<profile>.yml`; with several profiles the first listed wins),
   `_quarto.yml.local`, then the `_metadata.yml` files from the project root
   to the page's folder;
4. for the shared keys, the same levels for `ctm-assessment.<key>`;
5. for languages, Quarto's `lang`; then the default.

A component's own spelling of a shared key (`math-exercise: {stop-after: 30}`)
wins over `ctm-assessment:` at any level.

```yaml
ctm-assessment:
  stop-after: 30    # seconds before a long check offers Stop, all components (default 20)
  lang: nb          # interface language of all components: en, de, nb (nn and no give nb)
  tab-links: true   # links into tabs and reveals (default true)
  modes: true       # the lecture/reading switch on pages with reading steps (default true)
  markdown-lint: false  # warn about raw HTML that has a Markdown form (default false)
```

`ai-feedback: enabled: false` at any level (or `CTM_FEEDBACK=off`) builds the
site without AI feedback; no level can turn it back on
([installation](installation.md#a-site-without-ai-feedback)).

The render stops when a CTM section holds a key that looks like a credential
(`api-key`, `token`, `secret`, `password`, …, at any level), without showing
its value: learners enter their own key in the Feedback settings. Unknown
`ai-feedback:` and `ctm-assessment:` options, and values that were accepted
loosely before, give a warning that they become errors in 1.0.

## Reveals, the switch and links into tabs

| Markdown | In the page |
|---|---|
| `::: {.reading-step title="…"}` … `:::` | a closed box that follows the lecture/reading switch |
| `::: {.hint}`, `::: {.solution}` … `:::` | a closed box (`title="…"` optional; `.solution` also takes `name="…"`) |
| `::: {.details title="…"}` … `:::` | a closed box, drawn related but distinct (it does not follow the switch) |
| `::: {.modes}` + `:::` | where the switch goes (else the top of a page with reading steps) |
| `::: {#name}` + `:::` | an anchor, a link target |
| `::: {.embed src="…" title="…" height="920px"}` + `:::` | an embedded page; `src` and `title` required, `height` a length (default 600px) |

- **Titles** are inline Markdown. Pandoc reads attribute values with
  backslash escapes, so TeX takes doubled backslashes
  (`title="Bruk $\\mathbf{A}\\,x$"`). Default titles: `.reading-step` "Go
  deeper" / "Vertiefung" / "Gå i dybden" / "Gå i djupna" (en, de, nb, nn);
  `.solution` "Solution" / "Lösungsvorschlag" / "Løsningsforslag" /
  "Løysingsforslag"; `.hint` "Hint" / "Hinweis"; `.details` "Details" /
  "Detaljer" / "Detaljar" (say what it holds instead).
- **A heading inside a block** stays inside it. AI feedback reads a block as
  closed material: its content is context only for an exercise inside it.
- **Other formats** (PDF, Word) show the blocks open, with the title in
  bold; `.solution` stays Quarto's Solution there, and `.embed` a link.
- **The switch** keeps its mode while the student stays in the course (the
  browser tab), opens the reading steps for printing and is hidden in print.
  `modes: false` leaves it out.
- **Links into tabs and reveals** (`tab-links: true`, the default): a link
  to an id inside tabs or closed blocks, in the page, from another page,
  Back/Forward or a reload, opens every enclosing tab and block, scrolls the
  target below the header, keeps it in place while the page settles, and
  focuses it. It wins over a grouped tabset's remembered tab without
  changing it. A site that still has its own tab-link script sets
  `tab-links: false` until it removes it.
- **Tab headings keep their ids and attributes** with the project-level
  filter `_extensions/ctm-assessment/tab-ids.lua`, listed before
  `ctm-assessment` with `at: pre-ast` (extensions cannot run at pre-ast).
  The id moves onto an empty `div.ctm-tab-target` at the start of the tab's
  pane, so a link to it opens the tab; classes such as `.active` stay on the
  heading. An id with a cross-reference prefix (`fig-`, `tbl-`, `thm-`,
  `sec-`, `eq-`, … and the keys of `crossref: custom:`) is not moved, with a
  warning: Quarto would turn the block into an empty figure or theorem. Nor
  is an id of the form of Quarto's own pane ids (`tabset-1-2`), with a
  warning: the page would have it twice. A package older than this file stops the render of a project with the line.
- **`markdown-lint: true`** warns at render time, naming files and lines,
  about raw `<details>`/`<summary>`, `<div id="…"></div>`, `<iframe>`, a
  hand-written switch (`data-learning-mode`), a page with tabsets in a
  project without the `tab-ids.lua` line, and a `.details` without a title.
- **Reserved class names:** `reading-step`, `hint`, `solution`, `details`,
  `embed` and `modes` on a div make it one of these blocks.

## Author text, translation and image tasks

````markdown
::: {.ai-feedback #spanish profile="language-quality" response-language="es" feedback-language="en" learner-level="Spanish course 1"}
Write five sentences about your daily routine.

::: {.feedback-starter}
Me llamo Ana. Yo vivir en Oslo.
:::

::: {.feedback-criteria}
Identify up to three useful improvements. Preserve the learner's meaning.
:::
:::
````

The main prose is the learner's task. `.feedback-criteria` is hidden author
instruction; `.feedback-starter` pre-fills the response. Profiles are `review`,
`language-quality`, `translation`, `python` and `mathematics`.

Translation activities can use a nested `.feedback-source` or
`source="original-id"` pointing to a tagged context block. `source-language`,
`response-language` and `feedback-language` are independent. A selected source
remains part of the task even with `context="none"`.

Use `image-upload="true" image-role="response"` for photographed learner work,
or `image-role="source"` for an image to describe. PNG, JPEG and WebP are
supported (at most three images, 8 MiB each, 12 MiB combined). Images remain in
memory. Copy mode requires attaching them separately in the chosen chat app;
direct feedback needs a vision-capable provider. Required images are not silently
dropped. Mathematics may explicitly fall back to its supplied textual graph
summary when a provider cannot accept the optional graph image.

## The same learning context in all four integrations

| Setting | Meaning |
|---|---|
| Omitted or `context: auto` | Preceding prose since the latest heading or tab, including that heading or tab label |
| `context: none` | No surrounding learning context |
| `context: notes` | The tagged block `notes`, anywhere on the page, then the prose of the exercise's own section without context blocks |
| `context: notes,formula` | Those tagged blocks in the specified order, then the section's prose without context blocks |

Text activities use attributes such as `context="notes"`; code cells use
`#| context: notes`. Code integrations also accept `feedback-context` as an
explicit alias; that alias takes precedence.

**Pyodide exception:** `context: interactive`, `setup` and `output` retain their
execution meaning. Use `feedback-context` when specifying both execution and
feedback context. Other context values, including `none`, control feedback and
leave execution at its normal default.

Automatic context is collected once from the source document before exercise
transformation, not by scraping the rendered page. It keeps whole recent blocks
up to 1,500 characters and preserves source LaTeX. Code, other activities,
feedback criteria/starters, `.example-author-notes`, `.ai-feedback-ignore`,
hidden content and generated cell output are excluded. Author callouts remain
visible but are excluded from context. Heading boundaries apply inside nested
containers too; a single oversized latest block is omitted rather than sliced.
Since CTM Assessment 0.9 a tab of a tabset starts a section as a heading does
(nested tabsets too), after a tabset its section goes on without the tabs'
prose, and the content of `<details>` blocks and collapsed callouts
(solutions, reading steps, hints) is context only for an exercise inside such
a block (with the section's prose before it).

Explicit context uses a combined 6,000-character budget for the listed blocks
and preserves math through MathJax or KaTeX rendering. Missing, duplicate,
untagged, empty or over-budget references are skipped with a browser-console
warning. Since CTM Assessment 0.9 the listed blocks are followed by the prose
of the exercise's own section (the automatic context without context blocks:
the listed ones come first, the others belong to other exercises; up to
1,500 characters), so the request knows where the exercise stands; before,
explicit selection replaced that prose.

### Reuse one block across different integrations

````markdown
::: {#tax-notes .ai-context}
A tax rate of 25% means multiplying the price before tax by 1.25.
:::

::: {.ai-feedback context="tax-notes"}
Explain how to find the price including tax.
:::

```{math-exercise}
#| context: tax-notes
A book costs 80 before tax. Its price including tax is _[100].
```

```{py-exercise}
#| label: tax-function
#| task: Return the price including 25% tax.
#| context: tax-notes
def with_tax(price):
    return price  # finish this
## TESTS ##
assert with_tax(80) == 100
assert with_tax(40) == 50
```

```{pyodide-python}
#| task: Print the price of a book costing 80 before 25% tax.
#| feedback-context: tax-notes
print(80)  # finish this
```
````

`.ai-context`, `.ai-feedback-context` and the legacy `.math-exercise-context`
are equivalent tags. The same ID can be referenced by any number of activities
in any integration, including across tabs on the same HTML page.

## Prompts, hints and local YAML

Shipped defaults are always available. `policy-files` only registers named
definitions; the files named in the project, profiles, `_metadata.yml` and the
page add up. `policy` activates a baseline, the nearest setting winning (a
page's `policy` replaces the project's; extend the project's policy where the
page should build on it), and `feedback-policy` selects a policy for one
exercise. The keys `project-policy`, `page-policy` and `page-policy-files` of
earlier versions keep working in 0.9, with a warning each.

```yaml
# feedback.yml
ai-feedback:
  policies:
    course-feedback:
      base-prompt: Use the terminology taught in this course.
      max-words: 180
      steps:
        - step-prompt: Ask one guiding question.
        - step-prompt: Explain the relevant idea without finished code.
    brief-feedback:
      extends: course-feedback
      max-words: 80
```

```yaml
# Page front matter
ai-feedback:
  policy-files: feedback.yml
  policy: brief-feedback
```

A child inherits omitted fields. A supplied `steps` list replaces the complete
inherited sequence; `steps: []` selects review without hint progression.
`base-prompt` applies throughout, while `step-prompt` adds the current step's
instructions. Step limits and permissions override the policy for that step.

Successful feedback advances one step; the last repeats. Failed, cancelled or
stale requests consume no step. Run/Check resets by default; select a policy
with `reset-on-run: false` to preserve progression. Changing the effective policy
resets saved progress. See the [complete policy guide](https://github.com/Erasmus-CTM/ctm-libs/blob/main/docs/feedback-policies.md)
for inheritance, explicit scopes and targeted exercise overrides.

## Provider settings and data sent

Every cogwheel opens the same settings dialog. Copy mode needs no account and
makes no provider request. Direct API mode uses an OpenAI-compatible endpoint,
model and personal key entered in the browser. Institutional defaults belong in
Quarto metadata; never put keys in the project (a key there stops the render):

```yaml
ai-feedback:
  mode: copy
  storage: local
  base-url: https://your-institution.example/v1
  model: your-model-id
```

Local storage shares settings across pages on the same origin. Session storage
limits them to a browser tab. Users can edit settings and explicitly import old
consumer settings. The chosen provider must allow browser CORS access; network
or VPN requirements remain the institution's responsibility.

Direct requests contain the task, current response, selected context, policy
and optional attachments/evidence. Python tests, expected math answers,
checker source and raw tracebacks are not feedback material. A previous
Check/Run contributes evidence only while it matches the current response;
editing, resetting or rerunning invalidates it. Pyodide sends a generic run
status and learner stdout, not raw stderr, HTML output or plots. Graph adapters
supply an explicit summary and optional image; raw graph/checker objects stay
local. These are client-side learning tools, not secure examination systems.

## Integrating another activity

Use `AIFeedback.attach({integration, id, button, output, getRequest})` for policy,
progression, settings, requests and rendering. `getRequest` should collect data
without executing code. Use `AIFeedback.contextMaterials({mode, refs, text})` for
context and `handle.reset('run')` on Run/Check. Call `handle.cancel({clearOutput:
true})` on edits and `handle.reset()` on explicit Reset. The consumer owns its
editor, checker and evidence boundary. [API reference](https://github.com/Erasmus-CTM/ctm-libs/blob/main/docs/api.md).

On the Quarto side, components load ctm-libs through their copy of
`ctm-bootstrap.lua` and use its Lua API: settings (`ctm.settings`), languages
(`ctm.locale`), the runtime (`ctm.runtime`) and feedback (`ctm.feedback`:
`prepare`, `markCallout`, `selection`, `context`, `enabled`, `request`). All
policy, context and feedback implementation belongs in ctm-libs.

## Page and exercise policy examples

The mathematics tab contains identical problems and drafts with different named YAML policies: a guiding question versus an immediate worked solution. The first activity in each integration also selects a shared page policy. All examples include collapsed copyable source directly after the activity, with JSXGraph source and policy YAML where used. Policy definitions live in YAML; inline `feedback-policy` attributes/options select existing names only. See [the scoped policy guide](https://github.com/Erasmus-CTM/ctm-libs/blob/main/docs/feedback-policies.md).

### Similar practice problems

Opt in with `ai-feedback: similar: true` per course/page, or `#| similar: true`
per exercise; an exercise's false overrides course opt-in. Exam/no-AI builds
keep it off. Direct API and a reasoning generation model are required; use
`generator-model` for a course default or choose one in Feedback settings.

Generation uses the existing named policy dictionary and rules, with independent
`generation-policy` selection and a separate shipped base prompt. The same policy
may serve teaching and generation. `{default: practice}` adds common instructions
while retaining each shipped integration prompt. Policies can set `harder`,
`easier` and `same`; exercise `#| harder:`, `#| simpler:` and `#| same:` lines append
small refinements. Generation ignores hint steps; generation-only edits do not
reset teaching hint counters. See [the testbox](../examples/similar-problems.qmd).

Computed keys use admitted SymPy recipes and must agree with the model's answer.
Other keys require an independent solve and remain labelled unverified. Trusted
compatible original checkers may be reused with admitted mathematical data, never
model-written Python. Authored checks enforce hard bounds such as vector length;
matching answers alone do not establish problem quality. No graphical responses
or resizable answer matrices are generated in phase 1.

Practice work and local key flags live inside the original saved record, with
count/byte limits, copy/export and reload without re-solving or grading. A flag
starts one independent re-check; disagreement marks the key disputed and replaces
wrong verdicts with “Can't confirm against the generated key”. Reports stay local.
Phase 2 and the rag_app reporting relay remain out of scope.

Generation tolerates a JSON code fence, numeric JSON answers and variable-name
arrays, with omitted mode/variables inheriting the original exercise contract.
Every normalized candidate still passes the same admission and mathematical
checks. Repair requests include the concrete format failure; **Details** in the
practice panel exposes the final reason locally when both attempts fail.
