# Shared integration workbench

All common examples and acceptance checks belong to **ctm-assessment**.
The source is the root **`example.qmd`**: six text/image activities plus
Python unit-test, mathematics and Pyodide exercises.
The entry page uses topic includes in `examples/` to render one HTML page with
**Plain text**, **Python**, **Mathematics**, **Pyodide** and **JSXGraph** tabs. The Python tab includes five
partially completed practice functions and an addition exercise, with separate author notes and learner tasks.
Add a sibling tab and topic include for each new integration.
Develop and validate each shared adapter here first; only then open consumer PRs.
The current adapters are py-exercise, math-exercise and pyodide-interaktiv.

## Set up and serve

Requirements: Python 3.12+, Git, Node 22/npm and Quarto 1.8.27 or later (with Quarto 1.10, pages with exercise blocks need
`engine: markdown` in their front matter; see [installation](installation.md)). Install
`PyYAML>=6`, `sympy>=1.13` and `networkx>=3.4` in the Python used by `python`, or set
`PYTHON` to that interpreter for the mathematics tests.

```sh
python scripts/setup-feedback-integration.py --test
python -m http.server 8000 --directory .feedback-workspace/site/_site
```

Open <http://localhost:8000/example.html>. The setup script copies the root
Quarto source files and exact extension revisions into an isolated generated
workspace. It does not create a separate example source page in a consumer repo.
Use an HTTP origin: Monaco and Pyodide workers do not work reliably with `file://`.

## Repository selection

`repos.json` pins every component by full commit; `branch` names the branch
that contains that commit and that `--update-pins` follows:

| Name | Repository | Branch | Extension folders |
|---|---|---|---|
| ctm-assessment | this repository | this checkout, including local edits | `ctm-assessment` |
| ctm-libs | Erasmus-CTM/ctm-libs (formerly ai-feedback) | `main` | `ctm-libs` and the alias `ai-feedback` |
| py-exercise | Erasmus-CTM/py-exercise | `main` | `py-exercise` |
| math-exercise | Erasmus-CTM/math-exercise | `main` | `math-exercise` |
| pyodide-interaktiv | Erasmus-CTM/pyodide-interaktiv | `feature/shared-feedback-integration` | `pyodide-interaktiv` (its shipped `ai-feedback` copy is not packaged) |
| jsxgraph | jsxgraph/jsxgraph-quarto (upstream) | `main`; pinned to the commit of upstream pull request #2 until it is merged | `jsxgraph` |

A repository may own several extension folders (`extensions`); every folder is
copied and recorded. `review-ref-aliases` names earlier names of a repository:
`ai-feedback` is read as `ctm-libs` in `--source`, `--ref`, `--review-refs`,
`--only` and review trailers, with one notice (CTM Assessment 0.9 only).

**Release order.** Merge the component PRs first, keeping their commits (a
merge commit or rebase; a squash creates new commits that do not contain the
pins). Then set each `branch` to the branch they were merged into, run
`--update-pins` (it refuses a branch that does not contain the current pin),
run `--test --browser`, commit `repos.json`, and merge the umbrella. To
re-pin only some repositories, name them: `--update-pins --only
ctm-libs,math-exercise,py-exercise` leaves the JSXGraph fork pin (not on
upstream `main`) and pyodide-interaktiv as they are.

The script records the package version, every resolved commit, local
dirty-file list and copied extension file's SHA-256 in `resolved-repos.json`.
That record is included in the rendered site and the archive. External sources
are downloaded as exact-commit archives. No upstream checkout is overwritten. A
component repository that ships another component's extension folder in any
layout (`_extensions/<x>`, `_extensions/<owner>/<x>`, or nested inside its own
folder) fails the build. The one deliberate shared file, `ctm-bootstrap.lua`
(how math-exercise and py-exercise find ctm-libs), must be byte-identical to
ctm-libs' `bootstrap/ctm-bootstrap.lua` (with `--follow-branches`, a copy may
also equal the pinned ctm-libs' file, while a new bootstrap is merged
component by component), and no component but
pyodide-interaktiv may still ship `feedback-loader.lua` or
`shared/pyodide-runtime.js`, which ctm-libs provides.

Normal builds use the pins, so a merge in a component never changes the umbrella
by itself. To move to newer components, name them (a bare `--update-pins`
stops at the JSXGraph pin, which upstream `main` does not contain):

```sh
python scripts/setup-feedback-integration.py --update-pins --only ctm-libs,math-exercise,py-exercise   # writes their branch tips into repos.json
python scripts/setup-feedback-integration.py --test --browser
```

Commit the updated `repos.json` with the passing run. `--follow-branches`
builds against the branch tips without changing the manifest; the scheduled
**Track component branches** workflow does this weekly and fails early when a
component change breaks the combined page. A pin that its branch does not
contain (the JSXGraph pin) stays, with a log line saying so. The legacy
`--refresh` flag has no effect.
For unmerged dependencies, explicitly select a review branch:

```sh
python scripts/setup-feedback-integration.py --ref ctm-libs=my-review-branch --test
```

CI uses the normal manifest unless a non-main review commit explicitly declares
exact dependency SHAs in a `CTM-Review-Refs: {...}` trailer. The named review
selection step logs those refs and the builder records them. Main ignores the
trailer. Merge upstream changes first, then remove the trailer and rerun ordinary
dependency checks before merging a consumer PR. To include local branch work:

```sh
python scripts/setup-feedback-integration.py \
  --source ctm-libs=../ctm-libs \
  --source py-exercise=../py-exercise \
  --source math-exercise=../math-exercise \
  --source pyodide-interaktiv=../pyodide-interaktiv \
  --test
```

Overrides must be Git checkouts; their actual SHAs and dirty-file lists are
recorded. `--workspace PATH` selects a different generated workspace. An unrelated
nonempty folder is rejected rather than overwritten.

## Browser validation

After initial setup, install Chromium and run the real browser check:

```sh
npx playwright install chromium
python scripts/setup-feedback-integration.py --test --browser
```

CI installs Chromium's system dependencies too. `CHROMIUM_EXECUTABLE` can point
to an existing Chromium binary; `CTM_BROWSER_PROXY` supports a required network
proxy. Provider credentials are neither needed nor supplied.

The browser check executes real Python execution via Pyodide, Monaco and SymPy on the combined
`example.html`. It checks failing/passing Python responses, forbidden imports,
Reset, all five mathematics examples and their four feedback levels, and the shared
copy prompt/cogwheel. It fails when those runtimes cannot load. Python execution
is not mocked. The six standalone activities also retain their existing
rendered-page/image-transport checks. Live AI replies remain outside CI.
The browser check also switches to the **Python** tab: every starter must run
and fail at least one check, a corrected version must pass, and Reset must restore
the exact starter. It verifies printed output, code restrictions and hidden hints.

The existing examples workflow runs all checks before uploading the rendered
site and revision/browser reports. Successful main builds deploy the same site
with GitHub Pages. Feature branches retain a `rendered-examples` artifact.

## Migration boundary

Python tasks (py-exercise) use shared Feedback and settings; the Pyodide tab uses pyodide-interaktiv's
`feature/shared-feedback-integration` branch until its AI migration is merged. Feedback
reads current code without execution and includes only code-matched checker
summaries and learner output. Edits and Reset invalidate that evidence.
Mathematics uses shared settings, transport and rendering while retaining its four-step teaching policy. Feedback never runs its checker. Only matching prior Check evidence is sent; graph payloads, expected values and checker source stay local. math-exercise and py-exercise load ctm-libs (settings, languages, runtime, feedback) through their `ctm-bootstrap.lua`; pyodide-interaktiv 1.8 loads its feedback through the `ai-feedback` alias, which hands it ctm-libs' feedback module. The Pyodide tab now exercises its shared adapter with incomplete starters.
Python exercises also use Pyodide internally to execute code.

The adapters must omit stale output and hidden test source, preserve
Check/Reset/submission, and use the shared API and cogwheel without executing
code for feedback. Validate them here before opening a consumer PR.

## Pyodide integration

The fourth tab includes `examples/_pyodide.qmd`: three incomplete programs for
price, accumulation and circle area. `pyodide-interaktiv` comes from its shared
feedback feature branch; the other components from `main`; all are pinned by commit. All consumers
share settings, transport and LaTeX rendering. Pyodide retains three hints that
never supply finished code, and feedback never executes Python.

The builder rejects vendored copies of other components; the shared runtime
is ctm-libs' file, loaded once per page. Tests cover fresh stdout evidence, edit/reset/run/restart
invalidation, no raw stderr, standalone documents and both filter orders.
Consumer PRs remain deferred until this common page is accepted.

## JSXGraph integration

The fifth tab draws a right triangle for a math-exercise task and a circle and square for a plain-text German naming activity. Browser checks verify both diagrams initialize, the length answer passes, and the language activity produces shared feedback.
