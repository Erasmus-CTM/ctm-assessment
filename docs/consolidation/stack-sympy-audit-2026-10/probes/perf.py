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
cases = [
 ("AlgEquiv", "sin(x)^20", "((1-cos(2*x))/2)^10", ""),
 ("AlgEquiv", "sin(x)^30", "((1-cos(2*x))/2)^15", ""),
 ("AlgEquiv", "(sin(x)+cos(x))^30", "(sin(x)+cos(x))^30+sin(x)^2+cos(x)^2-1", ""),
 ("AlgEquiv", "tan(x)^12", "(sin(x)/cos(x))^12", ""),
 ("AlgEquiv", "(x+y+z)^20", "(z+y+x)^20+0*x", ""),
 ("AlgEquiv", "(a+b+c+d+e+f+g+h)^6", "(h+g+f+e+d+c+b+a)^6", ""),
 ("AlgEquiv", "(a+b+c+d+f+g+h+k)^9", "(a+b+c+d+f+g+h+k)^9+1-1", ""),
 ("AlgEquiv", "sqrt(2)^99+sqrt(3)^99", "sqrt(3)^99+sqrt(2)^99", ""),
 ("AlgEquiv", "exp(sin(x))^5", "exp(5*sin(x))", ""),
 ("AlgEquiv", "1/(x^2+1)^30", "1/(1+x^2)^30", ""),
 ("AlgEquiv", "((x+1)^(1/3)+(x-1)^(1/3))^9", "((x-1)^(1/3)+(x+1)^(1/3))^9", ""),
 ("AlgEquiv", "sin(x+y)^8", "(sin(x)*cos(y)+cos(x)*sin(y))^8", ""),
 ("AlgEquiv", "cosh(x)^20", "((exp(x)+exp(-x))/2)^20", ""),
 ("AlgEquiv", "sec(x)^12", "1/cos(x)^12", ""),
 ("EqualComAss", "(x+1)^99", "(1+x)^99", ""),
 ("FacForm", "(x+1)^99", "(x+1)^99", "x"),
 ("SingleFrac", "1/(x+1)^99", "(x+1)^(-99)", ""),
]
for name, s, t, o in cases:
    t0 = time.time()
    signal.alarm(60)
    try:
        r = answer_test(name, s, t, o, raw=s)
        out = f"valid={r['valid']} correct={r['correct']}"
    except TO:
        out = "TIMEOUT>60s"
    except Exception as e:
        out = f"EXC {type(e).__name__}: {str(e)[:80]}"
    finally:
        signal.alarm(0)
    print(f"{time.time()-t0:7.2f}s  {name:11s} {s[:34]:34s} | {t[:40]:40s} -> {out}", flush=True)
