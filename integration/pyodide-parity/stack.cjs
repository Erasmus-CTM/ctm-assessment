// STACK page plans: replay the exact frozen data through the installed engine.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');

function pagesUnder(root) {
  return fs.readdirSync(root, {recursive: true}).map(String)
    .filter(name => name.endsWith('.html') && !name.split(path.sep).includes('site_libs'))
    .filter(name => /class="(?:ctm-stack-data|stack-sympy-data)"/.test(fs.readFileSync(path.join(root, name), 'utf8'))).sort();
}
function casesOf(file, relative) {
  const dom = new JSDOM(fs.readFileSync(file, 'utf8'));
  const cases = [];
  try {
    [...dom.window.document.querySelectorAll('script.ctm-stack-data,script.stack-sympy-data')].forEach((island, position) => {
      const payload = JSON.parse(island.textContent);
      if (![1,2].includes(payload.version)) throw new Error('Unsupported STACK payload version');
      const question = payload.version === 2 ? payload.backend.question : payload.question;
      if (payload.version === 2 && payload.backend.id !== 'sympy') throw new Error('STACK parity needs a backend replay implementation: ' + payload.backend.id);
      if (!payload.variants.length) throw new Error('Empty STACK card: ' + relative);
      payload.variants.forEach((item, index) => {
        const variant = payload.version === 2 ? item.plan : item;
        for (const probe of ['tests','teacher','empty','zero','one','invalid','symbolic']) {
          cases.push({id: `stack:${relative}#${position}|seed=${variant.seed}|${probe}`, page: relative,
            position, label: 'stack-' + position, kind: 'stack', variantKey: 'seed=' + variant.seed,
            variant: {kind:'stack',id:String(variant.seed),index}, probe,
            request: {question,variant}});
        }
      });
    });
  } finally { dom.window.close(); }
  return cases;
}
module.exports = {pagesUnder, casesOf};
