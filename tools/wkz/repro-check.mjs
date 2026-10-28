// DIAGNOSTIC ONLY: drive the standalone repro (docs/notes/...-repro.html,
// copied to tools/wkz/repro.html) in Playwright and measure the content
// process after each button, so the attachment of the draft bug report is
// checked on the same runners. Needs server.mjs on WKZ_PORT.
import {sample, brief} from './server.mjs';
const pw = await import(process.env.WKZ_PW || 'playwright');
const engine = (process.env.WKZ_BACKEND || 'playwright-webkit').replace('playwright-', '');
const browser = await pw[engine].launch({headless: true});
const page = await (await browser.newContext()).newPage();
await page.goto(`http://127.0.0.1:${process.env.WKZ_PORT || 8790}/repro.html`);
console.log('[repro]', browser.version(), 'baseline', brief(await sample(2000)));
for (const kind of ['dense', 'js', 'warm', 'loop']) {
  await page.click(`button[data-kind="${kind}"]`);
  await page.waitForFunction(k => document.getElementById('out').textContent.includes(`× ${k};`), kind, {timeout: 120000});
  console.log('[repro]', kind, 'then +2s', brief(await sample(2000)));
}
console.log('[repro] page output:\n' + await page.textContent('#out'));
await browser.close();
