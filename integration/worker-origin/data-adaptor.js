// Candidate diagnostic bootstrap for JSXGraph's supported src_mjx option.
// Selects a MathJax DOM adaptor; browser Worker and generated frames are untouched.
(function () {
  'use strict';
  const config = window.MathJax || {};
  const startup = config.startup || {};
  const ready = startup.ready;
  config.startup = Object.assign({}, startup, {
    ready() {
      const browserAdaptor = MathJax.startup.constructors.browserAdaptor;
      MathJax.startup.registerConstructor('ctmDataWorkerAdaptor', function (options) {
        const adaptor = browserAdaptor(options);
        const nativeCreateWorker = adaptor.createWorker.bind(adaptor);
        adaptor.createWorker = async function (listener, options) {
          // Keep MathJax's native transport for ordinary origins.
          if (self.origin !== 'null') return nativeCreateWorker(listener, options);
          const file = options.path + '/' + options.worker;
          const source = 'self.maps = ' + JSON.stringify(options.maps) +
            '; importScripts(' + JSON.stringify(file) + ');';
          const worker = new Worker('data:text/javascript;charset=utf-8,' + encodeURIComponent(source));
          worker.onmessage = listener;
          return worker;
        };
        return adaptor;
      });
      MathJax.startup.useAdaptor('ctmDataWorkerAdaptor', true);
      if (ready) Reflect.apply(ready, this, []);
      else MathJax.startup.defaultReady();
    }
  });
  window.MathJax = config;
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/mathjax@4.1.3/tex-mml-svg.js';
  script.async = true;
  document.head.appendChild(script);
})();
