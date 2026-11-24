import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { getOriginalSamples, originalSimulationCandidates, generateOriginalSimulationEvent } from '../src/compat/laplace/renderer/samples.ts';
import { pickLaplaceRendererEvent } from '../src/compat/laplace/renderer/bridge.ts';
import { setLaplaceEventMedia, resolveLaplaceEventMedia } from '../src/compat/laplace/renderer/eventMedia.ts';

const original = JSON.parse(readFileSync('src/compat/laplace/renderer/sample-data.json', 'utf8'));
const officialAvatars = JSON.parse(readFileSync('src/preview/laplace-preview-source-avatars.json', 'utf8'));
const userMedia = JSON.parse(readFileSync('src/preview/previewUserMedia.json', 'utf8'));
const userAvatar = uid => userMedia[String(uid)]?.sourceUrl ? userMedia[String(uid)].avatar : '/media/laplace-preview/avatars/official-default.jpg';
const excluded = new Set(['notice', 'mvp', 'entry-effect', 'superchat-delete']);
function facts(event) {
  const clone = structuredClone(event);
  delete clone.avatar;
  delete clone.giftIcon;
  for (const user of [clone.reply, clone.receiver, ...(clone.list ?? []).filter(user => !Array.isArray(user))]) {
    if (user) { delete user.avatar; delete user.face; }
  }
  return clone;
}

for (const mode of ['static', 'design']) test(`${mode} 保留官方顺序、文案、时间及全部非媒体字段`, () => {
  const expected = original[mode].filter(event => !excluded.has(event.type)).map(pickLaplaceRendererEvent);
  const actual = getOriginalSamples(mode);
  assert.deepEqual(actual.map(event => event.id), expected.map(event => event.id));
  assert.deepEqual(actual.map(facts), expected.map(facts));
  for (const event of actual) {
    const source = expected.find(sample => sample.id === event.id);
    if (Number(event.uid) > 0 || source.avatar) assert.equal(event.avatar, officialAvatars[source.avatar] ?? (source.avatar || userAvatar(event.uid)));
    if (event.avatar?.startsWith('/media/')) assert.ok(existsSync('public' + event.avatar), event.avatar);
  }
});

test('官方明确指定的头像优先于 UID 资料，不统一同一用户的示例图片', () => {
  const samples = getOriginalSamples('static');
  const avatars = new Set();
  for (const mode of ['static', 'design']) for (const source of original[mode].filter(event => event.uid === 401742377)) {
      const sample = getOriginalSamples(mode).find(event => event.id === source.id);
      if (!sample) continue;
      assert.equal(sample.avatar, officialAvatars[source.avatar] ?? (source.avatar || userAvatar(source.uid)));
      avatars.add(sample.avatar);
    }
  assert.ok(avatars.size > 1);
  const source = original.static.find(event => event.uid === 2763 && event.avatar);
  assert.equal(samples.find(event => event.id === source.id).avatar, '/media/laplace-preview/avatars/source-1.jpg');
});

test('中奖名单保留官方元组，未指定头像复用对应用户的已获取图片', () => {
  const samples = getOriginalSamples('static');
  setLaplaceEventMedia(samples, true);
  try {
    for (const event of samples.filter(event => event.type === 'red-envelope-result')) {
      assert.deepEqual(event.list, original.static.find(sample => sample.id === event.id).list);
      for (const winner of event.list) assert.equal(resolveLaplaceEventMedia(`https://workers.laplace.cn/bilibili/avatar/${winner[0]}`), userAvatar(winner[0]));
    }
  } finally { setLaplaceEventMedia([], false); }
});

test('动态沿用同一官方候选，只替换实例 ID 和生成时间', () => {
  const types = new Set(original.static.map(event => event.type));
  const candidates = originalSimulationCandidates(types);
  assert.deepEqual(candidates, getOriginalSamples('static'));
  assert.ok(candidates.every(event => !excluded.has(event.type)));
  const event = generateOriginalSimulationEvent({ enabledTypes: new Set(['superchat']) }, { random: () => 0, now: () => 1800000000000 });
  const source = candidates.find(sample => sample.type === 'superchat');
  assert.deepEqual(event, { ...source, id: event.id, timestamp: 1800000000000, timestampNormalized: 1800000000000 });
});

test('礼物使用软件获取的图片缓存，未命中时保留历史图片或缺图占位', () => {
  const images = JSON.parse(readFileSync('src/preview/laplace-preview-gifts.json', 'utf8'));
  for (const mode of ['static', 'design']) for (const event of getOriginalSamples(mode).filter(event => event.type === 'gift')) {
    const media = images[String(event.giftId)];
    assert.ok(media, `gift ${event.giftId}`);
    assert.equal(event.giftIcon, media.image);
    assert.ok(existsSync('public' + media.image), media.image);
  }
  assert.equal(images['31036'].source, 'giftConfig');
  assert.equal(images['34762'].source, 'captured');
  assert.equal(images['30004'].source, 'unavailable');
  assert.equal(images['32762'].source, 'unavailable');
});
