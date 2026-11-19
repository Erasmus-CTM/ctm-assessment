# A5 dry run: the offline website built from the current pins (19 Nov 2026)

This is a local build of the offline website ZIP, following the steps of `.github/workflows/exam-site-zip.yml`, on
branch `claude/nice-dirac-uz5r4x` at `a23e171`. It covers step 8 of the
[plan](../consolidation/2026-11-release-1.0-plan.md) §3 only partly: the browser here is Chromium 1243 under
Playwright, not CEF, WebKit or real SEB.

## Build

| Step | Result |
|---|---|
| `scripts/build-p13-assets.py`: ctm-libs `972cae3`, pyodide-interaktiv `793a872`, vendor selections reproduced from upstream | Complete lock SHA-256 `c169a36d35c17c5fc59c0e46c0262dbc1e2733cd97629148f7fd0c7f51ff17fc`. This equals the AC-approved receipt (`integration/p13-complete-assets.json`) without the CI baseline artifact |
| `scripts/build-course.py --path integration/offline-ide` | Package installed from the pins; every component pinned (`resolved-repos.json`). The JSXGraph fork snapshot was seeded from `git archive` of `49a1c7d`, because this environment's proxy refuses codeload for that repository |
| `scripts/install-p13-site-assets.py` | 3,230 files verified |
| `quarto render --profile offline,exam` (Quarto 1.8.27) | Three pages: Python, Second window, Exercises |
| The workflow's ZIP step, run unchanged | 3,293 files, 126.6 MB ZIP (266 MB unpacked); `serve.py` and `README-IT.txt` at the root; `verify_deployment` passed on the site and on the extracted ZIP |

## Exercise acceptance (`tools/offline-ide-exercises.mjs`)

The extracted ZIP was served by its own `serve.py`. Every request to another origin was refused.

| Served at | math-exercise `1` / `3/4` | numeric `3.14` / `3.1` (2 d.p. of π) | py-exercise starter | External requests | Page errors |
|---|---|---|---|---|---|
| `/` | correct / wrong | correct / wrong | partial 0.5 (one of two tests passes) | 0 | 0 |
| `/dept/python/` | correct / wrong | correct / wrong | partial 0.5 | 0 | 0 |

Reports: [root](evidence/offline-exercises-root.json), [subdirectory](evidence/offline-exercises-subdirectory.json).

## Not covered here

- CI's strict five-load check of the IDE pages, the plain-LAN runs and the CEF 139/147 and WebKit engine jobs.
  They run in `exam-site-zip.yml` on the pull request.
- The component fixes on their review branches. This build uses the current pins; the review set is built by CI
  through `CTM-Review-Refs`.
- Real SEB on Windows, macOS and iOS ([checklist](../exam-seb.md)).
