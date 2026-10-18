// Challenges the combined page's Python exercises with correct and plausible wrong programs.
// The Python that the browser runs (CHECKER_PY, RUNNER_PY) is taken from the installed
// py-exercise.js and executed with python3, one top-level test statement at a time.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const site = process.env.CTM_INTEGRATION_SITE || path.join(__dirname, '../.feedback-workspace/site/_site');
const runtimeFile = path.resolve(site, '../_extensions/py-exercise/py-exercise.js');

function browserPython(source, name) {
  const start = source.indexOf('var ' + name + ' = [');
  const end = source.indexOf("].join('\\n');", start);
  return eval(source.slice(start + ('var ' + name + ' = ').length, end + 1)).join('\n');
}

function exercises(file) {
  const found = {};
  const text = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  for (const [, block] of text.matchAll(/^```\{py-exercise\}\n([\s\S]*?)\n```/gm)) {
    const options = {}, code = [];
    for (const line of block.split('\n')) {
      const option = line.match(/^#\|\s*(.*?):\s*(.*?)\s*$/);
      if (option) options[option[1]] = option[2]; else code.push(line);
    }
    const [starter, tests = ''] = code.join('\n').split(/\n[ \t]*##[ \t]*TESTS[ \t]*##[ \t]*\n/i);
    const list = key => (options[key] || '').split(',').map(item => item.trim()).filter(Boolean);
    found[options.label] = {starter: starter.trim(), tests: tests.trim(),
      forbiddenImports: list('forbidden-imports'), forbiddenKeywords: list('forbidden-keywords')};
  }
  return found;
}

const RUN = String.raw`
import contextlib, io, json, sys
job = json.load(sys.stdin)
messages = {'_msg_forbidden_import': "Forbidden import: '{}'", '_msg_forbidden_function': "Forbidden function: '{}'",
            '_msg_forbidden_method': "Forbidden method: '.{}'", '_msg_forbidden_keyword': "Forbidden keyword: '{}'",
            '_msg_assertion_failed': 'Assertion failed', '_msg_test_error': 'Error: {}', '_msg_syntax_error': 'Syntax error in tests: {}'}
def snippet(code, ns):
    body, last = code.rstrip().rsplit('\n', 1)
    exec(compile(body, '<pyodide>', 'exec'), ns)
    return eval(compile(last, '<pyodide>', 'eval'), ns)
verdicts = []
for case in job['cases']:
    ns = dict(messages, __name__='__main__', _exercise_student_code=case['code'], _exercise_test_code=case['tests'],
              _exercise_forbidden_imports=case['forbiddenImports'], _exercise_forbidden_keywords=case['forbiddenKeywords'])
    if (case['forbiddenImports'] or case['forbiddenKeywords']) and json.loads(snippet(job['checker'], ns)):
        verdicts.append('blocked'); continue
    with contextlib.redirect_stdout(io.StringIO()):
        result = json.loads(snippet(job['runner'], ns))
    tests = result['tests']
    verdicts.append('error' if result['student_error'] else 'pass' if tests and all(t['passed'] for t in tests) else 'fail')
print(json.dumps(verdicts))
`;

const fn = (signature, body, before = '') => before + 'def ' + signature + ':\n' + body.split('\n').map(line => '    ' + line).join('\n') + '\n';
const VARIANTS = {
  'practice-price': [
    ['starter', null, 'fail'],
    ['price + tax', fn('price_with_tax(price, rate)', 'tax = price * rate\nreturn price + tax'), 'pass'],
    ['price * (1 + rate)', fn('price_with_tax(price, rate)', 'return price * (1 + rate)'), 'pass'],
    ['tax only', fn('price_with_tax(price, rate)', 'return price * rate'), 'fail'],
    ['rate read as percent', fn('price_with_tax(price, rate)', 'return price * (1 + rate / 100)'), 'fail'],
    ['rounded to cents', fn('price_with_tax(price, rate)', 'return round(price * (1 + rate), 2)'), 'fail'],
  ],
  'practice-total': [
    ['starter', null, 'fail'],
    ['running total', fn('total(values)', 'result = 0\nfor value in values:\n    result += value\nreturn result'), 'pass'],
    ['sum()', fn('total(values)', 'return sum(values)'), 'blocked'],
    ['positive values only', fn('total(values)', 'result = 0\nfor value in values:\n    if value > 0:\n        result += value\nreturn result'), 'fail'],
  ],
  'practice-greet': [
    ['starter', null, 'fail'],
    ['print and return', fn('greet(name)', 'message = f"Hello, {name}!"\nprint(message)\nreturn message') + '\ngreet("Ada")\n', 'pass'],
    ['return only', fn('greet(name)', 'return f"Hello, {name}!"'), 'fail'],
    ['prints twice', fn('greet(name)', 'message = f"Hello, {name}!"\nprint(message)\nprint(message)\nreturn message'), 'fail'],
  ],
  'practice-circle': [
    ['starter', null, 'fail'],
    ['pi * radius ** 2', fn('circle_area(radius)', 'pi = 3.14159\nreturn pi * radius ** 2'), 'pass'],
    ['math.pi', fn('circle_area(radius)', 'return math.pi * radius ** 2', 'import math\n\n'), 'blocked'],
    ['circumference', fn('circle_area(radius)', 'pi = 3.14159\nreturn 2 * pi * radius'), 'fail'],
  ],
  'practice-palindrome': [
    ['starter', null, 'fail'],
    ['reverse the lowercase text', fn('is_palindrome(text)', 'normalized = text.lower()\nreturn normalized == normalized[::-1]'), 'pass'],
    ['casefold', fn('is_palindrome(text)', 'return text.casefold() == text.casefold()[::-1]'), 'pass'],
    ['case-sensitive', fn('is_palindrome(text)', 'return text == text[::-1]'), 'fail'],
    ['punctuation removed', fn('is_palindrome(text)', "n = ''.join(c for c in text.lower() if c.isalnum())\nreturn n == n[::-1]"), 'fail'],
    ['first and last letters only', fn('is_palindrome(text)', 'normalized = text.lower()\nreturn normalized[:1] == normalized[-1:]'), 'fail'],
  ],
  'integration-add': [
    ['starter', null, 'fail'],
    ['a + b', fn('add(a, b)', 'return a + b'), 'pass'],
    ['imports os', fn('add(a, b)', 'return a + b', 'import os\n\n'), 'blocked'],
    ['b - a', fn('add(a, b)', 'return b - a'), 'fail'],
  ],
};

test('Python examples accept correct programs and reject plausible mistakes', {skip: !fs.existsSync(runtimeFile)}, () => {
  const source = fs.readFileSync(runtimeFile, 'utf8');
  const found = exercises('examples/_python.qmd');
  assert.deepEqual(Object.keys(found).sort(), Object.keys(VARIANTS).sort());
  const cases = [];
  for (const [label, variants] of Object.entries(VARIANTS))
    for (const [name, code, expected] of variants)
      cases.push({label, name, expected, code: code ?? found[label].starter, ...found[label]});
  const python = spawnSync('python3', ['-c', RUN], {encoding: 'utf8',
    input: JSON.stringify({checker: browserPython(source, 'CHECKER_PY'), runner: browserPython(source, 'RUNNER_PY'),
      cases: cases.map(({code, tests, forbiddenImports, forbiddenKeywords}) => ({code, tests, forbiddenImports, forbiddenKeywords}))})});
  assert.equal(python.status, 0, python.stderr);
  const verdicts = JSON.parse(python.stdout);
  cases.forEach((c, i) => assert.equal(verdicts[i], c.expected, c.label + ': ' + c.name));
});
