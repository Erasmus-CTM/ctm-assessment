# Appendix A — Mathematics example audit (math-exercise, ctm-assessment)

Independent sub-audit, 18 Oct 2026. Scope: all 129 `math-exercise` blocks at math-exercise `5945f8f` and ctm-assessment `12179c2` (pages, includes, 5 variant definitions = 16 generated variants, every pool task, exercises in the docs guides). Line numbers refer to those commits.

Method: the exact Python bootstrap from `math-exercise.js` was run natively along the browser path (same `parse_expr` transformations, `vars`, response dict shape), with raw strings as a student types them; 66 sampled invocations were repeated on a Node-hosted Pyodide 0.27.2 (SymPy 1.13.3) and matched CPython exactly.

Severity: **critical** = typical answer path of a published example graded wrongly; **major** = less typical correct answer rejected, wrong answer accepted with unusual input, or wrong feedback.

**Root cause of most numeric defects.** Since SymPy 1.13 (both runtimes) `Float(1.0) == 1`, `Float(0.0) == 0`, `Matrix([[0.0]]) == zeros(1,1)` are False, and typed decimals are binary approximations (`-0.3 + 3*0.1 != 0`). Authored tests pass hand-built `Rational`s, never raw strings, so they could not catch this. Fix per checker: `exact = lambda v: v.xreplace({f: Rational(str(f)) for f in v.atoms(Float)})`.

## Previous audit (16 Oct)
Hold: pole/non-real rejection, Newton division by zero, antiderivative residual, region-length checks, period clamping, freehand derivative. Do not hold: "no defect in the 4 graph checkers" (Euler checker wrong, MATH-6). Partly: decimal inputs still misgraded (MATH-1, 4, 5, 17). Not carried over: `examples.qmd:982-989` still sets policy drafts with a page `<script>` (MATH-28).

## Critical
| ID | Where | Defect | Status |
|---|---|---|---|
| MATH-1 | `_includes/custom-assessment.qmd:149-158` `custom-newton-sequence` | x0=1, x1=`1.5`, x2=`17/12` scores 0.667; any decimal x2 fails with false feedback | fixed (exact decimals; rel. err ≤1e-9; prompt asks exact or ≥10 digits; tests) |
| MATH-2 | `math-exercise.js:357,571` (`together()` factors denominators) | `form: single_fraction` rejects `(2x+1)/(x^2+x)` (`sympy-rational`) and `(2x+2y)/(2xy)` (`ex-form-single-fraction`) | example wording workaround fixed; runtime fix **proposed** (`_is_single_fraction`) |
| MATH-3 | `_includes/variants/geometry.qmd:31` | "move P onto the circle" needs ±0.2–0.4 px accuracy | fixed (`|hypot−r| ≤ 0.05` ≈ 4 px; fixtures) |

## Major
| ID | Where | Defect | Status |
|---|---|---|---|
| MATH-4 | `dynamic-matrix-tests.qmd:99,190,220`, column/row-space checkers; ctm `examples/_mathematics.qmd:89`; `docs/assess-basis.md` | basis tasks reject decimal coordinates (null-space (−0.3,0,0.1) scores 0.25) | fixed (`applyfunc(exact)`; tests) |
| MATH-5 | `custom-assessment.qmd:108` | `x^2-0.25` "not monic" | fixed |
| MATH-6 | `_includes/graph-theory-examples.qmd:97-103`, test `jsxgraph-euler-construction.py:9` | C4 + isolated vertex has an Euler circuit but scores 0.5; the test enforced the wrong behaviour | fixed (subgraph of non-isolated vertices; two-triangles still rejected) |
| MATH-7 | `graphics-coordinate-examples.qmd:226,334` | swapping min/max sliders draws the same region but scores 0 | fixed (sort bounds; tests) |
| MATH-8 | `_includes/variants/perpendicular.qmd:33` (4 variants) | accepts `0.0,0.0` (task says nonzero), `cos(1)^2+sin(1)^2-1,0`, complex, symbolic; rejects `-0.1,0.3` for (3,1) | fixed (exact, real/finite, `.is_zero`; "real" in prompt; 5 fixtures/variant) |
| MATH-9 | `examples.qmd:82-90,892-911`; `docs/reference.md:258-267` | "2 decimal places" accepts 3.15 for π (tolerance 0.01); guide claims only 3.14 | fixed (`tolerance: 0.005`, exact keys, corrected text) |
| MATH-10 | built-in modes; legend `math-exercise.js:6,53,100`; `reference.md:848` | `diff(...)`, `integrate(...)`, `expand(...)`, `factor(...)`, `sqrt(72)`, `sin(pi/6)` are graded correct; legend advertises `diff`/`integrate` | mitigation (`reject:` on trig identity); **proposed** `forbid-calls` option + legend change |
| MATH-11 | `math-exercise.js:315` `_FRAC_RE` | `form: lowest_terms` bypassed by `84/(126)`, `(84)/126` | **proposed** (runtime diff, tested) |
| MATH-12 | `examples.qmd:66-75`, `basic-features.qmd:87-92` | `reject` examples accept other unexpanded forms (`(-x-1)^2`, `x(x+2)+1`); prompt said "Simplify" | prose fixed; **proposed**: run `reject` before `form` (today unreachable when combined) |
| MATH-13 | `_includes/ai-feedback.qmd:61-67` | Newton update "as a function of x_k" rejects answers in `x_k` | fixed (prompt says type x for x_k) |

## Minor
- MATH-14 factored-form check rejects `-x(2-x)(x+2)`, `(-x-1)(-x-2)` — **proposed** (irreducibility via `factor_list`).
- MATH-15 set partial-credit formula documented as `2M/(E+S)`, code computes `max(0,M−(S−M))/E` — docs fixed.
- MATH-16 antiderivative feedback says any constant allowed while `+C` is rejected — fixed + test.
- MATH-17 `3.0` rejected in Pythagorean and SL2 tasks — fixed.
- MATH-18 zero-matrix example rejects `0.0` (`dynamic-matrix-tests.qmd:349`) — fixed.
- MATH-19 `assess_basis` colours a typed `0.0` column "dependent" instead of "zero" (`math-exercise.js:458`) — **proposed**.
- MATH-20 pooled maxima: the right endpoint is a local maximum by the stated definition — text now asks for interior crests.
- MATH-21 unanswerable/ambiguous prompts (`ex-numeric-sig`, `nb-blandede-felt`, rotation direction in `nb-numerisk-matrise`, sign of "difference" in `basic-labels`) — fixed.
- MATH-22 `e` parsed as a symbol (`e^x` graded wrong) — **proposed** UX change.
- MATH-23 stray `#|` in sample (`dynamic-matrix-tests.qmd:53`); assess-basis row sample lacked real/finite check — fixed.
- MATH-24 `xsin(x)` → `x*s*i*n` — hint **proposed**.

## Info
MATH-25 native tests bypass the parser (propose a `respond(*raw)` helper); MATH-26 15-digit decimals accepted for 2/3 in equivalent mode; MATH-27 fragile `string_ci` answer in `ex-context-explicit`; MATH-28 policy drafts set by page script; MATH-29 piecewise-linear checker has no finiteness check (harmless); MATH-30 dynamic-matrix syntax sample states no task; MATH-31 JSXGraph JS traced by reading (CDN unreachable locally), slider targets lie on snap grids.

## Coverage
158 built-in answer keys accepted by their own mode; ~450 raw-string probes; all answers recomputed independently (mini-machine decodes/encodes, two's complement of −5, six triangle ratios, sinusoid maxima and endpoint slopes, null/eigen/polynomial dimensions, Hessian, solenoid inductance, 3-4-5 geometry). Variant fixtures 46 → 70.

| File | Exercises |
|---|---|
| `examples.qmd` | 27 |
| `_includes/basic-features.qmd` | 8 |
| `_includes/sympy-examples.qmd` | 18 |
| `_includes/ai-feedback.qmd` | 6 |
| `_includes/custom-assessment.qmd` | 5 |
| `_includes/graph-theory-examples.qmd` | 4 |
| `_includes/graphics-*.qmd` | 8 |
| `_includes/variants/*.qmd` | 5 definitions / 16 variants |
| `vector-matrix-tests.qmd` | 13 |
| `dynamic-matrix-tests.qmd` | 11 |
| docs guides | 13 |
| `example.qmd`, `nb-render.qmd` | 2 |
| ctm-assessment | 9 |
