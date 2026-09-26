# Download an example to edit

To try the activity first, [open the rendered examples](https://erasmus-ctm.github.io/ctm-assessment/example.html). 

[Example source — download and open in your editor](https://github.com/Erasmus-CTM/ctm-assessment/blob/feature/scoped-policies/example.qmd).
On GitHub, select **Download raw file**. Open the saved file in your editor;
**VS Code** is one option for editing Quarto documents.

## Keep the accompanying files

This page includes material from other files. For a complete copy, open the
[example branch](https://github.com/Erasmus-CTM/ctm-assessment/tree/feature/scoped-policies), choose
**Code → Download ZIP**, extract it, then open the extracted folder in your editor.

Keep `examples/` and `feedback/` beside the page. They contain the included tasks
and named feedback instructions. Keep `_filters/` too if you want the expandable
source panels shown in the demonstration. Keep `assets/` and `feedback.yml` too.
A ZIP download is suitable for editing and copying activities. To rebuild the
complete demonstration site, use a Git clone instead, because the builder records
the checked-out revision:

```sh
git clone --branch feature/scoped-policies https://github.com/Erasmus-CTM/ctm-assessment.git
cd ctm-assessment
```

Then follow the [site build instructions](development.md#development-and-validation).
For your own course page, copying one activity from its source panel is a simpler
starting point.

You can instead copy one activity from a rendered source panel into your own
course page. If it selects a named feedback policy, copy that policy's YAML too.

[Installation and setup](installation.md) · [Authoring guide](authoring.md)
