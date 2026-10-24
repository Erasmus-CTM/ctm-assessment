# Canonical npm subset candidate

The npm candidate uses the five exact library entries in `assets.json`. It checks
the official archive integrity, package identity and version, licence texts and
runtime file set before producing any output. Monaco retains its third-party
notices; KaTeX retains its package ES modules and fonts. The local theme font
alias imports Source Sans Pro weights 300, 400 and 700.

Produce a candidate in a private build directory:

```sh
python scripts/ctm_assets.py npm-lock --metadata integration/assets-metadata.json \
  --libs PATH/TO/_extensions/ctm-libs --cache .asset-cache/npm \
  --output .private-extensions/npm-lock.json
```

This is a **partial** candidate. It contains neither Pyodide nor the JSXGraph and
MathJax assets used inside boards. It does not enable course installation or
establish full offline acceptance. The existing canonical builder can construct
and verify its files, and the carried-bundle path verifies them again without
downloading. A complete reviewed lock must compose all asset families and pass
the course and browser gates before offline installation is offered.
