import sys, json
from pathlib import Path
import os
# STACK_SYMPY: a checkout of Erasmus-CTM/stack-sympy at f450bcd (the audited commit).
STACK_SYMPY = Path(os.environ['STACK_SYMPY'])
sys.path.insert(0, str(STACK_SYMPY / '_extensions/stack-sympy'))
from stack_sympy.importer import import_xml
from stack_sympy.engine import instantiate, grade, validate, run_question_tests
Q = Path(__file__).resolve().parent / 'q'
def load(name):
    return import_xml(Q / name)[0]
def show(label, r):
    keep = {k: r[k] for k in ("status", "score", "feedback") if k in r}
    keep["prts"] = {n: {k: p[k] for k in ("score", "feedback", "note")} for n, p in r.get("prts", {}).items()}
    keep["inputs"] = {n: {k: v for k, v in d.items() if k in ("valid", "feedback")} for n, d in r.get("inputs", {}).items()}
    print(label, json.dumps(keep, ensure_ascii=False))

q = load('quiet.xml'); v = instantiate(q, 1)
show("QUIET (x+2)*(x-1) factored:", grade(q, {"ans1": "(x+2)*(x-1)"}, variant=v))
show("QUIET x^2+x-2 not factored:", grade(q, {"ans1": "x^2+x-2"}, variant=v))

q = load('thirds.xml'); v = instantiate(q, 1)
show("THIRDS all correct:", grade(q, {"a": "1", "b": "2", "c": "3"}, variant=v))
t = run_question_tests(q, variants=[v])
for r in t["results"]:
    print("  qtest", r["testcase"], "passed" if r["passed"] else "FAILED", [c["actual"] for c in r["checks"]])

q = load('physics-I.xml'); v = instantiate(q, 1)
show("PHYS P=-R for I^2*R:", grade(q, {"ans1": "-R"}, variant=v))
show("PHYS validate -R:", validate(q, {"ans1": "-R"}, variant=v))
print("  qtest:", run_question_tests(q, variants=[v])["passed"])

q = load('numabs-branch.xml'); v = instantiate(q, 1)
show("NUMABS 45*x:", grade(q, {"ans1": "45*x"}, variant=v))
show("NUMABS 0.785:", grade(q, {"ans1": "0.785"}, variant=v))
t = run_question_tests(q, variants=[v]); print("  qtest:", t["passed"], [c["actual"] for r in t["results"] for c in r["checks"]])

q = load('options.xml'); v = instantiate(q, 1)
print("OPTIONS import ok (complexno j, decimals , ignored):", sorted(k for k in q if k in ("complexno", "decimals")))
show("OPTIONS 3+4*j:", grade(q, {"ans1": "3+4*j"}, variant=v))
show("OPTIONS validate 3,5:", validate(q, {"ans1": "3,5"}, variant=v))

q = load('twoparts.xml'); v = instantiate(q, 1)
show("TWO-PARTS only (a):", grade(q, {"ans1": "2", "ans2": ""}, variant=v))

q = load('eqtype.xml'); v = instantiate(q, 1)
show("EQTYPE validate 2*x+1:", validate(q, {"ans1": "2*x+1"}, variant=v))
show("EQTYPE grade 2*x+1:", grade(q, {"ans1": "2*x+1"}, variant=v))
