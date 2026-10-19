# Installation and setup

[Start here](../README.md) · [Authoring guide](authoring.md)

## Install the tested package

CTM Assessment combines **math-exercise, py-exercise, pyodide-interaktiv and
JSXGraph** (the upstream
[jsxgraph/jsxgraph-quarto](https://github.com/jsxgraph/jsxgraph-quarto)
extension) with **ctm-libs**, their internal library: settings, languages, the
Python runtime of the page and AI feedback (formerly the ai-feedback
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
lists the package version, those commits and the SHA-256 of every installed
file. The package installs the folders `ctm-assessment`, `ctm-libs`,
`ai-feedback` (a thin alias of ctm-libs for 0.9), `jsxgraph`, `math-exercise`,
`py-exercise` and `pyodide-interaktiv`; authors list only `ctm-assessment`.

**Versions.** The URL above is the latest build of `main`. Each release is
also a GitHub release asset ([changes](../CHANGELOG.md)); to stay on one
version, install it from there:

```sh
quarto add https://github.com/Erasmus-CTM/ctm-assessment/releases/download/v0.9.0/ctm-assessment.tar.gz
```

In the browser, learners' pages load Pyodide, Monaco, KaTeX and JSXGraph from
jsDelivr: each library at its tested release line or a later release within it
(for example KaTeX 0.16.x, JSXGraph 1.x, MathJax 4.x), Pyodide at the version
named by ctm-libs' runtime, 0.28.3 (a CDN path needs one; pyodide-interaktiv
uses the same by default). The scripts and styles of ctm-libs and the
components are files the browser caches, each loaded once per page. The `ctm-assessment` filter
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
(pages with Pyodide cells); loading Python and packages is not counted, but a
load that has not finished after 180 s offers Stop, or ends with a message while
Python is still starting. Change the time for all components with
`ctm-assessment: {stop-after: 30}` (seconds), or per component
(`math-exercise: {stop-after: ...}`, `py-exercise: {stop-after: ...}`).
Likewise `ctm-assessment: {lang: nb}` sets the interface language of every
component (English, German and Norwegian Bokmål; a component's own `lang`
wins). These settings combine key by key across `_quarto.yml`, profiles,
`_quarto.yml.local`, `_metadata.yml` and the page: see the
[reference](reference.md#settings-for-all-components).

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

The single `ctm-assessment` filter runs the components in a tested order:
ctm-libs, JSXGraph, math-exercise, py-exercise, pyodide-interaktiv, and last
ctm-libs' end filter (it prints the page's message about AI feedback left out,
below). The archive contains no API keys; a key put in the metadata stops the
render.

To update, run the same `quarto add` command again; Quarto replaces the
installed copies with the new tested set.

`quarto add Erasmus-CTM/ctm-assessment` (the source repository) is not an
installation command: the repository holds the manifest and tests, not
component sources. Use the archive, a CI `ctm-assessment-package` artifact, or
build locally and run `quarto add .feedback-workspace/ctm-assessment`.

### Course repositories that build from source

A course repository can install the package built from a ctm-assessment ref
instead of the published archive. The ref is a branch name, a release tag such
as `v0.9.0`, or a full 40-character commit SHA: `git fetch` cannot fetch an
abbreviated SHA such as `c565cf3`. Fetch ctm-assessment at that ref, then run
its installer:

```sh
git init -q .private-extensions/ctm-assessment
git -C .private-extensions/ctm-assessment fetch --depth 1 https://github.com/Erasmus-CTM/ctm-assessment.git main   # or a release tag such as v0.9.0, or a full commit SHA
git -C .private-extensions/ctm-assessment checkout -q --detach FETCH_HEAD
python .private-extensions/ctm-assessment/scripts/install-project.py --project .
```

It builds the package with the components pinned in that ref's
`integration/feedback/repos.json`; at a release tag, these are the release's
components, so the installed files are those of the release archive. With
`--release v0.9.0` the installer first checks that the checkout is that
release. It prints the installed version. It replaces only the extensions the package
owns, keeps the course's own extensions, and checks every installed file. If
`quarto add` or that check fails, the previously installed extensions are put
back and the installer stops with a one-line message. The component commits it
used are written to `.private-extensions/resolved-repos.json`. Keep
`.private-extensions/` out of Git.

For a coordinated review, `--review-refs` builds with other component commits,
each a full 40-character SHA, given as `NAME=SHA[,NAME=SHA...]` or as a JSON
object:

```sh
python .private-extensions/ctm-assessment/scripts/install-project.py --project . --review-refs math-exercise=7bc409d12ce3b740040191453e6dd2467aea5ca6,py-exercise=a97443195d354c4aa6fbe514c092dec7c91faa39
python .private-extensions/ctm-assessment/scripts/install-project.py --project . --review-refs '{"math-exercise": "7bc409d12ce3b740040191453e6dd2467aea5ca6"}'
```

Use the `NAME=SHA` form in Windows PowerShell 5.1, which removes the inner
quotes of the JSON form. ctm-assessment itself cannot be set this way: the
installer always builds the checkout it is part of, so fetch the ref you want.
The names are those of `repos.json`: `ctm-libs`, `math-exercise`,
`py-exercise`, `pyodide-interaktiv`, `jsxgraph`; `ai-feedback=` is read as
`ctm-libs` in 0.9.

**Windows paths.** The build folder defaults to
`.private-extensions/ctm-assessment-build` inside the course, and component
files sit several folders deeper. With a long course path (for example under
OneDrive) this can pass Windows' 260-character path limit. Build in a short
folder instead:

```powershell
python .private-extensions\ctm-assessment\scripts\install-project.py --project . --workspace C:\ctm-build
```

## A site without AI feedback

The same source builds a site without any AI feedback, for example for an
exam period or a course that does not use it. Add a profile:

```yaml
# _quarto-no-ai.yml
ai-feedback:
  enabled: false
```

and render with `quarto render --profile no-ai`, or render with the
environment variable `CTM_FEEDBACK=off`. No page can turn it back on. Nothing
of AI feedback reaches the HTML: no feedback scripts, configuration, activity
data, criteria, starters or Feedback buttons. Activities show their task;
checks, Run and Reset work as before. A page that asked for feedback gets one
build message naming what was left out; the render succeeds. A clean site
without AI feedback needs `filters: [ctm-assessment]`: pages that list filters
themselves with pyodide-interaktiv before ctm-libs (`filters:
[pyodide-interaktiv, ai-feedback]`), or that use components released before
CTM Assessment 0.9, keep those components' own feedback code and Feedback
buttons, disabled by their scripts with a note that ai-feedback is missing
([details](https://github.com/Erasmus-CTM/ctm-libs/blob/main/docs/reference.md#a-site-without-ai-feedback)).

## Components are parts of the package

math-exercise and py-exercise are parts of CTM Assessment: found without the
package, they stop the render with the install command. Their repositories
keep their own tests and example builds for development, against a ctm-libs
installation (`quarto add Erasmus-CTM/ctm-libs`) with `CTM_COMPONENT_DEV=1`;
see each component's development guide. pyodide-interaktiv is the exception
and still works on its own
([installation](https://github.com/Erasmus-CTM/pyodide-interaktiv/blob/feature/shared-feedback-integration/docs/installation.md)).

**Separately added copies next to the package do not conflict.** The
package installs its folders directly under `_extensions/`, while
`quarto add Erasmus-CTM/<repository>` installs under `_extensions/Erasmus-CTM/`.
Each component uses the ctm-libs installed next to it, so `filters:
[ctm-assessment]` keeps using the tested set (the installation test renders
exactly this situation). A short filter name such as `math-exercise` selects
the package's copy. List either `ctm-assessment` or individual component
filters on a page, not both. A page that combines the package with a separately
added ai-feedback 0.8 (the version before ctm-libs) stops with a message naming
both: a page uses one version.

**Projects set up for ai-feedback.** `quarto add Erasmus-CTM/ai-feedback`
still works (GitHub redirects the renamed repository, and Quarto installs both
of its extensions, ctm-libs and the ai-feedback alias), and so does
`filters: [ai-feedback]`, with one build warning: use `filters:
[ctm-assessment]`. The alias goes when pyodide-interaktiv ships ctm-libs.

**JSXGraph is part of the package.** Do not also run `quarto add
jsxgraph/jsxgraph-quarto` in the same project: Quarto would place that copy
inside the package's `_extensions/jsxgraph/`, where it is never used (rendering
warns about it), and installing or updating the package replaces a JSXGraph
added before it. Use the short filter name `jsxgraph`.

Python exercises use the Pyodide runtime. Text/image feedback requires no Python
execution. Every script loads once per page, whichever filters a page lists.

## Feedback setup

For feedback directly on the page, follow the [connection guide](https://github.com/Erasmus-CTM/ctm-libs/blob/main/docs/installation.md#provider-settings-and-data-sent). Without a connection, Feedback prepares a message to copy into an AI chat.
