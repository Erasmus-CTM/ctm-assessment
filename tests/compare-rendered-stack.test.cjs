const test=require('node:test'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
test('STACK shell recognition rejects changes to grading, display, identity or the backend contract',async()=>{
  const {stackTransition}=await import('../tools/compare-rendered/stack.mjs');
  const question={inputs:[{name:'a',teacher:'2'}],qtests:[],prts:[{name:'p',value:1}]};
  const plan={seed:7,env:{a:'2'},question_html:'<p>Exact task</p>',generalfeedback_html:'<p>Exact feedback</p>'};
  const old={version:1,id:'old',question,variants:[plan],review:true};
  const next={version:2,id:'new',common:{inputs:question.inputs,qtests:[],checker:null},
    backend:{id:'sympy',planSchema:1,stackRevision:'a'.repeat(40),runtimeHash:null,question},
    variants:[{n:1,id:'7',hash:'b'.repeat(64),display:{question_html:plan.question_html,generalfeedback_html:plan.generalfeedback_html},plan}],review:true};
  const descriptor={id:'sympy',version:'0.11',adapter:'backends/sympy.js',requires:{isolation:false}};
  function attempt(mutate=()=>{}) {
    const b=structuredClone(next),d=structuredClone(descriptor);mutate(b,d);
    const A={configs:{'stack-sympy-data':[structuredClone(old)]}};
    const B={configs:{'ctm-stack-data':[b],'ctm-stack-backend':[d]},doc:new JSDOM('<section class="ctm-stack" data-stack-id="new"></section>').window.document};
    return stackTransition(A,B);
  }
  assert.equal(attempt(),true);
  for(const mutate of [b=>b.backend.question.prts[0].value=2,b=>b.variants[0].plan.env.a='3',
    b=>b.variants[0].display.question_html='<p>Changed task</p>',b=>b.variants[0].id='8',
    b=>b.common.inputs=[],(_b,d)=>d.adapter='unexpected.js',(_b,d)=>d.requires.isolation=true]) {
    assert.equal(attempt(mutate),false);
  }
});
