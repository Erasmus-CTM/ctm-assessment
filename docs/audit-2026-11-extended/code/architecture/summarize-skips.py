#!/usr/bin/env python3
"""Summarize pytest -rA/-rs skip reasons without copying raw logs into Git."""
import collections,json,pathlib,re,sys
text=pathlib.Path(sys.argv[1]).read_text(); groups=[]
for count,file,line,reason in re.findall(r'^SKIPPED \[(\d+)\] (.*?):(\d+): (.*)$',text,re.M):
    groups.append(dict(count=int(count),file=file,line=int(line),reason=reason))
print(json.dumps(dict(total=sum(x['count'] for x in groups),groups=groups),indent=2))
