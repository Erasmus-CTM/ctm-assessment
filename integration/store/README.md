# Rendered store integration

This is a small real-package test, separate from grading parity. The canonical
installer resolves the normal/review pins once, and Quarto 1.8.27 renders a mixed
course and a reviewed changed-source version. Both versions are served at the
same URL and use the same course key.

The browser test loads the shipped scripts and actual Monaco, Python exercise
and Pyodide cell controls. It does not replace a component or Python runtime.
A spy wraps real registration/restore and runtime methods before page scripts
load. Historical results are seeded through the actual registered handle's
`result()` method, so the test can check persistence and progress without
duplicating checker parity. OS clipboard writes are captured at that external
boundary; the shared copy helper and actual copy/export controls still run.

Coverage:

- authored field values, dynamic matrix shape, second pool choice and both code
  editors survive a reload;
- unlabelled/duplicate exercises have independent progress but no saved records;
- nested tab/reveal tile navigation reaches and focuses the actual exercise;
- changed ordinary, pool and Python sources show read-only saved answers and
  outdated tiles without running Python or Check;
- Python/Pyodide Reset controls are independent;
- saving off keeps copy/export usable, and unavailable local storage falls back;
- page/course deletion crosses two tabs and cancels pending writes.

The duplicate/unlabelled fixture deliberately produces the shared warning that
those answers are not saved. This is an author-error fixture, not a course
migration acceptance page.

Run from the repository:

```sh
python integration/store/build.py --dest /tmp/ctm-store-integration --review-refs '{}'
CTM_STORE_ROOT=/tmp/ctm-store-integration CTM_BROWSER=chromium node integration/store/browser.mjs
```

The dedicated read-only workflow runs the same test in Chromium, Firefox and
WebKit with bounded jobs. It uploads the exact resolved component record and
browser logs; it never publishes a site.
