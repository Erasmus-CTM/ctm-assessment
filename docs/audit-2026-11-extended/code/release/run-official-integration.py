#!/usr/bin/env python3
"""Seed independently verified pinned snapshots, then run the official campaign.
Source repositories are read-only. No locks/receipts/pins changed.
"""
import argparse,json,subprocess,tarfile,io,shutil
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--out',type=Path,default=Path('/tmp/ctm-extended-official'));p.add_argument('--prepare-only',action='store_true');p.add_argument('--sources-root',type=Path,default=Path('/workspace'));p.add_argument('--snapshots-root',type=Path,default=Path('/workspace/audit-snapshots'));p.add_argument('--fixture-image',type=Path,default=Path('/workspace/.cloud-setup/assessment-integration/site/assets/spanish-handwriting.png'));args=p.parse_args()
out=args.out;out.mkdir(exist_ok=True,parents=True);clone=out/'ctm-assessment';work=out/'integration'
if not clone.exists():subprocess.run(['git','clone','--shared','--no-checkout',str(args.sources_root/'ctm-assessment'),str(clone)],check=True)
subprocess.run(['git','-C',str(clone),'checkout','--detach','cf1ca2a9abdb3647b04b8fd298d2b123002ebcaf'],check=True)
config=json.loads((clone/'integration/feedback/repos.json').read_text())
work.mkdir(exist_ok=True);(work/'.ctm-feedback-workspace').touch();cache=work/'src';cache.mkdir(exist_ok=True)
def seed(repo,sha,source=None):
 name=repo.split('/')[-1];dest=cache/(name+'-'+sha[:12])
 if dest.exists():return
 if source:
  shutil.copytree(source,dest,ignore=shutil.ignore_patterns('.git','node_modules','__pycache__','*.pyc','_site','.quarto'))
 else:
  raw=subprocess.check_output(['git','-C',str(args.sources_root/name),'archive',sha]);dest.mkdir()
  with tarfile.open(fileobj=io.BytesIO(raw)) as archive:archive.extractall(dest,filter='data')
 (dest/'.integration-source.json').write_text(json.dumps({'repository':repo,'commit':sha}))
for name,v in config['repositories'].items():
 if name=='ctm-assessment':continue
 special={'jsxgraph':'jsxgraph-quarto','pyodide-interaktiv':'pyodide-interaktiv'}
 seed(v['repository'],v['commit'],args.snapshots_root/special[name] if name in special else None)
seed('Erasmus-CTM/ctm-libs','79103a6a829b9c5cf62f645857ca7f8330ff7be2')
assets=clone/'assets/spanish-handwriting.png'
if not assets.exists() and args.fixture_image.exists():shutil.copy2(args.fixture_image,assets)
print('Prepared exact campaign:',clone,work,flush=True)
if not args.prepare_only:subprocess.run(['python',str(clone/'scripts/setup-feedback-integration.py'),'--workspace',str(work),'--test','--browser'],cwd=clone,check=True)
