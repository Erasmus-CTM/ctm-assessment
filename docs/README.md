# Documentation

[Back to the project](../README.md)

## For course authors

Start with the [authoring guide](authoring.md) to adapt an activity to your teaching.

- [Download and edit an example](example-source.md)
- [Installation and setup](installation.md)
- [Detailed options and functionality](reference.md)
- [Similar practice problems](similar-problems.md)

## For exam IT

- [Offline Python website ZIP](exam-site-zip.md): what it contains, how it is built and checked
- [Serving an offline exam site](exam-server.md): headers, the bundled `serve.py`, nginx and Apache
- [Safe Exam Browser settings](exam-seb.md) and the manual check before the first exam
- [Offline install preparation](offline-install-preparation.md) and [offline browser checks](offline-browser-checks.md)

## For maintainers

- [Development and builds](development.md) and the [CI policy](development/ci-policy.md)
- [Integration workbench](integration-workbench.md): pins, review refs, the builder
- Asset composition and locks: [composition](assets-composition.md), [complete candidate](complete-assets-candidate.md),
  [npm](npm-subset-lock.md), [Python](python-subset-lock.md) and [board](board-subset-lock.md) subsets,
  [standard library availability](stdlib-availability.md), [example assets](example-assets.md)
- [Demo component activation](demo-component-activation.md),
  [source and diagram context fix](source-and-diagram-context-fix.md)
- [Acknowledgements and funding](acknowledgements.md)

## Project records

Dated audits, designs and work logs. They describe decisions and evidence at the time they were written; the guides
above describe the current package.

- **Release 1.0.0:** [plan and decisions](consolidation/2026-11-release-1.0-plan.md), [runbook](release-1.0/runbook.md), [review-set test](release-1.0/review-set-test.md), [branch cleanup](release-1.0/branch-cleanup.md),
  [freeze manifest](release-1.0/freeze-manifest.json), [finding register](release-1.0/finding-register.md),
  [offline dry run](release-1.0/a5-offline-dry-run.md)
- **Audits:** [16 October 2026, public examples](audit-2026-10-16.md);
  [18 October 2026, pre-release audit](audit-2026-10/README.md);
  [26 October 2026, independent review of the consolidation](audit-2026-11/README.md)
- **Consolidation, October 2026:** [work log and step designs](consolidation/README.md)
- **History:** [migration](history/migration.md), [phase 1](history/phase-1.md)
