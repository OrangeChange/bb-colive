import test from "node:test";
import assert from "node:assert/strict";

test("档案质量原因统一转换为简洁中文文案", async () => {
  const { formatArchiveQualityReason } = await import("../src/archive/archiveQuality.ts");

  assert.equal(formatArchiveQualityReason("previous-runtime"), "程序上次没有正常关闭，这场直播没有收到下播消息。");
  assert.equal(formatArchiveQualityReason("connection-error"), "网络连接出错，没有收到下播消息。");
  assert.equal(formatArchiveQualityReason("connection-closed"), "连接已关闭，记录到断开为止。");
  assert.equal(formatArchiveQualityReason("manual-disconnect"), "你已断开连接，记录到断开为止。");
  assert.equal(formatArchiveQualityReason("connection-switched"), "你切换了直播间，当前记录到切换为止。");
  assert.equal(formatArchiveQualityReason("live-identity-changed"), "检测到新的直播场次，已分开记录。");
  assert.equal(formatArchiveQualityReason("live-start-not-captured"), "开始记录时直播已经开始。");
  assert.equal(formatArchiveQualityReason("start-time-unknown"), "没有获取到准确的开播时间。");
  assert.equal(formatArchiveQualityReason("disconnect-before-end"), "连接断开时没有收到下播消息。");
  assert.equal(formatArchiveQualityReason("future-reason"), "记录原因暂时无法识别，请查看诊断日志。");
});

test("档案提醒区分记录原因、标题回退和开播时间缺失", async () => {
  const { getArchiveRecordNotices } = await import("../src/archive/archiveQuality.ts");

  const notices = getArchiveRecordNotices({
    status: "unclean", recordingStatus: "reconnecting", quality: "incomplete", qualityReasons: ["connection-error"],
    qualityReason: "connection-error",
    titleSource: "time",
    identityEvidence: "unavailable",
  });

  assert.deepEqual(notices, [
    {
      kind: "quality",
      code: "quality:connection-error",
      label: "记录不完整",
      message: "记录曾中断。",
      tone: "warning",
    },
    {
      kind: "metadata",
      code: "title-fallback",
      label: "标题",
      message: "没有获取到直播标题，已使用时间命名。",
      tone: "info",
    },
    {
      kind: "metadata",
      code: "identity-unavailable",
      label: "场次身份",
      message: "没有获取到开播时间，无法确认是否为同一场。",
      tone: "info",
    },
  ]);
});

test("完整标题和可靠开播时间不会生成元数据提醒", async () => {
  const { getArchiveRecordNotices } = await import("../src/archive/archiveQuality.ts");

  assert.deepEqual(getArchiveRecordNotices({
    qualityReason: null,
    titleSource: "bilibili",
    identityEvidence: "source-live-time",
  }), []);
});
