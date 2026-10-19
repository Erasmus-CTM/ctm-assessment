"""integration/pyodide-parity/authored_record.py: the one authored-question recorder (worker.cjs runs it in Pyodide,
ctm-checkers imports it natively). Standard library only, so these tests need no SymPy."""
from fractions import Fraction
import importlib.util
from pathlib import Path
import random
import sys
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'integration/pyodide-parity/authored_record.py'
spec = importlib.util.spec_from_file_location('authored_record', SCRIPT)
authored_record = importlib.util.module_from_spec(spec)
spec.loader.exec_module(authored_record)


class Matrix:
    """A stand-in for a SymPy matrix: a shape and its entries row by row."""
    def __init__(self, rows, cols, entries):
        self.shape, self.entries = (rows, cols), list(entries)

    def __iter__(self):
        return iter(self.entries)


def run_question(options, base):
    """Runs a question as question-tests.py does: checker and tests in one namespace, test(check, symbols)."""
    namespace = {'base': base}
    exec(options['checker'], namespace)
    exec(options['tests'], namespace)
    namespace['test'](namespace['check'], {})


class AuthoredRecord(unittest.TestCase):
    def test_plain_keeps_python_values_and_the_type_of_other_numbers(self):
        plain = authored_record.plain
        self.assertEqual(plain({'score': 1.0, 'ok': True, 'n': 2, 'text': 'x', 'none': None}),
                         {'score': 1.0, 'ok': True, 'n': 2, 'text': 'x', 'none': None})
        self.assertEqual(plain([Fraction(1, 3), (1, 2)]), [{'$type': 'Fraction', 'value': '1/3'}, [1, 2]])
        self.assertEqual(plain([float('nan'), float('inf'), float('-inf')]),
                         [{'$float': 'NaN'}, {'$float': 'Infinity'}, {'$float': '-Infinity'}])

    def test_page_shaped_sends_text_and_matrices_as_the_page_does(self):
        page_shaped = authored_record.page_shaped
        self.assertEqual(page_shaped({'expressions': [Fraction(1, 2), 'x']}),
                         {'kind': 'expressions', 'raw': ['1/2', 'x'], 'inputs': {}})
        self.assertEqual(page_shaped({'inputs': {'Z': {'matrix': Matrix(2, 1, [Fraction(-1), 1])}}}),
                         {'kind': 'expressions', 'raw': [], 'inputs': {'Z': {'type': 'matrix', 'rows': 2, 'cols': 1, 'raw': ['-1', '1']}}})
        self.assertEqual(page_shaped({'variant': 0, 'clicks': [[0, -1]]}), {'variant': 0, 'clicks': [[0, -1]]})
        self.assertIsNone(page_shaped({'value': object()}), 'not JSON: left out')
        self.assertIsNone(page_shaped({'inputs': {'Z': {'matrix': object()}}}), 'a conversion error: left out')

    def test_record_takes_each_response_when_check_is_called_and_seeds_random(self):
        options = {'label': 'q', 'checker': 'def check(response, symbols):\n    return {"score": len(response["inputs"]["Z"]["matrix"].entries)}\n',
                   'tests': ('import random\n'
                             'def test(check, symbols):\n'
                             '    global draw\n'
                             '    draw = random.random()\n'
                             '    Z = Matrix(1, 1, ["1"])\n'
                             '    assert check({"inputs": {"Z": {"matrix": Z}}}, symbols)["score"] == 1\n'
                             '    Z.entries.append("2")\n')}
        draws = []
        def run(wrapped, base):
            namespace = {'Matrix': Matrix}
            exec(wrapped['checker'], namespace)
            exec(wrapped['tests'], namespace)
            namespace['test'](namespace['check'], {})
            draws.append(namespace['draw'])
        result = authored_record.record(run, options, 'base')
        self.assertEqual(result, {'outcome': 'pass', 'calls': [{'score': 1}],
                                  'responses': [{'kind': 'expressions', 'raw': [], 'inputs': {'Z': {'type': 'matrix', 'rows': 1, 'cols': 1, 'raw': ['1']}}}]})
        random.seed(0)
        self.assertEqual(draws, [random.random()])
        self.assertNotIn(authored_record.RECORDER, sys.modules)
        self.assertEqual(options['checker'].count('_ctm_record'), 0, 'the options themselves stay as they were')

    def test_record_reports_failing_tests_as_outcomes(self):
        checker = 'def check(response, symbols):\n    return 0.5\n'
        failing = authored_record.record(run_question, {'checker': checker, 'tests': 'def test(check, symbols):\n    assert check({}, symbols) == 1, "half"\n'}, 'b')
        self.assertEqual(failing, {'outcome': 'assertion failed: half', 'calls': [0.5], 'responses': [{}]})
        broken = authored_record.record(run_question, {'checker': checker, 'tests': 'def test(check, symbols):\n    check()\n'}, 'b')
        self.assertEqual(broken['outcome'], "error: TypeError: check() missing 2 required positional arguments: 'response' and 'symbols'")
        self.assertEqual(broken['responses'], [], 'a call without a response records None, left out')


if __name__ == '__main__':
    unittest.main()
