# Dedicated demo component activation

This dedicated integration change selects the reviewed shared library and thin
Python consumers, and enables the existing optional JSXGraph preloader hook.
It is separate from the upstream JSXGraph pin-only change.

| Component | Exact commit |
| --- | --- |
| ctm-libs | `3277d66b7c1c108f6b073a75b38d669d17b73283` |
| py-exercise | `fda82aa916b2abb564b909ec3021b6cad59fd49f` |
| pyodide-interaktiv | `035e7307f53207d8f4b90c6692ec926ee802ab38` |

The unmodified canonical updater ran with
`python scripts/setup-feedback-integration.py --update-pins --only ctm-libs,py-exercise,pyodide-interaktiv`.
In the isolated checkout, only those three branch specifications were temporarily
set to their reviewed branches. Their resolved heads were asserted, then the
original branch metadata was restored. `integration/activation/proof/selective-pins.json`
records the selections and hashes. Math-exercise, ctm-checkers, Quarto 1.8.27 and
all other pins remain unchanged, including upstream JSXGraph
`e4ad81d82e1b56f86765026a3dd26f6975d29d57`, its `main` branch and outside-branch note.

The only activation setting is one `pins.src_mjx_preload` assignment in the
existing `ctm-assessment.lua` metadata default map, pointing to
`_extensions/ctm-libs/runtime/mathjax-opaque-adaptor.js`. The existing fill-absent
loop preserves authored keys. Explicit empty string is the supported rendered
opt-out, and custom paths remain authored choices. Boolean false is verified
only as preserved umbrella metadata; the downstream JSXGraph filter may
stringify it as a path, so this proof does not establish false as a supported
rendered opt-out. `jsxgraph-pins.yml` remains byte-identical to the base because
the canonical asset lock fingerprints that whole file; no lock regeneration or
validation exception is introduced. The original #37 component is Git blob
`ca393e84da41a9fcd38f258e87b6dd29f452c942`, SHA256
`81642e45028f35eab27b7be2cbce427efb9395799b9e335e834c667315fd5b61`.
No vendor implementation, URL attributes, runtime model or generated source is
patched. The separate optional CORS component is not selected.

Focused evidence is retained under `integration/activation/proof`. The actual
production Lua filter passed four Pandoc metadata cases on pinned Quarto 1.8.27: absent, blank, false and
custom. Seventeen existing source-selection contracts passed. The wider unchanged
SharedFiles fixture run reported Windows newline-related failures: its text
writer produces CRLF while its expected digest uses LF. A base-revision rerun
was not performed, so these observations are not claimed as independently
reproduced pre-existing failures. No separate complete failure log was saved;
the retained observation note identifies this evidence limit. No assertion was
repaired, waived or treated as passing here.

The reviewed hook fixture, its original JSON and an LF-normalized one-line log
record 12 passing Windows
cases: Chromium, Firefox and WebKit at 1280 and 390 pixels. Six accessible cases
exercise actual SVG, speech and braille. Six authored-startup ownership controls
deliberately disable speech/braille and establish callback ownership only. The
fixture uses Quarto 1.9.35 and exact upstream hook/source hashes; it does not
establish pinned Quarto 1.8.27 demo acceptance, ordinary authored startup
accessibility, Pages/offline delivery, or an entire course's lifecycle. The
fixture source is SHA256
`c20f457d47208d8fc2ee2902c85893a1147810eb970f74d11f18fa7bcc4089b6`;
its JSON is SHA256
`844c98e0a0ba3714c398eb22d78e2016d16a7be8a58dfb99853cc67c6411cecd`.

Reproduce the metadata contract with
`python integration/activation/check-metadata-defaults.py` and `QUARTO` set to
the executable if it is not on PATH. The retained hook harness accepts
`--jsxgraph-source`, `--adaptor`, `--mathjax` and `--output`; it requires the exact
upstream source, MathJax 4.1.3 with its matching installed dependencies, and
Playwright. It has no automatic workflow trigger.

**HOLD:** pinned Quarto 1.8.27 acceptance of the complete coherent demo candidate
is pending. ctm-demo is the integration testbox. Small focused checks precede
the already authorized single full acceptance pass. The live ingmat3a course
stays stable; isolated preparation/testing branches are permitted. After demo
acceptance and all required component merges, ask AC before starting its
migration. AC alone merges. This change does not deploy either course.
