import test from "node:test";
import assert from "node:assert/strict";
import { projectNativeVisualModel, resolveNativeVisualProperty } from "../src/themes/nativeThemeDefaults.ts";

test("局部属性按身份、事件和主题默认顺序继承", () => {
  const model = {
    "all|all|message": { fontSize: { source: "theme", value: 18 } },
    "gift|all|message": { fontSize: { source: "custom", value: 22 } },
  };
  assert.deepEqual(resolveNativeVisualProperty(model, { event: "gift", identity: "captain", part: "message" }, "fontSize"), { source: "custom", value: 22, inheritedFrom: "gift|all|message" });
  assert.deepEqual(resolveNativeVisualProperty(model, { event: "danmaku", identity: "captain", part: "message" }, "fontSize"), { source: "theme", value: 18, inheritedFrom: "all|all|message" });
  assert.equal(resolveNativeVisualProperty({}, { event: "danmaku", identity: "captain", part: "message" }, "fontSize").source, "code");
});

test("深色投影继承通用值并只替换深色覆盖，预览模式不写入模型", () => {
  const model = {
    common: { "all|all|message": { color: { source: "theme", value: "#111111" }, fontSize: { source: "custom", value: { mode: "base-relative", ratio: 0.875 } } } },
    light: {},
    dark: { "all|all|message": { color: { source: "custom", value: "#eeeeee" } } },
  };
  assert.deepEqual(projectNativeVisualModel(model, "dark"), {
    "all|all|message": { color: { source: "custom", value: "#eeeeee" }, fontSize: { source: "custom", value: { mode: "base-relative", ratio: 0.875 } } },
  });
  assert.equal("previewScheme" in model, false);
});
