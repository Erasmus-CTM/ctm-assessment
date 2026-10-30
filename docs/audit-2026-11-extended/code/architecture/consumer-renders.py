#!/usr/bin/env python3
"""Render exact consumer archives in scratch with the verified audit tuple.

No source checkout is changed. Raw logs stay in /tmp. Requires the prepared
scratch/package paths below; normal replay should override paths via env.
"""
import json,os,pathlib,re,shutil,subprocess,time
root=pathlib.Path('/workspace'); work=root/'audit-work'; results=[]
package=pathlib.Path('/tmp/ctm-audit-combined/_extensions')
native=root/'.cloud-setup/assessment-integration/ctm-assessment/_extensions/ctm-checkers/native-authoring'
venv=root/'.cloud-setup/venv'; quarto=root/'.cloud-setup/quarto-1.8.27/bin/quarto'
for name,extra in [('ctm-demo',[]),('ingmat3a_ntnu',['index.qmd'])]:
    project=root/'audit-tests'/name
    shutil.copytree(package,project/'_extensions',dirs_exist_ok=True)
    shutil.copytree(native,project/'_extensions/ctm-checkers/native-authoring',dirs_exist_ok=True)
    cache=pathlib.Path('/tmp')/('ctm-consumer-cache-'+name)
    for folder in ('quarto','deno'):
        shutil.copytree(root/'.cloud-setup/cache'/folder,cache/folder,dirs_exist_ok=True)
    env=dict(os.environ,PATH=str(quarto.parent)+':'+str(venv/'bin')+':'+os.environ['PATH'],
      XDG_CACHE_HOME=str(cache),XDG_DATA_HOME=str(root/'.cloud-setup/data'),
      XDG_CONFIG_HOME=str(root/'.cloud-setup/config'),QUARTO_PYTHON=str(venv/'bin/python'),
      STACK_SYMPY_PYTHON=str(venv/'bin/python'),CTM_LIBS_EXTENSION=str(project/'_extensions/ctm-libs'),
      CTM_CHECKERS_EXTENSION=str(project/'_extensions/ctm-checkers'),CTM_CHECKERS_SOURCE=str(root/'ctm-checkers'),
      CTM_VARIANTS_NATIVE=str(project/'_extensions/ctm-checkers/native-authoring'),
      CTM_CHECKERS_WHEEL=str(project/'_extensions/ctm-checkers/ctm_checkers-0.12.0.dev0-py3-none-any.whl'),
      CTM_VARIANTS_QUARTO=str(quarto),JSXGRAPH_EXTENSION=str(project/'_extensions/jsxgraph'))
    cmd=[str(quarto),'render',*extra];log=pathlib.Path('/tmp')/(name+'-extended-audit-render.log');start=time.monotonic()
    try:
        with log.open('w') as out:run=subprocess.run(cmd,cwd=project,env=env,stdout=out,stderr=subprocess.STDOUT,timeout=1200)
        code=run.returncode
    except subprocess.TimeoutExpired:code=124
    text=log.read_text(errors='replace');html=sorted(str(p.relative_to(project/'_site')) for p in (project/'_site').rglob('*.html'))
    result=dict(repository=name,commit=(project/'.audit-pin').read_text().strip(),command=cmd,cwd=str(project),
      exit=code,seconds=round(time.monotonic()-start,3),html_count=len(html),html=html,
      progress=re.findall(r'\[\s*(\d+)\s*/\s*(\d+)\]',text),log=str(log),
      diagnostics=[line.strip() for line in text.splitlines() if 'current approved variants; target ' in line],
      page_counts=dict(passed=len(html) if code==0 else 0,failed=0 if code==0 else 1,skipped=0),
      own_npm_manifest=(project/'package.json').is_file(),own_pytest_manifest=(project/'pyproject.toml').is_file(),
      test_directory=(project/'tests').is_dir())
    results.append(result);(work/'consumer-render-results.json').write_text(json.dumps(results,indent=2)+'\n')
    print(json.dumps({k:result[k] for k in ('repository','exit','seconds','html_count','log')}),flush=True)
