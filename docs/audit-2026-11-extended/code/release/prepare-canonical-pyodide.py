#!/usr/bin/env python3
"""Fetch canonical0.28.3 packages via configured curl trust; verify original lock SHA.
Only explicit local output is written. No audited lock/pin/source is changed.
"""
import argparse,json,hashlib,subprocess,concurrent.futures,shutil
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--lock',type=Path,default=Path('/workspace/ctm-assessment/node_modules/pyodide/pyodide-lock.json'));p.add_argument('--out',type=Path,default=Path('/workspace/audit-assets/pyodide-packages'));args=p.parse_args();args.out.mkdir(parents=True,exist_ok=True)
lock=json.loads(args.lock.read_text());packages=lock['packages'];needed=set()
def add(name):
 if name in needed:return
 needed.add(name)
 for dep in packages[name]['depends']:add(dep)
for n in ['sympy','micropip','packaging','networkx','matplotlib','numpy','pyodide-http']:add(n)
def fetch(name):
 spec=packages[name];target=args.out/spec['file_name'];want=spec['sha256']
 if name=='sympy' and not target.exists() and Path('/workspace/audit-assets/wheels/sympy-pyodide.whl').exists():shutil.copy2('/workspace/audit-assets/wheels/sympy-pyodide.whl',target)
 if not target.exists() or hashlib.sha256(target.read_bytes()).hexdigest()!=want:
  subprocess.run(['curl','--fail','--location','--retry','2','--max-time','180','--silent','--show-error','https://cdn.jsdelivr.net/pyodide/v0.28.3/full/'+spec['file_name'],'--output',str(target)],check=True)
 assert hashlib.sha256(target.read_bytes()).hexdigest()==want,(name,'hash mismatch')
 return {'name':name,'version':spec['version'],'file':target.name,'sha256':want,'bytes':target.stat().st_size}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 records=list(pool.map(fetch,sorted(needed)))
(args.out/'canonical-provenance.json').write_text(json.dumps(records,indent=2));print(json.dumps({'packages':len(records),'bytes':sum(x['bytes'] for x in records),'out':str(args.out)}),flush=True)
