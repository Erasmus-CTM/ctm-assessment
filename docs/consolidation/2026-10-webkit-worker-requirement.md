# WebKit worker transport and activation requirement

23 October 2026. The canonical transport component is implemented and tested. Default activation and combined course/offline acceptance remain gated.

## Verified canonical component

- [ctm-libs #37](https://github.com/Erasmus-CTM/ctm-libs/pull/37), head `62235ae386da9ce591d956caae3b54aa7da9785d`, owns `runtime/mathjax-opaque-adaptor.js`. Its SHA256 is `81642e45028f35eab27b7be2cbce427efb9395799b9e335e834c667315fd5b61`. Five focused configuration tests and all 304 native/render tests pass with zero skips; production MathJax render, standalone and browser runtime workflows pass. Independent [source review](https://github.com/Erasmus-CTM/ctm-libs/pull/37#pullrequestreview-5624544627) and [final runtime review](https://github.com/Erasmus-CTM/ctm-libs/pull/37#pullrequestreview-5624616544) passed.
- Assessment [#48](https://github.com/Erasmus-CTM/ctm-assessment/pull/48), head `5ce8bd9b1fe00e3a50135f34a5a360a13f43228b`, consumes that exact pinned component. [Run 39909375175](https://github.com/Erasmus-CTM/ctm-assessment/actions/runs/39909375175) passes eleven cases in each of Chromium, Firefox and WebKit. Independent [final runtime review](https://github.com/Erasmus-CTM/ctm-assessment/pull/48#pullrequestreview-5624616951) passed.

The original WebKit opaque data and HTTP controls still block MathJax 4.1.3's `blob:null` speech worker and stall actual SVG conversion. The canonical pre-loader selects a MathJax DOM adaptor that creates the same SRE worker and maps from a `data:` URL in opaque origins. Ordinary origins keep native blob transport. Authored startup ready callbacks, explicitly selected adaptors and replacement browser factories retain their own behavior.

All seven canonical pre-loader cases in each browser have zero uncaught errors, raw console errors and failed requests, retaining a genuinely isolated parent. Actual SVG has eight glyphs. Enabled speech is “x squared plus 1” and braille is “⠭⠘⠆⠐⠬⠂”, matching native output. Speech-only, braille-only and neither settings are honored; an explicit `worker-src data:` case passes. Opaque data and HTTP frames retain their opaque origin. Supplemental Windows Chromium and WebKit 27.2 runs also pass the eleven-case harness.

## Approved upstream pin and separate activation

AC/Claude retain ownership of [jsxgraph/jsxgraph-quarto #2](https://github.com/jsxgraph/jsxgraph-quarto/pull/2), open at exact reviewed head `e4ad81d82e1b56f86765026a3dd26f6975d29d57` (extension 1.2.0). On 23 October AC explicitly authorized pinning this exact PR head before merge. This supersedes the earlier wait-for-upstream-merge restriction. Keep repository `jsxgraph/jsxgraph-quarto`, branch `main`, and an explicit `pin-outside-branch` note. Do not edit the fork or follow its moving audit/CI branches.

The former `17de83e` iframe template had no head/pre-loader slot: lines 799–805 contain the MathJax async script, JSXGraph script, CSS and fixed style; authored body scripts occur later at 808–812. Generic copied options are never interpolated into a head slot. Body code or `src_jxg` cannot reliably configure MathJax before its async script executes.

Reviewed head `e4ad81d` adds optional `src_mjx_preload`, a synchronous configuration-script slot immediately before the **unchanged original** MathJax script. The hook stays unset in this pin-only change. Its output order is:

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

The hook is now present, but the canonical component remains unregistered by default until separate integration review and activation gates pass. Resolve the pre-loader through extension document/project path or explicit URL handling; never derive local URLs from referrers. No generated-frame patch, sandbox relaxation, Worker-global replacement, accessibility-disable policy, fork edit or external maintainer message is needed or adopted.

## Pin provenance, scope and follow-up

The actual umbrella builder at `68fe838ca76ce7dfc4297f8ed4db1ccf1dc29a8b` was used for the fetch check. Its unchanged `snapshot()` source blob is `52d1bbffd5b70d366df811191b4ac966ae448261`. Upstream `git ls-remote refs/pull/2/head` returned exactly `e4ad81d82e1b56f86765026a3dd26f6975d29d57`; the builder downloaded the upstream codeload archive by that SHA and recorded the same repository/commit. The extension manifest reports 1.2.0 (SHA256 `c4c55756fdaee8174731c766dc9202e84abd0aec2b5989183506ccb23cd04318`). No fork substitution was needed.

Only the umbrella's `integration/feedback/repos.json` JSXGraph entry changes. Other selected component pins remain byte-identical. `_extensions/ctm-assessment/jsxgraph-pins.yml` already supplies JSXGraph core/CSS 1.14.1 and MathJax/newcm 4.1.3; those versions stay unchanged. Use `--update-pins --only <names>` for later selective component updates. The existing `--follow-branches` ancestry check must retain this PR head until upstream main contains it.

Inventory checked immutable current main snapshots on 23 October:

| Owner/source | Extension reference | Action in this PR |
| --- | --- | --- |
| Umbrella `repos.json`, base `68fe838c` | Upstream repository, old `17de83e` | Pin exact `e4ad81d`; retain branch main and outside-branch note. |
| `aacchhee/ctm-demo` at `d65eea624e96bbfc7b65ebb78b7d3a43ebdb3458`, `quarto-extensions.yml` | CTM Assessment main; no separate live JSXGraph pin | No course edit. Historical repro script deliberately compares `a26aea8`, `59d549c` and fork `17de83e`; leave those controls intact. |
| `aacchhee/ingmat3a_ntnu` at `e45851080f462e84cde281528f21d4f21292a6ba`, `quarto-extensions.yml` | CTM Assessment main; no direct JSXGraph pin | No course edit. Any course-main update requires its own PR, zero warnings and AC's merge. |
| `Erasmus-CTM/math-exercise` at `5d62ced91e855199112d5f8f48609f3db588119c` | CI action/parity defaults `v1.1.0`; explicit review refs override | Inventory only; no component pin edit. |
| `Erasmus-CTM/stack-wasm-maxima` at `eb8f16767e548c2596ba44e61e3183967bc8dadb` | `ba2daa52fa6b1c65b37322bca3f02643e31a688e` in site workflow, native compiler and license provenance | Inventory only; separate owner/workstream. |
| Umbrella offline-check fixtures | Commented/frozen `17de83e` loader controls | Historical fixture evidence; do not relabel it as the new output. |

The jump includes the reviewed board resize/hidden/whole-view keep-aspect fixes and the optional pre-loader hook. Fresh rendered-course comparisons and three-browser board checks must cover ctm-demo, ingmat3a main and the example site. Explain each difference using the reviewed extension changes or flag it as a finding; raw-error acceptance remains separate from comparison equivalence.

Pre-loader activation belongs in a separate PR after independent integration review. It must use the hash-pinned original #37 component through the hook, preserve the original MathJax script id/URL/async/native-load lifecycle and authored startup callbacks, and pass actual SVG, exact speech/braille, zero raw errors/failed requests, desktop/390px, opaque sandbox and real isolation. Offline acceptance remains separate. Keep branches current with reviewed bases and run one combined stacked-set CI before AC's merge commits. Commits use Andrey Chesnokov's supplied connector identity; no tags.

When upstream merges, compare the merged tree with reviewed `e4ad81d`, pin the actual upstream merge SHA, remove the outside-branch note only once ancestry is established, and rerun the required gates. Do not silently replace this pin with a moving branch tip.

## Remaining failure behavior and acceptance

MathJax 4.1.3's [HTMLAdaptor.createWorker](https://github.com/mathjax/MathJax-src/blob/4.1.3/ts/adaptors/HTMLAdaptor.ts) always creates its native worker from a Blob. Path/file/map options alone cannot replace transport. [Speech startup](https://github.com/mathjax/MathJax-src/blob/4.1.3/ts/a11y/speech.ts) starts it without awaiting failure, while [WorkerHandler](https://github.com/mathjax/MathJax-src/blob/4.1.3/ts/a11y/speech/WebWorker.ts) queues until readiness without rejecting queued requests on startup error. These generic failure-propagation issues remain separate; the component does not claim to fix every worker or CSP failure.

After reviewed activation, run fresh strict store/course gates in all three browsers: actual speech/braille and SVG, authored startup/load behavior, raw errors, desktop/390px navigation, opaque sandbox and real isolation. Complete offline acceptance remains separate. AC alone merges.
