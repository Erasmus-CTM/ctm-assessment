# CTM Assessment

One feedback service for text and images, `py-exercise`, `math-exercise` and
`pyodide-interaktiv`. The ai-feedback dependency owns prompts, progressive hints, provider settings,
requests, cancellation, Markdown/LaTeX rendering and learning-context collection.
Exercise plugins supply the task, current response and safe evidence from a
previous Check or Run. Feedback never executes learner code or assigns grades.

[Examples](https://erasmus-ctm.github.io/ctm-assessment/example.html) ·
[Examples source](example.qmd) · [Teaching policies](https://github.com/Erasmus-CTM/ai-feedback/blob/feature/shared-context/docs/feedback-policies.md) ·
[JavaScript API](https://github.com/Erasmus-CTM/ai-feedback/blob/feature/shared-context/docs/api.md)

## Install the tested meta-package

CTM Assessment combines **ai-feedback, math-exercise, py-exercise,
pyodide-interaktiv and JSXGraph**. Each component keeps its own source repository;
this repository owns their pinned assembly, combined examples and acceptance tests.
JSXGraph currently comes from the assessment bridge maintained in math-exercise.

After the first main-branch Pages deployment, install the built archive:

```sh
quarto add https://erasmus-ctm.github.io/ctm-assessment/ctm-assessment.tar.gz
```

```yaml
filters: [ctm-assessment]
py-exercise:
  feedback: true
pyodide:
  feedback: true
ai-feedback:
  mode: copy
```

The archive contains one copy of each installed extension and activates them in
a tested order. It contains no API keys. The source repository deliberately does
not vendor dependency source: **`quarto add Erasmus-CTM/ctm-assessment` is not yet
an installation command for this source checkout.** Use the assembled archive,
a CI package artifact, or build locally and run
`quarto add .feedback-workspace/ctm-assessment` from your course project.
Before the first deployment the public archive URL is not available.

To install only selected integrations, install ai-feedback once alongside the
chosen consumers and list those consumer filters. They automatically load the
shared module; no private feedback runtime remains inside them. During this
preview use ai-feedback's `feature/shared-context` and the consumers'
`feature/shared-feedback-integration` branches. The manifest pins exact commits.

Python exercises use the Pyodide runtime. Text/image feedback requires no Python
execution. Resources initialize once even when the explicit ai-feedback filter
and consumers are both present. Missing/duplicate shared installations fail
rendering with a clear instruction.

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
| Omitted or `context: auto` | Preceding prose since the latest heading, including that heading |
| `context: none` | No surrounding learning context |
| `context: notes` | Only the tagged block `notes`, anywhere on the page |
| `context: notes,formula` | Those tagged blocks in the specified order |

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

Explicit context uses a combined 6,000-character budget and preserves math
through MathJax or KaTeX rendering. Missing, duplicate, untagged, empty or
over-budget references are skipped with a browser-console warning. Explicit
selection replaces automatic prose; it does not append to it.

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

Defaults ship in `_extensions/ai-feedback/feedback-defaults.yml`. Leave that
file unchanged and override it in a local file:

```yaml
# feedback.yml
ai-feedback:
  defaults:
    max-words: 180
    reset-on-run: true
  integrations:
    py-exercise:
      prompt: Use the terminology taught in this course.
      steps:
        - prompt: Ask one guiding question.
        - prompt: Explain the relevant idea without finished code.
        - prompt: Explain a complete solution.
          allow-full-solution: true
```

Load one file with `ai-feedback.policy-files: feedback.yml`, or list several
files in order. Later files override earlier values within the same scope;
integration settings override common defaults. Step lists are replaced in full;
`steps: []` gives ordinary review mode. Inline Quarto metadata can override files.
Use this loader for ordered step replacement: native `metadata-files` may merge
arrays before the filter sees them.

| Integration | Shipped behavior |
|---|---|
| Non-Python | Review, no hint sequence |
| py-exercise | Review, no hint sequence |
| math-exercise | Four steps; full worked solution permitted at step four |
| pyodide-interaktiv | Three steps; last describes the approach, without finished code |

Each successful feedback advances one step; the last step repeats. Failed,
cancelled or stale responses consume no step. Editing invalidates evidence and
pending feedback but preserves progression. **Run/Check resets hints by default**;
set `reset-on-run: false` globally or per integration to preserve them. Explicit
Reset/new math task always restarts. Changing the effective policy resets saved
progress. Counters belong to the activity and page in the current browser tab.

Policies also support `language`, `max-issues`, `allow-full-solution` and
per-step limits. Prompts are author instructions; they never appear in the
learner's task. [Full schema, precedence and examples](https://github.com/Erasmus-CTM/ai-feedback/blob/feature/shared-context/docs/feedback-policies.md).

## Provider settings and data sent

Every cogwheel opens the same settings dialog. Copy mode needs no account and
makes no provider request. Direct API mode uses an OpenAI-compatible endpoint,
model and personal key entered in the browser. Institutional defaults belong in
Quarto metadata; never put keys in the project:

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
editor, checker and evidence boundary. [API reference](https://github.com/Erasmus-CTM/ai-feedback/blob/feature/shared-context/docs/api.md).

The Quarto side exposes `feedback-quarto.lua`: a `markCallout` filter prepass,
`prepare(doc)` and `context(block, options, isPyodide)`. Consumers contain only
small dependency-discovery glue. All policy, context and feedback implementation
belongs in the ai-feedback source repository.

## Development and validation

Requirements: Quarto 1.8.27, Node 22/npm, Git and Python 3.12+.

```sh
python -m pip install sympy==1.14.0 networkx==3.4.2 PyYAML==6.0.2
python scripts/setup-feedback-integration.py --test
npx playwright install chromium
python scripts/setup-feedback-integration.py --browser
python -m http.server 8000 --directory .feedback-workspace/site/_site
```

The builder renders one `example.html` from `example.qmd` and topic includes,
using the exact branch commits in `integration/feedback/repos.json`. It records
revisions and hashes, rejects consumer runtime copies and tests installed shared
loading, filter order, context reuse and browser behavior. Consumer tests receive
`AI_FEEDBACK_EXTENSION` pointing to this checkout; running them independently
requires that environment variable. See the [workbench guide](integration/feedback/README.md)
for local source overrides. Regenerate embedded policies in the ai-feedback source repository; the builder
checks for drift before running tests.

PR builds upload rendered examples; only a successful main build deploys Pages.
Consumer migration PRs follow acceptance of the combined examples. Historical
[phase 1](docs/history/phase-1.md) and [migration](docs/history/migration.md) records describe the
original restructuring; this README describes the current integration branches.

## Automatic builds and Pages deployment

The workflow runs on pull requests, feature-branch pushes and pushes to `main`.
Every build resolves pinned dependencies, renders all five topic tabs, runs unit
and cross-integration tests, then tests real Python/JSXGraph behavior in Chromium.
It uploads the rendered site and installable archive as artifacts. A successful
**main** build deploys both examples and archive to GitHub Pages; PRs never deploy.
Concurrent deploys are serialized. Failed tests prevent deployment.

One repository setting is required: **Settings → Pages → Build and deployment →
Source: GitHub Actions**. The deployment job uses only `pages: write` and
`id-token: write`; no personal deployment token is stored in this project.

The JSXGraph tab includes a right-triangle length task checked by math-exercise
and a circle/square task asking for German names through non-Python feedback.

## License

AGPL-3.0-or-later. Shared rendering, context and model-policy code originated in
Erasmus-CTM/math-exercise, with feedback-interface ideas from
Erasmus-CTM/pyodide-interaktiv, under the same license.
