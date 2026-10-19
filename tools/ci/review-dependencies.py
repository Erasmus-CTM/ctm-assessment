#!/usr/bin/env python3
"""Read explicit dependency refs from a review commit; main always uses defaults.

The one copy for every CTM repository (step-2 design §7): CI fetches it from
the umbrella at a pinned commit. A head commit's trailer
`CTM-Review-Refs: {"ctm-libs": "<sha>", "ctm-checkers": "<sha>"}` names the
dependency commits to build against; it is ignored on main. Writes
CTM_REVIEW_REFS (JSON) to GITHUB_ENV and one output per repository.
"""
import json
import os
import re
import subprocess

# Repositories known under an earlier name: ai-feedback was renamed ctm-libs.
ALIASES = {'ai-feedback': 'ctm-libs'}

refs = {}
if os.environ.get('GITHUB_REF') != 'refs/heads/main':
    commit = os.environ.get('REVIEW_COMMIT') or 'HEAD'
    message = subprocess.check_output(['git', 'log', '-1', '--format=%B', commit], text=True)
    trailers = [line.removeprefix('CTM-Review-Refs: ') for line in message.splitlines() if line.startswith('CTM-Review-Refs: ')]
    if len(trailers) > 1:
        raise SystemExit('Use one CTM-Review-Refs trailer')
    if trailers:
        refs = json.loads(trailers[0])
        allowed = {'ctm-libs','ai-feedback','ctm-checkers','math-exercise','py-exercise','pyodide-interaktiv','jsxgraph','ctm-assessment'}
        if not isinstance(refs, dict) or any(name not in allowed or not isinstance(ref, str) or not re.fullmatch(r'[0-9a-f]{40}', ref) for name, ref in refs.items()):
            raise SystemExit('Review refs must map known dependencies to full commit SHAs')
        for old, new in ALIASES.items():
            if old in refs:
                ref = refs.pop(old)
                if refs.setdefault(new, ref) != ref:
                    raise SystemExit(f'Review refs name {old} and {new}, the same repository, with different commits')
                print(f'Review ref {old} is read as {new} (the repository was renamed).')
print('Explicit review dependencies: ' + json.dumps(refs, sort_keys=True))
with open(os.environ['GITHUB_ENV'], 'a') as env:
    env.write('CTM_REVIEW_REFS=' + json.dumps(refs) + '\n')
with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
    for name, ref in refs.items():
        output.write(name + '=' + ref + '\n')
