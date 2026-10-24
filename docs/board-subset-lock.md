# Private board asset subset

The board candidate reads exact asset versions and loader paths only from
`_extensions/ctm-assessment/jsxgraph-pins.yml`. The font URL is a package root
with a trailing slash. These browser-library pins do not change the JSXGraph
extension commit or implement its generic local URL options.

`scripts/ctm_board_assets.py` calls the shared npm archive validator and the
canonical materializer. It verifies the official registry URL, SHA-512 SRI,
actual package.json name/version/licence and retained licence texts. JSXGraph
keeps its distribution and notices. MathJax 4 and the font keep every member
of their npm distributions, including speech mathmaps, dynamic extensions,
both font renderers and all 105 WOFF2 ranges.

The exact font archive omits licence files. Its narrow curated policy in
`integration/assets-board-licences.json` binds its version/SRI, all WOFF2
member hashes and retained definition hash to independent archive inspection.
Every actual font's embedded copyright identifies the GUST Font License;
the same retained definition produces SVG and CHTML data. The bundle carries
the exact primary Apache and GUST texts, the LPPL 1.3c text incorporated by
GUST, and the original font copyright notices. Other npm packages still fail
when their archive lacks its required root licence text. A changed font
archive/version needs fresh source evidence and review.

Produce a private candidate:

```sh
python scripts/ctm_board_assets.py --metadata integration/assets-board-metadata.json \
  --pins _extensions/ctm-assessment/jsxgraph-pins.yml --cache .asset-cache/boards \
  --output .private-extensions/board-lock.json
```

Its kind is `private-partial-board-assets-lock`. Scope and versions contain
only the three board assets. `provenance.board_pins_sha256` binds the exact
pin-file bytes, including loader paths. Its inventory is derived through
`derive_lock_files`, and build, verification and a carried installation use
the same canonical producer. This partial candidate neither enables course
installation nor establishes complete lock composition, sandboxed board
mechanism proof or full offline acceptance.
