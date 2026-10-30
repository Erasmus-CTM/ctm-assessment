#!/usr/bin/env python3
"""Conservative lexical catalogue of browser globals and HTML data attributes.
Dynamic/computed names require manual inspection; this is an inventory, not lint.
"""
import collections, json, pathlib, re, subprocess, sys
manifest=json.loads(pathlib.Path(sys.argv[1]).read_text()); out=pathlib.Path(sys.argv[2]); result={}
for name,spec in manifest.items():
    files=subprocess.check_output(['git','-C',spec['path'],'ls-tree','-r','--name-only',spec['commit'],'_extensions'],text=True).splitlines()
    globals=collections.defaultdict(list); attrs=collections.defaultdict(list)
    for file in files:
        if pathlib.Path(file).suffix not in ('.js','.mjs','.lua','.ts'):continue
        text=subprocess.check_output(['git','-C',spec['path'],'show',spec['commit']+':'+file]).decode('utf8','replace')
        for number,line in enumerate(text.splitlines(),1):
            for match in re.finditer(r'\b(?:window|globalThis|root)\.([A-Za-z_$][\w$]*)',line):globals[match[1]].append(file+':'+str(number))
            for match in re.finditer(r'\bdata-([a-z][a-z0-9-]*)|\.dataset\.([A-Za-z][A-Za-z0-9]*)',line):
                key=match[1] or re.sub(r'[A-Z]',lambda m:'-'+m[0].lower(),match[2]);attrs['data-'+key].append(file+':'+str(number))
    result[name]={'commit':spec['commit'],'globals':dict(sorted(globals.items())),'data_attributes':dict(sorted(attrs.items()))}
out.write_text(json.dumps(result,indent=2)+'\n')
print('Lexical contracts:',sum(len(s['globals']) for s in result.values()),'global names;',sum(len(s['data_attributes']) for s in result.values()),'data-attribute names (per repository; includes platform APIs).')
