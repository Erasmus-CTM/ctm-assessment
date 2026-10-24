#!/usr/bin/env python3
"""Log only the tracked source changes of a converted course, without publishing.

A connector client can reconstruct each UTF-8 file from its ordered base64
chunks and check the emitted Git blob SHA before creating a tree. Untracked
installed extensions, rendered output and temporary files are never emitted.
"""
import base64
import hashlib
import json
from pathlib import Path
import subprocess
import sys

PREFIX = "CTM_CONVERTED_SOURCE "

def emit(project):
    root = Path(project).resolve()
    head = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
    names = subprocess.check_output(["git", "-C", str(root), "diff", "--name-only", "-z", "HEAD", "--"])
    records = []
    for name in filter(None, names.decode("utf-8").split("\0")):
        path = root / name
        if not path.resolve().is_relative_to(root):
            raise ValueError("Changed path escapes project: " + name)
        if not path.exists():
            records.append({"path": name, "deleted": True})
            continue
        raw = path.read_bytes()
        raw.decode("utf-8")  # Fail rather than export content the connector cannot publish losslessly.
        encoded = base64.b64encode(raw).decode("ascii")
        chunks = [encoded[i:i + 4000] for i in range(0, len(encoded), 4000)]
        digest = hashlib.sha1(b"blob " + str(len(raw)).encode("ascii") + b"\0" + raw).hexdigest()
        records.append({"path": name, "bytes": len(raw), "git_blob_sha1": digest, "chunks": len(chunks)})
        records.extend({"path": name, "chunk": i, "base64": data} for i, data in enumerate(chunks))
    # Compute and validate everything before printing any recovery records.
    print(PREFIX + json.dumps({"head": head, "files": len(list(filter(None, names.split(b"\0"))))}))
    for record in records:
        print(PREFIX + json.dumps(record, ensure_ascii=True))
    print(PREFIX + json.dumps({"complete": True}))

if __name__ == "__main__":
    emit(sys.argv[1])
