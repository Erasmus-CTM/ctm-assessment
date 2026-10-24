# Native authored recipes in grading parity

The first complete math32 run with the shared-pool harness,40012628889 at
62161539, graded 1633 head responses and found 267 differences: 262 cases only in
the base's retired legacy authoring page and five new native authored source
rows. There were zero ordinary-page difference paths, missing results, timeouts
or harness errors. The five native rows failed because the old ordinary-source
runner first needed PyYAML; they were unresolved native recipes, not ordinary
questions. Artifact 12526783993 was downloaded and verified against SHA256
5f4ac2fe05fc705490abe9996bd689bfa485390bcdf9d40610a79b85fdcf782e.

The new helper uses the installed verified component's canonical discovery and
read-only file `resolve` command. It checks source bytes, original manifest
lease/history, complete tested retained records and their contextual projections.
Its bounded sidecar preserves file/label/source SHA256 and exact resolved options,
teacher inputs and context. It makes no approvals or history writes. In Pyodide,
the canonical checker wheel decodes each context and runs the mandatory raw
teacher vector, per-field teacher checks and every authored case. Native rows
retain per-candidate identity, hash and outcome receipts. Missing source-bound
receipts or inconsistent context/options are errors, never skipped questions.

Focused actual Pyodide 0.28.3 proof grades 16 contexts across all five manually
migrated types: 16 teacher vectors and 56 authored cases pass. SourceSHA, contextual
projection and option projection tampering each reject with a nonzero result.
A wrong positive-sum teacher is rejected by the real checker even when that
source's newly added case is explicitly expected in the build comparison.
That last control caught an inherited exit bug: authored failures appeared in
the report but were omitted from the final exit condition. The exit condition
now includes authoredFailing; the preserved negative report previously exited 0
and the corrected run exits 1 with authoredNotPassing=1. No failed authored result
can be hidden by a declared case addition.

Expected differences gain an optional `onlyIn: base|head` restriction. Exact
case/path additions or removals cannot waive changed outcomes on cases present
in both builds. Required entries still become stale when absent. The proposed
math migration inventory contains exact IDs and directions for the 262 verified
retired legacy cases and five new source rows; it covers no ordinary grading
change. Source/adapter/direction checks pass 7 with zero skips. Full required
math parity still has to pass on the composed published heads; this bounded
proof is not full-site or first-visit browser acceptance.
