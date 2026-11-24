import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

test('真实Timeline未加载场次不产生灰条，writer失败独立于质量提示', async () => {
  const server = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-archiveTimelinePresentation.test.mjs", root: fileURLToPath(new URL('../', import.meta.url)), configFile: false, server: {watch:null, middlewareMode: true, hmr: false }, optimizeDeps: {include:[], noDiscovery: true, entries: [] } });
  try {
    const { ReviewSessionTimeline } = await server.ssrLoadModule('/src/components/ReviewSessionTimeline.tsx');
    const props = { repository: { queryEvents: async () => ({ items: [], nextCursor: null, totalCount: 0 }) }, readingMemory: { get: () => null }, sessionId: 'a', onSpeakEvent() {}, onToggleFavorite() {} };
    const unloaded = renderToStaticMarkup(React.createElement(ReviewSessionTimeline, props));
    assert.ok(!unloaded.includes('没有获取到开播时间'));
    const failure = renderToStaticMarkup(React.createElement(ReviewSessionTimeline, { ...props, archiveWriterStatus: 'failed', session: { status: 'active', recordingStatus: 'recording', quality: 'in-progress', qualityReasons: [], identityEvidence: 'source-live-time', titleSource: 'bilibili' } }));
    assert.ok(failure.includes('保存失败，正在重试。'));
    assert.ok(!failure.includes('记录不完整'));
    const pending = renderToStaticMarkup(React.createElement(ReviewSessionTimeline, { ...props, archiveWriterStatus: 'pending' }));
    assert.ok(!pending.includes('记录不完整'));
  } finally { await server.close(); }
});
