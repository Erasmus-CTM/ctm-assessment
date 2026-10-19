// The umbrella's Python examples as test cases: correct and plausible wrong
// programs for every py-exercise of examples/_python.qmd, and the script that
// grades them with the Python that the browser runs (MODULE_PY of
// py-exercise.js), one top-level test statement at a time. Used by
// tests/python-examples.test.cjs (native Python) and by the Pyodide parity
// harness (integration/pyodide-parity).
const fs = require('node:fs');
const path = require('node:path');

function browserPython(source, name) {
  const start = source.indexOf('var ' + name + ' = [');
  const end = source.indexOf("].join('\\n');", start);
  return eval(source.slice(start + ('var ' + name + ' = ').length, end + 1)).join('\n');
}

function exercises(file, root = path.join(__dirname, '..')) {
  const found = {};
  const text = fs.readFileSync(path.join(root, file), 'utf8');
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
import contextlib, io, json, sys, types
job = json.load(sys.stdin)
messages = {'forbidden_import': "Forbidden import: '{}'", 'forbidden_function': "Forbidden function: '{}'",
            'forbidden_method': "Forbidden method: '.{}'", 'forbidden_keyword': "Forbidden keyword: '{}'",
            'assertion_failed': 'Assertion failed', 'test_error': 'Error: {}', 'syntax_error': 'Syntax error in tests: {}'}
module = types.ModuleType('_ctm_py_exercise')
exec(job['module'], module.__dict__)
verdicts = []
for case in job['cases']:
    if (case['forbiddenImports'] or case['forbiddenKeywords']) and module.violations(case['code'], case['forbiddenImports'], case['forbiddenKeywords'], messages):
        verdicts.append('blocked'); continue
    with contextlib.redirect_stdout(io.StringIO()):
        result = module.run(case['code'], case['tests'], messages)
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

// Every case: {label, name, expected, code, tests, forbiddenImports, forbiddenKeywords}.
function cases(root = path.join(__dirname, '..')) {
  const found = exercises('examples/_python.qmd', root);
  const list = [];
  for (const [label, variants] of Object.entries(VARIANTS))
    for (const [name, code, expected] of variants)
      list.push({label, name, expected, code: code ?? found[label].starter, ...found[label]});
  return {found, list};
}

module.exports = {browserPython, exercises, RUN, VARIANTS, cases};
