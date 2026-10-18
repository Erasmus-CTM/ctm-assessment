# Installation and setup

[Start here](../README.md) · [Authoring guide](authoring.md)

## Install the tested package

CTM Assessment combines **ai-feedback, math-exercise, py-exercise,
pyodide-interaktiv and JSXGraph** (the upstream
[jsxgraph/jsxgraph-quarto](https://github.com/jsxgraph/jsxgraph-quarto)
extension). Install it once in your Quarto project:

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

**How the components are delivered.** The archive *bundles* one copy of each
component, at the exact commits pinned in
[`integration/feedback/repos.json`](../integration/feedback/repos.json) and
tested together (unit, render, integration and browser tests). Nothing is
fetched when you render. `_extensions/ctm-assessment/resolved-repos.json`
(installed with the package, also on the
[example site](https://erasmus-ctm.github.io/ctm-assessment/resolved-repos.json))
lists those commits and the SHA-256 of every installed file.

In the browser, learners' pages load Pyodide, Monaco, KaTeX and JSXGraph from
jsDelivr: each library at its tested release line or a later release within it
(for example KaTeX 0.16.x, JSXGraph 1.x, MathJax 4.x), Pyodide at the version
named in the component (a CDN path needs one). The `ctm-assessment` filter
sets JSXGraph's (`_extensions/ctm-assessment/jsxgraph-pins.yml`) unless your
project sets its own `jsxgraph: src_jxg/src_css/src_mjx`. Licence notices are
installed with each component, or in `_extensions/ctm-assessment/licenses/`
where the component's folder has none.

All components give their action buttons (Check, Reset, Run, Feedback, Help,
Export) one common size, from the same `--ctm-button-font-size`,
`--ctm-button-padding-y`, `--ctm-button-padding-x`, `--ctm-button-line-height`
and `--ctm-button-radius` variables; set them in your project's CSS or theme to
change all of them together. Each component styles only its own elements, so
one never changes another's look.

A check that runs longer than 20 s offers **Stop** when Python runs in a worker
(pages with Pyodide cells); loading Python and packages is not counted. Change the time for all components with
`ctm-assessment: {stop-after: 30}` (seconds), or per component
(`math-exercise: {stop-after: ...}`, `py-exercise: {stop-after: ...}`).

The JSXGraph versions and the warning about a nested JSXGraph come with the
`ctm-assessment` filter. A page that lists individual component filters
instead (for example `filters: [jsxgraph, math-exercise]`) gets the versions by
adding `metadata-files: [_extensions/ctm-assessment/jsxgraph-pins.yml]` to
`_quarto.yml`.

**Quarto 1.10:** this release sends pages with blocks such as
`{math-exercise}`, `{py-exercise}` or `{pyodide-python}` to Jupyter (an
upstream regression, reported). Until it is fixed, add `engine: markdown` to
the front matter of each such page (in `_quarto.yml` it has no effect), or use
Quarto 1.8.

The single `ctm-assessment` filter runs the components in a tested order: ai-feedback,
JSXGraph, math-exercise, py-exercise, pyodide-interaktiv. The archive contains
no API keys.

To update, run the same `quarto add` command again; Quarto replaces the
installed copies with the new tested set.

`quarto add Erasmus-CTM/ctm-assessment` (the source repository) is not an
installation command: the repository holds the manifest and tests, not
component sources. Use the archive, a CI `ctm-assessment-package` artifact, or
build locally and run `quarto add .feedback-workspace/ctm-assessment`.

### Course repositories that build from source

A course repository can install the package built from a ctm-assessment ref (a
branch or a commit) instead of the published archive. Fetch ctm-assessment at
that ref, then run its installer:

```sh
git init -q .private-extensions/ctm-assessment
git -C .private-extensions/ctm-assessment fetch --depth 1 https://github.com/Erasmus-CTM/ctm-assessment.git main   # or a commit
git -C .private-extensions/ctm-assessment checkout -q --detach FETCH_HEAD
python .private-extensions/ctm-assessment/scripts/install-project.py --project .
```

It builds the package with the components pinned in that ref's
`integration/feedback/repos.json`. It replaces only the extensions the package
owns, keeps the course's own extensions, and checks every installed file. The
component commits it used are written to `.private-extensions/resolved-repos.json`.
For a coordinated review, `--review-refs '{"math-exercise": "<commit>"}'` builds
with other component commits. Keep `.private-extensions/` out of Git.

## Install single components instead

Each component also works on its own; see its installation guide for required
and optional dependencies:
[ai-feedback](https://github.com/Erasmus-CTM/ai-feedback/blob/main/docs/installation.md),
[math-exercise](https://github.com/Erasmus-CTM/math-exercise/blob/main/docs/installation.md),
[py-exercise](https://github.com/Erasmus-CTM/py-exercise/blob/main/docs/installation.md),
[pyodide-interaktiv](https://github.com/Erasmus-CTM/pyodide-interaktiv/blob/feature/shared-feedback-integration/docs/installation.md).
A missing optional dependency produces a render message naming the command to
run.

**Umbrella and standalone installations side by side do not conflict.** The
umbrella installs its components directly under `_extensions/`, while
`quarto add Erasmus-CTM/<component>` installs under `_extensions/Erasmus-CTM/`.
Each component uses the ai-feedback installed next to it, so `filters:
[ctm-assessment]` keeps using the tested set (the installation test renders
exactly this situation). A short filter name such as `math-exercise` selects
the umbrella's copy; use the qualified name (`Erasmus-CTM/math-exercise`) for a
standalone copy. List either `ctm-assessment` or individual component filters
on a page, not both. The standalone copies may use a different ai-feedback
version; only a page that combines filters from both sets with different
ai-feedback versions stops, with a message naming both.

**JSXGraph is part of the package.** Do not also run `quarto add
jsxgraph/jsxgraph-quarto` in the same project: Quarto would place that copy
inside the package's `_extensions/jsxgraph/`, where it is never used (rendering
warns about it), and installing or updating the package replaces a JSXGraph
added before it. Use the short filter name `jsxgraph`.

Python exercises use the Pyodide runtime. Text/image feedback requires no Python
execution. Resources initialize once even when the explicit ai-feedback filter
and consumers are both present.

## Feedback setup

For feedback directly on the page, follow the [shared connection guide](https://github.com/Erasmus-CTM/ai-feedback/blob/main/docs/installation.md#provider-settings-and-data-sent). Without a connection, Feedback prepares a message to copy into an AI chat.
