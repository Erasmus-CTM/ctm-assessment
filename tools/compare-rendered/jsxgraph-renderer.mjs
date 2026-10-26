// Exact reviewed JSXGraph renderer transition. No board code is executed here.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const repository = 'jsxgraph/jsxgraph-quarto';
export const RENDERERS = Object.freeze({
  before: {commit:'17de83e006cf8907a146cc6a2366f42a35463c6e', lua:'7208ad6e15359d71bba086ed06dccb87da4e3c1497304e553235e8897374d8e0'},
  release: {repository:'aacchhee/jsxgraph-quarto',commit:'49a1c7d575e08b2133e39098e8f9deda61567287',lua:'4bf685cfb02a831b362f0b580ae8fac9854ebb228c2168a6b6b48785f6fd6581'},
  git: {repository:'aacchhee/jsxgraph-quarto',commit:'e31b5d19cb7f282e220634c0e21304067910efff',lua:'e134658ae4cddfa543567e787fa9df7cc40afdc0c9ec2968f6a4a82e5eecaecf'},
  after: {commit:'e4ad81d82e1b56f86765026a3dd26f6975d29d57', lua:'f7c234ba4e3a778f7362af702040cbc4adef39776c1abb34fd159d6bbdd9e5d4'}
});
const graphHash = '3aa43338142a78eca94a91efdc55ef32abe7081464b8905d743e418d8bfecf2e';
const hash = value => createHash('sha256').update(value).digest('hex');
const insist = (condition,message) => {if(!condition)throw new Error(message);};
const norm = text => text.replace(/\s+/g,' ').trim();
const randomId = /JXG[0-9a-f]{8}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{8}/g;
const recordPaths = ['resolved-repos.json','_extensions/ctm-assessment/resolved-repos.json'];

export function rendererSource(project,pins,side) {
  const expected = RENDERERS[side];
  insist(expected,'Unknown renderer side');
  const pin = pins.repositories?.jsxgraph;
  insist(pin?.repository === (expected.repository||repository) && pin.commit === expected.commit,'Renderer pin identity mismatch: '+side);
  const records = recordPaths.map(file=>path.join(project,file)).filter(file=>fs.existsSync(file)).map(file=>JSON.parse(fs.readFileSync(file,'utf8')));
  insist(records.length,'Missing installed renderer record: '+side);
  const result = [];
  for(const record of records) {
    const actual = record.repositories?.jsxgraph;
    insist(actual?.repository === (expected.repository||repository) && actual.commit === pin.commit && !actual.local_override && !(actual.dirty_files||[]).length,'Installed renderer identity mismatch: '+side);
    const source = {};
    for(const [file,digest] of [['lua/jsxgraph.lua',expected.lua],['graph-editor.js',graphHash]]) {
      const bytes = fs.readFileSync(path.join(project,'_extensions/jsxgraph',file));
      const entries = Object.entries(record.extension_sha256?.jsxgraph||{}).filter(([key])=>key.replaceAll(String.fromCharCode(92),'/')===file);
      insist(entries.length===1 && entries[0][1]===digest && hash(bytes)===digest,'Installed renderer bytes mismatch: '+side+'/'+file);
      source[file] = bytes.toString('utf8');
    }
    const matches = [...source['lua/jsxgraph.lua'].matchAll(/local assessment_bridge = string\.format\(\[\[([\s\S]*?)\]\], assessment_id, id([^\n]*)\)/g)];
    insist(matches.length===1,'Ambiguous canonical renderer template');
    const kinds = [...matches[0][1].matchAll(/%([a-z%])/gi)].map(match=>match[1]).filter(kind=>kind!=='%');
    insist(JSON.stringify(kinds)===JSON.stringify(side==='before'?['q','q','d','d']:['q','q']),'Unexpected renderer template parameters');
    result.push({commit:pin.commit,luaSha256:expected.lua,graphSha256:graphHash,template:matches[0][1],graph:norm(source['graph-editor.js'])});
  }
  insist(result.every(source=>JSON.stringify(source)===JSON.stringify(result[0])),'Conflicting installed renderer records');
  return result[0];
}

export function loadRendererSources(beforeProject,beforePinsFile,afterProject,afterPinsFile) {
  insist(Boolean(beforeProject)===Boolean(beforePinsFile),'--renderer-before-sources and --renderer-before-pins must be supplied together');
  if(!beforeProject)return null;
  const afterPins = JSON.parse(fs.readFileSync(afterPinsFile,'utf8'));
  const afterSide=Object.keys(RENDERERS).find(side=>side!=='before' && afterPins.repositories?.jsxgraph?.commit===RENDERERS[side].commit);
  if(!afterSide)return null;
  if(afterPins.repositories?.jsxgraph?.commit!==RENDERERS[afterSide].commit)return null;
  const beforePins = JSON.parse(fs.readFileSync(beforePinsFile,'utf8'));
  const beforeSide=Object.keys(RENDERERS).find(side=>beforePins.repositories?.jsxgraph?.commit===RENDERERS[side].commit);
  if(beforeSide!=='before' && !(beforeSide==='git' && afterSide==='release'))return null;
  return {before:rendererSource(beforeProject,beforePins,beforeSide),after:rendererSource(afterProject,afterPins,afterSide)};
}

const quote = '("(?:\\\\.|[^"\\\\])*")';
function bridge(source,code,side) {
  code = norm(code);
  const id = new RegExp('const assessmentId = '+quote+';').exec(code);
  const legacy=source.commit===RENDERERS.before.commit;
  const board = new RegExp((legacy?'const boardId':'window\\.BOARDID')+' = '+quote+';').exec(code);
  insist(id && board,'Missing renderer identities');
  const size = /const provisionalSize = \[(\d+), (\d+)\];/.exec(code);
  insist(!legacy||size,'Missing original provisional dimensions');
  const args = [JSON.parse(id[1]),JSON.parse(board[1]),...(legacy?[Number(size[1]),Number(size[2])]:[])];
  let index = 0;
  const rendered = source.template.replace(/%([qd%])/g,(_,kind)=>kind==='%'?'%':kind==='q'?JSON.stringify(args[index++]):String(args[index++]));
  insist(index===args.length && norm(rendered)===code,'Rendered bridge differs from exact canonical '+side+' source');
  return {id:args[0],board:args[1],provisional:args.slice(2)};
}

function provisionalSize(style) {
  const number = '(\\d+(?:\\.\\d+)?)';
  const pixels = new RegExp('^width:'+number+'px;\\s*height:'+number+'px;').exec(style);
  if(pixels) {
    const width=Number(pixels[1]),height=Number(pixels[2]);
    insist(width>0 && height>0,'Invalid original iframe dimensions');
    return [Math.floor(width+.5),Math.floor(height+.5)];
  }
  const relative = new RegExp('^width:'+number+'%;\\s*aspect-ratio:'+number+'/'+number+';').exec(style);
  insist(relative && Number(relative[1])===Number(relative[2]) && Number(relative[2])>0 && Number(relative[3])>0,'Unsupported original iframe geometry');
  return [800,Math.floor(800*Number(relative[3])/Number(relative[2])+.5)];
}

function decoded(frame) {
  const value = frame.getAttribute('src')||'';
  return value.startsWith('data:text/html;base64,') ? 'data:text/html;decoded,'+norm(Buffer.from(value.slice(22),'base64').toString('utf8').replace(randomId,'JXG*')) : null;
}

export function proveRendererPair(item,sources,document,resourcePairs=[]) {
  const prefix = 'data:text/html;decoded,';
  insist(item.before.startsWith(prefix)&&item.after.startsWith(prefix),'Board delivery encoding changed');
  let before=item.before.slice(prefix.length),after=item.after.slice(prefix.length);
  const scripts = html => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const a=scripts(before),b=scripts(after);
  insist(a.length===3 && b.length===3,'Expected exactly three generated board body scripts');
  const old=bridge(sources.before,a[0][1],'before'),fresh=bridge(sources.after,b[0][1],'after');
  insist(old.id===fresh.id && old.board===fresh.board,'Board identity changed');
  const frames=[...document.querySelectorAll('iframe[src]')].filter(frame=>decoded(frame)===item.before);
  insist(frames.length && frames.every(frame=>frame.getAttribute('style')===frames[0].getAttribute('style')),'Missing or ambiguous original iframe geometry');
  const legacy=sources.before.commit===RENDERERS.before.commit;
  if(legacy)insist(JSON.stringify(old.provisional)===JSON.stringify(provisionalSize(frames[0].getAttribute('style')||'')),'Original provisional dimensions differ from iframe geometry');
  insist(norm(a[1][1])===sources.before.graph && norm(b[1][1])===sources.after.graph,'Graph editor differs from canonical source');
  const authored=norm(b[2][1]),prelude='window.BOARDID = '+JSON.stringify(fresh.board)+';';
  const strict=/^(['"])use strict\1\s*;?\s*/.exec(authored);
  const prior=strict?authored.slice(0,strict[0].length)+prelude+' '+authored.slice(strict[0].length):prelude+' '+authored;
  insist(norm(legacy?prior:authored)===norm(a[2][1]),'Authored code changed beyond the exact original generated BOARDID prelude');
  for(const [list,side] of [[a,'before'],[b,'after']]) {
    let value=side==='before'?before:after;
    for(let index=0;index<3;index++)value=value.replace(list[index][0],'<script>VALIDATED_'+index+'</script>');
    if(side==='before')before=value;else after=value;
  }
  for(const {historical,target} of resourcePairs)before=before.replace(historical,target);
  if(sources.after.commit===RENDERERS.release.commit) {
    const oldCss='html,body{margin:0;padding:0;width:100%;height:100%;}';
    const newCss='html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;}';
    insist(before.split(oldCss).length===2 && after.split(newCss).length===2,'Missing exact reviewed iframe overflow CSS transition');
    before=before.replace(oldCss,newCss);
  }
  insist(before===after,'Board frame changed beyond the exact renderer transition');
  return {beforeCommit:sources.before.commit,afterCommit:sources.after.commit,beforeLua:sources.before.luaSha256,afterLua:sources.after.luaSha256,
    graphSha256:graphHash,assessmentId:fresh.id,provisional:old.provisional,beforeSha256:hash(item.before),afterSha256:hash(item.after),allOtherNormalizedFrameBytesEqual:true};
}
