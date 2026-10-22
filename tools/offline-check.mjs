#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Generic network-refused loader + board regression harness; product probes are injected.
// CLI: node tools/offline-check.mjs --base http://127.0.0.1:8000/ --manifest pages.json --out result.json
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {randomUUID} from 'node:crypto';
import {JSDOM} from 'jsdom';
import {checkBoards} from './board-check.mjs';

export async function launchOfflineBrowser() {
  if (/headless[-_]?shell/i.test(process.env.CHROMIUM_EXECUTABLE || ''))
    throw new Error('headless shell cannot establish the hidden-frame mechanism; use full Chromium');
  return chromium.launch({headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE ? {executablePath: process.env.CHROMIUM_EXECUTABLE} : {channel: 'chromium'}),
    args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
      '--disable-background-networking', '--no-proxy-server']});
}

export function installOfflineAudit({channel, early = false, sourceOnly = false}) {
    const canonicalScript = '(' + installOfflineAudit.toString() + ')(' + JSON.stringify({channel, early: true}) + ');';
    if (sourceOnly) return canonicalScript;
    if (early && document.currentScript === document.scripts[0] &&
        document.currentScript?.matches('script[data-ctm-offline-audit]') &&
        document.currentScript.textContent === canonicalScript)
      globalThis.__ctmOfflineEarlyAudit = {channel, executed: true};
    if (globalThis.__ctmOfflineAudit?.installed) return;
    globalThis.__ctmOfflineAudit = {version: 1, installed: false};
    const pending = new Set(), auditErrors = [];
    const absolute = input => {
      try {
        const value = input && typeof input === 'object' && 'url' in input ? input.url : String(input);
        let url;
        try { url = new URL(value); }
        catch { url = new URL(value, document.baseURI); }
        return /^(https?:)$/.test(url.protocol) ? url.href : null;
      } catch { return null; } // Native APIs still receive the untouched input.
    };
    let nextId = 0;
    const acknowledgements = new Map();
    const send = (url, kind, documentURL) => {
      if (typeof globalThis.__ctmOfflineRecordAttempt === 'function')
        return globalThis.__ctmOfflineRecordAttempt(url, kind, documentURL);
      if (parent === globalThis) return Promise.reject(new Error('top-level audit binding is absent'));
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        acknowledgements.set(id, {resolve, reject});
        parent.postMessage({channel, type: 'ctm-audit-request', id, url, kind, documentURL}, '*');
      });
    };
    globalThis.addEventListener('message', event => {
      const data = event.data;
      if (!data || data.channel !== channel) return;
      if (data.type === 'ctm-audit-ack' && event.source === parent) {
        const acknowledgement = acknowledgements.get(data.id);
        if (!acknowledgement) return;
        acknowledgements.delete(data.id);
        if (data.error) acknowledgement.reject(new Error(data.error));
        else acknowledgement.resolve();
      } else if (data.type === 'ctm-audit-request' &&
          [...document.querySelectorAll('iframe')].some(frame => frame.contentWindow === event.source)) {
        Promise.resolve(send(data.url, data.kind, data.documentURL)).then(
          () => event.source.postMessage({channel, type: 'ctm-audit-ack', id: data.id}, '*'),
          error => event.source.postMessage({channel, type: 'ctm-audit-ack', id: data.id, error: String(error)}, '*'));
      }
    });
    const record = (input, kind) => {
      const url = absolute(input);
      if (!url) return;
      let promise;
      try { promise = send(url, kind, document.URL); }
      catch (error) { auditErrors.push(String(error)); return; }
      pending.add(promise);
      promise.then(() => pending.delete(promise), error => {
        pending.delete(promise);
        auditErrors.push(String(error));
      });
    };
    let resources;
    const collectResources = entries => entries.forEach(entry => record(entry.name, 'resource'));
    try {
      resources = new PerformanceObserver(list => collectResources(list.getEntries()));
      resources.observe({type: 'resource', buffered: true});
    } catch (error) { auditErrors.push('resource audit unavailable: ' + String(error)); }
    const checkSource = (value, kind) => {
      if (value === null) return;
      let html = value;
      if (kind === 'src') {
        if (!/^data:text\/html(?:[;,])/i.test(value)) return;
        try {
          const comma = value.indexOf(',');
          html = /;base64$/i.test(value.slice(0, comma)) ? atob(value.slice(comma + 1)) : decodeURIComponent(value.slice(comma + 1));
        } catch { auditErrors.push('unaudited opaque document: invalid data HTML'); return; }
      }
      const template = document.createElement('template');
      template.innerHTML = html; // Inert fragment: scripts and resources never execute.
      const first = template.content.querySelector('script');
      if (!first?.matches('script[data-ctm-offline-audit]') || first.textContent !== canonicalScript)
        auditErrors.push('unaudited opaque document: dynamic ' + kind + ' is refused');
    };
    const checkFrame = frame => {
      if (frame.hasAttribute('srcdoc')) checkSource(frame.getAttribute('srcdoc'), 'srcdoc');
      else checkSource(frame.getAttribute('src'), 'src');
    };
    const inspectMutations = records => {
      for (const mutation of records) {
        if (mutation.type === 'attributes' && mutation.target.matches('iframe')) {
          checkSource(mutation.oldValue, mutation.attributeName);
          checkFrame(mutation.target);
        } else if (mutation.type === 'childList') {
          for (const node of [...mutation.addedNodes, ...mutation.removedNodes]) if (node.nodeType === 1) {
            if (node.matches('iframe')) checkFrame(node);
            node.querySelectorAll('iframe').forEach(checkFrame);
          }
        }
      }
    };
    const mutations = new MutationObserver(inspectMutations);
    mutations.observe(document, {subtree: true, childList: true, attributes: true,
      attributeFilter: ['src', 'srcdoc'], attributeOldValue: true});
    globalThis.__ctmOfflineDrainAttempts = async () => {
      if (resources) collectResources(resources.takeRecords());
      inspectMutations(mutations.takeRecords());
      while (pending.size) {
        const completed = await Promise.race([Promise.allSettled([...pending]).then(() => true),
          new Promise(resolve => setTimeout(() => resolve(false), 10000))]);
        if (!completed) return [...auditErrors, 'request audit acknowledgement timeout'];
      }
      return auditErrors.slice();
    };
    const nativeFetch = globalThis.fetch;
    if (nativeFetch) globalThis.fetch = function (...args) {
      record(args[0], 'fetch');
      return Reflect.apply(nativeFetch, this, args);
    };
    if (nativeFetch) globalThis.fetch.__ctmOfflineAuditWrapped = true;
    const xhr = globalThis.XMLHttpRequest?.prototype;
    if (xhr) {
      const urls = new WeakMap(), open = xhr.open, send = xhr.send;
      xhr.open = function (...args) {
        const result = Reflect.apply(open, this, args);
        urls.set(this, absolute(args[1]));
        return result;
      };
      xhr.send = function (...args) {
        if (urls.get(this)) record(urls.get(this), 'xhr');
        return Reflect.apply(send, this, args);
      };
    }
    const proto = globalThis.ServiceWorkerContainer?.prototype;
    if (proto) proto.register = function (url) {
      record(url, 'service-worker');
      return Promise.reject(new DOMException('Service workers are blocked by offline checks', 'NotAllowedError'));
    };
    globalThis.__ctmOfflineAudit.installed = true;
}

// Preserve all author bytes except the added audit script and iframe attributes.
// JSDOM parses locations only; it never executes scripts or fetches resources.
export function instrumentOfflineHTML(source, script) {
  const dom = new JSDOM(source, {includeNodeLocations: true});
  try {
    const edits = [];
    const quote = value => '"' + value.replaceAll('&', '&amp;').replaceAll('"', '&quot;') + '"';
    for (const frame of dom.window.document.querySelectorAll('iframe')) {
      const locations = dom.nodeLocation(frame)?.attrs;
      if (frame.hasAttribute('srcdoc') && locations?.srcdoc) {
        const loc = locations.srcdoc;
        edits.push({start: loc.startOffset, end: loc.endOffset,
          text: 'srcdoc=' + quote(instrumentOfflineHTML(frame.getAttribute('srcdoc'), script))});
      } else {
        const src = frame.getAttribute('src') || '';
        if (!/^data:text\/html(?:[;,])/i.test(src) || !locations?.src) continue;
        const comma = src.indexOf(','), header = src.slice(0, comma), data = src.slice(comma + 1);
        const decoded = /;base64$/i.test(header) ? Buffer.from(data, 'base64').toString('utf8') : decodeURIComponent(data);
        const loc = locations.src;
        edits.push({start: loc.startOffset, end: loc.endOffset,
          text: 'src=' + quote('data:text/html;base64,' + Buffer.from(instrumentOfflineHTML(decoded, script)).toString('base64'))});
      }
    }
    const head = dom.nodeLocation(dom.window.document.head);
    const body = dom.nodeLocation(dom.window.document.body);
    const firstNode = dom.window.document.querySelector('script');
    const first = firstNode && dom.nodeLocation(firstNode);
    const doctype = dom.window.document.doctype && dom.nodeLocation(dom.window.document.doctype);
    const start = head?.startTag?.endOffset ?? Math.min(body?.startTag?.endOffset ?? Infinity,
      first?.startOffset ?? Infinity);
    edits.push({start: Number.isFinite(start) ? start : doctype?.endOffset || 0,
      end: Number.isFinite(start) ? start : doctype?.endOffset || 0, text: script});
    for (const edit of edits.sort((a, b) => b.start - a.start))
      source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
    return source;
  } finally { dom.window.close(); }
}

export async function offlineContext(browser, baseURL) {
  const allowed = new URL(baseURL);
  if (allowed.hostname !== '127.0.0.1') throw new Error('offline harness server must use 127.0.0.1');
  const context = await browser.newContext({serviceWorkers: 'allow', viewport: {width: 1280, height: 900}});
  const channel = 'ctm-offline-' + randomUUID();
  const canonicalScript = installOfflineAudit({channel, sourceOnly: true});
  const script = '<script data-ctm-offline-audit>' + canonicalScript + '</script>';
  const errors = [], external = [], responses = [], failed = [], attempts = [];
  const documents = new Map(), verified = new Set(), committed = new Set();
  // Playwright 1.55's serviceWorkers:'block' script reads navigator.serviceWorker,
  // whose getter throws in opaque sandboxed frames. Block registration ourselves
  // through the constructor prototype without reading that getter.
  await context.exposeBinding('__ctmOfflineRecordAttempt', ({frame}, url, kind, documentURL) => {
    const attempt = {url, kind, frame: documentURL || frame.url()};
    attempts.push(attempt);
    if (new URL(url).origin !== allowed.origin) external.push(url);
  });
  await context.addInitScript(installOfflineAudit, {channel});
  const drain = async () => {
    for (const page of context.pages()) for (const frame of page.frames()) {
      try {
        const state = await frame.evaluate(async expected => {
          const first = document.querySelector('script');
          const early = first?.matches('script[data-ctm-offline-audit]') && first.textContent === expected.script &&
            globalThis.__ctmOfflineEarlyAudit?.executed === true && globalThis.__ctmOfflineEarlyAudit.channel === expected.channel;
          if (!early) return {installed: false, reason: 'unaudited opaque or replaced document', documentURL: document.URL};
          if (globalThis.__ctmOfflineAudit?.version !== 1 || !globalThis.__ctmOfflineAudit.installed ||
              typeof globalThis.__ctmOfflineDrainAttempts !== 'function') {
            return {installed: false, marker: globalThis.__ctmOfflineAudit || null, baseURI: document.baseURI,
              fetch: typeof globalThis.fetch, binding: typeof globalThis.__ctmOfflineRecordAttempt};
          }
          return {installed: true, problems: await globalThis.__ctmOfflineDrainAttempts()};
        }, {channel, script: canonicalScript});
        if (!state.installed) failed.push({url: frame.url(), error: 'request audit not installed: ' + JSON.stringify(state)});
        else {
          verified.add(frame);
          failed.push(...state.problems.map(error => ({url: frame.url(), error: 'request audit: ' + error})));
        }
      } catch (error) { failed.push({url: frame.url(), error: 'request audit drain: ' + String(error.message)}); }
    }
  };
  await context.route('**/*', async route => {
    const url = route.request().url();
    if (new URL(url).origin !== allowed.origin) {
      external.push(url);
      return route.abort('blockedbyclient');
    }
    if (route.request().resourceType() === 'document') {
      const response = await route.fetch({maxRedirects: 0, headers: {...route.request().headers(), 'accept-encoding': 'identity'}});
      if (/text\/html/i.test(response.headers()['content-type'] || '') && response.status() < 300) {
        const body = instrumentOfflineHTML(await response.text(), script);
        const headers = {...response.headers()};
        delete headers['content-length'];
        delete headers['content-encoding'];
        return route.fulfill({response, headers, body});
      }
      return route.fulfill({response});
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
  context.on('page', page => {
    page.on('pageerror', error => errors.push(error.message));
    for (const frame of page.frames()) documents.set(frame, frame.url());
    page.on('frameattached', frame => documents.set(frame, frame.url()));
    page.on('framenavigated', frame => {
      if (committed.has(frame) && documents.get(frame) !== 'about:blank' && !verified.has(frame))
        failed.push({url: documents.get(frame), error: 'unaudited document navigated before verification'});
      documents.set(frame, frame.url());
      committed.add(frame);
      verified.delete(frame);
    });
    page.on('framedetached', frame => {
      if (!verified.has(frame)) failed.push({url: documents.get(frame) || '', error: 'unaudited frame detached before verification'});
      documents.delete(frame);
      committed.delete(frame);
    });
  });
  return {context, drain, evidence: {external, responses, failed, errors, attempts}};
}

export async function checkOfflinePages({browser, baseURL, pages, loads = 5, probes = [], settleMs = 1200, scope = 'course-regression'}) {
  if (!Number.isInteger(loads) || loads < 5) throw new Error('at least five loads per page are required');
  if (!Array.isArray(pages) || !pages.length) throw new Error('manifest needs at least one page');
  const results = [];
  for (const entry of pages) {
    if (!entry.path || new URL(entry.path, baseURL).origin !== new URL(baseURL).origin)
      throw new Error('manifest page must stay on the server');
    for (let load = 1; load <= loads; load++) {
      const {context, drain, evidence} = await offlineContext(browser, baseURL);
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
        await drain();
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
