# CI policy during the saving and quiz integration

Small source changes receive automatic source and fixture contracts. Broad
campaigns run only when AC explicitly requests a "broad testing campaign".
Enter that exact phrase in the workflow's `confirmation` input. A missing or
different value fails a cheap authorization job before broad jobs start; a
skipped campaign is never acceptance evidence. Reusable course-comparison calls
remain deliberately callable with their existing explicit-ref API. Their caller
owns authorization; this policy does not add a new required reusable input.

ctm-demo is the integration testbox and has no live students. Focused local
checks while wiring saving, quiz and variants are allowed, including ordinary
browser verification. One full final acceptance pass for the coherent ctm-demo
candidate is already authorized; it does not require another permission request.
Do not repeat the full campaign after each small fix. Repeated broad campaigns
need AC's explicit request.

After that ctm-demo acceptance passes **and AC has merged all its component
changes**, ask AC before starting the ingmat3a rollout. Special ingmat3a branches
may be prepared and tested autonomously; ingmat3a main serves live students and
must stay stable. This policy does not authorize changing or deploying that main.

## Automatic coverage

- `examples-pages.yml` runs selected source contracts, including comparison,
  persistence-comparator and variant-coverage negatives, without Quarto renders
  or browser downloads. The main publication path still renders, uploads and
  deploys the example site; its full component-test/browser tail is manual.
- The fixture-contract jobs in `assets.yml`, `assets-board.yml`, `assets-npm.yml`
  and `assets-compose.yml` stay automatic. Official archive resolution,
  materialization, provenance renders and runtime probes are manual.
- `offline-server.yml` retains its narrow HTTP contract triggers.
- `jsxgraph-renderer-calibration.yml` retains its scoped PR contract: two actual
  Quarto frames and source/identity/geometry negative mutations. Its duplicate
  branch-push trigger is removed.
- Owner-created release tags retain the existing release procedure. No tag is
  created by this policy.

## Explicit broad coverage

Confirmed dispatch retains the existing assertions and artifacts for examples
and component integration; actual store persistence in all three browsers;
course rendered/browser comparison and its baseline replay; Pyodide parity,
goldens and cells; loading measurements; Quarto versions; branch-tip tracking;
offline browser controls; and official asset inspection/materialization.
Automatic broad PR/push triggers and weekly schedules are removed.

`compare-courses.yml` keeps its dispatch and reusable inputs, including separate
tooling/package/course refs, browser selection, shards and reviewed component
refs. `store-integration.yml` remains its own dispatch gate; a course comparison
alone does not execute that persistence fixture. For manual Pyodide build
comparison, supply `base`; the optional `expected` input names an existing,
independently reviewed expected-difference JSON file. Empty means no allowance;
a supplied missing file fails. No browser errors or failing assertions are
filtered by this policy.

Freeze the candidate's source, package/component pins, tooling and course commits
before final acceptance. Record the resolved tuple, head/tree, run/job IDs,
commands, complete failures and checks/skips, and artifact hashes. Keep original
controls and failed attempts. A focused source check, skipped/manual job or
bounded renderer proof does not clear saving, quiz, variants, raw errors,
accessibility or full course behavior. Acceptance concerns that exact frozen
candidate; later source changes require a proportionate focused recheck and a
documented decision about whether they invalidate the final evidence.
