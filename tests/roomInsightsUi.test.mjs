import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let vite, view;
before(async () => {
  vite = await createServer({configFile:false,esbuild:{jsx:"automatic"},cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-roomInsightsUi.test.mjs",optimizeDeps:{noDiscovery:true,include:[]}, root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, hmr: false, watch: null }, logLevel: 'silent' });
  view = await vite.ssrLoadModule('/src/components/RoomInsightsView.tsx');
});
after(async () => { await vite?.close(); });

test('零贡献用户保留在列表但不显示数字名次，大航海零分仍显示正常名次', () => {
  const user = { uid: '55', name: '零贡献用户', rank: 55, score: 0, accompany: 30 };
  const render = (kind, overrides = {}) => renderToStaticMarkup(React.createElement(view.RankUserRow, { user: { ...user, ...overrides }, kind }));
  const zero = render('contribution');
  assert.match(zero, /aria-label="未排名">—</);
  assert.match(zero, /零贡献用户/);
  assert.match(zero, />0</);
  assert.match(render('contribution', { score: 1 }), /aria-label="第55名">55</);
  assert.match(render('guard'), /aria-label="第55名">55</);
  assert.match(render('contribution', { rank: 0, score: undefined }), /aria-label="未排名">—</);
});

test('底栏缺失与零值有区别，观众/看过/点赞/粉丝团/大航海/时长都可读取', () => {
  assert.equal(typeof view.OverviewMetrics, 'function');
  const html = renderToStaticMarkup(React.createElement(view.OverviewMetrics, { viewers: '0', watched: 0, likes: undefined, fansClub: 1375, medalName: '符导员', guards: 162, duration: '01:01:01' }));
  for (const text of ['观众', '看过', '点赞', '符导员', '大航海', '01:01:01', '1,375', '162', '—']) assert.ok(html.includes(text), text);
  assert.match(html, /ui-type-overview-value/);
  assert.match(html, />0</);
});

test('贡献榜只显示贡献值，大航海显示陪伴天数，身份不倒置', () => {
  assert.equal(typeof view.RankList, 'function');
  const users = [{uid: '1', name: '带身份的用户', rank: 1, score: 12, accompany: 306, guardLevel: 1, medal: {name:'符导员',level:41}}];
  const contribution = renderToStaticMarkup(React.createElement(view.RankList, {users, kind: 'contribution'}));
  assert.ok(contribution.includes('总督'));
  assert.ok(contribution.includes('12'));
  assert.ok(!contribution.includes('306'));
  assert.ok(!contribution.includes('¥'));
  const guard = renderToStaticMarkup(React.createElement(view.RankList, {users, kind: 'guard'}));
  assert.ok(guard.includes('306'));
  assert.ok(guard.includes('天'));
  assert.ok(!guard.includes('贡献值'));
});

test('榜单用户名提供按用户筛选入口，其他榜单信息不变成筛选按钮', () => {
  const user = { uid: '55', name: '可筛选用户', rank: 1, score: 12, accompany: 30 };
  const html = renderToStaticMarkup(React.createElement(view.RankUserRow, {
    user,
    kind: 'contribution',
    onUserFilter: () => {},
  }));
  assert.match(html, /<button[^>]+aria-label="筛选用户：可筛选用户"[^>]*>可筛选用户<\/button>/);
  assert.equal((html.match(/aria-label="筛选用户：/g) ?? []).length, 1);
  const source = readFile(new URL('../src/components/RoomInsightsView.tsx', import.meta.url), 'utf8');
  return source.then(text => assert.match(text, /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/));
});

test('观众榜和大航海榜复用主窗口的粉丝牌组件', async () => {
  const source = await readFile(new URL('../src/components/RoomInsightsView.tsx', import.meta.url), 'utf8');
  assert.match(source, /import\s+\{\s*FanMedalBadge\s*\}\s+from\s+['"]\.\/FanMedalBadge['"]/);
  assert.match(source, /<FanMedalBadge\s+medal=\{user\.medal\}\s*\/>/);
  assert.doesNotMatch(source, /user\.medal\s*&&\s*<span[^>]*rounded bg-raised px-1 text-t2/);
});
