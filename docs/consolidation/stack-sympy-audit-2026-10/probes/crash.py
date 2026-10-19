import sys
import os
from pathlib import Path
# STACK_SYMPY: a checkout of Erasmus-CTM/stack-sympy at f450bcd (the audited commit).
STACK_SYMPY = Path(os.environ['STACK_SYMPY'])
sys.path.insert(0, str(STACK_SYMPY / '_extensions/stack-sympy'))
from stack_sympy.importer import import_xml
from stack_sympy.engine import instantiate, grade, validate
q = import_xml(Path(__file__).resolve().parent / 'q/crash.xml')[0]
v = instantiate(q, 1)
for a in ["x+1", "x=1", "a and b", "cosh(x)^20-((exp(x)+exp(-x))/2)^20+x+1"]:
    print(a, "validate:", validate(q, {"ans1": a}, variant=v)["status"], end=" | ")
    try:
        r = grade(q, {"ans1": a}, variant=v); print("grade:", r["status"], r["score"])
    except Exception as e:
        print("grade EXC:", type(e).__name__, str(e))
