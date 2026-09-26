# Installation and setup

[Start here](../README.md) · [Authoring guide](authoring.md)

## Install the tested meta-package

CTM Assessment combines **ai-feedback, math-exercise, py-exercise,
pyodide-interaktiv and JSXGraph**. Each component keeps its own source repository;
this repository owns their pinned assembly, combined examples and acceptance tests.
JSXGraph currently comes from the assessment bridge maintained in math-exercise.

Install the assembled package:

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


To install only selected integrations, install ai-feedback once alongside the
chosen consumers and list those consumer filters. They automatically load the
shared module; no private feedback runtime remains inside them. During this
preview use ai-feedback's `feature/scoped-policies` and the consumers'
`feature/shared-feedback-integration` branches. The manifest pins exact commits.

Python exercises use the Pyodide runtime. Text/image feedback requires no Python
execution. Resources initialize once even when the explicit ai-feedback filter
and consumers are both present. Missing/duplicate shared installations fail
rendering with a clear instruction.


## Feedback setup

For feedback directly on the page, follow the [shared connection guide](https://github.com/Erasmus-CTM/ai-feedback/blob/feature/scoped-policies/docs/installation.md#provider-settings-and-data-sent). Without a connection, Feedback prepares a message to copy into an AI chat.
