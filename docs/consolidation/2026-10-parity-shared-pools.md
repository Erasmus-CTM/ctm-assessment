# Parity harness: shared pool dependencies

The math32 parity job120601124509 at dc052637 stopped before head grading:
the harness omitted the page's canonical chooser/store dependencies. It did not
report a grading difference. The loader now admits only the actual rendered
`ctm-layout`, `ctm-locale-ui`, `ctm-store` and `ctm-variants` identifiers, retaining
HTML document order and excluding unrelated dependencies.

The complete jsdom document starts at `interactive`, before window.load, so
parsed-content layout setup runs synchronously without sealing initial UI
registration. Standard host TextEncoder/TextDecoder supply the browser APIs
that jsdom lacks. Shared ordinary pools use their positive numbered deep link;
legacy pools keep the positional session key. Generated choices use the actual
component selectVariant API and verify the resulting exact ID.

Focused checks: six parity adapter/source tests passed with zero skips. A real
two-task ordinary pool built with math base6b6e4d35 and headdc052637, identical
reviewed libs/checker sources, passed under actual Pyodide0.28.3 (Python3.13.2,
SymPy1.13.3): twelve responses per build, two variants, zero differences,
missing results, timeouts, harness errors or incorrectly graded keys. Pyodide
mpmath/SymPy/NetworkX wheels matched the npm lock's SHA256 values.

This is a bounded real-engine regression, not a full-site parity result or
first-visit browser acceptance. The required full parity workflow remains
strict. No expected-difference waiver or grading assertion was changed. Raw
focused reports, initial fixture/lifecycle failures and source-test logs are
retained under work/parity-focused in the execution evidence archive.
