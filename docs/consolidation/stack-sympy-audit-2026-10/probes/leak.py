import sys, json
from pathlib import Path
import os
# STACK_SYMPY: a checkout of Erasmus-CTM/stack-sympy at f450bcd (the audited commit).
STACK_SYMPY = Path(os.environ['STACK_SYMPY'])
sys.path.insert(0, str(STACK_SYMPY / '_extensions/stack-sympy'))
from stack_sympy.importer import import_xml
from stack_sympy.engine import instantiate, grade, validate
R = STACK_SYMPY / 'questions'
for f, answers in [("polynomial-expansion.xml", {"ans1": "ta"}),
                   ("rational-equivalence.xml", {"ans1": "ta"}),
                   ("numerical-measurement.xml", {"perimeter": "ta_perimeter", "area": "ta_area", "area2": "ta_area"}),
                   ("course-b-rank-pivots.xml", None),
                   ("determinant-one.xml", None),
                   ("python-checker.xml", {"ans": "d"}),
                   ("zero-product.xml", {"ans1": "ta"})]:
    kw = {}
    if f == "python-checker.xml":
        kw["python_checkers"] = R / "checkers.py"
    if f in ("determinant-one.xml",):
        kw["python_checkers"] = R / "matrix-checkers.py"
    q = import_xml(R / f, **kw)[0]
    v = instantiate(q, 1)
    if answers is None:
        answers = {i["name"]: i["teacher"] for i in q["inputs"]}
    names = [i["name"] for i in q["inputs"]]
    answers = {n: answers.get(n, list(answers.values())[0]) for n in names}
    val = validate(q, answers, variant=v)
    g = grade(q, answers, variant=v)
    print(f"{f}: answers={answers}")
    print("   preview:", {n: d.get("latex") for n, d in val["inputs"].items()})
    print("   grade:", g["status"], g["score"])
