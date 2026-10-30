#!/usr/bin/env python3
"""Copy existing standalone CTM/Pyodide assets into a local benchmark fixture.

No downloads or repository writes. Run bench.py against --output afterwards.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--standalone-repo', type=Path, required=True,
                        help='pyodide-interaktiv repository with shipped _extensions/ctm-libs')
    parser.add_argument('--node-modules', type=Path, required=True,
                        help='node_modules containing the already installed pyodide 0.28.3 package')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    repo = args.standalone_repo.resolve()
    package = args.node_modules.resolve() / 'pyodide'
    version = json.loads((package / 'package.json').read_text())['version']
    if version != '0.28.3':
        parser.error('Expected Pyodide 0.28.3, found ' + version)
    output = args.output.resolve()
    if output == repo or repo in output.parents:
        parser.error('--output must be outside the read-only source repository')
    files = [(repo / '_extensions/ctm-libs/runtime' / name, Path(name)) for name in
             ('pyodide-runtime.js', 'pyodide-worker.js', 'pyodide-worker-core.js')]
    files += [(package / name, Path('pyodide') / name) for name in
              ('pyodide.mjs', 'pyodide.asm.js', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json')]
    records = []
    for source, relative in files:
        data = source.read_bytes()
        target = output / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        records.append({'source': str(source), 'path': str(relative), 'bytes': len(data),
                        'sha256': hashlib.sha256(data).hexdigest()})
    (output / 'index.html').write_text(
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<script src="pyodide-runtime.js"></script><script src="pyodide-worker.js"></script>'
        '<link rel="icon" href="data:,"></head><body>Normal Python runtime benchmark</body></html>\n')
    pin = repo / '.github/ctm-libs-source.json'
    metadata = {'runtime': 'Pyodide ' + version, 'source': str(repo), 'files': records,
                'shippedCtmLibs': json.loads(pin.read_text()) if pin.is_file() else None}
    (output / 'fixture.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print(output)


if __name__ == '__main__':
    main()
