# D5 — Accessibility

**Verdict:** the controls have useful keyboard/live-region foundations, but ordinary scalar math inputs lack accessible names. The consumer Cosmo theme also fails normal-text contrast on active primary buttons. Automated checks do not establish screen-reader usability.

Executed `code/accessibility.py` using axe-core 4.14.0, system Chromium, Quarto 1.8.27, and exact pinned extensions. Combined English and Norwegian fixtures were independently rendered. Four actual freehand pages were rendered from commit `2803b6b6ab3b9a936d03a7985693a97763cf7f4f`. External requests were refused for this DOM/keyboard/contrast audit: it does not establish remote math/plot readiness. Raw element observations stay outside the repository.

| Rendered page | axe rules passing | Violations (affected visible elements) | 390 px horizontal overflow |
|---|---:|---|---|
| Combined en | 26 | `label` (1) | none |
| Combined nb | 26 | `label` (1) | none |
| freehand logarithms-ai en | 30 | `label` (3), `color-contrast` (3), `aria-allowed-attr` (1) | none |
| freehand handwriting-ai en | 33 | `label` (3), `color-contrast` (4), `aria-allowed-attr` (1) | none |
| freehand logaritmer-ki nb | 32 | `aria-allowed-attr` (1) | none |
| freehand handskrift-ki nb | 34 | `color-contrast` (2), `aria-allowed-attr` (1) | none |

These are rule/node counts, not test-suite pass counts. Hidden content is excluded by axe. The consumer English/Norwegian pages are distinct authored fixtures, including different math-feedback settings; their counts do not establish a language-caused difference. axe's `critical` label impact is not the audit's severity rubric.

## UX-1 — Math inputs have no accessible name

**Medium; verified.** math-exercise `_extensions/math-exercise/math-exercise.lua:339` emits scalar `input`/`textarea` without label/aria-label/aria-labelledby. The equivalent runtime renderer `math-exercise.js:251` repeats it. Even freehand's explicit `field-labels: Derivative` reaches data/feedback metadata (`math-exercise.lua:891`, `:1018`; JS `:1058`) rather than the input's accessible name. axe identifies `#math-exercise-1-f1` on both combined language pages and all six visible English freehand math fields. Adjacent prose is not a programmatic label.

Impact: a screen-reader user navigating form fields cannot reliably distinguish requested quantities. Proposed fix: associate author field labels with input IDs in both renderers, provide localized question/field fallbacks and matching matrix row/column labels. Reproduce with `python code/accessibility.py`; use `code/release/render-combined.py` first. Math-exercise Lua/JS changes alone are outside the current eight-file P13 inventory and its libs/IDE application_refs; a shared-library or IDE repin would require matching reviewed lock/receipt refs. Assess the intended whole-site approval scope rather than assuming all runtime-renderer files are currently bound.

## UX-2 — Consumer primary buttons fail contrast

**Low; verified; consumer/theme composition.** freehand `_quarto.yml:49` selects Cosmo; rendered primary blue `#2780e3` with white normal 14.875 px text yields **3.97:1**, below 4.5:1. This affects math Check and consumer sample-loader buttons. It is not evidence that every CTM theme fails. Select/override an accessible primary color and repeat axe on enabled/hover/focus/disabled states. Reproduce on the four consumer pages using `--site` and `--paths` options. Consumer CSS/theme changes do not touch the P13 lock.

## Controls and remaining limits

- Captioned math cells start collapsed. Their authored heading toggle has `role=button`, tabindex=0 and aria-expanded (`math-exercise.lua:947`), and Enter/Space update expanded/hidden state (`math-exercise.js:1203`). This explains why a question can initially be invisible; captions should signal that expansion is needed. Keyboard screen-reader announcement quality remains unverified.
- Dynamic matrices have localized accessible row/column names and size controls in ctm-libs `ui/ctm-matrix-input.js:37`, `:196`; fixed matrix renderers `math-exercise.js:261`/Lua `:352` omit names similarly to UX-1. Source review is plausible for fixed-matrix impact; axe reproduction here is scalar only.
- Similar practice exposes a named panel and role=status (`math-similar.js:199–204`), focuses the first new input (`:1020`), restores focus after deletion (`:1349`), and supplies a keyboard return target. Its own controlled Playwright cases are recorded in the master suite table. This is not an independent screen-reader acceptance run.
- Combined tabs had one selected tabindex=0 tab and inactive tabindex=-1 tabs with aria-controls. Feedback/runtime outputs include polite/status regions. The 16-step Tab observation and mobile widths are saved by the harness, not proof that every control can be operated without a pointer.
- Source panels in both filters use native details/summary (`freehand/_filters/example-source.lua:13`), preserving keyboard disclosure. The separate **Quarto collapsed callout** header has aria-expanded on a generic nonfocusable div: axe reports `aria-allowed-attr`. This is generated upstream callout markup, not the source-panel details implementation; report it upstream or choose a keyboard-accessible disclosure template. Do not misattribute it to the source-filter escaping path.
- Screen-reader speech, touch interaction, high-zoom/forced-colors, all matrix sizes and live AI-generation focus sequences were not independently accepted with assistive technology. No accessibility certification is implied.
