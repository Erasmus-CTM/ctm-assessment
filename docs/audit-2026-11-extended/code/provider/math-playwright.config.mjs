// Audit transport configuration; upstream specs/assertions remain unchanged.
// CTM_MATH_ROOT must be an isolated copy with the pinned site rendered.
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.env.CTM_MATH_ROOT;
if(!root)throw Error('Set CTM_MATH_ROOT to the isolated math-exercise checkout.');
const {default:base}=await import(pathToFileURL(path.join(root,'playwright.config.mjs')).href);
export default {...base,testDir:root,
 reporter:[['list'],['json',{outputFile:process.env.CTM_BROWSER_RESULTS||'/tmp/ctm-math-browser.json'}]],
 use:{...base.use,serviceWorkers:'block',launchOptions:{...base.use.launchOptions,
  executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox']}},
 webServer:{...base.webServer,cwd:root}};
