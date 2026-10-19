"""The authored-question recorder of the umbrella's parity harness.

One question's authored tests (`#| tests:`) run with every check() call
recorded: its result (plain(): Python's bool, int, float and str as they
are, any other number with its type) and the response it was given, as the
page would send it (page_shaped(): SymPy values as text, a dynamic matrix as
its shape and entries), taken when check() is called, since a test may
change its matrix afterwards; `random` is seeded per question.

The one copy (step-2 review of ctm-checkers C1, S4): the harness runs this
file in Pyodide (worker.cjs), and ctm-checkers imports it from the pinned
umbrella checkout (tools/golden.py), so both record authored rows the same
way. Standard library only.

    record(run_question, options, base) -> {"outcome", "calls", "responses"}

`run_question(options, base)` runs one question the caller's way (its
namespace, its runtime); `options` are the question's options (checker,
tests, ...); `base` is passed through.
"""
import json
import random
import sys
import types

# The recorder of the running question, registered under this module name
# while record() runs: the wrapped checker reaches it from any namespace.
RECORDER = '_ctm_authored_record'

# Appended to the question's checker: check() records each call.
WRAP = '''
import sys as _ctm_record_sys
_ctm_record = _ctm_record_sys.modules['_ctm_authored_record']
_ctm_record_check = check
def check(*args, **kwargs):
    # The response as it is now: a test may change its matrix after the call.
    _ctm_record.responses.append(_ctm_record.page(args[0] if args else kwargs.get('response')))
    result = _ctm_record_check(*args, **kwargs)
    _ctm_record.calls.append(result)
    return result
'''


def plain(value):
    """A checker result as JSON: Python's bool, int, float and str as they are;
    any other number keeps its type ({"$type": "Rational", "value": "1/3"}),
    so a change of the returned type shows in the goldens."""
    if isinstance(value, dict):
        return {str(k): plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [plain(v) for v in value]
    if value is None or isinstance(value, (bool, str)) or type(value) is int:
        return value
    if type(value) is float:   # NaN and infinities tagged as in the requests ({"$float": "NaN"})
        return value if value == value and abs(value) != float('inf') else {'$float': 'NaN' if value != value else ('Infinity' if value > 0 else '-Infinity')}
    return {'$type': type(value).__name__, 'value': str(value)}


def _text(value):
    return value if isinstance(value, str) else str(value)


def page_shaped(value):
    """The response as the page sends it: what the learner types, as text.
    Tests pass parsed values (SymPy expressions, matrices); the page sends
    strings ("raw", and per dynamic matrix its shape and entries) and parses
    them itself. A response that is not JSON then is left out (None); the
    test itself goes on either way."""
    try:
        return _page_shaped(value)
    except Exception:
        return None


def _page_shaped(value):
    if isinstance(value, dict):
        page = {k: v for k, v in value.items() if k not in ('expressions', 'raw', 'inputs')}
        if 'raw' in value:
            page['raw'] = value['raw']
        elif isinstance(value.get('expressions'), (list, tuple)):
            page['raw'] = [_text(e) for e in value['expressions']]
        if isinstance(value.get('inputs'), dict):
            inputs = {}
            for name, item in value['inputs'].items():
                if isinstance(item, dict) and 'raw' not in item and item.get('matrix') is not None:
                    rows, cols = item['matrix'].shape
                    inputs[name] = {'type': 'matrix', 'rows': int(rows), 'cols': int(cols), 'raw': [_text(e) for e in item['matrix']]}
                elif isinstance(item, dict):
                    inputs[name] = {k: v for k, v in item.items() if k not in ('expressions', 'matrix')}
                else:
                    inputs[name] = item
            page['inputs'] = inputs
        if 'raw' in page or 'inputs' in page:
            page.setdefault('kind', 'expressions')
            page.setdefault('raw', [])
            page.setdefault('inputs', {})
        value = page
    try:
        return json.loads(json.dumps(value, allow_nan=False))
    except (TypeError, ValueError):
        return None


def record(run_question, options, base):
    """Runs one question with its check() calls recorded: its outcome ("pass",
    "assertion failed: ..." or "error: <type>: ..."), the plain() result of
    every call and the page_shaped() response of every call (None left out)."""
    recorder = types.ModuleType(RECORDER)
    recorder.calls, recorder.responses, recorder.page = [], [], page_shaped
    sys.modules[RECORDER] = recorder
    wrapped = dict(options, checker=options.get('checker', '') + WRAP)
    random.seed(0)
    try:
        run_question(wrapped, base)
        outcome = 'pass'
    except AssertionError as error:
        outcome = 'assertion failed: ' + str(error)
    except Exception as error:
        outcome = 'error: ' + type(error).__name__ + ': ' + str(error)
    finally:
        del sys.modules[RECORDER]
    return {'outcome': outcome, 'calls': plain(recorder.calls), 'responses': [r for r in recorder.responses if r is not None]}
