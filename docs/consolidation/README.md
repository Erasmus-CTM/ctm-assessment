# Consolidation, October 2026

The work log of the consolidation decided after the October 2026 audit
([audit report §5b](../audit-2026-10/README.md)): one internal library
`ctm-libs` (the renamed ai-feedback repository, feedback folded in), the Python
checker library `ctm-checkers`, and CTM Assessment as the one product authors
install. Branch `consolidation/2026-10` in every repository; pull requests are
merged by AC.

| Step | What | Design | State |
|---|---|---|---|
| 1 | ctm-libs: runtime, locator, settings reader, locale, feedback folded in; A1–A7, P19, P22; cacheable scripts; Pyodide 0.28.3; versioned releases | [2026-10-step1.md](2026-10-step1.md) (reviewed; amendments in §16) | implementing |
| 2 | ctm-checkers extraction; stack-sympy audit alongside | — | — |
| 3 | pyodide-interaktiv onto ctm-libs (working branch) | — | — |
| 4 | UI: saved answers, progress, quizzes (P17); Markdown reveals, modes, figures (P18) with the course migrations; languages (P21) | — | — |
| 5 | Worker for standalone pages (P13), preload and status lamp (P16) | — | — |

## Log

- **19 Oct.** Audit round merged; all `main` builds green. ai-feedback renamed to ctm-libs (by AC). Step 1 design written and independently reviewed: one blocking finding (re-pinning refuses the JSXGraph fork pin; `--update-pins --only` added to the plan) and six to fix, all taken into the design (§16). Open questions settled there: the catalogue owns all interface strings; a component's own spelling of a shared key stays a legitimate override; `metadata-files` keeps working as the lowest level; the example site keeps deploying from `main`; the feedback interface strings are generated from the catalogue in step 1. A component without the package stops the render (decision C); component CI builds with `CTM_COMPONENT_DEV=1`.
