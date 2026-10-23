// Diagnostic source transformations only. Never used by the site producer.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const sha256=text=>createHash('sha256').update(text).digest('hex');
export function replaceOnce(source,before,after) {
  assert.equal(source.split(before).length,2,'exact upstream source span must occur once');
  const changed=source.replace(before,after);
  assert.equal(changed.replace(after,before),source,'all unrelated bytes must remain unchanged');
  return changed;
}

export const quartoBefore=`      throttle(() => {
        layoutMarginEls();
        if (
          window.document.body.getBoundingClientRect().width < 990 &&
          isReaderMode()
        ) {
          quartoToggleReader();
        }
      }, 50)`;
export const quartoAfter=`      throttle(() => {
        // Layout reads and writes must run outside ResizeObserver delivery.
        window.requestAnimationFrame(() => {
          layoutMarginEls();
          if (
            window.document.body.getBoundingClientRect().width < 990 &&
            isReaderMode()
          ) {
            quartoToggleReader();
          }
        });
      }, 50)`;
export function quartoPhase(source) { return replaceOnce(source,quartoBefore,quartoAfter); }

// Monaco 0.46.0's AMD build of the canonical ElementSizeObserver below.
// Keep this adapter separate from the reviewable upstream TypeScript patch.
const monacoBefore='let v=!1,b=!1;const a=()=>{if(v&&!b)try{v=!1,b=!0,_()}finally{(0,y.scheduleAtNextAnimationFrame)((0,y.getWindow)(this._referenceDomElement),()=>{b=!1,a()})}};this._resizeObserver=new ResizeObserver(i=>{i&&i[0]&&i[0].contentRect?p={width:i[0].contentRect.width,height:i[0].contentRect.height}:p=null,v=!0,a()})';
const monacoAfter='let b=!1;const a=()=>{if(!b){b=!0;const t=this._resizeObserver;(0,y.scheduleAtNextAnimationFrame)((0,y.getWindow)(this._referenceDomElement),()=>{b=!1;t===this._resizeObserver&&_()})}};this._resizeObserver=new ResizeObserver(i=>{i&&i[0]&&i[0].contentRect?p={width:i[0].contentRect.width,height:i[0].contentRect.height}:p=null,a()})';
export function monacoPhase(source) {
  assert.equal(sha256(source),'6902b6112c4235349088a6cb86e3d95cd9b3fab7710cc38f681f8af5c9ad99ae','exact published Monaco AMD build');
  return replaceOnce(source,monacoBefore,monacoAfter);
}

export function monacoCanonicalPhase(source) {
  let changed=replaceOnce(source,
    '\t\t\t// The first time the resize observer fires, we will react to it immediately.\n\t\t\t// Otherwise we will postpone to the next animation frame.',
    '\t\t\t// Always react in the next animation frame, outside observer delivery.\n\t\t\t// Coalesce notifications and retain the latest reported dimensions.');
  changed=replaceOnce(changed,`\t\t\tlet shouldObserve = false;
\t\t\tlet alreadyObservedThisAnimationFrame = false;

\t\t\tconst update = () => {
\t\t\t\tif (shouldObserve && !alreadyObservedThisAnimationFrame) {
\t\t\t\t\ttry {
\t\t\t\t\t\tshouldObserve = false;
\t\t\t\t\t\talreadyObservedThisAnimationFrame = true;
\t\t\t\t\t\tobserveNow();
\t\t\t\t\t} finally {
\t\t\t\t\t\tscheduleAtNextAnimationFrame(getWindow(this._referenceDomElement), () => {
\t\t\t\t\t\t\talreadyObservedThisAnimationFrame = false;
\t\t\t\t\t\t\tupdate();
\t\t\t\t\t\t});
\t\t\t\t\t}
\t\t\t\t}
\t\t\t};`, `\t\t\tlet scheduled = false;

\t\t\tconst update = () => {
\t\t\t\tif (!scheduled) {
\t\t\t\t\tscheduled = true;
\t\t\t\t\tconst observer = this._resizeObserver;
\t\t\t\t\tscheduleAtNextAnimationFrame(getWindow(this._referenceDomElement), () => {
\t\t\t\t\t\tscheduled = false;
\t\t\t\t\t\tif (observer === this._resizeObserver) observeNow();
\t\t\t\t\t});
\t\t\t\t}
\t\t\t};`);
  return replaceOnce(changed,'\t\t\t\tshouldObserve = true;\n\t\t\t\tupdate();','\t\t\t\tupdate();');
}
