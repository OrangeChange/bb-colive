import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { uiText, UiMessageError } from "../src/i18n/index.ts";

test("中文界面保持原文，不改变标点与参数值", () => {
  assert.equal(uiText("common.cancel"), "取消");
  assert.equal(uiText("themePackageCodec.decodeThemePackage", { name: "$&{name}\n素材.png" }), "主题素材缺失：$&{name}\n素材.png");
  assert.equal(uiText("roomOverviewBar.RoomOverviewBar.summary", { value: 0 }), "观众 0");
});

test("错误分类使用文案键，修改显示文字不改变分类", () => {
  const error = new UiMessageError("themes.fileConflict");
  error.message = "用于核对的另一种显示文字";
  assert.equal(error.messageKey, "themes.fileConflict");
  assert.ok(error instanceof Error);
  const missing = new UiMessageError("themePackageCodec.decodeThemePackage", { name: "头像.png" });
  assert.equal(missing.message, "主题素材缺失：头像.png");
});

test("翻译清单保留三种目标语言与UTF-8表格编码", () => {
  const table = fs.readFileSync("docs/translations/ui-translation-list.csv", "utf8");
  assert.ok(table.startsWith("\uFEFF"));
  const header = table.split("\r\n")[0];
  for (const column of ["标识", "简体中文原文", "繁体中文（zh-Hant）", "英文（en）", "日语（ja）", "变量"]) assert.ok(header.includes(column));
  assert.ok(table.includes('"common.cancel"'));
  assert.ok(table.includes('"backend.lib.build_tray_menu"'));
  assert.ok(!table.includes('"eventRow.'));
});
