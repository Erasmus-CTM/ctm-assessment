// SPDX-License-Identifier: AGPL-3.0-or-later
import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {launchOfflineBrowser, offlineContext, checkOfflinePages} from '../tools/offline-check.mjs';
import {checkBoards, geometryProblems} from '../tools/board-check.mjs';
import {writeFixtures, finishMechanismFixtures} from './offline-check/fixtures.mjs';
import {serveFixtures} from './offline-check/harness.mjs';

let root, browser, server;
const evidence = {scope: 'checker-contract-and-mechanism-model', courseRegression: 'not run',
  forkPR2: 'not evaluated; AC owns upstream merge', contracts: [], mechanism: null};
before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctm-offline-'));
  assert.ok(process.env.JXG_FIXTURE_DIR, 'supply a local JSXGraph distrib directory; no CDN fallback');
  writeFixtures(root, process.env.JXG_FIXTURE_DIR);
  server = await serveFixtures(root);
  finishMechanismFixtures(root, server.baseURL);
  browser = await launchOfflineBrowser();
  evidence.browserVersion = browser.version();
}, {timeout: 60000});
after(async () => {
  if (browser) await browser.close();
  if (server) await server.close();
  if (root) fs.rmSync(root, {recursive: true, force: true});
  if (process.env.CTM_OFFLINE_REPORT) fs.writeFileSync(process.env.CTM_OFFLINE_REPORT, JSON.stringify(evidence, null, 2) + '\n');
});

test('geometry tolerance is 2px and SVG size, visibility and ink are separate requirements', () => {
  const good = {visible: true, box: {width: 100, height: 80}, svg: {width: 102, height: 78}, drawn: true};
  assert.deepEqual(geometryProblems(good), []);
  assert.match(geometryProblems({...good, svg: {width: 102.01, height: 80}}).join(';'), /width differs/);
  assert.match(geometryProblems({...good, svg: {width: 0, height: 0}}).join(';'), /SVG width is zero/);
  assert.match(geometryProblems({...good, visible: false}).join(';'), /hidden/);
  assert.match(geometryProblems({...good, drawn: false}).join(';'), /no drawn/);
});

test('every nested hidden board, inline board and smaller board passes all five independent loads', {timeout: 180000}, async () => {
  const result = await checkOfflinePages({scope: 'checker-contract', browser, baseURL: server.baseURL, pages: [{path: 'positive.html', boards: 4}]});
  evidence.contracts.push(result);
  assert.ok(result.ok, JSON.stringify(result));
  assert.equal(result.results.length, 5);
  for (const load of result.results) {
    assert.equal(load.boards.length, 4);
    assert.ok(load.boards.some(board => board.board === 'nested'), 'nested tabs/details/class-target callout/math caption reached');
    assert.ok(load.boards.some(board => board.board === 'smaller-than-frame' && board.box.width === 170));
  }
});

test('production math caption markup opens its visibility-hidden board through the actual toggle state', {timeout: 60000}, async () => {
  const {context} = await offlineContext(browser, server.baseURL);
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    await page.goto(server.baseURL + 'math-collapsed.html');
    assert.equal(await page.locator('.math-exercise').count(), 0, 'obsolete checker selector must not match the fixture');
    assert.equal(await page.locator('.math-exercise-body').getAttribute('aria-hidden'), 'true');
    assert.equal(await page.locator('iframe').isVisible(), false);
    const boards = await checkBoards(page);
    assert.equal(boards.length, 1);
    assert.deepEqual(boards[0].errors, []);
    assert.equal(await page.locator('.math-exercise-cell').getAttribute('class'), 'math-exercise-cell math-exercise-open');
    assert.equal(await page.locator('.math-exercise-toggle').getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('.math-exercise-body').getAttribute('aria-hidden'), 'false');
    assert.equal(await page.locator('iframe').isVisible(), true);
  } finally { await context.close(); }
});

test('opacity-zero board and frame ancestors fail despite positive geometry', {timeout: 60000}, async () => {
  for (const name of ['board-opacity', 'frame-opacity']) {
    const result = await checkOfflinePages({scope: 'checker-contract', browser, baseURL: server.baseURL, pages: [{path: name + '.html', boards: 1}]});
    evidence.contracts.push(result);
    assert.equal(result.results.length, 5);
    for (const load of result.results) {
      assert.equal(load.ok, false);
      assert.match(load.problems.join(';'), /hidden|transparent/);
    }
  }
});

test('zero SVG, wrong-size SVG and empty ink controls fail every load for their own reason', {timeout: 180000}, async () => {
  for (const [name, reason] of [['blank', /SVG width is zero/], ['mismatch', /width differs/], ['empty', /no drawn/]]) {
    const result = await checkOfflinePages({scope: 'checker-contract', browser, baseURL: server.baseURL, pages: [{path: name + '.html', boards: 1}]});
    evidence.contracts.push(result);
    assert.equal(result.results.length, 5);
    for (const load of result.results) {
      assert.equal(load.ok, false);
      assert.match(load.problems.join(';'), reason);
    }
  }
});

test('known board iframe without a board is a failure rather than a vacuous pass', {timeout: 180000}, async () => {
  const {context} = await offlineContext(browser, server.baseURL);
  try {
    const page = await context.newPage();
    await page.goto(server.baseURL + 'missing.html');
    const result = await checkBoards(page, {attachTimeoutMs: 200});
    assert.equal(result.length, 1);
    assert.deepEqual(result[0].errors, ['board iframe contains no board box']);
  } finally { await context.close(); }
});

test('external requests in document, worker and opaque frame are recorded and fail the offline run', {timeout: 180000}, async () => {
  const result = await checkOfflinePages({scope: 'checker-contract', browser, baseURL: server.baseURL, pages: [{path: 'external.html', boards: 1}]});
  evidence.contracts.push(result);
  for (const load of result.results) {
    assert.equal(load.ok, false);
    for (const origin of ['page-fetch', 'worker-fetch', 'frame-fetch'])
      assert.ok(load.evidence.external.some(url => url.includes(origin)), origin + ': ' + JSON.stringify(load.evidence));
  }
});

test('caught opaque fetch/XHR attempts are audited even with zero page errors', {timeout: 60000}, async () => {
  const result = await checkOfflinePages({scope: 'checker-contract', browser, baseURL: server.baseURL,
    pages: [{path: 'caught-frame.html', boards: 1}],
    probes: [async page => {
      const frame = page.frames().find(frame => frame.parentFrame());
      await frame.waitForFunction(() => document.body.dataset.caught === 'true');
    }]});
  evidence.contracts.push(result);
  for (const load of result.results) {
    assert.equal(load.ok, false);
    assert.deepEqual(load.evidence.errors, [], 'caught native errors must not be needed for detection');
    for (const name of ['string', 'url', 'request', 'xhr']) {
      const url = 'https://offline.invalid/caught-' + name;
      assert.ok(load.evidence.external.includes(url), url);
      assert.ok(load.evidence.attempts.some(attempt => attempt.url === url && attempt.frame === 'about:srcdoc'), url);
    }
  }
});

test('local string/URL/Request and opaque-frame requests succeed; data URLs are not external attempts', {timeout: 60000}, async () => {
  const result = await checkOfflinePages({scope: 'checker-contract', browser, baseURL: server.baseURL,
    pages: [{path: 'same-origin.html', boards: 1}],
    probes: [async page => {
      await page.waitForFunction(() => document.body.dataset.parentLocal === 'local request works');
      const frame = page.frames().find(frame => frame.parentFrame());
      await frame.waitForFunction(() => document.body.dataset.local === 'local request works|local request works|inline|local request works');
    }]});
  evidence.contracts.push(result);
  assert.ok(result.ok, JSON.stringify(result));
  for (const load of result.results) {
    assert.deepEqual(load.evidence.external, []);
    assert.ok(load.evidence.attempts.length >= 4, JSON.stringify(load.evidence));
    assert.ok(load.evidence.attempts.every(attempt => attempt.url === server.baseURL + '_ctm-assets/local.txt'));
  }
});

test('registration is refused without probing an opaque navigator.serviceWorker getter', {timeout: 30000}, async () => {
  const {context, drain, evidence: observed} = await offlineContext(browser, server.baseURL);
  try {
    const page = await context.newPage();
    await page.goto(server.baseURL + 'positive.html');
    const result = await page.evaluate(async () => {
      let refusal;
      try { await navigator.serviceWorker.register('service-worker.js'); }
      catch (error) { refusal = {name: error.name, message: error.message}; }
      return {refusal, registrations: (await navigator.serviceWorker.getRegistrations()).length};
    });
    assert.deepEqual(result, {refusal: {name: 'NotAllowedError', message: 'Service workers are blocked by offline checks'}, registrations: 0});
    assert.equal(context.serviceWorkers().length, 0);
    await drain();
    assert.deepEqual(observed.errors, [], 'opaque frames must not receive an instrumentation getter exception');
    assert.ok(observed.attempts.some(attempt => attempt.kind === 'service-worker' && attempt.url === server.baseURL + 'service-worker.js'));
  } finally { await context.close(); }
});

test('HTTP errors and browser exceptions independently fail', {timeout: 180000}, async () => {
  for (const [name, kind] of [['http-error', 'responses'], ['exception', 'errors'], ['opaque-exception', 'errors']]) {
    const result = await checkOfflinePages({scope: 'checker-contract', browser, baseURL: server.baseURL, pages: [{path: name + '.html', boards: 0}]});
    evidence.contracts.push(result);
    assert.ok(result.results.every(load => !load.ok && load.evidence[kind].length > 0), JSON.stringify(result));
  }
});

test('real JSXGraph hidden-frame mechanism: blank negative every time; >=20 plain loads must expose a blank; refresh model five clean loads', {timeout: 180000}, async () => {
  const mechanism = {scope: 'plain-iframe-model, not fork-extension proof', modes: {}};
  evidence.mechanism = mechanism;
  for (const [mode, loads] of [['always-blank-real', 5], ['plain-hidden', 20], ['refresh-model', 5]]) {
    const outcomes = [];
    for (let i = 0; i < loads; i++) {
      const {context, evidence: network} = await offlineContext(browser, server.baseURL);
      try {
        const page = await context.newPage();
        page.setDefaultTimeout(30000);
        await page.goto(server.baseURL + mode + '.html', {waitUntil: 'load'});
        const frame = page.frames().find(frame => frame.parentFrame());
        await frame.waitForFunction(() => typeof b !== 'undefined');
        await page.waitForTimeout(150);
        await page.evaluate(() => {
          document.getElementById('hidden').style.display = 'block';
          document.querySelector('iframe').contentWindow.postMessage('visible', '*');
        });
        const boards = await checkBoards(page);
        const blank = boards.some(board => board.errors.some(error => /SVG (width|height)/.test(error)));
        assert.equal(boards.length, 1);
        assert.deepEqual(network.external, []);
        assert.deepEqual(network.responses, []);
        assert.deepEqual(network.failed, []);
        assert.deepEqual(network.errors, []);
        outcomes.push({load: i + 1, blank, boards});
      } finally { await context.close(); }
    }
    mechanism.modes[mode] = outcomes;
    if (mode === 'always-blank-real') assert.ok(outcomes.every(run => run.blank), 'deterministic negative must fail every load');
    if (mode === 'plain-hidden') assert.ok(outcomes.some(run => run.blank),
      'mechanism not reproduced in this full Chromium: no proof is claimed; do not weaken this control');
    if (mode === 'refresh-model') assert.ok(outcomes.every(run => run.boards.every(board => !board.errors.length)),
      'refresh model must pass every load: ' + JSON.stringify(outcomes));
  }
});
