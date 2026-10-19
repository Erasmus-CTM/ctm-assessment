import sys, time, signal
import os
from pathlib import Path
# STACK_SYMPY: a checkout of Erasmus-CTM/stack-sympy at f450bcd (the audited commit).
STACK_SYMPY = Path(os.environ['STACK_SYMPY'])
sys.path.insert(0, str(STACK_SYMPY / '_extensions/stack-sympy'))
from stack_sympy.assessment import answer_test
class TO(Exception): pass
def handler(*a): raise TO()
signal.signal(signal.SIGALRM, handler)
for n in (2, 3, 4, 6, 8, 12):
    s, t = f"sin(x)^{n}*cos(x)^{n}", f"(sin(2*x)/2)^{n}"
    t0 = time.time(); signal.alarm(60)
    try:
        r = answer_test("AlgEquiv", s, t, ""); out = r["correct"]
    except TO: out = "TIMEOUT>60s"
    except Exception as e: out = type(e).__name__
    finally: signal.alarm(0)
    print(f"n={n:3d} {time.time()-t0:6.2f}s {out}", flush=True)
for s in ["sin(10^20)", "sin(exp(100))", "sin(exp(exp(3)))", "sin(exp(exp(4)))"]:
    t0 = time.time(); signal.alarm(60)
    try:
        r = answer_test("AlgEquiv", s, s + "+1", ""); out = r["correct"]
    except TO: out = "TIMEOUT>60s"
    except Exception as e: out = type(e).__name__
    finally: signal.alarm(0)
    print(f"{s:22s} {time.time()-t0:6.2f}s {out}", flush=True)
