# Reviewed Pyodide availability and the private import index

`ctm_assets.py import-index` consumes a schema-v2 availability report, the
verified private core stage made by `prepare-stdlib-probe`, and an independently
reviewed report SHA-256. It writes the existing schema-v1 scanner index. Only
successful imports become `stdlib_modules`; unavailable candidates are never
admitted. Release package mappings still take precedence over stdlib names.

```sh
python scripts/ctm_assets.py import-index \
  --probe-core .asset-stdlib-probe \
  --availability .asset-report-helper/assets-metadata.json \
  --reviewed-report-sha256 dd9327e9be5bb2b4fb06afd905077fd72de39e345c7ec67f76a87ff4033afe28 \
  --output .private-extensions/assets-imports.json
```

The approved report is Pyodide 0.28.3 / Python 3.13.2: 8,486 bytes, 247
importable names and 49 unavailable candidates. It accounts for all 290
CPython candidates plus six actual builtin/frozen names. Two official-release
producer runs returned identical bytes. This establishes import availability,
not module functionality or browser/offline acceptance.

The consumer binds the report kind and exact release to the producer request,
official archive URL/digest, all seven runtime hashes and CPython candidate
provenance. It rehashes every staged core file, checks the actual package.json
release and full-lock Python version, and rejects duplicate JSON keys,
non-finite values, ambiguous module names, overlapping outcomes and omitted
candidates. The source report digest and release provenance remain in the
private index. The report's reviewed digest also covers the builtin/frozen
inventory, which is distinct from the generic candidate list.

The digest is an approval input. Never replace it automatically with a digest
calculated from the current producer output. A changed report or release needs
fresh independent evidence review before updating the workflow pin.

The core, full Pyodide lock and import index stay private. Output under
`_ctm-assets` is refused. The CLI validates before writing, so rejected evidence
leaves an existing private index intact. Existing `private_import_index`
schema-v1 callers retain their previous behavior and output.

The official availability workflow exercises the real report and staged
runtime, then checks available/unavailable imports and package-map precedence
through the canonical AST scanner without executing authored code. This patch
does not replace `integration/assets-stdlib.json`, select bundle files or
licences, wire installer flags, change component pins or establish full offline
readiness.
