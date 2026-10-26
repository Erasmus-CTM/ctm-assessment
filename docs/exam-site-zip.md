# Offline Python website ZIP

This website contains two Python IDE pages using the existing
pyodide-interaktiv windows and the shared page worker. P13 adapts those
windows; editing, saved answers, copy and export remain available. It carries
the complete verified asset bundle. Course graders and boards are not on these
IDE pages. STACK/Maxima bundling is P13 phase 2.

This IDE opts out of the frontend's default background package preloads;
explicit Python imports still request their required local packages. The
reviewed frontend commit is explicit in the workflow. Timing and request
measurements establish the observed effect; no speed threshold is assumed.

The workflow reproduces the reviewed vendor selections with the canonical
composer, then binds the worker, plugin and service worker to exact component
pins. The complete 2,800-file lock has SHA256
`a1d87361f422230fb3555c64d779495e4daf093c410d07cdc91f5e6d40e3e68f`.
The small receipt is `integration/p13-complete-assets.json`; raw locks and logs
remain CI artifacts. The frozen older inspector and its receipts are retained.
Deployment verification checks the actual scripts Quarto emits, including any
served gzip representation, against the locked source bytes. Repository and
upstream licence texts and source references are included.

The canonical carried installer and profile writer render `offline,exam`.
AI feedback is off; answer saving and export remain on. Exam output is text
and PNG only: returned HTML stays literal, and executable animations and canvas
upgrades are disabled. Private build metadata is excluded.

The ZIP holds the contents of `_site-exam`, with `index.html` at its root.
CI extracts that exact ZIP and tests both pages at the web root and below
`/dept/python/`. Real editor changes and Run execute basic Python; the nested page separately
checks an optional local NumPy import while external requests are refused.
Editor-ready and Run-enabled times are observation upper bounds, not exact
readiness events. First-run and warm-run durations are measured separately,
without speed thresholds. The plain-LAN contexts record actual Pyodide requests
from before navigation; strict-probe request lists cover only the probe interval. The existing strict
checker runs five fresh loads per page with isolation headers. A separate
ordinary static server tests plain LAN HTTP without custom headers.
The website artifact is uploaded only after acceptance. Its single ZIP is
uploaded as-is (archive:false), so downloading it does not add an outer ZIP.

Plain LAN HTTP supports Run and terminate/restart Stop; a restart resets Python
variables but preserves editor text and saved answers. A secure page with
COOP `same-origin` and COEP `require-corp` supports cooperative interruption and
interactive input when its browser provides the required APIs. Stop falls back
to a restart if an interrupt does not unwind within two seconds. stop-after
(default 20 seconds) displays a slow-operation notice; it does not kill code.
The IDE's Stop button remains available immediately.

CI also runs fixed Chromium release branches 139.0.7258.138 and
147.0.7727.117, corresponding to SEB Windows CEF branches 139 and 147. CfT does
not provide the exact CEF patches 139.0.7258.139 and 147.0.7727.118; these are
one-patch-earlier engine proxies. WebKit uses Playwright 1.55.1 on macOS 15.
Engine tests are not real-SEB certification. Windows, macOS and iOS manual
checks remain required; see the [P13 design and checklist](consolidation/2026-10-step5-p13.md).
AC's established hand-in is text copied between windows on the existing exam
web server. Pictures and input have not been exam requirements. The real
server headers and SEB clipboard/download policy must be checked there.

P16 measurements use `loading-timing.cjs` with measurement-only existing,
Check, idle and interaction startup modes. AC chose to keep current interpreter
startup and `preload-packages: false` for exams; a default change waits for
network-profile evidence. The curated local results are in
`integration/p13-loading-summary.json`; raw traces remain outside Git.

This paragraph is included in the ZIP as `README-IT.txt`:

<!-- IT -->
Extract every file in this ZIP into the webserver directory where the Python site should appear. Keep index.html, site_libs, _ctm-assets and the other supplied files together; do not rename or flatten their folders. Open the site's web address using the approved SEB configuration on Windows, macOS or iOS after its manual acceptance check. Chrome/Edge can also open the site. No Python, Quarto, Node or package installation is needed on the webserver. Plain HTTP supports Run and Stop; Stop restarts Python and resets its variables. Interactive input and cooperative interruption require a secure page with isolation headers and browser support. Copy and paste text into the exam answer window as usual; its SEB policy must permit this. Your code and saved answers stay in that browser. External internet access is not required.
<!-- /IT -->
