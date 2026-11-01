// node locale-probe.cjs /path/to/ctm-libs (requires that repo's jsdom dev dependency)
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const repo=process.argv[2]||'/workspace/ctm-libs';
const {JSDOM}=require(path.join(repo,'node_modules/jsdom'));
const dom=new JSDOM('<html lang="nn"><body></body></html>',{url:'https://example.test/course/',runScripts:'outside-only'});
for(const file of ['locales/ctm-locale.js','locales/feedback.js','feedback/feedback-core.js','feedback/ai-feedback.js'])
  vm.runInContext(fs.readFileSync(path.join(repo,'_extensions/ctm-libs',file),'utf8'),dom.getInternalVMContext());
console.log(JSON.stringify({commonResolver:dom.window.CTMLocales.table('feedback','nn').settings,widget:dom.window.AIFeedback.settingsButton('nn').title}));
dom.window.close();
