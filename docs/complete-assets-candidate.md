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

Full partial/complete locks, availability data and the scanner index remain
private in the runner. The workflow emits no public asset set and performs no
course installation. Complete composition does not establish runtime/fork
generic-option acceptance or full offline course/browser acceptance.

The fixed record in `integration/assets-complete-reviewed-digests.json` was
reviewed independently from successful discovery jobs 119872057770 and
119871890521 at inspector source 82747c86. It binds the three partials,
canonical private-index bytes and previously reviewed availability report.
The subsequent workflow regenerates them and must match that record before
calling the complete composer. A changed source/input digest requires a new
independent discovery review; the workflow never updates its own record.
