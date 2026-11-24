import test from "node:test";
import assert from "node:assert/strict";
import { MsgType } from "../src/protocol/types.ts";

async function loadReminder() {
  try {
    return await import("../src/components/systemReminder.ts");
  } catch {
    return null;
  }
}

const event = (id, msgType, text = id) => ({
  id,
  msgType,
  roomId: 1,
  ts: 1,
  text,
});

test("系统提醒收束治理和生命周期事件，但不把礼物/互动混入", async () => {
  const reminder = await loadReminder();
  assert.ok(reminder, "systemReminder 应提供系统提醒筛选逻辑");

  const events = [
    event("live", MsgType.LiveStart),
    event("block", MsgType.RoomBlock),
    event("cover", MsgType.CoverAudit),
    event("danmu", MsgType.Danmu),
    event("gift", MsgType.Gift),
    event("pk", MsgType.Unknown, "PK_BATTLE_START"),
  ];
  assert.deepEqual(
    reminder.getSystemReminderEvents(events).map((item) => item.id),
    ["live", "block"],
  );
});

test("系统提醒不重复显示已确认隐藏的 PK 未知事件", async () => {
  const reminder = await loadReminder();
  assert.ok(reminder, "systemReminder 应提供系统提醒筛选逻辑");

  assert.equal(
    reminder.isSystemReminderEvent(event("pk", MsgType.Unknown, "PK_BATTLE_START")),
    false,
  );
  assert.equal(
    reminder.isSystemReminderEvent(event("unknown", MsgType.Unknown, "NEW_SYSTEM_NOTICE")),
    false,
  );
});

test("警告和切断属于即时提示级别，普通系统消息只进提醒中心", async () => {
  const reminder = await loadReminder();
  assert.ok(reminder, "systemReminder 应提供系统提醒筛选逻辑");

  assert.equal(reminder.isUrgentSystemEvent(event("warning", MsgType.Warning)), true);
  assert.equal(reminder.isUrgentSystemEvent(event("cutoff", MsgType.CutOff)), true);
  assert.equal(reminder.isUrgentSystemEvent(event("change", MsgType.RoomChange)), false);
});
