# Appendix B — Python, Pyodide and plain-text example audit

Independent sub-audit, 18 Oct 2026. Line numbers refer to the audited commits (py-exercise `84c6647`, pyodide-interaktiv `108a8dc`, ctm-assessment `12179c2`, ai-feedback `68abb6d`).

Method: the Python the page runs (`CHECKER_PY`, `RUNNER_PY`) was extracted unchanged from `py-exercise.js` and run with the exercise data from the rendered HTML, in CPython and in real Pyodide 0.27.2 (Node). **CPython and Pyodide graded identically in all 265 cases.** Every activity got 3–4 correct and 3–8 wrong programs; restrictions were probed; every source panel was compared with what is graded (22/22 match); every `{pyodide-python}` cell was executed.

How grading works (context for several findings): each top-level statement below `## TESTS ##` is one "test", run in the learner's namespace; output printed by tests is hidden; packages are loaded only for the learner's imports; no time limit.

## Critical
- **PY-1** Wrong palindrome solution passes (`py-exercise/example-en.qmd:173-178`, ctm `examples/_python.qmd:173-179`; hints hidden): `s=s.lower(); return s[:1]==s[-1:]` gets "All tests passed". **Fixed** (`"abca"` must be False).
- **PY-2** The documented "Full Example" cannot run (`py-exercise/docs/reference.md:216-229`): task text inside the code block becomes starter code → SyntaxError even with a correct `fib`. **Fixed**; a new test compiles every documented starter.

## Major
- **PY-3** "Must be recursive" not checked (`example-en.qmd:141-153`): `math.factorial`, `math.prod(range(...))`, comprehensions pass. **Fixed** (check that `factorial` calls itself on a fresh input; accepts plain/tail/`lru_cache` recursion).
- **PY-4** "Give the task a clear name" shows a caption that never appears (`example-en.qmd:54-61`, `reference.md:43`); `py-exercise.js:391` stores it as metadata only. Docs **fixed**; displaying it is **proposed** (runtime).
- **PY-5** Committed `example-en.html`/`example-mini.html` are stale (20 Aug) and still contain the greeting bug fixed on 16 Oct; authors who "Download ZIP" get them. **Proposed**: `git rm` both, ignore `/*.html`, `/*_files/`, `/_site/`.
- **PY-6** A setup line counts as a passed test (`example-en.qmd:111`): `import math as _math` reported as "✓ Test 1" → untouched starter shows "1 of 4 passed". **Fixed**; a new test forbids top-level imports/assignments/`def` in published tests.

## Minor
- PY-7 ctm price task says "Do not round it" but rounding to 2 decimals passed (`_python.qmd:28,39-41`) — fixed.
- PY-8 headline price example has no check messages ("Assertion failed") (`example.qmd:33-34`, `docs/authoring.md:23-24`) — fixed.
- PY-9 requirements only in `#| task:` or hidden checks, not the visible task (palindrome empty string, `my_sum` empty list, factorial base case, `os` forbidden, no `sum()` in pyodide example) — fixed.
- PY-10 docs overstate restrictions ("Forbidden Python keywords", "safety"): `s = sum`, `getattr(builtins,"sum")`, `eval`, `__import__`, `importlib`, `exec("import os")`, unsupported keywords silently ignored, `yield from`, `async for/with`, `except*`, comprehensions — docs fixed; checker change **proposed** (map `for`→`For|AsyncFor`, `with`→`With|AsyncWith`, `try`→`Try|TryStar`, `yield`→`Yield|YieldFrom`; warn on unsupported names at render).
- PY-11 "Test Output" docs did not match UI — rewritten.
- PY-12 export/download can pair current code with an old result (`py-exercise.js:315-321,503-506`) — **proposed** runtime fix.
- PY-13 `if __name__ == "__main__":` never runs (`_ns = {}` at `py-exercise.js:245`) — **proposed** `_ns = {"__name__": "__main__"}`.
- PY-14 ai-feedback version requirements disagree (docs 0.8.0; code 0.6.0 in `feedback-loader.lua:21`, 0.5.0 in `py-exercise-feedback.js:11`, `qpyodide-feedback.js:19`) — **proposed** (one gate in ai-feedback).
- PY-15 `pyodide-interaktiv/docs/reference.md:550` says default storage `session`; code and line 157 say `local` — fixed.
- PY-16 pyodide marker-cell example uses `np`/`plt` without imports — fixed.
- PY-17 German grammar `_jsxgraph-shapes.qmd:31` ("Schreibe den Namen" for two shapes → "Schreibe die Namen jeweils mit dem bestimmten Artikel") — fixed.
- PY-18 `ctm-assessment/docs/integration-workbench.md` stale ("five functions"; Python on the pinned branch) — fixed.

## Info
- PY-19 umbrella integration test loads `math-exercise.js` without `matrix-input.js` (same as F-01).
- PY-20 ctm `docs/reference.md:92` context-reuse example accepted a hard-coded `return 100` — fixed.
- PY-21 tests share the learner's namespace (`abs = lambda x: 0` passes) — acceptable for a client-side tool.
- PY-22 standalone py-exercise has no time limit (infinite loop freezes the page); packages imported only by tests are never loaded — **proposed** `loadPackagesFromImports(testsCode)`.
- PY-23 `decode.py` undocumented — documented + tested; suggest moving to `scripts/`.
- PY-24 the umbrella builder never runs py-exercise's own tests — **proposed** (adopted in the umbrella PR).

## Confirmed correct
Greeting fix holds (rejects return-only, print-only, `return print()`, double print, hard-coded; accepts f-string, concatenation, `print("Hello,", name+"!")`, `.format`). Manifest pins of the 16 Oct audit hold. Every starter fails at least one check; the two review starters pass as stated. All policy YAML renders and matches the page text (`debug-coach` 2 steps resetting on Check; `debug-walkthrough` 1 step with full solution; A/B pairs identical; Pyodide tab 3 hints). Plain-text starters contain only the intended mistakes (Spanish `vive`, `come`, `rojo`; handwriting `Yo vive`, `Me gusta los libros`; Norwegian `bor der siden to år`); English→Spanish draft valid; German source correct. Pyodide cells print the expected values.

## Coverage
| File | Activities | Run |
|---|---|---|
| py-exercise `example.qmd` + `examples/_feedback-policies.qmd` | price, debug×2, review×2 | rendered; 7–8 variants each, CPython + Pyodide; policies; panels |
| py-exercise `example-en.qmd` | add, square, greet, circle-area, my-sum, factorial, palindrome | 7–12 variants each, both runtimes; bypass probes; panels |
| py-exercise `example-mini.qmd` + committed HTML | add | rendered; embedded data compared |
| py-exercise docs + README | task-1, fibonacci, price-with-tax | scratch page; variants |
| ctm `examples/_python.qmd` | 6 | combined site; 5–11 variants each, both runtimes; panels |
| ctm `_pyodide.qmd`, `docs/reference.md` | 3 cells + tax function | executed; variants |
| ctm `_plain-text.qmd`, `_jsxgraph-shapes.qmd`, `_jsxgraph.qmd`, `_integration.qmd`, feedback YAML | 6 + 1 | language, criteria, geometry; image; integration tests |
| pyodide-interaktiv `example.qmd` + docs | 1 cell + 3 code examples | executed (Agg) |
| ai-feedback `example.qmd` + docs | 1 + 2 | reviewed against defaults and adapters |
