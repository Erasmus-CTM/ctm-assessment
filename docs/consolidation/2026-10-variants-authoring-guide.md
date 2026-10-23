# Authoring tested variants locally

Use a preparation project or ctm-demo with the reviewed math component and
canonical native checker installation. This workflow does not publish a site,
merge a PR or approve real notes automatically.

Here is the exact synthetic source exercised by the focused 50-note check:

````markdown
```{math-exercise}
#| label: synthetic-80
#| variables: |
#|   a = pick(1, 80)
#| field-labels: Answer
#| note: synthetic a={#a#}
#| tests:
#|   - name: zero is wrong
#|     answers:
#|       Answer: '0'
#|     expect: wrong
Find $a={@a@}$ and enter its value: _[{#a#}].
```
````

Keep a stable question label and give each answer its default-language field
label. `{#a#}` supplies input notation; `{@a@}` supplies mathematical display.
The real teacher-answer vector and the authored tests must pass for each new
candidate. Failed constraints and duplicate resolved notes do not count toward
25; execution, grading, test and resource failures stop the operation.

Save the example as `lesson.qmd` in the project. Generate a retained batch and
open its disconnected review file:

```sh
python _extensions/math-exercise/question-variants.py \
  --project . --file lesson.qmd --label synthetic-80 \
  generate25more --html work/synthetic-review.html
```

Review the notes, teacher values and test details, stage explicit decisions,
then download one decision request. This disconnected file shows resolved
Markdown text and validated teacher mathematical display beside the canonical
input. It does not run a student Check. Staging and downloading save no decisions. Apply the downloaded file through the same component CLI:

```sh
python _extensions/math-exercise/question-variants.py \
  --project . --file lesson.qmd --label synthetic-80 \
  apply /path/to/variant-decisions.json --html work/synthetic-review.html
```

The CLI rebuilds records from the current authored file and preserves the
download's original lease and explicit id/hash selections. A stale lease or
changed teacher/content hash refuses the write. An applied decision gets a
stable positive number; undecided proposals have no number. Reload the review
after applying decisions. To refresh it without generating or saving anything:

```sh
python _extensions/math-exercise/question-variants.py \
  --project . --file lesson.qmd --label synthetic-80 \
  review --html work/synthetic-review.html
```

Run `generate25more` again to request 25 additional tested, valid and distinct
resolved notes. Previously retained notes, rejection history and decision
numbers remain intact. Actual exhaustion can return fewer than 25. This does
not draw an unchecked pool or silently turn a failed test into another draw.

The normal Quarto path uses `_variants/LABEL.yml`. Keep that default; a CLI
`--manifest` override is for an explicit native integration and does not change
the ordinary Lua build's manifest path. For included question files, pass their
actual source file to `--file`.

For the connected local review route, retain proposals first, then run:

```sh
python _extensions/math-exercise/variants-review.py \
  --project . --file lesson.qmd --label synthetic-80
```

The helper opens a token-protected loopback page on a temporary port. Approve,
reject and bulk decisions save through the canonical wrapper and rebuild the
review from current source. It accepts decisions only for the file and label
selected at launch. Keep the terminal running; Ctrl-C stops it. `--no-browser`
prints the address without opening it; `--port` selects a port explicitly.
Expand a candidate to build its student view lazily through the actual installed
Quarto math filter. The view provides the question, worked solution, blank learner
fields and Check controls; available authored languages have separate views.
This isolated preview omits ambient course context and diagrams. A course review
build is still needed to inspect those. Runtime/CDN availability is a separate
condition: rendered controls alone do not prove that grading started.

The connected page also provides **Generate 25 more**, preserving the original
manifest lease and existing decisions. A stale source or another writer stops the
operation. There is no file watcher. After a stale lease or uncertain save result,
reload and inspect the current manifest before deciding again. A timeout after a
possible write is uncertain; do not blindly retry an old decision request.

Normal publishing requires approval: zero current approved notes stops the
build, and fewer than the target emits a warning. Explicit OPEN is the existing
`CTM_VARIANTS=optional` setting: unapproved notes remain visibly unapproved and
warnings remain. `CTM_VARIANTS=review` chooses the nonstudent review route.
Ordinary `quarto preview` is not an implicit approval-gate exception. These build
settings do not turn the disconnected local review into a live bot or Check.

## Reviewing a GitHub branch

The inactive trusted workflow templates produce exact-head review files without
writing proposal history. Once a maintainer installs the reviewed workflow on the
trusted default branch and configures the actual preview host, its review links
can offer **Copy file** and **Open in GitHub editor**. Stage decisions, copy the
complete manifest, inspect the branch/file and Git diff, then make your own
commit. The complete file preserves large JSON numbers, proposal tapes, snapshots,
stable decision numbers and history. An old artifact is a snapshot: regenerate it
if the source or manifest changed before pasting.

On a same-repository PR, the GitHub batch link opens the native Actions form with
explicit branch, PR number, expected head and question label. It requests one
read-only tested batch; it does not write the source manifest or grant approval.
Forks can use their own branch editor but do not get an unsupported privileged
batch route. No workflow, dispatch, comment or preview deployment was activated
by this campaign.

Current source also provides rejection-only retirement for a gone approval,
problems-only review, undo, safe same-answer reapproval and conservative rejection
hints. Retiring an absent entry requires a reason and preserves its number,
snapshot and history. It cannot approve an absent candidate. Strict review CI
fails changed or gone approvals even when another approval can still publish.
Handwritten pools have a separate read-only teacher/authored-case CI check and
never acquire approval manifests.

Project reports summarize current decisions and check results. More than 30 open
questions use one project summary while preserving existing checklist ticks;
deleted-question comments become inert read-only archives. These are tested source
and fake-API contracts. Live status attachment, GitHub math rendering and a hosted
review URL remain unobserved and require an installed trusted workflow.

## Focused verification retained for review

The installed CLI check used math `9bf8a2f40cf459fa326abb604e894a42c8aa686e`,
its declared checker pin `1a42281c3d7332df94e9b6e9df250ba7610369c7`, Quarto
1.8.27, Python 3.12.14, SymPy 1.13.3 and PyYAML 6.0.3. A canonical producer built
the native installation; the CLI ran from a hostile working directory.

The sequence generated 25 notes, explicitly approved one synthetic fixture note,
then generated 25 more. All 50 distinct notes passed their real teacher vector
and authored test. The first 25 proposal records, their order, the sole approval
number/id/hash and the complete decision/event history stayed unchanged.
The second batch scanned 50 source records, skipped the 25 retained identities
and added exactly 25; it did not enumerate all 80 choices.

An invalid HTML directory failed before a manifest write. A separate rejected
choice space failed explicitly at the 5,000-prefix-attempt budget, and a separate
authored-test failure stopped without a partial manifest or resampling. These
intentional faults are separate expected failures, not normal raw-clean runs.
This native proof does not establish browser, live-course or deployment
acceptance. Later source slices implement the trusted producer, sticky updates and reporting.
Live workflow/status attachment remains a separate acceptance item.

The connected helper has separate focused server and browser evidence; it is
not part of the earlier CLI50 tuple above. See the continuation checkpoint for
the exact installed source tuple and remaining acceptance boundaries.
