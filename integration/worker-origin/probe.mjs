// Diagnostic only: preserves native worker creation and reports raw policy errors.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_SHA256 = '74ab3b0a0790bcf92b25fa74c60b35906d9f8b280f373300bbc8e40ba9b0a920';

// Added before page scripts in every frame. Logging reads no layout and never
// handles or cancels errors. Native constructors, methods and callbacks run once.
export function installTrace() {
  const events = [];
  let bytes = 0;
  const maxEvents = 60, maxBytes = 48000;
  const bounded = value => String(value).slice(0, 3000);
  function record(kind, detail) {
    if (events.length >= maxEvents) return;
    const event = {kind, at: performance.now(), ...detail};
    const size = JSON.stringify(event).length;
    if (bytes + size > maxBytes) return;
    bytes += size;
    events.push(event);
  }
  Object.defineProperty(window, '__ctmWorkerTrace', {value: events});
  const createObjectURL = URL.createObjectURL;
  const blobSize = Object.getOwnPropertyDescriptor(Blob.prototype, 'size').get;
  const blobType = Object.getOwnPropertyDescriptor(Blob.prototype, 'type').get;
  const blobText = Blob.prototype.text;
  const listen = EventTarget.prototype.addEventListener;
  const urlValue = value => typeof value === 'string' ? bounded(value) : {type: typeof value};
  URL.createObjectURL = function (...args) {
    const result = Reflect.apply(createObjectURL, this, args);
    const blob = args[0];
    try {
      const size = Reflect.apply(blobSize, blob, []);
      record('blob-created', {url: bounded(result), size,
        type: Reflect.apply(blobType, blob, []), stack: bounded(new Error('Blob origin').stack)});
      if (size <= 131072) {
        // Observe the immutable Blob, not the URL lifetime. Do not delay return.
        Reflect.apply(blobText, blob, []).then(source => record('blob-source', {
          url: bounded(result), source: source.slice(0, 12000)
        }), error => record('blob-read-error', {message: bounded(error)}));
      }
    } catch (error) {
      // Only diagnostic reads are caught, after the native URL method returned.
      record('trace-read-error', {message: bounded(error)});
    }
    return result;
  };
  const NativeWorker = Worker;
  window.Worker = new Proxy(NativeWorker, {
    construct(target, args, newTarget) {
      record('worker-create', {url: urlValue(args[0]), optionsType: typeof args[1],
        stack: bounded(new Error('Worker origin').stack)});
      const worker = Reflect.construct(target, args, newTarget);
      Reflect.apply(listen, worker, ['error', event => record('worker-error', {
        url: urlValue(args[0]), message: bounded(event.message)
      })]);
      Reflect.apply(listen, worker, ['message', event => record('worker-message', {
        url: urlValue(args[0]), type: typeof event.data,
        preview: typeof event.data === 'string' ? event.data.slice(0, 300) : null
      }), {once: true}]);
      return worker;
    }
  });
  addEventListener('error', event => {
    record('window-error', {message: bounded(event.message), file: bounded(event.filename)});
  });
}

async function withinDeadline(promise, milliseconds, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(label + ' timed out')), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

async function probe() {
  const {chromium, firefox, webkit} = await import('playwright');
  const engines = {chromium, firefox, webkit};
  const engineName = process.env.CTM_BROWSER || 'webkit';
  assert.ok(Object.hasOwn(engines, engineName), 'known real browser');
  const fixture = fs.readFileSync(path.join(here, 'exact-frame.html'));
  assert.equal(crypto.createHash('sha256').update(fixture).digest('hex'), FIXTURE_SHA256,
    'unmodified exact frame recovered from course23e WebKit job120022757378');
  const fixtureURL = 'data:text/html;base64,' + fixture.toString('base64');
  const fixtureText = fixture.toString('utf8');
  const config = '<script>window.MathJax = {options: {enableSpeech: false, enableBraille: false}};</script>\n';
  const loader = '<script id="MathJax-script"';
  assert.equal(fixtureText.split(loader).length, 2, 'one exact async MathJax loader');
  const configuredText = fixtureText.replace(loader, config + loader);
  assert.equal(configuredText.replace(config, ''), fixtureText, 'served copy changes only pre-loader options');
  const configured = Buffer.from(configuredText, 'utf8');
  const configuredSHA256 = crypto.createHash('sha256').update(configured).digest('hex');
  const cases = [
    {name: 'data-opaque', src: fixtureURL, sandbox: 'allow-scripts'},
    {name: 'http-opaque', src: '/exact-frame.html', sandbox: 'allow-scripts'},
    {name: 'http-same-origin', src: '/exact-frame.html', sandbox: 'allow-scripts allow-same-origin'},
    {name: 'data-opaque-speech-disabled', src: 'data:text/html;base64,' + configured.toString('base64'),
      sandbox: 'allow-scripts', disableSpeech: true}
  ];
  const server = http.createServer((request, response) => {
    response.writeHead(200, {'content-type': 'text/html; charset=utf-8',
      'cross-origin-opener-policy': 'same-origin',
      'cross-origin-embedder-policy': 'require-corp',
      // This diagnostic resource opts in so Firefox can load the intentionally
      // opaque HTTP control. Parent-page COEP and every sandbox stay strict.
      ...(request.url === '/exact-frame.html' ? {'cross-origin-resource-policy': 'cross-origin'} : {})});
    if (request.url === '/exact-frame.html') { response.end(fixture); return; }
    const item = cases.find(value => request.url === '/' + value.name);
    if (!item) { response.end('<!doctype html><title>Worker origin probe</title>'); return; }
    response.end('<!doctype html><meta charset="utf-8"><title>' + item.name + '</title>' +
      '<iframe id="board" width="760" height="400" sandbox="' + item.sandbox +
      '" src="' + item.src + '"></iframe>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const report = {engine: engineName, fixtureSHA256: FIXTURE_SHA256,
    source: {repository: 'aacchhee/ingmat3a_ntnu',
      commit: '23e47057806766ecb95f3cc86cf92eefa8102316',
      run: 39835256923, job: 120022757378}, cases: []};
  let browser;
  try {
    browser = await engines[engineName].launch({headless: true});
    for (const item of cases) {
      const context = await browser.newContext({viewport: {width: 1280, height: 900}});
      await context.addInitScript(installTrace);
      const page = await context.newPage();
      const result = {name: item.name, sandbox: item.sandbox,
        sourceVariant: item.disableSpeech ? 'configured served copy' : 'immutable captured fixture',
        sourceSHA256: item.disableSpeech ? configuredSHA256 : FIXTURE_SHA256,
        errors: [], console: [], failedRequests: [], responses: [], frames: [],
        testFrameResourceHeaders: null};
      report.cases.push(result);
      page.on('pageerror', error => result.errors.push({message: error.message, stack: error.stack}));
      page.on('console', message => {
        if (['error', 'warning'].includes(message.type())) result.console.push({
          type: message.type(), text: message.text(), location: message.location()
        });
      });
      page.on('requestfailed', request => result.failedRequests.push({
        url: request.url(), failure: request.failure()
      }));
      page.on('response', response => {
        if (response.url() === origin + '/exact-frame.html') {
          const headers = response.headers();
          result.testFrameResourceHeaders = {coep: headers['cross-origin-embedder-policy'],
            corp: headers['cross-origin-resource-policy']};
        }
        if (/mathjax|speech-rule|jsxgraph/.test(response.url())) result.responses.push({
          url: response.url(), status: response.status()
        });
      });
      try {
        const response = await page.goto(origin + '/' + item.name, {waitUntil: 'domcontentloaded'});
        const headers = response.headers();
        result.headers = {coop: headers['cross-origin-opener-policy'],
          coep: headers['cross-origin-embedder-policy']};
        assert.deepEqual(result.headers, {coop: 'same-origin', coep: 'require-corp'});
        result.topIsolated = await page.evaluate(() => crossOriginIsolated);
        assert.equal(result.topIsolated, true, 'real isolated parent page');
        const frame = page.frames().find(value => value.parentFrame() === page.mainFrame());
        assert.ok(frame, 'actual embedded frame exists');
        await frame.waitForFunction(() => !!window.MathJax?.startup?.promise, null, {timeout: 90000});
        await withinDeadline(frame.evaluate(() => MathJax.startup.promise), 90000, 'MathJax startup');
        await frame.waitForFunction(() => Object.values(window.JXG?.boards || {}).length > 0,
          null, {timeout: 30000});
        try {
          result.renderer = await withinDeadline(frame.evaluate(async () => {
            const node = await MathJax.tex2svgPromise('x^2+1');
            const svg = node.querySelector('svg');
            return {expression: 'x^2+1', svg: !!svg,
              glyphs: svg?.querySelectorAll('path,use').length || 0,
              characters: node.outerHTML.length};
          }), 30000, 'MathJax SVG renderer');
        } catch (error) {
          result.renderer = {expression: 'x^2+1', svg: false, error: error.message};
        }
        // Bounded observation window, not a readiness substitute. Keep native
        // speech-worker startup/error/message events after actual board readiness.
        await page.waitForTimeout(7000);
      } catch (error) {
        result.probeError = {message: error.message, stack: error.stack};
      }
      for (const frame of page.frames()) {
        try {
          const state = await frame.evaluate(() => ({
            urlOrigin: location.origin, effectiveOrigin: self.origin, readyState: document.readyState,
            isolated: crossOriginIsolated,
            mathjax: !!window.MathJax?.startup?.document,
            speechOptions: window.MathJax?.startup?.document?.options ? {
              enableSpeech: MathJax.startup.document.options.enableSpeech,
              enableBraille: MathJax.startup.document.options.enableBraille
            } : null,
            boards: Object.keys(window.JXG?.boards || {}).length,
            trace: window.__ctmWorkerTrace || []
          }));
          result.frames.push({url: frame.url().startsWith('data:') ?
            'data:text/html;base64,[' + (item.disableSpeech ? 'configured served copy' : 'exact fixture') + ']' : frame.url(), ...state});
        } catch (error) {
          result.frames.push({readError: error.message});
        }
      }
      console.log('CTM_WORKER_ORIGIN ' + JSON.stringify(result));
      await context.close();
    }
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
    const output = process.env.CTM_WORKER_REPORT || path.join(here, 'report-' + engineName + '.json');
    fs.mkdirSync(path.dirname(output), {recursive: true});
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  }
  assert.equal(report.cases.length, 4);
  assert.ok(report.cases.every(item => !item.probeError), 'all embedded cases must become ready');
  for (const item of report.cases.filter(value => value.name.startsWith('http-'))) {
    assert.deepEqual(item.testFrameResourceHeaders, {coep: 'require-corp', corp: 'cross-origin'},
      'HTTP test-frame opt-in is explicit and reported');
  }
  const intervention = report.cases.find(item => item.name === 'data-opaque-speech-disabled');
  const frame = intervention.frames.find(item => item.boards === 1);
  assert.ok(frame, 'configured copy still initializes the actual board');
  assert.equal(frame.effectiveOrigin, 'null', 'configured copy retains its opaque sandbox');
  assert.deepEqual(frame.speechOptions, {enableSpeech: false, enableBraille: false});
  assert.equal(intervention.renderer?.svg, true, 'configured copy renders actual mathematical SVG');
  assert.ok(intervention.renderer.glyphs > 0, 'SVG contains rendered glyphs');
  assert.equal(frame.trace.filter(item => item.kind === 'worker-create').length, 0,
    'configured copy starts no accessibility worker');
  assert.deepEqual(intervention.errors, [], 'configured copy has no uncaught errors');
  assert.deepEqual(intervention.console.filter(item => item.type === 'error'), [],
    'configured copy has no raw console errors');
  assert.deepEqual(intervention.failedRequests, [], 'configured copy has no failed requests');
  // Policy errors are evidence here, never acceptance. Existing course/store
  // checks remain the strict release gates; this diagnostic cannot turn them green.
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await probe();
}
