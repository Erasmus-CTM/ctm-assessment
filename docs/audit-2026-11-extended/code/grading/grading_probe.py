"""Synthetic, deterministic correctness probes; source trees are never changed.

Run: PYTHONPATH=/path/ctm-checkers/src python grading_probe.py
Optional --zip PATH emits a pure-Python archive for local Pyodide replay.
"""
import argparse
from decimal import Decimal
import importlib
import json
from pathlib import Path
import random
import statistics
import time
import zipfile

import sympy as sp
from ctm_checkers.math_exercise.checks import check
from ctm_checkers.math_exercise.generated import bind_data, parse_math
from ctm_checkers.math_exercise.keys import compute_key


BASE = dict(mode="equivalent", vars="x", reject="", tolerance="", decplaces="",
            sigfigs="", form="", partial_credit=False, form_credit=.5)


def requests():
    rng = random.Random(202611)
    values = []
    for _ in range(100):
        a, b, c = [rng.randint(1, 20) for _ in range(3)]
        key = f"({a}*x+{b})*({c}*x+1)"
        answer = str(sp.expand(sp.sympify(key)))
        values.extend([(True, dict(BASE, student=answer, correct=key)),
                       (False, dict(BASE, student=f"({answer})+1", correct=key))])
    return values


def run():
    answers = [check(request) for _, request in requests()]
    unexpected = [(index, expected, result) for index, ((expected, _), result)
                  in enumerate(zip(requests(), answers)) if (result["status"] == "correct") != expected]
    boundaries = []
    for key in range(1, 11):
        for side in (-1, 1):
            student = str(Decimal(key) + side * Decimal("0.1"))
            request = dict(BASE, vars="", mode="numeric", student=student,
                           correct=str(key), tolerance="0.1")
            boundaries.append(dict(student=student, correct=str(key), tolerance="0.1", result=check(request)))
    simple = [dict(BASE, vars="", mode="numeric", student=s, correct="1", tolerance=t)
              for s, t in [("0.9", "10%"), ("1.1", "10%")]]
    precision = [dict(BASE, vars="", mode="numeric", student="1.1", correct="1", tolerance=".1", decplaces="1"),
                 dict(BASE, vars="", mode="numeric", student="1.0000000000000001", correct="1", tolerance="0")]
    # This is a documented trust limit: arithmetic validates the recipe, not its relationship to prose.
    recipe = compute_key(dict(recipe={"op": "value", "expr": "3"}, answer="3", mode="equivalent", vars=""))
    question_mismatch = dict(question="What is 2+2? _[1]", admitted_key=recipe,
                             mathematical_answer=check(dict(BASE, vars="", student="4", correct=recipe["key"], generated=True, learner=True)))
    def balanced(terms):
        if terms == 1: return "x"
        return "("+balanced(terms//2)+"+"+balanced(terms-terms//2)+")"
    expression = balanced(120)
    data_request = dict(givens="h=x^2*log(x)\nx0=1", fields=["1"], names=["h", "x0"],
                        data={"h": "x^2*ln(x)", "x0": "e"}, vars="x, e")
    timings = {}
    for name, operation in [("parse_120_terms", lambda: parse_math(expression, "x")),
                            ("bind_two_givens", lambda: bind_data(data_request))]:
        observed = []
        for _ in range(10):
            start = time.perf_counter(); operation(); observed.append(1000*(time.perf_counter()-start))
        timings[name] = dict(repetitions=10, min_ms=min(observed), median_ms=statistics.median(observed), max_ms=max(observed))
    return dict(sympy=sp.__version__, polynomial_properties=dict(cases=len(answers), unexpected=unexpected),
                tolerance_boundaries=boundaries, percentage_boundary=[check(r) for r in simple],
                precedence_and_float_precision=[check(r) for r in precision],
                recipe_question_mismatch=question_mismatch, bound_givens=bind_data(data_request), timings=timings,
                parity_requests=[request for _, request in requests()] + simple + precision,
                parity_results=answers+[check(r) for r in simple+precision])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(); parser.add_argument("--zip", type=Path); args = parser.parse_args()
    if args.zip:
        with zipfile.ZipFile(args.zip, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for name in ("sympy", "mpmath", "ctm_checkers"):
                package = importlib.import_module(name)
                directory = Path(package.__file__).parent
                for path in directory.rglob("*.py"):
                    archive.write(path, str(Path(name)/path.relative_to(directory)))
    print(json.dumps(run(), sort_keys=True))
