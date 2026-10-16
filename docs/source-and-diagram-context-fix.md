# Copyable source and diagram context correction

Approved by AC on 16 October 2026, with the clarification that starting values
are exceptional. Ordinary exercises remain empty; no unrelated activity gains
a starting answer.

## What changed

- The eight existing, explicitly drafted math activities declare optional
  `initial-values` in their Quarto blocks. Their answer keys are unchanged.
  The page-wide initializer and its repeated HTML/script source are removed.
- Each JSXGraph source panel now contains one complete diagram/task example,
  read verbatim from its authored include. It includes the registration and
  context reference needed to reproduce the applet and feedback connection.
- Explicit `jsxgraph:diagram-id` references attach the live board image and
  JSON state as context. The scalar or German writing response remains the
  learner's answer. Text-only context and `context: none` retain their behavior.
- Copy mode exposes the diagram image with a download link so it can accompany
  the prompt in chat. API mode sends the image directly as a context attachment.

## Validation

The source-copy test actually renders all eight copied math examples and the
complete language/applet example on a separate Quarto page. It initializes the
real math runtime and verifies declared drafts, unchanged answer keys, both
iframes and a separate ordinary exercise with empty fields and no draft option.
All ten integration scenarios passed. Math tests: 96 JavaScript and 14 Python
variant tests passed, including the new standalone copy/default regression.
AI Feedback: all 58 tests passed, including actual request roles and image
content, changed-state stale-response handling, duplicate references, invalid
iframe replies, missing boards, oversized state and copy-mode image links.

The expanded real-browser check requests both mathematics and German feedback,
inspects the outgoing multimodal request, and changes the actual triangle board
to prove the exported state changes. It also verifies the copy-mode image link.
Its CI result is recorded in the PR; a local Chromium run is unavailable in this
sandbox. No live AI provider is called: the browser uses an intercepted provider.

Use AI Feedback 0.7.0 and math-exercise 0.8.0, pinned by the assembly manifest.
Review/merge shared feedback, mathematics, this assembly, then the demo pins.
No workflows or permissions change. The separate open WebAgg/Pyodide migration
is outside this correction.

Agent: Codex. Model: gpt-6.1-sol.
