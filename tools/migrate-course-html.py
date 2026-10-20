#!/usr/bin/env python3
"""Move a course's raw HTML in Markdown to CTM Assessment's Markdown forms (step 4), or report it.

    python migrate-course-html.py [--project DIR] [--ctm-libs DIR] [--config] [--switch auto|marker|remove] [--dry-run] [FILE ...]
    python migrate-course-html.py [--project DIR] [--ctm-libs DIR] --check [--baseline FILE] [--strict] [FILE ...]
    python migrate-course-html.py [--project DIR] [--ctm-libs DIR] --write-baseline FILE [FILE ...]

A maintainer tool of ctm-assessment (not part of the package; Python 3.9+,
standard library only, and Quarto). It reads the project's pages (project:
render:, or every .qmd and .md outside folders that start with _ or .) and
the files they include, or the FILEs given, outside code blocks, HTML
comments and front matter, rewrites in place, and reports what it did and
what it left:

  <details class="reading-step">     ->  ::: {.reading-step title="…"}   (the <summary> is the title)
  <details class="learning-hint">    ->  ::: {.hint title="…"}
  <details class="solution-block">   ->  ::: {.solution title="…"}
  <details>                          ->  ::: {.details title="…"}
  </details>                         ->  :::
  <div id="x"></div>                 ->  ::: {#x} and :::
                                         (removed when it is the first thing in a tab whose
                                         heading has the same id: tab-ids.lua puts that id first
                                         in the tab, and the page would have it twice)
  <iframe src="…" title="…" style="…height:920px…"></iframe>
                                     ->  ::: {.embed src="…" title="…" height="920px"} and :::
  the hand-written lecture/reading switch (<div … data-learning-mode …> … </div>)
                                     ->  removed when it starts its file (the switch is then
                                         placed at the top of the page), else ::: {.modes} and :::
                                         (--switch marker or remove decides for every file)

A title that is the default of its kind in the language of every page that
shows the file ("Løsningsforslag" for .solution on nb pages) is left out.
Backslashes in titles are doubled and quotes escaped, because Pandoc reads
attribute values with backslash escapes ($\\mathbf{A}$ keeps its TeX). A
blank line is put before each new ::: fence that would follow a paragraph or
list line: raw HTML may follow such a line directly, a fence may not (the
report names these places, since a <details> there was cut short by the
browser and the new block is no longer part of that list). What cannot be
converted (other attributes, a <summary> elsewhere, raw HTML inside
```{=html} blocks) stays as it is and is reported.

Which files a page includes (nested includes too) is ctm-libs' rule, the
one its markdown-lint reads: tools/source-files.lua runs ctm-libs' own
ctm.source.files() with `quarto pandoc lua`. --ctm-libs DIR names ctm-libs'
extension folder (default: $CTM_LIBS_EXTENSION), the one the umbrella pins
(scripts/build-course.py --convert passes the copy it has just installed).

--config also edits _quarto.yml: the tab-ids.lua line first in `filters:`,
`ctm-assessment: markdown-lint: true`, and no include-after-body entries for
the courses' _includes/site/learning-mode.html and tab-links.html (deleted
when nothing else names them). The course's own CSS for the old classes is
left to the author.

--check reports the raw HTML that the conversion handles, as warning
annotations in GitHub Actions (file:line lines otherwise), with the Markdown
form to use; with --baseline FILE, only what FILE does not list. A course that
migrates later keeps its raw HTML in the baseline (written once with
--write-baseline FILE), and new raw HTML is flagged. The baseline lists the
constructs of each file by kind and title, id or address, not by line, so
edits elsewhere in a file do not disturb it. --check changes no file and
exits 0, or 1 with --strict when it reports something.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from collections import Counter
from pathlib import Path

# The default titles of reveals (ctm-libs locales/ui.js): a title equal to
# its page language's default is left out. .details keeps its title.
DEFAULT_TITLES = {
    'reading-step': {'en': 'Go deeper', 'de': 'Vertiefung', 'nb': 'Gå i dybden', 'nn': 'Gå i djupna'},
    'solution': {'en': 'Solution', 'de': 'Lösungsvorschlag', 'nb': 'Løsningsforslag', 'nn': 'Løysingsforslag'},
    'hint': {'en': 'Hint', 'de': 'Hinweis', 'nb': 'Hint', 'nn': 'Hint'},
}
# The courses' <details> classes and their reveals.
KINDS = {'reading-step': 'reading-step', 'learning-hint': 'hint', 'solution-block': 'solution', '': 'details'}
SKIPPED_DIRS = {'_site', '_freeze', '_extensions', 'node_modules', 'site_libs', 'renv', 'venv'}
SITE_SCRIPTS = ('_includes/site/learning-mode.html', '_includes/site/tab-links.html')
TAB_IDS = '_extensions/ctm-assessment/tab-ids.lua'
SOURCE_FILES = Path(__file__).resolve().parent / 'source-files.lua'

ADVICE = {
    'details': 'raw HTML <details>/<summary>: CTM Assessment\'s Markdown form is ::: {.reading-step title="…"}, '
               '::: {.hint}, ::: {.solution} or ::: {.details title="…"}, closed with :::',
    'anchor': 'raw HTML <div id="…"></div>: CTM Assessment\'s Markdown form is ::: {#id} and ::: on the next line',
    'iframe': 'raw HTML <iframe>: CTM Assessment\'s Markdown form is ::: {.embed src="…" title="…" height="…"} and :::',
    'switch': 'a hand-written lecture/reading switch (data-learning-mode): with CTM Assessment\'s step 4 pages with '
              '.reading-step blocks get the switch, and ::: {.modes} places it',
}

ITEM = re.compile(r'^\s*(?:[-+*]|\d+[.)])\s+\S')
DETAILS = re.compile(r'^(\s*)<details((?:\s+[\w:-]+(?:\s*=\s*"[^"]*")?)*)\s*>(.*)$', re.I)
SUMMARY = re.compile(r'^\s*<summary>(.*?)</summary>\s*$', re.I)
CLOSE = re.compile(r'^(.*?)</details>\s*$', re.I)
ANCHOR = re.compile(r'^(\s*)<div\s+id\s*=\s*"([^"]+)"\s*>\s*</div>\s*$', re.I)
IFRAME = re.compile(r'^(\s*)<iframe((?:\s+[\w:-]+(?:\s*=\s*"[^"]*")?)*)\s*>\s*</iframe>\s*$', re.I)
SWITCH = re.compile(r'^(\s*)<div\b[^>]*\bdata-learning-mode\b[^>]*>\s*$', re.I)
ATTRIBUTE = re.compile(r'([\w:-]+)(?:\s*=\s*"([^"]*)")?')
LENGTH = re.compile(r'^\d+(?:\.\d+)?(?:px|r?em|vh|%)$')
# A shortcode alone on its line: where an include puts its file (ctm-libs
# decides whether it is one, and which file).
SHORTCODE = re.compile(r'\{\{<.*>\}\}')


class ToolError(Exception):
    """A failure reported as one line, without a traceback."""


def ctm_libs_extension(given=None):
    """ctm-libs' extension folder: `given` (--ctm-libs), else $CTM_LIBS_EXTENSION."""
    folder = given or os.environ.get('CTM_LIBS_EXTENSION')
    if not folder:
        raise ToolError("which files a page includes is ctm-libs' rule: give ctm-libs' extension folder, at the "
                        "commit the umbrella pins, as --ctm-libs DIR or $CTM_LIBS_EXTENSION")
    folder = Path(folder).resolve()
    if not (folder / 'lua' / 'source.lua').is_file():
        raise ToolError(f'{folder} is not ctm-libs\' extension folder (no lua/source.lua)')
    return folder


def source_files(libs, root, pages):
    """{page: [file, …]}: the files each page shows, as ctm-libs'
    ctm.source.files() gives them (tools/source-files.lua): the page and its
    includes, nested ones too, in order, relative to the project."""
    found = {page: [] for page in pages}
    if not pages:
        return found
    quarto = shutil.which(os.environ.get('QUARTO_BIN', 'quarto'))
    if not quarto:
        raise ToolError('Quarto is not installed: its Pandoc runs ctm-libs\' include rule (tools/source-files.lua)')
    done = subprocess.run([quarto, 'pandoc', 'lua', str(SOURCE_FILES), str(libs), str(root), *pages],
                          capture_output=True, text=True, encoding='utf-8')
    if done.returncode:
        raise ToolError(f'tools/source-files.lua failed (exit status {done.returncode}): {done.stderr.strip()}')
    for line in done.stdout.splitlines():
        page, _, file = line.partition('\t')
        if page in found and file and not file.startswith('../') and not os.path.isabs(file):
            found[page].append(file)
    return found


# ---------------------------------------------------------------- reading
def scan(lines):
    """For each line, the text that is Markdown (without inline code and
    comments) and whether it lies in a ```{=html} block: None for code
    (fenced, or indented by four spaces after a blank line outside a list),
    comments and front matter. The same rules as ctm-libs' markdown-lint
    (lua/source.lua)."""
    found = []
    fence, raw, comment = None, False, False
    after_blank, in_list, indented = True, False, False
    for number, line in enumerate(lines, 1):
        skip = False
        blank = not line.strip()
        deep = line.startswith('    ') or re.match(r'^ *\t', line) is not None
        if number == 1 and re.match(r'^---\s*$', line):
            fence, skip = 'front matter', True
        elif fence == 'front matter':
            if re.match(r'^(---|\.\.\.)\s*$', line):
                fence = None
            skip = True
        elif fence:
            close = re.match(r'^\s*([`~]+)\s*$', line)
            if close and close.group(1)[0] == fence[0] and len(close.group(1)) >= len(fence):
                fence, raw, skip = None, False, True
            else:
                skip = not raw
        elif indented and (blank or deep):
            skip = True
        elif deep and after_blank and not in_list and not blank:
            indented, skip = True, True
        else:
            indented = False
            opening = re.match(r'^\s*(```+|~~~+)\s*(.*?)\s*$', line)
            if opening:
                fence, raw, skip = opening.group(1), re.match(r'^\{=html5?\}$', opening.group(2)) is not None, True
        if not fence and not indented and not blank:
            if ITEM.match(line):
                in_list = True
            elif not re.match(r'^\s', line):
                in_list = False
        after_blank = blank
        if skip:
            found.append((None, False))
            continue
        text = line
        if comment:
            stop = text.find('-->')
            if stop >= 0:
                text, comment = text[stop + 3:], False
            else:
                text = ''
        text = re.sub(r'<!--.*?-->', '', text)
        start = text.find('<!--')
        if start >= 0:
            text, comment = text[:start], True
        if not raw:
            text = re.sub(r'``.*?``', '', text)
            text = re.sub(r'`[^`]*`', '', text)
        found.append((text, raw))
    return found


def attributes(text):
    return [(name.lower(), value) for name, value in ATTRIBUTE.findall(text or '')]


def quoted(value):
    return '"' + value.replace('\\', '\\\\').replace('"', '\\"') + '"'


def front_matter_lang(text):
    if not text.startswith('---'):
        return None
    end = re.search(r'^(---|\.\.\.)\s*$', text[3:], re.M)
    block = text[3:3 + end.start()] if end else ''
    found = re.search(r'^lang:\s*["\']?([\w-]+)', block, re.M)
    return found.group(1) if found else None


def normalized(lang):
    if not lang:
        return None
    lang = re.split(r'[-_]', lang.strip().lower())[0]
    return {'no': 'nb', 'nob': 'nb', 'nno': 'nn'}.get(lang, lang)


def heading_id(text):
    """A heading's id: its {#id}, else Pandoc's automatic one (auto_identifiers)."""
    attrs = re.search(r'\s*\{([^{}]*)\}\s*$', text)
    if attrs:
        written = re.search(r'(?:^|\s)#([^\s}]+)', attrs.group(1))
        if written:
            return written.group(1)
        text = text[:attrs.start()]
    text = re.sub(r'!?\[([^\]]*)\]\([^)]*\)', r'\1', text)  # links and images: their text
    text = re.sub(r'[*`$]|(?<!\w)_|_(?!\w)', '', text)       # emphasis, code and maths marks
    text = re.sub(r'<[^>]+>', '', text)
    kept = ''.join(c for c in text if c.isalnum() or c in '_-.' or c.isspace())
    identifier = '-'.join(kept.lower().split())
    first = next((k for k, c in enumerate(identifier) if c.isalpha()), None)
    return identifier[first:] if first is not None else 'section'


class Project:
    """The project's pages, the Markdown files they show (includes,
    transitively; posix paths relative to the project) and their languages."""

    def __init__(self, root, libs):
        self.root = root
        top = root / '_quarto.yml'
        self.config = top.read_text(encoding='utf-8') if top.is_file() else ''
        found = re.search(r'^lang:\s*["\']?([\w-]+)', self.config, re.M)
        self.lang = found.group(1) if found else None
        self.languages = {}
        self.shown = {}  # file -> the pages that show it
        pages = self.pages()
        for page, files in source_files(libs, root, pages).items():
            lang = self.page_lang(page)
            for current in files:
                self.languages.setdefault(current, set()).add(lang)
                self.shown.setdefault(current, set()).add(page)
        self.files = sorted(self.languages)
        self.included = self.resolve(libs)

    def resolve(self, libs):
        """{(page folder, line): file or None}: the file that each shortcode
        line of the shown files puts in, on the pages of that folder. ctm-libs
        resolves it: each line becomes a probe page of its own in the page's
        folder (a dot file, removed after), and the first file the probe
        includes is the line's."""
        wanted = set()
        for file in self.files:
            lines = (self.root / file).read_text(encoding='utf-8').split('\n')
            for text, raw in scan(lines):
                if text is not None and not raw and SHORTCODE.fullmatch(text.strip()):
                    for page in self.shown[file]:
                        wanted.add((Path(page).parent.as_posix(), text.strip()))
        probes = {}
        try:
            for k, (folder, line) in enumerate(sorted(wanted)):
                probe = (Path(folder) / f'.ctm-include-probe-{os.getpid()}-{k}.md').as_posix()
                (self.root / probe).write_text(line + '\n', encoding='utf-8')
                probes[probe] = (folder, line)
            found = source_files(libs, self.root, list(probes))
        finally:
            for probe in probes:
                (self.root / probe).unlink(missing_ok=True)
        return {key: (found[probe][1] if len(found[probe]) > 1 else None) for probe, key in probes.items()}

    def markdown(self):
        for folder, dirs, files in os.walk(self.root):
            dirs[:] = sorted(d for d in dirs if not d.startswith(('.', '_')) and d not in SKIPPED_DIRS)
            for name in files:
                if name.endswith(('.md', '.qmd')) and not name.startswith(('_', '.')) \
                        and name.lower() not in ('readme.md', 'license.md', 'changelog.md'):
                    yield Path(folder, name).relative_to(self.root).as_posix()

    def pages(self):
        """The rendered pages: project: render: (globs, !exclusions), else every page."""
        block = re.search(r'^project:[ \t]*\n((?:[ \t]+.*\n|[ \t]*\n)*)', self.config + '\n', re.M)
        listed = re.search(r'^(\s+)render:\s*\n((?:\1\s*-\s*.*\n)+)', block.group(1), re.M) if block else None
        if not listed:
            return sorted(self.markdown())
        chosen = set()
        for entry in re.findall(r'-\s*(.+)', listed.group(2)):
            entry = entry.strip().strip('"\'')
            pattern, remove = (entry[1:], True) if entry.startswith('!') else (entry, False)
            matched = {path.relative_to(self.root).as_posix() for path in self.root.glob(pattern) if path.is_file()}
            chosen = chosen - matched if remove else chosen | {m for m in matched if m.endswith(('.md', '.qmd'))}
        return sorted(chosen)

    def expanded(self, page):
        """The page's Markdown with its includes put in, nested ones too, as
        (file, index, text) for each line: `text` as scan() gives it (None for
        code and front matter)."""
        folder = Path(page).parent.as_posix()
        out = []

        def walk(relative, trail):
            path = self.root / relative
            try:
                lines = path.read_text(encoding='utf-8').split('\n')
            except OSError:
                return
            for index, (line, (text, raw)) in enumerate(zip(lines, scan(lines))):
                inner = self.included.get((folder, text.strip())) if text is not None and not raw else None
                if inner:
                    if inner not in trail:
                        walk(inner, trail | {inner})
                    continue
                out.append((relative, index, None if raw else text))
        walk(page, {page})
        return out

    def tab_anchor_duplicates(self):
        """The hand-written anchors that repeat the id of the tab heading they
        follow (<div id="x"></div>, or ::: {#x} and :::, first in the tab):
        with tab-ids.lua the tab's pane starts with that id, so the page
        would have it twice. {file: {line index: id}} for anchors that do so
        on every page that shows their file."""
        hits = {}  # (file, index) -> (id, pages)
        for page in self.pages():
            entries = self.expanded(page)
            stack = []  # open divs: [is a tabset, its tab level]
            for k, (file, index, text) in enumerate(entries):
                if text is None:
                    continue
                fence = re.match(r'^\s*(:{3,})\s*(.*?)\s*$', text)
                if fence:
                    if fence.group(2):
                        stack.append([bool(re.search(r'(^|[\s{.])panel-tabset\b', fence.group(2))), None])
                    elif stack:
                        stack.pop()
                    continue
                heading = re.match(r'^(#{1,6})\s+(.*?)\s*$', text)
                if not heading or not stack or not stack[-1][0]:
                    continue
                level = len(heading.group(1))
                if stack[-1][1] is None:
                    stack[-1][1] = level
                if level != stack[-1][1]:
                    continue
                identifier = heading_id(heading.group(2))
                # The first content of the tab: blank lines and comments do not count.
                for j in range(k + 1, len(entries)):
                    later = entries[j][2]
                    if later is not None and not later.strip():
                        continue
                    if later is None:
                        break
                    anchor = ANCHOR.match(later)
                    marker = re.match(r'^\s*:::+\s*\{#([^\s}]+)\}\s*$', later)
                    if marker and not (j + 1 < len(entries) and re.match(r'^\s*:::+\s*$', entries[j + 1][2] or '')):
                        marker = None
                    found = (anchor.group(2) if anchor else marker.group(1) if marker else None)
                    if found and found == identifier:
                        key = (entries[j][0], entries[j][1])
                        hits.setdefault(key, (found, set()))[1].add(page)
                    break
        result = {}
        for (file, index), (identifier, pages) in hits.items():
            if pages >= self.shown.get(file, set()):
                result.setdefault(file, {})[index] = identifier
        return result

    def page_lang(self, relative):
        lang = front_matter_lang((self.root / relative).read_text(encoding='utf-8'))
        folder = (self.root / relative).parent
        while lang is None:
            metadata = folder / '_metadata.yml'
            if metadata.is_file():
                found = re.search(r'^lang:\s*["\']?([\w-]+)', metadata.read_text(encoding='utf-8'), re.M)
                lang = found.group(1) if found else None
            if folder == self.root or self.root not in folder.parents:
                break
            folder = folder.parent
        return normalized(lang or self.lang or 'en')


# ---------------------------------------------------------------- finding
class Construct:
    def __init__(self, kind, line, key, convertible=True, reason=''):
        self.kind, self.line, self.key, self.convertible, self.reason = kind, line, key, convertible, reason


def constructs(lines, scanned):
    """Every construct that ctm-libs' markdown-lint flags, with its baseline key."""
    found = []
    summary_follows = False
    for index, (text, raw) in enumerate(scanned):
        if text is None or not text.strip():
            continue
        lower = text.lower()
        number = index + 1
        follows, summary_follows = summary_follows, False
        if re.search(r'<details[\s>]', lower):
            cls = re.search(r'class\s*=\s*"([^"]*)"', text, re.I)
            title = re.search(r'<summary>(.*?)</summary>', lines[index], re.I)
            if not title:
                for later in range(index + 1, min(index + 4, len(scanned))):
                    if scanned[later][0] and scanned[later][0].strip():
                        title = re.search(r'<summary>(.*?)</summary>', lines[later], re.I)
                        break
            key = 'details' + ('.' + '.'.join(cls.group(1).split()) if cls and cls.group(1).strip() else '')
            found.append(Construct('details', number, key + (': ' + title.group(1).strip() if title else ''), not raw, 'inside a ```{=html} block' if raw else ''))
            summary_follows = not re.search(r'<summary[\s>]', lower)
        elif re.search(r'<summary[\s>]', lower) and not follows:
            title = re.search(r'<summary>(.*?)</summary>', lines[index], re.I)
            found.append(Construct('details', number, 'summary' + (': ' + title.group(1).strip() if title else ''), False,
                                   'a <summary> without its <details> on the line before'))
        for anchor in re.finditer(r'<div\s+id\s*=\s*"([^"]*)"\s*>\s*</div>', text, re.I):
            found.append(Construct('anchor', number, 'anchor #' + anchor.group(1), not raw, 'inside a ```{=html} block' if raw else ''))
        for frame in re.finditer(r'<iframe[\s>][^>]*', text, re.I):
            src = dict(attributes(frame.group(0)[7:])).get('src', '')
            found.append(Construct('iframe', number, 'iframe ' + src, not raw, 'inside a ```{=html} block' if raw else ''))
        if re.search(r'<[^>]*data-learning-mode', lower):
            found.append(Construct('switch', number, 'switch', not raw, 'inside a ```{=html} block' if raw else ''))
    return found


# ---------------------------------------------------------------- converting
class Report:
    def __init__(self):
        self.counts = Counter()
        self.notes = []

    def note(self, path, line, text):
        self.notes.append(f'{path}:{line}: {text}')


def kind_of(classes):
    """(reveal kind, other classes) for the classes of a <details>, or None."""
    known = [c for c in classes if c in KINDS]
    if len(known) > 1 or (not known and classes):
        return None
    return KINDS[known[0] if known else ''], [c for c in classes if c not in KINDS]


def front_matter_end(lines):
    """The index of the first line after the front matter (0 without one)."""
    if lines and re.match(r'^---\s*$', lines[0]):
        for index in range(1, len(lines)):
            if re.match(r'^(---|\.\.\.)\s*$', lines[index]):
                return index + 1
    return 0


def convert_file(path, lines, scanned, languages, switch, report, drop=None):
    """(converted lines, indexes of the converted constructs' first lines, why others were left).
    `drop`: the indexes of anchors that repeat their tab heading's id (removed)."""
    out, done, why = [], set(), {}
    drop = drop or {}
    closes = {}  # index of a </details> line -> the indent of its fence
    # Markdown lines (outside code, comments and front matter); `usable`: also
    # without inline code or a comment on the line. A <summary> line may hold
    # inline code (its title is Markdown, as Pandoc read it inside raw HTML).
    markdown = [text is not None and not raw for text, raw in scanned]
    usable = [ok and text.rstrip() == line.rstrip() for ok, line, (text, raw) in zip(markdown, lines, scanned)]
    texts = [text if ok else '' for ok, (text, raw) in zip(markdown, scanned)]
    content = front_matter_end(lines)
    started = False  # some content before this line

    def fence_after_blank(index):
        if out and out[-1].strip():
            out.append('')
            previous = lines[index - 1].strip() if index > 0 else ''
            if previous and not previous.startswith(('<', ':::', '#')):
                report.note(path, index + 1, 'a blank line was put before the new fence, since the raw HTML followed '
                                             'a paragraph or list line directly: check the page (the block no longer '
                                             'continues that paragraph or list item)')

    index = 0
    while index < len(lines):
        line = lines[index]
        if not markdown[index]:
            # Code (a cell) is content; front matter is not.
            started = started or (index >= content and bool(line.strip()))
            out.append(line)
            index += 1
            continue

        match = SWITCH.match(line) if usable[index] else None
        if match:
            end = next((j for j in range(index + 1, min(index + 12, len(lines)))
                        if usable[j] and lines[j].strip().lower() == '</div>'), None)
            if end is None:
                why[index] = 'a switch without its closing </div> within ten lines'
            else:
                done.add(index)
                if switch == 'remove' or (switch == 'auto' and not started):
                    report.counts['switch removed (the page places it)'] += 1
                    index = end + 1
                    if not started:
                        while index < len(lines) and not lines[index].strip():
                            index += 1
                else:
                    fence_after_blank(index)
                    out += [match.group(1) + '::: {.modes}', match.group(1) + ':::']
                    report.counts['switch -> ::: {.modes}'] += 1
                    index = end + 1
                    started = True
                continue

        if index in closes:
            before = CLOSE.match(line).group(1)
            if before.strip():
                out.append(before.rstrip())
            out.append(closes.pop(index) + ':::')
            index += 1
            started = True
            continue

        match = DETAILS.match(line) if DETAILS.match(texts[index]) else None
        if match:
            converted = details(path, lines, texts, index, match, languages, report)
            if isinstance(converted, tuple):
                fence, close, after = converted
                fence_after_blank(index)
                out.append(fence)
                closes[close] = match.group(1)
                done.update(range(index, after))
                index = after
                started = True
                continue
            why[index] = converted

        marker = index in drop and re.match(r'^\s*:::+\s*\{#[^\s}]+\}\s*$', line) and index + 1 < len(lines)
        match = ANCHOR.match(line) if usable[index] or marker else None
        if (match or marker) and index in drop:
            # The tab heading carries this id (tab-ids.lua puts it first in the
            # pane), so the anchor would repeat it: removed, links still work.
            report.counts['anchor removed: its tab heading has the same id (tab-ids.lua)'] += 1
            report.note(path, index + 1, f'removed the anchor #{drop[index]}: the tab heading it follows has that id, '
                                         'which tab-ids.lua puts first in the tab (the page would have it twice)')
            done.add(index)
            index += 1 if match else 2
            if (not out or not out[-1].strip()) and index < len(lines) and not lines[index].strip():
                index += 1
            continue
        if match:
            fence_after_blank(index)
            out += [f'{match.group(1)}::: {{#{match.group(2)}}}', match.group(1) + ':::']
            report.counts['<div id="…"></div> -> ::: {#…}'] += 1
            done.add(index)
            index += 1
            started = True
            continue

        match = IFRAME.match(line) if usable[index] else None
        if match:
            embed = iframe(match.group(2))
            if embed.startswith('::: '):
                fence_after_blank(index)
                out += [match.group(1) + embed, match.group(1) + ':::']
                report.counts['<iframe> -> ::: {.embed}'] += 1
                done.add(index)
                index += 1
                started = True
                continue
            why[index] = embed

        # An HTML comment is not content: a switch after one still starts the page.
        started = started or bool(texts[index].strip())
        out.append(line)
        index += 1
    return out, done, why


def details(path, lines, texts, index, match, languages, report):
    """(opening fence, index of the </details> line, index after the <summary>), or why not.
    `texts`: each line's Markdown text without inline code ('' outside Markdown)."""
    indent, attrs, rest = match.groups()
    found = attributes(attrs)
    others = [name for name, _ in found if name != 'class']
    classes = next((value.split() for name, value in found if name == 'class'), [])
    kind = kind_of(classes)
    if others:
        return 'a <details> with other attributes (' + ', '.join(others) + ')'
    if kind is None:
        return 'a <details> of the class "' + ' '.join(classes) + '"'
    kind, extra = kind
    rest = rest.strip()
    if rest:
        title, summary = SUMMARY.match(rest), index
    else:
        summary = index + 1
        tags = summary < len(lines) and re.search(r'<summary>', texts[summary], re.I) and re.search(r'</summary>', texts[summary], re.I)
        title = SUMMARY.match(lines[summary]) if tags else None
    if not title:
        return 'a <details> without <summary>…</summary> (alone on its line) right after it'
    # Its </details>: the first one at the same depth, alone at the end of a line.
    depth, close = 0, None
    for j in range(summary + 1, len(lines)):
        if DETAILS.match(texts[j]):
            depth += 1
        elif CLOSE.match(texts[j]):
            if depth == 0:
                close = j
                break
            depth -= 1
    if close is None:
        return 'a <details> without a </details> that ends a line'
    # The title stays Markdown, as Pandoc read the <summary> line's content.
    text = title.group(1).strip()
    langs = languages.get(path, set())
    keep = not (len(langs) == 1 and DEFAULT_TITLES.get(kind, {}).get(next(iter(langs))) == text)
    parts = ['.' + kind] + ['.' + c for c in extra] + ([f'title={quoted(text)}'] if keep else [])
    report.counts[f'<details{" class=" + chr(34) + " ".join(classes) + chr(34) if classes else ""}> -> ::: {{.{kind}}}'
                  + ('' if keep else ' (default title left out)')] += 1
    return f'{indent}::: {{{" ".join(parts)}}}', close, summary + 1


def iframe(attrs):
    """The .embed fence for an <iframe>'s attributes, or why there is none."""
    found = dict(attributes(attrs))
    for needed in ('src', 'title'):
        if not (found.get(needed) or '').strip():
            return f'an <iframe> without {needed}= (an .embed needs src and title)'
    height = None
    style = found.pop('style', None) or ''
    match = re.search(r'(?:^|;)\s*height\s*:\s*([^;]+?)\s*(?:;|$)', style)
    if match:
        height = match.group(1)
    elif re.fullmatch(r'\d+', found.get('height') or ''):
        height = found.pop('height') + 'px'
    if height and not LENGTH.match(height):
        return f'an <iframe> whose height {height} is not a length such as 920px, 40rem or 80vh'
    src, title = found.pop('src'), found.pop('title')
    found.pop('loading', None)
    parts = ['.embed', f'src={quoted(src)}', f'title={quoted(title)}'] + ([f'height={quoted(height)}'] if height else [])
    parts += [name if not value else f'{name}={quoted(value)}' for name, value in found.items()]
    return '::: {' + ' '.join(parts) + '}'


# ---------------------------------------------------------------- _quarto.yml
def edit_config(root, project, report):
    """--config: the tab-ids.lua line, markdown-lint: true, no course site scripts."""
    path = root / '_quarto.yml'
    lines = path.read_text(encoding='utf-8').split('\n')
    if not any(TAB_IDS in line for line in lines):
        start = next((i for i, line in enumerate(lines) if re.match(r'^filters:\s*$', line)), None)
        item = next((i for i in range(start + 1, len(lines)) if lines[i].strip()), None) if start is not None else None
        if item is None or not re.match(r'^\s*-\s', lines[item]):
            report.note('_quarto.yml', 1, f'add the tab-ids.lua line by hand, first in filters: - path: {TAB_IDS} / at: pre-ast')
        else:
            pad = re.match(r'^(\s*)-', lines[item]).group(1)
            lines[item:item] = [f'{pad}- path: {TAB_IDS}', f'{pad}  at: pre-ast']
            report.counts['_quarto.yml: the tab-ids.lua line'] += 1
    removed = []
    for script in SITE_SCRIPTS:
        for i, line in enumerate(lines):
            if re.match(r'^\s*-\s*["\']?' + re.escape(script) + r'["\']?\s*$', line):
                removed.append(script)
                del lines[i]
                break
    for i, line in enumerate(lines):
        if re.match(r'^\s*include-after-body:\s*$', line) and not (i + 1 < len(lines) and re.match(r'^\s*-\s', lines[i + 1])):
            del lines[i]
            break
    if removed:
        report.counts["_quarto.yml: the course's site scripts left out"] += len(removed)
    if not any(line.startswith('ctm-assessment:') for line in lines):
        while lines and not lines[-1].strip():
            lines.pop()
        lines += ['', 'ctm-assessment:', '  markdown-lint: true', '']
        report.counts['_quarto.yml: markdown-lint: true'] += 1
    elif not any(re.match(r'^\s+markdown-lint:', line) for line in lines):
        at = next(i for i, line in enumerate(lines) if line.startswith('ctm-assessment:'))
        lines.insert(at + 1, '  markdown-lint: true')
        report.counts['_quarto.yml: markdown-lint: true'] += 1
    path.write_text('\n'.join(lines), encoding='utf-8')
    texts = [p.read_text(encoding='utf-8') for p in root.glob('_quarto*.yml')]
    texts += [(root / f).read_text(encoding='utf-8') for f in project.files]
    for script in removed:
        if (root / script).is_file() and not any(script in text or Path(script).name in text for text in texts):
            (root / script).unlink()
            report.counts["the course's site script deleted"] += 1


# ---------------------------------------------------------------- main
def annotate(path, line, message, github):
    if github:
        message = message.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
        return f'::warning file={path},line={line},title=Raw HTML in Markdown::{message}'
    return f'{path}:{line}: {message}'


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('files', nargs='*', type=Path, help='Markdown files (default: the pages and the files they include)')
    parser.add_argument('--project', type=Path, default=Path('.'), help='The project folder (default: the current folder)')
    parser.add_argument('--ctm-libs', type=Path, metavar='DIR',
                        help="ctm-libs' extension folder, as the umbrella pins it (default: $CTM_LIBS_EXTENSION)")
    parser.add_argument('--switch', choices=('auto', 'marker', 'remove'), default='auto',
                        help='The hand-written switch: removed when it starts its file, else a ::: {.modes} marker (auto)')
    parser.add_argument('--config', action='store_true', help='Also edit _quarto.yml (see above)')
    parser.add_argument('--dry-run', action='store_true', help='Report what would change; change nothing')
    parser.add_argument('--check', action='store_true', help='Report raw HTML; change nothing')
    parser.add_argument('--baseline', type=Path, help='With --check: report only what this baseline does not list')
    parser.add_argument('--write-baseline', type=Path, metavar='FILE', help='Record the raw HTML of the project in FILE')
    parser.add_argument('--strict', action='store_true', help='With --check: exit 1 when something is reported')
    parser.add_argument('--format', choices=('github', 'text'),
                        default='github' if os.environ.get('GITHUB_ACTIONS') == 'true' else 'text',
                        help='--check output: GitHub annotations (default in GitHub Actions) or file:line lines')
    args = parser.parse_args(argv)
    root = args.project.resolve()
    if not root.is_dir():
        parser.error(f'no project folder {root}')
    if args.baseline and not args.check:
        parser.error('--baseline belongs to --check')
    try:
        project = Project(root, ctm_libs_extension(args.ctm_libs))
    except ToolError as error:
        parser.exit(2, f'{parser.prog}: error: {error}\n')
    files = project.files
    if args.files:
        files = []
        for file in args.files:
            full = (file if file.is_absolute() else Path.cwd() / file).resolve()
            if root not in full.parents:
                parser.error(f'{file} is not inside the project {root}')
            files.append(full.relative_to(root).as_posix())
    records = {}
    report = Report()
    # Anchors that repeat their tab heading's id: removed when the project
    # has (or --config adds) the tab-ids.lua line, else reported.
    duplicates = project.tab_anchor_duplicates()
    tab_ids = args.config or TAB_IDS in project.config
    for key in files:
        path = root / key
        lines = path.read_text(encoding='utf-8').split('\n')
        scanned = scan(lines)
        found = constructs(lines, scanned)
        if found:
            records[key] = found
        if args.write_baseline or not (found or (tab_ids and not args.check and duplicates.get(key))):
            continue
        drop = duplicates.get(key, {}) if tab_ids else {}
        if not tab_ids and not args.check:
            for index, identifier in sorted(duplicates.get(key, {}).items()):
                report.note(key, index + 1, f'the anchor #{identifier} repeats the id of the tab heading it follows: '
                                            'remove it once _quarto.yml has the tab-ids.lua line (--config adds it)')
        converted, done, why = convert_file(key, lines, scanned, project.languages, args.switch,
                                            Report() if args.check else report, drop)
        if args.check:
            for construct in found:
                if construct.line - 1 not in done:
                    construct.convertible = False
                    construct.reason = why.get(construct.line - 1) or construct.reason or 'not alone on its line'
            continue
        for construct in found:
            if construct.line - 1 not in done:
                reason = why.get(construct.line - 1) or construct.reason or 'not alone on its line'
                report.note(key, construct.line, f'left as it is ({reason}): {construct.key}')
        if converted != lines:
            report.counts['files changed'] += 1
            if not args.dry_run:
                path.write_text('\n'.join(converted), encoding='utf-8')

    if args.write_baseline:
        baseline = {'tool': 'ctm-assessment tools/migrate-course-html.py', 'version': 1,
                    'constructs': {file: sorted(c.key for c in found) for file, found in sorted(records.items())}}
        args.write_baseline.write_text(json.dumps(baseline, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
        print(f'{args.write_baseline}: {sum(len(keys) for keys in baseline["constructs"].values())} constructs '
              f'in {len(baseline["constructs"])} files')
        return 0

    if args.check:
        known = {}
        if args.baseline:
            data = json.loads(args.baseline.read_text(encoding='utf-8'))
            if not isinstance(data, dict) or data.get('version') != 1:
                parser.error(f'{args.baseline} is not a baseline of this tool (version 1)')
            known = {file: Counter(keys) for file, keys in data.get('constructs', {}).items()}
        reported = 0
        for file, found in sorted(records.items()):
            left = Counter(known.get(file, {}))
            for construct in found:
                if left[construct.key] > 0:
                    left[construct.key] -= 1
                    continue
                reported += 1
                tail = ('the course\'s migration converts it (ctm-assessment tools/migrate-course-html.py)'
                        if construct.convertible else f'convert it by hand ({construct.reason})')
                message = ('Not in the baseline: ' if args.baseline else '') + f'{ADVICE[construct.kind]}; {tail}. Found: {construct.key}'
                print(annotate(file, construct.line, message, args.format == 'github'))
        total = sum(len(found) for found in records.values())
        print(f'Raw HTML in Markdown: {total} in {len(records)} files; {reported} reported'
              + (f' beyond the baseline {args.baseline}' if args.baseline else '') + '.')
        return 1 if args.strict and reported else 0

    if args.config:
        if args.dry_run:
            report.note('_quarto.yml', 1, '--config is not applied in a dry run')
        else:
            edit_config(root, project, report)
    for name, count in sorted(report.counts.items()):
        print(f'{count:5d}  {name}')
    for note in report.notes:
        print(note)
    if args.dry_run:
        print('Dry run: no file was changed.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
