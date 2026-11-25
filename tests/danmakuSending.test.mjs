import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDanmakuForm,
  parseSendResult,
  parseEmoticonPackages,
} from "../src/protocol/danmakuSendingModel.ts";
test("文字回复使用真实房间及UID，换行整理为空格", () => {
  const f = buildDanmakuForm(
    { roomId: 123, kind: "text", text: "你好\n世界", replyUid: "456" },
    "SESSDATA=x; bili_jct=token",
    1700000000,
  );
  assert.equal(f.get("msg"), "你好 世界");
  assert.equal(f.get("reply_mid"), "456");
  assert.equal(f.get("replay_dmid"), "");
  assert.equal(f.get("csrf"), "token");
  assert.equal(f.get("roomid"), "123");
});
test("独立表情不可携带未经支持的回复，缺少凭据不可发送", () => {
  assert.throws(() =>
    buildDanmakuForm(
      { roomId: 1, kind: "emoticon", unique: "official_1", replyUid: "2" },
      "SESSDATA=x;bili_jct=y",
      1,
    ),
  );
  assert.throws(() =>
    buildDanmakuForm({ roomId: 1, kind: "text", text: "x" }, "SESSDATA=x", 1),
  );
  const f = buildDanmakuForm(
    { roomId: 1, kind: "emoticon", unique: "official_1" },
    "SESSDATA=x;bili_jct=y",
    1,
  );
  assert.equal(f.get("dm_type"), "1");
  assert.equal(f.get("msg"), "official_1");
});
test("拒绝与不明确结果不能当成功，不返回原始内容", () => {
  assert.equal(
    parseSendResult({ code: 0, message: "", msg: "" }).status,
    "sent",
  );
  assert.equal(
    parseSendResult({ code: 0, message: "f", msg: "f" }).status,
    "blocked",
  );
  assert.equal(
    parseSendResult({ code: 0, msg: "unexpected" }).status,
    "unknown",
  );
  assert.equal(parseSendResult({ code: -101 }).status, "login");
  assert.equal(
    parseSendResult({ code: -400, message: "私人内容" }).status,
    "failed",
  );
  assert.equal(parseSendResult({}).status, "unknown");
});
test("表情包保留权限、原始比例和文字表情分类", () => {
  const p = parseEmoticonPackages({
    code: 0,
    data: {
      data: [
        {
          pkg_id: 3,
          pkg_type: 3,
          pkg_name: "通用",
          emoticons: [
            {
              emoji: "[笑]",
              emoticon_unique: "emoji_1",
              url: "https://x",
              perm: 0,
              unlock_show_text: "需要粉丝牌",
              width: 200,
              height: 40,
            },
          ],
        },
      ],
    },
  });
  assert.equal(p[0].emoticons[0].available, false);
  assert.equal(p[0].emoticons[0].textual, true);
  assert.equal(p[0].emoticons[0].unlockText, "需要粉丝牌");
  assert.equal(p[0].emoticons[0].width, 200);
});
