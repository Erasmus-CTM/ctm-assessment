# Changes

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

Components: ctm-libs 0.9.0 at 40bad7d, math-exercise 0.11.0, ctm-checkers
0.1.1.dev0 at 4bd916d (new), py-exercise, pyodide-interaktiv and JSXGraph
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
- **Builds without AI feedback**: an exercise in `mode: custom` without a
  `checker` (assessed by AI feedback only) follows ctm-libs'
  `ai-feedback: without-ai` (the build stops and names it, unless the
  setting says `text`, `self-check` or `drop`).
- `question-tests.py` runs the question tests in ctm-checkers, with the same
  output and exit status.

### ctm-libs

ctm-libs moves from df4799e to 40bad7d: `ctm.checkers` (it finds, installs
and calls ctm-checkers for components; ctm-libs #23), and on the way the
commits that came before it on ctm-libs `main`: builds without AI feedback
(`ai-feedback: without-ai`, #21) and step 4's reveals, lecture/reading
switch and links into tabs (#22, #24), described with step 4 in the
package's own changes (ctm-assessment #16).

### For maintainers

- `integration/feedback/repos.json` pins ctm-checkers (U2a) and the package
  builder keeps checker Python in one home: no packaged folder but
  ctm-checkers defines `_math_check` or `assess_basis`, and math-exercise's
  only Python files are `variants.py` and `question-tests.py`.
- `tools/compare-rendered/expect/step2.yml`: the one expected rendered
  difference, ctm-checkers' page script on pages with a math exercise.

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
