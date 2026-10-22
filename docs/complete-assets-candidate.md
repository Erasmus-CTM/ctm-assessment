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
