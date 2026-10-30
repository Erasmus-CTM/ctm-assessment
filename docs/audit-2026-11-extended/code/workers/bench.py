#!/usr/bin/env python3
"""Ordinary local Pyodide readiness, bounded-work Stop and restart benchmark."""
import argparse
import asyncio
import functools
import http.server
import json
from pathlib import Path
import socketserver
import threading
from playwright.async_api import async_playwright

EXERCISE = r'''async () => {
  const started = performance.now();
  let py = await CTMWorker.start({indexURL:location.origin+'/pyodide/',publish:true});
  await py.whenSetup;
  const readyMs = performance.now()-started;
  const answer = await MathExerciseRuntime.transaction(py,()=>py.runPythonAsync('6 * 7'));
  const running = MathExerciseRuntime.transaction(py,()=>py.runPythonAsync(
    'import asyncio\nawait asyncio.sleep(5)\n42'
  )).then(value=>({value}),error=>({error:String(error),restarted:!!error.restarted}));
  await new Promise(resolve=>setTimeout(resolve,200));
  const stoppedAt = performance.now();
  await MathExerciseRuntime.stop('Normal learner Stop');
  const stoppedMs = performance.now()-stoppedAt;
  const stoppedResult = await running;
  py = await qpyodideInstance;
  const after = await MathExerciseRuntime.transaction(py,()=>py.runPythonAsync('6 * 7'));
  const restartAt = performance.now();
  py = await py.restart('Normal explicit restart');
  await py.whenSetup;
  const restartMs = performance.now()-restartAt;
  const restartedAnswer = await MathExerciseRuntime.transaction(py,()=>py.runPythonAsync('6 * 7'));
  return {readyMs,answer,isolated:crossOriginIsolated,stoppedMs,stoppedResult,after,restartMs,restartedAnswer};
}'''


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


async def run(args, origin):
    report = {'fixture': json.loads((args.fixture / 'fixture.json').read_text()),
              'scope': 'local assets, no extra/background packages, fresh contexts, no COI headers',
              'browsers': []}
    async with async_playwright() as playwright:
        names = ['chromium', 'firefox', 'webkit'] if args.browser == 'all' else [args.browser]
        for name in names:
            browser_type = getattr(playwright, name)
            executable = args.chromium_executable if name == 'chromium' and args.chromium_executable else browser_type.executable_path
            entry = {'browser': name, 'executable': executable, 'runs': []}
            report['browsers'].append(entry)
            if not Path(executable).is_file():
                entry.update(status='unavailable', reason='Browser executable is not installed; no download attempted.')
                continue
            browser = None
            try:
                browser = await browser_type.launch(executable_path=executable, headless=True,
                                                    args=['--no-sandbox'] if name == 'chromium' else [])
                entry['version'] = browser.version
                for _ in range(args.repetitions):
                    context = await browser.new_context()
                    try:
                        page = await context.new_page()
                        await page.goto(origin)
                        result = await asyncio.wait_for(page.evaluate(EXERCISE), timeout=args.timeout)
                        assert result['answer'] == result['after'] == result['restartedAnswer'] == 42, result
                        assert result['stoppedResult'].get('restarted') is True, result
                        entry['runs'].append(result)
                    finally:
                        await context.close()
                entry['status'] = 'passed'
            except Exception as error:
                entry.update(status='failed', reason=str(error))
            finally:
                if browser:
                    await browser.close()
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
    return 1 if any(item['status'] == 'failed' for item in report['browsers']) else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fixture', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--browser', choices=('chromium', 'firefox', 'webkit', 'all'), default='all')
    parser.add_argument('--chromium-executable', default='/usr/bin/chromium')
    parser.add_argument('--repetitions', type=int, default=3)
    parser.add_argument('--timeout', type=float, default=180)
    args = parser.parse_args()
    if args.repetitions < 1:
        parser.error('--repetitions must be positive')
    args.fixture = args.fixture.resolve()
    handler = functools.partial(QuietHandler, directory=str(args.fixture))
    with socketserver.TCPServer(('127.0.0.1', 0), handler) as server:
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            return asyncio.run(run(args, 'http://127.0.0.1:' + str(server.server_address[1])))
        finally:
            server.shutdown()


if __name__ == '__main__':
    raise SystemExit(main())
