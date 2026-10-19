from sympy import *
from sympy.parsing.sympy_parser import (
    parse_expr, standard_transformations,
    implicit_multiplication_application, convert_xor
)
_math_tf = standard_transformations + (
    implicit_multiplication_application, convert_xor,
)
import json as _mj
import re as _mre
from math import log10, floor, gcd

_FRAC_RE = _mre.compile(r"(-?\d+)\s*/\s*(-?\d+)")

def _numeric_not_reduced(raw):
    # True if raw contains any literal int/int fraction that is not fully
    # reduced (e.g. the "2/4" inside "1/4 + 2/4"). SymPy auto-reduces
    # Rationals as soon as they are parsed/combined, so this has to scan
    # the original text, not the parsed expression.
    for _m in _FRAC_RE.finditer(raw):
        num, den = int(_m.group(1)), int(_m.group(2))
        if den != 0 and gcd(abs(num), abs(den)) != 1:
            return True
    return False

def _split_top(s, sep=","):
    parts = []
    depth = 0
    cur = ""
    for ch in s:
        if ch in "([{": depth += 1
        elif ch in ")]}": depth -= 1
        if ch == sep and depth == 0:
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    parts.append(cur)
    return [p.strip() for p in parts if p.strip() != ""]

# Rounds the decimal value (15 significant digits, so binary noise in a
# computed key such as 1.05*1.9 does not count) half away from zero:
# round(5.395, 2) is 5.39 for the binary float, but 5.40 here.
def _round_places(x, d):
    from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
    try:
        return float(Decimal(format(float(x), '.15g')).quantize(Decimal(1).scaleb(-d), rounding=ROUND_HALF_UP))
    except (InvalidOperation, ValueError, OverflowError):
        return round(x, d)

def _sigfigs_round(x, n):
    if x == 0: return 0.0
    d = n - int(floor(log10(abs(x)))) - 1
    return _round_places(x, d)

def _parse_tol(spec, ref):
    spec = spec.strip()
    if spec.endswith("%"):
        return abs(ref) * float(spec[:-1]) / 100.0
    return float(spec)

def _canon_form(expr, form):
    if form == "factored":        return factor(expr)
    if form == "expanded":        return expand(expr)
    if form == "single_fraction": return together(expr)
    if form == "lowest_terms":    return cancel(expr)
    return expr

def _num_equal(sv, cv):
    if _math_decplaces.strip():
        n = int(_math_decplaces)
        return _round_places(sv, n) == _round_places(cv, n)
    if _math_sigfigs.strip():
        n = int(_math_sigfigs)
        return _sigfigs_round(sv, n) == _sigfigs_round(cv, n)
    if _math_tolerance.strip():
        return abs(sv - cv) <= _parse_tol(_math_tolerance, cv)
    return abs(sv - cv) <= 1e-8 * max(1.0, abs(cv))

def _build_locals():
    _local = {}
    if _math_vars.strip():
        for _v in _math_vars.replace(",", " ").split():
            _v = _v.strip()
            if _v: _local[_v] = symbols(_v)
    _local.setdefault("inf", oo)
    return _local

def graph_from_response(response, *, directed=False):
    """Validate graph-editor JSON and return a NetworkX graph."""
    import math as _graph_math
    import networkx as nx

    if not isinstance(response, dict):
        raise ValueError("Graph response must be an object")
    expected = "directed-graph" if directed else "undirected-graph"
    if response.get("representation") != expected:
        raise ValueError(f"Expected {expected} response")
    nodes = response.get("nodes")
    edges = response.get("edges")
    if not isinstance(nodes, list) or not isinstance(edges, list):
        raise ValueError("Graph response needs node and edge lists")

    graph = nx.DiGraph() if directed else nx.Graph()
    known = set()
    for node in nodes:
        if not isinstance(node, dict):
            raise ValueError("Every graph node must be an object")
        node_id = node.get("id")
        if type(node_id) is not int or node_id in known:
            raise ValueError("Graph node identifiers must be unique integers")
        try:
            x, y = float(node["x"]), float(node["y"])
        except (KeyError, TypeError, ValueError):
            raise ValueError("Every graph node needs numeric x and y coordinates")
        if not _graph_math.isfinite(x) or not _graph_math.isfinite(y):
            raise ValueError("Graph node coordinates must be finite")
        known.add(node_id)
        graph.add_node(node_id, x=x, y=y)

    seen = set()
    for edge in edges:
        if not isinstance(edge, list) or len(edge) != 2:
            raise ValueError("Every graph edge must contain two endpoints")
        source, target = edge
        if source not in known or target not in known or source == target:
            raise ValueError("Graph edges need two distinct known endpoints")
        key = (source, target) if directed else tuple(sorted((source, target)))
        if key in seen:
            raise ValueError("Graph response contains a duplicate edge")
        seen.add(key)
        graph.add_edge(source, target)
    return graph

def assess_basis(matrix, *, axis, target_dimension, belongs, name, space_name="space"):
    """Assess a row- or column-basis submission without privileging vector order.

    ``belongs(vector)`` decides only whether a nonzero vector belongs to the
    target space.  This helper owns rank, dependence, scoring, assessment
    colors, and standard feedback so individual checkers do not duplicate them.
    """
    if axis not in ("rows", "columns"):
        raise ValueError("Basis assessment axis must be rows or columns")
    target_dimension = int(target_dimension)
    if target_dimension < 0:
        raise ValueError("Basis target dimension cannot be negative")
    if not callable(belongs):
        raise TypeError("Basis membership test must be callable")

    count = matrix.rows if axis == "rows" else matrix.cols
    singular = "row" if axis == "rows" else "column"
    vectors = [matrix[i, :] for i in range(count)] if axis == "rows" else [matrix[:, i] for i in range(count)]

    if target_dimension == 0:
        statuses = ["incorrect"] * count
        return {
            "score": 1.0 if count == 0 else 0.0,
            "show_score": False,
            "feedback": "" if count == 0 else f"The {space_name} is trivial, so its basis is empty. Remove every {singular}.",
            "assessment": {name: {axis: statuses}},
        }

    locally_valid = []
    valid_vectors = []
    for vector in vectors:
        zero = vector == zeros(*vector.shape)
        valid = (not zero) and bool(belongs(vector))
        locally_valid.append(valid)
        if valid:
            valid_vectors.append(vector)

    if valid_vectors:
        family = Matrix.vstack(*valid_vectors) if axis == "rows" else Matrix.hstack(*valid_vectors)
        rank = int(family.rank())
    else:
        rank = 0
    valid_count = len(valid_vectors)
    dependent = rank < valid_count
    statuses = [
        ("dependent" if dependent else "correct") if valid else "incorrect"
        for valid in locally_valid
    ]

    if count == 0:
        score = 0.0
    else:
        coverage = min(rank, target_dimension) / target_dimension
        validity = valid_count / count
        independence = rank / valid_count if valid_count else 0.0
        score = float(coverage * validity * independence)

    invalid_count = count - valid_count
    plural = singular + "s"
    if score >= 1.0 - 1e-9:
        feedback = ""
    elif count == 0:
        feedback = f"Add one or more basis {plural} for the {space_name}."
    elif invalid_count and dependent:
        feedback = (f"The red {plural} are zero or outside the {space_name}. "
                    f"The yellow {plural} belong to the {space_name}, but together they are linearly dependent. "
                    f"Remove or replace the red {plural}, choose an independent subset of the yellow {plural}, "
                    f"and check that the result spans the whole {space_name}.")
    elif invalid_count:
        feedback = f"Remove or replace the red {plural}; each is zero or outside the {space_name}."
        if rank < target_dimension:
            feedback += f" Then add independent {plural} until the family spans the whole {space_name}."
    elif dependent and rank == target_dimension:
        feedback = (f"Every yellow {singular} belongs to the {space_name}, but the family is linearly dependent. "
                    f"Remove one or more yellow {plural} until an independent basis remains.")
    elif dependent:
        feedback = (f"Every yellow {singular} belongs to the {space_name}, but the family is linearly dependent. "
                    f"Choose an independent subset, then add independent {plural} until it spans the whole {space_name}.")
    else:
        feedback = (f"The green {plural} are valid and independent. "
                    f"Add more independent {plural} until they span the whole {space_name}.")

    return {"score": score, "show_score": False, "feedback": feedback, "assessment": {name: {axis: statuses}}}

def _math_check():
    try:
        mode = _math_mode
        if mode in ("string", "string_ci"):
            s, c = _math_student, _math_correct
            if mode == "string_ci": s, c = s.lower(), c.lower()
            ok = s == c
            return {"status": "correct" if ok else "wrong", "score": 1.0 if ok else 0.0}

        _local = _build_locals()

        if mode == "set":
            s_items = [parse_expr(p, local_dict=_local, transformations=_math_tf) for p in _split_top(_math_student)]
            c_items = [parse_expr(p, local_dict=_local, transformations=_math_tf) for p in _split_top(_math_correct)]
            unmatched = list(c_items)
            matched = 0
            for si in s_items:
                found = None
                for ci in unmatched:
                    d = simplify(si - ci)
                    if d == 0 or (d.is_number and abs(complex(d.evalf())) < 1e-8):
                        found = ci
                        break
                if found is not None:
                    unmatched.remove(found)
                    matched += 1
            exact = matched == len(c_items) == len(s_items)
            if exact:
                return {"status": "correct", "score": 1.0}
            extra = len(s_items) - matched
            score = (max(0.0, matched - extra) / len(c_items)) if (_math_partial_credit and c_items) else 0.0
            return {"status": "partial" if score > 0 else "wrong", "score": score}

        _ms = parse_expr(_math_student, local_dict=_local, transformations=_math_tf)
        _mc = parse_expr(_math_correct,  local_dict=_local, transformations=_math_tf)

        if mode == "numeric":
            sv, cv = complex(_ms.evalf()), complex(_mc.evalf())
            if abs(sv.imag) > 1e-9 or abs(cv.imag) > 1e-9:
                return {"status": "wrong", "score": 0.0}
            ok = _num_equal(sv.real, cv.real)
            return {"status": "correct" if ok else "wrong", "score": 1.0 if ok else 0.0}

        _d  = simplify(_ms - _mc)
        _eq = (_d == 0) or (_d.is_number and abs(complex(_d.evalf())) < 1e-10)
        if not _eq:
            return {"status": "wrong", "score": 0.0}
        if mode == "exact":
            if str(_ms) != str(_mc):
                return {"status": "not_exact", "score": _math_form_credit if _math_partial_credit else 0.0}
            # SymPy auto-reduces Rationals on parse, so an un-reduced
            # numeric fraction (e.g. "2/4" inside "1/4 + 2/4") is
            # invisible to the string check above; "exact" is meant to
            # be the strictest mode, so catch it on the raw text too.
            if not _ms.free_symbols and _numeric_not_reduced(_math_student):
                return {"status": "not_exact", "score": _math_form_credit if _math_partial_credit else 0.0}
        if _math_form.strip():
            if _math_form == "lowest_terms" and not _ms.free_symbols:
                if _numeric_not_reduced(_math_student):
                    return {"status": "not_form", "score": _math_form_credit if _math_partial_credit else 0.0}
            elif _ms != _canon_form(_ms, _math_form):
                return {"status": "not_form", "score": _math_form_credit if _math_partial_credit else 0.0}
        if _math_reject.strip():
            _mr  = parse_expr(_math_reject, local_dict=_local, transformations=_math_tf)
            if str(_ms) == str(_mr):
                return {"status": "rejected", "score": 0.0}
        return {"status": "correct", "score": 1.0}
    except Exception as _me:
        return {"status": "error", "message": str(_me)}

def _normalize_custom_result(result):
    feedback = ""
    assessment = {}
    show_score = True
    if isinstance(result, bool):
        score = 1.0 if result else 0.0
    elif isinstance(result, (int, float)):
        score = float(result)
    elif isinstance(result, dict):
        feedback = str(result.get("feedback", ""))
        assessment = result.get("assessment", {})
        show_score = bool(result.get("show_score", True))
        if not isinstance(assessment, dict):
            raise TypeError("Custom checker assessment must be a dictionary")
        if "score" in result:
            score = float(result["score"])
        elif "correct" in result:
            score = 1.0 if bool(result["correct"]) else 0.0
        else:
            raise ValueError("Custom checker result needs score or correct")
    else:
        raise TypeError("Custom checker must return bool, number, or dict")
    if not 0.0 <= score <= 1.0:
        raise ValueError("Custom checker score must be between 0 and 1")
    status = "correct" if score >= 1.0 - 1e-9 else ("wrong" if score <= 1e-9 else "partial")
    return {"status": status, "score": score, "show_score": show_score, "feedback": feedback, "assessment": assessment}

def _math_check_custom():
    try:
        if not _math_checker.strip():
            raise ValueError("mode custom requires a checker")
        _local = _build_locals()
        response = _mj.loads(_math_response_json)
        if isinstance(response, dict) and response.get("kind") == "expressions":
            raw_values = response.get("raw", [])
            response["expressions"] = [parse_expr(v, local_dict=_local, transformations=_math_tf) for v in raw_values]
            for name, item in response.get("inputs", {}).items():
                if not isinstance(item, dict) or item.get("type") != "matrix":
                    continue
                rows, cols = int(item.get("rows", -1)), int(item.get("cols", -1))
                if rows < 0 or cols < 0:
                    raise ValueError(f"Invalid matrix dimensions for {name}")
                matrix_raw = item.get("raw", [])
                if len(matrix_raw) != rows * cols:
                    raise ValueError(f"Matrix {name} has inconsistent dimensions")
                matrix_expressions = [parse_expr(v, local_dict=_local, transformations=_math_tf) for v in matrix_raw]
                item["expressions"] = matrix_expressions
                item["matrix"] = Matrix(rows, cols, matrix_expressions)
        checker_symbols = {k: v for k, v in _local.items() if isinstance(v, Symbol)}
        namespace = dict(globals())
        exec(_math_checker, namespace)
        checker = namespace.get("check")
        if not callable(checker):
            raise ValueError("Custom checker must define check(expressions, symbols)")
        return _normalize_custom_result(checker(response, checker_symbols))
    except Exception as _me:
        return {"status": "error", "message": str(_me)}

_MATH_INPUTS = ("_math_student", "_math_correct", "_math_vars", "_math_mode", "_math_reject",
                "_math_tolerance", "_math_decplaces", "_math_sigfigs", "_math_form",
                "_math_partial_credit", "_math_form_credit", "_math_response_json", "_math_checker")

try:
    import _ctm_guard
except ImportError:  # native test runners (question-tests.py) have no page to protect
    _ctm_guard = None

def _learner_strings(request):
    # Only what this request brought: earlier requests leave other inputs behind.
    if "_math_student" in request and request.get("_math_mode") not in ("string", "string_ci"):
        yield request["_math_student"] or ""  # string answers are never evaluated
    try:
        response = _mj.loads(request.get("_math_response_json") or "null")
    except ValueError:
        return
    if isinstance(response, dict):
        yield from response.get("raw", []) or []
        for item in (response.get("inputs") or {}).values():
            if isinstance(item, dict):
                yield from item.get("raw", []) or []

def _math_run(name, caller):
    # Move this request's inputs out of the shared namespace into the module.
    request = {key: caller.pop(key) for key in _MATH_INPUTS if key in caller}
    globals().update(request)
    # Learner answers are parsed by SymPy (which evaluates Python): no dunder
    # access. Author data (variants, checkers) is not restricted.
    if any("__" in str(text) for text in _learner_strings(request)):
        raise ValueError("SyntaxError: unsupported input")
    # Whatever the parsed answer or checker does, other components on the
    # page keep their interpreter state.
    state = _ctm_guard.snapshot() if _ctm_guard else None
    try:
        return _mj.dumps(globals()[name]())
    finally:
        if state is not None:
            _ctm_guard.restore(state)
