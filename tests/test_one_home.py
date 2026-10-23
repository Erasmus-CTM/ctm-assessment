"""Checker code has one home, ctm-checkers (step-2 design §3.6): check_one_home."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('setup_feedback', Path(__file__).resolve().parents[1] / 'scripts/setup-feedback-integration.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

EXTENSIONS = {'ctm-libs': ['ctm-libs', 'ai-feedback'], 'math-exercise': ['math-exercise'], 'py-exercise': ['py-exercise'],
              'ctm-checkers': ['ctm-checkers']}
CHECK = 'def _math_check(response, keys):\n    return True\n'


class OneHome(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        files = {
            'ctm-libs/ctm-libs.lua': '-- ctm.checkers finds and calls ctm-checkers\nlocal function assess(x) return x end\n',
            'ai-feedback/_extension.yml': 'title: AI Feedback\n',
            'math-exercise/math-exercise.js': 'var r = checkers.call("_math_check", response, keys);\n',
            'math-exercise/math-exercise.lua': 'local checkers = require("ctm.checkers")\n',
            'math-exercise/variants.py': 'import random\n',
            'math-exercise/question-tests.py': 'from ctm_checkers import run_question_tests\n',
            'py-exercise/py-exercise.js': 'function setupExercise() {}\n',
            'ctm-checkers/ctm_checkers/checks.py': CHECK + 'def assess_basis(vectors):\n    return vectors\n',
            'ctm-checkers/ctm_checkers-0.1.1-py3-none-any.whl': 'PK\x03\x04',
        }
        for name, text in files.items():
            self.write(name, text)

    def write(self, name, text):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)

    def check(self, extensions=EXTENSIONS):
        builder.check_one_home(extensions, self.root)

    def assertRejected(self, where, extensions=EXTENSIONS):
        with self.assertRaises(SystemExit) as stop:
            self.check(extensions)
        self.assertIn('Checker code belongs in ctm-checkers only', str(stop.exception))
        self.assertIn(where, str(stop.exception))

    def test_checker_code_in_ctm_checkers_passes(self):
        self.check()

    def test_definitions_elsewhere_are_rejected(self):
        cases = {
            'math-exercise/math-exercise.js': '\nvar SRC = `\n' + CHECK + '`;\n',
            'py-exercise/py-exercise.js': '\n' + CHECK,
            'ctm-libs/ctm-libs.lua': '\n-- def assess_basis(vectors):\n',
            'math-exercise/lib.mjs': CHECK,
            'math-exercise/lib.cjs': CHECK,
            'math-exercise/checkers.json': '{"py": "import sympy\\ndef _math_check(response, keys):\\n    return True\\n"}',
            'math-exercise/escaped.js': 'var SRC = "x = 1\\n\\ndef\\tassess_basis(v):\\n    return v";\n',
            'math-exercise/spaces.js': '\ndef  _math_check(a):\n    pass\n',
            'math-exercise/tab.lua': '\ndef\t_math_check(a):\n    pass\n',
            'ai-feedback/notes.txt': 'def\n_math_check(a): pass\n',
        }
        for name, text in cases.items():
            with self.subTest(file=name):
                original = (self.root / name).read_text() if (self.root / name).exists() else None
                self.write(name, (original or '') + text)
                self.assertRejected(name + ' defines checker code')
                if original is None:
                    (self.root / name).unlink()
                else:
                    self.write(name, original)
                self.check()

    def test_names_and_calls_are_not_definitions(self):
        self.write('math-exercise/math-exercise.js', 'undef _math_check; var x = "redef assess_basis"; call(_math_check);\n'
                   'var s = "\\\\def _math_check";\n')
        self.check()

    def test_component_native_resolver_wrappers_pass_without_checker_definitions(self):
        self.write('math-exercise/variant_resolver.py', 'from ctm_checkers import run_question_tests\n')
        self.write('math-exercise/question-variants.py', 'import json\n')
        self.check()
        self.write('math-exercise/variant_resolver.py', CHECK)
        self.assertRejected('math-exercise/variant_resolver.py defines checker code')

    def test_other_python_in_math_exercise_is_rejected(self):
        self.write('math-exercise/checkers.py', 'x = 1\n')
        self.assertRejected('math-exercise/checkers.py is Python besides')

    def test_variants_in_a_subfolder_is_rejected(self):
        self.write('math-exercise/sub/variants.py', 'x = 1\n')
        self.assertRejected('math-exercise/sub/variants.py is Python besides')

    def test_a_wheel_outside_ctm_checkers_is_rejected(self):
        self.write('math-exercise/ctm_checkers-0.1.1-py3-none-any.whl', 'PK\x03\x04')
        self.assertRejected('math-exercise/ctm_checkers-0.1.1-py3-none-any.whl is a wheel outside ctm-checkers')

    def test_the_rule_holds_without_ctm_checkers_in_the_package(self):
        extensions = {name: folders for name, folders in EXTENSIONS.items() if name != 'ctm-checkers'}
        self.check(extensions)
        self.write('math-exercise/math-exercise.js', CHECK)
        self.assertRejected('math-exercise/math-exercise.js defines checker code', extensions)


if __name__ == '__main__':
    unittest.main()
