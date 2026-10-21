// SPDX-License-Identifier: AGPL-3.0-or-later
// Canonical Step-5 board geometry check. This never resizes or repairs a board.
export const BOARD_FRAMES = 'iframe[name^="iframeJXG"], iframe[data-ctm-board]';

async function reveal(element) {
  // Actual toggles matter: opening DOM classes here would bypass product code.
  const ancestors = await element.evaluateHandle(el => {
    const nodes = [];
    for (let n = el; n; n = n.parentElement) nodes.unshift(n);
    return nodes;
  });
  try {
    const count = await ancestors.evaluate(nodes => nodes.length);
    for (let i = 0; i < count; i++) {
      const node = await ancestors.evaluateHandle((nodes, i) => nodes[i], i);
      try {
        const toggle = await node.evaluateHandle(n => {
          if (n.matches('details:not([open])')) return n.querySelector(':scope > summary');
          if (n.matches('.math-exercise') && !n.classList.contains('math-exercise-open'))
            return n.querySelector('.math-exercise-toggle[aria-expanded="false"]');
          if (n.matches('.tab-pane:not(.active), .collapse:not(.show)')) {
            return [...document.querySelectorAll('[data-bs-target], [data-target], a[href^="#"]')].find(t => {
              const selector = t.getAttribute('data-bs-target') || t.getAttribute('data-target') || t.getAttribute('href');
              try { return selector && selector !== '#' && n.matches(selector); } catch { return false; }
            }) || null;
          }
          return null;
        });
        try {
          if (toggle.asElement()) {
            await toggle.asElement().click();
            // Wait for Bootstrap's collapsing/fade transitions without mutating classes.
            await node.evaluate(n => new Promise(resolve => {
              const started = performance.now();
              const poll = () => {
                if (!n.matches('.collapsing') && performance.now() - started >= 400) resolve();
                else if (performance.now() - started > 3000) resolve();
                else setTimeout(poll, 25);
              };
              poll();
            }));
          }
        } finally { await toggle.dispose(); }
      } finally { await node.dispose(); }
    }
  } finally { await ancestors.dispose(); }
}

async function revealFrame(frame) {
  if (!frame.parentFrame()) return;
  await revealFrame(frame.parentFrame());
  const element = await frame.frameElement();
  try {
    await reveal(element);
    await element.scrollIntoViewIfNeeded();
    if (!await element.isVisible()) throw new Error('board iframe remains hidden: ' + frame.url());
  } finally { await element.dispose(); }
}

export function geometryProblems(record, tolerance = 2) {
  const errors = [];
  if (!record.visible) errors.push('board box is hidden');
  if (!(record.box.width > 0 && record.box.height > 0)) errors.push('board box is zero');
  if (!record.svg) errors.push('board has no SVG');
  else {
    for (const axis of ['width', 'height']) {
      const value = record.svg[axis];
      if (!(value > 0)) errors.push('SVG ' + axis + ' is zero');
      else if (Math.abs(value - record.box[axis]) > tolerance)
        errors.push('SVG ' + axis + ' differs from board box by more than ' + tolerance + 'px');
    }
  }
  if (!record.drawn) errors.push('no drawn element has a nonzero box');
  return errors;
}

export async function checkBoards(page, {settleMs = 1200, attachTimeoutMs = 30000} = {}) {
  const records = [];
  // Known board frames must contain a board; unknown frames are inspected too.
  // Playwright may inspect opaque-origin srcdoc/data frames without weakening sandbox.
  const frames = [...page.frames()];
  for (const frame of frames) {
    const parent = frame.parentFrame();
    const frameElement = parent ? await frame.frameElement() : null;
    const expected = frameElement ? await frameElement.evaluate((el, selector) => el.matches(selector), BOARD_FRAMES) : false;
    if (frameElement) await frameElement.dispose();
    if (expected) await frame.locator('.jxgbox, [data-ctm-board-box]').first().waitFor({state: 'attached', timeout: attachTimeoutMs}).catch(() => {});
    const count = await frame.locator('.jxgbox, [data-ctm-board-box]').count();
    if (parent && (expected || count)) await revealFrame(frame);
    if (expected && !count) {
      records.push({frame: frame.url(), board: null, errors: ['board iframe contains no board box']});
      continue;
    }
    for (let index = 0; index < count; index++) {
      const board = frame.locator('.jxgbox, [data-ctm-board-box]').nth(index);
      const handle = await board.elementHandle();
      await reveal(handle);
      await handle.dispose();
      await board.scrollIntoViewIfNeeded();
      await page.waitForTimeout(settleMs);
      const record = await board.evaluate(el => {
        const box = el.getBoundingClientRect(), style = getComputedStyle(el);
        const svg = el.querySelector('svg');
        // Client rect measures the actual SVG viewport, not a viewBox or frame.
        const viewport = svg?.getBoundingClientRect();
        const drawn = svg ? [...svg.querySelectorAll('path, text, line, circle, ellipse, polygon, polyline, rect, image, use')]
          .some(n => {
            if (n.closest('defs, clipPath, marker, pattern')) return false;
            const r = n.getBoundingClientRect(), s = getComputedStyle(n);
            return (r.width > 0 || r.height > 0) && s.display !== 'none' && s.visibility === 'visible' && Number(s.opacity) > 0;
          }) : false;
        return {board: el.id || null, box: {width: box.width, height: box.height},
          svg: viewport ? {width: viewport.width, height: viewport.height} : null,
          visible: style.visibility === 'visible' && style.display !== 'none' && el.getClientRects().length > 0,
          drawn};
      });
      record.frame = frame.url();
      record.errors = geometryProblems(record);
      records.push(record);
    }
  }
  return records;
}
