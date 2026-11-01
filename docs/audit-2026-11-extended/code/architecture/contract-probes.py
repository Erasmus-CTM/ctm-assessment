#!/usr/bin/env python3
"""Small ownership and stale-version-gate reproductions; no source writes."""
import ast, json, pathlib, re, subprocess, tempfile, types, sys
root=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else '/workspace')
source=(root/'py-exercise/_extensions/py-exercise/py-exercise.js').read_text()
body=re.search(r"var MODULE_PY = \[\n(.*?)\n\s*\]\.join\('\\n'\);",source,re.S)[1]
code='\n'.join(ast.literal_eval(line.strip().rstrip(',')) for line in body.splitlines() if line.strip())
module=types.ModuleType('_ctm_py_exercise');exec(code,module.__dict__)
print('py-exercise owns grading:',json.dumps(module.run('x = 2','assert x == 2\nassert x == 3',{'assertion_failed':'failed','test_error':'error {}','syntax_error':'syntax {}'})))
ctm=root/'ctm-libs/_extensions/ctm-libs/lua/ctm.lua'
with tempfile.TemporaryDirectory() as folder:
    lua=pathlib.Path(folder)/'gate.lua'
    lua.write_text('_G.__ctmLibs={dir="/different/installation",version="0.9.0",api=1}\n'+
      'local cached=dofile('+json.dumps(str(ctm))+')\n'+
      'assert(cached.api==1,"test expected same-version cached old API to pass")\n'+
      'io.stderr:write("same-version different installation accepted; cached API=" .. cached.api .. "\\n")\nreturn {}\n')
    run=subprocess.run(['pandoc','--lua-filter',str(lua),'-f','markdown','-t','plain'],input='',capture_output=True,text=True)
    print('singleton probe exit:',run.returncode,run.stderr.strip())
    if run.returncode:sys.exit(run.returncode)
