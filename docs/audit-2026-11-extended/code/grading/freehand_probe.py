"""Property checks using the exact authored freehand checker source, read-only.

PYTHONPATH=ctm-checkers/src python freehand_probe.py FREEHAND_ROOT MATH_ROOT
"""
import importlib.util
import json
from pathlib import Path
import random
import re
import sys

import sympy as sp
from ctm_checkers.math_exercise.custom import check_custom

freehand, math = map(Path, sys.argv[1:3])
spec = importlib.util.spec_from_file_location("audit_question_parser", math/"_extensions/math-exercise/question-variants.py")
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
source = (freehand/"_includes/logarithms/problems.md").read_text()
exercises = {}
for block in re.findall(r"```\{math-exercise\}\n(.*?)\n```", source, re.S):
    options, _ = module.parse_source(block)
    exercises[options["label"]] = options


def grade(label, answer):
    options = exercises[label]
    return check_custom(dict(checker=options["checker"], vars=options["vars"], givens=options["givens"],
                        response=dict(kind="expressions", raw=[answer], inputs={})))


rng = random.Random(202611)
properties = []
for suffix, key in [("1b", "2"), ("3b", "(1-2*x**2)/(x-x**3)"), ("3c", "2*x-E")]:
    label = "v24-"+suffix+"-svar"
    failures = []
    for index in range(30):
        multiplier = rng.randint(1, 30)
        # Different mathematical spellings of the exact same answer.
        same = f"({multiplier}*({key}))/{multiplier}"
        shifted = f"({key})+{rng.randint(1, 20)}"
        for expected, answer in [(True, same), (False, shifted)]:
            result = grade(label, answer)
            accepted = result.get("score", 0) > 0
            if accepted != expected:
                failures.append(dict(index=index, expected=expected, answer=answer, result=result))
    properties.append(dict(label=label, cases=60, unexpected=failures))

x = sp.Symbol("x")
points = [sp.Rational(1,3), -sp.Rational(1,2), sp.Rational(7,10), -sp.Rational(9,10), sp.Rational(1,5),
          2, 3, -2, sp.Rational(5,2), 7]
target = (1-2*x*x)/(x-x**3)
wrong = sp.cancel(target + sp.prod(x-p for p in points))
sample_collision = dict(answer=str(wrong), different_from_target=sp.simplify(wrong-target)!=0,
                        difference_at_4=str((wrong-target).subs(x,4)),result=grade("v24-3b-svar", str(wrong)))
exact_offset = dict(answer="2*x-E+1/10000000",result=grade("v24-3c-svar","2*x-E+1/10000000"))
print(json.dumps(dict(sympy=sp.__version__,properties=properties,sample_collision=sample_collision,exact_offset=exact_offset),sort_keys=True))
