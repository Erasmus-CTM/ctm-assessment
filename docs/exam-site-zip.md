# Offline Python website ZIP

This first website contains two Python IDE pages using the existing Pyodide
windows. It initially carries the complete verified asset bundle. It does not
contain course graders, JSXGraph boards, or Maxima.

The workflow consumes the reviewed prebuilt artifact from run 39818419447,
checks complete-lock SHA256
`93e96c89432d46f90be347fe8c65a6596e3467f9cbf2ee8cbc15f59ab08ec3be`,
uses the canonical carried installer and profile writer, and renders
`offline,exam`. AI feedback is off; answer saving and export remain on.
Private build metadata is excluded.

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
The website artifact is uploaded only after acceptance.

The header-equipped server is CI evidence, not an IT installation requirement.
Plain-LAN results determine whether basic Run needs hosting changes. Interactive
`input()` and interruption have separate browser security requirements and are
not claimed by this first ZIP. Whole-course, board and Maxima acceptance remain
separate.

This paragraph is included in the ZIP as `README-IT.txt`:

<!-- IT -->
Extract every file in this ZIP into the webserver directory where the Python site should appear. Keep index.html, site_libs, _ctm-assets and the other supplied files together; do not rename or flatten their folders. Open the site's web address in a current Chrome or Edge browser. No Python, Quarto, Node or package installation is needed on the webserver. HTTPS is recommended; browser security can limit interactive input and interruption on plain HTTP. Your code and saved answers stay in that browser. External internet access is not required.
<!-- /IT -->
