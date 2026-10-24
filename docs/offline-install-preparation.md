# Private offline installation preparation

This is a preparation API, not a public installer option or a completed offline
distribution contract. The existing installation commands and their default
behavior are unchanged.

`scripts/ctm_asset_install.py` exports
`prepare_offline_assets(project, workspace, lock, library, pins, *, reviewed_lock_sha256, private_index_bytes=None, cache=None, carried_root=None, accepted_licences=(), course_key=None, website=True)`.
It returns an immutable plan with a verified staged public bundle, a separately
staged private scanner index, and proposed profile/ignore writes. It never writes
to the real project. The caller owns the private stage and any later installation
transaction.

The lock must be a complete `ctm-assets-lock`, schema version 1, whose scope and
versions cover every canonical asset family from the installed library and exact
board pins. Canonical table, runtime and board-pin fingerprints must also match,
so changing paths while retaining versions is refused. Its separately supplied reviewed digest covers canonical
`ctm_assets.json_bytes(lock)`; a partial producer candidate is refused.
The import-index descriptor binds the exact private sidecar digest to reviewed
Pyodide availability, archive identity, Python version and runtime hashes.
Availability's full-release-lock hash is distinct from the public subset-lock
hash. Every selected subset package's imports must agree with the private index.

A carried input is initially a **directory envelope only**:

| Relative path | Meaning |
|---|---|
| `_ctm-assets/` | Exactly the public files listed by the complete lock |
| `.private-extensions/assets-imports.json` | The separately hash-bound private scanner index |

No other files or empty directories are accepted. Files must be regular and
non-executable; symlinks, hardlinks, junctions, special entries, parent traversal and case/path
collisions are refused. Existing cache aliases are also refused before canonical
build writes. Normal Windows 666 and POSIX 644 permissions are both
regular, non-executable files. Carried preparation uses the canonical carried
reader and cannot download. Non-carried preparation calls the canonical builder
with explicit private index bytes.

The workspace and cache must stay outside the project and read-only library
metadata. Existing authored profiles and ignore bytes are copied into private
planning space before calling the shared profile writer. Authored profiles are
not proposed for replacement. Proposed writes include their previous digest, or
`None` for a new file; applying them and checking for intervening changes remains
the future installer's responsibility. Default exam storage keys use the real
project's name, not the staging directory's name.

The focused tests use tiny real archives and canonical materialization, plus a
synthetic reviewed availability fixture consumed by the existing strict v2
reader. They cover refusal controls and preparation integrity; they do not claim
a complete official bundle, rendered collector gate, browser isolation, or course
acceptance.
