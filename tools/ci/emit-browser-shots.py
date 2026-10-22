#!/usr/bin/env python3
"""Log bounded, existing Chromium PNGs for visual review without a desktop.

The browser comparator owns capture and assertions. This helper only reads
its six new-side, light-mode switch/closed/open reading-step screenshots.
"""
import base64
import hashlib
import json
from pathlib import Path
import re
import sys

PREFIX = "CTM_BROWSER_SHOT "
FILES = tuple(f"chromium-{width}-{shot}-new.png" for width in (1280, 390)
              for shot in ("switch", "reading-step-closed", "reading-step-open"))
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
MAX_FILE_BYTES = 512_000
MAX_TOTAL_BYTES = 2_000_000

def emit(shots, course_ref):
    if not re.fullmatch(r"[0-9a-f]{40}", course_ref):
        raise ValueError("An exact course commit is required")
    root = Path(shots).resolve()
    records, total = [], 0
    for name in FILES:
        path = root / name
        if not path.resolve().is_relative_to(root):
            raise ValueError("Screenshot escapes directory: " + name)
        size = path.stat().st_size
        if not 0 < size <= MAX_FILE_BYTES:
            raise ValueError("Screenshot exceeds the per-file bound: " + name)
        total += size
        if total > MAX_TOTAL_BYTES:
            raise ValueError("Screenshots exceed the total bound")
        raw = path.read_bytes()
        if len(raw) != size or not raw.startswith(PNG_SIGNATURE):
            raise ValueError("Screenshot is not a stable PNG: " + name)
        encoded = base64.b64encode(raw).decode("ascii")
        parts = [encoded[i:i + 4000] for i in range(0, len(encoded), 4000)]
        records.append({"name": name, "bytes": size, "sha256": hashlib.sha256(raw).hexdigest(), "chunks": len(parts)})
        records.extend({"name": name, "chunk": i, "base64": value} for i, value in enumerate(parts))
    # Validate all selected files before emitting a complete transport.
    print(PREFIX + json.dumps({"course_ref": course_ref, "files": len(FILES), "bytes": total}))
    for record in records:
        print(PREFIX + json.dumps(record))
    print(PREFIX + json.dumps({"complete": True}))

if __name__ == "__main__":
    emit(sys.argv[1], sys.argv[2])
