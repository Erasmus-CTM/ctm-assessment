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
fetched when you render. The `resolved-repos.json` file inside the archive and
on the [example site](https://erasmus-ctm.github.io/ctm-assessment/resolved-repos.json)
lists those commits and the SHA-256 of every installed file. The single
`ctm-assessment` filter runs the components in a tested order: ai-feedback,
JSXGraph, math-exercise, py-exercise, pyodide-interaktiv. The archive contains
no API keys.

To update, run the same `quarto add` command again; Quarto replaces the
installed copies with the new tested set.

`quarto add Erasmus-CTM/ctm-assessment` (the source repository) is not an
installation command: the repository holds the manifest and tests, not
component sources. Use the archive, a CI `ctm-assessment-package` artifact, or
build locally and run `quarto add .feedback-workspace/ctm-assessment`.

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
exactly this situation). List either `ctm-assessment` or the individual
component filters on a page, not both.

Python exercises use the Pyodide runtime. Text/image feedback requires no Python
execution. Resources initialize once even when the explicit ai-feedback filter
and consumers are both present.

## Feedback setup

For feedback directly on the page, follow the [shared connection guide](https://github.com/Erasmus-CTM/ai-feedback/blob/main/docs/installation.md#provider-settings-and-data-sent). Without a connection, Feedback prepares a message to copy into an AI chat.
