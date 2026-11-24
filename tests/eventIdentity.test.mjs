import test from "node:test";
import assert from "node:assert/strict";

test("同一原始 ID 的现场事件使用独立的标记与收藏身份", async () => {
  const identity = await import("../src/events/eventIdentity.ts");
  assert.equal(typeof identity.getEventMarkKey, "function");
  const first = { roomId: 10, id: "rnd", reactKey: "rnd", dedupe: "first" };
  const second = { roomId: 10, id: "rnd", reactKey: "rnd~1", dedupe: "second" };
  assert.notEqual(identity.getEventMarkKey(first), identity.getEventMarkKey(second));
  assert.notEqual(identity.getEventBookmarkKey(first), identity.getEventBookmarkKey(second));
  assert.equal(identity.getEventBookmarkKey({ ...second, reactKey: undefined }), "10:event:second");
  assert.equal(identity.getEventMarkKey({ ...first, comboId: "combo" }), identity.getEventMarkKey({ ...second, comboId: "combo" }));
  assert.notEqual(identity.getEventMarkKey({ ...first, reactKey: undefined }), identity.getEventMarkKey({ ...second, reactKey: undefined }));
});

test("现场标记和档案键按各自范围生成，档案转换保持去重身份", async () => {
  const { getEventBookmarkKey, getArchiveEventKey, stableArchiveEventKey, toStoredArchiveEventKey } = await import("../src/events/eventIdentity.ts");
  const event = { roomId: 10, id: "raw", dedupe: "stable", comboId: "combo" };
  assert.equal(getEventBookmarkKey(event), "10:combo:combo");
  assert.equal(getEventBookmarkKey({ roomId: 10, id: "raw" }), "10:event:raw");
  const rawKey = stableArchiveEventKey(10, "stable");
  assert.equal(rawKey, "10:archive-event:stable");
  assert.equal(toStoredArchiveEventKey("session", rawKey), getArchiveEventKey(event, "session"));
  assert.equal(toStoredArchiveEventKey("session", "legacy"), "session:archive-event:legacy");
});

test("事件持久化编号由唯一枚举提供", async () => {
  const { MsgType } = await import("../src/protocol/eventTypeCodes.ts");
  assert.ok(MsgType);
  assert.deepEqual([MsgType.Danmu, MsgType.Gift, MsgType.SuperChat, MsgType.GuardBuy, MsgType.GuardHonor, MsgType.ScDeleted, MsgType.CoverAudit, MsgType.Unknown], [0, 1, 2, 3, 9, 17, 26, 27]);
});
