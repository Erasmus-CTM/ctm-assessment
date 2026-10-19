import sys, time, json
import os
from pathlib import Path
# STACK_SYMPY: a checkout of Erasmus-CTM/stack-sympy at f450bcd (the audited commit).
STACK_SYMPY = Path(os.environ['STACK_SYMPY'])
sys.path.insert(0, str(STACK_SYMPY / '_extensions/stack-sympy'))
from stack_sympy.assessment import answer_test
from stack_sympy.expressions import parse, evaluate
cases = [
 ("AlgEquiv", "-R", "I^2*R", ""),
 ("AlgEquiv", "E", "exp(1)", ""),
 ("AlgEquiv", "E*x", "%e*x", ""),
 ("AlgEquiv", "2*log(x)", "log(x^2)", ""),
 ("AlgEquiv", "log(x)+log(y)", "log(x*y)", ""),
 ("AlgEquiv", "x", "log(exp(x))", ""),
 ("AlgEquiv", "abs(x)", "sqrt(x^2)", ""),
 ("AlgEquiv", "x", "sqrt(x^2)", ""),
 ("AlgEquiv", "2*abs(x)", "sqrt(4*x^2)", ""),
 ("AlgEquiv", "sqrt(x)*sqrt(y)", "sqrt(x*y)", ""),
 ("AlgEquiv", "x^(1/3)", "(x)^(1/3)", ""),
 ("AlgEquiv", "(-8)^(1/3)", "-2", ""),
 ("AlgEquiv", "1/(1/x)", "x", ""),
 ("AlgEquiv", "x/x", "1", ""),
 ("AlgEquiv", "(x^2-1)/(x-1)", "x+1", ""),
 ("AlgEquiv", "0.1+0.2", "0.3", ""),
 ("AlgEquiv", "0.5", "1/2", ""),
 ("AlgEquiv", "0.333", "1/3", ""),
 ("AlgEquiv", "sin(x)^2+cos(x)^2", "1", ""),
 ("AlgEquiv", "sin*x", "x*sin", ""),
 ("AlgEquiv", "e^(i*pi)", "-1", ""),
 ("AlgEquiv", "x^2", "x*x", ""),
 ("AlgEquiv", "tan(x)", "sin(x)/cos(x)", ""),
 ("AlgEquiv", "cosh(x)^2-sinh(x)^2", "1", ""),
 ("AlgEquiv", "exp(2*log(x))", "x^2", ""),
 ("AlgEquiv", "atan(1)", "pi/4", ""),
 ("NumDecPlaces", "2.67", "2.675", "2"),
 ("NumDecPlaces", "2.68", "2.675", "2"),
 ("NumDecPlaces", "2.66", "2.665", "2"),
 ("NumDecPlaces", "2.67", "2.665", "2"),
 ("NumDecPlaces", "0.12", "0.125", "2"),
 ("NumDecPlaces", "0.13", "0.125", "2"),
 ("NumDecPlaces", "1.50e2", "150", "2"),
 ("NumDecPlaces", "3", "3", "1"),
 ("NumAbsolute", "x", "1", "0.1"),
 ("NumRelative", "0.0", "0", "0.01"),
 ("NumAbsolute", "1.1", "1", "0.1"),
 ("NumRelative", "1.01", "1", "0.01"),
]
for name, s, t, o in cases:
    t0 = time.time()
    try:
        r = answer_test(name, s, t, o, raw=s)
        out = {k: r.get(k) for k in ("valid", "correct", "cas_valid", "note", "feedback") if k in r}
    except Exception as e:
        out = f"EXC {type(e).__name__}: {e}"
    print(f"{name:13s} {s:22s} | {t:18s} | {o:4s} -> {out}  ({time.time()-t0:.2f}s)")
