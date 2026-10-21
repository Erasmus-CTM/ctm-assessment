# PR28 observed rendered differences

Baseline: `3d9ebd94565ca302724dc619092ad9d043c1497f`.
Candidate: `b045f850040c892636167b2d6a71ba35fd958142`.
Producer: run 39679120253, examples job 119497384658.
Artifact: 12383646759, `compare-examples`, `examples_site.json`.
Complete recovery: diagnostic commit 72bb6b74d973b9c9ab551cb1a33d6f80514a2546,
run 39680311005, job 119500756912.
Verified JSON: 69,404 bytes; 31 ordered base64 chunks;
SHA-256 `da7cb4d62794d42c57d6f2863057db23a07f3f4449cdec2deeaaf3e7246fc9f1`.

All 133 report rows were inspected, including the rows omitted from the
producer's 80-row Markdown summary:

| Difference | Rows |
|---|---:|
| Exact added UI catalogue/copy/store/export/math-store scripts | 5 |
| New py-exercise save/source/storeId metadata | 18 |
| New Pyodide store/extra metadata and empty save option | 18 |
| New complete v1 manifest | 1 |
| Added generated save-bar elements, labels and end tags | 21 |
| Five new metadata attributes on fourteen exercise roots | 70 |
| Total | 133 |

No author prose, grading payload, checker or variant differences occurred in
this report. This does not classify other course reports or replace a fresh
rendered comparison against the final composed head.
