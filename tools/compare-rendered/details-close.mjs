// CTM Assessment (AGPL-3.0-or-later): how a page's raw <details> end, read
// from its HTML source (the DOM no longer tells). Shared by
// compare-rendered.mjs and compare-browser.mjs.
//
// For each <details> start tag, in document order (outside comments, scripts,
// styles, templates and text areas): true when the browser closes it at a
// section boundary, that is, no </details> of its own comes before the next
// <section> or </section> (or the end). That is how a raw <details> in a
// course's Markdown loses the heading that follows it: Pandoc puts the
// heading's section around what follows, and the browser ends the <details>
// there, leaving its </details> stray (design §1.4 item 5). A reveal may hold
// such a heading after the migration (`reveal: heading`); a <details> that
// had its own </details> before the heading may not.
export function closedBySection(html) {
  const blank = text => text.replace(/[^\n]/g, ' ');
  const text = String(html).replace(/<!--[\s\S]*?-->|<(script|style|template|textarea)\b[\s\S]*?<\/\1\s*>/gi, blank);
  const tokens = [...text.matchAll(/<(\/?)(details|section)(?=[\s>/])[^>]*>/gi)]
    .map(match => ({end: match[1] === '/', tag: match[2].toLowerCase()}));
  const found = [];
  tokens.forEach((token, index) => {
    if (token.end || token.tag !== 'details') return;
    let depth = 0, bySection = true;
    for (const next of tokens.slice(index + 1)) {
      if (next.tag === 'section') break;
      if (!next.end) depth++;
      else if (depth > 0) depth--;
      else { bySection = false; break; }
    }
    found.push(bySection);
  });
  return found;
}
