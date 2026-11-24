import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fitUsername } from "../src/components/usernameTruncation.ts";

const segmenter = new Intl.Segmenter("zh-CN", { granularity: "grapheme" });
const measure = value => [...segmenter.segment(value)].reduce((width, { segment }) => width + (segment === "." ? 3 : 10), 0);

test("昵称省略舍弃放不下的整个字符，预留三个点宽度", () => {
  assert.deepEqual(fitUsername("中文昵称", 38, measure), { text: "中文", truncated: true });
  assert.deepEqual(fitUsername("EnglishName", 48, measure), { text: "Eng", truncated: true });
});

test("昵称保留完整表情，缩放后恢复全文", () => {
  assert.deepEqual(fitUsername("甲🧑‍🚀乙👨‍👩‍👧‍👦丙", 38, measure), { text: "甲🧑‍🚀", truncated: true });
  assert.deepEqual(fitUsername("甲🧑‍🚀乙👨‍👩‍👧‍👦丙", 50, measure), { text: "甲🧑‍🚀乙👨‍👩‍👧‍👦丙", truncated: false });
  assert.deepEqual(fitUsername("短名", 20, measure), { text: "短名", truncated: false });
});

test("原生昵称保留全文供主题换行，文本节点不裁掉数据", () => {
  const source = fs.readFileSync("src/components/EventRow.tsx", "utf8");
  const usernameText = source.slice(source.indexOf("function UsernameText"), source.indexOf("function Uname"));
  assert.match(usernameText,/className="username-text">\{name\}/);
  assert.doesNotMatch(usernameText,/fitUsername|canvas|setFitted/);
});
