// CTM Assessment (AGPL-3.0-or-later): how the old page's <details> ended,
// for compare-rendered.mjs and compare-browser.mjs.
//
// A raw <details> with a heading inside it, in a course's Markdown, ends
// where the browser ends the heading's section: what follows stood outside
// it on old, and the migrated reveal holds it (`reveal: heading`, design
// §1.4 item 5). A reveal may hold the heading after it only then; a
// <details> whose own </details> came before the heading may not (a closing
// fence moved past the next heading, review A2b S1). The rendered HTML
// cannot tell the two apart (Quarto writes the page out again, without the
// stray </details>), so the course's Markdown does: tools/migrate-course-html.py
// --reveal-ends FILE, run on the old course, records it per page.
import fs from 'node:fs';

// Elements that components make: their <details> are not the course's.
export const COMPONENTS = '.math-exercise-cell, .py-exercise-cell, .ai-feedback-activity, [id^="qpyodide-insertion-location-"], .qpyodide-cell';

// The record's pages ({page: [closed by a section, ...]}), or null.
export function loadRevealEnds(file) {
  if (!file) return null;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (data?.version !== 1 || typeof data.pages !== 'object') throw new Error(`${file} is not a --reveal-ends record (version 1)`);
  return data.pages;
}

// For each of the old page's <details> elements: true when the record says
// a heading's section closed it. False when the record does not know the
// page or counts other <details> than the page has (the course's own, in
// order): then no reveal may take in a heading.
export function closedBySection(pages, page, details) {
  const flags = pages?.[page];
  const course = details.filter(d => !d.closest(COMPONENTS));
  const known = Array.isArray(flags) && flags.length === course.length;
  return details.map(d => known && course.includes(d) ? !!flags[course.indexOf(d)] : false);
}
