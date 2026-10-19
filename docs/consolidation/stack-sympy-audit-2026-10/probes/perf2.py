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
 ("AlgEquiv", "sin(x)^7*cos(x)^9", "sin(x)^7*cos(x)^9+sin(2*x)-2*sin(x)*cos(x)", ""),
 ("AlgEquiv", "sqrt(2+sqrt(3))", "(sqrt(6)+sqrt(2))/2", ""),
 ("AlgEquiv", "(x^20-1)/(x-1)", "x^19+x^18+x^17+x^16+x^15+x^14+x^13+x^12+x^11+x^10+x^9+x^8+x^7+x^6+x^5+x^4+x^3+x^2+x+1", ""),
 ("AlgEquiv", "(x^99-1)/(x-1)", "(x^99-1)/(x-1)+1-1", ""),
 ("AlgEquiv", "1/(x+1)+1/(x+2)+1/(x+3)+1/(x+4)+1/(x+5)+1/(x+6)+1/(x+7)+1/(x+8)", "1/(x+8)+1/(x+7)+1/(x+6)+1/(x+5)+1/(x+4)+1/(x+3)+1/(x+2)+1/(x+1)", ""),
 ("AlgEquiv", "1/(x+1)+1/(x+2)+1/(x+3)+1/(x+4)+1/(x+5)+1/(x+6)+1/(x+7)+1/(x+8)", "1/(x+8)+1/(x+7)+1/(x+6)+1/(x+5)+1/(x+4)+1/(x+3)+1/(x+2)+1/(x+1)+sin(x)^2+cos(x)^2-1", ""),
 ("AlgEquiv", "tan(x)+tan(y)", "sin(x+y)/(cos(x)*cos(y))", ""),
 ("AlgEquiv", "sin(3*x)", "3*sin(x)-4*sin(x)^3", ""),
 ("AlgEquiv", "sin(x)^2*tan(x)^2*cos(x)^4+sin(x)^4*cos(x)^2*tan(x)^2", "sin(x)^4", ""),
 ("AlgEquiv", "(sin(x)+cos(x))^20-(cos(x)+sin(x))^20+tan(x)^5*cot(x)^5", "1", ""),
 ("AlgEquiv", "sin(sin(sin(sin(sin(x)))))^2+cos(sin(sin(sin(sin(x)))))^2", "1", ""),
 ("AlgEquiv", "log(x)^10", "log(x)^10+log(x*x)-2*log(x)", ""),
 ("AlgEquiv", "exp(x)^100", "exp(100*x)", ""),
 ("AlgEquiv", "(1+1/x)^100", "((x+1)/x)^100", ""),
 ("AlgEquiv", "(x+1)^100", "(x+1)^99*(x+1)", ""),
 ("AlgEquiv", "(x+sqrt(2))^60", "(sqrt(2)+x)^59*(x+sqrt(2))", ""),
 ("AlgEquiv", "(x+sqrt(2))^60*(x-sqrt(2))^60", "(x^2-2)^60", ""),
 ("AlgEquiv", "(x+sqrt(2)+sqrt(3))^30*(x-sqrt(2)-sqrt(3))^30", "(x^2-5-2*sqrt(6))^30", ""),
]
for name, s, t, o in cases:
    t0 = time.time()
    signal.alarm(90)
    try:
        r = answer_test(name, s, t, o, raw=s)
        out = f"valid={r['valid']} correct={r['correct']}"
    except TO:
        out = "TIMEOUT>90s"
    except Exception as e:
        out = f"EXC {type(e).__name__}: {str(e)[:80]}"
    finally:
        signal.alarm(0)
    print(f"{time.time()-t0:7.2f}s  {name:11s} {s[:38]:38s} | {t[:42]:42s} -> {out}", flush=True)
