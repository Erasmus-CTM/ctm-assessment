"""DIAGNOSTIC ONLY: summarize Playwright pw:protocol logs around P13 stalls.

Usage: p13-diag-protocol.py REPORT.json PROTOCOL.log
For each diag.stalls[] entry in the report, print per-second SEND/RECV counts
and the non-polling protocol messages from 10 s before the stall to its end.
"""
import collections, datetime, json, re, sys

utc = lambda s: datetime.datetime.fromtimestamp(s, datetime.timezone.utc).replace(tzinfo=None)
report = json.load(open(sys.argv[1]))
stalls = (report.get('diag') or {}).get('stalls') or []
slow = (report.get('diag') or {}).get('slow') or []
if not stalls and not slow:
    print('[p13diag-protocol] no stalls or slow evaluates recorded')
    sys.exit(0)
line_re = re.compile(r'^(\d{4}-\d\d-\d\dT[\d:.]+Z) pw:protocol (SEND|◀ RECV|RECV)?\s*(?:►\s*)?(.*)$')
windows = [(s['from'] - 10000, s['from'] + 40000, 'stall') for s in stalls]
windows += [(s['sent'] - 3000, s['sent'] + s['ms'] + 2000, 'slow %s %dms' % (s['operation'], s['ms'])) for s in slow if s['ms'] > 8000]
entries = []
with open(sys.argv[2], errors='replace') as log:
    for raw in log:
        m = line_re.match(raw.rstrip('\n'))
        if not m:
            continue
        t = datetime.datetime.strptime(m.group(1), '%Y-%m-%dT%H:%M:%S.%fZ').replace(tzinfo=datetime.timezone.utc).timestamp() * 1000
        if not any(a <= t <= b for a, b, _ in windows):
            continue
        direction = 'SEND' if 'SEND' in (m.group(2) or raw[:60]) else 'RECV'
        entries.append((t, direction, m.group(3)))
for a, b, why in windows:
    inside = [e for e in entries if a <= e[0] <= b]
    print('[p13diag-protocol] window %s %s .. %s: %d messages' % (why, utc(a / 1000).isoformat(), utc(b / 1000).isoformat(), len(inside)))
    per_second = collections.OrderedDict()
    for t, d, text in inside:
        key = int(t // 1000)
        bucket = per_second.setdefault(key, collections.Counter())
        bucket[d] += 1
        method = re.search(r'"method":"([^"]+)"', text)
        inner = re.findall(r'\\"method\\":\\"([^\\"]+)\\"', text)
        bucket['%s:%s' % (d, inner[-1] if inner else (method.group(1) if method else 'reply'))] += 1
    for key, bucket in per_second.items():
        print('  %s %s' % (utc(key).strftime('%H:%M:%S'), dict(bucket)))
    shown = 0
    for t, d, text in inside:
        if 'callFunctionOn' in text or 'Runtime.evaluate' in text:
            continue
        if shown >= 150:
            break
        shown += 1
        print('  %s %s %s' % (utc(t / 1000).strftime('%H:%M:%S.%f')[:-3], d, text[:240]))
