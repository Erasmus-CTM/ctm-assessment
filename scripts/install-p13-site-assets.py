#!/usr/bin/env python3
"""Install a verified P13 complete bundle into an exact pinned project."""
import argparse
import json
from pathlib import Path
from unittest.mock import patch
import ctm_assets as a

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--assets-dir',type=Path,required=True)
parser.add_argument('--project',type=Path,required=True)
parser.add_argument('--course-key',required=True)
args=parser.parse_args()
receipt=json.loads((Path(__file__).resolve().parents[1]/'integration/p13-complete-assets.json').read_bytes())
raw=(args.assets_dir/'complete-lock.json').read_bytes()
a.verify_bytes(raw,sha256=receipt['sha256'])
lock=json.loads(raw)
if raw!=a.json_bytes(lock) or lock.get('kind')!='ctm-assets-lock':
    raise a.AssetError('P13 needs canonical complete lock bytes')
versions=a.validate_version_homes(lock,args.project/'_extensions/ctm-libs',args.project/'_extensions/ctm-assessment/jsxgraph-pins.yml')
for item in lock['application']:
    file=args.project/str(a.relative_path(item['source']))
    if file.is_symlink() or a.digest(file.read_bytes())!=item['sha256']:
        raise a.AssetError('Installed worker source differs from complete lock: '+item['source'])
bundle=args.assets_dir/'complete-built'
a.verify_bundle(bundle,lock)
index=(args.assets_dir/'assets-imports.json').read_bytes()
base=bundle/'pyodide'/versions['pyodide']
a.validate_bound_import_index(index,lock['private']['import_index'],public_files=a.inventory(bundle),subset_bytes=(base/'pyodide-lock.json').read_bytes())
a.release_version((base/'package.json').read_bytes(),versions['pyodide'])
with patch.object(a,'download',side_effect=AssertionError('carried P13 install attempted network')):
    a.install_carried_bundle(lock,bundle,args.project/'_ctm-assets')
(args.project/'.private-extensions/assets-imports.json').write_bytes(index)
a.write_profiles(args.project,course_key=args.course_key)
print('Verified P13 files:',len(lock['files']))
