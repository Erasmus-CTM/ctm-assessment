#!/usr/bin/env python3
"""Read-only CTM release boundary probes. Pass --root /path/to/ctm-assessment.
All mutations are confined to TemporaryDirectory. No network/real keys used.
"""
import argparse, importlib.util, json, sys, tempfile
from pathlib import Path
from unittest.mock import patch
p=argparse.ArgumentParser(); p.add_argument('--root', type=Path, default=Path('/workspace/ctm-assessment')); args=p.parse_args()
root=args.root.resolve(); sys.path.insert(0,str(root/'scripts'))
def load(name,path):
 spec=importlib.util.spec_from_file_location(name,path); mod=importlib.util.module_from_spec(spec); spec.loader.exec_module(mod); return mod
setup=load('audit_setup',root/'scripts/setup-feedback-integration.py')
server=load('audit_server',root/'scripts/serve-offline.py')
installer=load('audit_installer',root/'scripts/install-project.py')
import ctm_assets as a
from p13_assets import SOURCES, verify_deployment
out={}
with tempfile.TemporaryDirectory() as temp:
 temp=Path(temp); sha='b1e7ec80b198eacd04793fd1cec2adb776555b73'
 target=temp/('ctm-libs-'+sha[:12]); target.mkdir()
 (target/'.integration-source.json').write_text(json.dumps({'repository':'Erasmus-CTM/ctm-libs','commit':sha}))
 f=target/'_extensions/ctm-libs/feedback/feedback-core.js'; f.parent.mkdir(parents=True); f.write_text('globalThis.CACHE_MUTATION = true;')
 with patch.object(setup,'download',side_effect=AssertionError('unexpected download')):
  got=setup.snapshot('Erasmus-CTM/ctm-libs',sha,temp)
 out['cached_snapshot']={'returns_cached_mutation':(got/'_extensions/ctm-libs/feedback/feedback-core.js').read_text()==f.read_text(),'claimed_commit':json.loads((got/'.integration-source.json').read_text())['commit'],'network_calls':0}
 site=temp/'site'; bundle=site/'_ctm-assets'; bundle.mkdir(parents=True)
 (bundle/'manifest.json').write_bytes(a.json_bytes({'v':1,'versions':{},'files':{}}))
 lock={'v':1,'versions':{},'files':a.inventory(bundle),'application':[]}
 for paths in SOURCES.values():
  for source in paths:
   name=Path(source).name; data=('/* '+name+' */').encode(); file=site/'site_libs'/name; file.parent.mkdir(exist_ok=True); file.write_bytes(data)
   lock['application'].append({'deployed_name':name,'sha256':a.digest(data)})
 feedback=site/'site_libs/feedback-core.js'; feedback.write_text('globalThis.AFTER_RENDER_MUTATION = true;')
 verify_deployment(site,lock)
 out['p13_deployment']={'changed_feedback_core_accepted':True,'locked_application_files':sum(map(len,SOURCES.values())),'scope':'only tests post-render deployment validation, not bypass of pinned commit/receipt gate'}
 # Exercise the actual handler's path classification without requiring a socket.
 handler=object.__new__(server.OfflineHandler)
 classified={}
 for url in ['/_ctm-assets/pyodide/0.28.3/a.whl','/dept/python/_ctm-assets/pyodide/0.28.3/a.whl']:
  handler.path=url; classified[url]=handler.is_asset()
 out['server_asset_paths']=classified
 # The documented release guard does not consult tag/HEAD identity at all.
 with patch.object(installer.subprocess,'check_output',side_effect=AssertionError('unexpected git provenance check')):
  installer.check_release('v'+installer.package_version())
 out['release_guard']={'accepts_matching_version_without_git_provenance_check':True,'version':installer.package_version()}
print(json.dumps(out,indent=2))
assert out['cached_snapshot']['returns_cached_mutation']
assert out['p13_deployment']['changed_feedback_core_accepted']
assert out['server_asset_paths']['/_ctm-assets/pyodide/0.28.3/a.whl'] is True
assert out['server_asset_paths']['/dept/python/_ctm-assets/pyodide/0.28.3/a.whl'] is False

assert out['release_guard']['accepts_matching_version_without_git_provenance_check']
