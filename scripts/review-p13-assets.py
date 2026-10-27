#!/usr/bin/env python3
"""Build an UNAPPROVED P13 lock and exact diff; never change approval receipts."""
import argparse
import difflib
import json
from pathlib import Path
from unittest.mock import patch
import ctm_assets as a
from ctm_board_assets import produce_board_lock
from p13_assets import bind_application

APPROVED = '73d8b6fb0de3cd5b8d3ec8e7932d96f854bedf07ab7b7af43013d3cd1f347b3b'
ROOT = Path(__file__).resolve().parents[1]

def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ('baseline', 'library-root', 'ide-root', 'cache', 'output'):
        p.add_argument('--'+name, type=Path, required=True)
    args = p.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    read = lambda path: json.loads(path.read_bytes())
    oldraw = args.baseline.read_bytes()
    a.verify_bytes(oldraw, sha256=APPROVED)
    old = json.loads(oldraw)
    reviewed = read(ROOT/'integration/assets-complete-reviewed-digests.json')
    # Require the already approved #80 subsets, never learn approval from output.
    if reviewed['partial_sha256'] != old['provenance']['partials']:
        raise a.AssetError('Subset receipts differ from AC-approved #80')
    library = args.library_root/'_extensions/ctm-libs'
    partials = [a.produce_python_lock(read(ROOT/'integration/assets-metadata.json'), args.cache,
                    licence_policy=read(ROOT/'integration/assets-python-licences.json')),
                a.produce_npm_lock(read(ROOT/'integration/assets-metadata.json'), library, args.cache),
                produce_board_lock(read(ROOT/'integration/assets-board-metadata.json'),
                    ROOT/'_extensions/ctm-assessment/jsxgraph-pins.yml', args.cache)]
    for item in partials:
        a.verify_bytes(a.json_bytes(item), sha256=reviewed['partial_sha256'][item['kind']])
    index = args.baseline.parent.parent/'assets-imports.json'
    # Baseline artifact: inspection/complete-lock.json plus assets-imports.json.
    indexraw = index.read_bytes()
    a.verify_bytes(indexraw, sha256=reviewed['import_index_sha256'])
    vendor = a.compose_asset_lock(partials, library, ROOT/'_extensions/ctm-assessment/jsxgraph-pins.yml',args.cache,
        reviewed_partial_sha256=reviewed['partial_sha256'], private_index_bytes=indexraw,
        reviewed_index_sha256=reviewed['import_index_sha256'],
        reviewed_availability_sha256=reviewed['availability_sha256'])
    expected = json.loads(oldraw)
    expected['provenance']['runtime_sha256'] = a.version_sources(library)['runtime_sha256']
    if vendor != expected:
        raise a.AssetError('Unexpected vendor change beyond current runtime provenance')
    pins = read(ROOT/'integration/feedback/repos.json')['repositories']
    refs = {name:pins[name]['commit'] for name in ('ctm-libs','pyodide-interaktiv')}
    lock = bind_application(vendor, {'ctm-libs':args.library_root,'pyodide-interaktiv':args.ide_root}, refs, args.cache)
    raw = a.json_bytes(lock)
    (args.output/'proposed-complete-lock.json').write_bytes(raw)
    diff = ''.join(difflib.unified_diff(oldraw.decode().splitlines(True),raw.decode().splitlines(True),
        fromfile='approved-73d8b6fb-complete-lock.json',tofile='UNAPPROVED-P13-complete-lock.json'))
    (args.output/'complete-lock.diff').write_text(diff)
    built,carried = args.output/'proposed-built',args.output/'proposed-carried'
    with patch.object(a.urllib.request,'build_opener',side_effect=AssertionError('Unexpected network during materialization')):
        a.build_from_lock(lock,built,args.cache)
        a.verify_bundle(built,lock)
        a.install_carried_bundle(lock,built,carried)
    if a.inventory(carried)!=lock['files']:
        raise a.AssetError('Carried bytes differ from proposed lock')
    oldfiles,newfiles=old['files'],lock['files']
    summary={'status':'UNAPPROVED: requires AC approval before updating receipt or final ZIP acceptance',
        'approved_sha256':APPROVED,'proposed_sha256':a.digest(raw),
        'approved_files':len(oldfiles),'proposed_files':len(newfiles),
        'added_files':sorted(newfiles.keys()-oldfiles.keys()),'removed_files':sorted(oldfiles.keys()-newfiles.keys()),
        'changed_files':sorted(k for k in oldfiles.keys()&newfiles.keys() if oldfiles[k]!=newfiles[k]),
        'versions_unchanged':old['versions']==lock['versions'], 'partial_sha256':reviewed['partial_sha256'],
        'private_index_sha256':reviewed['import_index_sha256'], 'application_refs':refs,
        'application':lock['application'],'application_licences':lock['application_licences'],
        'runtime_provenance_before':old['provenance']['runtime_sha256'],
        'runtime_provenance_after':lock['provenance']['runtime_sha256'],
        'diff_sha256':a.digest(diff.encode()),'diff_bytes':len(diff.encode()),'carried_network_calls':0}
    (args.output/'review-summary.json').write_bytes(a.json_bytes(summary))
    print('CTM_P13_LOCK_REVIEW '+json.dumps(summary))
if __name__=='__main__':main()
