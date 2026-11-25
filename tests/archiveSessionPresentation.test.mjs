import { readUiSource } from "./helpers/readUiSource.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import { componentRuntime, findElement } from './helpers/componentRuntime.mjs';
import * as display from '../src/archive/archiveDisplay.ts';
import * as quality from '../src/archive/archiveQuality.ts';
import * as state from '../src/archive/archiveSessionState.ts';
import * as archiveState from '../src/archive/archiveState.ts';
import { dismissArchiveNotice, loadDismissedArchiveNotices } from '../src/archive/archiveNoticeState.ts';
import { createReviewTimelineEntries } from '../src/archive/reviewTimelineEntries.ts';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const session = (patch = {}) => ({ sessionId: 'a', roomId: 101, ownerId: 'room:101', title: '测试直播', status: 'active', recordingStatus: 'recording', quality: 'in-progress', qualityReasons: [], stopReason: null, titleSource: 'bilibili', identityEvidence: 'source-live-time', startedAt: 1000, durationMs: null, ...patch });

test('三个维度分别使用直播、记录和质量文案', () => {
  assert.equal(display.formatArchiveSessionStatus?.('unclean'), '状态未知');
  assert.equal(display.formatArchiveRecordingStatus?.('reconnecting'), '重连中');
  assert.equal(display.formatArchiveQuality?.('in-progress'), '待确认');
});

test('恢复只保留合并的缺口提示，停止说明撤销，标题可独立叠加', () => {
  const notices = quality.getArchiveRecordNotices(session({ quality: 'incomplete', qualityReasons: ['connection-switched', 'live-start-not-captured'], titleSource: 'time' }));
  assert.equal(notices.filter(n => n.kind === 'quality').length, 1);
  assert.match(notices.find(n => n.kind === 'quality').message, /直播已经开始.*已恢复记录/);
  assert.ok(notices.some(n => n.code === 'title-fallback'));
  assert.ok(!notices.some(n => /到切换为止|已停止记录/.test(n.message)));
});

test('未知开播时间仅灰色说明，旧原因不直接认作新模型缺口', () => {
  const notices = quality.getArchiveRecordNotices(session({ qualityReason: 'connection-error', identityEvidence: 'unavailable' }));
  assert.deepEqual(notices.map(n => [n.code, n.tone]), [['identity-unavailable', 'info']]);
});

test('尚未提供场次身份信息时不推断身份缺失', () => {
  assert.deepEqual(quality.getArchiveRecordNotices({}), []);
});

test('停止未确认结束为灰色，重连不增加同义提示条', () => {
  const stopped = quality.getArchiveRecordNotices(session({ status: 'unclean', recordingStatus: 'stopped', stopReason: 'app-exit' }));
  assert.ok(stopped.some(n => n.tone === 'info' && n.message === '已停止记录，未确认直播是否结束。'));
  assert.deepEqual(quality.getArchiveRecordNotices(session({ status: 'unclean', recordingStatus: 'reconnecting' })), []);
});

test('stage2有效直播中断原因使用黄色，历史证据不足不使用黄色', () => {
  for (const reason of ['connection-closed', 'app-exit', 'connection-error', 'manual-disconnect', 'connection-switched', 'disconnect-before-end', 'recovered-after-interruption']) {
    const notices = quality.getArchiveRecordNotices(session({ quality: 'incomplete', qualityReasons: [reason] }));
    assert.equal(notices.filter(n => n.tone === 'warning').length, 1, reason);
    assert.match(notices[0].message, /已恢复记录/);
  }
  assert.equal(quality.getArchiveRecordNotices(session({ quality: 'in-progress', qualityReasons: ['previous-runtime', 'start-time-unknown'] })).filter(n => n.tone === 'warning').length, 0);
});

test('关闭按场次与原因集合稳定保存，独立提示与新原因仍显示', () => {
  const values = new Map();
  const storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
  const first = quality.getArchiveRecordNotices(session({ quality: 'incomplete', qualityReasons: ['connection-switched', 'connection-error'], titleSource: 'time' }));
  assert.ok(first.some(n => n.kind === 'quality'));
  dismissArchiveNotice('a', first.find(n => n.kind === 'quality').code, storage);
  const hidden = loadDismissedArchiveNotices('a', storage);
  const reordered = quality.getArchiveRecordNotices(session({ quality: 'incomplete', qualityReasons: ['connection-error', 'connection-switched', 'connection-error'], titleSource: 'time' }));
  assert.deepEqual(reordered.filter(n => !hidden.includes(n.code)).map(n => n.code), ['title-fallback']);
  const changed = quality.getArchiveRecordNotices(session({ quality: 'incomplete', qualityReasons: ['connection-switched', 'connection-error', 'app-exit'] }));
  assert.equal(changed.filter(n => !hidden.includes(n.code)).length, 1);
  assert.deepEqual(loadDismissedArchiveNotices('b', storage), []);
});

test('真实场次筛选组件分开发出结束与未知查询，并提供待确认质量', () => {
  let patch;
  const runtime = componentRuntime('src/components/ReviewOwnerSessionFilters.tsx', { '../archive/archiveState.ts': archiveState, '../archive/archiveDisplay.ts': display });
  const tree = runtime.render('ReviewOwnerSessionFilters', { query: { title: '', sort: 'startedAt', direction: 'desc' }, onChange: p => patch = p, onClear() {}, collapsed: false, onCollapsedChange() {} });
  const select = findElement(tree, n => n.props?.ariaLabel === '直播状态');
  select.props.onValueChange('ended');
  assert.deepEqual(patch.status, ['ended']);
  select.props.onValueChange('unclean');
  assert.deepEqual(patch.status, ['unclean']);
  const qualitySelect = findElement(tree, n => n.props?.ariaLabel === '记录质量');
  assert.ok(qualitySelect);
  assert.ok(qualitySelect.props.options.some(o => o.value === 'in-progress' && o.label === '待确认'));
});

test('真实列表选择保护记录与重连，停止未知可以选中', () => {
  const runtime = componentRuntime('src/components/ReviewOwnerList.tsx', { '../archive/archiveQuality.ts': quality, '../archive/archiveDisplay.ts': display, '../archive/archiveSessionState.ts': state, '../generalSettings.ts': { useGeneralSettings: fn => fn({ reviewPinnedOwnerRoomIds: [], setReviewOwnerPinned() {} }) } }, ['SessionRow']);
  for (const [recordingStatus, disabled] of [['recording', true], ['reconnecting', true], ['stopped', false]]) {
    const tree = runtime.render('SessionRow', { session: session({ status: 'unclean', recordingStatus }), onOpen() {}, selected: false, onToggle() {} });
    assert.equal(findElement(tree, n => n.type === 'checkbox').props.disabled, disabled);
    assert.equal(findElement(tree, n => n.props?.['data-review-session-quality']).props.children, '待确认');
    assert.equal(findElement(tree, n => n.props?.['data-review-session-status']).props.children, '状态未知');
  }
});

test('历史边界携带三维状态和全部原因', () => {
  const entries = createReviewTimelineEntries([{ eventKey: 'event', sessionId: 'a', record: { sessionStatus: 'unclean', sessionRecordingStatus: 'reconnecting', sessionQuality: 'incomplete', sessionQualityReason: 'previous-runtime', sessionStopReason: 'connection-error', sessionQualityReasons: ['connection-error', 'app-exit'] } }], true, new Set());
  assert.equal(entries[0].status, 'unclean');
  assert.equal(entries[0].recordingStatus, 'reconnecting');
  assert.equal(entries[0].stopReason, 'connection-error');
  assert.deepEqual(entries[0].qualityReasons, ['connection-error', 'app-exit']);
});

test('真实档案管理禁止预览删除重连场次，停止场次可以预览', () => {
  const runtimeFor = recordingStatus => componentRuntime('src/components/ReviewArchiveManagement.tsx', {
    '../archive/archiveTransfer.ts': { ArchiveTransferService: class {} },
    '../archive/archiveDisplay.ts': display,
    '../archive/archiveSessionState.ts': state,
    '../generalSettings.ts': { useGeneralSettings: Object.assign(fn => fn({ reviewOwnerRetentionDays: {}, setReviewOwnerRetentionDays() {} }), { getState: () => ({ reviewOwnerRetentionDays: {}, setReviewOwnerRetentionDays() {} }) }) },
  });
  for (const [recordingStatus, disabled] of [['reconnecting', true], ['recording', true], ['stopped', false]]) {
    const runtime = runtimeFor(recordingStatus);
    const tree = runtime.render('ReviewArchiveManagement', { repository: {}, owner: null, ownerId: 'room:101', sessions: [session({ status: 'unclean', recordingStatus })], onChanged() {} });
    const button = findElement(tree, n => n.type === 'button' && n.props.children === '预览删除');
    assert.equal(button.props.disabled, disabled);
  }
});

test('Panel全选和单选保护重连，场次恢复后移除旧删除选择', () => {
  const source = ts.createSourceFile('ReviewPanel.tsx', readUiSource(new URL('../src/components/ReviewPanel.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const callbacks = {};
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ['toggleSessionSelection', 'toggleAllSessionSelection'].includes(node.name.getText(source))) callbacks[node.name.getText(source)] = node.initializer.arguments[0].getText(source);
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect' && node.arguments[0].getText(source).includes('const available = new Set(sessions')) callbacks.prune = node.arguments[0].getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  let selected = ['a', 'b'];
  const bindings = { sessions: [session({ recordingStatus: 'reconnecting' }), session({ sessionId: 'b', status: 'unclean', recordingStatus: 'stopped' })], route: { level: 'owner' }, isArchiveSessionRecording: state.isArchiveSessionRecording, setSelectedSessionIds: fn => selected = typeof fn === 'function' ? fn(selected) : fn, clearBatchSelection: () => selected = [] };
  const callback = name => new Function(...Object.keys(bindings), ts.transpile(`return (${callbacks[name]});`, { target: ts.ScriptTarget.ES2022 }))(...Object.values(bindings));
  callback('prune')();
  assert.deepEqual(selected, ['b']);
  callback('toggleSessionSelection')('a', true);
  assert.deepEqual(selected, ['b']);
  callback('toggleAllSessionSelection')(true);
  assert.deepEqual(selected, ['b']);
});

test('历史边界tooltip使用规范化中文提示，不展示旧原因编码', () => {
  const runtime = componentRuntime('src/components/ReviewSessionTimeline.tsx', { '../archive/archiveQuality.ts': quality, '../archive/archiveDisplay.ts': display }, ['boundaryNoticeLabel']);
  const text = runtime.render('boundaryNoticeLabel', { kind: 'boundary', quality: 'incomplete', status: 'active', recordingStatus: 'recording', qualityReasons: ['app-exit', 'connection-closed'], qualityReason: 'previous-runtime', stopReason: null });
  assert.match(text, /记录曾中断，已恢复记录/);
  assert.ok(!/app-exit|connection-closed|previous-runtime/.test(text));
});
