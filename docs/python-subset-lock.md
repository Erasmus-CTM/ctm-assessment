# Private Python subset candidate

The `python-lock` command in `scripts/ctm_assets.py` verifies the exact official
Pyodide release archive from `integration/assets-metadata.json` and reads the
release's actual `package.json` version. The full release lock stays in memory
and the private archive cache. No generated lock is hand edited.

The candidate is explicitly **PRIVATE PARTIAL**, scoped to Python. It contains
the approved numpy, scipy, sympy, matplotlib, networkx, micropip, pyodide_http
and six stdlib-extra roots, their dependency closure, selected-file SHA-256
values, package licence policy, licence texts, a generated public subset lock,
and the complete deterministic Python bundle inventory. It does not establish
npm/board composition, installer readiness or complete offline acceptance.

Named extras use `--python-packages pandas,...`; `all` and unknown names fail.
Each selected payload is checked against its official release-lock SHA-256.
Wheel METADATA and licence texts are inspected without importing any code.
Unknown licence expressions or missing own/curated texts fail. A reviewed
`--licence-policy` JSON mapping can supply an exact package-version expression:
`{"package":{"version":"exact","licence":"SPDX expression","source_offer":"..."}}`.
Copyleft expressions additionally require explicit `--accept-licence` consent
and a source offer. Curated CPython, Pyodide and Emscripten texts retain their
official Git blob identities and are bound to the exact release; curated
OpenBLAS/OpenSSL records apply only to their recorded package filenames.

```sh
python scripts/ctm_assets.py python-lock --metadata integration/assets-metadata.json --cache .asset-cache --output .asset-cache/python-candidate.json
python scripts/ctm_assets.py build --lock .asset-cache/python-candidate.json --cache .asset-cache --bundle .private-python-built
python scripts/ctm_assets.py verify --lock .asset-cache/python-candidate.json --bundle .private-python-built
python scripts/ctm_assets.py install-carried --lock .asset-cache/python-candidate.json --source .private-python-built --bundle .private-python-installed
```

The producer and builder share `materialize_bundle` and `derive_lock_files`;
notices, gzip files and the self-excluding manifest use the same bytes in both.
Carried installs require the external lock and verify every file before atomic
publication. Keep candidate outputs in the private cache; never publish the
full lock or candidate as course resources. The assets workflow reproduces
candidate bytes twice and builds/verifies/installs the actual official bytes.
