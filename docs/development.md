# Development and builds

[Start here](../README.md) · [Authoring guide](authoring.md)

## Development and validation

Requirements: Quarto 1.8.27, Node 22/npm, Git and Python 3.12+.

```sh
python -m pip install sympy==1.14.0 networkx==3.4.2 PyYAML==6.0.2
python scripts/setup-feedback-integration.py --test
npx playwright install chromium
python scripts/setup-feedback-integration.py --browser
python -m http.server 8000 --directory .feedback-workspace/site/_site
```

The builder renders one `example.html` from `example.qmd` and topic includes,
using the exact branch commits in `integration/feedback/repos.json`. It records
revisions and hashes, rejects consumer runtime copies and tests installed shared
loading, filter order, context reuse and browser behavior. Consumer tests receive
`AI_FEEDBACK_EXTENSION` pointing to this checkout; running them independently
requires that environment variable. See the [workbench guide](../integration/feedback/README.md)
for local source overrides. Regenerate embedded policies in the ai-feedback source repository; the builder
checks for drift before running tests.

PR builds upload rendered examples; only a successful main build deploys Pages.
Consumer migration PRs follow acceptance of the combined examples. Historical
[phase 1](../docs/history/phase-1.md) and [migration](../docs/history/migration.md) records describe the
original restructuring; this README describes the current integration branches.

## Automatic builds and Pages deployment

The workflow runs on pull requests, feature-branch pushes and pushes to `main`.
Every build resolves pinned dependencies, renders all five topic tabs, runs unit
and cross-integration tests, then tests real Python/JSXGraph behavior in Chromium.
It uploads the rendered site and installable archive as artifacts. A successful
**main** build deploys both examples and archive to GitHub Pages; PRs never deploy.
Concurrent deploys are serialized. Failed tests prevent deployment.

One repository setting is required: **Settings → Pages → Build and deployment →
Source: GitHub Actions**. The deployment job uses only `pages: write` and
`id-token: write`; no personal deployment token is stored in this project.

The JSXGraph tab includes a right-triangle length task checked by math-exercise
and a circle/square task asking for German names through non-Python feedback.

