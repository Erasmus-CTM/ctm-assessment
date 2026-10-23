# WebKit worker blocker: requirement for AC

23 October 2026. Investigation only; no product setting, sandbox, dependency pin or accessibility feature is changed.

## Verified boundary

Assessment [#48](https://github.com/Erasmus-CTM/ctm-assessment/pull/48) remains at `e88617031296b139a97c637c434c7cd9416a6062`. Its actual WebKit controls establish that MathJax 4.1.3 speech/braille startup creates an opaque-origin blob worker that COEP blocks, and actual SVG conversion stalls. Disabling both document and menu speech/braille settings restores conversion, but is diagnostic evidence with an accessibility loss.

The source investigation explains why a URL-only change is insufficient:

- [HTMLAdaptor.createWorker](https://github.com/mathjax/MathJax-src/blob/4.1.3/ts/adaptors/HTMLAdaptor.ts) creates a Blob and then a Worker from its URL. Worker path/file/map options do not replace this transport.
- [Speech document startup](https://github.com/mathjax/MathJax-src/blob/4.1.3/ts/a11y/speech.ts) starts the worker without awaiting its startup promise.
- [WorkerHandler](https://github.com/mathjax/MathJax-src/blob/4.1.3/ts/a11y/speech/WebWorker.ts) queues work until readiness, without propagating a worker startup error into queued requests. Configuring a speech-error callback alone cannot resolve a queue that never rejects.

These are source-level findings explaining the already published runtime evidence, not new browser acceptance.

## Required upstream capability

AC/Claude retain ownership of [jsxgraph/jsxgraph-quarto #2](https://github.com/jsxgraph/jsxgraph-quarto/pull/2), still open at `21c5f9cabcd434f2f79f93e08adaf41aafb727a8`. Do not edit the fork or re-pin before AC confirms merge.

A suitable MathJax solution must preserve speech/braille functionality inside the opaque sandbox and strict isolation. It needs a supported alternate worker transport or a main-thread SRE fallback, with startup failure propagated to queued conversion requests so rendering cannot hang permanently. A verified WebKit correction could also satisfy this boundary.

For JSXGraph, a generic configuration/bootstrap point must run before its asynchronous MathJax loader and preserve existing defaults when absent. It must support loading a reviewed MathJax extension component and registering/selecting its adaptor or startup behavior. JSON options can name a separately loaded component, but cannot themselves supply callable startup/fallback code. MathJax documents the [startup adaptor and ready extension points](https://docs.mathjax.org/en/latest/options/startup/startup.html).

This is a requirement for AC to assess with upstream maintainers, not a proposed implementation or authorization to send messages. After any reviewed fix, actual SVG conversion, speech/braille behavior, raw errors, opaque sandboxing and real parent isolation must be tested in all three browsers before combined course/store acceptance.
