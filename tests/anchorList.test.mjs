import test from "node:test";
import assert from "node:assert/strict";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
globalThis.window = globalThis;
const anchors = await import("../src/protocol/anchors.ts");
const entry = (id) => ({
  realRoomId: id,
  roomIdInput: String(id),
  uname: `主播${id}`,
  lastConnectedAt: id,
});
let saved = [];
test.beforeEach(() => {
  saved = Array.from({ length: 25 }, (_, i) => entry(i + 1));
  mockIPC((command, args) => {
    if (command === "read_anchor_list") return structuredClone(saved);
    if (command === "get_app_data_directory") return "C:/test-data";
    if (command === "plugin:store|load") return 1;
    if (command === "plugin:store|get") return [structuredClone(saved), true];
    if (command === "plugin:store|set") {
      saved = structuredClone(args.value);
      return;
    }
    if (command === "plugin:store|save") return;
    throw Error(command);
  });
});
test.afterEach(() => clearMocks());
test("连接第26个主播保留全部记录，并按最近连接排序", async () => {
  const result = await anchors.upsertAnchor(entry(26));
  assert.equal(result.length, 26);
  assert.equal(result[0].realRoomId, 26);
  assert.ok(result.some((a) => a.realRoomId === 1));
});
test("状态刷新与新增、删除合并，不能恢复已删除主播或覆盖新记录", async () => {
  await Promise.all([
    anchors.upsertAnchor(entry(26)),
    anchors.removeAnchor(2),
    anchors.updateAnchorStatuses([
      { realRoomId: 1, liveStatus: 1 },
      { realRoomId: 2, liveStatus: 1 },
    ]),
  ]);
  assert.equal(saved.length, 25);
  assert.ok(saved.some((a) => a.realRoomId === 26));
  assert.ok(!saved.some((a) => a.realRoomId === 2));
  assert.equal(saved.find((a) => a.realRoomId === 1).liveStatus, 1);
  assert.equal(saved[0].realRoomId, 26);
});


test("主播列表读取失败时，新增、删除和状态刷新都不能保存空列表", async () => {
  const original = structuredClone(saved);
  let writes = 0;
  mockIPC((command) => {
    if (command === "read_anchor_list" || command === "plugin:store|load") throw new Error("无法读取主播列表");
    if (command === "plugin:store|set" || command === "plugin:store|save") writes++;
    throw new Error(command);
  });
  await assert.rejects(anchors.loadAnchors(), /无法读取主播列表/);
  await assert.rejects(anchors.upsertAnchor(entry(26)), /无法读取主播列表/);
  await assert.rejects(anchors.removeAnchor(2), /无法读取主播列表/);
  await assert.rejects(anchors.updateAnchorStatuses([{realRoomId:1,liveStatus:1}]), /无法读取主播列表/);
  assert.equal(writes, 0);
  assert.deepEqual(saved, original);
});

test("存储插件内存为空时，更新仍以实际文件中的完整主播列表为准", async () => {
  const original = structuredClone(saved);
  mockIPC((command, args) => {
    if (command === "read_anchor_list") return structuredClone(original);
    if (command === "get_app_data_directory") return "C:/test-data";
    if (command === "plugin:store|load") return 1;
    if (command === "plugin:store|get") return [undefined, false];
    if (command === "plugin:store|set") { saved = structuredClone(args.value); return; }
    if (command === "plugin:store|save") return;
    throw new Error(command);
  });
  await anchors.upsertAnchor(entry(26));
  assert.equal(saved.length, 26);
  assert.ok(saved.some(a => a.realRoomId === 1));
});

test("空列表与未变化的状态刷新不重写主播文件", async () => {
  let writes = 0;
  mockIPC((command) => {
    if (command === "read_anchor_list") return [];
    if (command === "plugin:store|set" || command === "plugin:store|save") writes++;
    if (command === "plugin:store|load") return 1;
    if (command === "plugin:store|get") return [[], true];
    throw new Error(command);
  });
  assert.deepEqual(await anchors.updateAnchorStatuses([]), []);
  assert.equal(writes, 0);
});
