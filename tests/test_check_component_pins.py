"""tools/ci/check-component-pins.py: component CI pins compared with repos.json."""
import importlib.util
import json
from pathlib import Path
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'tools/ci/check-component-pins.py'
spec = importlib.util.spec_from_file_location('check_component_pins', SCRIPT)
pins = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pins)

LIBS, OLD_LIBS, CHECKERS, UMBRELLA = '1' * 40, '2' * 40, '3' * 40, '4' * 40
PACKAGED = {'ctm-libs': {'repository': 'Erasmus-CTM/ctm-libs', 'commit': LIBS},
            'ctm-checkers': {'repository': 'Erasmus-CTM/ctm-checkers', 'commit': CHECKERS},
            'ctm-assessment': {'repository': 'Erasmus-CTM/ctm-assessment', 'branch': 'main'}}


def pin(commit, repository='Erasmus-CTM/x'):
    return {'repository': repository, 'commit': commit}


class ComponentPins(unittest.TestCase):
    def test_equal_pins_and_umbrella_tooling_pins_are_not_reported(self):
        files = {'.github/pins.json': json.dumps({'comment': 'CI', 'ctm-libs': pin(LIBS), 'ctm-checkers': pin(CHECKERS),
                                                  'ctm-assessment': pin(UMBRELLA)})}
        self.assertEqual(pins.differences(PACKAGED, 'math-exercise', files), [])

    def test_a_differing_dependency_is_reported_with_file_and_both_commits(self):
        files = {'tests/pins.json': json.dumps({'ctm-checkers': pin(OLD_LIBS)})}
        self.assertEqual(pins.differences(PACKAGED, 'ctm-libs', files),
                         [('ctm-libs', 'tests/pins.json', 'ctm-checkers', OLD_LIBS, CHECKERS)])

    def test_the_shipped_library_record_counts_as_a_ctm_libs_pin(self):
        files = {'.github/ctm-libs-source.json': json.dumps(pin(OLD_LIBS, 'Erasmus-CTM/ctm-libs'))}
        self.assertEqual(pins.differences(PACKAGED, 'pyodide-interaktiv', files),
                         [('pyodide-interaktiv', '.github/ctm-libs-source.json', 'ctm-libs', OLD_LIBS, LIBS)])

    def test_dependencies_outside_the_package_are_not_compared(self):
        files = {'tools/pins.json': '{}', '.github/pins.json': json.dumps({'stack-sympy': pin(OLD_LIBS)})}
        self.assertEqual(pins.differences(PACKAGED, 'ctm-checkers', files), [])


if __name__ == '__main__':
    unittest.main()
