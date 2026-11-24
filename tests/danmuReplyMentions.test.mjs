import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import * as replyMentions from "../src/events/replyMentions.ts";
import { buildArchiveContentText } from "../src/archive/archiveContentSearch.ts";
import { getEventSearchText } from "../src/events/eventView.ts";

test("真实适配的无内嵌回复在现场与回看搜索中均可找到", () => {
  const result = adapt(danmu("这期神了", { reply_mid: 2, reply_uname: "目标用户" }), context);
  assert.match(getEventSearchText(result), /@目标用户/);
  assert.match(buildArchiveContentText(result), /@目标用户/);
  assert.equal(result.text, "这期神了");
});

const root = fileURLToPath(new URL("../", import.meta.url));
let server;
let adapt;
let MsgType;
let EventRow;

test.before(async () => {
  server = await createServer({configFile:false,esbuild:{jsx:"automatic"},cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-danmuReplyMentions.test.mjs",optimizeDeps:{noDiscovery:true,include:[]},
    root,
    logLevel: "silent",
    server: {watch:null, middlewareMode: true },
  });
  ({ adapt } = await server.ssrLoadModule("/src/protocol/adapter.ts"));
  ({ MsgType } = await server.ssrLoadModule("/src/protocol/types.ts"));
  ({ EventRow } = await server.ssrLoadModule("/src/components/EventRow.tsx"));
});

test.after(async () => {
  await server?.close();
});

const context = { roomId: 80397, anchorUid: "999", keepRaw: false };
const eventRowSource = readFileSync(fileURLToPath(new URL("../src/components/EventRow.tsx", import.meta.url)), "utf8");

function danmu(text, extra = {}) {
  return {
    cmd: "DANMU_MSG",
    info: [
      [0, 1, 25, 0xffffff, 1789253554, 1789253554, 0, "rnd", 0, 0, 0, "", 0, "{}", "{}", { extra: JSON.stringify(extra) }],
      text,
      [20276964, "发送者", 0],
    ],
  };
}

test("结构化 reply_uinfo 会进入事件的被@用户字段", () => {
  const result = adapt(danmu("@西木野雨月，欢迎", {
    reply_mid: 0,
    reply_uname: "西木野雨月",
    reply_uinfo: {
      uid: 1661579,
      base: {
        name: "西木野雨月",
        face: "https://example.com/reply-face.jpg",
      },
    },
  }), context);

  assert.equal(result.msgType, MsgType.Danmu);
  assert.equal(result.user.uid, "20276964");
  assert.equal(result.replyTo.uid, "1661579");
  assert.equal(result.replyTo.uname, "西木野雨月");
  assert.equal(result.replyTo.avatar, "https://example.com/reply-face.jpg");
});

test("没有 reply_uinfo 时可用 reply_mid 与 reply_uname 形成最小目标用户", () => {
  const result = adapt(danmu("@执念橘子的猫，已回复", {
    reply_mid: 519123585,
    reply_uname: "执念橘子的猫",
    reply_type_enum: 1,
  }), context);

  assert.equal(result.replyTo.uid, "519123585");
  assert.equal(result.replyTo.uname, "执念橘子的猫");
  assert.equal(result.replyTo.avatar, undefined);
});

test("普通文本中的 @ 没有结构化 reply 时不生成被@用户", () => {
  const result = adapt(danmu("@然然等下过来刷下声骸"), context);
  assert.equal(result.replyTo, undefined);
});

test("只链接完整的结构化用户名，不误匹配用户名前缀", () => {
  const target = { uid: "1", uname: "alice" };
  assert.deepEqual(replyMentions.findReplyMention("@alice，欢迎", target), {
    start: 0,
    end: 6,
    label: "@alice",
  });
  assert.equal(replyMentions.findReplyMention("@alice2，欢迎", target), null);
  assert.equal(replyMentions.findReplyMention("邮箱 alice@example.com", target), null);
});

test("正文没有内嵌 @用户名时，为结构化回复目标生成补充前缀", () => {
  assert.deepEqual(replyMentions.resolveReplyMention("这期神了[dog]", { uname: "蜗壳咪" }), {
    label: "@蜗壳咪",
    match: null,
    prepend: true,
  });
});

test("正文已经包含 @用户名时，不重复生成补充前缀", () => {
  assert.deepEqual(replyMentions.resolveReplyMention("@蜗壳咪，这期神了", { uname: "蜗壳咪" }), {
    label: "@蜗壳咪",
    match: {
      start: 0,
      end: 4,
      label: "@蜗壳咪",
    },
    prepend: false,
  });
});

test("事件行会显示正文中缺失的结构化 @ 用户", () => {
  const html = renderToStaticMarkup(createElement(EventRow, {
    showTime: false,
    ev: {
      id: "reply-event",
      msgType: MsgType.Danmu,
      roomId: 80397,
      ts: 1_789_253_554_000,
      user: { uid: "1", uname: "发送者", guardLevel: 0 },
      replyTo: { uid: "2", uname: "蜗壳咪", guardLevel: 0 },
      text: "这期神了[dog]",
      emotes: {
        "[dog]": { url: "https://example.com/dog.png", width: 20, height: 20 },
      },
    },
  }));

  assert.match(html, /@蜗壳咪/);
  assert.match(html, /这期神了/);
  assert.match(html, /https:\/\/example\.com\/dog\.png/);
});

test("结构化 @ 用户在事件正文中使用筛选链接", () => {
  assert.match(eventRowSource, /resolveReplyMention/);
  assert.match(eventRowSource, /onUserFilter\(user\)/);
  assert.match(eventRowSource, /replyTo=\{ev\.replyTo\}/);
  assert.match(eventRowSource, /className="reply cursor-pointer underline/);
});
