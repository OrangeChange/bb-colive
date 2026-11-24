import test from "node:test";
import assert from "node:assert/strict";
import { splitBilibiliVideoText } from "../src/components/bilibiliVideoLinks.ts";

test("识别独立的 av 号和 BV 号并生成 B 站视频地址", () => {
  assert.deepEqual(splitBilibiliVideoText("看看 av123456 和 BV1xx411c7mD"), [
    { type: "text", value: "看看 " },
    { type: "video", value: "av123456", href: "https://www.bilibili.com/video/av123456" },
    { type: "text", value: " 和 " },
    { type: "video", value: "BV1xx411c7mD", href: "https://www.bilibili.com/video/BV1xx411c7mD" },
  ]);
});
test("视频号前后紧邻字母或数字时不误识别", () => {
  assert.deepEqual(splitBilibiliVideoText("nav123456 av123456x BV1xx411c7mD2"), [
    { type: "text", value: "nav123456 av123456x BV1xx411c7mD2" },
  ]);
});

test("识别大小写前缀但保持 BV 编码主体不变", () => {
  assert.deepEqual(splitBilibiliVideoText("AV123 bv1xx411c7mD"), [
    { type: "video", value: "AV123", href: "https://www.bilibili.com/video/av123" },
    { type: "text", value: " " },
    { type: "video", value: "bv1xx411c7mD", href: "https://www.bilibili.com/video/BV1xx411c7mD" },
  ]);
});
