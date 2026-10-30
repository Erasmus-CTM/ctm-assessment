#!/usr/bin/env python3
"""Source observations and ordinary mathematics; no exploit evaluation.
Run with the audit Python and CTM_CHECKERS_SOURCE or --workspace path.
"""
import ast, json, pathlib, sys, argparse
p=argparse.ArgumentParser(); p.add_argument('--workspace',default='/workspace'); args=p.parse_args()
root=pathlib.Path(args.workspace)
source=root/'ctm-checkers/src/ctm_checkers/math_exercise'
inputs=ast.parse((source/'inputs.py').read_text())
generated=ast.parse((source/'generated.py').read_text())
functions={n.name:ast.unparse(n) for n in generated.body if isinstance(n,ast.FunctionDef)}
ordinary=ast.unparse(next(n for n in inputs.body if isinstance(n,ast.FunctionDef) and n.name=='admit'))
print(json.dumps({'authored_admission_mentions_dunder':"'__'" in ordinary,'authored_admission_uses_token_allowlist':'admit_learner' in ordinary,'generated_admission_uses_token_allowlist':'admit_learner' in functions['admit_generated_check'],'parse_math_has_exact_power_bit_limit':'bit_length' in functions['parse_math'],'parse_math_uses_eval':any(isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id in {'eval','exec','sympify'} for n in ast.walk(ast.parse(functions['parse_math'])))},indent=2))
sys.path.insert(0,str(root/'ctm-checkers/src'))
from ctm_checkers.math_exercise.generated import parse_math, bind_data
for expr in ['Rational(2,3)','gamma(5)','factorial(6)','Matrix([[1,2],[3,4]])','1e20']:
 value=parse_math(expr)
 print(json.dumps({'ordinary_expression':expr,'type':type(value).__name__,'text':str(value)}))
print(json.dumps({'ordinary_bind':bind_data({'names':['h'],'data':{'h':'x^2+1'},'givens':'h = x+1','fields':['1'],'vars':'x'})['latex']}))
