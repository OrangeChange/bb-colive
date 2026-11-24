import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MsgType } from "../src/protocol/types.ts";
import { formatSystemReminderText, getSystemMessage } from "../src/components/systemReminder.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const adapterSource = readFileSync(`${root}/src/protocol/adapter.ts`, "utf8");

test("房间禁言使用服务端完整文案并保留禁言范围", () => {
  assert.match(adapterSource, /case ['"]ROOM_SILENT_ON['"]:/);
  assert.match(adapterSource, /case ['"]ROOM_SILENT_OFF['"]:/);
  assert.match(adapterSource, /msgType:\s*MsgType\.RoomSilent/);
  assert.match(adapterSource, /text:[\s\S]*d\.msg/);
  assert.match(adapterSource, /roomSilent:\s*\{/);
  assert.match(adapterSource, /const payload = d\.data && typeof d\.data === ['"]object['"] \? d\.data : d/);
});

test("用户禁言保留用户名和有效期限，并使用明确渲染文案", () => {
  assert.match(adapterSource, /case ['"]ROOM_BLOCK_MSG['"]:[\s\S]*roomBlock:\s*\{/);
  assert.match(adapterSource, /validPeriod:[\s\S]*payload\.vaild_period/);
  assert.equal(formatSystemReminderText({
    msgType: MsgType.RoomBlock,
    user: { uid: "19642758", uname: "力元君", guardLevel: 0 },
    roomBlock: { validPeriod: "永久", expiresAt: 2145888000, operator: 2 },
  }), "力元君 被禁言 永久");
});

test("房间禁言开关使用统一文案，范围取自结构化字段", () => {
  assert.equal(formatSystemReminderText({
    msgType: MsgType.RoomSilent,
    text: "[系统]: 主播取消了房间禁言",
    roomSilent: { action: "off", type: "", level: 0, second: 0 },
  }), "已解除房间禁言");
  assert.equal(formatSystemReminderText({
    msgType: MsgType.RoomSilent,
    text: "[系统]：主播对所有用户开启了禁言",
    roomSilent: { action: "on", type: "all", level: 1, second: -1 },
  }), "已开启房间禁言\n范围：全体用户；长期有效");
});

test("缺失字段不补写操作者、期限或原因", () => {
  assert.equal(formatSystemReminderText({msgType: MsgType.RoomBlock, user: {uid: '123', uname: ''}}), 'UID 123 被禁言');
  assert.deepEqual(getSystemMessage({msgType: MsgType.Warning, roomId: 545068}), {title: '直播间被警告', detail: undefined});
  assert.deepEqual(getSystemMessage({msgType: MsgType.RoomSilent, roomSilent: {action: 'on'}}), {title: '已开启房间禁言', detail: undefined});
});

test("系统正文与原因、分区分行，禁言期限按截止时间而非秒数显示", () => {
  const warning = getSystemMessage({msgType: MsgType.CutOff, roomId: 22381346, text: '违反直播言论规范，请立即调整'});
  assert.equal(warning.title, '直播间被切断');
  assert.equal(warning.detail, '违反直播言论规范，请立即调整');
  assert.deepEqual(getSystemMessage({msgType: MsgType.RoomChange, stats: {roomTitle: '新标题', roomParentArea: '知识', roomArea: '社科'}}), {title: '直播间标题更新：新标题', detail: '分区：知识 - 社科'});
  const mute = getSystemMessage({msgType: MsgType.RoomSilent, roomSilent: {action: 'on', type: 'level', level: 10, second: 1700000000}});
  assert.match(mute.detail, /范围：用户等级低于 10 级的用户；截至/);
  assert.doesNotMatch(mute.detail, /1700000000秒|荣耀/);
});
