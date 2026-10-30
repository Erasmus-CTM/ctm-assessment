/* Replays grading_probe.py requests in local npm Pyodide; no CDN/network or API key.
 * node pyodide_probe.cjs /path/to/node_modules/pyodide /tmp/pure.zip /tmp/probe.json
 */
const fs = require('node:fs');
const { performance } = require('node:perf_hooks');
async function main() {
  const [runtime, archive, input] = process.argv.slice(2);
  if (!input) throw Error('Usage: node pyodide_probe.cjs PYODIDE_DIR ARCHIVE INPUT_JSON');
  const {loadPyodide}=require(runtime);
  const fixture=JSON.parse(fs.readFileSync(input,'utf8'));
  const observations=[];
  for (const seed of [0,1,42]) {
    const start=performance.now();
    const py=await loadPyodide({env:{PYTHONHASHSEED:String(seed)},stdout:()=>{},stderr:()=>{}});
    const ready=performance.now();
    py.unpackArchive(new Uint8Array(fs.readFileSync(archive)),'zip',{extractDir:'/home/pyodide/audit'});
    py.runPython("import sys; sys.path.insert(0,'/home/pyodide/audit')");
    py.globals.set('_requests',JSON.stringify(fixture.parity_requests));
    const importStart=performance.now();
    py.runPython('import sympy; from ctm_checkers.math_exercise.checks import check; import json');
    const importEnd=performance.now();
    const actual=JSON.parse(py.runPython('json.dumps([check(r) for r in json.loads(_requests)])'));
    const end=performance.now();
    const differences=actual.map((result,index)=>({index,result,expected:fixture.parity_results[index]}))
      .filter(({result,expected})=>JSON.stringify(result)!==JSON.stringify(expected));
    // Object key order differs between sorted CPython serialization and native dict insertion.
    const mismatch=differences.filter(({result,expected})=>result.status!==expected.status || result.score!==expected.score || result.message!==expected.message);
    observations.push({seed,pyodide:py.version,sympy:py.runPython('sympy.__version__'),requests:actual.length,
      mismatches:mismatch,cold_start_ms:ready-start,import_ms:importEnd-importStart,
      batch_ms:end-importEnd,upper_boundary:actual[201],lower_boundary:actual[200]});
  }
  console.log(JSON.stringify(observations));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
