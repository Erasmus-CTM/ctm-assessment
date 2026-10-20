# Build a practice page

Start with a learning goal small enough for a student to attempt in a few minutes.
A useful page might ask students to calculate a price, explain their reasoning,
and then write a short program for the same calculation.

## Choose an activity

| What students should do | Start with |
|---|---|
| Write, translate or discuss a picture | Text and image activities |
| Enter an expression or a numerical answer | Mathematics |
| Complete a function and check its behavior | Python exercises |
| Experiment with code and examine the output | Python exploration |
| Interpret or manipulate a diagram | JSXGraph examples |

[Try the combined examples](https://erasmus-ctm.github.io/ctm-assessment/example.html).
Open the source beneath a useful activity and copy it into your Quarto page.
Change the question, starting answer and checks together.

## Make the first attempt worthwhile

Give students a partly finished response or a plausible mistake to investigate.
Ask them to predict an outcome, explain a choice or compare two approaches.
Avoid a starter whose only challenge is guessing what the author intended.

## Decide how much help to offer

The mathematics examples show the same problem with a guiding question and a
worked explanation. Use the first during practice and the second when reviewing
an attempt. A feedback policy is simply a named set of instructions for this
kind of help. Keep those instructions in a YAML file, then select the name in
an exercise. [Learn how to choose and reuse feedback instructions](https://github.com/Erasmus-CTM/ctm-libs/blob/main/docs/authoring.md#choose-the-kind-of-help).

## Show explanations step by step

Hide what students should try first, in plain Markdown:

```markdown
::: {.reading-step title="Gå i dybden: skaler uten å dreie"}
The worked explanation: text, maths, code cells, exercises, even headings.
:::

::: {.hint title="Hint for problem 1"}
A nudge.
:::

::: {.solution}
The worked solution.
:::

::: {.details title="SciPy lookup: calls and results"}
Material that stays closed until opened.
:::
```

Each block is closed until a student opens it. Without `title`, a block
shows its kind in the page's language ("Gå i dybden", "Løsningsforslag",
"Hint"; give a `.details` a title that says what it holds). The title is
Markdown; write a TeX backslash twice there: `title="$\\mathbf{A}$"`.

A page with `.reading-step` blocks gets a **lecture/reading switch** at the
top ("Forelesning" / "Gå i dybden"; in English "Explore" / "Go deeper"):
lecture closes the reading steps, reading opens them all, and the choice
lasts while the student stays in the course. Put `::: {.modes}` and `:::` on
two lines where the switch should go instead, or set
`ctm-assessment: modes: false` to leave it out.

**Links into tabs and reveals.** A link to a heading, an anchor
(`::: {#name}` and `:::`) or an exercise inside tabs or a closed block opens
them, from the same page or another one. Quarto drops the ids of tab
headings themselves; to link to a tab, add this line to `_quarto.yml` once:

```yaml
filters:
  - path: _extensions/ctm-assessment/tab-ids.lua
    at: pre-ast
  - ctm-assessment
```

Then `## 3.5 Polynomer {#uke3-del5}` in a tabset is a link target too.

**Embed a page** (an applet, a visualisation) with
`::: {.embed src="../assets/visualizer.html" title="What it shows" height="920px"}`
and `:::`; the title names it for screen readers.

Write these forms rather than HTML (`<details>`, `<summary>`, `<iframe>`,
`<div id="…"></div>`): `ctm-assessment: markdown-lint: true` names any raw
HTML that has a Markdown form, when the page renders.
[More detail](reference.md#reveals-the-switch-and-links-into-tabs).

## Adapt an example

- [Writing and images](https://github.com/Erasmus-CTM/ctm-libs/blob/main/docs/authoring.md)
- [Mathematics](https://github.com/Erasmus-CTM/math-exercise/blob/main/docs/authoring.md)
- [Python exercises](https://github.com/Erasmus-CTM/py-exercise/blob/main/docs/authoring.md)
- [Python exploration](https://github.com/Erasmus-CTM/pyodide-interaktiv/blob/feature/shared-feedback-integration/docs/authoring.md)

## Try the page as a student

Make a plausible mistake. Check or run the work, request feedback, and ask:
does this help a student make the next decision? Try a correct answer too.
Feedback should acknowledge successful work instead of inventing something to fix.

[Setup](installation.md) · [Detailed options](reference.md) · [Project overview](../README.md)
