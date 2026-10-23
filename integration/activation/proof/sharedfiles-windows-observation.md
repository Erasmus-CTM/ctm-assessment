# SharedFiles observation and evidence limit

The unchanged `tests/test_sources.py` file was run locally on Windows during
activation preparation. After setting a writable workspace TMP/TEMP, its full
23-test invocation reported three subtest failures and two errors. The separate
17-test `SourceSelection` class passed. No base-revision reproduction was run,
and no complete standalone failure log was saved. This note records the tool
output observation; it is not a substitute raw log or a claim that baseline CI
was independently reproduced.

The reported errors were `SharedFiles.test_identical_copies_pass` and
`SharedFiles.test_following_branches_a_copy_may_equal_the_pinned_canonical`.
Three `test_retired_copies_fail_everywhere` subtests failed before reaching their
expected retired-copy message. The earlier bootstrap-byte check reported
canonical digest prefix `951ca0d1623f` versus fixture record prefix
`733eb0257a15`.

The fixture writes `-- canonical\n` using `Path.write_text` but computes its
expected hash from literal LF bytes. Windows text translation explains the
observed mismatch; that explanation was source-inspected, not confirmed by a
separate baseline run. No production bootstrap source, fixture assertion or
validation gate was changed or waived. These observations do not establish a
passing whole-file test run. The final coherent demo acceptance remains pending.
