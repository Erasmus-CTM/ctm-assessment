# Offline browser checks

The canonical helpers are tools/offline-check.mjs and tools/board-check.mjs.
They use full Chromium, DNS refusal and an audited context route. Every
non-server HTTP request, failed request, HTTP error and browser exception fails.
Service workers are blocked; WebSocket attempts are refused and recorded.
Each page gets at least five loads, each in a fresh context.

The same audit function is inserted before author scripts in served HTML and
embedded srcdoc/data HTML. Source-location edits preserve other author bytes,
DOCTYPE and sandbox attributes. This closes the measured Playwright 1.55 timing
gap where opaque initial scripts preceded addInitScript. Early opaque records
use an acknowledged parent-message bridge until the Playwright binding exists;
all records are drained before closing a context. Native fetch/XHR arguments
and return values are preserved. Buffered native resource timing additionally
records browser-initiated loads, with a failed-image negative proving URL capture.

Dynamically assigned opaque HTML that has no early audit prefix is explicitly
refused. Mutation records retain added/removed iframe and src/srcdoc declarations;
frame navigation or removal before verification also fails. These refusals are
reported separately from observed request URLs. This checker cannot accept a
course that uses unaudited dynamic opaque documents until that case is supported.

The board checker opens nested tabs, details, class-targeted Quarto callouts
and collapsed math exercises through their actual controls. It scrolls each
board into view, waits 1.2 seconds, and compares the SVG viewport to the
board box within 2 px. Drawn content is an additional requirement. All board
frames and inline boards are checked; no sampling or old-build allowances.

Existing compare-browser.mjs embedded checks sample four details frames and
check finite geometry only. Those migration checks remain in place. New Step 5
consumers import the stricter helpers; they must not copy either implementation.

## Run against a rendered site

Serve the site with scripts/serve-offline.py from server PR27. A manifest has a
pages array; each entry contains path and optionally boards (an expected count).
Then run:

~~~sh
node tools/offline-check.mjs --base http://127.0.0.1:8000/ --manifest pages.json --out offline.json
~~~

checkOfflinePages also accepts probes, an array of async functions called with
(page, manifestEntry). Product integration tests use them to run Python, check
math/py-exercises, inspect MathJax/Monaco and verify copy/export. Probe failures
must throw. The generic CLI establishes network, isolation and board checks
only; it does not claim full course acceptance without these integration probes.

## Evidence scopes

The workflow has read-only repository permissions. It obtains the exact
JSXGraph 1.14.1 npm test runtime from the registry, verifies its SHA-512 against
official dist.integrity, and serves it locally. No browser request uses a CDN.
This fixture version is not a product repin or a replacement asset lock.
The canonical server is checked out at PR27's explicit head.

Synthetic fixtures test every reveal pattern together, a board smaller than
its frame, inline boards, zero/wrong-sized SVGs, missing boards and empty ink.
Network negative fixtures exercise document, worker and opaque-frame fetches.

The separate real-JSXGraph mechanism harness loads a plain display-none opaque
iframe 20 times without refresh. At least one blank must be detected, or the
test fails with "mechanism not reproduced"; a green course run cannot substitute
for it. A real always-zero board must fail on all five loads. A small test-only
resize/fullUpdate model must pass on all five loads. Both plain and model
fixtures disable native resizing, matching the pinned fork's contract; the model
waits for positive measured layout and repeats refresh across animation frames. The model is not the fork
extension and is not proof of fork PR2. The report labels this scope explicitly.

Course pages are regression evidence only. No upstream PR2 merge, fork change,
upstream repin, full asset bundle, lockdown-browser dry run or course offline
acceptance is implied by this workflow. AC owns the upstream PR2 merge; its
extension-specific mechanism CI must independently verify the real fix.
