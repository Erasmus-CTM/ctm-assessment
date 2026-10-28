// DIAGNOSTIC ONLY: experiment plans for drive.mjs. Each experiment is one
// fresh browser (or app/tab) run of wkz.html with these fields (see
// wkz.html and wkz-worker.js): kind, wtype, shape, mask, callee, prewarm, n,
// hold, pages, after, coi, counter, sidefx, action, watch, inFrame.
const S = k => 2 ** k - 1; // jscall mask: one JS call every 2^k iterations

// Loop shapes in a plain dedicated worker (n=2 workers, terminate after 0.5 s).
export const shapes = [
  {id: 'idle', shape: 'idle'},
  {id: 'loop', shape: 'loop'},
  {id: 'memops', shape: 'memops'},
  {id: 'call', shape: 'call'},
  {id: 'callind', shape: 'callind'},
  {id: 'grow0', shape: 'grow'},
  {id: 'throw', shape: 'throw'},
  {id: 'jsloop', shape: 'jsloop'},
  {id: 'js-dense', shape: 'jscall', mask: 0},
  {id: 'js-long200ms', shape: 'jscall', mask: 0, callee: 'long'},
  {id: 'js-native-dense', shape: 'jscall', mask: 0, callee: 'native'},
  {id: 'js-sparse20', shape: 'jscall', mask: S(20)},
  {id: 'js-sparse24', shape: 'jscall', mask: S(24)},
  {id: 'js-sparse27', shape: 'jscall', mask: S(27)}
];
// Tier of the JS callee: warm it up (long hold or explicit prewarm) before
// terminating, so it runs JIT code instead of the LLInt.
export const tiers = [
  {id: 'js-dense-hold10s', shape: 'jscall', mask: 0, hold: 10000},
  {id: 'js-sparse20-hold10s', shape: 'jscall', mask: S(20), hold: 10000},
  {id: 'js-sparse16-prewarm', shape: 'jscall', mask: S(16), prewarm: 1e6},
  {id: 'js-sparse20-prewarm', shape: 'jscall', mask: S(20), prewarm: 1e6},
  {id: 'js-sparse24-prewarm', shape: 'jscall', mask: S(24), prewarm: 1e6},
  {id: 'js-dense-prewarm', shape: 'jscall', mask: 0, prewarm: 1e6},
  {id: 'js-native-sparse20', shape: 'jscall', mask: S(20), callee: 'native'},
  {id: 'loop-hold10s', shape: 'loop', hold: 10000}
];
export const workerTypes = [
  {id: 'module-loop', wtype: 'module', shape: 'loop'},
  {id: 'nested-loop', wtype: 'nested', shape: 'loop'},
  {id: 'nested-kill-loop', wtype: 'nested-kill', shape: 'loop'},
  {id: 'shared-loop-nav', kind: 'lifetime', wtype: 'shared', shape: 'loop', action: 'nav-same-live', n: 1}
];
export const isolation = [
  {id: 'coi-loop', coi: true, shape: 'loop'},
  {id: 'coi-counter', coi: true, shape: 'counter', counter: true, n: 1, after: [1000, 5000, 15000]},
  {id: 'coi-js-sparse20-prewarm', coi: true, shape: 'jscall', mask: S(20), prewarm: 1e6}
];
export const lifetime = [
  {id: 'life-nav-same', kind: 'lifetime', action: 'nav-same', n: 1},
  {id: 'life-nav-same-live', kind: 'lifetime', action: 'nav-same-live', n: 1},
  {id: 'life-reload', kind: 'lifetime', action: 'reload', n: 1},
  {id: 'life-nav-cross', kind: 'lifetime', action: 'nav-cross', n: 1},
  {id: 'life-bfcache', kind: 'lifetime', action: 'bfcache', n: 1},
  {id: 'life-iframe-remove', kind: 'lifetime', action: 'iframe-remove', inFrame: true, n: 1},
  {id: 'life-iframe-remove-live', kind: 'lifetime', action: 'iframe-remove-live', inFrame: true, n: 1},
  {id: 'life-close-tab', kind: 'lifetime', action: 'close-tab', n: 1},
  {id: 'life-close-tab-live', kind: 'lifetime', action: 'close-tab-live', n: 1}
];
export const side = [
  {id: 'rss-idle-256MB', shape: 'idle', pages: 4096, n: 1},
  {id: 'rss-loop-256MB', shape: 'loop', pages: 4096, n: 1},
  {id: 'sidefx-sparse20-prewarm', shape: 'jscall', mask: S(20), prewarm: 1e6, sidefx: true, n: 1, hold: 2000},
  {id: 'bench', kind: 'bench', k: 4}
];
export const main = [
  {id: 'main-wasm-loop', kind: 'main', shape: 'loop', timeout: 120000},
  {id: 'main-js-loop', kind: 'main', shape: 'jsloop', timeout: 120000}
];
export const info = [{id: 'info', kind: 'info'}, {id: 'info-coi', kind: 'info', coi: true}];

export const plans = {
  info,
  quick: [...info, shapes[0], shapes[1], shapes[8], tiers[3]],
  shapes, tiers, workerTypes, isolation, lifetime, side, main,
  full: [...info, ...shapes, ...tiers, ...workerTypes, ...isolation, ...lifetime, ...side, ...main],
  // For JSC option sweeps: the cases that distinguish the hypotheses.
  options: [...info, shapes[0], shapes[1], shapes[3], shapes[8], shapes[11], tiers[1], tiers[3]]
};

// Pyodide (wkz-py.html): runaway programs stopped by terminate() after 1.5 s,
// with the ctm-libs interrupt-buffer fix unless fix:false.
const py = (id, code, extra = {}) => ({id: 'py-' + id, page: 'wkz-py.html', code, timeout: 150000, ...extra});
const W = body => 'while True:\n    ' + body;
export const pyodide = [
  py('pass-nofix', W('pass'), {fix: false}),
  py('pass', W('pass')),
  py('sum1e6', W('sum(range(10**6))')),
  py('sum-single', 'sum(range(10**11))'),
  py('pow', W('x = 7**200000')),
  py('mul', 'x = 7**200000\n' + W('y = x * x')),
  py('str', 'import sys\nsys.set_int_max_str_digits(0)\nx = 7**200000\n' + W('s = str(x)')),
  py('re-catastrophic', "import re\nre.match(r'(a+)+$', 'a' * 40 + 'b')"),
  py('re-loop', "import re\n" + W("re.match(r'(a+)+$', 'a' * 18 + 'b')")),
  py('sleep', 'import time\n' + W('time.sleep(5)')),
  py('sort', 'import random\na = [random.random() for _ in range(10**6)]\n' + W('sorted(a)')),
  py('sha256', "import hashlib\nb = b'x' * 10**8\n" + W('hashlib.sha256(b).digest()')),
  py('bytes', W("b = b'x' * 10**8")),
  py('json', 'import json\ns = json.dumps(list(range(10**6)))\n' + W('json.loads(s)')),
  py('listcomp', W('[i * i for i in range(10**5)]')),
  py('recursion', 'def f(n):\n    return f(n + 1)\n' + W('try:\n        f(0)\n    except RecursionError:\n        pass')),
  py('catch-kbi', W('try:\n        sum(range(10**6))\n    except KeyboardInterrupt:\n        pass')),
  py('numpy-matmul', 'import numpy as np\na = np.random.rand(600, 600)\n' + W('a @ a'), {packages: ['numpy']}),
  py('numpy-sum', 'import numpy as np\na = np.ones(10**7)\n' + W('a.sum()'), {packages: ['numpy']}),
  py('sum1e6-hold10s', W('sum(range(10**6))'), {hold: 10000})
];
// Threshold: time per C call (calibrated separately) vs whether Stop lands.
const SUM_N = [1e3, 1e4, 1e5, 3e5, 1e6, 3e6, 1e7];
export const pythreshold = [
  py('calibrate', '', {calibrate: 'import time\nout = {}\nfor n in [' + SUM_N.map(n => String(n)).join(', ') + ']:\n    n = int(n)\n    t = time.perf_counter()\n    k = 0\n    while time.perf_counter() - t < 0.5:\n        sum(range(n))\n        k += 1\n    out[n] = round((time.perf_counter() - t) / k * 1000, 4)\nstr(out)'}),
  ...SUM_N.map(n => py('sum-n' + n, W(`sum(range(${n}))`)))
];
plans.pyodide = pyodide;
plans.pythreshold = pythreshold;
plans.pyquick = [pyodide[0], pyodide[1], pyodide[2]];

export const ios = [
  {id: 'ios-background', kind: 'lifetime', action: 'ios-background', n: 1, timeout: 120000},
  {id: 'ios-background-live', kind: 'lifetime', action: 'ios-background-live', n: 1, timeout: 120000}
];
plans.ios = ios;
// Smaller sets for slower or costlier backends.
const pick = (list, ids) => list.filter(e => ids.includes(e.id));
plans.core = [...info, ...pick(shapes, ['idle', 'loop', 'call', 'grow0', 'jsloop', 'js-dense', 'js-sparse20']), ...pick(tiers, ['js-sparse20-prewarm', 'js-sparse20-hold10s'])];
plans.lifecore = pick(lifetime, ['life-nav-same', 'life-reload', 'life-nav-cross', 'life-close-tab']);
