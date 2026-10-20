#!/usr/bin/env node
// Old against new in real browsers (consolidation step 4, design §6.3): a
// course before its migration ("old": its raw HTML, its own site scripts and
// the package it pins) and after it ("new"), served from one origin
// (/old/ and /new/), in Chromium, Firefox or WebKit (Playwright).
//
//   node tools/compare-browser.mjs --old DIR --new DIR [--browser chromium] [--browser firefox] ...
//     [--expect tools/compare-rendered/expect/step4-migration.yml] [--course NAME] [--pages a.html,b.html]
//     [--offline] [--first-visit] [--max-links N] [--checks reveals,switch,...] [--shots DIR] [--report OUT.json] [--summary OUT.md]
//
// Checks, on the pages with reveals, the switch or links into tabs:
//  1. reveals: count per kind, summary texts and initial state equal; each
//     reveal holds the words it held on old, never fewer or others; more
//     only as old's words followed by exactly what came after it there,
//     and when that starts with a heading, only if old's <details> was
//     closed by that heading's section (a raw <details> closed early; not
//     one that had its own </details> before the heading);
//  2. the switch: reading opens and lecture closes every reading step, per
//     block; aria-pressed and the status text equal; the mode survives a
//     reload and another page; a new tab starts in lecture; it stands where
//     the old one stood (the same words before it in main, outside the
//     title block) or at the top of the page;
//  3. keyboard: Tab reaches both buttons, in no more presses than on old;
//     each summary takes focus and Enter and Space toggle it, as on old;
//     axe-core finds no new violation;
//  4. links: every link to an id on a page of the site, on load and on click
//     (a link in a closed tab, <details> or collapsed callout is opened
//     first, as a reader would): the right (nested) tab and every <details> around the target open, the
//     target below the header and still there 2 s later (pinned while the
//     layout settles), focus inside the viewport; the script's path is
//     asserted (its data-ctm-nav mark, a pushState for a link in the page),
//     since Chromium opens <details> on fragment navigation by itself; Back
//     and Forward; a link wins over a grouped tabset's stored choice without
//     changing it. A link that was dead on old and works now is reported;
//  5. print: reading steps open, the switch hidden, all restored afterwards;
//  6. look: screenshots of the switch and of each kind of reveal, closed and
//     open, at 1280 and 390 px (and dark, where both sites have Quarto's
//     light/dark toggle): at most 0.5 % of the pixels differ (a pixel
//     whose colour the other shot has within one pixel is anti-aliasing),
//     unless the expect file's `look` says otherwise (a height change, a new
//     look);
//  7. computed styles of every summary equal (component <details> included);
//  8. embedded content (not --offline): JSXGraph boards in reveals have a
//     finite size once opened; a Python cell in a reveal runs;
//  9. no console error on new that old did not have.
//
// --first-visit serves both sides without the cross-origin isolation headers
// and lets service workers run, so a page with Python cells isolates itself
// with coi-serviceworker on a first visit (it registers the worker and
// reloads), as on GitHub Pages; the links are then followed on that visit.
// Only the link loads are checked then (a click comes from a page already
// visited), and console errors are not compared: the reload aborts loads at
// random.
//
// `known-failures` in the expect file lists failures of new that are known
// and fixed elsewhere (a browser, the checks, which targets, and the fix):
// such a failure counts as expected and is reported, until the fix is
// pinned and the entry removed.
// Exit status: 0 when every check passes, 1 otherwise, 2 on errors.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';
import {closedBySection} from './compare-rendered/details-close.mjs';
const require = createRequire(import.meta.url);
const {JSDOM} = require('jsdom');
const yaml = require('js-yaml');
const playwright = require('playwright');

// ---------------------------------------------------------------- options
function options(argv) {
  const o = {browsers: [], pages: null, checks: null, offline: false, firstVisit: false, maxLinks: 0, expect: null, course: '', shots: null, report: null, summary: null};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i], value = argv[i + 1];
    if (flag === '--offline') { o.offline = true; continue; }
    if (flag === '--first-visit') { o.firstVisit = true; continue; }
    i++;
    if (flag === '--browser') o.browsers.push(value);
    else if (flag === '--pages') o.pages = value.split(',').filter(Boolean);
    else if (flag === '--checks') o.checks = value.split(',').filter(Boolean);
    else if (flag === '--max-links') o.maxLinks = Number(value);
    else if (['--old', '--new', '--expect', '--course', '--shots', '--report', '--summary'].includes(flag)) o[flag.slice(2)] = value;
    else throw new Error('Unknown option ' + flag);
  }
  if (!o.old || !o.new) throw new Error('Usage: compare-browser.mjs --old DIR --new DIR [--browser chromium] ...');
  if (!o.browsers.length) o.browsers = ['chromium'];
  o.old = path.resolve(o.old);
  o.new = path.resolve(o.new);
  return o;
}

// ---------------------------------------------------------------- the sites
const OLD_REVEALS = {'reading-step': 'reading-step', 'learning-hint': 'hint', 'solution-block': 'solution'};
// Elements that components make: their <details> are not the course's reveals.
const COMPONENTS = '.math-exercise-cell, .py-exercise-cell, .ai-feedback-activity, [id^="qpyodide-insertion-location-"], .qpyodide-cell';
const norm = text => String(text || '').replace(/\s+/g, ' ').trim();

function htmlPages(root) {
  return fs.readdirSync(root, {recursive: true}).map(String).map(p => p.split(path.sep).join('/'))
    .filter(p => p.endsWith('.html') && !p.split('/').some(part => part === 'site_libs' || part.endsWith('_files')))
    .sort();
}

// What a page holds, from its HTML: reveals (old: the courses' <details>; new:
// ctm-libs' reveals), the switch, ids, tabsets and the links to ids.
function inventory(root, page, side) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  const doc = new JSDOM(html).window.document;
  const reveals = [];
  // How each <details> ended in the source (unknown when the start tags and the DOM disagree).
  const all = [...doc.querySelectorAll('details')], ends = closedBySection(html);
  const bySection = details => ends.length === all.length && ends[all.indexOf(details)];
  for (const details of doc.querySelectorAll('main details')) {
    if (details.closest(COMPONENTS)) continue;
    let kind = null;
    if (side === 'new') kind = details.classList.contains('ctm-reveal') ? details.classList[1] : null;
    else if (!details.className.trim()) kind = 'details';
    else kind = Object.keys(OLD_REVEALS).find(c => details.classList.contains(c)) ? OLD_REVEALS[Object.keys(OLD_REVEALS).find(c => details.classList.contains(c))] : null;
    if (kind) reveals.push({kind, summary: norm(details.querySelector(':scope > summary')?.textContent), bySection: bySection(details)});
  }
  const links = [];
  const main = doc.querySelector('main') || doc.body;
  for (const a of main.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href');
    if (!href.includes('#') || href === '#' || a.matches('[role="tab"], [data-bs-toggle], .footnote-ref, .footnote-back, .anchorjs-link, .nav-link')) continue;
    if (/^[a-z]+:/i.test(href) || href.startsWith('//')) continue;
    if (a.closest('nav, #TOC, .sidebar, pre, code, .sourceCode')) continue;
    const url = new URL(href, 'http://site/' + page);
    let target = decodeURIComponent(url.pathname.slice(1));
    if (target.endsWith('/') || target === '') target += 'index.html';
    else if (!target.endsWith('.html')) target += '.html';
    const id = decodeURIComponent(url.hash.slice(1));
    if (id) links.push({href, page, target, id, text: norm(a.textContent).slice(0, 60)});
  }
  const groups = [...doc.querySelectorAll('.panel-tabset[data-group]')].map(set => set.getAttribute('data-group'));
  return {reveals, links, groups, switch: !!doc.querySelector(side === 'new' ? '.ctm-modes' : '[data-learning-mode]'),
    nav: !!doc.querySelector('script[src*="ctm-nav"]'), toggle: !!doc.querySelector('.quarto-color-scheme-toggle'),
    tabsets: doc.querySelectorAll('.panel-tabset').length, ids: new Set([...doc.querySelectorAll('[id]')].map(el => el.id)),
    tabTitles: new Set([...doc.querySelectorAll('.ctm-tab-target[id]')].map(el => el.id)),
    coi: !!doc.querySelector('script[src*="coi-serviceworker"]'),
    inTabs: new Set([...doc.querySelectorAll('.tab-pane [id], details [id]')].map(el => el.id)),
    boards: doc.querySelectorAll('main details iframe[name^="iframeJXG"]').length,
    cells: doc.querySelectorAll('main details [id^="qpyodide-insertion-location-"]').length};
}

// One origin for both sides; a folder serves its index.html, x serves x.html.
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.gif': 'image/gif', '.ico': 'image/x-icon'};
function serve(roots, isolated = true) {
  const server = http.createServer((request, response) => {
    const parts = decodeURIComponent(new URL(request.url, 'http://x').pathname).split('/');
    const root = roots[parts[1]];
    let file = root ? path.join(root, ...parts.slice(2)) : '';
    if (root && fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    else if (root && !fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html';
    if (!root || !file.startsWith(root) || !fs.existsSync(file)) { response.writeHead(404); response.end(); return; }
    // Without the isolation headers (--first-visit), as GitHub Pages serves a course.
    response.writeHead(200, {'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
      ...(isolated ? {'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'credentialless'} : {})});
    response.end(fs.readFileSync(file));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// ---------------------------------------------------------------- in the page
// What happened on the page: pushState calls, and for failure notes a trace
// of events, scrolls, focus calls and the script's marks.
const TRACE = `(() => {
  const t0 = performance.now(), trace = [];
  window.__ctmCompare = {push: 0, trace};
  const log = text => { if (trace.length < 40) trace.push(Math.round(performance.now() - t0) + ' ' + text); };
  const push = history.pushState;
  history.pushState = function () { window.__ctmCompare.push++; log('push'); return push.apply(this, arguments); };
  for (const type of ['load', 'pageshow', 'hashchange', 'popstate']) addEventListener(type, () => log(type + ' y' + Math.round(scrollY)), true);
  let scrolls = 0;
  addEventListener('scroll', () => { if (scrolls++ < 12) log('scroll y' + Math.round(scrollY)); }, {capture: true, passive: true});
  const focus = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function () { log('focus ' + this.tagName + (this.id ? '#' + this.id : '')); return focus.apply(this, arguments); };
  const set = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) { if (name === 'data-ctm-nav') log('mark ' + value); return set.apply(this, arguments); };
})();`;

// The target's state: visible, its panes and <details>, below the header, the
// focused element and whether it is in view, the script's mark.
function stateOf(id) {
  const target = document.getElementById(id);
  if (!target) return {exists: false};
  const header = document.getElementById('quarto-header');
  const fixed = header && /^(fixed|sticky)$/.test(getComputedStyle(header).position);
  const headerBottom = fixed ? header.getBoundingClientRect().bottom : 0;
  const panes = [], details = [];
  for (let node = target; node; node = node.parentElement) {
    if (node.classList?.contains('tab-pane')) panes.push(node.classList.contains('active'));
    if (node.tagName === 'DETAILS') details.push(node.open);
  }
  // A section's heading (Quarto stretches a :target section upwards); a tab
  // title's target: the tab row above its pane.
  let shown = target;
  if (target.tagName === 'SECTION' && /^H[1-6]$/.test(target.firstElementChild?.tagName || '')) shown = target.firstElementChild;
  if (target.classList.contains('ctm-tab-target')) shown = target.closest('.panel-tabset')?.querySelector(':scope > .nav, :scope > [role="tablist"]') || target;
  const focused = document.activeElement;
  const rect = focused && focused !== document.body ? focused.getBoundingClientRect() : null;
  return {
    exists: true, visible: target.getClientRects().length > 0, panes, details,
    top: Math.round(shown.getBoundingClientRect().top), headerBottom: Math.round(headerBottom), innerHeight,
    mark: target.getAttribute('data-ctm-nav'), hash: location.hash, push: window.__ctmCompare?.push || 0,
    trace: (window.__ctmCompare?.trace || []).join(' | '),
    focus: focused === document.body || !focused ? 'BODY' : focused.tagName + (focused.id ? '#' + focused.id : ''),
    // An empty anchor has no height: its top must be in view.
    focusInView: !!rect && (rect.height > 0 ? rect.bottom > Math.max(0, headerBottom - 2) : rect.top >= headerBottom - 2) && rect.top < innerHeight,
  };
}
// In the page: the words of an element (outside script and style), and the
// words in main before the switch (outside the title block).
function wordsIn(el) {
  const out = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest('script, style, template, noscript')) continue;
    out.push(...node.textContent.split(/\s+/).filter(Boolean));
  }
  return out;
}
const WORDS_IN = wordsIn.toString();
function switchPlace([selector, wordsInSource]) {
  const wordsIn = new Function('return ' + wordsInSource)();
  const box = document.querySelector(selector);
  if (!box) return null;
  const main = box.closest('main') || document.body, title = main.querySelector('#title-block-header');
  const range = document.createRange();
  range.setStart(main, 0);
  range.setEndBefore(box);
  const holder = document.createElement('div');
  holder.append(range.cloneContents());
  holder.querySelector('#title-block-header')?.remove();
  holder.querySelectorAll('script, style, template, noscript').forEach(el => el.remove());
  return wordsIn(holder).join(' ');
}

const works = s => s.exists && s.visible && s.panes.every(Boolean) && s.details.every(Boolean)
  && s.top >= s.headerBottom - 2 && s.top < s.innerHeight;
const describeState = s => s.exists ? `visible ${s.visible}, panes ${JSON.stringify(s.panes)}, details ${JSON.stringify(s.details)}, top ${s.top} (header ${s.headerBottom}), focus ${s.focus}${s.focusInView ? ' in view' : ' not in view'}, mark ${s.mark}` : 'no such id';

// ---------------------------------------------------------------- browsers
class Run {
  constructor(o, browserName, base, inventories, look) {
    Object.assign(this, {o, browserName, base, inventories, look});
    this.results = [];
    this.errors = {old: new Map(), new: new Map()};
  }

  record(check, page, ok, detail = {}) {
    // A known failure (expect file `known-failures`) is expected until its fix is pinned.
    const known = ok ? null : (this.known || []).find(k => (!k.browsers || k.browsers.includes(this.browserName))
      && (!k.checks || k.checks.includes(check)) && (!k.courses || k.courses.includes(this.o.course))
      && (!k.targets || k.targets !== 'tab-title' || detail.tabTitle));
    if (known) {
      ok = true;
      detail = {...detail, expected: true, known: known.id, note: `known failure (${known.id}: ${known.title}): ${detail.note || ''}`};
    }
    this.results.push({browser: this.browserName, check, page, ok, ...detail});
    if (!ok) console.log(`  ${this.browserName} ${check} ${page}: FAILED ${detail.note || ''}`);
  }

  // A fresh browser context. Python (Pyodide) and the code editor (Monaco)
  // load only for the embedded-content check (`python`): elsewhere they
  // would only cost time, on both sides alike.
  async context(side, contextOptions = {}, python = false) {
    const context = await this.browser.newContext({viewport: {width: 1280, height: 900}, serviceWorkers: this.o.firstVisit ? 'allow' : 'block', ...contextOptions});
    await context.addInitScript(TRACE);
    if (this.o.offline) await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
    else if (!python) await context.route(/\/pyodide\/v[\d.]+\/|\/monaco-editor@/, route => route.abort());
    context.on('page', page => this.watch(page, side));
    return context;
  }

  watch(page, side) {
    const add = message => {
      // Ports, sides and random ids (the URLs coi-serviceworker's fetches name) are not the error.
      const key = norm(message).replace(/https?:\/\/127\.0\.0\.1:\d+\/((old|new)\/)?/g, '/')
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>').replace(/:\d+:\d+/g, '').slice(0, 200);
      const errors = this.errors[side];
      if (!errors.has(key)) errors.set(key, page.url().replace(this.base + side + '/', ''));
    };
    page.on('pageerror', error => add(error.message));
    page.on('console', message => {
      if (message.type() !== 'error') return;
      const text = message.text();
      // Resources (fonts, CDNs while offline or blocked, favicons) are not the
      // page's errors; WebKit reports a blocked fetch as "access control checks".
      if (/Failed to load resource|ERR_FAILED|net::|NS_ERROR|blocked|status of 404|downloadable font|cannot load .* due to access control checks/i.test(text)) return;
      add(text);
    });
  }

  url(side, page, hash = '') { return this.base + side + '/' + page + (hash ? '#' + encodeURIComponent(hash) : ''); }

  // --first-visit: on a page with coi-serviceworker, wait for the worker's
  // reload (crossOriginIsolated), as long as a reader would see it happen
  // (5 s; WebKit is not isolated by it); "none" on a page without it.
  async isolation(page) {
    // The worker's reload may destroy the page's context while we ask: ask again.
    for (let k = 0; k < 17; k++) {
      const seen = await page.evaluate(() => ({coi: !!document.querySelector('script[src*="coi-serviceworker"]'),
        isolated: window.crossOriginIsolated, ready: document.readyState === 'complete'})).catch(() => null);
      if (seen?.isolated && seen.ready) return 'isolated';
      if (seen && seen.ready && !seen.coi) return 'none';
      await page.waitForTimeout(300);
    }
    return 'not isolated';
  }

  async settle(page, ms = 700) {
    await page.waitForTimeout(ms);
  }

  // A full load (not a fragment navigation within the page shown).
  async load(page, side, url, id) {
    // A page may still be navigating (Firefox interrupts one about:blank by another).
    await page.goto('about:blank').catch(() => page.waitForTimeout(300));
    await page.goto(url, {waitUntil: 'load', timeout: 60000}).catch(() => {});
    if (this.o.firstVisit) page.ctmIsolated = await this.isolation(page);
    if (id && side === 'new') {
      await page.waitForFunction(id => document.getElementById(id)?.getAttribute('data-ctm-nav') === 'load', id, {timeout: 10000}).catch(() => {});
    }
    await this.settle(page, side === 'new' ? 700 : 1500);
  }

  async run() {
    // CHROMIUM_EXECUTABLE: a local Chromium; CTM_BROWSER_PROXY: a proxy for the CDNs (as browser-smoke.cjs).
    // Chromium draws text with coloured (LCD) edges except on a composited
    // layer: grayscale everywhere, so a moved element is drawn alike.
    this.browser = await playwright[this.browserName].launch({headless: true,
      ...(this.browserName === 'chromium' ? {args: ['--disable-lcd-text']} : {}),
      ...(this.browserName === 'chromium' && process.env.CHROMIUM_EXECUTABLE ? {executablePath: process.env.CHROMIUM_EXECUTABLE} : {}),
      ...(process.env.CTM_BROWSER_PROXY ? {proxy: {server: process.env.CTM_BROWSER_PROXY, bypass: '127.0.0.1,localhost'}} : {})});
    try {
      for (const [name, check] of [['reveals', this.reveals], ['switch', this.switches], ['keyboard', this.keyboard], ['links', this.links],
        ['groups', this.groups], ['print', this.print], ['look', this.looks], ['styles', this.styles], ['embedded', this.embedded]]) {
        if (this.o.checks && !this.o.checks.includes(name)) continue;
        console.log(`${this.browserName}: ${name}`);
        try {
          await check.call(this);
        } catch (error) {
          this.record(name, '-', false, {note: 'the check stopped: ' + (error.stack || error.message).split('\n').slice(0, 3).join(' ')});
        }
      }
      // On a first visit the worker's reload aborts whatever is loading, at
      // a moment that differs from load to load: the console is compared in
      // the run without --first-visit.
      if (this.o.firstVisit) {
        this.record('console', '-', true, {note: `not compared on a first visit (${this.errors.new.size} distinct console errors on new, ${this.errors.old.size} on old)`});
      } else {
        for (const [key, page] of this.errors.new) {
          if (!this.errors.old.has(key)) this.record('console', page, false, {note: 'a console error new has and old had not: ' + key});
        }
        this.record('console', '-', true, {note: `${this.errors.new.size} distinct console errors on new, ${this.errors.old.size} on old`});
      }
    } finally {
      await this.browser.close();
    }
  }

  // Pages with reveals or a switch on either side.
  revealPages() {
    return Object.entries(this.inventories).filter(([, v]) => v.old && v.new && (v.old.reveals.length || v.new.reveals.length || v.old.switch || v.new.switch)).map(([page]) => page);
  }

  // 1. Reveals: kinds, summaries, initial state.
  async reveals() {
    for (const page of this.revealPages()) {
      const seen = {};
      for (const side of ['old', 'new']) {
        const context = await this.context(side);
        const tab = await context.newPage();
        await this.load(tab, side, this.url(side, page));
        // Old: also the words that follow each reveal in main. New: whether
        // the word after old's words (counts) is in a heading inside the reveal.
        const counts = side === 'new' ? (seen.old || []).map(r => r.words.length) : [];
        seen[side] = await tab.evaluate(([side, components, kinds, wordsSource, counts]) => {
          const wordsIn = new Function('return ' + wordsSource)();
          const textNodes = root => {
            const out = [], walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node; node = walker.nextNode())
              if (!node.parentElement?.closest('script, style, template, noscript')) out.push(node);
            return out;
          };
          const main = document.querySelector('main') || document.body, mainText = textNodes(main);
          return [...document.querySelectorAll('main details')].filter(d => !d.closest(components)).map(d => {
            let kind = null;
            if (side === 'new') kind = d.classList.contains('ctm-reveal') ? d.classList[1] : null;
            else if (!d.className.trim()) kind = 'details';
            else for (const [c, k] of Object.entries(kinds)) if (d.classList.contains(c)) kind = k;
            return kind && {d, kind};
          }).filter(Boolean).map(({d, kind}, k) => {
            const found = {kind, summary: (d.querySelector(':scope > summary')?.textContent || '').replace(/\s+/g, ' ').trim(), open: d.open, words: wordsIn(d)};
            if (side === 'old') {
              const after = [];
              for (const node of mainText) {
                if (after.length >= 3000) break;
                if (!d.contains(node) && d.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) after.push(...node.textContent.split(/\s+/).filter(Boolean));
              }
              found.after = after;
            } else if (counts[k] !== undefined && counts[k] < found.words.length) {
              let seen = 0;
              for (const node of textNodes(d)) {
                seen += node.textContent.split(/\s+/).filter(Boolean).length;
                if (seen <= counts[k]) continue;
                const heading = node.parentElement?.closest('h1, h2, h3, h4, h5, h6');
                found.headingFirst = !!heading && d.contains(heading);
                break;
              }
            }
            return found;
          });
        }, [side, COMPONENTS, OLD_REVEALS, WORDS_IN, counts]);
        await context.close();
      }
      const head = r => r && {kind: r.kind, summary: r.summary, open: r.open};
      const same = JSON.stringify(seen.old.map(head)) === JSON.stringify(seen.new.map(head));
      const counts = side => Object.entries(seen[side].reduce((c, r) => ({...c, [r.kind]: (c[r.kind] || 0) + 1}), {})).map(([k, n]) => `${n} ${k}`).join(', ');
      let note = same ? counts('new') : '';
      if (!same) {
        const k = seen.old.findIndex((r, i) => JSON.stringify(head(r)) !== JSON.stringify(head(seen.new[i])));
        note = `old ${counts('old')} / new ${counts('new')}; first difference at ${k}: ${JSON.stringify(head(seen.old[k]))} -> ${JSON.stringify(head(seen.new[k]))}`;
      }
      // Each reveal keeps its words, never fewer or others. More only as old's
      // words followed by exactly what followed it on old; when that starts
      // with a heading, only where old's <details> was closed by the
      // heading's section (as compare-rendered.mjs: "heading", else
      // "swallowed"); otherwise "grown" (what a list item cut short).
      const problems = [];
      const grown = {heading: 0, grown: 0};
      const old = this.inventories[page].old.reveals;
      if (same) seen.old.forEach((o, k) => {
        const n = seen.new[k], ow = o.words.join(' '), nw = n.words.join(' ');
        if (ow === nw) return;
        const where = `"${o.summary}" (${k + 1}) holds ${n.words.length} words, on old ${o.words.length}`;
        if (!nw.startsWith(ow + ' ')) { problems.push(where + (ow.startsWith(nw) ? ': it ends early' : ': other words')); return; }
        const extra = n.words.slice(o.words.length);
        if (o.after.slice(0, extra.length).join(' ') !== extra.join(' ')) problems.push(where + ': more than what followed it on old');
        else if (n.headingFirst && !(old.length === seen.old.length && old[k].bySection))
          problems.push(where + ': it took in the heading after it, which old\'s <details> had ended before (its own </details>)');
        else grown[n.headingFirst ? 'heading' : 'grown']++;
      });
      if (problems.length) note = problems.join('; ');
      else if (grown.heading || grown.grown) note += `; ${grown.heading + grown.grown} hold more than on old, exactly what followed them there`
        + ` (${grown.heading} a heading that closed a raw <details> early, ${grown.grown} other)`;
      this.record('reveals', page, same && !problems.length, {note});
    }
  }

  // 2. The switch.
  async switches() {
    const pages = this.revealPages().filter(page => this.inventories[page].old.switch || this.inventories[page].new.switch);
    for (const page of pages) {
      const inv = this.inventories[page];
      if (inv.old.switch && !inv.new.switch) {
        const steps = inv.new.reveals.filter(r => r.kind === 'reading-step').length;
        this.record('switch', page, steps === 0, {expected: steps === 0, note: steps === 0 ? 'old had a switch on a page without reading steps; new has none' : 'new has no switch'});
        continue;
      }
      const seen = {};
      for (const side of ['old', 'new']) {
        const context = await this.context(side);
        const tab = await context.newPage();
        await this.load(tab, side, this.url(side, page));
        const sw = side === 'old' ? '[data-learning-mode]' : '.ctm-modes';
        const read = () => tab.evaluate(([sw]) => {
          const box = document.querySelector(sw);
          const status = box?.querySelector('[role="status"], .ctm-modes-status');
          return {visible: !!box && box.getClientRects().length > 0 && getComputedStyle(box).visibility !== 'hidden',
            labels: [...(box?.querySelectorAll('button[data-mode]') || [])].map(b => b.textContent.trim()),
            pressed: [...(box?.querySelectorAll('button[data-mode]') || [])].map(b => b.getAttribute('aria-pressed')),
            status: (status?.textContent || '').trim(),
            steps: [...document.querySelectorAll('main details.reading-step')].map(d => d.open)};
        }, [sw]);
        const result = {initial: await read(), place: await tab.evaluate(switchPlace, [sw, WORDS_IN]).catch(() => null)};
        await tab.click(sw + ' button[data-mode="reading"]');
        await tab.waitForTimeout(250);
        result.reading = await read();
        await tab.reload();
        await this.settle(tab, side === 'new' ? 700 : 1500);
        result.reload = await read();
        // Another page of the course with a switch keeps the mode.
        const other = Object.keys(this.inventories).find(p => p !== page && this.inventories[p][side]?.switch && this.inventories[p][side].reveals.some(r => r.kind === 'reading-step'));
        if (other) {
          await tab.goto(this.url(side, other));
          await this.settle(tab, side === 'new' ? 700 : 1500);
          result.other = await read();
          await tab.goto(this.url(side, page));
          await this.settle(tab, side === 'new' ? 700 : 1500);
        }
        await tab.click(sw + ' button[data-mode="lecture"]');
        await tab.waitForTimeout(250);
        result.lecture = await read();
        await tab.click(sw + ' button[data-mode="reading"]');
        await tab.waitForTimeout(250);
        await context.close();
        // A new tab (a new session) starts in lecture.
        const fresh = await this.context(side);
        const first = await fresh.newPage();
        await this.load(first, side, this.url(side, page));
        const s = await first.evaluate(sel => [...document.querySelectorAll('main details.reading-step')].map(d => d.open), sw);
        result.fresh = s;
        await fresh.close();
        seen[side] = result;
      }
      const n = seen.new, o = seen.old, problems = [];
      if (!n.initial.visible) problems.push('the switch is not shown');
      if (!n.reading.steps.every(Boolean)) problems.push('reading leaves a reading step closed');
      if (n.lecture.steps.some(Boolean)) problems.push('lecture leaves a reading step open');
      if (!n.initial.steps.every(open => !open)) problems.push('a reading step starts open in lecture mode');
      if (!n.reload.steps.every(Boolean)) problems.push('reading mode is lost on reload');
      if (n.other && !n.other.steps.every(Boolean)) problems.push('reading mode is lost on another page');
      if (n.fresh.some(Boolean)) problems.push('a new tab does not start in lecture');
      for (const key of ['initial', 'reading', 'lecture']) {
        if (JSON.stringify(n[key].pressed) !== JSON.stringify(o[key].pressed)) problems.push(`aria-pressed ${key}: old ${o[key].pressed} new ${n[key].pressed}`);
        if (key !== 'initial' && n[key].status !== o[key].status) problems.push(`status text after ${key}: old "${o[key].status}" new "${n[key].status}"`);
      }
      if (JSON.stringify(n.initial.labels) !== JSON.stringify(o.initial.labels)) problems.push(`labels: old ${o.initial.labels} new ${n.initial.labels}`);
      // Where the old one stood, or at the top of the page.
      if (n.place && n.place !== o.place) problems.push(`the switch moved: on old after "${(o.place || '').slice(-80)}", on new after "${n.place.slice(-80)}"`);
      this.record('switch', page, !problems.length, {note: problems.join('; ') || `${n.reading.steps.length} reading steps follow the switch; mode kept on reload${n.other ? ' and another page' : ''}`});
    }
  }

  // 3. Keyboard and axe-core.
  async keyboard() {
    let axe = null;
    try { axe = require.resolve('axe-core/axe.min.js'); } catch (_) { /* optional */ }
    for (const page of this.revealPages()) {
      const seen = {};
      for (const side of ['old', 'new']) {
        const context = await this.context(side);
        const tab = await context.newPage();
        await this.load(tab, side, this.url(side, page));
        const sw = side === 'old' ? '[data-learning-mode]' : '.ctm-modes';
        const result = {buttons: null, summaries: []};
        if (await tab.$(sw + ' button')) {
          // Tab from the top of the page to the switch's first button, then the second.
          await tab.evaluate(() => { window.scrollTo(0, 0); document.activeElement?.blur(); });
          let presses = 0, reached = false;
          for (; presses < 400 && !reached; presses++) {
            await tab.keyboard.press('Tab');
            reached = await tab.evaluate(sw => document.activeElement?.matches(sw + ' button[data-mode="lecture"]'), sw);
          }
          let second = false;
          if (reached) {
            await tab.keyboard.press('Tab');
            second = await tab.evaluate(sw => document.activeElement?.matches(sw + ' button[data-mode="reading"]'), sw);
          }
          result.buttons = {reached, second, presses};
        }
        const count = await tab.evaluate(([side, components]) => [...document.querySelectorAll('main details')].filter(d => !d.closest(components)
          && (side === 'new' ? d.classList.contains('ctm-reveal') : true)).length, [side, COMPONENTS]);
        for (let k = 0; k < Math.min(count, 12); k++) {
          const handle = await tab.evaluateHandle(([side, components, k]) => [...document.querySelectorAll('main details')].filter(d => !d.closest(components)
            && (side === 'new' ? d.classList.contains('ctm-reveal') : true))[k].querySelector(':scope > summary'), [side, COMPONENTS, k]);
          const summary = handle.asElement();
          if (!summary) continue;
          await summary.evaluate(s => { s.scrollIntoView({block: 'center'}); s.focus(); });
          const focused = await summary.evaluate(s => document.activeElement === s);
          const open = () => summary.evaluate(s => s.parentElement.open);
          const before = await open();
          let enter = null, space = null;
          if (focused) {
            await tab.keyboard.press('Enter');
            await tab.waitForTimeout(80);
            enter = (await open()) !== before;
            await tab.keyboard.press(' ');
            await tab.waitForTimeout(80);
            space = (await open()) === before;
          }
          result.summaries.push([focused, enter, space]);
        }
        if (axe) {
          await tab.addScriptTag({path: axe});
          result.axe = await tab.evaluate(async () => (await window.axe.run(document, {resultTypes: ['violations']})).violations.map(v => v.id).sort());
        }
        await context.close();
        seen[side] = result;
      }
      const problems = [];
      if (seen.old.buttons && seen.new.buttons) {
        if (seen.old.buttons.reached && !seen.new.buttons.reached) problems.push('Tab does not reach the switch');
        if (seen.old.buttons.second && !seen.new.buttons.second) problems.push('Tab does not go on to the second button');
        if (seen.old.buttons.reached && seen.new.buttons.reached && seen.new.buttons.presses > seen.old.buttons.presses)
          problems.push(`Tab reaches the switch later than on old (${seen.new.buttons.presses} presses, old ${seen.old.buttons.presses}): it moved down`);
      }
      if (JSON.stringify(seen.old.summaries) !== JSON.stringify(seen.new.summaries)) {
        problems.push(`summaries [focus, Enter toggles, Space toggles]: old ${JSON.stringify(seen.old.summaries)} new ${JSON.stringify(seen.new.summaries)}`);
      }
      const added = (seen.new.axe || []).filter(id => !(seen.old.axe || []).includes(id));
      if (added.length) problems.push('new axe-core violations: ' + added.join(', '));
      this.record('keyboard', page, !problems.length, {note: problems.join('; ') || `switch ${seen.new.buttons ? (seen.new.buttons.reached ? `reached in ${seen.new.buttons.presses} Tabs` : 'not reached by Tab (nor on old)') : 'none'}; ${seen.new.summaries.length} summaries${seen.new.axe ? `; axe-core: ${seen.new.axe.length} rules violated, as on old` : ''}`});
    }
  }

  // 4. Links: load, click, Back/Forward, pinned targets.
  async links() {
    const links = [], seen = new Set();
    for (const [page, v] of Object.entries(this.inventories)) {
      for (const link of v.new?.links || []) {
        const key = page + ' ' + link.href;
        // Links into pages with tabs or reveals, where ctm-nav.js handles them.
        if (seen.has(key) || !this.inventories[link.target]?.new?.nav) continue;
        seen.add(key);
        links.push(link);
      }
    }
    const chosen = this.o.maxLinks > 0 ? links.slice(0, this.o.maxLinks) : links;
    const targets = [...new Map(chosen.map(link => [link.target + '#' + link.id, link])).values()];
    const dead = side => link => !this.inventories[link.target]?.[side]?.ids.has(link.id);
    // On load.
    for (const link of targets) {
      const name = link.target + '#' + link.id;
      if (dead('new')(link)) {
        const before = dead('old')(link);
        this.record('link load', name, before, {note: before ? 'dead on old and new (a missing id in the course)' : 'the id is gone on new'});
        continue;
      }
      const state = {};
      for (const side of ['old', 'new']) {
        const context = await this.context(side);
        const tab = await context.newPage();
        await this.load(tab, side, this.url(side, link.target, link.id), link.id);
        state[side] = await tab.evaluate(stateOf, link.id);
        if (side === 'new') {
          state.isolation = tab.ctmIsolated;
          await tab.waitForTimeout(2200);
          state.later = await tab.evaluate(stateOf, link.id);
        }
        await context.close();
      }
      const n = state.new, problems = [];
      if (!works(n)) problems.push('not shown: ' + describeState(n));
      if (n.mark !== 'load') problems.push('not handled by ctm-nav.js (no data-ctm-nav="load")');
      if (!n.focusInView) problems.push('focus not in view: ' + n.focus);
      if (!works(state.later)) problems.push('not kept in place: 2 s later ' + describeState(state.later));
      const was = dead('old')(link) ? 'dead on old' : works(state.old) ? 'shown on old' : 'not shown on old (' + describeState(state.old) + ')';
      if (problems.length) problems.push('trace: ' + state.later.trace);
      const visit = this.o.firstVisit ? `; first visit: ${state.isolation}` : '';
      this.record('link load', name, !problems.length, {note: (problems.join('; ') || `shown, focus ${n.focus}; ${was}`) + visit, expected: dead('old')(link) || undefined,
        previouslyDead: dead('old')(link) || undefined, tabTitle: this.inventories[link.target]?.new?.tabTitles.has(link.id) || undefined});
    }
    // On click, from the page with the link; Back and Forward for the first
    // link of each page. Not on a first visit: a click comes from a page the
    // reader has seen, whose worker already runs.
    const backTried = new Set();
    for (const link of this.o.firstVisit ? [] : chosen) {
      if (dead('new')(link)) continue;
      const name = link.page + ' -> ' + link.href;
      const state = {}, history = {};
      for (const side of ['old', 'new']) {
        if (side === 'old' && (dead('old')(link) || !this.inventories[link.page]?.old)) continue;
        const context = await this.context(side);
        const tab = await context.newPage();
        await this.load(tab, side, this.url(side, link.page));
        // The link, by its address (Quarto's scripts rewrite hrefs), may sit in a
        // closed tab, <details> or collapsed callout: open them as a reader would.
        const found = await tab.evaluate(href => {
          const page = url => { const u = new URL(url, location.href); return u.origin + u.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '') + u.hash; };
          const wanted = page(href);
          const anchor = [...document.querySelectorAll('main a[href]')].find(a => page(a.href) === wanted);
          if (!anchor) return false;
          for (let node = anchor; node; node = node.parentElement) {
            if (node.tagName === 'DETAILS') node.open = true;
            // A collapsed callout (Quarto: .callout-collapse.collapse, opened by its header).
            if (node.classList?.contains('collapse') && !node.classList.contains('show')) {
              node.classList.add('show');
              const toggle = node.id && document.querySelector(`[data-bs-target="#${CSS.escape(node.id)}"]`);
              if (toggle) { toggle.classList.remove('collapsed'); toggle.setAttribute('aria-expanded', 'true'); }
            }
            if (node.classList?.contains('tab-pane') && !node.classList.contains('active') && node.id) {
              const tab = document.querySelector(`[data-bs-target="#${CSS.escape(node.id)}"], [href="#${CSS.escape(node.id)}"]`);
              if (tab && window.bootstrap?.Tab) window.bootstrap.Tab.getOrCreateInstance(tab).show(); else tab?.click();
            }
          }
          anchor.setAttribute('data-ctm-compare-link', '');
          anchor.scrollIntoView({block: 'center'});
          return true;
        }, link.href);
        if (!found) { await context.close(); continue; }
        await tab.waitForTimeout(400);
        const samePage = link.target === link.page;
        const y = await tab.evaluate(() => scrollY);
        const push = await tab.evaluate(() => window.__ctmCompare.push);
        await Promise.all([
          samePage ? Promise.resolve() : tab.waitForEvent('load', {timeout: 30000}).catch(() => {}),
          tab.click('[data-ctm-compare-link]', {timeout: 10000}).catch(() => {}),
        ]);
        if (this.o.firstVisit && !samePage) await this.isolation(tab);
        if (side === 'new') {
          await tab.waitForFunction(([id, how]) => document.getElementById(id)?.getAttribute('data-ctm-nav') === how,
            [link.id, samePage ? 'link' : 'load'], {timeout: 10000}).catch(() => {});
        }
        await this.settle(tab, side === 'new' ? 700 : 1500);
        state[side] = await tab.evaluate(stateOf, link.id);
        state[side].pushes = state[side].push - (samePage ? push : 0);
        if (samePage && !backTried.has(side + link.page)) {
          backTried.add(side + link.page);
          await tab.goBack();
          await this.settle(tab, 900);
          const back = await tab.evaluate(() => ({y: scrollY, hash: location.hash}));
          await tab.goForward();
          await this.settle(tab, 900);
          history[side] = {before: y, back, forward: await tab.evaluate(stateOf, link.id)};
        }
        await context.close();
      }
      const n = state.new;
      if (!n) { this.record('link click', name, false, {note: 'the link is not on new'}); continue; }
      const problems = [];
      if (!works(n)) problems.push('not shown: ' + describeState(n));
      if (n.mark !== (link.target === link.page ? 'link' : 'load')) problems.push('not handled by ctm-nav.js (mark ' + n.mark + ')');
      if (link.target === link.page && n.pushes < 1) problems.push('no pushState');
      if (!n.focusInView) problems.push('focus not in view: ' + n.focus);
      if (history.new) {
        if (Math.abs(history.new.back.y - history.new.before) > 60) problems.push(`Back: at ${history.new.back.y}, was ${history.new.before}`);
        if (!works(history.new.forward)) problems.push('Forward: ' + describeState(history.new.forward));
      }
      const was = !state.old ? 'dead on old' : works(state.old) ? 'shown on old' : 'not shown on old';
      if (problems.length) problems.push('trace: ' + n.trace);
      this.record('link click', name, !problems.length, {note: problems.join('; ') || `shown, focus ${n.focus}${history.new ? ', Back and Forward' : ''}; ${was}`,
        tabTitle: this.inventories[link.target]?.new?.tabTitles.has(link.id) || undefined});
    }
    const previously = this.results.filter(r => r.previouslyDead && r.ok).map(r => r.page);
    this.record('links', '-', true, {note: `${chosen.length} links to ${targets.length} targets; previously dead, now working: ${previously.join(', ') || 'none'}`});
  }

  // A link into a grouped tabset wins over the stored choice and leaves it.
  async groups() {
    for (const [page, v] of Object.entries(this.inventories)) {
      if (!v.new?.groups.length) continue;
      const context = await this.context('new');
      const tab = await context.newPage();
      await this.load(tab, 'new', this.url('new', page));
      const plan = await tab.evaluate(() => {
        for (const set of document.querySelectorAll('.panel-tabset[data-group]')) {
          const tabs = [...set.querySelectorAll(':scope > .nav [role="tab"], :scope > [role="tablist"] [role="tab"]')];
          const panes = [...set.querySelectorAll(':scope > .tab-content > .tab-pane')];
          const k = panes.findIndex((pane, i) => i > 0 && pane.querySelector('[id]'));
          if (k > 0) return {group: set.getAttribute('data-group'), first: tabs[0].textContent.trim(), id: panes[k].querySelector('[id]').id};
        }
        return null;
      });
      if (!plan) { await context.close(); continue; }
      await tab.evaluate(([group, first]) => localStorage.setItem('quarto-persistent-tabsets-data', JSON.stringify({[group]: first})), [plan.group, plan.first]);
      const stored = await tab.evaluate(() => localStorage.getItem('quarto-persistent-tabsets-data'));
      // The link in a new tab of the same browser (the stored choice is the origin's).
      const linked = await context.newPage();
      await this.load(linked, 'new', this.url('new', page, plan.id), plan.id);
      const s = await linked.evaluate(stateOf, plan.id);
      const after = await linked.evaluate(() => localStorage.getItem('quarto-persistent-tabsets-data'));
      await context.close();
      const problems = [];
      if (!works(s)) problems.push('the link does not win over the stored group: ' + describeState(s));
      if (after !== stored) problems.push(`the stored group changed: ${stored} -> ${after}`);
      this.record('groups', page + '#' + plan.id, !problems.length, {note: problems.join('; ') || `shown over the stored choice ${stored}, which is kept`});
    }
  }

  // 5. Print: reading steps open, the switch hidden; restored afterwards.
  async print() {
    for (const page of this.revealPages()) {
      if (!this.inventories[page].new.reveals.some(r => r.kind === 'reading-step')) continue;
      const seen = {};
      for (const side of ['old', 'new']) {
        const context = await this.context(side);
        const tab = await context.newPage();
        await this.load(tab, side, this.url(side, page));
        const sw = side === 'old' ? '[data-learning-mode]' : '.ctm-modes';
        const read = () => tab.evaluate(sw => ({steps: [...document.querySelectorAll('main details.reading-step')].map(d => d.open),
          switch: document.querySelector(sw) ? getComputedStyle(document.querySelector(sw)).display : 'none'}), sw);
        const before = await read();
        await tab.emulateMedia({media: 'print'});
        await tab.evaluate(() => dispatchEvent(new Event('beforeprint')));
        await tab.waitForTimeout(150);
        const printing = await read();
        await tab.evaluate(() => dispatchEvent(new Event('afterprint')));
        await tab.emulateMedia({media: 'screen'});
        await tab.waitForTimeout(150);
        seen[side] = {before, printing, after: await read()};
        await context.close();
      }
      const n = seen.new, problems = [];
      if (!n.printing.steps.every(Boolean)) problems.push('a reading step stays closed in print');
      if (n.printing.switch !== 'none') problems.push('the switch is printed');
      if (JSON.stringify(n.after.steps) !== JSON.stringify(n.before.steps)) problems.push('the reading steps are not restored after printing');
      this.record('print', page, !problems.length, {note: problems.join('; ') || `${n.printing.steps.length} reading steps open in print, switch hidden; old: ${seen.old.printing.steps.every(Boolean) ? 'the same' : 'steps closed'}`});
    }
  }

  // 6. Look: screenshots, old against new.
  lookRule(shot) {
    return (this.look || []).find(rule => (rule.shots || []).includes(shot) && (!rule.courses || rule.courses.includes(this.o.course)));
  }

  async looks() {
    const kinds = {'reading-step': ['details.reading-step', 'details.ctm-reveal.reading-step'], hint: ['details.learning-hint', 'details.ctm-reveal.hint'],
      solution: ['details.solution-block', 'details.ctm-reveal.solution'], details: ['main details:not([class])', 'details.ctm-reveal.details']};
    const wanted = [['switch', '[data-learning-mode]', '.ctm-modes', null]];
    for (const [kind, [oldSelector, newSelector]] of Object.entries(kinds)) {
      wanted.push([kind + '-closed', oldSelector, newSelector, false], [kind + '-open', oldSelector, newSelector, true]);
    }
    const pageFor = shot => this.revealPages().find(page => {
      const v = this.inventories[page];
      return shot === 'switch' ? v.old.switch && v.new.switch : v.new.reveals.some(r => r.kind === shot.replace(/-(open|closed)$/, '')) && v.old.reveals.some(r => r.kind === shot.replace(/-(open|closed)$/, ''));
    });
    const differ = await this.browser.newPage();
    // Dark too, where both sites have Quarto's light/dark toggle.
    const schemes = Object.values(this.inventories).some(v => v.old?.toggle && v.new?.toggle) ? ['light', 'dark'] : ['light'];
    for (const [width, scheme] of [1280, 390].flatMap(width => schemes.map(scheme => [width, scheme]))) {
      for (const [shot, oldSelector, newSelector, open] of wanted) {
        const page = pageFor(shot);
        if (!page) continue;
        const images = {};
        for (const side of ['old', 'new']) {
          const context = await this.context(side, {viewport: {width, height: 900}});
          const tab = await context.newPage();
          await this.load(tab, side, this.url(side, page));
          if (scheme === 'dark') {
            await tab.evaluate(() => document.querySelector('.quarto-color-scheme-toggle')?.click());
            await tab.waitForTimeout(300);
          }
          await tab.addStyleTag({content: '#quarto-header, .headroom, #quarto-sidebar-toggle-title, .quarto-secondary-nav { visibility: hidden !important; }'});
          const selector = side === 'old' ? oldSelector : newSelector;
          // The first such element, shown: its tabs and <details> are opened as a reader would.
          const element = (await tab.evaluateHandle(([selector, components]) => {
            const el = [...document.querySelectorAll(selector)].find(el => !el.closest(components));
            for (let node = el?.parentElement; node; node = node.parentElement) {
              if (node.tagName === 'DETAILS') node.open = true;
              if (node.classList?.contains('tab-pane') && !node.classList.contains('active') && node.id) {
                const tab = document.querySelector(`[data-bs-target="#${CSS.escape(node.id)}"], [href="#${CSS.escape(node.id)}"]`);
                if (tab && window.bootstrap?.Tab) window.bootstrap.Tab.getOrCreateInstance(tab).show(); else tab?.click();
              }
            }
            return el || null;
          }, [selector, COMPONENTS])).asElement();
          if (!element) { await context.close(); continue; }
          await tab.waitForTimeout(300);
          await element.evaluate((el, open) => {
            if (open !== null) el.open = open;
            el.scrollIntoView({block: 'center'});
          }, open);
          await tab.evaluate(() => document.fonts?.ready);
          await tab.waitForTimeout(400);
          // The same element at another fractional position renders its text
          // differently: both sides are moved to whole pixels.
          await element.evaluate(el => {
            const r = el.getBoundingClientRect();
            el.style.willChange = 'transform';
            el.style.translate = `${Math.round(r.left) - r.left}px ${Math.round(r.top) - r.top}px`;
          });
          images[side] = await element.screenshot({animations: 'disabled', timeout: 15000}).catch(() => null);
          await context.close();
        }
        if (!images.old || !images.new) continue;
        const name = `${shot} ${width}px${scheme === 'dark' ? ' dark' : ''}`;
        const result = await differ.evaluate(async ([a, b]) => {
          const decode = async data => { const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode(); return image; };
          const [x, y] = [await decode(a), await decode(b)];
          const w = Math.min(x.width, y.width), h = Math.min(x.height, y.height);
          const pixels = image => { const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h; const g = canvas.getContext('2d'); g.drawImage(image, 0, 0); return g.getImageData(0, 0, w, h).data; };
          const [p, q] = [pixels(x), pixels(y)];
          // A pixel differs when neither image has its colour within one pixel
          // of it in the other: text drawn a fraction of a pixel apart is the
          // same text (anti-aliasing), a changed colour or a moved block is not.
          const close = (a, i, b, j) => Math.abs(a[i] - b[j]) <= 24 && Math.abs(a[i + 1] - b[j + 1]) <= 24 && Math.abs(a[i + 2] - b[j + 2]) <= 24;
          const near = (a, b, px, py) => {
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
              const nx = px + dx, ny = py + dy;
              if (nx >= 0 && ny >= 0 && nx < w && ny < h && close(a, 4 * (py * w + px), b, 4 * (ny * w + nx))) return true;
            }
            return false;
          };
          let differ = 0;
          const box = [w, h, -1, -1];
          for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
            const i = 4 * (py * w + px);
            if (!close(p, i, q, i) && !(near(p, q, px, py) && near(q, p, px, py))) {
              differ++;
              box[0] = Math.min(box[0], px); box[1] = Math.min(box[1], py); box[2] = Math.max(box[2], px); box[3] = Math.max(box[3], py);
            }
          }
          return {old: [x.width, x.height], new: [y.width, y.height], ratio: w * h ? differ / (w * h) : 1, box: differ ? box : null};
        }, [images.old.toString('base64'), images.new.toString('base64')]);
        if (this.o.shots) {
          fs.mkdirSync(this.o.shots, {recursive: true});
          for (const side of ['old', 'new']) fs.writeFileSync(path.join(this.o.shots, `${this.browserName}-${width}${scheme === 'dark' ? '-dark' : ''}-${shot}-${side}.png`), images[side]);
        }
        const rule = this.lookRule(shot);
        const dh = result.new[1] - result.old[1], dw = result.new[0] - result.old[0];
        const problems = [];
        if (dw !== 0) problems.push(`width ${result.old[0]} -> ${result.new[0]} px`);
        const heightAllowed = rule?.height === 'any' || (Array.isArray(rule?.height) && dh >= rule.height[0] && dh <= rule.height[1]);
        if (dh !== 0 && !heightAllowed) problems.push(`height ${result.old[1]} -> ${result.new[1]} px`);
        if (result.ratio > 0.005 && rule?.pixels !== 'any') problems.push(`${(100 * result.ratio).toFixed(2)} % of the pixels differ (in x ${result.box[0]}-${result.box[2]}, y ${result.box[1]}-${result.box[3]} of ${result.new[0]} x ${result.new[1]})`);
        const expected = !!rule && (dh !== 0 || result.ratio > 0.005);
        this.record('look', name, !problems.length, {expected: expected || undefined, rule: rule?.id,
          note: problems.join('; ') || `${(100 * result.ratio).toFixed(2)} % of the pixels differ, height ${dh >= 0 ? '+' : ''}${dh} px${expected ? ' (expected: ' + rule.id + ')' : ''}`});
      }
    }
    await differ.close();
  }

  // 7. Computed styles of every summary (closed).
  async styles() {
    const props = ['display', 'cursor', 'font-weight', 'font-size', 'font-style', 'font-family', 'color', 'list-style-type', 'padding-top', 'padding-left', 'line-height'];
    for (const page of this.revealPages()) {
      const seen = {};
      for (const side of ['old', 'new']) {
        const context = await this.context(side);
        const tab = await context.newPage();
        await this.load(tab, side, this.url(side, page));
        seen[side] = await tab.evaluate(([side, props, kinds]) => [...document.querySelectorAll('summary')].map(summary => {
          const details = summary.parentElement;
          if (details.open) details.open = false;
          let kind = 'component ' + [...details.classList].join('.');
          if (side === 'new' && details.classList.contains('ctm-reveal')) kind = details.classList[1];
          else if (side === 'old' && details.closest('main') && !details.className.trim()) kind = 'details';
          else if (side === 'old') for (const [c, k] of Object.entries(kinds)) if (details.classList.contains(c)) kind = k;
          const style = getComputedStyle(summary);
          return {kind, style: props.map(p => style.getPropertyValue(p)).join('|')};
        }), [side, props, OLD_REVEALS]);
        await context.close();
      }
      const problems = [];
      const byKind = side => seen[side].reduce((m, s) => ({...m, [s.kind]: [...(m[s.kind] || []), s.style]}), {});
      const [o, n] = [byKind('old'), byKind('new')];
      for (const kind of new Set([...Object.keys(o), ...Object.keys(n)])) {
        if (this.lookRule(kind + '-closed')?.styles === 'any') continue;
        let [a, b] = [o[kind] || [], n[kind] || []];
        // Components make their <details> as they need them: the first of each kind on both sides.
        if (kind.startsWith('component')) [a, b] = a.length && b.length ? [a.slice(0, 1), b.slice(0, 1)] : [[], []];
        if (a.length !== b.length) { problems.push(`${kind}: ${a.length} summaries on old, ${b.length} on new`); continue; }
        const k = a.findIndex((style, i) => style !== b[i]);
        if (k >= 0) {
          const [x, y] = [a[k].split('|'), b[k].split('|')];
          problems.push(`${kind} #${k + 1}: ` + props.filter((p, i) => x[i] !== y[i]).map(p => `${p} ${x[props.indexOf(p)]} -> ${y[props.indexOf(p)]}`).join(', '));
        }
      }
      this.record('styles', page, !problems.length, {note: problems.join('; ') || `${seen.new.length} summaries, the same computed styles`});
    }
  }

  // 8. Boards and Python cells inside reveals (needs the network).
  async embedded() {
    if (this.o.offline) return;
    for (const page of this.revealPages()) {
      const inv = this.inventories[page];
      if (!inv.new.boards && !inv.new.cells) continue;
      const seen = {};
      for (const side of ['old', 'new']) {
        const context = await this.context(side, {}, true);
        const tab = await context.newPage();
        tab.setDefaultTimeout(120000);
        await this.load(tab, side, this.url(side, page));
        const result = {boards: [], python: null};
        const frames = await tab.$$('main details iframe[name^="iframeJXG"]');
        for (const frame of frames.slice(0, 4)) {
          await frame.evaluate(el => { for (let node = el; node; node = node.parentElement) if (node.tagName === 'DETAILS') node.open = true; el.scrollIntoView({block: 'center'}); });
          await tab.waitForTimeout(1500);
          const box = await frame.boundingBox();
          const inner = await (await frame.contentFrame())?.evaluate(() => [...document.querySelectorAll('.jxgbox')].map(b => {
            const r = b.getBoundingClientRect();
            return Number.isFinite(r.width) && Number.isFinite(r.height) && r.width > 0 && r.height > 0;
          })).catch(() => null);
          result.boards.push(!!box && box.width > 0 && box.height > 0 && (!inner || inner.every(Boolean)));
        }
        const cell = await tab.$('main details [id^="qpyodide-insertion-location-"]');
        if (cell) {
          await cell.evaluate(el => { for (let node = el; node; node = node.parentElement) if (node.tagName === 'DETAILS') node.open = true; el.scrollIntoView({block: 'center'}); });
          const run = await tab.waitForSelector('main details .qpyodide-button-run:not([disabled])', {timeout: 120000}).catch(() => null);
          if (run) {
            await run.click();
            result.python = await tab.waitForFunction(() => [...document.querySelectorAll('main details .qpyodide-output-code-stdout, main details .qpyodide-output-code-stderr, main details .qpyodide-output-graph-area img, main details .qpyodide-output-graph-area canvas')]
              .some(el => el.textContent.trim() || el.tagName !== 'DIV'), null, {timeout: 120000}).then(() => true).catch(() => false);
          }
        }
        seen[side] = result;
        await context.close();
      }
      const problems = [];
      if (seen.new.boards.some(ok => !ok)) problems.push(`boards ${JSON.stringify(seen.new.boards)} (old ${JSON.stringify(seen.old.boards)})`);
      if (seen.new.python === false && seen.old.python !== false) problems.push('the Python cell in a reveal does not run');
      this.record('embedded', page, !problems.length, {note: problems.join('; ') || `${seen.new.boards.length} boards with a finite size${seen.new.python === null ? '' : seen.new.python ? '; a Python cell ran' : '; the Python cell ran on neither'}`});
    }
  }
}

// ---------------------------------------------------------------- main
async function main() {
  const o = options(process.argv.slice(2));
  const expect = o.expect ? yaml.load(fs.readFileSync(o.expect, 'utf8')) || {} : {};
  const look = expect.look || [], known = expect['known-failures'] || [];
  const pages = o.pages || [...new Set([...htmlPages(o.old), ...htmlPages(o.new)])];
  const inventories = {};
  for (const page of pages) {
    inventories[page] = {};
    for (const side of ['old', 'new']) {
      const root = side === 'old' ? o.old : o.new;
      if (fs.existsSync(path.join(root, page))) inventories[page][side] = inventory(root, page, side);
    }
  }
  const server = await serve({old: o.old, new: o.new}, !o.firstVisit);
  const base = `http://127.0.0.1:${server.address().port}/`;
  const results = [];
  try {
    for (const browserName of o.browsers) {
      const run = new Run(o, browserName, base, inventories, look);
      run.known = known;
      await run.run();
      results.push(...run.results);
    }
  } finally {
    server.close();
  }
  const failed = results.filter(r => !r.ok);
  const knownFailures = results.filter(r => r.known).length;
  const lines = [`### Browser comparison${o.course ? ' of ' + o.course : ''}, old against new (${o.browsers.join(', ')}${o.firstVisit ? ', first visit without isolation headers' : ''}): ${results.length} checks, ${failed.length} failed${knownFailures ? `, ${knownFailures} known failures` : ''}`, ''];
  const byCheck = {};
  for (const r of results) {
    const key = r.browser + ' ' + r.check;
    byCheck[key] ||= {ok: 0, failed: 0, expected: 0};
    byCheck[key][r.ok ? 'ok' : 'failed']++;
    if (r.ok && r.expected) byCheck[key].expected++;
  }
  for (const [key, v] of Object.entries(byCheck)) lines.push(`- **${key}**: ${v.ok} passed${v.expected ? ` (${v.expected} with an expected difference)` : ''}${v.failed ? `, **${v.failed} failed**` : ''}`);
  const notes = results.filter(r => r.ok && (r.expected || r.page === '-'));
  if (notes.length) {
    lines.push('', '**Expected differences and notes:**');
    for (const r of notes.slice(0, 60)) lines.push(`- ${r.browser} ${r.check} \`${r.page}\`: ${r.note}`);
  }
  if (failed.length) {
    lines.push('', '**Failed:**');
    for (const r of failed.slice(0, 80)) lines.push(`- ${r.browser} ${r.check} \`${r.page}\`: ${r.note}`);
  }
  const md = lines.join('\n') + '\n';
  if (o.report) fs.writeFileSync(o.report, JSON.stringify({old: o.old, new: o.new, browsers: o.browsers, results}, null, 1));
  if (o.summary) fs.writeFileSync(o.summary, md);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  console.log(md);
  process.exit(failed.length ? 1 : 0);
}

main().catch(error => { console.error(error); process.exit(2); });
