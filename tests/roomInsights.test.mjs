import test from 'node:test';
import assert from 'node:assert/strict';
import * as insights from '../src/protocol/roomInsights.ts';
import { guardIdentityIconsFromEvents } from '../src/protocol/guardIdentityIcons.ts';

const user = (uid, rank, days = 10) => ({
  rank, accompany: days, score: 0,
  uinfo: { uid, base: { name: `用户${uid}`, face: '' }, guard: { level: 3 },
    medal: { name: '符导员', level: 24, color_start: 1725515, color_end: 5414290 } },
});

test('概览请求仅在真实房间已连接且有登录态时允许', () => {
  for (const status of ['idle', 'connecting', 'reconnecting', 'closed', 'error']) {
    assert.equal(insights.canUpdateInsights(status, 6431492, 'cookie'), false);
  }
  assert.equal(insights.canUpdateInsights('connected', 6431492, 'cookie'), true);
  assert.equal(insights.canUpdateInsights('connected', undefined, 'cookie'), false);
  assert.equal(insights.canUpdateInsights('connected', 6431492, undefined), false);
});

test('断开后时长使用该房间的最后观测时刻，无观测记录不显示时长', () => {
  assert.equal(insights.insightsDuration(1000, undefined, undefined), '—');
  assert.equal(insights.insightsDuration(1000, undefined, 61000), '00:01:00');
  assert.equal(insights.insightsDuration(1000, 31000, 61000), '00:00:30');
});

test('概览取粉丝团与新版榜单人数，绝不拿人气或总粉丝替代', () => {
  assert.equal(typeof insights.normalizeOverview, 'function');
  const result = insights.normalizeOverview({
    room_info: { room_id: 6431492, uid: 2109776, title: '打33的来', area_name: '虚拟Gamer', live_status: 1, live_start_time: 100, online: 83523 },
    anchor_info: { base_info: { uname: '符瑶koritsu', face: '' }, medal_info: { medal_name: '符导员', fansclub: 1375 } },
    watched_show: { num: 0 }, like_info_v3: { total_likes: 0 }, guard_info: { count: 162 },
    room_rank_info: { user_rank_entry: { user_contribution_rank_entry: { count: 465, count_text: '465', item: [] } } },
  });
  assert.equal(result.viewers, 465);
  assert.equal(result.viewerText, '465');
  assert.equal(result.fansClub, 1375);
  assert.equal(result.watched, 0);
  assert.equal(result.likes, 0);
  assert.equal(result.startedAt, 100000);
  assert.equal(insights.normalizeOverview({ room_info: { room_id: 1, uid: 2, online: 999 } }).viewers, undefined);
});

test('贡献榜保留零贡献用户与服务端顺序，不把榜单总人数当作名单长度', () => {
  assert.equal(typeof insights.normalizeContribution, 'function');
  const result = insights.normalizeContribution({ count: 397, count_text: '397', item: [user(7, 2), user(8, 1)], list_end_prompt: '最多展示100名观众' });
  assert.deepEqual(result.users.map(u => [u.uid, u.rank, u.score]), [['7', 2, 0], ['8', 1, 0]]);
  assert.equal(result.total, 397);
  assert.equal(result.users[0].guardLevel, 3);
  assert.deepEqual(insights.normalizeContribution({ count: 0, item: null }).users, []);
});

test('榜单仅在大航海图标的粉丝牌主播 UID 与当前房间主播一致时保留 URL', () => {
  const iconUrl = 'https://i0.hdslb.com/bfs/live/room-captain.png';
  const matching = user(7, 1);
  matching.uinfo.medal = { ...matching.uinfo.medal, ruid: '100', guard_icon: iconUrl };
  const foreign = user(8, 2);
  foreign.uinfo.medal = { ...foreign.uinfo.medal, ruid: '200', guard_icon: iconUrl };

  const page = insights.normalizeGuardPage({ info: { page: 1, now: 1 }, list: [matching, foreign] }, '100');
  assert.equal(page.users[0].guardIconUrl, iconUrl);
  assert.equal(page.users[1].guardIconUrl, undefined);
});

test('榜单可复用同房间同用户事件中实际观测到的图标 URL，且接口原图优先', () => {
  assert.equal(typeof insights.applyObservedGuardIcons, 'function');
  const users = [
    { uid: '7', name: '接口缺图', rank: 1, guardLevel: 3 },
    { uid: '8', name: '接口有图', rank: 2, guardLevel: 1, guardIconUrl: 'https://example.com/rank.png' },
    { uid: '9', name: '其他用户', rank: 3, guardLevel: 2 },
  ];
  const events = [
    { roomId: 100, user: { uid: '7', guardLevel: 1, guardIconUrl: 'https://example.com/user-7.png' } },
    { roomId: 100, user: { uid: '8', guardLevel: 1, guardIconUrl: 'https://example.com/user-8.png' } },
    { roomId: 200, user: { uid: '9', guardLevel: 2, guardIconUrl: 'https://example.com/other-room.png' } },
    { roomId: 100, user: { uid: '9', guardLevel: 0, guardIconUrl: 'https://example.com/not-a-guard.png' } },
  ];

  const observed = guardIdentityIconsFromEvents(events, 100);
  const result = insights.applyObservedGuardIcons(users, observed);
  assert.deepEqual(result.map(user => user.guardIconUrl), [
    'https://example.com/user-7.png',
    'https://example.com/rank.png',
    undefined,
  ]);
  assert.equal(users[0].guardIconUrl, undefined);
  assert.equal(observed.get('9'), undefined);
});

test('大航海多页只合并一次前三，保留服务端顺序和原始名次', () => {
  assert.equal(typeof insights.mergeGuardPages, 'function');
  const top3 = [user(1, 1, 306), user(2, 2, 1937), user(3, 3, 1525)];
  const pages = [
    insights.normalizeGuardPage({ info: { num: 5, page: 2, now: 1 }, top3, list: [user(4, 4)] }),
    insights.normalizeGuardPage({ info: { num: 5, page: 2, now: 2 }, top3, list: [user(5, 5)] }),
  ];
  assert.deepEqual(insights.mergeGuardPages(pages).map(u => [u.uid, u.accompany, u.rank]), [
    ['1', 306, 1], ['2', 1937, 2], ['3', 1525, 3], ['4', 10, 4], ['5', 10, 5],
  ]);
  assert.equal(pages[0].nextPage, 2);
  assert.equal(pages[1].nextPage, undefined);
  assert.equal(insights.normalizeGuardPage({ info: { num: 0, page: 0, now: 1 }, top3: null, list: null }).nextPage, undefined);
});

test('亲密度和陪伴天数使用不同服务端排序，同天数保留服务端名次', () => {
  assert.equal(insights.guardSortType('intimacy'), '0');
  assert.equal(insights.guardSortType('accompany'), '1');
  const first = insights.normalizeGuardPage({ info: { page: 2, now: 1 }, top3: [user(8, 1, 30)], list: [user(5, 2, 30)] });
  const second = insights.normalizeGuardPage({ info: { page: 2, now: 2 }, top3: [user(8, 1, 30)], list: [user(4, 3, 20)] });
  assert.deepEqual(insights.mergeGuardPages([first, second]).map(u => [u.uid, u.rank]), [['8', 1], ['5', 2], ['4', 3]]);
  assert.equal(first.top3[0].rank, 1);
});

test('开播时长以场次计时，下播冻结；未知开播时间不伪造', () => {
  assert.equal(typeof insights.formatLiveDuration, 'function');
  assert.equal(insights.formatLiveDuration(100000, undefined, 3761000), '01:01:01');
  assert.equal(insights.formatLiveDuration(100000, 160000, 9999999), '00:01:00');
  assert.equal(insights.formatLiveDuration(undefined, undefined, 9999999), '—');
  assert.equal(insights.formatLiveDuration(200000, 160000, 260000), '00:01:00');
});

test('观众显示选择较新的快照，不跨新旧榜兜底且保留平台文本', () => {
  assert.equal(typeof insights.resolveViewers, 'function');
  const overview = { viewers: 465, viewerText: '465', newRank: true };
  assert.deepEqual(insights.resolveViewers(overview, 100, { online: 12345, onlineText: '1.2万', onlineUpdatedAt: 200 }), { value: 12345, text: '1.2万' });
  assert.deepEqual(insights.resolveViewers(overview, 300, { online: 12345, onlineUpdatedAt: 200 }), { value: 465, text: '465' });
  assert.deepEqual(insights.resolveViewers(overview, 100, { rankCount: 7, rankCountUpdatedAt: 200 }), { value: 465, text: '465' });
  assert.deepEqual(insights.resolveViewers(overview, 100, { online: 0, onlineText: '0', onlineUpdatedAt: 200 }), { value: 0, text: '0' });
});

test('新旧在线计数分开记录，缺失字段不会把快照擦成undefined', () => {
  assert.equal(typeof insights.onlineRankStats, 'function');
  assert.deepEqual(insights.onlineRankStats({ count: 88, online_count: 98, count_text: '88', online_count_text: '98' }, 500),
    { rankCount: 88, rankCountText: '88', rankCountUpdatedAt: 500, online: 98, onlineText: '98', onlineUpdatedAt: 500 });
  assert.deepEqual(insights.onlineRankStats({ count: 0 }, 600), { rankCount: 0, rankCountText: undefined, rankCountUpdatedAt: 600 });
});

test('未知结束时间不伪造下播时长，新的开播不沿用旧结束时刻', () => {
  assert.equal(typeof insights.resolveLiveTiming, 'function');
  assert.deepEqual(insights.resolveLiveTiming({ startedAt: 100, liveStatus: 0 }, {}), { startedAt: undefined, endedAt: undefined });
  assert.deepEqual(insights.resolveLiveTiming({ startedAt: 100, liveStatus: 1 }, { liveEndedAt: 200 }), { startedAt: 100, endedAt: 200 });
  assert.deepEqual(insights.resolveLiveTiming({ startedAt: 300, liveStatus: 1 }, { liveStartedAt: 100, liveEndedAt: 200 }), { startedAt: 300, endedAt: undefined });
  assert.deepEqual(insights.resolveLiveTiming({ startedAt: 100, liveStatus: 0 }, { liveStartedAt: 100 }), { startedAt: undefined, endedAt: undefined });
});

test('贡献榜的延迟关闭不能关掉随后打开的大航海榜', () => {
  assert.equal(typeof insights.dismissRank, 'function');
  assert.equal(insights.dismissRank('guard', 'contribution'), 'guard');
  assert.equal(insights.dismissRank('guard', 'guard'), null);
});

test('重连后的新HTTP快照替换旧统计，之后的WS推送仍可更新且保留零值', () => {
  assert.equal(typeof insights.resolveMetric, 'function');
  assert.equal(insights.resolveMetric(200, 300, 100, 200), 200);
  assert.equal(insights.resolveMetric(200, 300, 0, 400), 0);
  assert.equal(insights.resolveMetric(undefined, 300, 100, 200), 100);
  assert.equal(insights.resolveMetric(200, 300, undefined, 400), 200);
});
