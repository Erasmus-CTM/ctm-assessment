# JSXGraph Git runtime, approved 25 October 2026

AC approved a pinned Git source for both CDN and offline delivery in step 6
§16.16. Upstream source is `jsxgraph/jsxgraph` commit
`a3867ae130323b1bdc182674b03ebbdeb3c8d8f5` (runtime `1.15.0-dev`).

The built artifact is `aacchhee/jsxgraph-quarto` commit
`5a1847cbcdd22b1f167f5bb9a901d47cb43e3a23`; its codeload archive SHA-256 is
`fdc178ee998251dc73bc0ba7a9b93aae0282fd633d834022dc8da4310646a1a8`.
The reviewed wrapper is in [the runtime PR](https://github.com/aacchhee/jsxgraph-quarto/pull/1).
The exact script/CSS URLs live only in `jsxgraph-pins.yml`; their Git artifact
commit is the `jsxgraph` asset version. The separately pinned extension commit
may advance without silently changing these runtime bytes.

`upstream-runtime.json` carries the source archive and package-lock digests,
Node 24.19.0, webpack 5.112.0, the build commands and runtime/notice hashes.
`scripts/build-upstream-runtime.py --check` downloads that exact source,
checks both digests, runs `npm ci --ignore-scripts` and `npm run buildCore`,
and compares every runtime and licence byte. The only notice formatting is
setting its displayed version to the source's development ID. No upstream
code is patched. The extension PR's CI runs the same reproduction check.

The board lock verifies the built Git archive checksum, its provenance file,
upstream identity, exact runtime inventory, every member hash and licence
texts. It selects MIT under JSXGraph's dual licence and retains the complete
MIT/LGPL notices. Extraction uses the existing locked-member path and hash
checks. The local `gh/owner/repo@commit/` paths mirror the immutable jsDelivr
Git URLs. The build recipe and upstream provenance travel with the bundle.
MathJax and the font keep the existing npm integrity and reviewed font policy.

Local verification rebuilt identical runtime bytes; CDN script and CSS hashes
match the rebuilt/bundled copies. The real 1,746-file board bundle materializes,
verifies and carries to a fresh directory with zero downloads. Tests reject
floating refs, short or split Git pins, altered members under a freshly hashed
archive, and mismatched provenance. Render comparison permits only the exact
source-bound URL/renderer transition and rejects changed board code, grading,
resource attributes and unrelated markup. Full package/browser acceptance is
rerun at each updated step-6 review head; nothing is merged or deployed here.
