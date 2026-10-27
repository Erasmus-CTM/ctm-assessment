#!/usr/bin/env python3
"""Install fixed Chrome-for-Testing release branches corresponding to SEB CEF.

Exact CEF patch builds are unavailable in CfT. These one-patch-earlier builds
are engine proxies only; they do not replace real Windows SEB acceptance.
"""
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
import sys
import urllib.request
import zipfile

PROFILES = {'139.0.7258.138':'139.0.7258.139', '147.0.7727.117':'147.0.7727.118'}


def main():
    version, destination = sys.argv[1:]
    if version not in PROFILES:
        raise SystemExit('Unsupported P13 Chromium profile; no latest-version fallback')
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=False)
    url = 'https://storage.googleapis.com/chrome-for-testing-public/' + version + '/linux64/chrome-linux64.zip'
    archive = destination / 'chrome.zip'
    with urllib.request.urlopen(url, timeout=120) as response, archive.open('wb') as out:
        size = 0
        while chunk := response.read(1024 * 1024):
            size += len(chunk)
            if size > 400 * 1024 * 1024:
                raise ValueError('Oversized Chromium archive')
            out.write(chunk)
    sha = hashlib.sha256(archive.read_bytes()).hexdigest()
    with zipfile.ZipFile(archive) as zipped:
        total = 0
        for item in zipped.infolist():
            name = PurePosixPath(item.filename)
            mode = item.external_attr >> 16
            total += item.file_size
            if (name.is_absolute() or '..' in name.parts or '\\' in item.filename
                    or not name.parts or name.parts[0] != 'chrome-linux64'
                    or stat.S_ISLNK(mode) or total > 1024 * 1024 * 1024):
                raise ValueError('Invalid Chromium archive member')
            target = destination.joinpath(*name.parts)
            if item.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with zipped.open(item) as source, target.open('xb') as out:
                    while chunk := source.read(1024 * 1024):
                        out.write(chunk)
                target.chmod(0o755 if mode & 0o111 else 0o644)
    (destination / 'receipt.json').write_text(json.dumps({'version':version,'cefPatch':PROFILES[version],
        'patchGap':1,'url':url,'archiveSHA256':sha,'realSEB':False},indent=2)+'\n')


if __name__ == '__main__':
    main()
