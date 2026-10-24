# Exact JSXGraph renderer comparison

This calibration explains only the reviewed upstream extension transition
`17de83e006cf8907a146cc6a2366f42a35463c6e` to
`e4ad81d82e1b56f86765026a3dd26f6975d29d57`. It does not change the package
pin, activate a pre-loader, edit rendered output or alter browser error gates.

The failed original pin comparison is retained: assessment run `39937389941`,
head `c47c67b49f5cc5147e8bf02eed04a070034f3af4`. Ingmat main produced 27 changed
iframe source rows and 27 derived asset-invariant failures across 11 pages.
Artifact `12494970689`, ZIP SHA256
`0a2d7084246ffd4d8521ea374f77c9da3170aabee7def75e267afa114377622e`,
contains the complete 54-row report. The example preflight's thrown JSON was
truncated in the job log; future preflight reports are preserved as artifacts.

`jsxgraph-renderer.mjs` accepts canonical installed before/after source records
and pins. Both repositories must be upstream, both exact commits must match,
local overrides/dirty files are rejected, and all declared/read file hashes
must equal the fixed reviewed hashes. No vendor implementation is copied into
the comparator. It reads the canonical Lua template and graph-editor file.

For each candidate iframe it reconstructs both complete generated assessment
bridges from those templates, using the same typed assessment/container IDs.
The old provisional dimensions must agree with the original iframe's pixel
dimensions or percentage/aspect-ratio attributes. Both graph-editor scripts
must match their unchanged canonical source. The authored script must remain
identical after removing only the exact old generated `window.BOARDID` prelude,
including its position after a leading `use strict` directive.

After those checks, every other normalized frame byte must be equal. The
existing comparator already normalizes random JSXGraph UUIDs and whitespace;
this rule adds no further general noise normalization. MathJax URL/id/async,
other scripts/styles, authored values and frame DOM remain covered by equality.
An added pre-loader is rejected and needs its own future activation review.
The explicit category describes canonical resize/hidden/whole-view bridge
evolution and the generated BOARDID assignment moving into that bridge.

The actual Quarto contract test renders pixel and relative-size boards from
both exact upstream checkouts. Its negative controls change authored values,
bridge/graph code, loader URL/async, pre-loader presence, stylesheet, inner DOM,
IDs, old provisional dimensions, outer geometry, source identity/bytes, dirty
state and ambiguous hash paths. Self-consistent source/hash tampering is also
rejected. No source is evaluated by the comparison code.

The reusable course workflow supplies the verified before source/pin paths,
retains full calibration JSON, and preserves successfully rendered fixtures
even if comparison fails, so browser diagnostics can still run. Every original
comparison assertion remains active. Select this tooling in the separate pin
PR only after independent review; fresh three-course/three-browser results and
the release's separate strict store/quiz/fake-clock gates remain required.
