# WebKit worker transport and activation requirement

23 October 2026. The canonical transport component is implemented and tested. Default activation and combined course/offline acceptance remain gated.

## Verified canonical component

- [ctm-libs #37](https://github.com/Erasmus-CTM/ctm-libs/pull/37), head `62235ae386da9ce591d956caae3b54aa7da9785d`, owns `runtime/mathjax-opaque-adaptor.js`. Its SHA256 is `81642e45028f35eab27b7be2cbce427efb9395799b9e335e834c667315fd5b61`. Five focused configuration tests and all 304 native/render tests pass with zero skips; production MathJax render, standalone and browser runtime workflows pass. Independent [source review](https://github.com/Erasmus-CTM/ctm-libs/pull/37#pullrequestreview-5624544627) and [final runtime review](https://github.com/Erasmus-CTM/ctm-libs/pull/37#pullrequestreview-5624616544) passed.
- Assessment [#48](https://github.com/Erasmus-CTM/ctm-assessment/pull/48), head `5ce8bd9b1fe00e3a50135f34a5a360a13f43228b`, consumes that exact pinned component. [Run 39909375175](https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/39909375175) passes eleven cases in each of Chromium, Firefox and WebKit. Independent [final runtime review](https://github.com/Erasmus-CTM/ctm-assessment/pull/48#pullrequestreview-5624616951) passed.

The original WebKit opaque data and HTTP controls still block MathJax 4.1.3's `blob:null` speech worker and stall actual SVG conversion. The canonical pre-loader selects a MathJax DOM adaptor that creates the same SRE worker and maps from a `data:` URL in opaque origins. Ordinary origins keep native blob transport. Authored startup ready callbacks, explicitly selected adaptors and replacement browser factories retain their own behavior.

All seven canonical pre-loader cases in each browser have zero uncaught errors, raw console errors and failed requests, retaining a genuinely isolated parent. Actual SVG has eight glyphs. Enabled speech is “x squared plus 1” and braille is “⠭⠘⠆⠐⠬⠂”, matching native output. Speech-only, braille-only and neither settings are honored; an explicit `worker-src data:` case passes. Opaque data and HTTP frames retain their opaque origin. Supplemental Windows Chromium and WebKit 27.2 runs also pass the eleven-case harness.

## Minimal upstream hook for AC

AC/Claude retain ownership of [jsxgraph/jsxgraph-quarto #2](https://github.com/jsxgraph/jsxgraph-quarto/pull/2), still open at `21c5f9cabcd434f2f79f93e08adaf41aafb727a8`. Do not edit the fork or re-pin before AC confirms merge.

The exact pinned `17de83e` iframe template has no head/pre-loader slot: lines 799–805 contain the MathJax async script, JSXGraph script, CSS and fixed style; authored body scripts occur later at 808–812. Generic copied options are never interpolated into a head slot. Body code or `src_jxg` cannot reliably configure MathJax before its async script executes.

Add an optional, synchronous configuration-script slot immediately before the **unchanged original** MathJax script. Illustrative output order, without prescribing an option name:

```html
<script src="${preloaderURL}"></script>
<script id="MathJax-script" async src="${src_mjx}"></script>
```

The pre-loader has no async/defer attribute. Its URL may embed the canonical component bytes for self-contained output or use a resolved linked asset URL. Omit the entire first element when unconfigured; preserve the original MathJax URL, id, async behavior and native events. Resolve/escape URLs through the extension's normal asset handling. The component contains no vendor URL or second version table.

The existing diagnostic observes the original loader's native load event and asserts:

```js
assert.deepEqual(frame.nativeLoader, {
  src: vendorLoader, version: '4.1.3', readyMethod: 'function'
});
```

Its seven canonical cases pass this assertion alongside real SVG, accessibility and isolation checks. The older `src_mjx` loader-wrapper experiment must not become the default: its outer load event precedes the nested vendor load. The current report's stale `sourceVariant` label still says “candidate src_mjx bootstrap”; the pinned source and `nativeLoader` snapshots establish the actual pre-loader mechanism.

The component remains unregistered by default until this hook and separate integration review exist. Local boards still need the separately owned upstream base/link support; do not derive local URLs from referrers. No generated-frame patch, sandbox relaxation, Worker-global replacement, accessibility-disable policy, fork edit or external maintainer message is needed or adopted.

## Remaining failure behavior and acceptance

MathJax 4.1.3's [HTMLAdaptor.createWorker](https://github.com/mathjax/MathJax-src/blob/4.1.3/ts/adaptors/HTMLAdaptor.ts) always creates its native worker from a Blob. Path/file/map options alone cannot replace transport. [Speech startup](https://github.com/mathjax/MathJax-src/blob/4.1.3/ts/a11y/speech.ts) starts it without awaiting failure, while [WorkerHandler](https://github.com/mathjax/MathJax-src/blob/4.1.3/ts/a11y/speech/WebWorker.ts) queues until readiness without rejecting queued requests on startup error. These generic failure-propagation issues remain separate; the component does not claim to fix every worker or CSP failure.

After reviewed activation, run fresh strict store/course gates in all three browsers: actual speech/braille and SVG, authored startup/load behavior, raw errors, desktop/390px navigation, opaque sandbox and real isolation. Complete offline acceptance remains separate. AC alone merges.
