// Inspect trusted, verified Pyodide release stdlib; never execute authored code.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const [directoryArg,outputArg] = process.argv.slice(2);
assert.ok(directoryArg && outputArg, 'usage: node probe-pyodide-stdlib.mjs PRIVATE_CORE OUTPUT_JSON');
const directory=path.resolve(directoryArg), output=path.resolve(outputArg);
const request=JSON.parse(fs.readFileSync(path.join(directory,'probe-input.json'),'utf8'));
assert.equal(request.v,1);
assert.match(request.pyodide,/^\d+\.\d+\.\d+$/);
assert.ok(Array.isArray(request.candidates));
const {loadPyodide}=await import(pathToFileURL(path.join(directory,'pyodide.mjs')).href);
// No dependency downloads: all executable runtime bytes came from the verified archive.
globalThis.fetch=async()=>{throw new Error('Network access is disabled during stdlib availability inspection');};
const pyodide=await loadPyodide({indexURL:directory+path.sep,stdout:()=>{},stderr:()=>{}});
assert.equal(pyodide.version,request.pyodide);
pyodide.globals.set('_ctm_candidate_json',JSON.stringify(request.candidates));
const result=JSON.parse(pyodide.runPython(String.raw`
import sys as _ctm_sys
import json as _ctm_json
import importlib as _ctm_importlib
import _imp as _ctm_imp
_ctm_names = set(_ctm_json.loads(_ctm_candidate_json))
_ctm_names.update(_ctm_sys.builtin_module_names)
_ctm_names.update(name for name in _ctm_imp._frozen_module_names() if "." not in name)
_ctm_available, _ctm_unavailable = [], {}
for _ctm_name in sorted(_ctm_names):
    if not _ctm_name.isidentifier():
        continue
    try:
        _ctm_importlib.import_module(_ctm_name)
    except BaseException as _ctm_error:
        _ctm_unavailable[_ctm_name] = type(_ctm_error).__name__ + ": " + str(_ctm_error)
    else:
        _ctm_available.append(_ctm_name)
_ctm_json.dumps({"python": ".".join(str(value) for value in _ctm_sys.version_info[:3]),
                 "modules": _ctm_available, "unavailable": _ctm_unavailable})
`));
assert.equal(result.python,request.python);
for(const unavailable of ['winreg','tkinter','termios','pty','tty','_winapi','_overlapped','_wmi'])
  assert.ok(!result.modules.includes(unavailable),unavailable+' must not be admitted as release stdlib');
for(const available of ['os','sys','importlib','math'])
  assert.ok(result.modules.includes(available),available+' must remain available');
const facts={v:2,kind:'pyodide-stdlib-availability',python:request.python,pyodide:request.pyodide,
  source:{...request.source,runtime_files:request.runtime_files,candidate_source:request.candidate_source,
    method:'Successful imports of trusted release stdlib candidates plus actual builtin/frozen inventory; network disabled; no authored execution'},
  modules:result.modules,unavailable:result.unavailable};
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(facts,null,2)+'\n');
console.log('Verified Pyodide '+facts.pyodide+': '+facts.modules.length+' importable stdlib names, '+Object.keys(facts.unavailable).length+' unavailable candidates');
