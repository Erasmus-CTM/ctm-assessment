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
 ("AlgEquiv", "exp(exp(exp(exp(10))))", "exp(exp(exp(exp(10))))+1", ""),
 ("AlgEquiv", "sin(exp(exp(exp(5))))", "sin(exp(exp(exp(5))))+1", ""),
 ("AlgEquiv", "exp(exp(exp(x)))", "exp(exp(exp(x)))+sin(x)^2+cos(x)^2-1", ""),
 ("AlgEquiv", "tan(tan(tan(tan(tan(tan(x))))))", "tan(tan(tan(tan(tan(tan(x))))))+1-1", ""),
 ("AlgEquiv", "sin(x)^99*cos(x)^99", "(sin(2*x)/2)^99", ""),
 ("AlgEquiv", "(sin(x)+cos(y)+tan(z))^12", "(cos(y)+sin(x)+tan(z))^12+0", ""),
 ("AlgEquiv", "(sin(x)+cos(y)+tan(z))^12", "(cos(y)+sin(x)+tan(z))^11*(sin(x)+cos(y)+tan(z))+sin(x)^2+cos(x)^2-1", ""),
 ("AlgEquiv", "log(log(log(log(x))))", "log(log(log(log(x))))+log(1)", ""),
 ("NumRelative", "exp(exp(exp(exp(10))))", "1", "0.1"),
 ("NumAbsolute", "sin(exp(exp(exp(5))))", "0", "2"),
]
for name, s, t, o in cases:
    t0 = time.time()
    signal.alarm(120)
    try:
        r = answer_test(name, s, t, o, raw=s)
        out = f"valid={r['valid']} correct={r['correct']} {r.get('feedback','')[:50]}"
    except TO:
        out = "TIMEOUT>120s"
    except Exception as e:
        out = f"EXC {type(e).__name__}: {str(e)[:80]}"
    finally:
        signal.alarm(0)
    print(f"{time.time()-t0:7.2f}s  {name:11s} {s[:38]:38s} | {t[:42]:42s} -> {out}", flush=True)
