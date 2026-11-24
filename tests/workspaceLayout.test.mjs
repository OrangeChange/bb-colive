import test from 'node:test';
import assert from 'node:assert/strict';
import { componentRuntime, findElement } from './helpers/componentRuntime.mjs';

test('主播摘要最近直播截断后仍提供完整日期悬停信息', () => {
  const fullDate = '2026-11-20 12:34:56';
  const runtime = componentRuntime('src/components/ReviewPanel.tsx', {
    '../archive/archiveState.ts': { createDefaultReviewOwnerState: () => ({}) },
    '../archive/archiveDisplay.ts': { formatArchiveDateTime: () => fullDate },
  }, ['OwnerSummary']);
  const tree = runtime.render('OwnerSummary', {owner: {latestSessionAt: 1}, sessions: []});
  const date = findElement(tree, node => node.props?.children === fullDate);
  assert.ok(date);
  assert.equal(date.props.title, fullDate);
});
