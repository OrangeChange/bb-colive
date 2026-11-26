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

test("小表情使用触发词且不依赖大表情标识，个人包保留", () => {
  const packages = parseEmoticonPackages({
    code: 0,
    data: {
      data: [
        {
          pkg_id: 100,
          pkg_type: 3,
          emoticons: [
            { emoji: "dog", descript: "[dog]", url: "https://x", perm: 1 },
          ],
        },
        {
          pkg_id: 44,
          pkg_type: 5,
          pkg_name: "我的表情",
          emoticons: [
            {
              emoticon_unique: "emoji_44",
              emoji: "赞",
              url: "https://y",
              perm: 1,
            },
          ],
        },
      ],
    },
  });
  assert.equal(packages[0].emoticons[0].text, "[dog]");
  assert.equal(packages[0].emoticons.length, 1);
  assert.equal(packages[1].emoticons[0].textual, false);
});

test("小表情包的零级权限不阻止可用表情，同编号个人包独立", () => {
  const p = parseEmoticonPackages({
    code: 0,
    data: {
      data: [
        {
          pkg_id: 1,
          pkg_type: 3,
          pkg_perm: 0,
          emoticons: [{ emoji: "[dog]", url: "https://x", perm: 1 }],
        },
        { pkg_id: 1, pkg_type: 5, emoticons: [] },
      ],
    },
  });
  assert.equal(p[0].emoticons[0].available, true);
  assert.notEqual(p[0].id, p[1].id);
});

test("粉丝牌保留佩戴与点亮两个状态及翻页信息", async () => {
  const { parseMedalPanel } =
    await import("../src/protocol/liveMedalsModel.ts");
  const p = parseMedalPanel({
    list: [
      {
        medal: {
          medal_id: 12,
          medal_name: "牌子",
          level: 9,
          wearing_status: 1,
          is_lighted: 0,
        },
        anchor_info: { nick_name: "主播" },
      },
    ],
    page_info: { cur_page: 1, total_page: 2 },
  });
  assert.equal(p.medals[0].worn, true);
  assert.equal(p.medals[0].lighted, false);
  assert.equal(p.hasMore, true);
});

test("字数占用按直播输入规则计算发送文本，图片仍计触发词", async () => {
  const { danmakuTextUsage } =
    await import("../src/protocol/danmakuSendingModel.ts");
  assert.equal(danmakuTextUsage("a中😀[dog]"), 12);
  assert.equal(danmakuTextUsage(" 草稿[笑]\n"), 8);
});
