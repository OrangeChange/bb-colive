import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeUserNicknames,
  removeUserNickname,
  resolveArchiveUserDisplayName,
  resolveUserDisplayName,
  upsertUserNickname,
} from "../src/userNicknames.ts";

test("昵称按 UID 覆盖现场显示名，并在缺少昵称时回退原用户名", () => {
  const nicknames = { "100": "小橘" };
  assert.equal(resolveUserDisplayName({ uid: "100", uname: "橙子君" }, nicknames), "小橘");
  assert.equal(resolveUserDisplayName({ uid: "200", uname: "另一用户" }, nicknames), "另一用户");
});

test("档案显示名按 UID 读取当前昵称，但不改写历史事件中的原始 uname", () => {
  const archivedEvent = { user: { uid: "100", uname: "历史用户名" } };
  assert.equal(resolveArchiveUserDisplayName(archivedEvent.user, { "100": "当前昵称" }), "当前昵称");
  assert.equal(archivedEvent.user.uname, "历史用户名");
  assert.equal(resolveArchiveUserDisplayName(archivedEvent.user, {}), "历史用户名");
});

test("昵称增删以 UID 为键且不修改原对象", () => {
  const source = { "100": "旧昵称" };
  const updated = upsertUserNickname(source, "100", "新昵称");
  assert.deepEqual(updated, { "100": "新昵称" });
  assert.deepEqual(removeUserNickname(updated, "100"), {});
  assert.deepEqual(source, { "100": "旧昵称" });
});

test("昵称持久化数据会丢弃空键和值以及非字符串值", () => {
  assert.deepEqual(normalizeUserNicknames({ "100": " 小橘 ", "": "无效", "200": " ", "300": 4 }), { "100": "小橘" });
});
