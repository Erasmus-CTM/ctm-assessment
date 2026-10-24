// Post-run evidence validation only. Does not replace or change the D2 driver.
'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const NAME = 'Combined example page (all components), mathematics';
const positive = x => Number.isFinite(x) && x > 0;
const matplotlib = e => {
  try {
    const url = new URL(e.url);
    return url.origin === 'https://cdn.jsdelivr.net' &&
      /^\/pyodide\/v0\.28\.3\/full\/matplotlib-[^/]+\.whl$/.test(url.pathname);
  } catch { return false; }
};
function validate(report, html) {
  assert.equal(typeof html, 'string', 'actual rendered combined HTML is required');
  const scripts = Array.from(html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi), m => m[1]).join('\n');
  const preload = Array.from(scripts.matchAll(/\bglobalThis\.qpyodidePreloadPackages\s*=\s*(true|false)\s*;/g), m => m[1]);
  assert.deepEqual(preload, ['true'], 'rendered configuration must enable background packages exactly once');
  assert.ok(!/\bglobalThis\.__ctmWorkerNoBackground\s*=(?!=)/.test(scripts), 'rendered page must not override the driver off hook');
  assert.equal(report.d2?.limit_s, 2, 'the original two-second D2 gate must remain enabled');
  assert.equal(report.runs, 2, 'the frozen two fast contexts per mode must be retained');
  assert.equal(report.slow_runs, 1, 'the frozen one slow context per mode must be retained');
  const comparisons = report.d2.comparisons;
  assert.ok(Array.isArray(comparisons) && comparisons.length === 4, 'four original profile/cache comparisons are required');
  const seen = new Set();
  for (const c of comparisons) {
    const key = c.profile + '/' + c.cache;
    assert.ok(['fast/cold','fast/warm','slow/cold','slow/warm'].includes(key) && !seen.has(key), 'unique original D2 comparisons are required');
    seen.add(key);
    assert.ok(Array.isArray(c.errors) && c.errors.length === 0, key + ': original grade/error gate failed');
    assert.ok(positive(c.graded_with_s) && positive(c.graded_without_s) && Number.isFinite(c.delay_s) && c.delay_s <= 2,
      key + ': original timing gate failed');
    assert.ok(Math.abs(c.delay_s - (c.graded_with_s - c.graded_without_s)) <= 0.011, key + ': inconsistent timing comparison');
  }
  assert.ok(Array.isArray(report.scenarios), 'scenario records are required');
  const result = [];
  for (const profile of ['fast', 'slow']) for (const on of [true, false]) {
    const name = NAME + (on ? ', with stage 2' : ', stage 2 switched off');
    const matches = report.scenarios.filter(s => s.name === name && s.profile === profile);
    assert.equal(matches.length, 1, profile + ': one on and one off scenario are required');
    const scenario = matches[0], expectedRuns = profile === 'fast' ? report.runs : report.slow_runs;
    assert.ok(Number.isSafeInteger(expectedRuns) && expectedRuns > 0, 'original run count is required');
    assert.ok(Array.isArray(scenario.runs) && scenario.runs.length === expectedRuns, 'all original contexts must be retained');
    for (const [index, run] of scenario.runs.entries()) {
      const label = profile + '/' + (on ? 'on' : 'off') + '/' + (index + 1), d = run.diagnostic;
      assert.ok(d && d.complete === true && d.dropped === 0 && d.truncatedFields === 0 && Array.isArray(d.truncations) && d.truncations.length === 0,
        label + ': incomplete diagnostic capture');
      assert.ok(Array.isArray(d.events), label + ': events are missing');
      for (const cache of ['cold','warm']) {
        assert.equal(run[cache]?.status, 'graded', label + '/' + cache + ': terminal result was not successful grading');
        assert.ok(!run[cache].error && positive(run[cache].graded_s), label + '/' + cache + ': grade error');
        assert.ok(positive(run[cache].cells_s), label + '/' + cache + ': setup never settled');
      }
      const failures = d.events.filter(e => e.type === 'console' &&
        /extra packages could not be loaded|CTMWorker: stage 2 could not (?:download|install)/i.test(e.message || ''));
      assert.equal(failures.length, 0, label + ': background setup failed');
      const requests = d.events.filter(e => e.type === 'request' && matplotlib(e));
      if (on) {
        const gets = requests.filter(e => e.method === 'GET');
        assert.ok(gets.length > 0, label + ': no real background wheel GET activity');
        const urls = new Set(gets.map(e => e.url));
        for (const url of urls) {
          const requested = gets.filter(e => e.url === url).length;
          const finished = d.events.filter(e => e.type === 'requestfinished' && e.method === 'GET' && e.url === url).length;
          assert.equal(finished, requested, label + ': background wheel GET did not finish');
          assert.ok(d.events.some(e => e.type === 'response' && e.url === url && e.status >= 200 && e.status < 300), label + ': background wheel has no successful response');
        }
        assert.ok(d.events.filter(e => e.type === 'console' && /qpyodide: Pyodide worker ready after /.test(e.message || '')).length >= 2,
          label + ': both actual setup outcomes were not observed');
      } else {
        assert.equal(requests.length, 0, label + ': off hook did not suppress background wheel requests');
      }
      result.push({profile, backgroundOn:on, context:index + 1, matplotlibRequestMethods:requests.map(e => e.method), captureComplete:true});
    }
  }
  return {valid:true, contexts:result, directPackageRegistrySnapshot:false,
    scope:'Rendered enabled configuration, actual on activity/settled cells/no setup failures, off suppression and original D2 gates; no scheduler-cause claim.'};
}
module.exports = {validate};
if (require.main === module) {
  try {
    assert.equal(process.argv.length, 4, 'usage: check-d2-background-validity.cjs REPORT.json ACTUAL-example.html');
    const result = validate(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), fs.readFileSync(process.argv[3], 'utf8'));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) { console.error(error.stack || error); process.exitCode = 1; }
}
