#!/usr/bin/env python3
"""Build an UNAPPROVED complete-lock preview and diff for AC's review.

This never edits reviewed digests or the exam acceptance hash. Proposed digest
arguments bind the preview inputs; they do not represent AC's approval.
"""
import argparse
import base64
import difflib
import importlib.util
import json
from pathlib import Path
from unittest.mock import patch

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--composer', type=Path, required=True)
parser.add_argument('--library', type=Path, required=True)
parser.add_argument('--baseline', type=Path, required=True)
parser.add_argument('--partials', type=Path, required=True)
parser.add_argument('--cache', type=Path, required=True)
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args()
spec = importlib.util.spec_from_file_location('canonical_assets', args.composer / 'scripts/ctm_assets.py')
assets = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assets)
old_raw = (args.baseline / 'inspection/complete-lock.json').read_bytes()
assets.verify_bytes(old_raw, sha256='e2ebd44e1492a2ead3f170a3922cb925d12014caee0e2c92356a0ce4fa4636bc')
old = json.loads(old_raw)
index = (args.baseline / 'assets-imports.json').read_bytes()
assets.verify_bytes(index, sha256=old['private']['import_index']['sha256'])
partials = [json.loads((args.partials / (name + '-lock.json')).read_bytes()) for name in ('python', 'npm', 'board')]
digests = {item['kind']: assets.digest(assets.json_bytes(item)) for item in partials}
for name in ('python', 'npm'):
    kind = 'private-partial-' + name + '-assets-lock'
    assert digests[kind] == old['provenance']['partials'][kind], name + ' selection changed unexpectedly'
lock = assets.compose_asset_lock(partials, args.library,
    Path('_extensions/ctm-assessment/jsxgraph-pins.yml'), args.cache,
    reviewed_partial_sha256=digests, private_index_bytes=index,
    reviewed_index_sha256=old['private']['import_index']['sha256'],
    reviewed_availability_sha256=old['private']['import_index']['availability_sha256'])
expected = json.loads(old_raw)
expected['provenance']['runtime_sha256'] = assets.version_sources(args.library)['runtime_sha256']
assert lock == expected, 'Unexpected change beyond the current library runtime provenance binding'
raw = assets.json_bytes(lock)
args.out.mkdir(parents=True, exist_ok=True)
(args.out / 'proposed-complete-lock.json').write_bytes(raw)
(args.out / 'proposed-partial-digests.json').write_bytes(assets.json_bytes(digests))
diff = ''.join(difflib.unified_diff(old_raw.decode().splitlines(True), raw.decode().splitlines(True),
    fromfile='approved-complete-lock.json', tofile='UNAPPROVED-proposed-complete-lock.json'))
(args.out / 'complete-lock.diff').write_text(diff)
built, carried = args.out / 'proposed-built', args.out / 'proposed-carried'
assets.build_from_lock(lock, built, args.cache)
assets.verify_bundle(built, lock)
with patch.object(assets, 'download', side_effect=AssertionError('Carried install attempted network')):
    assets.install_carried_bundle(lock, built, carried)
assert assets.inventory(carried) == lock['files']
changed = sorted(name for name in old['files'].keys() | lock['files'].keys()
    if old['files'].get(name) != lock['files'].get(name))
summary = {'status': 'UNAPPROVED: AC must review the lock diff and proposed hashes',
    'old_sha256': assets.digest(old_raw), 'proposed_sha256': assets.digest(raw),
    'partial_sha256': digests, 'old_versions': old['versions'], 'proposed_versions': lock['versions'],
    'old_files': len(old['files']), 'proposed_files': len(lock['files']),
    'changed_files': changed, 'diff_sha256': assets.digest(diff.encode()),
    'diff_bytes': len(diff.encode()), 'carried_network_calls': 0,
    'npm_and_python_partials_unchanged': True}
(args.out / 'review-summary.json').write_bytes(assets.json_bytes(summary))
print('CTM_LOCK_REVIEW ' + json.dumps(summary))
# A checksummed textual diff is also recoverable through the connector without
# downloading the large private complete bundle. Raw logs stay out of Git.
encoded = base64.b64encode(diff.encode()).decode()
for offset in range(0, len(encoded), 3000):
    print('CTM_LOCK_DIFF ' + json.dumps({'chunk': offset // 3000, 'base64': encoded[offset:offset + 3000]}))
