// Acceptance of the offline website's exercise page (release 1.0 plan, step 3
// "Pages"): the extracted ZIP is served by the serve.py it ships, every
// request to another origin is refused, and a math-exercise and a py-exercise
// are graded in the browser.
//
//   OFFLINE_SITE=<extracted ZIP> [OFFLINE_PREFIX=/dept/python/] \
//     [OFFLINE_REPORT=report.json] node tools/offline-ide-exercises.mjs
//
// The site is copied below OFFLINE_PREFIX when one is given, as an exam host
// serving the site in a subdirectory. AGPL-3.0-or-later.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';

const site = path.resolve(process.env.OFFLINE_SITE || '');
assert.ok(fs.existsSync(path.join(site, 'exercises', 'index.html')), 'OFFLINE_SITE must hold exercises/index.html');
assert.ok(fs.existsSync(path.join(site, 'serve.py')), 'the ZIP ships serve.py');
const prefix = (process.env.OFFLINE_PREFIX || '/').replace(/^\/?/, '/').replace(/\/?$/, '/');

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {const {port} = server.address(); server.close(() => resolve(port));});
  });
}

async function serve() {
  let root = site;
  if (prefix !== '/') {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctm-offline-'));
    fs.cpSync(site, path.join(root, ...prefix.split('/').filter(Boolean)), {recursive: true});
  }
  const port = await freePort();
  const child = spawn(process.env.PYTHON || 'python3', [path.join(site, 'serve.py'), root, '--port', String(port)],
    {stdio: ['ignore', 'pipe', 'pipe']});
  let log = '';
  child.stdout.on('data', data => {log += data;});
  child.stderr.on('data', data => {log += data;});
  for (let attempt = 0; attempt < 100 && !/Serving /.test(log); attempt++) {
    if (child.exitCode !== null) throw new Error('serve.py exited: ' + log);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.match(log, /Serving /, 'serve.py started');
  return {base: `http://127.0.0.1:${port}${prefix}`, stop: () => child.kill()};
}

const report = {prefix, checks: []};
const {base, stop} = await serve();
const browser = await chromium.launch({headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
  args: ['--no-sandbox', '--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
try {
  const context = await browser.newContext({serviceWorkers: 'block'});
  const external = [], errors = [], failed = [];
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin !== new URL(base).origin) {
      external.push(route.request().url());
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  await context.routeWebSocket('**/*', socket => {external.push(socket.url()); socket.close();});
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => failed.push(request.url() + ' ' + (request.failure()?.errorText || '')));
  await page.addInitScript(() => {
    globalThis.__offlineResults = [];
    document.addEventListener('ctm:result', event => __offlineResults.push(event.detail));
  });
  const response = await page.goto(new URL('exercises/index.html', base).href, {waitUntil: 'load'});
  assert.equal(response.status(), 200);
  assert.equal(response.headers()['cross-origin-embedder-policy'], 'require-corp');

  async function answer(label, value, expected) {
    const cell = page.locator(`.math-exercise-cell[data-label="${label}"]`);
    await cell.locator('.math-input').first().fill(value);
    await cell.locator('.math-check-btn').click();
    await cell.locator(expected === 'correct' ? '.math-fb-ok' : '.math-fb-wrong').first().waitFor({timeout: 180000});
    report.checks.push({label, value, expected});
  }
  await answer('offline-math', '1', 'correct');
  await answer('offline-math', '3/4', 'wrong');
  await answer('offline-numeric', '3.14', 'correct');
  await answer('offline-numeric', '3.1', 'wrong');

  await page.waitForFunction(() => document.querySelector('.py-exercise-check') &&
    !document.querySelector('.py-exercise-check').disabled, null, {timeout: 180000});
  await page.locator('.py-exercise-check').click();
  await page.waitForFunction(() => __offlineResults.some(x => x.id === 'offline-python'), null, {timeout: 180000});
  const python = await page.evaluate(() => __offlineResults.filter(x => x.id === 'offline-python').at(-1));
  assert.notEqual(python.status, 'correct', 'the starter code fails its tests');
  report.checks.push({label: 'offline-python', value: 'starter code', status: python.status, score: python.score});

  const results = await page.evaluate(() => __offlineResults.map(({id, status, score}) => ({id, status, score})));
  report.results = results;
  report.external = external;
  report.errors = errors;
  report.failed = failed;
  assert.deepEqual(external, [], 'no request leaves the exam host');
  assert.deepEqual(errors, [], 'no page error');
  report.ok = true;
  await context.close();
} finally {
  if (process.env.OFFLINE_REPORT) fs.writeFileSync(process.env.OFFLINE_REPORT, JSON.stringify(report, null, 2) + '\n');
  console.log('OFFLINE_EXERCISES ' + JSON.stringify(report));
  await browser.close();
  stop();
}
