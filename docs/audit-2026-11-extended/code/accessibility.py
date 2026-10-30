#!/usr/bin/env python3
"""axe-core + keyboard/layout observations on rendered EN/NB audit pages."""
import argparse, functools, http.server, json, pathlib, threading
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--site',type=pathlib.Path,default=pathlib.Path('/tmp/ctm-audit-combined/_site'));p.add_argument('--paths',nargs='+',default=['en.html','nb.html']);p.add_argument('--out',default='/tmp/ctm-axe.json');a=p.parse_args()
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(a.site)))
threading.Thread(target=server.serve_forever,daemon=True).start()
axe=pathlib.Path('/workspace/ctm-assessment/node_modules/axe-core/axe.min.js').read_text()
results=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for path in a.paths:
  page=browser.new_page(viewport={'width':1280,'height':900}); external=[]
  def route(r):
   if r.request.url.startswith('http://127.0.0.1:'):r.continue_()
   else:external.append(r.request.url);r.abort()
  page.route('**/*',route)
  page.goto(f'http://127.0.0.1:{server.server_port}/{path}',wait_until='networkidle')
  page.add_script_tag(content=axe)
  scan=page.evaluate('''async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return {violations:r.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,nodes:v.nodes.map(n=>({html:n.html,target:n.target,failureSummary:n.failureSummary}))})),passes:r.passes.length,incomplete:r.incomplete.map(v=>({id:v.id,nodes:v.nodes.length}))}}''')
  scan.update({'path':path,'lang':page.locator('html').get_attribute('lang'),'external_blocked':sorted(set(external))})
  scan['live_regions']=page.locator('[aria-live], [role=status], [role=alert]').evaluate_all('(xs)=>xs.map(x=>({tag:x.tagName,role:x.getAttribute("role"),live:x.getAttribute("aria-live"),id:x.id}))')
  scan['tab_controls']=page.locator('[role=tab]').evaluate_all('(xs)=>xs.map(x=>({text:x.textContent,selected:x.getAttribute("aria-selected"),tabindex:x.tabIndex,controls:x.getAttribute("aria-controls")}))')
  scan['details']=page.locator('details').evaluate_all('(xs)=>xs.map(x=>({open:x.open,summary:x.querySelector("summary")?.textContent,hiddenInputs:x.querySelectorAll("input,textarea,button").length}))')
  for width in [390,1280]:
   page.set_viewport_size({'width':width,'height':900});page.wait_for_timeout(100)
   scan[f'layout_{width}']=page.evaluate('({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth})')
  focus=[]
  for _ in range(16):
   page.keyboard.press('Tab');focus.append(page.evaluate('({tag:document.activeElement.tagName,role:document.activeElement.getAttribute("role"),id:document.activeElement.id,text:document.activeElement.textContent?.slice(0,80)})'))
  scan['keyboard_focus']=focus;results.append(scan);page.close()
 browser.close()
server.shutdown();pathlib.Path(a.out).write_text(json.dumps(results,indent=2));print(json.dumps([{'path':r['path'],'lang':r['lang'],'violations':[(v['id'],v['impact'],len(v['nodes'])) for v in r['violations']],'layout390':r['layout_390'],'passes':r['passes']} for r in results],indent=2))
