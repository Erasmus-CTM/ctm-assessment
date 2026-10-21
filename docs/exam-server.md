# Serving an offline exam site

Render with `quarto render --profile offline,exam` and copy the complete
`_site-exam/` tree to the exam host. Keep the course at one fixed host name:
browser answers belong to that origin. Do not mix a host name and IP address,
clear browser data during the session, or redeploy during an exam.

The profiles and vendored asset builder are separate Step 5 work. This server
serves an already built tree; it does not fetch dependencies or build profiles.

## Local checks and an administrator dry run

Python 3.12 or newer, no additional packages:

```sh
python scripts/serve-offline.py _site-exam --port 8000
python -m unittest discover -s tests -p test_serve_offline.py -v
```

The default address is 127.0.0.1. Localhost is a secure browser context suitable
for CI; it does not prove the exam's network/browser configuration works.
For a network dry run use the host's trusted certificate and private key:

```sh
python scripts/serve-offline.py /srv/exam/_site-exam --bind 0.0.0.0 --port 8443 --cert /etc/ssl/exam.crt --key /etc/ssl/exam.key
```

This standard-library server is a CI and dry-run utility. For the examination,
exam IT owns TLS, monitoring, capacity and deployment. HTTPS with a certificate
trusted by every exam machine is required. Plain HTTP on a LAN is a degraded
mode: Python runs, but `input()` and Stop do not. Browser enterprise exceptions
are not an exam-browser fallback.

## HTTP contract

Every response, including errors, needs these headers:

| Header | Value |
|---|---|
| Cross-Origin-Opener-Policy | same-origin |
| Cross-Origin-Embedder-Policy | require-corp |
| Cross-Origin-Resource-Policy | cross-origin |
| Access-Control-Allow-Origin (under /_ctm-assets/) | * |

The last header lets sandboxed JSXGraph frames with an opaque origin fetch
MathJax speech data. The server provides GET/HEAD, strong SHA-256 ETags,
`If-None-Match` revalidation and single byte ranges with `If-Range`.
Multipart ranges and unknown range units are ignored, returning the full file.
Unsatisfiable single byte ranges return 416 with `Content-Range: bytes */size`.
Ranges apply to GET, not HEAD.

| Resource | Content-Type / cache policy |
|---|---|
| .wasm | application/wasm |
| .mjs and .js | text/javascript |
| .whl | application/octet-stream |
| successful /_ctm-assets/ responses | public, max-age=31536000, immutable |
| HTML, site_libs, other files and errors | no-cache |

Versioned asset URLs must never be reused for different content. The builder's
precompressed `.gz` files are selected for wasm/js/mjs/json/css when the client
accepts gzip; MIME remains that of the original file, with
`Content-Encoding: gzip` and `Vary: Accept-Encoding`. ETags identify the actual
selected bytes. No compression happens on demand. Wheels and ZIP files retain
identity bytes, so the runtime's 512 KiB prefetch ranges work. The utility hashes
the selected file on each request to avoid stale tags after replacement; use a
properly configured production server for capacity. It serves contained files
and directory indexes, without directory listings.

For nginx use static gzip (`gzip_static on; gzip_vary on; gzip off;`) and the
headers above with `always`. Set the immutable cache header only on successful
asset responses, without `always`; repeat the isolation headers in each
location because location headers replace inherited ones. Outside assets set
`no-cache`. Include MIME mappings for wasm/mjs/whl and enable ordinary ranges
and ETags. Apache needs equivalent `mod_headers`, MIME types, strong ETags,
and static gzip rewrites preserving original MIME, plus `Vary`; disable dynamic
compression. The approved design contains the reviewed nginx/Apache examples:
[Step 5 design](consolidation/2026-10-step5-offline-exam.md).

## Exam-office checklist

- Use a trusted HTTPS host with these headers on successes and errors.
- Open the course in its own top-level window. A cross-origin frame inside the
  exam system loses isolation even when this server has the right headers;
  confirm `crossOriginIsolated === true` where students actually work.
- Allow the host and embedded resources in the browser's URL filter. Check
  `srcdoc`, `blob:` and `data:` behavior in the actual exam configuration.
- Keep the HTTP cache for the session. Use HTTP caching, without an offline
  service-worker cache. If the server goes down, open pages continue working
  and browser answers remain; a reload can fail.
- Test copying code, output, maths answers and the page export into the exam
  system in the same lockdown session. The primary export is selectable text
  with Copy all; files are secondary. Downloads/uploads and plot hand-in need
  an explicit exam-office decision.
- Budget up to about 42 MB per student for a cold first page. For 200 students,
  about 8.4 GB takes at least 70 seconds at a saturated 1 Gbit/s. Stagger
  check-in and run a 50–100-client capacity test on the real server.
- Load each board page at least 20 times using the real exam-machine image,
  revealing every hidden board and checking its actual size. Run Python,
  `input()`, Stop, exercise checks, copy and export. Only the exam server may
  appear in the network log.
- Use a fresh browser profile after enabling HTTPS/headers, or clear the old
  `qpyodide-coi-unavailable-<origin>` flag/site data before testing.
- Do not redeploy during the exam. If unavoidable, preserve exercise labels.

The default exam Python set is numpy, scipy, sympy, matplotlib and networkx,
with their dependencies and stdlib extras; exam rendering must stop when a
page needs another package. This is enforced by the builder/render integration,
not the static server. AI is off, autosave and export are on, and the exam
profile uses a separate storage key.

HTTP unit tests cannot certify a lockdown browser, trusted certificate,
production throughput, or the board mechanism. Those remain dry-run gates.
