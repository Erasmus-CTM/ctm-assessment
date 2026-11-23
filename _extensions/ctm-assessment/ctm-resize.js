// Three sizes for input fields: normal, larger, full screen.
// Works for pyodide-interaktiv cells, py-exercise editors and math-exercise
// text areas. A click beside the enlarged field (or Escape) shrinks it again.
(function () {
  var HOSTS = '.qpyodide-editor, .py-exercise-editor, textarea.math-input-large';
  var LABELS = {
    de: {larger: 'Eingabefeld vergrößern', smaller: 'Eingabefeld verkleinern', group: 'Größe des Eingabefelds'},
    en: {larger: 'Enlarge input field', smaller: 'Shrink input field', group: 'Size of the input field'}
  };
  var text = LABELS[(document.documentElement.lang || 'en').slice(0, 2)] || LABELS.en;
  var active = null;

  function layoutEditors(host) {
    if (!window.monaco || !monaco.editor || !monaco.editor.getEditors) return;
    monaco.editor.getEditors().forEach(function (editor) {
      var node = editor.getContainerDomNode && editor.getContainerDomNode();
      if (node && host.contains(node)) editor.layout();
    });
  }

  function setLevel(state, level) {
    level = Math.max(0, Math.min(2, level));
    if (level === state.level) return;
    var host = state.host;
    if (level === 2) {
      if (!state.placeholder) {
        state.placeholder = document.createElement('div');
        state.placeholder.style.height = state.box.offsetHeight + 'px';
        state.box.parentNode.insertBefore(state.placeholder, state.box);
      }
      state.backdrop = document.createElement('div');
      state.backdrop.className = 'ctm-size-backdrop';
      state.backdrop.addEventListener('click', function () { setLevel(state, 0); });
      document.body.appendChild(state.backdrop);
    } else if (state.placeholder) {
      state.placeholder.remove();
      state.placeholder = null;
    }
    if (level !== 2 && state.backdrop) { state.backdrop.remove(); state.backdrop = null; }
    state.level = level;
    state.box.setAttribute('data-ctm-size', String(level));
    state.larger.disabled = level === 2;
    state.smaller.disabled = level === 0;
    active = level > 0 ? state : (active === state ? null : active);
    layoutEditors(host);
    requestAnimationFrame(function () { layoutEditors(host); });
    if (host.tagName === 'TEXTAREA' && level > 0) host.focus();
  }

  function attach(host) {
    if (host.getAttribute('data-ctm-resize')) return;
    host.setAttribute('data-ctm-resize', '1');
    var box = host;
    if (host.tagName === 'TEXTAREA') {
      box = document.createElement('div');
      host.parentNode.insertBefore(box, host);
      box.appendChild(host);
    }
    box.classList.add('ctm-size-box');
    var group = document.createElement('div');
    group.className = 'ctm-size-controls';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', text.group);
    var ICONS = {
      smaller: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 6.5 14 2M9.5 6.5V3M9.5 6.5H13M6.5 9.5 2 14M6.5 9.5V13M6.5 9.5H3"/></svg>',
      larger: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2 9.5 6.5M14 2V5.5M14 2H10.5M2 14l4.500-4.500M2 14v-3.500M2 14h3.500"/></svg>'
    };
    function button(kind, title) {
      var b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = ICONS[kind];
      b.title = title;
      b.setAttribute('aria-label', title);
      group.appendChild(b);
      return b;
    }
    var state = {host: host, box: box, level: 0};
    state.smaller = button('smaller', text.smaller);
    state.larger = button('larger', text.larger);
    state.smaller.disabled = true;
    state.smaller.addEventListener('click', function (e) { e.stopPropagation(); setLevel(state, state.level - 1); });
    state.larger.addEventListener('click', function (e) { e.stopPropagation(); setLevel(state, state.level + 1); });
    box.appendChild(group);
  }

  function scan(root) {
    if (!root.querySelectorAll) return;
    if (root.matches && root.matches(HOSTS)) attach(root);
    root.querySelectorAll(HOSTS).forEach(attach);
  }

  document.addEventListener('click', function (event) {
    if (active && active.level === 1 && !active.box.contains(event.target)) setLevel(active, 0);
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && active) setLevel(active, active.level - 1);
  });

  function start() {
    scan(document);
    new MutationObserver(function (records) {
      records.forEach(function (r) { r.addedNodes.forEach(function (n) { if (n.nodeType === 1) scan(n); }); });
    }).observe(document.body, {childList: true, subtree: true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
