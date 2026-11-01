#!/usr/bin/env python3
"""Audit-only local CDN replacement files from integrity-checked npm packages.
No audited lock/pin/source changes. Uses configured HTTPS trust and verifies npm SRI.
"""
import argparse,json,urllib.request,tarfile,hashlib,base64,io
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--out',type=Path,default=Path('/tmp/ctm-audit-browser-assets'));args=p.parse_args();args.out.mkdir(parents=True,exist_ok=True)
packages={'monaco-editor':'0.46.0','katex':'0.16.47','@fortawesome/fontawesome-free':'6.5.1','mathjax':'3.2.2','mathjax4':'4.1.3','@mathjax/mathjax-newcm-font':'4.1.3','jsxgraph':'1.14.2'}
records=json.loads((args.out/'npm-provenance.json').read_text()) if (args.out/'npm-provenance.json').exists() else []
for alias,version in packages.items():
 name='mathjax' if alias=='mathjax4' else alias;target=args.out/(name+'@'+version)
 if target.exists():continue
 url='https://registry.npmjs.org/'+name+'/'+version
 with urllib.request.urlopen(url,timeout=120) as r:meta=json.load(r)
 with urllib.request.urlopen(meta['dist']['tarball'],timeout=120) as r:data=r.read()
 algorithm,digest=meta['dist']['integrity'].split('-',1)
 assert base64.b64encode(hashlib.new(algorithm,data).digest()).decode()==digest
 target.mkdir(parents=True)
 with tarfile.open(fileobj=io.BytesIO(data)) as archive:
  def filt(member,destination):
   name=member.name.partition('/')[2]
   return tarfile.data_filter(member.replace(name=name),destination) if name else None
  archive.extractall(target,filter=filt)
 record={'package':name,'version':version,'tarball':meta['dist']['tarball'],'integrity':meta['dist']['integrity'],'sha256':hashlib.sha256(data).hexdigest()};records.append(record);print(json.dumps(record),flush=True)
(args.out/'npm-provenance.json').write_text(json.dumps(records,indent=2))
