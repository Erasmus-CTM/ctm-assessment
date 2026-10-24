// SPDX-License-Identifier: AGPL-3.0-or-later
// Tests deliberately use the canonical server, never a second HTTP implementation.
import {spawn} from 'node:child_process';
export async function serveFixtures(directory) {
  const script = process.env.CTM_OFFLINE_SERVER || 'scripts/serve-offline.py';
  const child = spawn(process.env.PYTHON || 'python', [script, directory, '--bind', '127.0.0.1', '--port', '0'],
    {stdio: ['ignore', 'pipe', 'pipe']});
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('server startup timeout: ' + stderr)); }, 15000);
    let output = '';
    child.stdout.on('data', chunk => {
      output += chunk;
      const found = output.match(/at (http:\/\/127\.0\.0\.1:\d+)/);
      if (found) { clearTimeout(timer); resolve(found[1] + '/'); }
    });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error('server exited ' + code + ': ' + stderr)); });
  });
  return {baseURL: url, close: async () => {
    if (child.exitCode !== null) return;
    const exit = new Promise(resolve => child.once('exit', resolve));
    child.kill();
    await exit;
  }};
}
