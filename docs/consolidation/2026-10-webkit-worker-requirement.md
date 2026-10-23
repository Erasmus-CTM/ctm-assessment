# WebKit worker transport and activation requirement

23 October 2026. A tested transport candidate preserves accessibility. Default product activation and full offline/course acceptance remain gated.

## Verified transport

Assessment [#48](https://github.com/Erasmus-CTM/ctm-assessment/pull/48) is at `7bb1e892cc4ff2330b3fb9d390908424f7f27f9f`. [Run 39908348722](https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/39908348722) passed ten cases in each of Chromium, Firefox and WebKit; independent exact-head source/runtime review is [5624522357](https://github.com/Erasmus-CTM/ctm-assessment/pull/48#pullrequestreview-5624522357).

The original WebKit opaque data and HTTP frame controls still block MathJax 4.1.3's `blob:null` speech worker and stall SVG conversion. A MathJax startup adaptor replaces worker creation only in opaque origins with a `data:` classic-worker bootstrap. It loads the same SRE worker and maps, preserving speech/braille. Ordinary origins keep native blob transport.

All six candidate cases in each browser have zero uncaught errors, console errors and failed requests, with real parent isolation retained. Actual SVG has eight glyphs. Default speech is “x squared plus 1” and braille is “⠭⠘⠆⠐⠬⠂”, matching native same-origin output. Speech-only, braille-only and neither settings are honored; an explicit data-only worker CSP case also passes. The iframe remains opaque. Disabling accessibility flags is unnecessary for this candidate.

## Canonical activation requirement for AC

AC/Claude retain ownership of [jsxgraph/jsxgraph-quarto #2](https://github.com/jsxgraph/jsxgraph-quarto/pull/2), still open at `21c5f9cabcd434f2f79f93e08adaf41aafb727a8`. Do not edit the fork or re-pin before AC confirms merge.

The diagnostic `src_mjx` loader wrapper proves transport but must not become the automatic default. Its outer script load event precedes the nested MathJax vendor load; authored listeners would observe a changed lifecycle. Its hardcoded CDN URL is diagnostic only. Relative local assets also still need the separately owned upstream base/link support; do not use a referrer workaround.

The minimal upstream capability is now concrete: run a reviewed canonical CTM configuration component **before the unchanged original asynchronous MathJax vendor loader**. The component registers/selects the opaque-worker adaptor using MathJax startup APIs, then leaves loading and native script events to the original loader. It must preserve defaults and explicitly authored custom startup/adaptor behavior when absent or unsupported. No generated-frame patch, sandbox relaxation, Worker-global replacement, or accessibility-disable policy is needed.

A standalone configuration component is being prepared in ctm-libs; activation requires the above seam and separate integration review. The existing default source/pins remain unchanged until that is ready.

## Remaining failure behavior and acceptance

MathJax 4.1.3's [HTMLAdaptor.createWorker](https://github.com/mathjax/MathJax-src/blob/4.1.3/ts/adaptors/HTMLAdaptor.ts) always creates its native worker from a Blob. Path/file/map options alone cannot replace transport. [Speech startup](https://github.com/mathjax/MathJax-src/blob/4.1.3/ts/a11y/speech.ts) starts it without awaiting failure, while [WorkerHandler](https://github.com/mathjax/MathJax-src/blob/4.1.3/ts/a11y/speech/WebWorker.ts) queues until readiness without rejecting queued requests on worker startup error. These generic failure-propagation issues remain separate; the candidate does not claim to fix all worker or CSP failures.

After canonical activation, run original strict store/course gates in all three browsers, including actual speech/braille, SVG conversion, authored startup/load behavior, raw errors, desktop/390px navigation, opaque sandbox and real isolation. Complete offline acceptance remains separate. No external maintainer messages or merge actions have been sent.
