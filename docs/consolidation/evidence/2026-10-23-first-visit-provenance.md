# Targeted Chromium first-visit provenance

One authorized diagnostic only; no product changes, remote writes, request interception, worker replacement, or debugger pause. The existing failed reports and harness remain untouched. New passive CDP attachment uses waitForDebuggerOnStart=false, so very early worker events can still predate attachment. This is not a timing-equivalent reproduction or a new all-browser acceptance campaign.

## Result

The targeted run completed real isolation, IDE Run 42, and opaque board SVG/speech/braille. All actual raw error arrays were empty. It nevertheless exited 1: the existing strict pending guard retained one active-frame font and three detached-board requests with no terminal events. Report SHA256: deb570b5615aafdacac35b7d68642489b49bac5b00e85ba2ca07a0fb1355edd9.

## Font attribution is now document-specific

The unresolved Source Sans Pro font request 39572.138 belongs to initial top-document loader C0A116BDB6F111B85A4C58ECC4F8E10C. CDP records the same FrameID navigating to replacement loader 14F6A5833A5C8B271B7EC89715CC7423 at 1792768949576. Therefore Frame.isDetached=false does not establish that this request belongs to the current document. The old request has no CDP or Playwright terminal event: client consumption remains UNKNOWN, not successful.

A downstream service-worker fetch of that font, 39572.150, completed HTTP200 with encodedDataLength14930 at1792768949390. That proves the downstream fetch completed, not that the old client consumed it. The current document separately requested the same font as28252.137, associated with replacement loader14F6A..., and completed HTTP200/fromServiceWorker at1792768949915. Do not join by URL alone: these are distinct lifecycles.

The three other missing-terminal requests belong to initial board loaderD0A75DF32E83DBB49331FC062BB2BA42/frame69DD824BD18B99E00973737AB0FB4814; the new board uses loader758548722B32FF70D3B83F871CC2D644/frameC504FEA0E74B6F2056EA05ECD23B7B1B. The original harness already proves their actual Frame.isDetached=true. These remain retained unknown lifecycles; no successful transfer claim follows.

## Matplotlib abort is not reproduced or fixed

The original baseline ERR_ABORTED remains unresolved. It happened during setup-before-run, well before teardown; this diagnostic does not justify relabeling it as expected reload cancellation.

In this run all13 Matplotlib range requests completed in a dedicated blob worker, target15A2ADB0860296D0560844D5FCD24A86, URLblob:http://127.0.0.1:63989/1ea228e6-6632-40c1-83d4-14a4d14e7b20. The worker was attached after replacement top-document navigation. Initiators identify fetchRange / fetchRangeWithRetries (blob zero-based316/344), matching canonical CTMWorker stage2 prefetch code in runtime/pyodide-worker.js (file347/375). Its blob URL uses the parent HTTP origin; the opaque board's speech worker uses its separate data URL. This observed Matplotlib traffic is CTMWorker background setup, not board speech loading. Source start() creates this worker from WORKER_SOURCE; whenSetup is its stage2 completion promise.

Every512KiB range (last range shorter) has a matching completed service-worker downstream fetch. CDP service-worker targets were observed via multiple sessions; analysis deduplicates targetId+requestId, rather than counting duplicate attachment events as extra transfers. No Network.loadingFailed appeared in this run.

The source's explicit AbortController path is a30000ms no-byte stall timer. Original baseline failure at7870ms total elapsed cannot be attributed to that timer on the available timing evidence. Command scheduling waits between ranges, without aborting active fetches. The original report has no CDP request/loader/worker identity, so it cannot prove whether the failed request was old-worker teardown, another fetch path, or a transient transport cancellation.

## Bounded harness improvements proposed, not activated

Keep target+requestId+loaderId+frameId per lifecycle; distinguish superseded loader on an attached Frame from actual current-loader pending. Retain every unknown old-document lifecycle and every actual requestfailed. Keep downstream service-worker completion distinct from client completion. Do not convert UNKNOWN to success or suppress the original abort. Preserve separate functional, raw-error, current-document-settlement, and all-lifecycles-observed results.

Files: chromium-provenance.json/log are full primary evidence; analyze-provenance.py deterministically writes chromium-provenance-summary.json with exact navigation/request/terminal joins. No second run was launched.
