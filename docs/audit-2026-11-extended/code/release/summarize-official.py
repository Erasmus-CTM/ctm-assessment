#!/usr/bin/env python3
"""Summarize official campaign logs; raw logs stay outside the repository."""
import argparse,json,re
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('logs',nargs='+',type=Path);args=p.parse_args()
reports=[]
for file in args.logs:
 text=file.read_text(errors='replace');npm_index=0;phase='setup';sections=[];current=None;pending_python=None
 for line in text.splitlines():
  if line=='+ python -m unittest discover -s tests -p test_*.py':phase='ctm-assessment Python';current={'suite':phase};sections.append(current)
  if line=='+ python -m unittest discover -s tests':phase='py-exercise Python';current={'suite':phase};sections.append(current)
  if line=='+ npm test':
   phase=['ctm-assessment npm','ctm-libs npm','math-exercise npm','py-exercise npm','pyodide-interaktiv npm'][npm_index];npm_index+=1;current={'suite':phase};sections.append(current)
  if line.startswith('+ npm run test:'):phase=line.removeprefix('+ npm run ');current={'suite':phase};sections.append(current)
  if line.startswith('Ran ') and current:
   pending_python=current if current['suite'].endswith('Python') else {'suite':phase+' embedded Python'}
   if pending_python is not current:sections.append(pending_python)
   pending_python['tests']=int(re.match(r'Ran (\d+)',line).group(1))
  if re.match(r'^OK(?: \(.*\))?$',line) and pending_python:
   skip=re.search(r'skipped=(\d+)',line);skipped=int(skip[1]) if skip else 0
   pending_python.update(passed=pending_python['tests']-skipped,failed=0,skipped=skipped);pending_python=None
  m=re.match(r'ℹ (tests|pass|fail|skipped|cancelled) (\d+)',line)
  if m and current:current[{'pass':'passed','fail':'failed'}.get(m[1],m[1])]=int(m[2])
 exit_code=re.findall(r'OFFICIAL(?:_LOCAL)?_EXIT=(\d+)',text)
 reports.append({'log':str(file),'exit':int(exit_code[-1]) if exit_code else None,'sections':sections,'missing_mirror_urls':sorted(set(re.findall(r'AUDIT_LOCAL_MISSING (\S+)',text)))})
print(json.dumps(reports,indent=2))
