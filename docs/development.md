# Development and builds

[Start here](../README.md) · [Authoring guide](authoring.md)

## Development and validation

Requirements: Quarto 1.8.27 or later (with Quarto 1.10, pages with exercise blocks need
`engine: markdown` in their front matter; see [installation](installation.md)), Node 22/npm, Git and Python 3.12+.

```sh
python -m pip install 'sympy>=1.13' 'networkx>=3.4' 'PyYAML>=6'
python scripts/setup-feedback-integration.py --test
npx playwright install chromium
python scripts/setup-feedback-integration.py --browser
python -m http.server 8000 --directory .feedback-workspace/site/_site
```

In VS Code, **Terminal → Run Task…** offers the same commands (`.vscode/tasks.json`): the default test task runs the tests, the default build task builds the package and runs every test.

The builder renders one `example.html` from `example.qmd` and topic includes,
using the components pinned in `integration/feedback/repos.json`: ctm-libs (the
library, with its `ai-feedback` alias), math-exercise, py-exercise,
pyodide-interaktiv and JSXGraph (the upstream jsxgraph/jsxgraph-quarto
extension). It records revisions and hashes, rejects any vendored copy of
another component, checks that every `ctm-bootstrap.lua` equals ctm-libs' own,
and tests installed shared loading, filter order, context reuse and browser
behavior. The components' tests run against the pinned ctm-libs:
`CTM_LIBS_EXTENSION` names its `_extensions/ctm-libs` folder and
`AI_FEEDBACK_EXTENSION` its `feedback` folder (pyodide-interaktiv 1.8's tests
load the three feedback files from there); they get a temporary folder outside
this checkout. See the [workbench guide](../integration/feedback/README.md) for
local source overrides. Generated files (shipped policies, feedback interface
strings, versions) and the message catalogues belong to ctm-libs; the builder
runs its `sync-feedback-defaults.py --check` and `check-locales.py` before the
tests.

Tests of the package beyond the components' own (`npm run test:integration`,
with the built site): the rendered example page and filter orders, context,
policies (also the examples' effective policies after the move to
`policy-files`/`policy`), settings across components (`settings-merge`),
delivery of scripts as files and with `embed-resources` (`delivery`), and a
build without AI feedback (`no-ai-build`, fixture `integration/feedback/no-ai`,
built with `--profile no-ai` and `CTM_FEEDBACK=off`). `scripts/test-package.py`
installs the archive in a fresh course, also next to separately added copies
and an old ai-feedback 0.8.1.

### Pyodide parity (the gate for a Pyodide upgrade)

`integration/pyodide-parity` grades every exercise of the example sites and
courses under two Pyodide versions (today 0.27.2 and ctm-libs' 0.28.3) with
the pages' own math-exercise.js in jsdom: answer keys, perturbations, the
audit's challenge answers, every variant's fixtures, the authored question
tests and the umbrella's Python programs. Any difference in status or score
fails. The examples workflow runs it (job `pyodide-parity`) on the example
site, math-exercise's example site, ctm-demo (with its review build) and
ingmat3a, each built with the package by `scripts/build-course.py`. Locally:

```sh
(cd integration/pyodide-parity && npm ci)
node integration/pyodide-parity/run.cjs --site umbrella=.feedback-workspace/site/_site \
  --sources umbrella=. --python . --extensions .feedback-workspace/site/_extensions --out /tmp/parity
```

The SymPy, mpmath and NetworkX wheels come from jsDelivr, checked against each
version's `pyodide-lock.json`; `PYODIDE_PARITY_WHEELS=<dir>` serves them from
`<dir>/<version>/` instead (for example extracted from Pyodide's release
archive). A new Pyodide version changes `indexURL` in ctm-libs'
`runtime/pyodide-runtime.js` in a commit of its own; set the two versions with
`--versions` and update the job.

### Comparing rendered pages

`tools/compare-rendered.mjs --before DIR --after DIR --expect FILE` compares
two renders page by page: the files a page loads, its configuration objects
(as JSON), its other inline scripts and its body DOM. Every difference must
belong to a category of the expectation files in
`tools/compare-rendered/expect/` (`step1.yml` for the changes of CTM
Assessment 0.9; one file per course or site where needed). A changed feedback
context is checked against the after page itself (`context:` in a rule): it
must be prose of the exercise's own section (the innermost tab with its label,
heading section, `<details>` block or collapsed callout), without `<details>`
blocks and collapsed callouts the exercise is not in (solutions, hints), other
tabs, other sections, code or other exercises, for an explicit context also
without context blocks, and keep all of that prose the old context had. Every
unchanged context of the after page gets the same check; one that fails it is
reported too (area `context`). The workflow
**Compare rendered courses** builds a course with two ctm-assessment refs
through their own installers and compares them: on pull requests that change
the package (the example site, ctm-demo with its review build, ingmat3a), and
on demand for any course, course ref and pair of refs.

### Releases

A release is a tag `vMAJOR.MINOR.PATCH` that the owner pushes. The release
workflow checks with `scripts/release-check.py` that the tag names the package
version (`_extensions/ctm-assessment/_extension.yml`, also in `package.json`),
that every component in `repos.json` is pinned by commit and that
`CHANGELOG.md` has the version's section; it builds and tests the package from
the pins (including the browser tests) and publishes `ctm-assessment.tar.gz`
and `resolved-repos.json` as a GitHub release with that section as notes. For
a release: update `CHANGELOG.md` and the version in both files, merge, then
tag `main`. Pages keep deploying from `main`.

PR builds upload rendered examples; only a successful main build deploys Pages.
Consumer migration PRs follow acceptance of the combined examples. Historical
[phase 1](../docs/history/phase-1.md) and [migration](../docs/history/migration.md) records describe the
original restructuring; this README describes the current integration branches.

## Automatic builds and Pages deployment

The workflow runs on pull requests, feature-branch pushes and pushes to `main`.
Every build uses the pinned component commits, renders all five topic tabs, runs unit
and cross-integration tests, then tests real Python/JSXGraph behavior in Chromium.
A second job runs the Pyodide parity harness.
It uploads the rendered site and installable archive as artifacts. A successful
**main** build deploys both examples and archive to GitHub Pages; PRs never deploy.
Concurrent deploys are serialized. Failed tests prevent deployment.
The separate **Track component branches** workflow (weekly and on demand) builds
and tests against the components' branch tips with `--follow-branches`; it never
deploys. A red run there means `repos.json` cannot be advanced yet. A pin that
its branch does not contain stays, with a log line: the JSXGraph pin is the
fork commit of upstream pull request #2, which upstream `main` lacks.

One repository setting is required: **Settings → Pages → Build and deployment →
Source: GitHub Actions**. The deployment job uses only `pages: write` and
`id-token: write`; no personal deployment token is stored in this project.

The JSXGraph tab includes a right-triangle length task checked by math-exercise
and a circle/square task asking for German names through plain-text feedback.

