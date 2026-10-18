# Appendix D — Where Python can be supplied, and the safeguards

This appendix answers AC's item 7, from 18 October 2026.

**The minimum asked for:** code from one place must not break another CTM component on the same page. That is now enforced and tested.

**What was out of scope:** protection against a determined learner. Grading happens in the learner's own browser, so such protection is impossible. All code below runs in the learner's browser, in Pyodide (WebAssembly). It cannot reach a server or other users. The risks are:
- breaking the page's other components (accidental or not);
- cheating on one's own grade;
- freezing the tab.

## Entry points

| # | Who supplies the Python | Where it runs | Before this round | Now |
|---|---|---|---|---|
| 1 | Learner, py-exercise editor | `exec` in the shared interpreter | Learner code ran in a fresh dict. But the runner itself wrote `ast`, `json`, `io`, `sys`, `traceback`, `_results`, `_ns`, the task's tests and the forbidden-word lists into the **globals that pyodide-interaktiv cells use as a notebook**. That overwrote the learner's own variables, for example `json = 5` in a cell. | Runner, checker and encoder are a private module (`_ctm_py_exercise`). The request is passed as one JSON string and popped at once. Each Check runs the program in a fresh namespace. **Verified:** isolation tests (`tests/test_isolation.py`), the jsdom module protocol. |
| 2 | Learner, py-exercise | same | `import builtins; builtins.len = …`, `sys.stdout = None`, `sys.setrecursionlimit(50)` or `del sys.modules[...]` stayed in effect for every later check, every math check and every Pyodide cell. | `_ctm_guard` (shared `pyodide-runtime.js`) snapshots builtins, the standard streams, the display and except hooks, the recursion limit, `sys.path`, the working directory and the `_ctm_*` modules before a check, and restores them after. `sys.exit()` is reported, not raised. **Verified:** isolation tests. |
| 3 | Learner, math-exercise answer field | SymPy `parse_expr`, which **evaluates Python** | An answer such as `__import__('builtins').__dict__.clear()` was executed. | Answers containing `__` are rejected before parsing, which is never needed in mathematics. Every check runs inside the guard. **Verified:** the real browser setup replayed in CPython (`tests/runtime-isolation.test.mjs`). |
| 4 | Learner, pyodide-interaktiv cell | the shared interpreter | By design, a notebook: shared state across cells. It could rebind SymPy names (fixed earlier, F-04) or delete the CTM modules. | The cells stay a notebook, so state is shared on purpose. If a cell deletes `_ctm_math_exercise` or `_ctm_py_exercise`, the next Check installs the module again. The guard restores the `_ctm_*` modules after each check. |
| 5 | Author, math-exercise custom checker (`#| checker:`) | the module, inside the guard | Trusted author code. It ran against the page's `__main__`. | It runs in the checker module's globals. Names from Pyodide cells are no longer visible to checkers; this goes in the release note. The guard protects other components from checker side effects. |
| 6 | Author, py-exercise tests, `#| packages:` | same as row 1 | Trusted. | Unchanged. The tests are part of the page; see "Limits". |

## Endless loops and huge computations

These include `while True: pass` and an answer such as `9**9**9**9`.

- **Python in a worker** (pyodide-interaktiv on the page). A check running longer than `stop-after` seconds (default 20; configurable per component or for all components with `ctm-assessment: stop-after:`) shows "Still running… **Stop**". Stop restarts Python for the whole page, and the learner is told that interactive cells lost their variables. A stop from any component counts page-wide: no check is repeated or shown as an error because of it. AC chose this: no automatic kill, because a good default timeout cannot be chosen across devices.
- **Python on the page itself** (standalone py-exercise or math-exercise). The tab freezes until it is reloaded. No JavaScript can run, so no button can appear. Proposal P13 (run the shared runtime in a worker) removes this.

## Limits (documented in each component's reference)

- **Cheating on one's own grade is possible.** The tests and expected answers are in the page source, and learner code runs in the same interpreter as the grader. A determined learner can read the tests, define names the tests use, or replace the checker module. Use client-side grading for practice, not for high-stakes assessment. Server-side grading (stack-sympy/STACK) is the place for that.
- **The guard covers interpreter-wide state, not monkey-patching of library internals.** For example, `json.dumps = None` patched inside the `json` module. The CTM modules bind what they need when they are installed, so such patches do not reach them. Learner code that patches SymPy itself affects that learner's math checks until a reload.

## Not changed (for the team members maintaining pyodide-interaktiv)

- Keyboard shortcuts: Ctrl/Cmd+Enter and Shift+Enter are now limited to each extension's own editors through Monaco context keys. This was fixed in both repositories.
- pyodide-interaktiv's own cells have no guard. That is intended, since they are a notebook.
