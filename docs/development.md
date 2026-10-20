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

### Pyodide parity, build comparison and golden capture

`integration/pyodide-parity` grades every exercise of the example sites and
courses with the pages' own math-exercise.js in jsdom (`cases.cjs`):

- cells with answer keys: the keys, perturbations of each key (for a custom
  checker also all keys wrong at once), the audit's challenge answers
  (`challenges.json`), and for numeric cells with decimal
  places, significant figures or a tolerance boundary probes in a cell's
  first two variants (step-2 review S7): the two half-way values next to the
  key's rounding (one of them shows the tie rule) and answers exactly at the
  tolerance (where the binary difference equals it) and just inside and
  outside it;
- cells that decide without answer keys (custom checkers, dynamic matrices;
  step-2 finding 1 and review S1): the teacher answers of `answers.json`
  (by corpus and label, each with the verdict it must get), the challenge
  answers, a fixed probe set in the fields without a key (`PROBES`: numbers,
  symbols, expressions, collections, a matrix, invalid input, a dunder), and
  the responses the cell's authored tests give its checker, as the page would
  send them (text per field; shape and entries per dynamic matrix, within the
  sizes the page allows; a response the page cannot send is left out and
  counted in the report);
- cells whose response comes from a diagram (`data-response`): the teacher
  answers and the authored tests' responses, answered through the page's
  JSXGraph response protocol;
- every variant's fixtures, the authored question tests and the umbrella's
  Python programs.

The report counts coverage by cell: every rendered cell with a custom
checker, without keys or with a diagram response, and whether its cases
reached a correct, a partial and a wrong verdict. The step-2 design's 78
custom checkers are the `mode: custom` blocks of the sources (math-exercise
46, ctm-demo 12, ingmat3a 19, the umbrella 1). 69 of them are rendered, one
cell each, and all 69 are graded; every one reaches a correct and a wrong
verdict except `custom-special-linear-matrix`, whose checker gives at least
1/3 to any matrix. The other 9 are documentation snippets in math-exercise's
`docs/*.md` (`reference.md` 5, `graph-editor.md` 2, `assess-basis.md` 1,
`question-tests.md` 1) that no site renders; the harness does not see them.
What else stays uncovered: checker branches that no teacher answer, probe or
authored response reaches, and authored responses the page cannot send
(today two, matrices of a size the page does not offer).

A run fails when a case has no result, timed out or ended in a harness error
(in either run, step-2 review S6), or when a teacher answer gets another
verdict than its `expect`, does not fit its cell, or its label is on no page
of its corpus (for a course that follows its branch these are reported
only). Two runs are compared. **Versions** (default): the same sites under
two Pyodide versions (0.27.2 and ctm-libs' 0.28.3); any difference in status
or score fails, other differences are reported. **Builds** (`--builds
base=DIR,head=DIR`, one version, 0.28.3 by default): two builds of the same
sites, with site, source and extension paths relative to each build's folder;
any difference — status, score, details, feedback text, or a case only one
build has — fails (layer L2 of the step-2 design), unless the pull request
lists it in `integration/pyodide-parity/expected/<PR number>.json`:

```json
{"differences": [
  {"path": "math-exercise/examples.html", "case": "/#11:ex-custom-monotonicity\\|/",
   "reason": "math-exercise 0.11.1 words the monotonicity feedback differently", "required": true}
]}
```

`path` is a page (`<site>/<page>.html`), an authored source
(`<corpus>/<file>.qmd`), a folder of them, or `python` (the Python
programs); `case` a case id or a `/regular expression/` over case ids (the
report lists both for every difference); `reason` says why the difference
is right. Prefer `case`: a `path` alone accepts every difference under it.
Every entry is matched against every difference; the narrowest matching
entry gives the reason (an exact case id before a pattern before a path
alone; then the longer path, the longer pattern, the earlier entry). An entry
with `required` (the default) must match at least one difference, so an
expectation that no longer applies fails too. Unlisted differences still
fail. The file belongs to its pull request (the workflow reads only the one
named by the PR's number) and can be deleted after the merge.

`--capture DIR` writes the golden suites for ctm-checkers (`capture.cjs`): every
grading call at the runtime boundary — the `_math_*` values the page set and
the JSON the checker returned, or the error raised — one row per distinct
request (`math_exercise/requests-<corpus>`, `custom-probes-<corpus>`,
`authored-<corpus>`, with checker and test sources once in
`sources-<corpus>.jsonl`). Rows are canonical JSON with Python's number
spelling (this needs Node 21 or later, for `JSON.parse`'s source text) and
the checker's own number types (`{"$type": "Rational", "value": "1/3"}`); an
output with a Python error message, or one that differs between the
versions, is kept per Python minor version (`by_python`). The capture is
split by provenance (step-2 design §13 item 7; `corpora.json`): `export/`
holds only math-exercise's own examples (AGPL-3.0-or-later), which
ctm-checkers may commit, with a `manifest.json` and `PROVENANCE.md` of its own;
the courses' rows and the umbrella's example site stay in `umbrella/`,
generated in CI from the pinned repositories. A run with cases that are
incomplete, or with rows that got two outputs in one runtime, writes no
`export/` at all (`exportWithheld` in the manifest says why). The top-level
`manifest.json` names the commits (the harness's checkout and the package the
sites were built with), runtimes, files and anything incomplete; `PROVENANCE.md` the
licence of each file and the inputs written in the umbrella (probe sets,
challenge and teacher answers). Authored questions are recorded by
`integration/pyodide-parity/authored_record.py` (standard library only), the
one copy: the worker runs it in Pyodide, and ctm-checkers imports it from the
umbrella commit it pins, so both record authored rows the same way.

Python runs with a fixed `PYTHONHASHSEED` (`--hash-seed`, default 0; the
worker checks that it reached the interpreter), and `random` is seeded before
every grading call and every authored question. CI captures the umbrella's
and math-exercise's corpora a second time with seed 1 and fails on any row
that differs. Under these fixed seeds the boundary probes make the exported
rows sensitive to the numeric comparison itself: changing `_round_places` to
round half to even, or the tolerance test from `<=` to `<`, changes rows of
math-exercise's corpus (checked by hand on 19 Oct 2026); ctm-checkers' own
rounding grid (step-2 design §6.2) remains the systematic test of these paths.

The workflow **Pyodide parity and goldens** runs both: the parity run with the
capture (artifacts `goldens-export` and `goldens-umbrella`) and, on pull
requests, the build comparison against the base branch. It runs when the
harness, the pins, the package or the example site's inputs change, in full
every Monday, and on demand (with other course commits, `courses:
NAME=COMMIT …`, or a base ref for the build comparison: a commit, tag or
branch name).

The courses are listed once, in `integration/pyodide-parity/corpora.json`
(entries with `course`: repository, branch, Quarto profiles), for this
workflow and for **Compare rendered courses**. `build-corpora.py` builds the
corpora with one umbrella checkout and writes `corpora-built.json`, which
`run.cjs --corpora` reads (sites, source trees, package, Python programs).
A course with a pinned `commit` (ctm-demo, ingmat3a) is built there, in the
blocking jobs; the pins are bumped by hand, in a pull request of their own
that updates `answers.json` with them. A course without one follows its
branch: ingmat3a's `linalg-branch`, where the linear-algebra work happens, is
built at its tip (resolved once per job, so the two builds of a comparison
get the same commit) and graded only in a job of its own, **following**
(`build-corpora.py --courses following`), with ingmat3a's teacher answers,
whose expectations are reported, not enforced. That job reports its result as
a notice or a warning and never fails, so work in progress on the branch
cannot turn `main` or a pull request red; once the branch is gone it is
skipped with a notice (`optional`). The course comparison builds every course
at its branch; its entry for a course that follows its branch is
informational in the same way. Locally:

```sh
(cd integration/pyodide-parity && npm ci)
work=$(mktemp -d)
python integration/pyodide-parity/build-corpora.py --umbrella . --out "$work/corpora"
node integration/pyodide-parity/run.cjs --corpora "$work/corpora/corpora-built.json" \
  --out "$work/parity" --capture "$work/goldens"
```

The SymPy, mpmath and NetworkX wheels come from jsDelivr, checked against each
version's `pyodide-lock.json`; `PYODIDE_PARITY_WHEELS=<dir>` serves them from
`<dir>/<version>/` instead (for example extracted from Pyodide's release
archive). A new Pyodide version changes `indexURL` in ctm-libs'
`runtime/pyodide-runtime.js` in a commit of its own; set the two versions with
`--versions` and update the workflow.

### Review refs in CI

`tools/ci/review-dependencies.py` is the one copy every CTM repository's CI
uses (fetched from this repository at a pinned commit): a head commit's
trailer `CTM-Review-Refs: {"ctm-libs": "<sha>", "ctm-checkers": "<sha>"}`
selects dependency commits for a coordinated review; `main` ignores it.

### Comparing rendered pages

`tools/compare-rendered.mjs --before DIR --after DIR --expect FILE` compares
two renders page by page: the files a page loads, its configuration objects
(as JSON), its other inline scripts and its body DOM. Every difference must
belong to a category of the expectation files in
`tools/compare-rendered/expect/` (`step1.yml` for the changes of CTM
Assessment 0.9, `step4.yml` for step 4 on pages without its Markdown,
`step4-migration.yml` for a course's step-4 migration; one file per course or
site where needed). A rule matches an item's fields: besides the difference
(`area`, `change`, `tag`, `attribute`, `before`, `after`, `line`, …), where a
DOM difference sits (`ancestors`), what an element holds (`content`), the
words a text lost and gained (`lost`, `gained`), and what the page has
(`tabsets`, `reveals`, `embeds`, `modes`); an end tag names its element's
class and id, and an element removed and added unchanged elsewhere is one
item `moved`. A changed feedback
context is checked against the after page itself (`context:` in a rule): it
must be prose of the exercise's own section (the innermost tab with its label,
or heading section), without `<details>` blocks and collapsed callouts the
exercise is not in (solutions, hints), other tabs, other sections, code or
other exercises, for an explicit context also without context blocks, and
keep all of that prose the old context had. Every
unchanged context of the after page gets the same check; one that fails it is
reported too (area `context`). The workflow
**Compare rendered courses** builds a course with two ctm-assessment refs
through their own installers and compares them (`tools/ci/compare-matrix.py`
lists the comparisons):

- on pull requests that change the package: the example site (base against
  head) and every course of `integration/pyodide-parity/corpora.json` at its
  branch on its own sources, from the package the course pins in
  `quarto-extensions.yml` to the head (ctm-demo with its review build,
  ingmat3a's `main`, and its `linalg-branch` as an informational entry that
  never fails and is skipped with a notice once the branch no longer exists);
  and the step-4 fixture course `integration/step4-course` (raw HTML, the
  courses' site scripts and CSS, its package pinned as the courses' are)
  against its migration (`build-course.py --convert`: the converter with
  `--config`, then its `migrated/` folder) with the head, with
  `expect/step4-migration.yml` and in the browser;
- on demand for any course: `course-ref` (after) and `course-base-ref`
  (before), the package per side (`base`, `head`; `pin` is the one the
  course pins at that side's ref), `convert` (a migration preview of an
  unmigrated branch), `expect` (more expect files) and `browser`.

A course's migration PR is checked with `course` = the course,
`course-ref` = the migration branch, `course-base-ref` = `main`,
`base` = `pin`, `head` = `main`, `expect` = `step4-migration.yml` and
`browser` on.

### Old against new in the browser

`tools/compare-browser.mjs --old DIR --new DIR --browser chromium|firefox|webkit`
serves two rendered sites from one origin and compares them with Playwright
(design §6.3): reveals (kinds, titles, initial state, and the words each
holds: never fewer than on old), the switch (per block, `aria-pressed`,
status texts, kept on reload and on another page, a new tab in lecture,
where old's stood or at the top of the page), the keyboard (Tab to the
switch, in no more presses than on old; Enter and Space on
every summary, as on old; axe-core finds no new violation), every link into
a page with tabs or reveals on load and on click (the tab and reveal opened,
the target below the header and still there 2 s later, focus in view, the
script's mark and a `pushState`, Back and Forward; a link that was dead on
old and works now is reported), a grouped tabset's stored choice, print,
screenshots of the switch and of each kind of reveal at 1280 and 390 px
(at most 0.5 % of the pixels differ, except as `look:` in
`expect/step4-migration.yml` says), the computed styles of every summary,
JSXGraph boards and a Python cell inside reveals (not with `--offline`), and
console errors that only new has. `--shots DIR` keeps the screenshots for the
pull request's look review. Locally, `CHROMIUM_EXECUTABLE` names a Chromium
and `--offline` blocks the CDNs. `--first-visit` serves both sides as GitHub
Pages does, without the cross-origin isolation headers and with service
workers allowed, so a page with Python cells isolates itself with
coi-serviceworker (a reload) before the links are checked; the workflow runs
the link checks a second time this way. `known-failures:` in the expect file
lists failures that are fixed elsewhere and not pinned yet (a browser, checks,
`targets: tab-title`): they count as expected and are reported.

`compare-rendered.mjs` also checks three invariants on every page, which no
expected category can explain: each `<details>` keeps its words (more only as
its old words followed by what followed it on old: `reveal: heading` when
that starts with a heading, `grown` otherwise), the new switch stands where
the old one stood or at the top of the page, and no id occurs more often than
on old.

### Migrating a course to step 4's Markdown

`python tools/migrate-course-html.py --project COURSE --config` turns a
course's raw HTML into the Markdown forms (reveals, anchors, the embed, the
switch) in its pages and the files they include (nested includes resolved
against the page's folder, as Quarto resolves them), adds the `tab-ids.lua` line
and `markdown-lint: true` to `_quarto.yml` and drops the courses'
`learning-mode.html` and `tab-links.html`; it reports what it changed, the
places where it put a blank line before a fence, and what it left (`--dry-run`
changes nothing). An anchor that is the first thing in a tab and repeats the
id of its tab heading (written or automatic, also across an include, on every
page that shows its file) is removed when the project has the `tab-ids.lua`
line, since that line puts the id first in the tab; without it, it is
reported. The course's own CSS for the old classes is the migration
PR's to remove. Until a course migrates, its CI can run the same tool as a
lint: `--write-baseline ctm-html-baseline.json` records the raw HTML it has,
and `--check --baseline ctm-html-baseline.json` gives a warning annotation for
every construct the baseline does not list (constructs are keyed by file,
kind and title, id or address, so moved lines are not reported).

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
The Pyodide parity harness and the build comparison have a workflow of their own (above).
It uploads the rendered site and installable archive as artifacts. A successful
**main** build deploys both examples and archive to GitHub Pages; PRs never deploy.
Concurrent deploys are serialized. Failed tests prevent deployment.
The separate **Track component branches** workflow (weekly and on demand) builds
and tests against the components' branch tips with `--follow-branches`; it never
deploys. A red run there means `repos.json` cannot be advanced yet. A pin that
its branch does not contain stays, with a log line: the JSXGraph pin is the
fork commit of upstream pull request #2, which upstream `main` lacks.
The **Quarto versions** workflow (weekly, on demand, and when it or
`tab-ids.lua` changes) builds and tests with Quarto 1.8.27 and with the
current release (the release job may fail without failing the run); its
canary job for `tab-ids.lua` (`integration/feedback/tab-ids.test.cjs` with
Quarto alone, with both versions) fails the run: the filter keeps
tab-heading ids only while Quarto parses tabsets after pre-ast filters.

One repository setting is required: **Settings → Pages → Build and deployment →
Source: GitHub Actions**. The deployment job uses only `pages: write` and
`id-token: write`; no personal deployment token is stored in this project.

The JSXGraph tab includes a right-triangle length task checked by math-exercise
and a circle/square task asking for German names through plain-text feedback.

