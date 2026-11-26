import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
test('三个兼容宿主使用共享 transition，移除旧进出装饰', () => {
  for (const path of ['vendor/blivechat/host/entry.js', 'src/compat/openlive/runtime/entry.mjs', 'src/compat/laplace/renderer/frame.tsx']) {
    const source = read(path);
    assert.match(source, /import\s*\{[^}]*EVENT_TRANSITION_CSS[^}]*applyEventTransition[^}]*\}\s*from\s*['"][^'"]*eventTransitions\.mjs/);
    assert.match(source, /applyEventTransition\((node|row),[^;]*(presentation|message)\.animation,/);
    assert.doesNotMatch(source, /@keyframes host-|transition-property:opacity,transform|dataset\.hostEnter\s*=|dataset\.hostRemoving\s*=|dataset\.hostAnimation\s*=/);
  }
  assert.match(read('src/components/EventList.tsx'), /animation=\{\{[^}]*preset:\s*displayPreferences\?\.eventAnimationPreset/);
});
