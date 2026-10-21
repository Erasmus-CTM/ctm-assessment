#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Generic network-refused loader + board regression harness; product probes are injected.
// CLI: node tools/offline-check.mjs --base http://127.0.0.1:8000/ --manifest pages.json --out result.json
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {checkBoards} from './board-check.mjs';

export async function launchOfflineBrowser() {
  if (/headless[-_]?shell/i.test(process.env.CHROMIUM_EXECUTABLE || ''))
    throw new Error('headless shell cannot establish the hidden-frame mechanism; use full Chromium');
  return chromium.launch({headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE ? {executablePath: process.env.CHROMIUM_EXECUTABLE} : {channel: 'chromium'}),
    args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
      '--disable-background-networking', '--no-proxy-server']});
}

export async function offlineContext(browser, baseURL) {
  const allowed = new URL(baseURL);
  if (allowed.hostname !== '127.0.0.1') throw new Error('offline harness server must use 127.0.0.1');
  const context = await browser.newContext({serviceWorkers: 'block', viewport: {width: 1280, height: 900}});
  const errors = [], external = [], responses = [], failed = [];
  await context.route('**/*', route => {
    const url = route.request().url();
    if (new URL(url).origin !== allowed.origin) {
      external.push(url);
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  // HTTP routing does not intercept WebSocket handshakes.
  await context.routeWebSocket('**/*', socket => {
    external.push(socket.url());
    socket.close({code: 1008, reason: 'offline checks prohibit WebSockets'});
  });
  context.on('response', response => { if (response.status() >= 400) responses.push({url: response.url(), status: response.status()}); });
  context.on('requestfailed', request => failed.push({url: request.url(), error: request.failure()?.errorText}));
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  return {context, evidence: {external, responses, failed, errors}};
}

export async function checkOfflinePages({browser, baseURL, pages, loads = 5, probes = [], settleMs = 1200, scope = 'course-regression'}) {
  if (!Number.isInteger(loads) || loads < 5) throw new Error('at least five loads per page are required');
  if (!Array.isArray(pages) || !pages.length) throw new Error('manifest needs at least one page');
  const results = [];
  for (const entry of pages) {
    if (!entry.path || new URL(entry.path, baseURL).origin !== new URL(baseURL).origin)
      throw new Error('manifest page must stay on the server');
    for (let load = 1; load <= loads; load++) {
      const {context, evidence} = await offlineContext(browser, baseURL);
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      const result = {path: entry.path, load, boards: [], evidence, problems: [], probes: [], externalLinks: []};
      try {
        await page.goto(new URL(entry.path, baseURL).href, {waitUntil: 'load'});
        if (!await page.evaluate(() => crossOriginIsolated)) result.problems.push('page is not cross-origin isolated');
        result.externalLinks = await page.locator('a[href]').evaluateAll(links => [...new Set(links.map(a => a.href)
          .filter(href => /^https?:/.test(href) && new URL(href).origin !== location.origin))].sort());
        result.boards = await checkBoards(page, {settleMs});
        if (entry.boards !== undefined && result.boards.length !== entry.boards)
          result.problems.push('expected ' + entry.boards + ' boards, found ' + result.boards.length);
        for (const board of result.boards) result.problems.push(...board.errors.map(error => String(board.board) + ': ' + error));
        for (const probe of probes) result.probes.push(await probe(page, entry));
        // Include loads started by frames, workers and final user interactions.
        await page.waitForTimeout(100);
      } catch (error) { result.problems.push(String(error.message)); }
      finally {
        await context.close();
        for (const key of ['external', 'responses', 'failed', 'errors'])
          if (evidence[key].length) result.problems.push(key + ': ' + JSON.stringify(evidence[key]));
      }
      result.ok = !result.problems.length;
      results.push(result);
    }
  }
  return {scope, loads, results, ok: results.every(result => result.ok)};
}

async function main() {
  const args = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i += 2) options[args[i]] = args[i + 1];
  if (!options['--base'] || !options['--manifest']) throw new Error('supply --base and --manifest');
  const manifest = JSON.parse(fs.readFileSync(options['--manifest'], 'utf8'));
  const browser = await launchOfflineBrowser();
  try {
    const result = await checkOfflinePages({browser, baseURL: options['--base'], pages: manifest.pages,
      loads: Number(options['--loads'] || 5)});
    const json = JSON.stringify(result, null, 2) + '\n';
    if (options['--out']) fs.writeFileSync(options['--out'], json);
    console.log(json);
    if (!result.ok) process.exitCode = 1;
  } finally { await browser.close(); }
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(error => { console.error(error); process.exitCode = 2; });
