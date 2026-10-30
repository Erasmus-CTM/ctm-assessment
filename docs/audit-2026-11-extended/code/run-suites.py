#!/usr/bin/env python3
"""Re-run snapshot suites in disposable archives; logs stay outside the report."""
import concurrent.futures, json, os, pathlib, re, shutil, subprocess, time, sys
ROOT=pathlib.Path(os.environ.get('CTM_AUDIT_ROOT','/workspace'))
OUT=ROOT/'audit-tests'; OUT.mkdir(exist_ok=True)
LOG=pathlib.Path('/tmp/ctm-extended-suite-logs'); LOG.mkdir(exist_ok=True)
PY=str(ROOT/'.cloud-setup/venv/bin/python')
env=os.environ.copy(); env['PATH']=str(ROOT/'.cloud-setup/venv/bin')+':'+str(ROOT/'.cloud-setup/quarto-1.8.27/bin')+':'+env['PATH']
env['XDG_CACHE_HOME']=str(ROOT/'.cloud-setup/cache')
env['CHROMIUM_PATH']='/usr/bin/chromium'; env['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH']='/usr/bin/chromium'
env['NODE_PATH']=str(ROOT/'ctm-assessment/node_modules')
env.update({
 'XDG_CONFIG_HOME':str(ROOT/'.cloud-setup/config'),
 'XDG_DATA_HOME':str(ROOT/'.cloud-setup/data'),
 'npm_config_cache':str(ROOT/'.cloud-setup/npm-cache'),
 'CHROMIUM_EXECUTABLE':'/usr/bin/chromium',
 'STACK_SYMPY_CHROMIUM':'/usr/bin/chromium',
 'PLAYWRIGHT_BROWSERS_PATH':str(ROOT/'.cloud-setup/browsers'),
 'QUARTO_PYTHON':PY,
 'CTM_LIBS_EXTENSION':str(ROOT/'ctm-libs/_extensions/ctm-libs'),
 'CTM_CHECKERS_EXTENSION':str(ROOT/'.cloud-setup/assessment-integration/site/_extensions/ctm-checkers'),
 'CTM_CHECKERS_SOURCE':str(ROOT/'ctm-checkers'),
 'CTM_CHECKERS_WHEEL':str(ROOT/'.cloud-setup/assessment-integration/site/_extensions/ctm-checkers/ctm_checkers-0.12.0.dev0-py3-none-any.whl'),
 'CTM_VARIANTS_NATIVE':str(ROOT/'.cloud-setup/assessment-integration/site/_extensions/ctm-checkers/native-authoring'),
 'JSXGRAPH_EXTENSION':str(ROOT/'audit-snapshots/jsxgraph-quarto/_extensions/jsxgraph'),
 'CTM_COMPONENT_DEV':'1',
})
repos=['ctm-assessment','ctm-libs','math-exercise','py-exercise','ctm-checkers','pyodide-interaktiv','jsxgraph-quarto','ctm-demo','ingmat3a_ntnu','stack-wasm-maxima','freehand_ai_assessment']
pins=json.loads((ROOT/'ctm-assessment/integration/feedback/repos.json').read_text())['repositories']
for name in repos:
 target=OUT/name
 if target.exists(): continue
 target.mkdir()
 source=ROOT/name
 if name=='freehand_ai_assessment': source=ROOT/'audit-snapshots'/name
 pin=pins.get('jsxgraph' if name=='jsxgraph-quarto' else name,{}).get('commit','HEAD')
 p=subprocess.Popen(['git','-C',str(source),'archive',pin],stdout=subprocess.PIPE)
 subprocess.run(['tar','-x','-C',str(target)],stdin=p.stdout,check=True); p.stdout.close()
 if p.wait(): raise RuntimeError(name)
 modules=source/'node_modules'
 if not modules.exists(): modules=ROOT/'ctm-assessment/node_modules'
 (target/'node_modules').symlink_to(modules)
 (target/'.audit-pin').write_text(subprocess.check_output(['git','-C',str(source),'rev-parse',pin],text=True).strip())

def run(job):
 name,repo,cmd,limit=job; target=OUT/repo
 run_env={**env,'PYTHONPATH':str(target/'src')+':'+str(target)+':'+str(ROOT/'ctm-checkers/src')}
 if repo in ['ctm-libs','ctm-assessment']: run_env.pop('CTM_COMPONENT_DEV',None)
 start=time.monotonic(); path=LOG/(name+'.log')
 try:
  with path.open('w') as f:
   p=subprocess.run(cmd,cwd=target,env=run_env,stdout=f,stderr=subprocess.STDOUT,timeout=limit)
  code=p.returncode
 except subprocess.TimeoutExpired: code='timeout'
 data=path.read_text(errors='replace')
 counts={}
 for k in ['tests','pass','fail','cancelled','skipped','todo']:
  x=re.findall(r'^(?:#|ℹ) '+k+r' (\d+)\s*$',data,re.M)
  if x: counts[k]=sum(map(int,x))
 pytest=re.findall(r'(\d+) (passed|failed|skipped|error|errors|deselected)',data)
 if pytest: counts.update({k:int(n) for n,k in pytest})
 r={'name':name,'repo':repo,'command':cmd,'exit':code,'seconds':round(time.monotonic()-start,3),'counts':counts,'log':str(path),'tail':data[-2500:]}
 print(json.dumps(r),flush=True)
 (LOG/(name+'.json')).write_text(json.dumps(r,indent=2))
 return r

jobs=[
 ('assessment-npm','ctm-assessment',['npm','test'],600),
 ('libs-npm','ctm-libs',['npm','test'],900),
 ('math-npm','math-exercise',['npm','test'],900),
 ('py-npm','py-exercise',['npm','test'],600),
 ('pyodide-npm','pyodide-interaktiv',['npm','test'],900),
 ('checkers-pytest','ctm-checkers',[PY,'-m','pytest','-q','-ra'],900),
 ('assessment-python','ctm-assessment',[PY,'-m','unittest','discover','-s','tests','-p','test_*.py'],900),
 ('jsxgraph-tests','jsxgraph-quarto',['bash','-c','node --test tests/*.test.mjs'],600),
]
if len(sys.argv)>1: jobs=[j for j in jobs if j[0] in sys.argv[1:]]
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 results=list(pool.map(run,jobs))
(ROOT/'audit-work/suite-results.json').write_text(json.dumps(results,indent=2))
