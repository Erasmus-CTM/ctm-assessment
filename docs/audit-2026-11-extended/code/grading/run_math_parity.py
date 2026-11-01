"""Reproduce the official parity workflow in scratch directories, without CDN.

Run with CPython that has sympy==1.13.3, mpmath==1.3.0, networkx==3.4.2.
Requires existing local npm Pyodide0.28.3, jsdom and the pinned repository clones.
No audited source, pin, receipt or lock is modified. Repacked local wheels and
their explicitly patched runtime lock are evidence fixtures, not release assets.
"""
import argparse
import hashlib
import importlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import zipfile


def run(command, *, cwd, env, log):
    with log.open('w') as output:
        subprocess.run(list(map(str, command)), cwd=cwd, env=env, stdout=output,
                       stderr=subprocess.STDOUT, check=True)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workspace',type=Path,default=Path('/workspace'))
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--quarto',type=Path,required=True)
    parser.add_argument('--jsxgraph',type=Path,required=True,help='Pinned jsxgraph extension directory')
    parser.add_argument('--wheels',type=Path,help='Optional downloaded PyPI wheels; otherwise repack installed distributions')
    parser.add_argument('--base',default='17f1acefeca8a8da7128ffe73301347256e226d8')
    parser.add_argument('--head',default='39df17ee28789e7d8d5d8e0abc01dcb967fc8858')
    args=parser.parse_args(); workspace=args.workspace.resolve(); output=args.output.resolve()
    if output.exists(): raise ValueError('Use a new output directory to avoid stale results')
    output.mkdir(parents=True)
    env={**os.environ,'PATH':str(Path(sys.executable).parent)+os.pathsep+str(args.quarto.parent)+os.pathsep+os.environ.get('PATH',''),
         'XDG_CACHE_HOME':str(output/'quarto-cache'),'CTM_COMPONENT_DEV':'1'}
    snapshots={}
    for name,ref in [('base',args.base),('head',args.head)]:
        target=output/name; target.mkdir()
        snapshots[name]=subprocess.check_output(['git','-C',str(workspace/'math-exercise'),'rev-parse',ref],text=True).strip()
        archive=subprocess.check_output(['git','-C',str(workspace/'math-exercise'),'archive',ref])
        with tarfile.open(fileobj=io.BytesIO(archive)) as tar: tar.extractall(target,filter='data')
        for component,source in [('ctm-libs',workspace/'ctm-libs/_extensions/ctm-libs'),
                                 ('ctm-checkers',workspace/'ctm-checkers/_extensions/ctm-checkers'),('jsxgraph',args.jsxgraph)]:
            shutil.copytree(source,target/'_extensions'/component,dirs_exist_ok=True)
        run([sys.executable,workspace/'ctm-checkers/tools/build_authoring.py','--install-extension',target/'_extensions/ctm-checkers'],
            cwd=output,env=env,log=output/f'authoring-install-{name}.log')
        run([args.quarto,'render'],cwd=target,env=env,log=output/f'render-{name}.log')
        run([sys.executable,workspace/'ctm-assessment/integration/pyodide-parity/native-authored.py','--root',target],
            cwd=output,env=env,log=output/f'native-{name}.log')
    for component in ['ctm-libs','ctm-checkers','ctm-assessment']:
        snapshots[component]=subprocess.check_output(['git','-C',str(workspace/component),'rev-parse','HEAD'],text=True).strip()
    # Preserve original require() paths into integration/feedback.
    integration=output/'integration';harness=integration/'pyodide-parity'
    shutil.copytree(workspace/'ctm-assessment/integration/pyodide-parity',harness)
    shutil.copytree(workspace/'ctm-assessment/integration/feedback',integration/'feedback')
    runtime=output/'local-pyodide'; shutil.copytree(workspace/'math-exercise/node_modules/pyodide',runtime)
    modules=harness/'node_modules'; modules.mkdir(exist_ok=True)
    (modules/'jsdom').symlink_to(workspace/'ctm-assessment/node_modules/jsdom',target_is_directory=True)
    (modules/'pyodide-0.28.3').symlink_to(runtime,target_is_directory=True)
    lock=json.loads((runtime/'pyodide-lock.json').read_text());provenance={}
    wheels=output/'wheels/0.28.3'; wheels.mkdir(parents=True)
    for name,version in [('sympy','1.13.3'),('mpmath','1.3.0'),('networkx','3.4.2')]:
        package=importlib.import_module(name)
        if package.__version__!=version:raise ValueError(name+' must be '+version)
        source=Path(package.__file__).resolve().parent;parent=source.parent
        paths=[source,*parent.glob(name+'-'+version+'.dist-info')]
        wheel=wheels/lock['packages'][name]['file_name']
        if args.wheels:
            shutil.copyfile(args.wheels/wheel.name,wheel)
        else:
            with zipfile.ZipFile(wheel,'w',compression=zipfile.ZIP_DEFLATED) as archive:
                for directory in paths:
                    for file in sorted(directory.rglob('*')):
                        if file.is_file() and '__pycache__' not in file.parts and file.suffix!='.pyc':archive.write(file,file.relative_to(parent))
        digest=hashlib.sha256(wheel.read_bytes()).hexdigest()
        provenance[name]={'version':version,'original_pyodide_sha256':lock['packages'][name]['sha256'],
                          'local_sha256':digest,'bytes':wheel.stat().st_size,
                          'source':'downloaded PyPI wheel' if args.wheels else 'installed cached PyPI distribution, repacked locally'}
        lock['packages'][name]['sha256']=digest
        if name=='networkx':lock['packages'][name]['depends']=[]
    (runtime/'pyodide-lock.json').write_text(json.dumps(lock))
    (output/'snapshot.json').write_text(json.dumps(snapshots,indent=2))
    (output/'local-wheels-provenance.json').write_text(json.dumps(provenance,indent=2))
    env.update(PYODIDE_PARITY_WHEELS=str(output/'wheels'),CTM_PARITY_PYTHON=sys.executable)
    run(['node',harness/'run.cjs','--builds',f'base={output}/base,head={output}/head',
         '--site','math-exercise=_site','--sources','math-exercise=.','--extensions','_extensions',
         '--timeout','240','--out',output/'result'],cwd=output,env=env,log=output/'parity.log')
    print(output/'result/report.md')


if __name__=='__main__':main()
