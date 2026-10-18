# Upstream Quarto issue: ready to file

File at <https://github.com/quarto-dev/quarto-cli/issues/new/choose> and pick the **Bug report** template. Paste the title and the body below into the template's fields.

---

**Title**

Fenced block `{math-exercise}` (hyphenated class) is detected as language `math` and sends the page to the Jupyter engine (regression since 1.8)

**Body**

### Bug description

Filter extensions commonly use braced code blocks whose name contains a hyphen, such as `{pyodide-python}` (coatless-quarto/pyodide), `{math-exercise}` and `{py-exercise}`. These are not executable cells: a Lua filter turns them into HTML.

Up to Quarto 1.8.27 such pages use the markdown engine. In 1.10.19 the same page is sent to the Jupyter engine. Without Jupyter installed, the render fails:

```
ModuleNotFoundError: No module named 'nbformat'
Jupyter is not available in this Python installation.
```

The cause seems to be the new chunk regex in `languagesWithClasses` (`src/core/pandoc/pandoc-partition.ts`):

```
/^[\t >]*```+\s*\{([a-zA-Z][a-zA-Z0-9_.]*)([^}]*)?\}\s*$/gm
```

The language group stops at the hyphen, so `{math-exercise}` yields the language `math`, with `-exercise` treated as attributes. `math` is not a handler language, so `markdownExecutionEngine` chooses Jupyter.

The 1.8.27 regex `\{([a-zA-Z0-9_]+)( *[ ,].*)?\}` required a space or comma after the name, so it did not match at all.

### Steps to reproduce

`page.qmd`, with no extensions, no `_quarto.yml` and no Jupyter installed:

````markdown
---
title: test
---

```{math-exercise}
print(1)
```
````

Run `quarto render page.qmd`.

### Expected behavior

The page renders with the markdown engine, as in 1.8.27. The block is left for filters, or shown as a code block.

### Actual behavior

The Jupyter engine is selected and the render fails, with the error shown in the bug description, whenever Jupyter is not installed. The same happens with `{pyodide-python}` and `{py-exercise}`.

Setting `engine: markdown` in the page's front matter avoids it. Setting it in `_quarto.yml` does not.

### Your environment

- Linux (Ubuntu 24.04).
- Quarto 1.8.27 works; Quarto 1.10.19 fails. Versions in between were not tested.

### Quarto check output

(Paste the output of `quarto check` from the machine you file from.)

Suggested fix: let the language group stop only at whitespace, `.`, `,` or `}`; or require the attributes group to start with whitespace or a comma, as in 1.8.

---

## Notes for AC

- Before filing, search the open issues for "hyphen" or "pyodide-python jupyter", in case it was reported after 18 October. The search API is not reachable from this session.
- The coatless-quarto/pyodide and quarto-live users are affected too. Linking the issue in their trackers helps it get attention.
- Until it is fixed: CTM pages need `engine: markdown` in each page's front matter, or Jupyter installed, to render with Quarto 1.9 or later. Exactly where the regression starts between 1.8.27 and 1.10.19 is not established.
