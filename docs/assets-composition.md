# Complete lock composition

`compose_asset_lock` accepts the three independently reviewed Python, core npm
and board partial candidates. Their scopes, versions and digests must match the
canonical library sources and board pins. Each partial inventory is reproduced
before composition.

The composer combines archive selections and generated files, then materializes
them again. Partial manifest and notice inventories are never concatenated.
Output collisions and missing families stop construction.

The complete candidate has kind `ctm-assets-lock`. Its `private.import_index`
descriptor binds the scanner-index bytes to the reviewed availability evidence,
official Python archive, runtime hashes, Python version and subset imports.
The full release-lock hash in that provenance remains distinct from the
generated public subset-lock hash. The index bytes stay outside public assets.

`validate_bound_import_index` provides the same strict checks to installer
preparation, including the exact existing scanner-index schema. Neither API
exposes installation flags or establishes complete course offline acceptance.
The contract tests use actual fixture archives and prove deterministic complete
construction, refused mutations, and carried verification with downloads blocked.
Actual official complete composition and runtime acceptance remain separate gates.
