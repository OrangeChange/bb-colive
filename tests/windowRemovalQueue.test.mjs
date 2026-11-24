import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

test('退出计时结束不覆盖尚未提交的新事件', () => {
  const source = readFileSync(new URL('../src/windows/FloatingEventWindow.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('  const scheduleEventRemoval =');
  const end = source.indexOf('  const enqueueGeometrySave', start);
  const body = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const old = { id: 'old' }, incoming = { id: 'incoming' };
  const eventsRef = { current: [old] };
  const queued = [], timers = [];
  const schedule = new Function('removingEventsRef', 'setRemovingEvents', 'removalTimersRef', 'eventsRef', 'receivedAtRef', 'setEvents', 'setTimeout', 'getEventAnimationExitDuration', 'windowPreferencesRef', `${body};return scheduleEventRemoval;`)(
    { current: new Set() }, () => {}, { current: new Map() }, eventsRef, { current: new WeakMap() },
    update => queued.push(update), callback => { timers.push(callback); return timers.length; }, () => 200,
    { current: { display: { eventAnimationPreset: 'fade', eventAnimationDurationMs: 200 } } },
  );
  schedule(old);
  queued.push(current => [...current, incoming]);
  timers[0]();
  const result = queued.reduce((current, update) => typeof update === 'function' ? update(current) : update, [old]);
  assert.deepEqual(result, [incoming]);
  assert.deepEqual(eventsRef.current, [incoming]);
});
