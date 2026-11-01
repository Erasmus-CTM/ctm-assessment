#!/usr/bin/env python3
"""Read tracked snapshot blobs; inventory extension ownership and duplicate code.

Run with a JSON {name: {path, commit}} manifest and an output directory.
No checked-out source file is modified. SHA/byte matches are exact; near matches
are candidate leads after stripping whitespace/comments, never bug evidence.
"""
import argparse, collections, difflib, hashlib, json, pathlib, re, subprocess

def git(path, *args):
    return subprocess.check_output(['git', '-C', str(path), *args])

def normalize(data, suffix):
    text = data.decode('utf-8', 'replace')
    if suffix in ('.js', '.mjs', '.cjs', '.css', '.ts'):
        text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
        text = re.sub(r'(?m)^\s*//.*$', '', text)
    if suffix == '.lua': text = re.sub(r'(?m)^\s*--.*$', '', text)
    if suffix == '.py': text = re.sub(r'(?m)^\s*#.*$', '', text)
    return re.sub(r'\s+', '', text)

def main():
    p = argparse.ArgumentParser(); p.add_argument('manifest'); p.add_argument('out'); args = p.parse_args()
    manifest = json.loads(pathlib.Path(args.manifest).read_text()); out = pathlib.Path(args.out); out.mkdir(parents=True, exist_ok=True)
    rows, contents, allhash = [], {}, collections.defaultdict(list)
    for repo, spec in manifest.items():
        path, commit = spec['path'], spec['commit']
        files = git(path, 'ls-tree', '-r', '--name-only', commit).decode().splitlines()
        for name in files:
            include = name.startswith('_extensions/') or name.endswith('example-source.lua') or name.endswith('ctm-bootstrap.lua')
            if not include: continue
            data = git(path, 'show', commit + ':' + name); sha = hashlib.sha256(data).hexdigest()
            parts = pathlib.PurePosixPath(name).parts; ext = parts[1] if name.startswith('_extensions/') else None
            owner = ('jsxgraph-quarto' if ext == 'jsxgraph' else ext) if ext else repo
            generator = None; kind = 'source'
            if ext == 'ctm-checkers': generator = 'ctm-checkers/tools/build.py'; kind = 'generated'
            if '/native-authoring/' in name: generator = 'ctm-checkers/tools/build_authoring.py'; kind = 'generated'
            if name.endswith('ctm-bootstrap.lua'): owner = 'ctm-libs'; generator = 'ctm-libs/bootstrap/ctm-bootstrap.lua'; kind = 'copy'
            if repo == 'pyodide-interaktiv' and ext in ('ctm-libs', 'ai-feedback'):
                owner = 'ctm-libs'; generator = 'pyodide-interaktiv/tools/sync-ctm-libs.py'; kind = 'generated copy'
            if name.endswith('/pyodide-worker-core.js'): generator = 'ctm-libs/scripts/sync-worker-core.cjs'; kind += '; generated from pyodide-worker.js'
            if repo == 'jsxgraph-quarto' and '/resources/' in name:
                owner = 'jsxgraph/jsxgraph (upstream library); jsxgraph-quarto (distribution)'
                kind = 'vendored upstream release'
                generator = 'JSXGraph 1.14.2 release; upstream-runtime.json records provenance'
            if name.endswith(('/feedback-core.js', '/ai-feedback.js')): generator = 'ctm-libs/scripts/sync-feedback-defaults.py (marked blocks only)'; kind += '; partially generated'
            if repo in ('ctm-demo','freehand_ai_assessment','ingmat3a_ntnu') and ext:
                kind = 'consumer copy'; generator = 'ctm-assessment/scripts/install-project.py → setup-feedback-integration.py'
            if repo == 'freehand_ai_assessment' and name == '_filters/example-source.lua':
                owner = 'math-exercise (upstream template); freehand (adaptation)'
                kind = 'manually adapted copy'
                generator = 'manual adaptation of math-exercise/_filters/example-source.lua; no sync generator'
            key = repo + ':' + name
            row = dict(repository=repo, commit=commit, file=name, extension=ext, owner=owner, kind=kind, generator=generator, bytes=len(data), sha256=sha)
            rows.append(row); allhash[sha].append(key)
            suffix = pathlib.PurePosixPath(name).suffix
            if suffix in ('.js','.mjs','.cjs','.lua','.py','.css','.ts') and len(data)>100:
                contents[key] = (suffix,normalize(data,suffix),sha)
    exact = [dict(sha256=sha, files=files) for sha,files in allhash.items() if len(files)>1]
    near=[]; keys=list(contents)
    for i,a in enumerate(keys):
        sa,ta,ha=contents[a]
        for b in keys[i+1:]:
            sb,tb,hb=contents[b]
            if a.split(':',1)[0]==b.split(':',1)[0] or sa!=sb or ha==hb: continue
            if min(len(ta),len(tb))/max(len(ta),len(tb),1)<.7: continue
            match=difflib.SequenceMatcher(None,ta,tb,autojunk=True)
            if match.quick_ratio()<.82: continue
            ratio=match.ratio()
            if ratio>=.82: near.append(dict(a=a,b=b,normalized_similarity=round(ratio,4)))
    for filename,value in [('ownership.json',rows),('duplicates-exact.json',exact),('duplicates-near.json',sorted(near,key=lambda x:-x['normalized_similarity']))]:
        (out/filename).write_text(json.dumps(value,indent=2)+'\n')
    with (out/'ownership.tsv').open('w') as f:
        fields=['repository','commit','file','owner','kind','generator','bytes','sha256']; f.write('\t'.join(fields)+'\n')
        for row in rows: f.write('\t'.join(str(row.get(k) or '') for k in fields)+'\n')
    print(json.dumps(dict(files=len(rows),bytes=sum(r['bytes'] for r in rows),exact_groups=len(exact),near_pairs=len(near))))
if __name__=='__main__': main()
