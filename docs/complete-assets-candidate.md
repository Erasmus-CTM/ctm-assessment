# Official complete asset candidate

This separate inspection lane freezes the reviewed composer, board producer
and canonical library source by exact commit. It regenerates Python, core npm
and board partial candidates from their committed official archive metadata,
plus the private scanner index from the independently reviewed strict v2
release-availability report.

The first run calls no complete composer. It verifies canonical partial JSON,
rederives each inventory through the canonical materializer, and emits only a
bounded summary of digests, scopes, versions and provenance. These candidate
digests require independent review.

After that review, a committed reviewed-digest record can enable the script's
`--reviewed-digests` mode. All actual candidates must exactly match that
record. Only then does the canonical `compose_asset_lock` API combine raw
selections and derive the complete inventory. Canonical build, verification
and carried installation check actual bytes with network calls forbidden.

Download `prebuilt-offline-assets` from the [workflow run page](https://github.com/Erasmus-CTM/ctm-assessment/actions/workflows/assets-complete-candidate.yml).
It contains the verified `inspection/complete-built/` asset folder,
`inspection/complete-lock.json` and the `assets-imports.json` scanner sidecar.
The lock and index are build metadata outside the asset folder; keep them
outside `_ctm-assets` and generated sites. Discovery partials and availability
data stay in the runner. This workflow performs no course installation and
does not establish runtime/fork or full offline course/browser acceptance.

The fixed record in `integration/assets-complete-reviewed-digests.json` was
reviewed independently from successful discovery jobs 119872057770 and
119871890521 at inspector source 82747c86. It binds the three partials,
canonical private-index bytes and previously reviewed availability report.
The subsequent workflow regenerates them and must match that record before
calling the complete composer. A changed source/input digest requires a new
independent discovery review; the workflow never updates its own record.
