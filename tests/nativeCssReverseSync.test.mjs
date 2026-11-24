import test from "node:test";
import assert from "node:assert/strict";
import { reverseSyncNativeVisualCss } from "../src/themes/nativeCssReverseSync.ts";

test("可视化 CSS 只反向同步受管声明并保留未知规则与注释", () => {
  const css = `/* 用户说明 */\n.unknown { filter: blur(1px); }\n/* danmu-managed:start */\n/* visual:common|all|all|message */\n.event .message { font-size: 30px; color: #123456; --unsupported: 1; }\n/* danmu-managed:end */`;
  const result = reverseSyncNativeVisualCss(css, {});
  assert.deepEqual(result.model.common["all|all|message"].fontSize, { source: "custom", value: { mode: "fixed", value: 30 } });
  assert.deepEqual(result.model.common["all|all|message"].color, { source: "custom", value: "#123456" });
  assert.match(result.unmanagedCss, /用户说明/);
  assert.match(result.unmanagedCss, /\.unknown/);
  assert.doesNotMatch(result.unmanagedCss, /danmu-managed/);
  assert.match(result.diagnostics.join(" "), /无法同步.*--unsupported/);
});

test("受管区内未知规则注释和声明顺序原样保留", () => {
  const css = `/* danmu-managed:start */\n/* visual:common|all|all|message */\n.event .message {\n  /* 字号说明 */\n  font-size: 20px;\n  --before: 1;\n  color: #123456;\n  --after: 2;\n}\n/* 独立规则说明 */\n.keep { filter: blur(1px); }\n/* danmu-managed:end */`;
  const result = reverseSyncNativeVisualCss(css, {});
  assert.deepEqual(result.model.common["all|all|message"].fontSize.value, { mode: "fixed", value: 20 });
  assert.deepEqual(result.model.common["all|all|message"].color.value, "#123456");
  assert.equal(result.unmanagedCss, `.event .message {\n  /* 字号说明 */\n  --before: 1;\n  --after: 2;\n}\n/* 独立规则说明 */\n.keep { filter: blur(1px); }`);
});

test("重复受管声明报告歧义并使用最后一个有效值", () => {
  const css = `/* visual:common|all|all|message */\n.event .message { font-size: 18px; font-size: 20px; }`;
  const result = reverseSyncNativeVisualCss(css, {});
  assert.deepEqual(result.model.common["all|all|message"].fontSize.value, { mode: "fixed", value: 20 });
  assert.match(result.diagnostics.join(" "), /存在多个 font-size/);
});

test("最后一个重复声明无法解析时字段改为由 CSS 控制", () => {
  const previous = { "all|all|message": { fontSize: { source: "custom", value: 16 } } };
  const css = `/* visual:common|all|all|message */\n.event .message { font-size: 18px; font-size: clamp(14px, 2vw, 22px); }`;
  const result = reverseSyncNativeVisualCss(css, previous);
  assert.equal(result.model.common["all|all|message"], undefined);
  assert.match(result.unmanagedCss, /font-size: clamp\(14px, 2vw, 22px\)/);
  assert.match(result.diagnostics.join(" "), /存在多个 font-size/);
});

test("无效 CSS 保持上一份模型", () => {
  const previous = { "all|all|message": { fontSize: { source: "custom", value: 18 } } };
  const result = reverseSyncNativeVisualCss(".event {", previous);
  assert.equal(result.error.length > 0, true);
  assert.deepEqual(result.model.common, previous);
});

test("删除受管声明会清除旧属性并恢复逐属性继承", () => {
  const previous = {
    "all|all|message": {
      fontSize: { source: "custom", value: 30 },
      color: { source: "custom", value: "#123456" },
    },
  };
  const css = `/* visual:common|all|all|message */\n.event .message { color: #abcdef; }`;
  const result = reverseSyncNativeVisualCss(css, previous);
  assert.equal(result.model.common["all|all|message"].fontSize, undefined);
  assert.deepEqual(result.model.common["all|all|message"].color, { source: "custom", value: "#abcdef" });
});

test("结构化尺寸拒绝非像素单位并将声明留在 CSS", () => {
  const css = `/* visual:common|all|all|message */\n.event .message { font-size: 2rem; line-height: 24px; }`;
  const result = reverseSyncNativeVisualCss(css, {});
  assert.equal(result.model.common["all|all|message"], undefined);
  assert.match(result.unmanagedCss, /font-size: 2rem/);
  assert.match(result.unmanagedCss, /line-height: 24px/);
  assert.deepEqual(result.cssControlled, [
    { scheme: "common", targetKey: "all|all|message", property: "fontSize" },
    { scheme: "common", targetKey: "all|all|message", property: "lineHeight" },
  ]);
  assert.match(result.diagnostics.join(" "), /font-size.*px/);
  assert.match(result.diagnostics.join(" "), /line-height.*无单位数值/);
});

test("结构化基准比例表达式反向同步为相对长度", () => {
  const css = `/* visual:common|all|all|message */\n.event .message { font-size: calc(var(--event-font-size, 16px) * 0.875); }`;
  const result = reverseSyncNativeVisualCss(css, {});
  assert.deepEqual(result.model.common["all|all|message"].fontSize, { source: "custom", value: { mode: "base-relative", ratio: 0.875 } });
  assert.equal(result.unmanagedCss, "");
  assert.deepEqual(result.diagnostics, []);
});

test("缺少管理区边界时已识别声明不会留在独立 CSS 中重复生效", () => {
  const css = `/* 用户说明 */\n/* visual:common|all|all|message */\n.event .message { color: #123456; filter: blur(1px); }`;
  const result = reverseSyncNativeVisualCss(css, {});
  assert.deepEqual(result.model.common["all|all|message"].color, { source: "custom", value: "#123456" });
  assert.doesNotMatch(result.unmanagedCss, /color: #123456/);
  assert.equal((result.unmanagedCss.match(/filter: blur\(1px\)/g) ?? []).length, 1);
  assert.match(result.unmanagedCss, /用户说明/);
});

test("深色受管声明只更新深色稀疏覆盖", () => {
  const previous = { common: { "all|all|message": { color: { source: "custom", value: "#111111" } } }, light: {}, dark: {} };
  const css = `/* visual:dark|all|all|message */\n.dark .event .message { color: #eeeeee; }`;
  const result = reverseSyncNativeVisualCss(css, previous);
  assert.deepEqual(result.model.common, previous.common);
  assert.deepEqual(result.model.dark["all|all|message"].color, { source: "custom", value: "#eeeeee" });
});

test("空受管规则会移除该目标并保留其他目标", () => {
  const previous = {
    "all|all|message": { fontSize: { source: "custom", value: 30 } },
    "gift|all|giftPrice": { color: { source: "custom", value: "#ff0000" } },
  };
  const css = `/* visual:common|all|all|message */\n.event .message { }`;
  const result = reverseSyncNativeVisualCss(css, previous);
  assert.equal(result.model.common["all|all|message"], undefined);
  assert.deepEqual(result.model.common["gift|all|giftPrice"], previous["gift|all|giftPrice"]);
});

test("同一目标的变量块和部件块会合并为一组属性", () => {
  const css = `/* visual:common|all|all|row */\n.event { --event-font-size: 22px; }\n/* visual:common|all|all|row */\n.event { background: #112233; }`;
  const result = reverseSyncNativeVisualCss(css, {});
  assert.deepEqual(result.model.common["all|all|row"], {
    fontSize: { source: "custom", value: { mode: "fixed", value: 22 } },
    background: { source: "custom", value: "#112233" },
  });
});

test("display none 反向同步为隐藏", () => {
  const css = `/* danmu-managed:start */\n/* visual:common|all|all|message */\n.event .message { display: none; }\n/* danmu-managed:end */`;
  const result = reverseSyncNativeVisualCss(css, {});
  assert.deepEqual(result.model.common["all|all|message"].visible, { source: "custom", value: false });
  assert.equal(result.unmanagedCss, "");
  assert.deepEqual(result.diagnostics, []);
});

test("display revert-layer 反向同步为明确显示", () => {
  const previous = { "all|all|message": { visible: { source: "theme", value: false } } };
  const css = `/* danmu-managed:start */\n/* visual:common|all|all|message */\n.event .message { display: revert-layer; }\n/* danmu-managed:end */`;
  const result = reverseSyncNativeVisualCss(css, previous);
  assert.deepEqual(result.model.common["all|all|message"].visible, { source: "theme", value: true });
  assert.equal(result.unmanagedCss, "");
  assert.deepEqual(result.diagnostics, []);
});

test("未知 display 值不进入显示控件并保留在 CSS", () => {
  const previous = { "all|all|message": { visible: { source: "custom", value: false } } };
  const css = `/* danmu-managed:start */\n/* visual:common|all|all|message */\n.event .message { display: inline-flex; }\n/* danmu-managed:end */`;
  const result = reverseSyncNativeVisualCss(css, previous);
  assert.equal(result.model.common["all|all|message"], undefined);
  assert.match(result.unmanagedCss, /display: inline-flex/);
  assert.match(result.diagnostics.join(" "), /display.*none.*revert-layer/);
});
