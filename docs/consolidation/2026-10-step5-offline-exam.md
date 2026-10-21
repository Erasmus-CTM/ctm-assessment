# Self-hosted assets and the exam build (step 5, with a step-4 follow-up)

19 Oct 2026. Design for AC. Nothing is committed: the prototypes are in
`scratchpad/offline/`. The decision sheet is in §12.

**Revised after the independent review** (`scratchpad/review-offline/REVIEW.md`). §13 lists each finding and what changed. §4, §7–§12 are updated in place. Where an earlier statement was wrong, §13 says so.

**Need.**
1. **Exams.** The site runs on an exam server on a local network with no internet access. Size does not matter.
2. **Courses behind firewalls.** University firewalls have had to open specific CDNs for Pyodide. If the site carries all its own files, that is no longer needed, online or not.
3. **AC, added later.** Autosave stays on in the exam build. Students must be able to copy code, outputs and maths answers out easily, and export them, without internet access.

**Placement.**
- **Self-hosted assets** belong in **step 5**. They come after step 3, which moves the worker and the Pyodide version into ctm-libs.
- **Copy buttons and "export my answers"** become **step-4 follow-up B7**, built on the B1 store.
- The December exam is a nice-to-have target, not a constraint.

---

## 1. What loads from outside today (fresh ingmat3a build)

| Asset | Who loads it | Where from |
|---|---|---|
| Pyodide 0.28.3 + packages (sympy, numpy, scipy, matplotlib, micropip, pyodide_http, …) | ctm-libs `runtime/pyodide-runtime.js:12` (the one constant); pyodide-interaktiv's worker (`indexURL`) | cdn.jsdelivr.net/pyodide |
| Monaco 0.46 (loader, editor, CSS, editor worker) | `qpyodide-monaco-editor-init.html`, `qpyodide.lua:679`, `py-exercise.js:31` | jsDelivr npm |
| Font Awesome 6.5.1 `all.min.js` | `qpyodide.lua:680` | cdnjs |
| KaTeX 0.16 (`+esm` builds) | `math-exercise.js:58`, ctm-libs `feedback-dom.js:194` | jsDelivr |
| MathJax 3 + the `polyfill.min.js` script | Quarto's template (`template.html:19`, unconditional with MathJax) | jsDelivr, cdnjs |
| JSXGraph `@1` and MathJax `@4` inside each board's `data:` iframe | `jsxgraph.lua:791-793` | jsDelivr |
| Source Sans Pro, from `@import` in the Bootstrap CSS | Quarto's `cosmo` theme (`$web-font-path`) | fonts.googleapis.com |
| AI feedback | ctm-libs | the model endpoint |

The Google Fonts import was not on the list given to me; the prototype found it. It is a render-blocking CSS `@import`. On a network that silently drops packets, every page waits for it to time out.

**Content that needs no change:**
- Quarto's own `site_libs`: Bootstrap icons, clipboard.js and search are local already.
- Algolia's script inside `autocomplete.umd.js` is dead code without Algolia search.
- External `<a href>` links in the pages are not loads. The CI test (§10) lists them so that authors can remove them from exam pages.

## 2. Measured (prototypes, Chromium 1194, every request outside the local server blocked)

**Setup.**
- A copy of the ingmat3a `_site` was rewritten to point every asset at a local `ctm-assets/` folder. `tools/make_proto.py` does what the switch will do at render time.
- It was served by `tools/serve.py` and checked with `tools/offline-check.cjs`, `probe-*.cjs`.
- Pages: `uke3` has 17 math exercises, pyodide cells, py-exercise and 6 JSXGraph boards; `page5` has 13 math exercises.

| Check | Today's build | Self-hosted prototype |
|---|---|---|
| Python | fails: `Failed to fetch … pyodide.mjs` | worker loads numpy, scipy, sympy and matplotlib from the local folder; `det=8`, `(x-1)*(x+1)`, scipy 1.14.1 |
| pyodide-interaktiv cell (Run) | — | runs, with output ("Loaded libopenblas, scipy" + stdout) |
| math-exercise Check | — | verdict "✗ Ikke riktig – prøv igjen." (page5, 23 s from cold) |
| MathJax 3 (Quarto) | 0 formulas | 456 formulas (uke3), 38 (page5) |
| Font Awesome | 0 icons | 217 icons |
| Monaco | `require is not defined` | 36 editors; the editor worker is loaded from the server |
| KaTeX | `+esm` import fails | `dist/katex.mjs` and `contrib/auto-render.mjs` loaded locally |
| JSXGraph boards | 6 empty (`JXG is not defined`) | **6/6** drawn: JSXGraph 1.14.0, MathJax 4 loaded, 180–828 SVG elements per board. Too weak a check: see §13 for the hidden-board proof |
| Cross-origin isolation (needed for `input()` and Stop) | — | localhost + coi-serviceworker: yes. Server headers (COOP same-origin, COEP **require-corp**, CORP cross-origin), no service worker: yes. Plain http on a LAN IP: **no**, but everything else above works. Plain http + Chrome's insecure-origin exception (an enterprise policy): yes |
| Requests still going outside | — | only `fonts.googleapis.com`. A one-line SCSS layer removes it (verified in a Quarto render) |
| MathJax-4 speech worker in boards | — | `mathmaps/base.json` fails (CORS from the frame's null origin) and throws "Cannot convert undefined or null to object". **`Access-Control-Allow-Origin: *` on the asset folder fixes it** (verified: no errors left) |

**Quarto, verified with 1.8.27** (`scratchpad/offline/qtest`):
- MathJax: a filter that sets `meta.mathjax = false` and `meta.math = <script src="{offset}/…/tex-chtml-full.js">` removes the polyfill script and points MathJax at the local copy. This works on root and sub-folder pages, with no change to the course configuration.
- Theme: `theme: [offline.scss]` in a profile is merged with the course's theme, so cosmo is kept. `$web-font-path: false` removes the Google import.
- Asset folder: `project: resources: ["_ctm-assets/**"]` copies the folder into `_site/_ctm-assets/`, also when a single page is rendered.

**Sizes:**

| Part | Size |
|---|---|
| Pyodide core (`pyodide.asm.wasm`, stdlib, …) | 12.3 MB |
| Course package set: closure of numpy, scipy, sympy, matplotlib, micropip, pyodide_http (18 wheels) | 32.9 MB |
| sympy alone | 4.5 MB |
| Full Pyodide distribution (343 packages) | 414 MB (352 MB `.tar.bz2`) |
| MathJax 3 `es5/` | 24.1 MB |
| MathJax 4 | 8.2 MB, plus its font package 11.0 MB |
| Monaco `min/` | 13 MB |
| KaTeX `dist/` | 3.1 MB |
| Font Awesome `all.min.js` | 1.5 MB |
| JSXGraph core + CSS | 1.0 MB |
| **Whole bundle with the course set** | **106.5 MB, 458 files, 54.3 MB as `.tgz`** |

A board page gets smaller with `srcdoc`: uke3 is 788 KB, against 832 KB with today's base64 `data:` URLs.

**Timings are not representative.** The sandbox ran at load average 10–12 on 2 cores. Pages were ready (maths, boards, editors) in 16–31 s. Python plus the four packages took 50–150 s. jsDelivr is blocked in this sandbox, so there is no CDN baseline. The CI job measures both builds on the same runner (§10).

## 3. The switch and the profiles

1. **One CTM key:** `ctm-assessment: assets: cdn | local` (default `cdn`).
   - ctm-libs' settings reader gets it as an own key. Today `read-settings.ts:365` rejects every `ctm-assessment` key that is not shared. Step 4 adds `OWN_KEYS`; `assets` and `export` join that list.
   - With `local`, every component gets its URLs from ctm-libs (§5). The render **stops** in these cases:
     - `_ctm-assets/manifest.json` is missing, or its versions differ from ctm-libs' asset table. The message names the install command.
     - `project.resources` lacks `_ctm-assets/**`, or the theme lacks `offline.scss`. The settings reader already reads `_quarto.yml` and the profiles.
     - A project or page sets `pyodide: base-url` or `build-variant`. Either pins a Pyodide build (another version, or `debug/`) that the bundle does not contain (S8).
     - A project or page sets an http `jsxgraph: src_jxg/src_css/src_mjx`, which would load from a CDN. The values that ctm-assessment's own hook fills in are replaced by local URLs, so they do not count (S8).
   - It **warns, without stopping**, when the import scanner finds an author import the bundle lacks (§6, S8).
2. **Two Quarto profiles, written by the installer** (`install-project.py --assets local`) and kept if they already exist:

```yaml
# _quarto-offline.yml — courses behind firewalls: quarto render --profile offline
project:
  resources: ["_ctm-assets/**"]
format:
  html:
    theme: [_extensions/ctm-assessment/offline.scss]   # merged with the course theme
ctm-assessment:
  assets: local
```

```yaml
# _quarto-exam.yml — exam server: quarto render --profile offline,exam
project:
  output-dir: _site-exam           # never overwrites the course site
ctm-assessment:
  export: true                     # copy-out and export (§9)
  storage-key: <course>-exam       # autosave stays ON (AC); a separate store from the course
ai-feedback:
  enabled: false                   # the render asks for without-ai where AI-only exercises exist
```

**Autosave is not turned off** (AC): students log in under their own names, and the machines are wiped afterwards. The page bar ("saved only in this browser", delete) stays.

## 4. Getting the files: vendored once, by the package builder

- **Versions: one source per asset, no copies** (revised, S2):

  | Asset | Only source |
  |---|---|
  | **Pyodide** | step 3's constant `runtime/pyodide-runtime.js:12` (ctm-libs). Lua reads it as `ctm.runtime.indexURL()` already does; the builder reads the same pattern |
  | **JSXGraph, MathJax 4 and its font package `@mathjax/mathjax-newcm-font`** (inside boards) | ctm-assessment's existing `_extensions/ctm-assessment/jsxgraph-pins.yml`. It is already read by `ctm-assessment.lua` and `measure-loading.yml`. It gains a font pin, `mjx_fonts` (round 2) |
  | **Monaco, KaTeX, Font Awesome, MathJax 3, the font** | ctm-libs `assets.json` (name → exact version, CDN URL pattern, local path), because ctm-libs and the components load them |

  `assets.json` does not repeat Pyodide or JSXGraph. The builder fails when a version from any of the three sources has no entry in the lock.
- **Hashes: ctm-assessment `integration/assets.lock.json`.** Per entry:
  - the source archive: an npm registry tarball with its `dist.integrity` sha512, or the Pyodide GitHub release `pyodide-0.28.3.tar.bz2` (sha256 `7dcaae6d…0940`);
  - the files to keep (for example `min/` for Monaco, `es5/` for MathJax 3);
  - the licence file;
  - for the bundle, the sha256 of every output file.
  - `--update-pins` gets `--update-assets`, which re-pins from `assets.json`. The builder fails when the lock and the table differ.
- **Builder:** `setup-feedback-integration.py --assets DIR` (new code in one module, `scripts/ctm_assets.py`):
  1. Downloads only from `registry.npmjs.org`, `github.com` and GitHub's release-asset redirect hosts (`objects.githubusercontent.com`, `release-assets.githubusercontent.com`; M2). That is enough on a restricted build machine; jsDelivr and cdnjs are not needed even to build.
  2. Checks every hash.
  3. Takes the Pyodide subset: the dependency closure from `pyodide-lock.json`, re-checked against each wheel's sha256, plus a **subset `pyodide-lock.json`** that lists only what is shipped. The prototype's `tools/closure.py` is that code.
  4. Writes `manifest.json` (versions, file hashes), `LICENSES/` and `THIRD-PARTY-NOTICES.md` (§11). It writes precompressed `.gz` files next to `.wasm/.js/.mjs/.json/.css` (S4). The Pyodide version comes from Pyodide's `package.json`, never from the lock's `info.version`, which reads `0.28.0.dev0` in the 0.28.3 release (M8).
  5. Caches the result by lock hash.
- **Installer:** `install-project.py --assets local [--python-packages a,b] [--assets-from FILE|DIR]`.
  - Copies the bundle into `<course>/_ctm-assets/` and adds it to `.gitignore`.
  - Writes the two profiles.
  - `--assets-from` takes a bundle that was carried over, for a build machine with no internet access. **It verifies the bundle against the lock and manifest hashes** before copying. The default set's file hashes are in the lock; extras are verified through the wheel hashes of the full Pyodide lock.
  - The courses' `scripts/setup.py` passes an `assets:` key from `quarto-extensions.yml`.
  - No code is duplicated: the installer calls the builder's module.
- **Course repositories** never commit the 100 MB. CI caches `_ctm-assets/` by the manifest hash.

## 5. Pointing everything at the local copy

**Layout in `_site`.** Versioned directories, so a URL never changes meaning:

- `_ctm-assets/pyodide/0.28.3/`
- `_ctm-assets/npm/<pkg>@<version>/…` (the npm package layout, as jsDelivr serves it)
- `_ctm-assets/fonts/`
- `manifest.json`

**APIs, both in ctm-libs:**
- **Lua:** `ctm.assets.url(name, path)` returns the CDN URL with `cdn`, and `{offset}/_ctm-assets/…` with `local`.
- **JS:** the page carries a tiny inline `CTM_ASSETS` table, written by Lua. `CTMAssets.url(name, path)` resolves against `document.baseURI` and always returns an **absolute** URL. This is required: pyodide-interaktiv's worker is a blob worker, and relative URLs cannot resolve against `blob:`.

| Asset | Change |
|---|---|
| Pyodide `indexURL` (runtime, worker, standalone) | `CTMAssets.url('pyodide')`, with the version from step 3's constant (S2). After step 3 this is ctm-libs only. In local mode, `pyodide: packages` (micropip) may name only packages in the subset lock; otherwise the render stops. micropip never goes to PyPI |
| Monaco loader, `paths.vs`, CSS | `ctm.assets.url('monaco-editor', 'min/vs')`. One place once step 4's `ui/editor.js` takes over the loader. Same-origin, so the editor worker runs as a real worker (measured) |
| Font Awesome | the same table |
| KaTeX | **both modes** switch from jsDelivr's generated `+esm` to the package's own `dist/katex.mjs` and `dist/contrib/auto-render.mjs`. One code path, an exact version. Still dynamic `import()`, so the Monaco/AMD clash stays avoided |
| Quarto MathJax 3 | `ctm-libs.lua`, local mode only, and only when the method is MathJax (`PANDOC_WRITER_OPTIONS.html_math_method`): `meta.mathjax=false` (no polyfill) and `meta.math` = the local script tag, with Quarto's attributes. Verified |
| Google font | `offline.scss`: `$web-font-path: "../../_ctm-assets/fonts/source-sans-pro.css"` keeps cosmo's look. That path is right for website projects only. Single-file renders use the system-font variant `$web-font-path: false` (M4) |
| Locale texts | "(no connection to cdn.jsdelivr.net?)" in py-exercise and others gets a local-mode variant: "(no connection to the server?)" |
| AI feedback | local mode with AI on: a build warning that AI needs the internet |

## 6. Pyodide packages

**Ship a fixed course set**: the closure of micropip, pyodide_http, numpy, scipy, sympy and matplotlib (45 MB with the core; 46 MB with the stdlib extras below).
- It covers both courses: ingmat3a imports numpy, matplotlib, scipy and the stdlib; ctm-demo imports numpy and matplotlib.
- It also includes **Pyodide's unvendored stdlib modules** (M1): `sqlite3`, `ssl`, `lzma`, `pydecimal`, `pydoc_data`, `hashlib`, 0.95 MB measured. Online they load on import; offline, `import sqlite3` or `help('topics')` would otherwise fail. `test` (6.9 MB) is left out.

**What learners can import.**
- Learner code cannot be predicted, so render-time detection alone is not enough.
- With the subset lock, an unknown import fails at once with Python's `ModuleNotFoundError`. It does not wait for a 404.

**Render-time check of author code.**
- What is scanned: imports in pyodide cells, py-exercise starters and solutions, math-exercise Python checkers, and `packages:` options.
- How it is checked: imports are mapped to packages through the full lock's `imports` field. The bundle carries `pyodide-lock.full.json` for this purpose.
- What happens: a **warning** (revised, S8) listing the package and `install-project.py --assets local --python-packages <names>`.
  - It does not stop the render, because parsing Python imports in Lua gives false positives: the stdlib, `js`/`pyodide`, the components' own modules, local helpers, conditional imports.
  - The real gate is the CI "Offline build", which loads every author cell's imports (§10).
- Helpers that import packages themselves are mapped: math-exercise's `graph_from_response` needs `networkx` (`math-exercise.js:258`).
- `pyodide-lock.full.json` stays in the builder cache, outside `_ctm-assets/`. The profile publishes all of `_ctm-assets/**`, so anything kept there would be published (C4; corrected in round 2).

**Extras.**
- `--python-packages pandas,networkx` adds closures from the release archive.
- There is no `all` (S9, §11 licences). The full distribution would be 414 MB and include LGPL libraries.
- For exams: AC asks the teachers which extra packages learners may need.

## 7. JSXGraph boards

**The problem.** A board is a `sandbox="allow-scripts"` iframe with a base64 `data:` URL. Its origin is opaque and it has no base URL, so `../_ctm-assets/…` cannot resolve.

**Approach: `srcdoc`, with the sandbox kept.** The fork emits `srcdoc="<escaped html>"` instead of `src="data:…"`.
- A `srcdoc` document takes the **parent page's base URL**, so `{offset}/_ctm-assets/npm/jsxgraph@1.14.0/jsxgraphcore.js` resolves with no runtime code.
- `sandbox="allow-scripts"` stays. Board code must not get the page's origin, which would give it the saved answers in `localStorage` and the page's DOM.
- The `postMessage` bridge and `board.reload` work unchanged.
- Pages get 5 % smaller.
- It works with the coi service worker and with server headers.

**`srcdoc` does not fix the hidden-board bug** (review K1). A sandboxed `srcdoc` frame has an opaque origin. Chrome throttles it while it is hidden, exactly as it throttles `data:`. The reviewer measured, in full Chromium:
- `data:`: 9/25 boards blank after being shown;
- `srcdoc`: 7/25 blank;
- `srcdoc` + PR #2's resize refresh: **0/45**.

So **5b depends on PR #2's approach** (fork branch `audit/2026-10`, head e31c1b1 or newer; AC is having the `keepaspectratio` fit restored). The `srcdoc` switch comes on top of PR #2 as its own fork commit and PR, never folded into #2. PR #2's text should say "sandboxed (opaque-origin) iframe, `data:` or `srcdoc`".

**Re-measured with PR #2 applied:** §13, K1.

The alternative, `data:` plus a script that fills in absolute URLs at runtime, also worked (6/6). It needs more code and has the same throttle behaviour.

**MathJax 4 in a board.**
- The frame gets `MathJax = {loader: {paths: {fonts: …}}}`. Without it, MathJax 4 fetches its font data from jsDelivr.
- **A generic fork option `mjx_fonts`** (round 2): the base URL of MathJax's font packages. The fork writes it into the frame's `MathJax.loader.paths`; it does not do this when the option is unset. Nothing in the fork is CTM-specific.
  - ctm-assessment's hook sets it from the font pin in `jsxgraph-pins.yml`.
  - The prototype used an unversioned font directory. The versioned layout needs `loader.paths['mathjax-newcm']`; verify this in 5b.
- Its speech mathmaps are fetched with CORS from the frame's null origin. Hence `Access-Control-Allow-Origin: *` on `_ctm-assets/` (§8).
- GitHub Pages is believed to send this header already; not verified here.

**Fork contract: link or embed** (revised, S1; a decision for AC, Q17).
- **Today.** Any `src_jxg`/`src_css` that does not start with `http` is replaced by the fork's **bundled** `resources/js/jsxgraphcore.js` (1.13.3), inlined as base64 `data:` (`jsxgraph.lua:562-567`). The given path is ignored. The README says the path is embedded, so docs and code already disagree.
- **Proposal: a new fork option `src_mode: auto | link | embed`.**
  - `auto` (the default) keeps today's behaviour exactly, for existing users.
  - `link` uses the given URL as it is, relative or absolute.
  - `embed` inlines the **given** file and falls back to the bundled one. This fixes the documented behaviour.
- **No CTM code in the fork.** ctm-assessment's existing metadata hook (`ctm-assessment.lua`, which fills `jsxgraph:` from `jsxgraph-pins.yml` unless the project sets its own) sets, in local mode:
  - the three URLs, made page-relative with `quarto.project.offset`;
  - `src_mode: link`.
- The fork gains only `srcdoc` and `src_mode`.
- **Build-time `out: svg`** (Node) uses the bundled file whenever the URL is not `http`. The bundled copy is updated to the pinned version (1.14.0).
- **Upstream:** `srcdoc` and `src_mode` go upstream as their own PR after #2, or stay fork-only if upstream declines.

## 8. Secure context, service worker and caching

**What needs a secure context.** `input()` and Stop need `SharedArrayBuffer`. That needs cross-origin isolation, which needs **https or localhost**. `file://` cannot work at all.

**Without isolation** (plain http on a LAN IP), measured: Python, cells, checks, maths, boards and editors all work. Only `input()` and interrupting a running cell do not; the existing "COI unavailable" path explains this. Clipboard writes via `navigator.clipboard` also need a secure context; B7's helper falls back (§9).

**Exam server: the required setup** (revised, S7 and AC: students use a lockdown browser):
- **https** with a certificate the exam machines trust (an internal CA or a public one);
- **COOP/COEP/CORP headers sent by the server**. The coi script then sees `crossOriginIsolated` and does nothing: no extra reload, and no service worker is needed. This matters in WebKit-based lockdown browsers, whose embedded web views may restrict service workers (not documented by SEB; to be tested).

**Plain http is only a documented degraded mode** (no `input()`, no Stop), not a fallback to plan on.
- Chrome/Edge's `OverrideSecurityRestrictionsOnInsecureOrigin` policy does restore isolation on http (measured with the equivalent flag).
- Lockdown browsers do not read Chrome enterprise policies, so it does not apply to exams.

**What lockdown browsers allow** (public documentation; to be confirmed in the dry run with the exam's actual browser and configuration):

| | Safe Exam Browser, Windows 3.x | SEB, macOS/iOS | Inspera (Integrity Browser, or SEB under Inspera) |
|---|---|---|---|
| Engine | Chromium Embedded Framework (3.10.x: Chromium 139/147) | WebKit | Integrity Browser: engine **not documented** (unverified); or SEB |
| Service worker, `SharedArrayBuffer` | as in Chromium: isolation works with https + headers | not documented. Server headers needed; the service worker is not relied on | not documented. Use https + headers |
| Downloads ("export" files) | **off by default since 3.7** (separate keys for downloads and uploads) | configurable (upload policy) | not documented |
| Clipboard | **"isolated" policy**: copy and paste work between SEB windows (since 3.7), not to other programs. Cleared at start and quit | "private clipboard" option, the same idea | not documented. Course pages are opened as URL resources, in a second window or footer |
| Address filter | URL filter with "filter also embedded content" (must allow the exam host; `srcdoc`, `blob:` and `data:` frames to be tested) | same | network filter: the given page and its sub-pages. Set the custom root URL to the site root |
| Course page top-level or embedded | top-level when opened as its own SEB window (start URL or new window); embedded if the exam system frames it | same | **Not documented** whether a URL resource is a separate web view or an iframe in the exam page. Embedded cross-origin, the page loses isolation (measured: `crossOriginIsolated` false, no `SharedArrayBuffer`) and its storage is partitioned; `execCommand` copy still works (R2-2) |
| `file://`, localhost | not an option: `file://` cannot run Pyodide, and a local server on each wiped kiosk machine is not realistic | | |

Sources: SEB user manual and release notes ([safeexambrowser.org/windows/win_usermanual_en.html](https://safeexambrowser.org/windows/win_usermanual_en.html), [win_release_notes_en.html](https://safeexambrowser.org/windows/win_release_notes_en.html)); Moodle's SEB page ([docs.moodle.org/en/Safe_Exam_Browser](https://docs.moodle.org/en/Safe_Exam_Browser)); Inspera's "Adding resources to Question sets" ([support.inspera.com/…/360024023692](https://support.inspera.com/hc/en-us/articles/360024023692)); Newcastle's allow-list guidance ([blogs.ncl.ac.uk/ltdev/…/inspera-digital-exams-allow-listed-resources](https://blogs.ncl.ac.uk/ltdev/2026/01/29/inspera-digital-exams-allow-listed-resources)). The consequences for copy and export are in §9.

**Capacity** (S4). Per student, the first exercise page transfers **at most** about 42 MB. This is an upper bound: it assumes every package of the course set loads on the first page.
- Python about 38 MB: `pyodide.asm.wasm` 2.8 MB gzipped (8.6 MB raw), plus about 35 MB of wheels and stdlib that do not compress;
- the interface about 3 MB gzipped.

Later pages transfer only HTML, because the assets are cached as immutable. That holds if the lockdown browser keeps its HTTP cache during the session; clearing it at start and quit is fine.

For 200 students that is about 8.4 GB: at least 70 s at a saturated 1 Gbit/s, and about 11 min at 100 Mbit/s. Therefore:
- the builder writes precompressed `.gz` files next to `.wasm/.js/.mjs/.json/.css`, and the server serves them (nginx `gzip_static`, the Apache rewrite in §11; both tested). There is no on-the-fly compression;
- the server sits on at least 1 Gbit/s;
- students open the exam page during check-in, not all on the same second;
- the dry run includes a load test (§11).

**HTTP ranges** (S5). Step 3's prefetch fetches wheels in 512 KB ranges. The server must answer `206`, and `.whl`/`.zip` must never be compressed on the fly, because nginx drops ranges on gzipped responses. Both tested configurations answer `206` (§11). `scripts/serve-offline.py` must implement Range, a strong ETag, `If-None-Match` → `304`, and the headers. The prototype's `serve.py` has none of these and is not a model for it.

**Caching** (neutral; Q10):
- **Chosen:** no service-worker cache. Versioned asset paths get `Cache-Control: immutable` on successful responses only; everything else is revalidated (`no-cache`).
- **Trade-off:** if the server goes down during the exam, a page reload fails. The answers survive in `localStorage`, and the pages already open keep working.
- **Alternative:** an offline service-worker cache. It survives an outage but adds stale-file risk and service-worker dependence in lockdown browsers.
- Step 5's preload (P16) warms Python; it does not cache files.

## 9. Copy-out and "export my answers" (step-4 follow-up B7; AC requirement)

**Shared copy helper.** ctm-libs `ui/ctm-copy.js`, `CTMCopy.text(text, {label})`:
1. `navigator.clipboard.writeText` (secure contexts);
2. otherwise a hidden `<textarea>` with `execCommand('copy')`, which works on plain http;
3. otherwise a dialog with the text selected ("Trykk Ctrl+C").

Every copy button:
- is a real `<button>` with a visible text label and a specific `aria-label` ("Kopier koden i oppgave 3");
- reports through one polite `aria-live` status ("Kopiert");
- keeps keyboard focus.

**Copy buttons, always on:**
- **pyodide-interaktiv:** copy code (today `navigator.clipboard` only, `qpyodide-cell-classes.js:699`), **copy output text**, **"Last ned figur (PNG)"** per plot (the PNG is already in the output).
- **py-exercise:** copy code, copy output and test results. Its existing JSON download and encoded submission stay.
- **math-exercise:** **"Kopier svaret"**: the typed answers as plain text, one line per field ("(a) x = 3/4"); a matrix as rows `[[1, 2], [3, 4]]`.

**Page action "Eksporter svarene mine".** In the step-4 page bar, shown when `ctm-assessment: export: true`. Default true; the exam profile sets it explicitly.
- It builds a Markdown document: course, page title and time; then each exercise in page order, with its title, the answers or code (fenced `python`), the last output (fenced `text`), the last result and plot references.
- It opens an in-page view with the text and **Kopier alt**. **Download .md** and **Download .html** come second; the `.html` is self-contained, with the plots as images. See "Inside a lockdown browser" below.
- It is pure client side (`Blob` + `a[download]`), so it works offline and on http.

**Course-wide export** of saved records (answers and code, without outputs, which are not stored) is **deferred** (review C1). It is cheap to add later on the B1 store.

**Where it lives.**
- B1's register API gets an optional `exportItem()` that returns `{title, parts: [{kind: answer|code|output|image, label, text|dataURL}]}`.
- B2 (math-exercise) and B3 (py-exercise) implement it in B7. B6 (pyodide cells over the store) adds the cells. Until then B7 reads pyodide cells from the DOM.
- Only the export half of step 4's deferred "export/import" is brought forward. Import stays deferred.

**Inside a lockdown browser** (revised; AC). Copy and export must work with downloads blocked and a clipboard that only works between the browser's own windows:
- **The primary path is text plus copy, not files.**
  - "Eksporter svarene mine" opens an **in-page view**: a read-only, selectable text area with the whole Markdown, and **"Kopier alt"** first.
  - Students paste into the exam system in the same lockdown session. SEB's isolated clipboard allows exactly that.
  - Every copy button has the same fallbacks: Clipboard API, then `execCommand`, then select the text with a "Ctrl+C" hint. The reviewer verified `execCommand` on plain http.
- **Download `.md` and `.html` are secondary buttons.** A blocked download cannot be detected reliably, so they never replace the text view. Docs and the checklist say which exam configuration allows them.
- **Plots** cannot travel as text. Three options, a decision for AC (Q19):
  - (a) "Kopier figur" as an image (`ClipboardItem`, https). Whether isolated clipboards carry images is to be tested in the dry run;
  - (b) a PNG download, only where downloads are allowed;
  - (c) exam tasks do not ask for plots; students report numbers.
- **The course-wide export** (second button) is deferred (review C1). The page export covers the exam.
- **Strings** come from the ctm-libs catalogue (nb, nn, en), with "⌘C" on macOS (M7).

**Exam-office settings:** §11, items 7–8.

## 10. CI: "Offline build" (ctm-assessment)

**What it runs.**
- Renders the corpora (umbrella example site, ctm-demo, ingmat3a, from `corpora.json`) with `--profile offline,exam`.
- Serves `_site-exam` with `scripts/serve-offline.py`. It sends the checklist's headers: COOP, COEP require-corp, CORP and ACAO on assets. Admins can reuse it for a dry run.
- Runs Playwright with **every request outside the server refused at two levels**:
  - Chromium `--host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"`, which also covers workers, service workers and sandboxed frames;
  - a recording `context.route` that fails the job and lists each URL. The prototype's checker is the start of this.

**Browser** (revised, K1): the **full Chromium binary**, through `executablePath` or `channel: 'chromium'`. Since Playwright 1.49, `headless: true` otherwise runs the headless shell, which does not reproduce the hidden-board bug (the reviewer measured 0/10 there).

**Per page (from the build manifest):**
- no external request, no HTTP ≥ 400;
- `crossOriginIsolated`;
- MathJax containers where the page has maths;
- Monaco editors present;
- one pyodide cell runs, with output;
- one math-exercise Check gives a final verdict;
- one py-exercise Check passes with its solution;
- copy and export produce text (after B7).

**Every board, on every load** (K1). The prototype is `scratchpad/offline/tools/board-check.cjs`.
- Reveal its containers from the outside in: tabs (nested ones too), `<details>`, collapsed callouts, collapsed math exercises.
- Scroll it into view and wait about 1.2 s.
- Assert:
  - the iframe is visible;
  - the board's `svg` `width`/`height` > 0, and equal to its own board box within 2 px (the same tolerance as `board-check.cjs`). This is the blank test;
  - the drawn elements (path, text, …) have a non-zero box. This is an extra check only: a blank board can still report one drawn element.

  "Has SVG content" is not enough: a blank board still has about 46 `svg` elements.
- Reveal rules: tab links by `data-bs-target`; callouts by matching the toggle's target selector (a class); math exercises by their caption.
- Compare the SVG with its own board box, not the iframe.
- Repeat each page load **at least 5 times in CI and at least 20 times in the dry run**. The failure is intermittent, at about 20–40 % per hidden board without PR #2.
- **Deterministic negative control** (round 2, R2-1). Both parts must **fail on every run**, or the job fails:
  - a fixture board created at 0×0 with `resize.enabled: false`, which is always blank. This proves the checker sees a blank board;
  - the plain `display:none` harness pattern (no Bootstrap) without the refresh, loaded at least 20 times. At the measured 7/25 rate per load, the chance that no load fails is below 0.1 %. This proves the bug still exists in the browser in use.
- **Mechanism test, in the fork's own CI:** the same harness with and without the refresh. Without it, at least one blank; with it, none.
- **Course pages are a regression check only, never the proof.** On ingmat3a the reviewer found 0/64 blank *without* the refresh too: those hidden boards sit in `<details>` or collapsed exercises, which keep a layout box, and Bootstrap's fade lowers the rate in real tabs to about 2 %.

**Once per course:**
- every author cell's imports load. This is the real gate; the render-time scanner only warns (S8);
- a plain-http run on a non-localhost host name mapped by `--host-resolver-rules` asserts the degraded mode: no isolation, Python works, the `input()` message is shown (M10);
- external `<a href>` links listed, as information.

**Dropped** (review C2): CDN-against-local timings in CI. They are noise on shared runners.

## 11. PRs

**Step 5 (assets), after step 3 and step 4's `OWN_KEYS`:**

| PR | Repository | Content |
|---|---|---|
| 5a | ctm-libs | `assets.json` (Monaco, KaTeX, Font Awesome, MathJax 3, font; **no Pyodide**) + `lua/assets.lua` + `CTMAssets`; setting `assets`; Quarto MathJax switch; render checks (manifest; resources and theme; `pyodide: base-url`/`build-variant`; http `jsxgraph:` URLs set by the project or page; S8); import scanner (warns); local locale texts; KaTeX → `dist/*.mjs` in both modes; tests on a sub-folder page for relative and absolute URLs (M3) |
| 5b | jsxgraph fork, **after PR #2** (resize refresh; `audit/2026-10`, head e31c1b1 or newer) | `srcdoc` (sandbox kept); `src_mode: auto/link/embed`; MathJax-4 font path; bundled copy updated to the pin; its own PR, not part of #2. ctm-assessment's hook sets the local URLs and `src_mode: link`. pyodide-interaktiv: Monaco init and Font Awesome via ctm-libs (Monaco is ctm-libs-only if `ui/editor.js` landed). py-exercise and math-exercise: drop their own CDN constants |
| 5c | ctm-assessment | lock with curated licence texts + `scripts/ctm_assets.py` (builder `--assets`, precompressed `.gz`; installer `--assets local / --python-packages / --assets-from`, which verifies the hashes); `offline.scss` (website and single-file variants, M4); profile templates; `serve-offline.py` (Range, ETag, headers); `jsxgraph-pins.yml` exact; workflow **"Track assets"** (Q16); CI "Offline build" with `board-check`; `docs/exam-server.md`; CHANGELOG; re-pin |
| 5d | courses | `assets:` in `quarto-extensions.yml`; a workflow artefact `_site-exam.zip` for the exam server |

**Step-4 follow-up B7:** ctm-libs `ui/ctm-copy.js` + `ui/ctm-export.js` + `exportItem()` in B2 and B3; pyodide cells with B6. It depends on B1 (and on B6 for pyodide cells), not on step 5, so it can merge before step 5.

**Dry run** (Q14). Once 5c is merged, on an exam-like server (https + headers, no route out) with the exam's **actual lockdown browser and configuration**:
1. **Boards:** each board page loaded at least 20 times by `board-check.cjs` from an exam machine image, with full Chromium.
2. **Load test:** 50–100 parallel headless clients load one exam page. Measure the time to "Python ready" and the server's throughput.
3. **Top-level or embedded?** Open the course the way students will reach it from the exam system, and read `crossOriginIsolated` in that window (R2-2). If it is false while the headers are right, the exam system embeds the page in an iframe (§8).
4. **People:** a teacher and a few students work through one exam page. They:
   - reload a page;
   - export, and paste the text into the exam system;
   - copy code, output and an answer;
   - try a plot copy or download.

### Exam-server checklist (for the admin; goes into `docs/exam-server.md`)

1. **Copy** `_site-exam/` (from `quarto render --profile offline,exam`, or the course's CI artefact) to the server. No other files are needed and nothing is fetched from outside.
2. **Address:** one fixed host name for all students. Answers are saved per address, so do not mix the IP and the name.
3. **HTTPS is required**, with a certificate the exam machines trust (internal CA or public). Lockdown browsers cannot be told to treat http as secure. On plain http, Python still runs, but `input()` and Stop do not (a documented degraded mode, not a fallback).
4. **Headers on every response, errors included:** `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`, `Cross-Origin-Resource-Policy: cross-origin`. On `/_ctm-assets/` also `Access-Control-Allow-Origin: *`.
5. **Types and ranges:**
   - `.wasm` application/wasm, `.mjs` text/javascript, `.whl` application/octet-stream;
   - **byte ranges must work**, so no on-the-fly compression;
   - serve the precompressed `.gz` files instead.
6. **Caching:**
   - `/_ctm-assets/`: `public, max-age=31536000, immutable`, **on successful responses only**;
   - everything else: `no-cache`.
7. **Capacity:** at most about 42 MB per student on the first page, then HTML only.
   - 200 students ≈ 8.4 GB: at least 70 s on a saturated 1 Gbit/s link.
   - Use at least 1 Gbit/s, and let students open the exam page during check-in.
8. **Lockdown browser** (with the exam office):
   - the URL filter allows the server's host, embedded content included (the root URL is the site root in Inspera);
   - the clipboard works between the course page and the exam system (SEB's "isolated" policy does);
   - downloads are allowed only if files are handed in (off by default in SEB 3.7+);
   - the HTTP cache is kept during the session;
   - **the course page opens as its own top-level window, not inside the exam system's page.** Embedded, `input()` and Stop are lost whatever the server sends, and saved answers are stored under the exam system's site (R2-2);
   - if students follow a link from the exam system to the course, the link policy allows a different host. SEB can ignore new-window links to another host.
9. **Do not redeploy during an exam.** If you must, keep exercise labels unchanged (step 4's clean-up by manifest).
10. **Test** from an exam machine, in the lockdown browser, before the day.
    - Open an exercise page. Python must reach "ready", a maths answer must get "riktig/ikke riktig", a board must draw, and "Eksporter svarene mine" must show the text and copy it into the exam system.
    - Only this server may appear in the network log.
    - If you opened the site in a normal browser before https and the headers were in place, that browser profile remembers "isolation unavailable" (`qpyodide-coi-unavailable-<origin>`). Clear the site data, or use a fresh profile (M6).

The blocks below, exactly as printed, were run for real on nginx 1.24.0 and Apache 2.4.58 by the reviewer in round 2 (`review-offline/r2/`; my own run used the equivalent `srvtest/srv.conf`). On both:
- HTML and Quarto JS: the three headers and `no-cache`;
- 404 pages and 404 assets: the headers, **no `immutable`**;
- `pyodide.asm.wasm`: `application/wasm`, `Content-Encoding: gzip`, 2.83 MB instead of 8.65 MB, `immutable`, ACAO and ETag;
- a range request on a `.whl`/`.zip`: `206`;
- revalidating a wheel with `If-None-Match`: `304`, with the headers.

```nginx
server {
  listen 443 ssl http2;  server_name exam.example.no;   # nginx >= 1.25.1: "listen 443 ssl; http2 on;"
  ssl_certificate /etc/ssl/exam.crt;  ssl_certificate_key /etc/ssl/exam.key;
  root /srv/exam/_site-exam;
  include mime.types;                       # has wasm since nginx 1.21
  types { text/javascript mjs; application/octet-stream whl; }
  gzip_static on;                           # serves the builder's precompressed *.gz
  gzip_vary on;                             # Vary: Accept-Encoding, as Apache sends
  gzip off;                                 # no on-the-fly gzip: keeps byte ranges working
  etag on;
  # add_header in a location replaces inherited ones, so both blocks list all of them
  location /_ctm-assets/ {
    add_header Cross-Origin-Opener-Policy same-origin always;
    add_header Cross-Origin-Embedder-Policy require-corp always;
    add_header Cross-Origin-Resource-Policy cross-origin always;
    add_header Access-Control-Allow-Origin * always;
    add_header Cache-Control "public, max-age=31536000, immutable";   # no "always": not on 404/5xx
  }
  location / {
    add_header Cross-Origin-Opener-Policy same-origin always;
    add_header Cross-Origin-Embedder-Policy require-corp always;
    add_header Cross-Origin-Resource-Policy cross-origin always;
    add_header Cache-Control "no-cache" always;
    try_files $uri $uri/ =404;
  }
}
```

```apache
# a2enmod ssl headers rewrite mime http2   (Apache 2.4)
<VirtualHost *:443>
  ServerName exam.example.no
  DocumentRoot /srv/exam/_site-exam
  SSLEngine on
  SSLCertificateFile /etc/ssl/exam.crt
  SSLCertificateKeyFile /etc/ssl/exam.key
  Protocols h2 http/1.1
  AddType application/wasm .wasm
  AddType text/javascript .mjs
  AddType application/octet-stream .whl
  FileETag MTime Size
  Header always set Cross-Origin-Opener-Policy "same-origin"
  Header always set Cross-Origin-Embedder-Policy "require-corp"
  Header always set Cross-Origin-Resource-Policy "cross-origin"
  # everything outside the assets is revalidated (HTML and Quarto's site_libs)
  Header set Cache-Control "no-cache"
  <Directory /srv/exam/_site-exam/_ctm-assets>
    Header always set Access-Control-Allow-Origin "*"
    # "set" (not "always"): only successful responses become immutable
    Header set Cache-Control "public, max-age=31536000, immutable"
    # precompressed files; no mod_deflate, so byte ranges keep working
    RewriteEngine On
    RewriteCond "%{HTTP:Accept-Encoding}" "gzip"
    RewriteCond "%{REQUEST_FILENAME}.gz" -f
    RewriteRule "^(.+\.(wasm|js|mjs|json|css))$" "$1.gz" [L]
    <FilesMatch "\.wasm\.gz$">
      ForceType application/wasm
    </FilesMatch>
    <FilesMatch "\.m?js\.gz$">
      ForceType text/javascript
    </FilesMatch>
    <FilesMatch "\.json\.gz$">
      ForceType application/json
    </FilesMatch>
    <FilesMatch "\.css\.gz$">
      ForceType text/css
    </FilesMatch>
    <FilesMatch "\.gz$">
      Header set Content-Encoding gzip
      Header append Vary Accept-Encoding
      SetEnv no-gzip 1
    </FilesMatch>
  </Directory>
</VirtualHost>
```

**Licences of what is redistributed** (revised, S9).

| Component | Licence and source of the text |
|---|---|
| Pyodide | MPL-2.0 (files unmodified) |
| Wheels of the course set | the 17 wheels carry their own texts in `dist-info` (checked by the reviewer): numpy, scipy, sympy, mpmath BSD; matplotlib PSF-style; pillow MIT-CMU; micropip MPL-2.0; the rest MIT, Apache or BSD |
| **No text of their own; the lock carries a curated text** | `libopenblas` (BSD-3-Clause); `python_stdlib.zip` (PSF-2.0); the Emscripten runtime in `pyodide.asm.js` (MIT/UIUC); `@mathjax/mathjax-newcm-font` (Apache-2.0, plus the GUST Font License of the New Computer Modern glyphs) |
| MathJax | Apache-2.0 |
| KaTeX, Monaco | MIT (Monaco's ThirdPartyNotices kept) |
| JSXGraph | MIT or LGPL-3.0 |
| Font Awesome Free | icons CC BY 4.0, fonts OFL, code MIT (file header kept: CC BY needs attribution) |
| Source Sans Pro | OFL-1.1, from `@fontsource/source-sans-pro` 5.3.0 |

How the bundle handles them:
- It carries `LICENSES/` and a generated **`THIRD-PARTY-NOTICES.md`**.
- Files are never minified again and their headers are never stripped.
- The builder fails when an entry has neither its own nor a curated licence text.
- **`--python-packages all` is not offered.** Extras are named. The builder refuses packages whose licence is copyleft or unknown (for example `libgeos`, LGPL-2.1) unless `--accept-licence LGPL-2.1` is given. Then the notices include the LGPL text and the source offer (Pyodide's recipe and upstream source URLs).

---

## 12. Decision sheet (AC), revised after the review

| # | Question | Options | Recommendation |
|---|---|---|---|
| Q1 | How is the offline build switched on? | one setting plus profiles, or per-component settings | **`ctm-assessment: assets: local`** in a profile `offline`. Exams render `--profile offline,exam`: AI off, export on, a separate storage key, **autosave on**, output to `_site-exam`. |
| Q2 | Who downloads the files? | the package builder; each course; by hand | **The package builder, once**: from npm and Pyodide's GitHub release, with hashes. The installer copies the files into the course. `--assets-from` (with a hash check) serves a build machine without internet. |
| Q3 | Which Python packages? | a fixed set plus named extras; the full 414 MB | **A fixed course set** (numpy, scipy, sympy, matplotlib, micropip, pyodide_http and the small stdlib extras; 46 MB with the core), plus extras named with `--python-packages`. No "all" (licences, size). **Ask the exam teachers which extra imports students may need.** |
| Q4 | Boards in iframes? | `srcdoc`; `data:` plus a runtime script | Neither fixes Chrome's hidden-board blanking (measured 7/25 and 9/25 blank); **both need PR #2's resize refresh** (0/45 with it). With PR #2 in, **`srcdoc`** is simpler (no script, smaller pages). The sandbox stays. |
| Q5 / Q16 | Exact versions online too, and who updates them? | exact pins with an automated weekly proposal; floating `@1`/`@4`/`@0.16` as today | **Exact pins in both modes**, with a weekly workflow "Track assets" (like "Track components"). It proposes a re-pin PR when a new release appears and runs the board, plot, offline and (for Pyodide) parity tests. AC merges; security fixes (e.g. KaTeX) come that way. Pyodide bumps stay manual (parity gate). JSXGraph: 1.14.0 (1.13.0/1.13.1 crash in hidden boards). The fork's own default stays `@1`, as PR #2 has it. |
| Q6 | Quarto's MathJax | ctm-libs switches it; course configuration | **ctm-libs switches it in local mode.** Verified twice. |
| Q7 | Font of the cosmo theme | ship it; system fonts | **Ship Source Sans Pro** (`@fontsource/source-sans-pro`, OFL) for websites; system fonts for single-file renders. |
| Q8 | Exam server | https + headers; plain http | **https with a trusted certificate + COOP/COEP/CORP headers is required.** Lockdown browsers cannot be told to treat http as secure. Plain http works without `input()` and Stop: documented as degraded, not a fallback. |
| Q9 | MathJax 4 speech in boards | ACAO header; turn speech off in boards | **`Access-Control-Allow-Origin: *` on the asset folder** (verified). |
| Q10 | Caching | HTTP caching only; also a service-worker cache | **HTTP caching only.** Trade-off: if the server dies mid-exam, a reload fails; the answers are kept in the browser and open pages keep working. A service-worker cache would survive that but adds stale-file risk and service-worker dependence in lockdown browsers. |
| Q11 | Copy buttons | always on; only on exam builds (`export: true`) | **Always on** (code, output, maths answers), with fallbacks that work on http and in lockdown browsers, and accessible labels. |
| Q12 | Export | text view + copy first, downloads second; downloads only | **"Eksporter svarene mine" opens the text in the page with "Kopier alt" first.** Downloads (`.md`, `.html` with plots) are secondary, because lockdown browsers often block downloads (SEB: off by default). Course-wide export deferred. |
| Q13 | Where it all goes | | Assets in **step 5** after step 3: 5a ctm-libs → 5b fork (after PR #2) and components → 5c umbrella → 5d courses. Export as **B7**, after B1 (and B6 for pyodide cells); it does not wait for step 5. December is a target, not a constraint. |
| Q14 | Proof | | CI "Offline build": **full Chromium**, network refused, **every hidden board opened and checked for real size, every page loaded at least 5 times**, plus a **negative control that fails on every run** (an always-blank board, and the plain hidden-frame pattern loaded at least 20 times without the refresh). The course pages are a regression check, not the proof. Dry run on an exam-like server with the **real lockdown browser**: at least 20 loads per board page, a **load test** with 50–100 clients, and people copying and exporting into the exam system. |
| Q15 | AI in the exam profile | | **Off.** Where an exercise needs AI, the author picks the fallback (the render asks). |
| Q17 | JSXGraph fork: local URLs | a `src_mode: auto/link/embed` option and a font option `mjx_fonts`, both generic, with the values set by ctm-assessment's existing hook; CTM code in the fork | **`src_mode` (default `auto` = today's behaviour) and `mjx_fonts`**; ctm-assessment's hook sets `link`, the local URLs and the font path. `srcdoc` and `src_mode` go upstream as their own PR after #2 (fork-only if declined). |
| Q18 | Who owns the JSXGraph version? | ctm-assessment's `jsxgraph-pins.yml`; ctm-libs' table | **`jsxgraph-pins.yml`**, made exact, including the MathJax font package. Pyodide stays step 3's constant; ctm-libs' table holds only the rest. One source each. |
| Q19 | Plots in an exam | copy as image; PNG download; tasks without plots | **Ask what the exam needs.** Copy-as-image is to be tested in the lockdown browser; a download works only if the exam allows downloads; the safest is tasks that ask for numbers, not pictures. |
| Q20 | Server capacity | | **About 42 MB per student on the first page, then HTML only**: 200 students ≈ 8.4 GB, at least 70 s on 1 Gbit/s. Precompressed files, at least 1 Gbit/s, staggered start, load test in the dry run. |
| Q21 | Exam office, before choosing the setup | | Settle: a **trusted certificate** for the exam host; the lockdown browser's **URL filter** (host plus embedded content; Inspera root URL); **clipboard** between course page and exam system; **downloads** only if files are handed in; **HTTP cache** kept during the session; and **whether the course page is top-level or embedded in the exam system's page.** Embedded, `input()` and Stop are lost whatever we send. The options are then a top-level window for the course, or an embedding page that is itself cross-origin isolated (the exam vendor's side). |

---

## 13. Revision after review (19 Oct)

The review is `scratchpad/review-offline/REVIEW.md`. It found one blocking finding (K1) and nine should-fix findings. The table says what changed and where.

| Finding | Change | Where |
|---|---|---|
| **K1** `srcdoc` does not avoid the hidden-board blanking. The proof could not see a blank board | Q4 reworded. **5b depends on PR #2's resize refresh** (`audit/2026-10`, head e31c1b1 or newer, `keepaspectratio` fit being restored per AC). The sandbox stays. Proof: full Chromium; every board revealed (tabs, `<details>`, callouts, collapsed math exercises); visible, real size, drawn content; at least 5 loads per page in CI and at least 20 in the dry run. Prototype `tools/board-check.cjs`; result below | §7, §10, §11, Q4, Q14 |
| **S1** fork: a non-http `src_jxg` silently falls back to the bundled 1.13.3 as `data:` | `src_mode: auto/link/embed` (`auto` = today). ctm-assessment's existing `jsxgraph:` metadata hook sets the local URLs and `link`; no CTM code in the fork. `srcdoc`/`src_mode` go upstream as their own PR after #2 | §7, Q17 |
| **S2** two version sources | Pyodide: only step 3's constant. JSXGraph and MathJax 4: only `jsxgraph-pins.yml`. `assets.json`: only the rest | §4, Q18 |
| **S3** exact pins online were not a decision | Q16: exact pins, with a weekly "Track assets" proposal PR | §11 (5c), Q16 |
| **S4** capacity | Precompressed `.gz` from the builder; 42 MB per student; load test in the dry run | §8, §11, Q20 |
| **S5** ranges | `serve-offline.py` with Range, ETag, `304`; checklist "byte ranges must work, no on-the-fly gzip". Both servers answer `206` | §8, §11 |
| **S6** `immutable` on errors; Apache cached `site_libs` heuristically | nginx: `Cache-Control` without `always`; Apache: `Header set`, plus `no-cache` on everything outside the assets. **Both re-run**: no `immutable` on 404, `no-cache` on Quarto JS, ranges, gzip, `304` (§11) | §11 |
| **S7** lockdown browsers ignore the insecure-origin policy | https + headers is **the** setup; plain http only degraded. Lockdown-browser table from public docs. Export and copy work without downloads (text view + copy first) | §8, §9, §11, Q8, Q12, Q21 |
| **S8** render checks | Stops for `pyodide: base-url`/`build-variant` and http `jsxgraph:` URLs set by the project or page; the import scanner warns; helper packages (`networkx`) mapped | §3, §6 |
| **S9** licences | Curated texts for OpenBLAS, the CPython stdlib, Emscripten and the MathJax font (+ GUST); `THIRD-PARTY-NOTICES.md`; no `all`; copyleft extras only with `--accept-licence` and a source offer; font package named | §11, Q3, Q7 |
| M1 | Unvendored stdlib modules in the course set (0.95 MB measured; `test` left out) | §6 |
| M2 | GitHub release-asset hosts listed | §4 |
| M3 | 5a tests relative and absolute URLs on a sub-folder page. The prototype baked absolute URLs, so `{offset}` + `CTMAssets.url()` is designed but not yet exercised | §11 (5a) |
| M4 | `offline.scss` font path for websites; system font for single-file renders | §5 |
| M5, M6 | Checklist: no redeploy during an exam; clear the "COI unavailable" flag in the test step | §11 |
| M7 | Strings from the ctm-libs catalogue (nb/nn/en; ⌘C on macOS) | §9 |
| M8 | Pyodide version from `package.json`, not the lock (`0.28.0.dev0`, confirmed) | §4 |
| M9 | GitHub Pages ACAO still unverified (github.io is blocked here too). It matters only for the `offline` profile on Pages; the CI check of the published site settles it | §7 |
| M10 | Plain-http CI check with a mapped host name | §10 |
| C1–C4 | Taken: course-wide export deferred; CDN timings dropped from CI; approach B reduced to one sentence; full lock not published | §6, §7, §9, §10 |

**Corrections to the first version:**
- **"6/6 boards drawn" was too weak a claim.** All six uke3 boards sit in `<details>`, which keep a layout box, so no hidden-tab show was exercised. "Has SVG content" also cannot see a blank board.
- **"Fallback: plain http + browser policy"** does not exist for lockdown browsers.
- **"Course set 45 MB"** is now 46 MB with the stdlib modules.

**K1 re-measured** (full Chromium 141, network refused at DNS and route, COOP/COEP require-corp + CORP + ACAO server; ingmat3a's 19 boards on 6 pages, every board revealed and scrolled into view on every load, 5 loads per page):

| Build | Board checks (boards × loads) | Hidden when the page loaded | Blank or wrong size |
|---|---|---|---|
| **PR #2 rework (e31c1b1) + `srcdoc` + local assets** | 95 (19 × 5) | 75 | **0** |
| PR #2's previous head (17de83e, its own hidden-board fix) + `srcdoc` | 51 (17 × 3) | 42 | 0 |

**How to read this** (corrected in round 2).
- **This is a regression check, not proof of the fix.** The reviewer ran the same pages with the refresh disabled and also got **0/64**. Those hidden boards sit in `<details>` or collapsed exercises, which keep a layout box; in real Quarto tabs, Bootstrap's fade lowers the rate to about 2 %.
- The proof of the fix is the mechanism harness: 7/25 blank without the refresh, 0/45 with it. On a Quarto fixture with the fork's current head: 1 blank in 80 shows without the refresh, 0 in 80 with it. `board-check.cjs` caught that blank (svg 0×0 in a 498×348 frame), so the checker can see one.
- **CI therefore uses a deterministic negative control** (§10): an always-blank board, and the plain hidden-frame pattern loaded at least 20 times without the refresh. Both must fail on every run.
- All 19 boards drew at their real size on every load, which shows that the reveal rules work: nested tabs, `<details>`, collapsed callouts and collapsed math exercises. Only `fonts.googleapis.com` was requested outside the server; `offline.scss` removes it.

**Three false failures were fixed in the checker on the way.** Each is a rule that `board-check.cjs` (and so the CI job) must keep:
1. A collapsed math exercise hides its board with `visibility: hidden` and keeps the layout. The checker clicks its caption.
2. Quarto's collapsed callouts are targeted by a class (`.callout-N-contents`), not an id.
3. A board can be smaller than its iframe (uke5: a 646 px board in a 680 px frame). The SVG is compared with its board box, not with the iframe. uke5 then passed 10/10.

**Disk:** the 352 MB Pyodide archive, its 414 MB extraction, the npm packs and five of the six prototype sites were deleted (1.8 GB → 130 MB). `scratchpad/offline/tools/refetch.sh` fetches them again (sha256 and npm integrity checked). The kept sites are `proto-pr2/` (PR #2 build, `srcdoc`, local assets) and `srvtest/` (server configurations and `check-server.sh`).

### Round 2 (review-offline/REVIEW.md "Round 2"; no blockers)

| Finding | Change | Where |
|---|---|---|
| **R2-1** the board proof cannot tell fixed from unfixed on course pages; the negative control would rarely fire | Deterministic negative control: an always-blank board, plus the plain harness pattern without the refresh, at least 20 loads. Both must fail every run. Mechanism test in the fork's CI. The course-page result is a regression check only. The blank test is width/height with a 2 px tolerance; "drawn > 0" is extra | §10, §13 K1, Q14 |
| **R2-2** an exam system that embeds the course page loses isolation whatever the headers | Lockdown table row; checklist item 8; dry-run step 3. Options: a top-level window for the course, or an embedding page that is itself cross-origin isolated | §8, §11, Q21 |
| S1 gaps | MathJax font path as a generic fork option `mjx_fonts`; the font package pinned in `jsxgraph-pins.yml` | §4, §7, Q17, Q18 |
| nginx `Vary` | `gzip_vary on` | §11 |
| Inspera engine | "Chromium-based" withdrawn: not documented | §8 |
| Minor | `pyodide-lock.full.json` kept outside `_ctm-assets/`; course set 45 MB core-plus-set, 46 MB with the stdlib extras; 42 MB per student stated as an upper bound; the server-test wording names the run | §6, §8, §11 |

## AC's decisions (19 Oct, binding)
- The decision sheet is approved as recommended: exact pins online with a weekly automated bump proposal that AC merges; https + trusted certificate + headers required on the exam server (plain http = documented degraded mode); export as in-page text with "Kopier alt" first, download second; copy buttons always on; fork options `src_mode` (auto = today) and `mjx_fonts`, no CTM code in the fork; offline assets in step 5 after step 3, export (B7) right after B1; AI off and autosave on in exams; local MathJax and font; HTTP caching only.
- Exam Python package set (so far): numpy, scipy, sympy, matplotlib, networkx (plus their dependencies and the stdlib extras); the render stops if a page needs anything else.
- Handing in files (upload of plots/data into the exam system) is unclear and may not be possible: export must work with copy-to-clipboard of text alone; plot hand-in stays an open question for the exam office, nothing depends on downloads or uploads.
