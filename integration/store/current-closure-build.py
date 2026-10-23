#!/usr/bin/env python3
"""Diagnostic only: exact historical fixtures with the current canonical package."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
BASE = '2d2f002cd6255e3fa9472a07f6ae4947b865621d'
PRODUCTION = '8b46f20eed09e8b1e6a7d5faa45b6d0f0f859c8e'
DIAGNOSTIC = '27cb273ffcbb6eea37f9ef2774dd8883d59df360'
EXPECTED = {
    'ctm-assessment': PRODUCTION,
    'ctm-libs':'626b546604f51c9cb738210c56d054d421581e02',
    'math-exercise':'97a7dc5b1eb23adb398f789cb29e0266e1b256b0',
    'py-exercise':'18e6f1eb00713fdefbfc3d040c6a05eb88c6c314',
    'pyodide-interaktiv':'5079500992d75fbfa9f8508a8a7c37c246e4cce7',
    'ctm-checkers':'5976f1a97b78bd81d4d7a3a954ff2102df8c6e37',
    'jsxgraph':'e4ad81d82e1b56f86765026a3dd26f6975d29d57',
}

def run(*args, cwd=ROOT):
    subprocess.run([str(x) for x in args], cwd=cwd, check=True)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dest', type=Path, required=True)
    parser.add_argument('--verify-source-only', action='store_true', help='Check the narrow candidate/fixture witness without building or downloading')
    args = parser.parse_args()
    dest = args.dest.resolve()
    if dest.exists():
        parser.error('--dest must not exist')
    # External successor execution can clear only the unchanged reviewed
    # prerequisite. Any candidate production/build change needs fresh review.
    witness_paths = ['_extensions','scripts','integration/feedback/repos.json',
                     'tools/ci/review-dependencies.py','package.json','package-lock.json']
    def entries(ref):
        output = subprocess.check_output(['git','ls-tree','-r','-z',ref,'--',*witness_paths],cwd=ROOT)
        return {row.split(b'\t',1)[1].decode():row.split(b'\t',1)[0].decode() for row in output.split(b'\0') if row}
    baseline, candidate = entries(BASE), entries('HEAD')
    if baseline != candidate:
        raise SystemExit('Candidate production/installer/registry blobs or modes changed; external successor closure cannot clear that source change')
    production_witness = {}
    for name, identity in baseline.items():
        content = subprocess.check_output(['git','show',BASE+':'+name],cwd=ROOT)
        if (ROOT/name).read_bytes() != content:
            raise SystemExit('Candidate production working bytes changed: '+name)
        if bool((ROOT/name).stat().st_mode & 0o111) != identity.startswith('100755 '):
            raise SystemExit('Candidate production working mode changed: '+name)
        production_witness[name] = {'gitIdentity':identity,'sha256':hashlib.sha256(content).hexdigest()}
    names = subprocess.check_output(['git','ls-tree','-r','--name-only',BASE,'integration/store'], cwd=ROOT, text=True).splitlines()
    names += ['integration/feedback/loading-timing.cjs']
    names += subprocess.check_output(['git','ls-tree','-r','--name-only',BASE,'integration/feedback/timing','_quarto.yml','example.qmd','feedback.yml','feedback','examples','_filters','assets'], cwd=ROOT, text=True).splitlines()
    source = {}
    for name in names:
        old = subprocess.check_output(['git','show',BASE+':'+name], cwd=ROOT)
        current = subprocess.check_output(['git','show',PRODUCTION+':'+name], cwd=ROOT)
        if old != current:
            raise SystemExit('Historical fixture/driver changed: '+name)
        # Only the explicit D2 selection/diagnostic hooks change that one driver.
        if (ROOT/name).read_bytes() != old:
            raise SystemExit('Working fixture/driver changed: '+name)
        source[name] = hashlib.sha256(old).hexdigest()
    if args.verify_source_only:
        print(json.dumps({'candidateProductionWitnessFiles':len(production_witness),'unchangedHistoricalSources':len(source),'sourceOnly':True}))
        return
    # The canonical installer deliberately rejects an override for itself.
    # Execute the unchanged builder from a clean exact production checkout.
    production = dest.with_name(dest.name+'-production-source')
    run('git','worktree','add','--detach',production,PRODUCTION)
    refs = json.dumps({name:sha for name,sha in EXPECTED.items() if name != 'ctm-assessment'})
    run(sys.executable, production/'integration/store/build.py', '--dest', dest, '--review-refs', refs)
    resolved = json.loads((dest/'resolved-repos.json').read_text())
    actual = {name:spec['commit'] for name,spec in resolved['repositories'].items()}
    if EXPECTED != actual or any(spec['dirty_files'] or (name != 'ctm-assessment' and spec['local_override']) for name,spec in resolved['repositories'].items()):
        raise SystemExit('Installed tuple differs from the clean seven-repository production closure')
    driver = subprocess.check_output(['git','show',DIAGNOSTIC+':integration/feedback/loading-timing.cjs'],cwd=ROOT)
    (dest/'d2-driver').mkdir()
    (dest/'d2-driver/loading-timing.cjs').write_bytes(driver)
    combined = dest/'combined'
    combined.mkdir()
    shutil.copytree(dest/'before/_extensions', combined/'_extensions')
    for name in ['_quarto.yml','example.qmd','feedback.yml']:
        shutil.copy2(ROOT/name, combined/name)
    for name in ['feedback','examples','_filters','assets']:
        shutil.copytree(ROOT/name, combined/name)
    for name, spec in json.loads((combined/'assets/sources.json').read_text()).items():
        target = combined/'assets'/name
        if not target.exists():
            with urllib.request.urlopen(spec['url'], timeout=60) as response:
                target.write_bytes(response.read())
        if hashlib.sha256(target.read_bytes()).hexdigest() != spec['sha256']:
            raise SystemExit('Example asset checksum mismatch: '+name)
    shutil.copy2(dest/'resolved-repos.json', combined/'resolved-repos.json')
    run('quarto','render','example.qmd',cwd=combined)
    trees = [dest/'before/_extensions',dest/'after/_extensions',combined/'_extensions']
    copies = [{str(p.relative_to(tree)):hashlib.sha256(p.read_bytes()).hexdigest() for p in tree.rglob('*') if p.is_file()} for tree in trees]
    if copies[0] != copies[1] or copies[0] != copies[2]:
        raise SystemExit('Canonical installed copies differ between fixtures')
    manifest = {str(p.relative_to(dest)):hashlib.sha256(p.read_bytes()).hexdigest() for tree in [dest/'before/_extensions',dest/'after/_extensions',combined/'_extensions'] for p in tree.rglob('*') if p.is_file()}
    (dest/'source-closure.json').write_text(json.dumps({'scope':'assessment28 feature plus reviewed production successor closure; not old28 standalone acceptance','historical':BASE,'production':PRODUCTION,'checkout':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'candidateProductionWitness':production_witness,'unchangedHistoricalSources':source,'diagnosticDriverSource':DIAGNOSTIC,'diagnosticDriverSha256':hashlib.sha256(driver).hexdigest(),'resolved':resolved,'installedHashes':manifest,'storePolicy':'credentialless (original unmodified serve default)'},indent=2)+'\n')

if __name__ == '__main__':
    main()
