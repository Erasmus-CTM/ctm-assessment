# wkz: terminated wasm worker probes (DIAGNOSTIC ONLY, not for merge)

Self-driving probe pages for the WebKit issue where `worker.terminate()` does
not stop a worker thread that is busy in WebAssembly. Write-up:
`docs/notes/webkit-terminated-wasm-worker.md` (separate PR branch).

- `wat/*.wat` → `wasm.js` (`node build-wasm.mjs`, needs `npm i wabt@1.0.37`)
- `wkz.html?run=ID&exp=JSON`: one experiment (fields in `experiments.mjs`)
- `wkz-py.html`: Pyodide runaway-Stop experiment (needs `pyodide/` with the
  0.28.3 core; the workflow installs it)
- `server.mjs PORT`: static files, `/coi/` prefix with COOP/COEP, and a
  host-side sampler of content-process CPU/threads/RSS at each `/mark`
- `drive.mjs`: one fresh browser/app/tab per experiment; backends
  playwright-webkit, playwright-chromium, safari, stp, simulator, wkapp
- `ci.json`: the job list `.github/workflows/wkz-diag.yml` runs on push
