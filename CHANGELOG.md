# Changes

## Unreleased

- Pins ctm-libs 244d249 (ctm-libs#60): Stop on a runaway program no longer
  leaves a busy thread behind in Safari and SEB. WebKit does not end a worker
  that runs a WebAssembly loop when the page terminates it, so on plain LAN
  HTTP every Stop of a pure-Python loop kept one core busy until the tab's
  process ended; later restarts slowed from about 4 s to 20-150 s on the
  3-core macOS runner, which starved the P13 WebKit acceptance into its
  intermittent 30 s control timeouts. The P13 receipt records AC's approved
  complete lock
  09a18eb922c28355cffbf4b3a02af2f1f60fb000990386ddcf89cd346eb0be92 for
  ctm-libs 244d249 and pyodide-interaktiv 793a872 (lock-review run
  40647101655).
- Pins py-exercise 5682787, ctm-checkers 57823df (shared STACK expression
  admission, ctm-checkers#41), ctm-stack e8437f1 (README and authoring guide;
  CI pins and browser tests for the current ctm-libs) and pyodide-interaktiv
  793a872 (standalone install names the integration branch; ships ctm-libs
  33fd5a5, the commit the package pins). ctm-libs 33fd5a5, math-exercise
  bf29269 and the JSXGraph fork are unchanged. The P13 receipt records AC's
  approved complete lock
  252f271a5639163534eb2146b3e5bcb6c00cf38facf0db65cb9b9c4587fe5387 for ctm-libs
  33fd5a5 and pyodide-interaktiv 793a872 (deployed bytes identical to d9a539f;
  only the commit-named paths change).
- Pins ctm-libs 33fd5a5 and math-exercise bf29269. Similar-problem generation
  gets 300 seconds per provider request, and a corrective retry gets a fresh
  budget instead of the rest of the first call (ctm-libs#58). Generated and
  authored math that spans several lines, or a bare `\begin{pmatrix}` without
  `$`, is typeset instead of shown as raw TeX, and the independent solve may
  take 180 seconds (math-exercise#43).
- `scripts/serve-offline.py --cert/--key` does the TLS handshake in each
  request's thread, with a 30 s limit: before, one client that connected and
  sent nothing stalled every other client of the exam dry run.
- Docs: the installation guide and reference name ctm-stack, its build-time
  SymPy, the exact browser-library versions, the JSXGraph fork, the branch for
  standalone pyodide-interaktiv, the `ctm-assessment:` saving, export, progress,
  storage, asset and variant keys, the languages per component, and what a
  build without AI feedback needs; no release is claimed before one is tagged.
- Complete consolidation U3c: ctm-libs no longer ships the ai-feedback
  extension alias. Keep pyodide-interaktiv's standalone forwarder outside
  the package, and retain the stale-version check with migration advice.
  Tests use `CTM_LIBS_EXTENSION` for shared feedback files.
- `scripts/serve-offline.py` refuses a symlink loop with 403 on Python 3.13
  too (3.13 no longer raises on a loop in non-strict path resolution).
- CI: a fast tier on every pull request (all unit tests, no render), the
  component tests on re-pin pull requests, and a nightly warning-only run
  against component branch tips with a report of component CI pins that
  differ from `repos.json` (`docs/development/ci-policy.md`). Parity
  expected-difference entries accept a changed verdict only when they name
  the case or carry a witness.

## 0.13.0

Shared saved answers, progress and quizzes across maths and Python exercises, with page and course deletion and a device saving switch. Restoring an answer never runs Python or checks it automatically. Changed exercises retain the old answer as read-only history and mark old scores outdated.

Copy controls remain available when saving is off. “Export my answers” opens selectable text with “Copy all” first; Markdown and HTML downloads are secondary. Pyodide cells save code only; current output and plots can be copied or exported without storing output.

Pins for this review set: ctm-libs 1320be6ac38a25269abffe82652feea8f1af8636, math-exercise 59c4e95f332ba314ea11031ff44ef77bd3bdd68a, py-exercise e9af7a40bb67801ff37d77cae68cdb4cb1483258, pyodide-interaktiv c0acbada72e2cf29c74ca0c88fc537eb85506370 and ctm-checkers a1637dc95b9e11d8a0c838c801cd53e20997eceb. The checker pin supplies the declarative author-test API required by this math-exercise revision; the installed archive is tested with passing and deliberately failing built-in and legacy custom assertions. The JSXGraph pin is unchanged. The step-4 design clarifies that correctness rules supplied outside a block participate in its source hash.

## 0.12.0

The last set before the ingmat3a migration: **links into collapsed callouts
work**, the comparison of old and new renderings **flags a migration that
drops a construct**, and ctm-checkers is **0.6.0** (STACK).

Components: ctm-libs at a3df529 (ctm-libs#30, on top of a4777b1), ctm-checkers
0.6.0 at 9e042dc (before: 0.2.0 at 8c3db5e); math-exercise, py-exercise,
pyodide-interaktiv and JSXGraph unchanged, at the commits recorded in
`_extensions/ctm-assessment/resolved-repos.json`.

### Changed for authors and learners

- **A link to a collapsed callout opens it.** A link, a typed address or the
  Back button that lands on a callout that is closed (`collapse: true`), on
  something inside it, or on a callout inside a tab or a reveal (and a reveal
  inside a callout) now opens every closed layer around the target, outermost
  first, and scrolls to it, as it does for tabs and reveals (ctm-libs#30:
  `ctm-nav` of ctm-libs). A page that has only a collapsible callout, with no
  tabset and no reveal, still does not load `ctm-nav` (unchanged), so its
  callout is not opened by a link.
- **STACK exercises follow STACK's rules** (ctm-checkers 0.3 to 0.6): input
  rules and messages (S-13), the inverse trigonometric functions, and the
  other STACK changes of ctm-checkers' CHANGELOG. Only STACK verdicts change.
  math-exercise's tables, and so the math exercises' verdicts, do not
  change. The pyodide parity job shows it on the re-pin: Pyodide 0.27.2
  against 0.28.3 has 0 differences (L2 = 0), and the build with ctm-checkers
  8c3db5e (0.2.0) against the build with 9e042dc (0.6.0) has 0 differences
  in status, score, details and feedback over 10541 graded responses, 720
  variant fixtures, 34 authored question tests and 28 Python programs of
  the example site, math-exercise, ctm-demo and ingmat3a (and 2827
  responses of `linalg-branch`), so the math goldens are identical.

### For maintainers

- **`compare-rendered.mjs` flags a migration that drops a construct** (review
  of set 3, addendum 3). Besides the three invariants of step 4 (reveal
  words, the position of the switch, duplicate ids) it now also reports, and
  no category of `expect` files can explain: a lecture/learning switch that
  the old page has and the new one lacks (`switch dropped`; a page without
  reading steps never had one), a second switch (`switch duplicated`), fewer
  tabsets, tab panes, embedded pages (`iframe`) or callouts on the new page
  than on the old one, and a plain `<div id>` that another old page links to
  and the new page no longer has (`anchor dropped`; the id may move to
  `ctm-tab-target`). Tests: `tests/compare-rendered.test.cjs` (each new
  check has a mutation that the old tool did not report).
- **`compare-rendered.mjs` compares long pages line by line.** Its line
  table was capped at 6e7 cells (a page of some 7700 lines or more on each
  side after the first and before the last difference), and a longer page
  became one changed block that no category could explain. ingmat3a's
  `linalg-branch` crossed that line when its weeks 8 to 12 were restructured
  (3336 unexplained differences on the same migration that had none). Pages
  over the cap now go through Myers' difference, which takes time and memory
  in proportion to the differences (one block only beyond 6000 changed
  lines). Test: a page of 12000 lines with 40 migrated reveals.
- **The known failure `collapsed-callout-target` is gone** from
  `tools/compare-rendered/expect/step4-migration.yml`: the ctm-nav fix makes
  the callout-target pages equal. The course comparison of the migration now
  has one known failure (`jsxgraph-resize-loop`).
- `integration/feedback/repos.json`: ctm-libs a3df529 and ctm-checkers 9e042dc.

## 0.11.0

Consolidation step 3: **pyodide-interaktiv 1.9 runs on ctm-libs**, the
package's library, like the other components: one Python worker, one
language catalogue, one settings reader and one feedback implementation on
every page. Authors keep their pages and `filters: [ctm-assessment]`.

Components: ctm-libs at a35c9f1 (step 3, on top of 0.10.0's 8c7e5f6),
math-exercise and py-exercise with ctm-libs' new bootstrap copy (no
behaviour change), pyodide-interaktiv 1.9.0; ctm-checkers (0.2.0 at 8c3db5e)
and JSXGraph unchanged, at the commits recorded in
`_extensions/ctm-assessment/resolved-repos.json`.

### Changed for authors and learners

- **Pyodide cells no longer hold up the other exercises.** On a page with
  Pyodide cells, math and Python checks run as soon as Python has started;
  matplotlib and the other extra packages load in the background without
  getting in a check's way. Pyodide's own cells and Run buttons wait for
  them, as before. A Run clicked while the page's setup and output cells
  are still running waits for them (its button shows that it is loading),
  so a cell that uses their names never runs before them. If they cannot be loaded, the status line says that plots
  are not available (naming the package), that other Python code works
  normally, and offers Retry.
- **A page that cannot be isolated is reloaded once, not again and again.**
  Where a host sends no COOP/COEP headers (GitHub Pages) the page reloads once
  so that the service worker can isolate it. WebKit cannot be isolated this
  way and reports that reload as a plain navigation; the page then reloaded
  every two seconds. It now reloads once and `input()` stays unavailable
  there, as in other browsers that cannot isolate. A hard reload (which
  bypasses the worker) is not taken for the failed check, and the failure is
  remembered for 24 hours, not for good.
- **pyodide-interaktiv's scripts are cacheable files** (they were inline),
  and pages with `embed-resources: true` work with Pyodide cells.
- **`pyodide:` settings combine key by key** across `_quarto.yml`, profiles,
  `_metadata.yml` and the page, as every other CTM section; `ctm-assessment:
  lang` reaches Pyodide's interface; `nn` pages get its Bokmål texts.
- **Builds without AI feedback** leave out Pyodide's Feedback buttons and
  every AI-only cell option (`#| task:` text included), in any filter order.
- After **Stop** without cross-origin isolation (a restart), Run waits until
  the new start is ready, and the setup cells run again first.
- **The `ai-feedback` folder is no longer installed** with the package (it
  was a thin alias of ctm-libs since 0.9). `filters: [ctm-assessment]` is
  unchanged; a page listing `ai-feedback` with the package's components uses
  `filters: [ctm-assessment]` instead. An old copy left in a course is inert.

### For maintainers

- `repos.json`: ctm-libs packages its library only (its alias is a declared
  copy until ctm-libs deletes it); pyodide-interaktiv is compared like the
  other components for its `ctm-bootstrap.lua`, and no component keeps a
  retired copy.
- New checks: `integration/feedback/pyodide-browser.cjs` (in `npm run
  test:browser`), the D2 comparison in `loading-timing.cjs`
  (`CTM_TIMING_D2_LIMIT_S`, `measure-loading.yml`), `tools/pyodide-cells.mjs`
  and the workflow *Pyodide cells, old against new*, and
  `tools/compare-rendered/expect/step3.yml` (`compare-rendered.mjs` reads
  Pyodide's settings script by its values).
- `setup-feedback-integration.py --check-pins`, and the stacked-set merge
  protocol (consolidation step-1 design §12.1).

## 0.10.0

Consolidation step 2: math-exercise grades with **ctm-checkers**, the
package's new Python checker library, instead of checker code of its own.
**Nothing changes in grading**: every exercise of the umbrella's example
site, math-exercise's example site, ctm-demo (with its review build) and
ingmat3a gets the same status, score, details and feedback as with 0.9.0
(CI compares both builds of all four), and ctm-checkers' golden tables
reproduce math-exercise 0.10's verdicts. Authors install and list only CTM
Assessment, as before:

```sh
quarto add https://erasmus-ctm.github.io/ctm-assessment/ctm-assessment.tar.gz
```

Components: ctm-libs 0.9.0 at 8c7e5f6, math-exercise 0.11.0, ctm-checkers
0.2.0 at 8c3db5e (new), py-exercise, pyodide-interaktiv and JSXGraph
unchanged, at the commits recorded in
`_extensions/ctm-assessment/resolved-repos.json`.

### Changed for authors

- **New folder `_extensions/ctm-checkers`**, installed with the package: the
  checks of every math-exercise mode, custom checkers, `assess_basis` and
  `graph_from_response`, for the browser (its page script `ctm-checkers.js`,
  about 40 KB, loaded once on a page with an exercise and cached like the
  other files) and for build time (question tests, rounding of generated
  variants). `math-exercise.js` is about 20 KB smaller. A course repository
  that keeps installed extensions out of git adds
  `/_extensions/ctm-checkers/` to its `.gitignore`.
- **Without ctm-checkers** (a partial installation), a page with a math
  exercise stops rendering with the install command; pages without one
  render.
- **The exercise syntax, the HTML of exercises, generated variants, the
  question-test command and every interface text are unchanged.**

### math-exercise 0.11 for learners and authors

- **Stop**: a check waiting behind the one a learner stops is now stopped
  too ("Stopped. Python was restarted …"; the next Check runs on the
  restarted Python). In 0.10 it ran after the restart. A runtime that stops
  answering after Stop no longer holds up later checks.
- Learner code in a Pyodide cell that rebinds `__import__` or `globals` no
  longer stops every check on the page.
- **A build without AI feedback stops at an exercise in `mode: custom`
  without a `checker`** (breaking for builds without AI feedback): such an
  exercise (assessed by AI feedback only) follows ctm-libs'
  `ai-feedback: without-ai` (the build stops and names it, unless the
  setting says `text`, `self-check` or `drop`). Builds with AI feedback
  are unchanged.
- `question-tests.py` runs the question tests in ctm-checkers, with the same
  output and exit status.

### ctm-libs

ctm-libs moves from 4acb7c6 to 40bad7d: `ctm.checkers` (it finds, installs
and calls ctm-checkers for components; ctm-libs #23), then to e415cee
(ctm-libs #25, step 4 follow-ups): in WebKit a deep link to a tab title far
down a page keeps the tab row in view, and `markdown-lint` resolves nested
includes against the page, as Quarto does; then to 8c7e5f6, the head of
step 4's set (ctm-libs #29 on #28, with #26 merged before them): the focus
stays where a deep link put it when WebKit's late jump to the fragment drops
it (#29); `markdown-lint`'s reading as an API for maintainer tools,
`ctm.source.read()`, `ctm.ui.rawHTML()` and `ctm.ui.defaultTitle()` (#28,
no change to a page); ctm-checkers' STACK engine as a part of its own, one
install per runtime and payload (#26, step 2). With it ctm-checkers moves
from 4bd916d (0.1.1.dev0) to 8c3db5e (0.2.0, ctm-checkers #3 and #4), the
commit ctm-libs' own tests use since #26: its STACK engine is a wheel and
page script of their own, which math pages do not load, and its install
code leaves no name behind; math-exercise's verdicts are unchanged (the
parity check).

### For maintainers

- `integration/feedback/repos.json` pins ctm-checkers (U2a) and the package
  builder keeps checker Python in one home: no packaged folder but
  ctm-checkers defines `_math_check` or `assess_basis` (in any file) or
  ships a wheel, and math-exercise's only Python files are `variants.py`
  and `question-tests.py`.
- `tools/compare-rendered/expect/step2.yml`: the one expected rendered
  difference, ctm-checkers' page script on pages with a math exercise.
- `tools/compare-browser.mjs` checks a page that only the new site has (a
  course's test page) on its own (check `new-only`): reveals closed at
  first, the switch, Enter and Space on every summary, print and embedded
  pages; its links and console are checked as before.
  `expect/step4-migration-ctm-demo.yml`, named in the dispatch that previews
  ctm-demo's migration (not loaded otherwise), explains exactly what it
  changes: its step-4 UI test pages, the index page's link to them and the
  edited words of the help page. A `known-failures` entry can name the
  `place` and the `target` (`page#id`) of a link's target;
  `collapsed-callout-target` (in `step4-migration.yml`, ctm-demo's test
  page only) records that ctm-nav.js does not open a collapsed callout
  around a target.

## 0.9.0

CTM Assessment 0.9.0 is the first versioned release of the package. The
components' shared parts move into **ctm-libs**, the package's internal
library (the ai-feedback repository, renamed): settings, languages, the
Python runtime of the page and AI feedback. Authors install and list only
CTM Assessment, as before:

```sh
quarto add https://erasmus-ctm.github.io/ctm-assessment/ctm-assessment.tar.gz
```

Components: ctm-libs 0.9.0 (with the `ai-feedback` alias), math-exercise
0.10.0, py-exercise 0.4.0, pyodide-interaktiv 1.8.0 and JSXGraph, at the
commits recorded in `_extensions/ctm-assessment/resolved-repos.json`.

### Changed for authors

- **Settings combine key by key** in every CTM section (`ai-feedback`,
  `ctm-assessment`, `math-exercise`, `py-exercise`) across `_quarto.yml`,
  profiles, `_quarto.yml.local`, `_metadata.yml` and the page: a page that
  sets one option keeps the project's other options (F-79).
- **New key `ctm-assessment: lang`**: the interface language of every
  component. A component's own `lang` still wins.
- **py-exercise speaks Norwegian Bokmål** (`nb`), and pages in Nynorsk (`nn`)
  get the Bokmål interface. On Norwegian pages py-exercise now also asks for
  AI feedback in Norwegian.
- **math-exercise `feedback: auto` means on**: every exercise has a Feedback
  button unless `feedback: false` (or a build without AI feedback).
- **A site without AI feedback** (P22): `ai-feedback: enabled: false` (for
  example in a profile: `quarto render --profile no-ai`) or
  `CTM_FEEDBACK=off`. No page can turn it back on; nothing of AI feedback
  reaches the HTML (no files, configuration, activity data, criteria,
  starters, Feedback buttons); activities keep their visible task; pages that
  asked for feedback get one build message.
- **Policy keys** (A2): `policy-files` adds up over project, profiles,
  `_metadata.yml` and page; `policy` selects, the nearest setting winning.
  `project-policy`, `page-policy` and `page-policy-files` keep working in 0.9
  with a warning each.
- **A credential in the metadata stops the render** (`api-key`, `token`,
  `secret`, … in any CTM section; A1).
- **Unknown `ai-feedback:` and `ctm-assessment:` options warn** that they
  become errors in 1.0 (A3); `version:` is not an option (A7). Values that
  were accepted loosely (`py-exercise: submission`, `show-test-hints`,
  `feedback`; a component section that is not a mapping) warn likewise.
- **`py-exercise: show-test-hints: false`** written as a YAML boolean now
  hides the test hints; it was ignored before.
- **Explicit context also sends the section's prose** (A5): with
  `context: <block ids>`, feedback requests hold the listed blocks and then
  the prose of the exercise's own section, without context blocks (the
  listed ones come first, the others belong to other exercises).
- **The AI context stays in the exercise's tab and leaves out closed
  material**, for automatic and explicit context alike: a tab of a tabset
  starts a section as a heading does (nested tabsets too), and after a tabset
  its section goes on without the tabs' prose; the content of `<details>`
  blocks and collapsed callouts (solutions, reading steps, hints) is not sent
  as section prose, except to an exercise inside such a block. Before,
  automatic context could carry other tabs' prose and closed solutions. This
  changes what a feedback request contains, not grading.
- **Scripts are cacheable files** (D1): the runtime, the message catalogues,
  AI feedback and the components' scripts are HTML dependencies, loaded once
  per page, instead of about 190 KB inlined per page.
- **Pyodide 0.28.3** (Python 3.13; SymPy 1.13.3 as before) for the page's
  Python runtime (D4), as pyodide-interaktiv already used. Every exercise of
  the example sites and courses grades alike under both versions (the parity
  harness).
- **A component without CTM Assessment stops the render** with the install
  command (math-exercise and py-exercise; component development builds use
  `CTM_COMPONENT_DEV=1`).
- **`filters: [ai-feedback]` is deprecated**: it keeps working in 0.9 with
  one build warning. Use `filters: [ctm-assessment]`.
- **Fixed: `</script>` in an exercise or a setting no longer breaks the
  page.** py-exercise (exercise data: starter and test code, captions; its
  settings) and math-exercise (its settings) write the JSON in the page's
  scripts with `<`, `>` and `&` escaped, as ctm-libs does for feedback data.
  Before, a starter or test containing `</script>` broke the page.

- **Reveals, the lecture/reading switch, links into tabs and embedded
  pages, in Markdown** (step 4; ctm-libs 4acb7c6):
  `::: {.reading-step title="…"}`, `::: {.hint}`, `::: {.solution}` and
  `::: {.details title="…"}` are closed boxes; a page with reading steps
  gets the switch at its top (`::: {.modes}` places it, `ctm-assessment:
  modes: false` leaves it out); `::: {.embed src title height}` embeds a
  page. See the [authoring guide](docs/authoring.md#show-explanations-step-by-step).
- **Links into tabs and reveals are on by default:** every page with a
  tabset (or a reveal) loads ctm-libs' `ctm-ui.css` and `ctm-nav.js`, which
  open the tabs and reveals around a link's target, from the page or another
  page, and focus it. `ctm-assessment: tab-links: false` turns them off; a
  site that still has its own tab-link script sets it until it removes the
  script.
- **Ids on tab headings** with the project-level filter
  `_extensions/ctm-assessment/tab-ids.lua` (`filters: - path: …, at: pre-ast`
  before `- ctm-assessment` in `_quarto.yml`): a tab heading's id and
  attributes move to the start of its pane, so links to a tab work (and
  `quiz=` reaches the filters). Ids with a cross-reference prefix, and ids of
  the form of Quarto's own pane ids (`tabset-1-2`), are not moved, with a
  warning. A project with the line stops with an older package.
- **Reveals take over six class names** (backwards-incompatible for a site
  that uses them; none of the CTM courses, this package or its components
  does): in HTML a div with `.reading-step`, `.hint`, `.solution` (Quarto's
  visible *Solution.* before) or `.details` becomes a closed reveal, `.embed`
  an embedded page (it needs `src` and `title`) and `.modes` the place of the
  switch.
- **`ctm-assessment: markdown-lint: true`** warns at render time about raw
  HTML that has a Markdown form (`<details>`, `<summary>`, `<div id>`
  anchors, `<iframe>`, a hand-written switch), tabsets in a project without
  the `tab-ids.lua` line and a `.details` without a title, with files and
  lines.
- **A build without AI feedback stops at exercises that only AI feedback can
  assess** (ctm-libs #21; breaking for builds without AI feedback): `.ai-feedback`
  activities (and, with component versions that ask ctm-libs, exercises
  without a static check) are named in one error. `ai-feedback: without-ai: text` (or `self-check`) shows them
  as text with a note, `drop` removes them. Builds with AI feedback are
  unchanged.

### Unchanged

The author syntax of every component, grading (no checker changed), the
`ai-feedback:` section, `.ai-feedback` activities and policy files, the
settings dialog and "Remember on this device" as its default,
`filters: [ctm-assessment]`, and the order in which the package runs the
components (now ctm-libs, JSXGraph, math-exercise, py-exercise,
pyodide-interaktiv).

### Installation and releases

- Releases are GitHub release assets:
  `quarto add https://github.com/Erasmus-CTM/ctm-assessment/releases/download/v0.9.0/ctm-assessment.tar.gz`
  installs exactly 0.9.0; the site URL above stays the latest build of `main`.
- Course repositories that build from source can fetch ctm-assessment at a
  release tag (`v0.9.0`): the installer builds that release's pinned
  components, so the files equal the release archive.
  `install-project.py --release v0.9.0` checks that the checkout is that
  release. The installer reads `--review-refs ai-feedback=SHA` as ctm-libs
  (for 0.9 only) and prints the installed version.

### For maintainers

- `integration/feedback/repos.json`: `ctm-libs` (repository
  Erasmus-CTM/ctm-libs, extensions `ctm-libs` and `ai-feedback`) replaces
  `ai-feedback`, which stays accepted as an alias name in `--source`, `--ref`,
  `--review-refs`, `--only` and review trailers.
- The builder checks that every copy of `ctm-bootstrap.lua` equals ctm-libs'
  `bootstrap/ctm-bootstrap.lua` and that no component but pyodide-interaktiv
  still ships `feedback-loader.lua` or `shared/pyodide-runtime.js`; tests get
  `CTM_LIBS_EXTENSION`; `--update-pins --only NAME[,NAME]` re-pins only those
  repositories; `--follow-branches` keeps a pin that its branch does not
  contain (the JSXGraph fork pin), with a log line; the record names the
  package version.
- New checks: the Pyodide parity harness (`integration/pyodide-parity`, a job
  of the examples workflow), the rendered-page comparison
  (`tools/compare-rendered.mjs`, workflow "Compare rendered courses"), a
  build without AI feedback, settings across components, delivery, and the
  examples' effective policies after the move to the new policy keys.
- Release workflow on tags `v*.*.*` (`scripts/release-check.py`: the tag
  names the package version, every component is pinned, the release notes are
  this file's section).
- Step 4 (A2): `tools/migrate-course-html.py` converts a course's raw HTML
  to the Markdown forms (`--config` also edits `_quarto.yml`) and, with
  `--check --baseline`, lints a course that has not migrated yet;
  **Compare rendered courses** compares each course from the package it
  pins to the pull request's head, takes `course-base-ref`, a package per
  side (`pin`), `convert`, `expect` and `browser` on demand, and checks the
  fixture course `integration/step4-course` against its migration
  (`expect/step4-migration.yml`) and in Chromium, Firefox and WebKit
  (`tools/compare-browser.mjs`); `expect/step4.yml` lists step 4's
  differences on pages without its Markdown. The `tab-ids.lua` canary runs
  in its own job of **Quarto versions**, which fails the run with the
  current Quarto release too. The umbrella's own unlabelled exercises got
  labels.
- Step 4 follow-ups (review of A2): the converter and its lint follow nested
  includes with ctm-libs' own rule (`ctm.source.files()`, run by
  `tools/source-files.lua` through `quarto pandoc lua`; the tool now needs
  Quarto and `--ctm-libs DIR` or `CTM_LIBS_EXTENSION`), and the converter
  removes a hand-written anchor that repeats the id of the tab heading it
  follows (with the `tab-ids.lua` line the page would have it twice; links
  keep working). `compare-rendered.mjs` checks three invariants that no
  expected category can explain: every reveal keeps its words (more only as
  the words that followed a raw `<details>` closed early by a heading), the
  switch stays where it was or goes to the top of the page, and no id occurs
  more often than before. `compare-browser.mjs` checks the same for reveals
  and the switch, compares the Tab presses to reach the switch, has a
  `--first-visit` mode (no isolation headers, coi-serviceworker active) and
  reads `known-failures` from the expect file; the fixture course has
  tabsets far down a long page with deep links from another page. After the
  A2b review: a reveal may take in the heading after it only where the old
  course's Markdown had that heading inside the raw `<details>`
  (`migrate-course-html.py --reveal-ends`, read by both tools);
  `compare-browser.mjs --shard I/N` splits a large course into jobs, the
  first visit is sampled and keeps Pyodide and Monaco blocked, console
  errors name their frame, and a link in a collapsed callout is clicked.
  After the A2c review: a heading inside a `:::` div (a callout's title)
  closes no raw `<details>` in `--reveal-ends`; the converter resolves
  include lines from memory and writes nothing into a course it only reads;
  a console message is put down to an iframe only from the same page load;
  the first visit loads a target of every kind of place on each page.
- The converter keeps no copy of ctm-libs' rules (AC's decision P1): which
  lines are Markdown, the raw HTML `markdown-lint` names and the reveals'
  default titles come from ctm-libs itself (`ctm.source.read()`,
  `ctm.ui.rawHTML()`, `ctm.ui.defaultTitle()`, ctm-libs #28), run by
  `tools/markdown-lines.lua` through `quarto pandoc lua`; the tool needs a
  ctm-libs with them. Its results on ingmat3a (`main`, `linalg-branch`),
  ctm-demo and the fixture course are unchanged.
