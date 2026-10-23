import assert from 'node:assert/strict';

// Natural startup reproduction is timing-dependent. Keep its observations,
// but require the explicit native interaction controls to reproduce the defect.
export function assertLocalControls(engine, samples) {
  assert.ok(samples.filter(s => s.mode === 'editors' && s.editorStartErrors !== null)
    .every(s => s.interactionErrors === 0 && s.interactionPageErrors === 0),
    'explicit editor integration must retain zero new raw errors in both collectors');
  if (engine === 'webkit') {
    for (const mode of ['native', 'original']) {
      const controls = samples.filter(s => s.case === 'editors' && s.mode === mode);
      assert.equal(controls.length, 4, `${mode} explicit editor control must retain four samples`);
      assert.ok(controls.some(s => s.interactionErrors > 0 && s.interactionPageErrors > 0),
        `${mode} explicit editor control must reproduce after the editor boundary in both raw collectors`);
    }
  }
  const integrated = samples.filter(s => s.mode === 'both');
  assert.ok(integrated.length, 'shared local pair samples must exist');
  assert.ok(integrated.every(s => s.pageerrors.length === 0 && s.final.errors.length === 0),
    'shared local pair must retain zero raw errors in both collectors');
}
