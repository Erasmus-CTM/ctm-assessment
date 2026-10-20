"""tools/migrate-course-html.py: a course's raw HTML to CTM Assessment's Markdown forms, and the lint."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest
import unittest.mock

SCRIPT = Path(__file__).resolve().parents[1] / 'tools/migrate-course-html.py'
QUARTO = shutil.which(os.environ.get('QUARTO_BIN', 'quarto'))
# ctm-libs' extension folder: the tool reads includes with its rule
# (tools/source-files.lua); setup-feedback-integration.py --test sets it.
LIBS = os.environ.get('CTM_LIBS_EXTENSION')
STEP4_COURSE = Path(__file__).resolve().parents[1] / 'integration/step4-course'


def load():
    spec = importlib.util.spec_from_file_location('migrate_course_html', SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


QUARTO_YML = '''project:
  type: website

lang: nb

filters:
  - ctm-assessment

website:
  title: "Kurs"

format:
  html:
    theme: cosmo
    css: styles.css
    include-after-body:
      - _includes/site/tab-links.html
      - _includes/site/learning-mode.html
'''

WEEK = '''<div class="learning-mode" data-learning-mode data-reading-label="Gå i dybden" role="group" aria-label="Velg lesemodus">
<button type="button" data-mode="lecture" aria-pressed="true">Forelesning</button>
<button type="button" data-mode="reading" aria-pressed="false">Gå i dybden</button>
<span role="status" aria-live="polite"></span>
</div>

::: {.panel-tabset}

## 5.0 Hva overlever?

<div id="uke5-start"></div>

Tekst.

<details class="reading-step">
<summary>Gå i dybden: $\\mathbf{A}\\,x$ og "sitat"</summary>

Innhold med $x$.

```python
<details>
<summary>Kode, ikke HTML</summary>
</details>
```

</details>

<details class="learning-hint">
<summary>Hint til oppgave 1</summary>

Et hint.
</details>

<details class="reading-step">
<summary>Gå i dybden: `float`, $Q^TQ$ og flyttall</summary>

Kode og matematikk i tittelen.

</details>

1. Et punkt
   som fortsetter.
<details>
<summary>Valgfri fordypning</summary>

Fordypning.

</details>

<details class="solution-block">
<summary>Løsningsforslag</summary>

Løsningen.

</details>

<details class="reading-step">
<summary>Gå i dybden</summary>

Ytre.

<details>
<summary>Indre</summary>

Indre tekst.
</details>

</details>

<iframe src="../assets/vis.html" title="Et forsøk" loading="lazy" style="width:100%;height:920px;border:1px solid #d4e0e7;"></iframe>

<!--
<details class="reading-step">
<summary>I en kommentar</summary>
</details>
-->

    <details>
    indented code after a blank line

<details open>
<summary>Åpen</summary>

Står åpen.

</details>

<details class="fancy">
<summary>Ukjent klasse</summary>
</details>

<iframe src="x.html"></iframe>

:::
'''

INTRO = '''Explore a direction.
Use the tabs.

<div class="learning-mode" data-learning-mode data-reading-label="Go deeper" role="group" aria-label="Choose reading mode">
<button type="button" data-mode="lecture" aria-pressed="true">Explore</button>
<button type="button" data-mode="reading" aria-pressed="false">Go deeper</button>
<span role="status" aria-live="polite"></span>
</div>

<details class="solution-block">
<summary>Løsningsforslag</summary>

On an English page the title stays.

</details>
'''


@unittest.skipUnless(QUARTO and LIBS, 'Quarto and CTM_LIBS_EXTENSION (setup-feedback-integration.py --test sets it) are needed')
class Migrate(unittest.TestCase):
    def setUp(self):
        self.module = load()
        self.dir = Path(tempfile.mkdtemp(prefix='migrate-'))
        self.addCleanup(shutil.rmtree, self.dir, True)
        files = {
            '_quarto.yml': QUARTO_YML,
            'pages/uke5.qmd': '---\ntitle: "Uke 5"\n---\n\n{{< include ../_includes/uke5.md >}}\n',
            '_includes/uke5.md': WEEK,
            'pages/intro.qmd': '---\ntitle: Intro\nlang: en\n---\n\n{{< include ../_includes/intro.md >}}\n',
            '_includes/intro.md': INTRO,
            '_includes/unused.md': '<details>\n<summary>Not shown by a page</summary>\n</details>\n',
            'pages/setup.qmd': '---\ntitle: Oppsett\n---\n\n{{< include ../_includes/setup.md >}}\n',
            '_includes/setup.md': '<!--\nThe switch sits here.\n-->\n\n' + WEEK.split('\n\n', 1)[0] + '\n\nTekst.\n',
            '_includes/site/tab-links.html': '<script></script>\n',
            '_includes/site/learning-mode.html': '<script></script>\n',
            'README.md': '<details>\n<summary>Readme</summary>\n</details>\n',
        }
        for name, text in files.items():
            (self.dir / name).parent.mkdir(parents=True, exist_ok=True)
            (self.dir / name).write_text(text, encoding='utf-8')

    def run_tool(self, *args):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            status = self.module.main(['--project', str(self.dir), '--format', 'text', *args])
        return status, out.getvalue()

    def read(self, name):
        return (self.dir / name).read_text(encoding='utf-8')

    def test_converts_reveals_anchors_embeds_and_the_switch(self):
        status, out = self.run_tool()
        self.assertEqual(status, 0, out)
        week = self.read('_includes/uke5.md')
        # The switch starts its file: removed (the page places it at the top).
        self.assertTrue(week.startswith('::: {.panel-tabset}\n'), week[:200])
        self.assertNotIn('data-learning-mode', week)
        self.assertIn('\n::: {#uke5-start}\n:::\n', week)
        # Titles: backslashes doubled and quotes escaped (Pandoc reads attribute values with escapes).
        self.assertIn('::: {.reading-step title="Gå i dybden: $\\\\mathbf{A}\\\\,x$ og \\"sitat\\""}\n', week)
        self.assertIn('::: {.hint title="Hint til oppgave 1"}\n\nEt hint.\n:::\n', week)
        # Inline code and maths stay in the title: Pandoc read the <summary> line as Markdown too.
        self.assertIn('::: {.reading-step title="Gå i dybden: `float`, $Q^TQ$ og flyttall"}\n', week)
        self.assertNotIn('read as Markdown', out)
        # The default title of the page language is left out (nb: Løsningsforslag, Gå i dybden).
        self.assertIn('::: {.solution}\n\nLøsningen.\n\n:::\n', week)
        self.assertIn('::: {.reading-step}\n\nYtre.\n\n::: {.details title="Indre"}\n\nIndre tekst.\n:::\n\n:::\n', week)
        # A paragraph or list line before: a blank line before the fence, and a note.
        self.assertIn('   som fortsetter.\n\n::: {.details title="Valgfri fordypning"}\n', week)
        self.assertRegex(out, r'_includes/uke5\.md:\d+: a blank line was put before the new fence')
        self.assertIn('::: {.embed src="../assets/vis.html" title="Et forsøk" height="920px"}\n:::\n', week)
        # Code, comments and indented code are not touched.
        self.assertIn('```python\n<details>\n<summary>Kode, ikke HTML</summary>\n</details>\n```', week)
        self.assertIn('<!--\n<details class="reading-step">\n<summary>I en kommentar</summary>\n</details>\n-->', week)
        self.assertIn('    <details>\n    indented code after a blank line', week)
        # What it cannot convert stays as it is, and is reported.
        self.assertIn('<details open>\n<summary>Åpen</summary>', week)
        self.assertIn('<details class="fancy">', week)
        self.assertIn('<iframe src="x.html"></iframe>', week)
        self.assertRegex(out, r'uke5\.md:\d+: left as it is \(a <details> with other attributes \(open\)\)')
        self.assertRegex(out, r'uke5\.md:\d+: left as it is \(a <details> of the class "fancy"\)')
        self.assertRegex(out, r'uke5\.md:\d+: left as it is \(an <iframe> without title=')
        # Not below the switch's file start: a marker where it was; an English page keeps "Løsningsforslag".
        intro = self.read('_includes/intro.md')
        self.assertEqual(intro, 'Explore a direction.\nUse the tabs.\n\n::: {.modes}\n:::\n\n'
                                '::: {.solution title="Løsningsforslag"}\n\nOn an English page the title stays.\n\n:::\n')
        # An HTML comment before the switch is not content: the switch still starts its file.
        self.assertEqual(self.read('_includes/setup.md'), '<!--\nThe switch sits here.\n-->\n\nTekst.\n')
        # Files no page shows, and READMEs, are left alone.
        self.assertIn('<details>', self.read('_includes/unused.md'))
        self.assertIn('<details>', self.read('README.md'))
        # The configuration is untouched without --config.
        self.assertEqual(self.read('_quarto.yml'), QUARTO_YML)

    def test_a_dry_run_changes_nothing(self):
        before = self.read('_includes/uke5.md')
        status, out = self.run_tool('--dry-run')
        self.assertEqual(status, 0)
        self.assertEqual(self.read('_includes/uke5.md'), before)
        self.assertIn('Dry run', out)

    def test_switch_marker_everywhere(self):
        self.run_tool('--switch', 'marker')
        self.assertTrue(self.read('_includes/uke5.md').startswith('::: {.modes}\n:::\n\n::: {.panel-tabset}'))

    def test_config_adds_the_tab_ids_line_and_markdown_lint_and_drops_the_site_scripts(self):
        self.run_tool('--config')
        config = self.read('_quarto.yml')
        self.assertIn('filters:\n  - path: _extensions/ctm-assessment/tab-ids.lua\n    at: pre-ast\n  - ctm-assessment\n', config)
        self.assertNotIn('include-after-body', config)
        self.assertIn('    css: styles.css\n', config)
        self.assertTrue(config.rstrip().endswith('ctm-assessment:\n  markdown-lint: true'))
        self.assertFalse((self.dir / '_includes/site/tab-links.html').exists())
        self.assertFalse((self.dir / '_includes/site/learning-mode.html').exists())
        # Again: nothing more to do.
        self.run_tool('--config')
        self.assertEqual(self.read('_quarto.yml'), config)

    def test_check_reports_raw_html_and_a_baseline_keeps_what_a_course_has(self):
        status, out = self.run_tool('--check')
        self.assertEqual(status, 0)
        lines = [line for line in out.splitlines() if re.match(r'^_includes/', line)]
        self.assertTrue(any(line.startswith('_includes/uke5.md:1: ') and 'lecture/reading switch' in line for line in lines), out)
        self.assertTrue(any(line.startswith('_includes/uke5.md:11: ') and '::: {#id}' in line for line in lines), out)
        self.assertEqual(sum('<details>/<summary>' in line for line in lines), 10, out)
        self.assertTrue(any('Found: details.reading-step: Gå i dybden: `float`, $Q^TQ$ og flyttall' in line for line in lines), out)
        # What the conversion cannot do is named.
        self.assertTrue(any(line.startswith('_includes/uke5.md:') and 'Found: details: Åpen' in line
                            and 'convert it by hand (a <details> with other attributes (open))' in line for line in lines), out)
        self.assertFalse(any('unused.md' in line or 'Kode, ikke HTML' in line or 'I en kommentar' in line for line in lines))
        baseline = self.dir / 'ctm-html-baseline.json'
        self.run_tool('--write-baseline', str(baseline))
        data = json.loads(baseline.read_text(encoding='utf-8'))
        self.assertIn('details.reading-step: Gå i dybden', data['constructs']['_includes/uke5.md'])
        self.assertIn('anchor #uke5-start', data['constructs']['_includes/uke5.md'])
        status, out = self.run_tool('--check', '--baseline', str(baseline), '--strict')
        self.assertEqual(status, 0, out)
        self.assertIn('0 reported beyond the baseline', out)
        # Lines added above move every construct: still nothing new.
        week = self.dir / '_includes/uke5.md'
        week.write_text('Ny tekst.\n\n' + week.read_text(encoding='utf-8'), encoding='utf-8')
        status, out = self.run_tool('--check', '--baseline', str(baseline))
        self.assertIn('0 reported beyond the baseline', out)
        # A new raw <details> is reported once, at its line; --strict fails.
        week.write_text(week.read_text(encoding='utf-8') + '\n<details class="reading-step">\n<summary>Gå i dybden: ny</summary>\n\nNy.\n\n</details>\n', encoding='utf-8')
        status, out = self.run_tool('--check', '--baseline', str(baseline), '--strict')
        self.assertEqual(status, 1)
        reported = [line for line in out.splitlines() if line.startswith('_includes/uke5.md:')]
        self.assertEqual(len(reported), 1, out)
        number = int(reported[0].split(':')[1])
        self.assertEqual(week.read_text(encoding='utf-8').split('\n')[number - 1], '<details class="reading-step">')
        self.assertIn('Not in the baseline', reported[0])
        self.assertIn('Found: details.reading-step: Gå i dybden: ny', reported[0])

    def test_nested_includes_resolve_against_the_page(self):
        # Quarto resolves an include inside an included file against the page's
        # folder (review A2 S2): ../_includes/… from pages/, not from _includes/.
        week = self.dir / '_includes/uke5.md'
        week.write_text(week.read_text(encoding='utf-8') + '\n{{< include ../_includes/oppgaver/uke5_ex.md >}}\n', encoding='utf-8')
        nested = self.dir / '_includes/oppgaver/uke5_ex.md'
        nested.parent.mkdir(parents=True)
        nested.write_text('## Oppgaver\n\n<div id="uke5-oppg"></div>\n\n'
                          '{{< include ../_includes/oppgaver/deeper.md >}}\n', encoding='utf-8')
        (self.dir / '_includes/oppgaver/deeper.md').write_text(
            '<details class="learning-hint">\n<summary>Hint til 5.1</summary>\n\nDypt.\n</details>\n', encoding='utf-8')
        # The rule of ctm-libs' ctm.source.files(): `/` is the project's root,
        # quotes are dropped, and an include written relative to the including
        # file is not found (no fallback; Quarto stops on it).
        nested.write_text(nested.read_text(encoding='utf-8') + '\n{{< include "/_includes/oppgaver/root.md" >}}\n'
                          '\n{{< include rel.md >}}\n', encoding='utf-8')
        for name in ('root.md', 'rel.md'):
            (self.dir / '_includes/oppgaver' / name).write_text('<div id="x-' + name[:-3] + '"></div>\n', encoding='utf-8')
        files = self.module.Project(self.dir, LIBS).files
        self.assertIn('_includes/oppgaver/root.md', files)
        self.assertNotIn('_includes/oppgaver/rel.md', files)
        status, out = self.run_tool('--check')
        self.assertIn('_includes/oppgaver/uke5_ex.md:3: ', out)
        self.assertIn('_includes/oppgaver/deeper.md:1: ', out)
        self.assertEqual(self.module.Project(self.dir, LIBS).languages['_includes/oppgaver/deeper.md'], {'nb'})
        # The lint: a construct added to a nested file is new to the baseline.
        baseline = self.dir / 'ctm-html-baseline.json'
        self.run_tool('--write-baseline', str(baseline))
        self.assertIn('anchor #uke5-oppg', json.loads(baseline.read_text(encoding='utf-8'))['constructs']['_includes/oppgaver/uke5_ex.md'])
        nested.write_text(nested.read_text(encoding='utf-8') + '\n<details>\n<summary>Ny</summary>\n\nNy.\n</details>\n', encoding='utf-8')
        status, out = self.run_tool('--check', '--baseline', str(baseline), '--strict')
        self.assertEqual(status, 1)
        self.assertIn('_includes/oppgaver/uke5_ex.md:11: Not in the baseline', out)
        # The conversion reaches them too.
        self.run_tool()
        self.assertIn('::: {#uke5-oppg}\n:::\n', nested.read_text(encoding='utf-8'))
        self.assertEqual(self.read('_includes/oppgaver/deeper.md'), '::: {.hint title="Hint til 5.1"}\n\nDypt.\n:::\n')

    def test_includes_resolve_with_ctm_libs_own_rule(self):
        # The tool has no include rule of its own: ctm-libs' ctm.source.files()
        # (tools/source-files.lua) decides, for the pages' lists and for each
        # include line. This fails if that stops running, if the two disagree,
        # or if ctm-libs' rule moves away from the one the courses are written
        # for (relative to the page, `/` the project's root, quotes dropped,
        # no fallback).
        files = {
            'index.qmd': '# Hjem\n\n{{< include _includes/hjem.md >}}\n\n{{< pagebreak >}}\n',
            '_includes/hjem.md': 'Hjem.\n\n{{< include _includes/felles/a.md >}}\n',
            'pages/uke7.qmd': '---\ntitle: Uke 7\n---\n\n{{< include \'../_includes/uke7.md\' >}}\n\n'
                              '{{< include ../_includes/felles/a.md >}}\n',
            '_includes/uke7.md': '## 7.1\n\n{{< include ../_includes/felles/a.md >}}\n\n'
                                 '{{< include "/_includes/felles/b.md" >}}\n\n{{< include c.md >}}\n',
            '_includes/felles/a.md': 'A.\n',
            '_includes/felles/b.md': 'B.\n\n```\n{{< include ../_includes/felles/kode.md >}}\n```\n',
            '_includes/felles/c.md': 'C.\n',
            '_includes/felles/kode.md': 'Kode.\n',
        }
        for name, text in files.items():
            (self.dir / name).parent.mkdir(parents=True, exist_ok=True)
            (self.dir / name).write_text(text, encoding='utf-8')
        project = self.module.Project(self.dir, LIBS)
        listed = self.module.source_files(Path(LIBS).resolve(), self.dir, project.pages())
        self.assertEqual(listed['index.qmd'], ['index.qmd', '_includes/hjem.md', '_includes/felles/a.md'])
        self.assertEqual(listed['pages/uke7.qmd'], ['pages/uke7.qmd', '_includes/uke7.md', '_includes/felles/a.md',
                                                    '_includes/felles/b.md', '_includes/felles/kode.md'])
        self.assertEqual(project.shown['_includes/felles/a.md'], {'index.qmd', 'pages/uke7.qmd'})
        self.assertNotIn('_includes/felles/c.md', project.files)
        for page in project.pages():
            # Each page's Markdown, its include lines filled in, reaches exactly
            # the files ctm-libs lists (a file in a code block is listed, not put in).
            reached = {file for file, _, _ in project.expanded(page)}
            self.assertEqual(reached, set(listed[page]) - {'_includes/felles/kode.md'}, page)
        expanded = [text for _, _, text in project.expanded('pages/uke7.qmd') if text and text.strip()]
        self.assertEqual(expanded[:5], ['## 7.1', 'A.', 'B.', '{{< include c.md >}}', 'A.'])
        self.assertIn('{{< pagebreak >}}', [text for _, _, text in project.expanded('index.qmd')])
        self.assertEqual([p.name for p in self.dir.rglob('.ctm-include-probe-*')], [], 'probes are removed')

    def test_the_fixture_course_reads_as_ctm_libs_reads_it(self):
        course = self.dir / 'course'
        shutil.copytree(STEP4_COURSE, course, ignore=shutil.ignore_patterns('_site', '.quarto', '_extensions', 'migrated'))
        project = self.module.Project(course, LIBS)
        listed = self.module.source_files(Path(LIBS).resolve(), course, project.pages())
        self.assertIn('_includes/uke3.md', listed['pages/uke3.qmd'])
        for page in project.pages():
            self.assertEqual({file for file, _, _ in project.expanded(page)}, set(listed[page]), page)

    def test_reveal_ends_records_which_details_a_heading_closed(self):
        # For the rendered comparison (review A2b S1): a raw <details> with a
        # heading of its section's level (or higher) inside is closed by the
        # browser at that heading; one closed before the heading, or with a
        # deeper heading inside (a section within it), is not.
        (self.dir / 'pages/uke7.qmd').write_text(
            '---\ntitle: Uke 7\n---\n\n## 7.1 A\n\n<details class="reading-step">\n<summary>Gå i dybden</summary>\n\nEn.\n\n'
            '## 7.2 B\n\nTo.\n</details>\n\n<details>\n<summary>Lukket</summary>\n\nTre.\n</details>\n\n## 7.3 C\n\n'
            '<details>\n<summary>Ytre</summary>\n\n### 7.3.1 Dypere\n\n<details><summary>Indre</summary>\n\n## 7.4 D\n\n'
            '</details>\n</details>\n\n```{=html}\n<details><summary>Rå</summary></details>\n```\n\n'
            '```python\n# <details> in code\n```\n\n{{< include ../_includes/uke7.md >}}\n', encoding='utf-8')
        (self.dir / '_includes/uke7.md').write_text('<details>\n<summary>Inkludert</summary>\n\n# Øverst\n\n</details>\n', encoding='utf-8')
        record = self.dir / 'ends.json'
        status, out = self.run_tool('--ctm-libs', LIBS, '--reveal-ends', str(record))
        self.assertEqual(status, 0)
        pages = json.loads(record.read_text(encoding='utf-8'))['pages']
        self.assertEqual(pages['pages/uke7.html'], [True, False, True, True, False, True])
        self.assertIn('pages/uke5.html', pages)
        self.assertEqual(self.read('pages/uke7.qmd').count('<details'), 6, 'nothing changed')

    def test_without_ctm_libs_the_tool_stops(self):
        out = io.StringIO()
        with contextlib.redirect_stderr(out), unittest.mock.patch.dict(os.environ, {'CTM_LIBS_EXTENSION': ''}):
            with self.assertRaises(SystemExit) as stopped:
                self.module.main(['--project', str(self.dir), '--check'])
        self.assertEqual(stopped.exception.code, 2)
        self.assertIn("ctm-libs' rule", out.getvalue())

    def test_an_anchor_that_repeats_its_tab_heading_id_is_removed_with_the_tab_ids_line(self):
        # A hand anchor first in a tab whose heading has the same id (written or
        # automatic, also across an include): with tab-ids.lua the page would
        # have the id twice (review A2 S3), so --config removes it.
        (self.dir / 'pages/uke6.qmd').write_text(
            '---\ntitle: "Uke 6"\n---\n\n::: {.panel-tabset}\n\n'
            '## 6.1 Del {#uke6-del1}\n\n<div id="uke6-del1"></div>\n\nTekst.\n\n'
            '## 6.2 Fikspunkt og konvergens\n{{< include ../_includes/m6.md >}}\n\n'
            '## 6.3 Annet {#uke6-annet}\n\n<div id="uke6-annet-start"></div>\n\n'
            '## 6.4 Delt\n{{< include ../_includes/shared.md >}}\n\n:::\n\n'
            '<div id="uke6-slutt"></div>\n', encoding='utf-8')
        (self.dir / '_includes/m6.md').write_text('<div id="fikspunkt-og-konvergens"></div>\n\nInnhold.\n', encoding='utf-8')
        # A file that another page shows without that tab heading keeps its anchor.
        (self.dir / '_includes/shared.md').write_text('<div id="delt"></div>\n\nDelt.\n', encoding='utf-8')
        (self.dir / 'pages/delt.qmd').write_text('---\ntitle: Delt\n---\n\n{{< include ../_includes/shared.md >}}\n', encoding='utf-8')
        self.assertEqual(self.module.Project(self.dir, LIBS).tab_anchor_duplicates(),
                         {'pages/uke6.qmd': {8: 'uke6-del1'}, '_includes/m6.md': {0: 'fikspunkt-og-konvergens'}})
        # Without the tab-ids.lua line: converted as any anchor, and named.
        status, out = self.run_tool()
        self.assertIn('\n::: {#uke6-del1}\n:::\n', self.read('pages/uke6.qmd'))
        self.assertIn('pages/uke6.qmd:9: the anchor #uke6-del1 repeats the id of the tab heading it follows', out)
        # With it (--config): removed, also in the ::: {#…} form; the others stay.
        status, out = self.run_tool('--config')
        page = self.read('pages/uke6.qmd')
        self.assertIn('## 6.1 Del {#uke6-del1}\n\nTekst.\n', page)
        self.assertNotIn('{#uke6-del1}\n:::', page)
        self.assertIn('::: {#uke6-annet-start}\n:::\n', page)
        self.assertIn('::: {#uke6-slutt}\n:::\n', page)
        self.assertEqual(self.read('_includes/m6.md'), 'Innhold.\n')
        self.assertTrue(self.read('_includes/shared.md').startswith('::: {#delt}\n:::\n'))
        self.assertIn('2  anchor removed: its tab heading has the same id (tab-ids.lua)', out)
        self.assertIn('_includes/m6.md:1: removed the anchor #fikspunkt-og-konvergens', out)

    def test_heading_ids(self):
        heading_id = self.module.heading_id
        self.assertEqual(heading_id('3.3 Beskriv bilder {#uke3-del2 .unnumbered}'), 'uke3-del2')
        self.assertEqual(heading_id('2.4 Feil, residual og toleranse'), 'feil-residual-og-toleranse')
        self.assertEqual(heading_id('Støtte: *Æ* og `ø`'), 'støtte-æ-og-ø')
        self.assertEqual(heading_id('1.2 {.unnumbered}'), 'section')

    def test_github_annotations(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.module.main(['--project', str(self.dir), '--check', '--format', 'github',
                              str(self.dir / 'pages/intro.qmd'), str(self.dir / '_includes/intro.md')])
        annotations = [line for line in out.getvalue().splitlines() if line.startswith('::warning ')]
        self.assertEqual(len(annotations), 2, out.getvalue())
        self.assertTrue(annotations[0].startswith('::warning file=_includes/intro.md,line=4,title=Raw HTML in Markdown::'))

    def test_the_default_titles_are_ctm_libs_ones(self):
        libs = os.environ.get('CTM_LIBS_EXTENSION')
        catalogue = Path(libs or '') / 'locales' / 'ui.js'
        if not libs or not catalogue.is_file():
            self.skipTest('CTM_LIBS_EXTENSION is not set (setup-feedback-integration.py --test sets it)')
        text = catalogue.read_text(encoding='utf-8')
        data = json.loads(text[text.index('/*BEGIN-JSON*/') + 14:text.index('/*END-JSON*/')])
        keys = {'reading-step': 'readingStep', 'solution': 'solution', 'hint': 'hint'}
        for kind, titles in self.module.DEFAULT_TITLES.items():
            for lang, title in titles.items():
                self.assertEqual(data[lang][keys[kind]], title, f'{kind} {lang}')

    @unittest.skipUnless(QUARTO, 'Quarto (for its Pandoc) is not installed')
    def test_pandoc_reads_the_converted_blocks_with_their_titles(self):
        self.run_tool()
        week = self.read('_includes/uke5.md')
        result = subprocess.run([QUARTO, 'pandoc', '-f', 'markdown', '-t', 'json'], input=week, capture_output=True,
                                text=True, check=True)
        found = []

        def walk(node):
            if isinstance(node, dict):
                if node.get('t') == 'Div':
                    (identifier, classes, attrs), _ = node['c']
                    found.append((identifier, classes, dict(attrs)))
                for value in node.values():
                    walk(value)
            elif isinstance(node, list):
                for value in node:
                    walk(value)
        walk(json.loads(result.stdout))
        reveals = [(classes, attrs.get('title')) for _, classes, attrs in found
                   if set(classes) & {'reading-step', 'hint', 'solution', 'details', 'embed'}]
        self.assertEqual(reveals, [
            (['reading-step'], 'Gå i dybden: $\\mathbf{A}\\,x$ og "sitat"'),
            (['hint'], 'Hint til oppgave 1'),
            (['reading-step'], 'Gå i dybden: `float`, $Q^TQ$ og flyttall'),
            (['details'], 'Valgfri fordypning'),
            (['solution'], None),
            (['reading-step'], None),
            (['details'], 'Indre'),
            (['embed'], 'Et forsøk'),
        ])
        self.assertIn(('uke5-start', [], {}), found)
        self.assertNotIn(':::', json.dumps(json.loads(result.stdout)['blocks']).replace('":::"', ''), 'no literal fence')


if __name__ == '__main__':
    unittest.main()
