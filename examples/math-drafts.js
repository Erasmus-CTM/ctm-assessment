// Example-page starting answers. The source panels include this same setup so
// copying an activity reproduces its visible draft as well as its answer key.
document.addEventListener('DOMContentLoaded', function () {
  const drafts = {
    'integration-math': ['40'],
    'practice-math-fields': ['5', ''],
    'practice-math-vector': ['2*x', ''],
    'practice-math-matrix': ['1', '', '', '4'],
    'practice-math-basis': ['1', '-1', ''],
    'policy-question': ['3'],
    'policy-worked': ['3'],
    'integration-jsxgraph-length': ['4']
  };
  const cells = [...document.querySelectorAll('.math-exercise-cell')]
    .filter(cell => Object.hasOwn(drafts, cell.dataset.label));
  function fillDrafts() {
    let pending = false;
    for (const cell of cells) {
      if (cell.dataset.draftLoaded) continue;
      const values = drafts[cell.dataset.label];
      const fields = cell.querySelectorAll('.math-input');
      if (fields.length !== values.length) { pending = true; continue; }
      fields.forEach((field, i) => {
        field.value = values[i];
        field.dispatchEvent(new Event('input', {bubbles: true}));
      });
      cell.dataset.draftLoaded = 'true';
    }
    if (!pending) observer.disconnect();
  }
  const observer = new MutationObserver(fillDrafts);
  observer.observe(document.body, {childList: true, subtree: true});
  fillDrafts();
});
