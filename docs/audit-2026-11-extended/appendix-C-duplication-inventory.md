# Appendix C — Duplication and ownership inventory at the extended-audit snapshot

The machine-readable [ownership table](inventory/ownership.tsv) lists every tracked `_extensions/` file in the component pins and consumers, plus canonical bootstrap and source-panel filters. It records commit, owner, generator/copy status, bytes and SHA-256. Consumer repositories without tracked extensions have no extension rows; untracked installs are not attributed to their commits. Full literal global/data-attribute references are in [contracts.json](inventory/contracts.json).

Git-blob inventory: **201 files, 3,841,527 bytes; 54 exact-duplicate groups; 4 normalized near-duplicate pairs**. Includes wheel payloads, intentional distributed library copies, source filters and notices. Comment/whitespace normalization is heuristic; this is not an exhaustive function-level duplicate detector.

Since October: math/py runtime and feedback-loader copies are removed; Python math grading moved to ctm-checkers; matrix UI and locale catalogues moved to ctm-libs. Deliberate bootstrap copies stay byte-identical. Standalone IDE still distributes generated ctm-libs/ai-feedback forwarder copies. Its source pin33fd5a5 matches its generated files, but lags umbrella b1e7ec8 in provider and worker code. Native variant review remains duplicated (prior November M13); source-panel filters remain divergent (prior L9). Freehand's new source-filter adaptation removes policy panels and adds opt-in gating; a whole-file similarity threshold misses it, so it is recorded from attribution and manual comparison.

## Exact byte groups

| SHA-256 prefix | Locations |
|---|---|
| `df5183a0b607` | `ctm-libs:_extensions/ctm-libs/_extension.yml`; `pyodide-interaktiv:_extensions/ctm-libs/_extension.yml` |
| `c3696f2a2442` | `ctm-libs:_extensions/ctm-libs/assets.js`; `pyodide-interaktiv:_extensions/ctm-libs/assets.js` |
| `002d989e9449` | `ctm-libs:_extensions/ctm-libs/assets.json`; `pyodide-interaktiv:_extensions/ctm-libs/assets.json` |
| `099b446bf747` | `ctm-libs:_extensions/ctm-libs/ctm-libs-end.lua`; `pyodide-interaktiv:_extensions/ctm-libs/ctm-libs-end.lua` |
| `24cff3bd2d15` | `ctm-libs:_extensions/ctm-libs/ctm-libs.lua`; `pyodide-interaktiv:_extensions/ctm-libs/ctm-libs.lua` |
| `6587432d2e8a` | `ctm-libs:_extensions/ctm-libs/deno.json`; `pyodide-interaktiv:_extensions/ctm-libs/deno.json` |
| `b1c871609ede` | `ctm-libs:_extensions/ctm-libs/feedback/ai-feedback.css`; `pyodide-interaktiv:_extensions/ctm-libs/feedback/ai-feedback.css` |
| `1f8391206d7b` | `ctm-libs:_extensions/ctm-libs/feedback/ai-feedback.js`; `pyodide-interaktiv:_extensions/ctm-libs/feedback/ai-feedback.js` |
| `0ee4cfdc6d1c` | `ctm-libs:_extensions/ctm-libs/feedback/feedback-defaults.yml`; `pyodide-interaktiv:_extensions/ctm-libs/feedback/feedback-defaults.yml` |
| `eed751a7aa4d` | `ctm-libs:_extensions/ctm-libs/feedback/feedback-dom.js`; `pyodide-interaktiv:_extensions/ctm-libs/feedback/feedback-dom.js` |
| `595e723fadaa` | `ctm-libs:_extensions/ctm-libs/locales/common.js`; `pyodide-interaktiv:_extensions/ctm-libs/locales/common.js` |
| `3548274f47bf` | `ctm-libs:_extensions/ctm-libs/locales/ctm-locale.js`; `pyodide-interaktiv:_extensions/ctm-libs/locales/ctm-locale.js` |
| `4d1def491ac3` | `ctm-libs:_extensions/ctm-libs/locales/ctm-stack.js`; `pyodide-interaktiv:_extensions/ctm-libs/locales/ctm-stack.js` |
| `25630b2463a5` | `ctm-libs:_extensions/ctm-libs/locales/feedback.js`; `pyodide-interaktiv:_extensions/ctm-libs/locales/feedback.js` |
| `41b24252ea47` | `ctm-libs:_extensions/ctm-libs/locales/math-exercise.js`; `pyodide-interaktiv:_extensions/ctm-libs/locales/math-exercise.js` |
| `e85cbdc2d833` | `ctm-libs:_extensions/ctm-libs/locales/py-exercise.js`; `pyodide-interaktiv:_extensions/ctm-libs/locales/py-exercise.js` |
| `66cd58c8ee1f` | `ctm-libs:_extensions/ctm-libs/locales/pyodide-interaktiv.js`; `pyodide-interaktiv:_extensions/ctm-libs/locales/pyodide-interaktiv.js` |
| `581035af6205` | `ctm-libs:_extensions/ctm-libs/locales/ui.js`; `pyodide-interaktiv:_extensions/ctm-libs/locales/ui.js` |
| `f0119ee05a00` | `ctm-libs:_extensions/ctm-libs/lua/assets.lua`; `pyodide-interaktiv:_extensions/ctm-libs/lua/assets.lua` |
| `71aff0180575` | `ctm-libs:_extensions/ctm-libs/lua/checkers.lua`; `pyodide-interaktiv:_extensions/ctm-libs/lua/checkers.lua` |
| `209db18b893d` | `ctm-libs:_extensions/ctm-libs/lua/ctm.lua`; `pyodide-interaktiv:_extensions/ctm-libs/lua/ctm.lua` |
| `711df6c9d05e` | `ctm-libs:_extensions/ctm-libs/lua/deps.lua`; `pyodide-interaktiv:_extensions/ctm-libs/lua/deps.lua` |
| `38e8785dc7ae` | `ctm-libs:_extensions/ctm-libs/lua/feedback.lua`; `pyodide-interaktiv:_extensions/ctm-libs/lua/feedback.lua` |
| `1198a4523b3f` | `ctm-libs:_extensions/ctm-libs/lua/layout.lua`; `pyodide-interaktiv:_extensions/ctm-libs/lua/layout.lua` |
| `6acd5bfafba2` | `ctm-libs:_extensions/ctm-libs/lua/locale.lua`; `pyodide-interaktiv:_extensions/ctm-libs/lua/locale.lua` |
| `11167d6e3a6b` | `ctm-libs:_extensions/ctm-libs/lua/matrix.lua`; `pyodide-interaktiv:_extensions/ctm-libs/lua/matrix.lua` |
| `af296307ce0e` | `ctm-libs:_extensions/ctm-libs/lua/policy.lua`; `pyodide-interaktiv:_extensions/ctm-libs/lua/policy.lua` |
| `95a3736002a4` | `ctm-libs:_extensions/ctm-libs/lua/progress.lua`; `pyodide-interaktiv:_extensions/ctm-libs/lua/progress.lua` |
| `1b44c8cbdea0` | `ctm-libs:_extensions/ctm-libs/lua/runtime.lua`; `pyodide-interaktiv:_extensions/ctm-libs/lua/runtime.lua` |
| `3b8deb60940d` | `ctm-libs:_extensions/ctm-libs/lua/sections.lua`; `pyodide-interaktiv:_extensions/ctm-libs/lua/sections.lua` |
| `505cf9712039` | `ctm-libs:_extensions/ctm-libs/lua/settings.lua`; `pyodide-interaktiv:_extensions/ctm-libs/lua/settings.lua` |
| `584fcd4c8d01` | `ctm-libs:_extensions/ctm-libs/lua/source.lua`; `pyodide-interaktiv:_extensions/ctm-libs/lua/source.lua` |
| `c8e2e6298560` | `ctm-libs:_extensions/ctm-libs/lua/store.lua`; `pyodide-interaktiv:_extensions/ctm-libs/lua/store.lua` |
| `6cabe2f79855` | `ctm-libs:_extensions/ctm-libs/lua/ui.lua`; `pyodide-interaktiv:_extensions/ctm-libs/lua/ui.lua` |
| `eb75bdac202e` | `ctm-libs:_extensions/ctm-libs/lua/variants.lua`; `pyodide-interaktiv:_extensions/ctm-libs/lua/variants.lua` |
| `68d1bbad5126` | `ctm-libs:_extensions/ctm-libs/read-settings.ts`; `pyodide-interaktiv:_extensions/ctm-libs/read-settings.ts` |
| `9c254f940769` | `ctm-libs:_extensions/ctm-libs/runtime/coi-frame-startup.js`; `pyodide-interaktiv:_extensions/ctm-libs/runtime/coi-frame-startup.js` |
| `081ecc70e581` | `ctm-libs:_extensions/ctm-libs/runtime/coi-serviceworker.js`; `pyodide-interaktiv:_extensions/ctm-libs/runtime/coi-serviceworker.js` |
| `67a0abdb5c83` | `ctm-libs:_extensions/ctm-libs/runtime/mathjax-opaque-adaptor.js`; `pyodide-interaktiv:_extensions/ctm-libs/runtime/mathjax-opaque-adaptor.js` |
| `0c392018f4fc` | `ctm-libs:_extensions/ctm-libs/runtime/pyodide-runtime.js`; `pyodide-interaktiv:_extensions/ctm-libs/runtime/pyodide-runtime.js` |
| `bc1cd11f4dd7` | `ctm-libs:_extensions/ctm-libs/ui/ctm-copy.js`; `pyodide-interaktiv:_extensions/ctm-libs/ui/ctm-copy.js` |
| `c0ac6db28612` | `ctm-libs:_extensions/ctm-libs/ui/ctm-export.js`; `pyodide-interaktiv:_extensions/ctm-libs/ui/ctm-export.js` |
| `25af51724621` | `ctm-libs:_extensions/ctm-libs/ui/ctm-layout.js`; `pyodide-interaktiv:_extensions/ctm-libs/ui/ctm-layout.js` |
| `321f1551c268` | `ctm-libs:_extensions/ctm-libs/ui/ctm-matrix-input.css`; `pyodide-interaktiv:_extensions/ctm-libs/ui/ctm-matrix-input.css` |
| `aa2d5daf5865` | `ctm-libs:_extensions/ctm-libs/ui/ctm-matrix-input.js`; `pyodide-interaktiv:_extensions/ctm-libs/ui/ctm-matrix-input.js` |
| `bacdf393784c` | `ctm-libs:_extensions/ctm-libs/ui/ctm-nav.js`; `pyodide-interaktiv:_extensions/ctm-libs/ui/ctm-nav.js` |
| `cd1915c50e0d` | `ctm-libs:_extensions/ctm-libs/ui/ctm-progress.js`; `pyodide-interaktiv:_extensions/ctm-libs/ui/ctm-progress.js` |
| `ed6906d0bc5c` | `ctm-libs:_extensions/ctm-libs/ui/ctm-reveal.js`; `pyodide-interaktiv:_extensions/ctm-libs/ui/ctm-reveal.js` |
| `91a99a0fcce4` | `ctm-libs:_extensions/ctm-libs/ui/ctm-settings.js`; `pyodide-interaktiv:_extensions/ctm-libs/ui/ctm-settings.js` |
| `093579995765` | `ctm-libs:_extensions/ctm-libs/ui/ctm-store.js`; `pyodide-interaktiv:_extensions/ctm-libs/ui/ctm-store.js` |
| `54a056d3fa55` | `ctm-libs:_extensions/ctm-libs/ui/ctm-ui.css`; `pyodide-interaktiv:_extensions/ctm-libs/ui/ctm-ui.css` |
| `d7fef66fc048` | `ctm-libs:_extensions/ctm-libs/ui/variants.js`; `pyodide-interaktiv:_extensions/ctm-libs/ui/variants.js` |
| `c37659469c88` | `ctm-libs:_filters/example-source.lua`; `py-exercise:_filters/example-source.lua`; `pyodide-interaktiv:_filters/example-source.lua` |
| `8bf7da5740a0` | `ctm-libs:bootstrap/ctm-bootstrap.lua`; `py-exercise:_extensions/py-exercise/ctm-bootstrap.lua`; `math-exercise:_extensions/math-exercise/ctm-bootstrap.lua`; `ctm-stack:_extensions/ctm-stack/ctm-bootstrap.lua`; `pyodide-interaktiv:_extensions/pyodide-interaktiv/ctm-bootstrap.lua` |

## Normalized near-duplicate pairs

| Locations | Similarity |
|---|---:|
| `ctm-libs:_extensions/ctm-libs/runtime/pyodide-worker.js` ↔ `pyodide-interaktiv:_extensions/ctm-libs/runtime/pyodide-worker.js` | 97.35% |
| `math-exercise:_extensions/math-exercise/variants-review.py` ↔ `ctm-stack:_extensions/ctm-stack/variants-review.py` | 96.99% |
| `ctm-libs:_extensions/ctm-libs/feedback/feedback-core.js` ↔ `pyodide-interaktiv:_extensions/ctm-libs/feedback/feedback-core.js` | 96.94% |
| `ctm-libs:_extensions/ctm-libs/runtime/pyodide-worker-core.js` ↔ `pyodide-interaktiv:_extensions/ctm-libs/runtime/pyodide-worker-core.js` | 96.54% |

## Manual parallel implementations and adapted copies

- freehand `_filters/example-source.lua:1`: explicitly adapted from math-exercise, without policy panels. Both escape source into a pre/code element. This is an attributed fork, not byte-identical.
- Native bootstrap verification in math/stack question-variants.py repeats manifest/file-set/hash checking. Native review servers show96.99% normalized file similarity; centralize shared review infrastructure in ctm-checkers native authoring.
- Monaco creation/load glue, KaTeX setup and assessment bridge clients remain in multiple integrations/shared library files. Their semantics differ; do not mechanically merge them without contract fixtures. See Part B's interface catalogue.
- ctm-libs worker source exists both inside a String.raw template and worker-core.js. This is generated duplication, checked by sync-worker-core.cjs --check, which passed.
- py-exercise's embedded Python MODULE_PY owns grading despite the stronger target architecture; the step-2 amendment explicitly retained this exception. Extraction requires behavior-preserving goldens.

## Reproduction

Run code/architecture/inventory.py with architecture-snapshots.json and an output folder; run code/architecture/contracts.py for lexical contracts. Both read exact Git objects and never edit sources. The JSON manifest records paths and full commits; adapt local paths when replaying. Near-file normalization strips leading comment lines and whitespace and compares files of the same suffix across repositories at >=82% similarity. It intentionally does not label legal notices or generated distributions as defects merely because they repeat.
