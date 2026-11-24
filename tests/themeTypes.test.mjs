import test from "node:test";
import assert from "node:assert/strict";
import { createCustomThemeDocument, toThemeSummary } from "../src/themes/themeTypes.ts";

test("自定义主题文档和轻量摘要共享稳定标识", () => {
  const document = createCustomThemeDocument({
    themeId: "custom-one",
    mode: "native",
    name: "我的主题",
    author: "Orange",
  });
  const summary = toThemeSummary(document);
  assert.equal(summary.themeId, document.themeId);
  assert.equal(summary.mode, "native");
  assert.equal(summary.origin, "custom");
  assert.equal(summary.name, "我的主题");
  assert.equal(document.permissions.update, true);
  assert.equal(document.permissions.saveAs, true);
  assert.equal(document.permissions.delete, true);
  assert.deepEqual(document.styles, { baseCss: "", visualCss: "", customCss: "" });
});

test("未提供版本时保持空值而不是补造版本号", () => {
  const document = createCustomThemeDocument({
    themeId: "custom-empty-version",
    mode: "native",
    name: "未标版本",
  });
  assert.equal(document.metadata.version, "");
});
