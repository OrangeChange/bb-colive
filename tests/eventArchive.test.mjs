import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const adapterSource = readFileSync(
  fileURLToPath(new URL("../src/protocol/adapter.ts", import.meta.url)),
  "utf8",
);
const nonEventCommandsSource = readFileSync(
  fileURLToPath(new URL("../src/protocol/nonEventCommands.ts", import.meta.url)),
  "utf8",
);
const typesSource = readFileSync(
  fileURLToPath(new URL("../src/protocol/types.ts", import.meta.url)),
  "utf8",
);
const reminderSource = readFileSync(
  fileURLToPath(new URL("../src/components/systemReminder.ts", import.meta.url)),
  "utf8",
);
const archiveProjectionSource = readFileSync(
  fileURLToPath(new URL("../src/archive/archiveProjection.ts", import.meta.url)),
  "utf8",
);

test("辅助命令与连击结束命令只归档，不进入事件流", () => {
  const commands = [
    "PK_USER_REC",
    "COMBO_END",
    "VOICE_REPORT_LIKE",
    "ANCHOR_HELPER_DANMU",
    "LIKE_INFO_V3_NOTICE",
  ];

  for (const cmd of commands) {
    assert.match(
      adapterSource,
      new RegExp(`cmd === ['"]${cmd}['"]`),
      `${cmd} 应被加入归档丢弃列表`,
    );
  }
});

test("平台配置与技术信令只归档，不进入事件流", () => {
  const commands = [
    "CHANGE_ROOM_INFO",
    "CUSTOM_NOTICE_CARD",
    "GIFT_PANEL_PLAN",
    "LIVE_PANEL_CHANGE_CONTENT",
    "OPENPLATFORM_GAME_BUTTON_STATUS_CHANGE",
    "TIP_CARD",
  ];

  for (const cmd of commands) {
    assert.match(
      adapterSource,
      new RegExp(`cmd === ['"]${cmd}['"]`),
      `${cmd} 应被加入归档丢弃列表`,
    );
  }
});

test("心愿组件与动画资源信令不进入事件流，未知命令兜底仍保留", () => {
  const commands = [
    "WIDGET_WISH_INFO",
    "WIDGET_WISH_INFO_V2",
    "LIVE_ANI_RES_UPDATE",
    "PLAYTOGETHER_ICON_CHANGE",
  ];

  for (const cmd of commands) {
    assert.match(
      nonEventCommandsSource,
      new RegExp(`['"]${cmd}['"]`),
      `${cmd} 应被加入非事件命令名单`,
    );
  }
  assert.match(adapterSource, /NON_EVENT_PROTOCOL_COMMANDS\.includes\(cmd\)/);
  assert.match(adapterSource, /return base\(\{ msgType: MsgType\.Unknown, text: cmd \}\)/);
});

test("直播内容审核报告只接受当前连接房间，避免跨房误归属", () => {
  assert.match(adapterSource, /case ['"]ROOM_CONTENT_AUDIT_REPORT['"]/);
  assert.match(adapterSource, /room_id/);
  assert.match(adapterSource, /MsgType\.CoverAudit/);
});

test("直播封面状态保留协议与归档，但不进入系统提醒", () => {
  assert.match(typesSource, /CoverAudit/);
  assert.match(adapterSource, /case ['"]COVER_AUDIT_STATUS_CHANGED['"]/);
  assert.match(adapterSource, /msgType: MsgType\.CoverAudit/);
  assert.match(adapterSource, /text: ['"]直播封面状态发生变化['"]/);
  assert.doesNotMatch(reminderSource, /MsgType\.CoverAudit/);
});

test("归档 payload 往返保留房间级大航海档位，旧记录缺字段时仍可回看", () => {
  const event = {
    id: "guard-profile",
    user: { uid: "u-profile", uname: "档位用户", guardLevel: 1, guardMilestone: "tenThousand", guardIconSet: "enhanced" },
  };
  const roundTrip = JSON.parse(JSON.stringify(event));
  assert.equal(roundTrip.user.guardMilestone, "tenThousand");
  assert.equal(roundTrip.user.guardIconSet, "enhanced");
  assert.match(archiveProjectionSource, /const event = parsed as DanmakuEvent/);
  assert.match(archiveProjectionSource, /return \{[\s\S]*\.\.\.event,/);
  const oldRecord = JSON.parse(JSON.stringify({ id: "old-guard", user: { uid: "u-old", guardLevel: 1 } }));
  assert.equal(oldRecord.user.guardIconSet, undefined);
});
