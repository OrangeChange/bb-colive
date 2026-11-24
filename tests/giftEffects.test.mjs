import test from "node:test";
import assert from "node:assert/strict";

let giftEffects;
try {
  giftEffects = await import("../src/protocol/giftEffects.ts");
} catch {
  giftEffects = null;
}

test("只接受 effect=2 且 effect_id、gift_id、Web 资源全部匹配的特效", () => {
  assert.ok(giftEffects, "giftEffects 模块应存在");
  const resources = giftEffects.parseGiftEffectResources({
    full_sc_resource: { conf_list: [
      { id: 5762, bind_gift_ids: [35600], plan_platform: [2], web_mp4: "gift.mp4", web_mp4_json: "gift.json" },
      { id: 5762, bind_gift_ids: [999], plan_platform: [2], web_mp4: "wrong.mp4", web_mp4_json: "wrong.json" },
    ] },
  });

  assert.equal(
    giftEffects.resolveGiftEffect(resources, { id: 35600, effect: 2, effectId: 5762 })?.webMp4,
    "gift.mp4",
  );
  assert.equal(
    giftEffects.resolveGiftEffect(resources, { id: 35600, effect: 0, effectId: 5762 }),
    null,
  );
});

test("缺少独立 MP4/JSON 或非 Web 平台时不产生可播放资源", () => {
  assert.ok(giftEffects, "giftEffects 模块应存在");
  const resources = giftEffects.parseGiftEffectResources({ full_sc_resource: { conf_list: [
    { id: 1, bind_gift_ids: [2], plan_platform: [1], web_mp4: "", web_mp4_json: "" },
  ] } });

  assert.deepEqual(resources, []);
});

const gift = { id: 35600, effect: 2, effectId: 5762 };
const config = (room) => ({ full_sc_resource: { conf_list: [
  { id: 5762, bind_gift_ids: [35600], plan_platform: [2], web_mp4: `${room}.mp4`, web_mp4_json: `${room}.json` },
] } });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const loader = (request) => giftEffects.createGiftEffectLoader({ getGiftEffectConfig: request });

test("同房间成功索引缓存且 A→B→A 恢复各自资源", async () => {
  const calls = [];
  const effects = loader(async (room, cookie) => { calls.push([room, cookie]); return config(room); });
  await effects.loadGiftEffectResources(1, "test-cookie");
  assert.equal(effects.getGiftEffect(gift)?.webMp4, "1.mp4");
  await effects.loadGiftEffectResources(1);
  await effects.loadGiftEffectResources(2);
  assert.equal(effects.getGiftEffect(gift)?.webMp4, "2.mp4");
  await effects.loadGiftEffectResources(1);
  assert.equal(effects.getGiftEffect(gift)?.webMp4, "1.mp4");
  assert.deepEqual(calls, [[1, "test-cookie"], [2, undefined]]);
});

test("同房间在途请求复用且切回等待中的 A 不重复请求", async () => {
  const pending = deferred();
  const calls = [];
  const effects = loader((room) => { calls.push(room); return room === 1 ? pending.promise : Promise.resolve(config(room)); });
  const first = effects.loadGiftEffectResources(1);
  assert.equal(effects.loadGiftEffectResources(1), first);
  await effects.loadGiftEffectResources(2);
  assert.equal(effects.loadGiftEffectResources(1), first);
  assert.equal(effects.getGiftEffect(gift), null);
  pending.resolve(config(1));
  await first;
  assert.equal(effects.getGiftEffect(gift)?.webMp4Json, "1.json");
  assert.deepEqual(calls, [1, 2]);
});

test("并行输出按事件房间查询特效索引", async () => {
  const effects = loader(async room => config(room));
  await effects.loadGiftEffectResources(1);
  await effects.loadGiftEffectResources(2);
  assert.equal(effects.getGiftEffect(gift, 1)?.webMp4, "1.mp4");
  assert.equal(effects.getGiftEffect(gift, 2)?.webMp4, "2.mp4");
  assert.equal(effects.getGiftEffect(gift, 3), null);
});

test("首次加载失败不记成功，同房间再次连接可重试", async () => {
  let attempts = 0;
  const effects = loader(async () => {
    if (++attempts === 1) throw new Error("resource unavailable");
    return config(1);
  });
  await effects.loadGiftEffectResources(1);
  assert.equal(effects.getGiftEffect(gift), null);
  await effects.loadGiftEffectResources(1);
  assert.equal(effects.getGiftEffect(gift)?.webMp4, "1.mp4");
  assert.equal(attempts, 2);
});

test("慢 A 晚于 B 完成只缓存 A，不覆盖当前 B，切回 A 无需重取", async () => {
  const pending = deferred();
  const calls = [];
  const effects = loader((room) => { calls.push(room); return room === 1 ? pending.promise : Promise.resolve(config(room)); });
  const slowA = effects.loadGiftEffectResources(1);
  await effects.loadGiftEffectResources(2);
  pending.resolve(config(1));
  await slowA;
  assert.equal(effects.getGiftEffect(gift)?.webMp4, "2.mp4");
  await effects.loadGiftEffectResources(1);
  assert.equal(effects.getGiftEffect(gift)?.webMp4, "1.mp4");
  assert.deepEqual(calls, [1, 2]);
});

test("旧房间迟到失败不清当前房间索引，切回旧房间仍可重试", async () => {
  const pending = deferred();
  let attempts = 0;
  const effects = loader((room) => room === 1 && ++attempts === 1 ? pending.promise : Promise.resolve(config(room)));
  const slowA = effects.loadGiftEffectResources(1);
  await effects.loadGiftEffectResources(2);
  pending.reject(new Error("resource unavailable"));
  await slowA;
  assert.equal(effects.getGiftEffect(gift)?.webMp4, "2.mp4");
  await effects.loadGiftEffectResources(1);
  assert.equal(effects.getGiftEffect(gift)?.webMp4, "1.mp4");
});
