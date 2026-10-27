#!/usr/bin/env python3
"""Reproduce reviewed vendor selections and bind exact exam application assets."""
import argparse
import json
from pathlib import Path
import subprocess

import ctm_assets as a
from ctm_board_assets import produce_board_lock
from p13_assets import bind_application

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--library-root', type=Path, required=True)
    parser.add_argument('--ide-root', type=Path, required=True)
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    read = lambda p: json.loads((ROOT / p).read_bytes())
    reviewed = read('integration/p13-assets-reviewed-digests.json')
    pins = read('integration/feedback/repos.json')['repositories']
    library = args.library_root / '_extensions/ctm-libs'
    board_pins = ROOT / '_extensions/ctm-assessment/jsxgraph-pins.yml'
    metadata = read('integration/assets-metadata.json')
    partials = [a.produce_python_lock(metadata, args.cache, licence_policy=read('integration/assets-python-licences.json')),
                a.produce_npm_lock(metadata, library, args.cache),
                produce_board_lock(read('integration/assets-board-metadata.json'), board_pins, args.cache)]
    for partial in partials:
        a.verify_bytes(a.json_bytes(partial), sha256=reviewed['partial_sha256'][partial['kind']])
        a.write_private_lock(partial, args.output / (partial['kind'] + '.json'))
    probe = args.output / 'probe'
    # A reused private directory is verified against the official archive by
    # the availability consumer; a fresh build stages the archive explicitly.
    if not probe.exists():
        a.prepare_stdlib_probe(metadata, args.cache, probe, read('integration/assets-stdlib.json'))
    availability = args.output / 'availability.json'
    subprocess.run(['node', str(ROOT / 'scripts/probe-pyodide-stdlib.mjs'), str(probe), str(availability)], check=True)
    index = a.private_import_index_from_availability(availability.read_bytes(), probe,
        reviewed_report_sha256=reviewed['availability_sha256'], candidates=read('integration/assets-stdlib.json'))
    index_path = args.output / 'assets-imports.json'
    a.write_private_import_index(index, index_path)
    a.verify_bytes(index_path.read_bytes(), sha256=reviewed['import_index_sha256'])
    lock = a.compose_asset_lock(partials, library, board_pins, args.cache,
        reviewed_partial_sha256=reviewed['partial_sha256'], private_index_bytes=index_path.read_bytes(),
        reviewed_index_sha256=reviewed['import_index_sha256'],
        reviewed_availability_sha256=reviewed['availability_sha256'])
    lock = bind_application(lock,
        {'ctm-libs': args.library_root, 'pyodide-interaktiv': args.ide_root},
        {name: pins[name]['commit'] for name in ('ctm-libs','pyodide-interaktiv')}, args.cache)
    receipt = read('integration/p13-complete-assets.json')
    if receipt['application_refs'] != {name:pins[name]['commit'] for name in receipt['application_refs']}:
        raise a.AssetError('P13 application pins differ from the reviewed complete receipt')
    a.verify_bytes(a.json_bytes(lock), sha256=receipt['sha256'])
    if len(lock['files']) != receipt['files']:
        raise a.AssetError('P13 complete file count differs from the reviewed receipt')
    (args.output / 'complete-lock.json').write_bytes(a.json_bytes(lock))
    a.build_from_lock(lock, args.output / 'complete-built', args.cache)
    print('Complete P13 lock SHA256:', a.digest(a.json_bytes(lock)))


if __name__ == '__main__':
    main()
