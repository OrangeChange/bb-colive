import test from "node:test";
import assert from "node:assert/strict";
import {
  clearCompatibleAuthoredProperty,
  clearCompatibleAuthoredTarget,
  clearCompatibleManagedTargetCss,
  compatibleSelectorFor,
  materializeCompatibleVisualCss,
  patchCompatibleManagedCss,
  renderCompatibleManagedCss,
} from "../src/themes/compatManagedCss.ts";
import { reverseSyncCompatibleCss } from "../src/themes/compatCssReverseSync.ts";
import { registerCompatibleThemeCapability } from "../src/themes/compatThemeCapabilities.ts";
import { createCompatibleThemeModeAdapter } from "../src/themes/themeModeAdapters.ts";
import postcss from "postcss";
import { composeBlivechatThemeCss } from "../src/compat/blivechat/css.ts";

test("BLC 原版完整导出和运行共用组合，基础与可视化导出不夹带自定义", () => {
  const adapter = createCompatibleThemeModeAdapter("blivechat");
  const document = adapter.createBuiltinTheme();
  document.styles.customCss = "@layer authored { #message { color: blue !important } }";
  assert.equal(adapter.exportCss(document, "complete"), composeBlivechatThemeCss(document));
  assert.equal(adapter.exportCss(document, "base-visual"), composeBlivechatThemeCss({ ...document, styles: { ...document.styles, customCss: "" } }));
  assert.equal(adapter.exportCss(document, "custom"), document.styles.customCss);
});

const capability = {
  mode: "blivechat-open",
  parts: {
    message: {
      selector: ".message",
      properties: ["color", "fontSize", "lineHeight", "paddingX", "paddingY", "marginX", "marginY", "gap", "background", "borderWidth", "borderColor", "borderRadius"],
      units: { fontSize: "px", lineHeight: "number", paddingX: "px", paddingY: "px", marginX: "px", marginY: "px", gap: "px", borderWidth: "px", borderRadius: "px" },
    },
    username: { selector: ".username", properties: ["color", "fontSize"], units: { fontSize: "px" } },
  },
};

test("修改正文颜色只修补目标声明并保留用户名、注释和未知规则", () => {
  const before = { common: { "all|all|main|message": { color: { source: "custom", value: "#111111" }, fontSize: { source: "custom", value: 16 } }, "all|all|main|username": { color: { source: "custom", value: "#222222" } } }, light: {}, dark: {} };
  const after = structuredClone(before);
  after.common["all|all|main|message"].color.value = "#abcdef";
  const source = `${renderCompatibleManagedCss(capability, before)}\n/* keep */\n.unknown { --x: calc(100% - 4px); }`;
  const patched = patchCompatibleManagedCss(source, capability, before, after);
  assert.match(patched, /\.message[^}]*color: #abcdef/s);
  assert.match(patched, /\.username[^}]*color: #222222/s);
  assert.match(patched, /\/\* keep \*\//);
  assert.match(patched, /--x: calc\(100% - 4px\)/);
});

test("可识别手写值回填，歧义、calc、important、固定px和未知声明保留", () => {
  const source = `
/* compat-visual:common|all|all|main|message */
.message {
  color: #123456;
  font-size: calc(12px + 1vw);
  line-height: 1.4 !important;
  padding-inline: 12px;
  mystery: 7px;
}
/* compat-visual:common|all|all|main|username */
.username { color: red; color: blue; font-size: 13px; }
`;
  const result = reverseSyncCompatibleCss(source, capability, { common: {}, light: {}, dark: {} });
  assert.equal(result.error, "");
  assert.equal(result.model.common["all|all|main|message"].color.value, "#123456");
  assert.equal(result.model.common["all|all|main|message"].paddingX.value, 12);
  assert.equal(result.model.common["all|all|main|username"].fontSize.value, 13);
  assert.equal(result.model.common["all|all|main|username"]?.color, undefined);
  assert.match(result.unmanagedCss, /calc\(12px \+ 1vw\)/);
  assert.match(result.unmanagedCss, /line-height: 1\.4 !important/);
  assert.match(result.unmanagedCss, /mystery: 7px/);
  assert.match(result.unmanagedCss, /color: red/);
  assert.match(result.unmanagedCss, /color: blue/);
});

test("无效 CSS 保留原草稿并返回上一份有效模型", () => {
  const previous = { common: { "all|all|main|message": { color: { source: "custom", value: "#ffffff" } } }, light: {}, dark: {} };
  const result = reverseSyncCompatibleCss(".message { color:", capability, previous);
  assert.notEqual(result.error, "");
  assert.deepEqual(result.model, previous);
  assert.equal(result.unmanagedCss, ".message { color:");
});

test("删除受管声明会删除对应覆盖并恢复继承", () => {
  const previous = { common: { "all|all|main|message": { color: { source: "custom", value: "#f00" }, fontSize: { source: "custom", value: 20 } } }, light: {}, dark: {} };
  const source = `/* danmu-compat-managed:start */\n/* compat-visual:common|all|all|main|message */\n.message {\n  font-size: 20px;\n}\n/* danmu-compat-managed:end */`;
  const result = reverseSyncCompatibleCss(source, capability, previous);
  assert.equal(result.error, "");
  assert.equal(result.model.common["all|all|main|message"].color, undefined);
  assert.equal(result.model.common["all|all|main|message"].fontSize.value, 20);
});

test("删除整条受管规则或清空 CSS 会删除对应 scope 的直接覆盖", () => {
  const previous = { common: {
    "all|all|main|message": { color: { source: "custom", value: "#f00" } },
    "all|all|main|username": { fontSize: { source: "custom", value: 18 } },
  }, light: {}, dark: {} };
  const onlyUsername = `/* danmu-compat-managed:start */\n/* compat-visual:common|all|all|main|username */\n.username { font-size: 18px; }\n/* danmu-compat-managed:end */`;
  const deletedRule = reverseSyncCompatibleCss(onlyUsername, capability, previous);
  assert.equal(deletedRule.model.common["all|all|main|message"], undefined);
  assert.equal(deletedRule.model.common["all|all|main|username"].fontSize.value, 18);
  const cleared = reverseSyncCompatibleCss("", capability, previous);
  assert.deepEqual(cleared.model, { common: {}, light: {}, dark: {} });
});

test("受管注释后的选择器不匹配 capability 时完整保留手写规则且不写回原部件", () => {
  const previous = { common: { "all|all|main|message": { color: { source: "custom", value: "#f00" } } }, light: {}, dark: {} };
  const source = `/* compat-visual:common|all|all|main|message */\n.other { color: #123456; }`;
  const result = reverseSyncCompatibleCss(source, capability, previous);
  assert.equal(result.model.common["all|all|main|message"], undefined);
  assert.match(result.unmanagedCss, /compat-visual:common\|all\|all\|main\|message/);
  assert.match(result.unmanagedCss, /\.other \{ color: #123456; \}/);
});

test("选择器已改为未知规则后控件修改保留手写规则并新增正确受管规则", () => {
  const before = { common: { "all|all|main|message": { color: { source: "custom", value: "#111111" } } }, light: {}, dark: {} };
  const after = { common: { "all|all|main|message": { color: { source: "custom", value: "#222222" } } }, light: {}, dark: {} };
  const source = `/* compat-visual:common|all|all|main|message */\n.other { color: #111111; }`;
  const patched = patchCompatibleManagedCss(source, capability, before, after);
  assert.match(patched, /compat-visual:common\|all\|all\|main\|message[\s\S]*\.other \{ color: #111111; \}/);
  assert.match(patched, /compat-visual:common\|all\|all\|main\|message[\s\S]*\.message \{[\s\S]*color: #222222;/);
  assert.equal((patched.match(/\.other \{/g) ?? []).length, 1);
  assert.equal((patched.match(/^\.message \{/gm) ?? []).length, 1);
});

test("物化时值相同也保留选择器不匹配的手写规则", () => {
  const document = {
    styles: { visualCss: `/* compat-visual:common|all|all|main|message */\n.other { color: #123456; }` },
    settings: { visualModel: { common: { "all|all|main|message": { color: { source: "custom", value: "#123456" } } }, light: {}, dark: {} } },
  };
  const css = materializeCompatibleVisualCss(document, capability);
  assert.match(css, /\.message \{[\s\S]*color: #123456;/);
  assert.match(css, /compat-visual:common\|all\|all\|main\|message[\s\S]*\.other \{ color: #123456; \}/);
  assert.equal((css.match(/\.other \{/g) ?? []).length, 1);
});

function cascadedColor(css, ancestorClasses, targetClasses) {
  let winner = { specificity: -1, order: -1, value: undefined };
  let order = 0;
  postcss.parse(css).walkRules(rule => {
    const where = [...rule.selector.matchAll(/:where\(([^)]+)\)/g)].map(match => match[1]).join("");
    const outside = rule.selector.replace(/:where\([^)]+\)/g, "");
    const whereRequired = [...where.matchAll(/\.([\w-]+)/g)].map(match => match[1]);
    const outsideClasses = [...outside.matchAll(/\.([\w-]+)/g)].map(match => match[1]);
    const targetRequired = outsideClasses.slice(-1);
    const available = new Set([...ancestorClasses, ...targetClasses]);
    if (!whereRequired.every(value => available.has(value)) || !targetRequired.every(value => targetClasses.has(value))) return;
    const specificity = outsideClasses.length;
    rule.walkDecls("color", declaration => {
      if (specificity > winner.specificity || (specificity === winner.specificity && order > winner.order)) winner = { specificity, order, value: declaration.value };
      order += 1;
    });
  });
  return winner.value;
}

test("身份规则按能力表优先级生成，同等 specificity 下高优先身份最终生效", () => {
  const identityCapability = { ...capability, eventSelectors: { gift: ".gift" }, identitySelectors: { captain: ".captain", anchor: ".anchor" }, identityPriority: ["anchor", "captain"] };
  const model = { common: { "all|anchor|main|message": { color: { source: "custom", value: "red" } }, "all|captain|main|message": { color: { source: "custom", value: "blue" } } }, light: {}, dark: {} };
  const css = renderCompatibleManagedCss(identityCapability, model);
  assert.equal(cascadedColor(css, new Set(["captain", "anchor"]), new Set(["message"])), "red");
  const mixedCss = renderCompatibleManagedCss(identityCapability, { common: {
    "gift|captain|main|message": { color: { source: "custom", value: "blue" } },
    "all|anchor|main|message": { color: { source: "custom", value: "red" } },
  }, light: {}, dark: {} });
  assert.equal(cascadedColor(mixedCss, new Set(["gift", "captain", "anchor"]), new Set(["message"])), "red");
});

test("保存重开和导出使用同一份物化 CSS 且未知规则只保留一次", () => {
  const document = { styles: { visualCss: ".manual { custom-prop: keep; }" }, settings: { visualModel: { common: { "all|all|main|message": { color: { source: "custom", value: "#123456" } } }, light: {}, dark: {} } } };
  const first = materializeCompatibleVisualCss(document, capability);
  const reopened = materializeCompatibleVisualCss({ ...document, styles: { visualCss: first } }, capability);
  assert.equal((reopened.match(/custom-prop: keep/g) ?? []).length, 1);
  assert.equal((reopened.match(/color: #123456/g) ?? []).length, 1);
  registerCompatibleThemeCapability(capability);
  const adapter = createCompatibleThemeModeAdapter("blivechat-open");
  const persisted = { ...adapter.createBuiltinTheme(), settings: document.settings, styles: { baseCss: "", visualCss: document.styles.visualCss, customCss: "" } };
  assert.equal(adapter.initializeVisualCss(persisted), first);
  assert.match(adapter.exportCss(persisted, "visual"), /color: #123456/);
  assert.equal((adapter.exportCss(persisted, "visual").match(/custom-prop: keep/g) ?? []).length, 1);
});

test("受管 CSS 保持普通层叠顺序，不创建最高覆盖层", () => {
  const css = renderCompatibleManagedCss(capability, { common: { "all|all|main|message": { color: { source: "custom", value: "#fff" } } }, light: {}, dark: {} });
  assert.doesNotMatch(css, /@layer/);
  assert.doesNotMatch(css, /!important/);
  assert.match(css, /\.message/);
});

test("区域维度在生成、反向同步和导出中保持独立", () => {
  const placedCapability = {
    ...capability,
    eventSelectorsByPlacement: { main: { gift: ".main-gift" }, sticky: { gift: ".sticky-gift" } },
    parts: { ...capability.parts, message: { ...capability.parts.message, placements: ["main", "sticky"], selectorsByPlacement: { main: ".message", sticky: ".ticker-text" } } },
  };
  const model = { common: {
    "gift|all|main|message": { fontSize: { source: "custom", value: 18 } },
    "gift|all|sticky|message": { fontSize: { source: "custom", value: 28 } },
  }, light: {}, dark: {} };
  const css = renderCompatibleManagedCss(placedCapability, model);
  assert.match(css, /main\|message[\s\S]*\.main-gift[\s\S]*\.message[\s\S]*18px/);
  assert.match(css, /sticky\|message[\s\S]*\.sticky-gift[\s\S]*\.ticker-text[\s\S]*28px/);
  const synced = reverseSyncCompatibleCss(css, placedCapability, { common: {}, light: {}, dark: {} });
  assert.equal(synced.model.common["gift|all|main|message"].fontSize.value, 18);
  assert.equal(synced.model.common["gift|all|sticky|message"].fontSize.value, 28);
});

test("全部事件规则仍由区域事件根限定", () => {
  const placedCapability = {
    ...capability,
    eventSelectorsByPlacement: { main: { gift: ".main-gift", superchat: ".main-sc" }, sticky: { gift: ".sticky-gift", superchat: ".sticky-sc" } },
    parts: { ...capability.parts, message: { ...capability.parts.message, placements: ["main", "sticky"], selectorsByPlacement: { main: ".message", sticky: ".ticker-text" } } },
  };
  const main = compatibleSelectorFor(placedCapability, "all|all|main|message", "common");
  const sticky = compatibleSelectorFor(placedCapability, "all|all|sticky|message", "common");
  assert.match(main, /\.main-gift/);
  assert.match(main, /\.main-sc/);
  assert.doesNotMatch(main, /\.sticky-/);
  assert.match(sticky, /\.sticky-gift/);
  assert.match(sticky, /\.sticky-sc/);
  assert.doesNotMatch(sticky, /\.main-/);
});

test("后置手写 ID 规则覆盖受管规则", () => {
  const idCapability = { ...capability, parts: { ...capability.parts, message: { ...capability.parts.message, selector: "#message" } } };
  const managed = renderCompatibleManagedCss(idCapability, { common: { "all|all|main|message": { fontSize: { source: "custom", value: 20 } } }, light: {}, dark: {} });
  assert.match(managed, /#message/);
  assert.doesNotMatch(managed, /!important/);
});

test("layer、内联与动态规则不被受管 CSS 重排或吞并", () => {
  const before = { common: { "all|all|main|message": { color: { source: "custom", value: "#111111" } } }, light: {}, dark: {} };
  const after = { common: { "all|all|main|message": { color: { source: "custom", value: "#222222" } } }, light: {}, dark: {} };
  const source = `${renderCompatibleManagedCss(capability, before)}\n@layer source { .message { color: lime; } }\n[data-dynamic] .message { color: purple !important; }`;
  const patched = patchCompatibleManagedCss(source, capability, before, after);
  assert.match(patched, /@layer source \{ \.message \{ color: lime; \} \}/);
  assert.match(patched, /\[data-dynamic\] \.message \{ color: purple !important; \}/);
  assert.doesNotMatch(patched, /@layer danmu/);
});

test("受管选择器保留来源 specificity 并由真实 scheme 根限定", () => {
  const dark = compatibleSelectorFor(capability, "all|all|main|message", "dark");
  assert.doesNotMatch(dark, /:where\(/);
  assert.match(dark, /\[data-theme=["']dark["']\]/);
  assert.match(dark, /\.message/);
});

test("控件修改原位更新蓝前红后规则且不移动注释和未知声明", () => {
  const before = { common: { "all|all|main|message": { color: { source: "custom", value: "blue" } } }, light: {}, dark: {} };
  const after = structuredClone(before); after.common["all|all|main|message"].color.value = "cyan";
  const source = `/* before */\n/* compat-visual:common|all|all|main|message */\n.message {\n  color: blue;\n  /* between */\n  --unknown: calc(100% - 4px);\n}\n/* after */\n.message { color: red; }`;
  const patched = patchCompatibleManagedCss(source, capability, before, after);
  assert.ok(patched.indexOf("color: cyan") < patched.indexOf("color: red"));
  assert.ok(patched.indexOf("/* between */") < patched.indexOf("--unknown"));
  assert.match(patched, /--unknown: calc\(100% - 4px\)/);
  const reversed = reverseSyncCompatibleCss(patched, capability, before);
  assert.equal(reversed.unmanagedCss, patched);
  assert.equal(reversed.model.common["all|all|main|message"].color.value, "cyan");
});

test("临时模型物化会原位更新已有受管 key 而不返回旧值", () => {
  const source = `/* before */\n/* compat-visual:common|all|all|main|message */\n.message {\n  color: red;\n  /* keep-between */\n  --unknown: 1;\n}\n/* after */`;
  const document = { styles: { visualCss: source }, settings: { visualModel: { common: { "all|all|main|message": { color: { source: "custom", value: "blue" } } }, light: {}, dark: {} } } };
  const css = materializeCompatibleVisualCss(document, capability);
  assert.match(css, /color: blue/);
  assert.doesNotMatch(css, /color: red/);
  assert.ok(css.indexOf("/* before */") < css.indexOf("color: blue"));
  assert.ok(css.indexOf("/* keep-between */") < css.indexOf("--unknown"));
  assert.ok(css.indexOf("--unknown") < css.indexOf("/* after */"));
});

test("物化不删除模型无法安全回填的表达式和 important 声明", () => {
  const source = `/* danmu-compat-managed:start */
/* compat-visual:common|all|all|main|message */
.message {
  font-size: calc(12px + 1vw);
  line-height: var(--message-leading);
  color: red !important;
}
/* danmu-compat-managed:end */`;
  const css = materializeCompatibleVisualCss({
    styles: { visualCss: source },
    settings: { visualModel: { common: {}, light: {}, dark: {} } },
  }, capability);
  assert.match(css, /font-size: calc\(12px \+ 1vw\)/);
  assert.match(css, /line-height: var\(--message-leading\)/);
  assert.match(css, /color: red !important/);
});

test("用户明确给出安全值时原位接管声明并保留 important", () => {
  const source = `/* compat-visual:common|all|all|main|message */\n.message { color: red !important; }`;
  const css = materializeCompatibleVisualCss({
    styles: { visualCss: source },
    settings: { visualModel: { common: { "all|all|main|message": { color: { source: "custom", value: "blue" } } }, light: {}, dark: {} } },
  }, capability);
  assert.match(css, /color: blue !important/);
});

test("已有模型遇到不可安全回填声明时转交 authored 所有权且物化不覆盖", () => {
  const key = "all|all|main|message";
  const previous = { common: { [key]: {
    fontSize: { source: "custom", value: 24 },
    lineHeight: { source: "custom", value: 1.4 },
    color: { source: "custom", value: "blue" },
    background: { source: "custom", value: "#fff" },
  } }, light: {}, dark: {} };
  const source = `/* compat-visual:common|${key} */\n.message {\n  font-size: calc(12px + 1vw);\n  line-height: 1.5em;\n  color: red !important;\n  background: var(--message-bg);\n}`;
  const reversed = reverseSyncCompatibleCss(source, capability, previous, {});
  assert.deepEqual(reversed.model.common[key], undefined);
  assert.deepEqual(new Set(reversed.authored.common[key]), new Set(["fontSize", "lineHeight", "color", "background"]));
  const materialized = materializeCompatibleVisualCss({
    styles: { visualCss: source },
    settings: { visualModel: previous, visualAuthored: reversed.authored },
  }, capability);
  assert.match(materialized, /font-size: calc\(12px \+ 1vw\)/);
  assert.match(materialized, /line-height: 1\.5em/);
  assert.match(materialized, /color: red !important/);
  assert.match(materialized, /background: var\(--message-bg\)/);
  assert.doesNotMatch(materialized, /font-size: 24px/);
  assert.doesNotMatch(materialized, /color: blue/);
});

test('渐变背景的变量色点在CSS往返中保留',()=>{
 const key='all|all|main|message';
 const fill='linear-gradient(var(--sheen), transparent 32px), rgb(20, 30, 40)';
 const source=`/* compat-visual:common|${key} */\n.message { background: ${fill}; }`;
 const result=reverseSyncCompatibleCss(source,capability,{common:{},light:{},dark:{}});
 assert.equal(result.model.common[key].background.value,fill);
 assert.equal(result.authored.common[key],undefined);
});

test("用户再次改控件会解除单项 authored 所有权并在原位接管", () => {
  const key = "all|all|main|message";
  const source = `/* compat-visual:common|${key} */\n.message { color: red !important; font-size: calc(12px + 1vw); }`;
  const authored = { common: { [key]: ["color", "fontSize"] }, light: {}, dark: {} };
  const nextAuthored = clearCompatibleAuthoredProperty(authored, "common", key, "color");
  assert.deepEqual(nextAuthored.common[key], ["fontSize"]);
  const css = materializeCompatibleVisualCss({
    styles: { visualCss: source },
    settings: { visualModel: { common: { [key]: { color: { source: "custom", value: "blue" } } }, light: {}, dark: {} }, visualAuthored: nextAuthored },
  }, capability);
  assert.match(css, /color: blue !important/);
  assert.match(css, /font-size: calc\(12px \+ 1vw\)/);
});

test("恢复当前目标会清理该目标受管理声明和代码控制记录并保留无关 CSS", () => {
  const key = "all|all|main|message";
  const source = `/* compat-visual:common|${key} */\n.message { color: red !important; --keep: 1; font-size: calc(12px + 1vw); }\n.other { color: lime; }`;
  const authored = { common: { [key]: ["color", "fontSize"] }, light: {}, dark: {} };
  assert.deepEqual(clearCompatibleAuthoredTarget(authored, "common", key).common[key], undefined);
  const css = clearCompatibleManagedTargetCss(source, capability, "common", key);
  assert.doesNotMatch(css, /color: red/);
  assert.doesNotMatch(css, /font-size:/);
  assert.match(css, /--keep: 1/);
  assert.match(css, /\.other \{ color: lime; \}/);
});

test('可视化边框启用实线并随宽度恢复，独立手写边框样式保留',()=>{
 const key='all|all|main|message';
 for(const value of [2,'calc(2px * var(--blc-g, 1))','calc(var(--event-base-size, 20px) * 0.1)']){
  const model={common:{[key]:{borderWidth:{source:'custom',value}}},light:{},dark:{}};
  const css=renderCompatibleManagedCss(capability,model);
  assert.match(css,/border-style: solid;/);
  const source=css+'\n.message.special { border-style: dashed; }';
  const cleared=clearCompatibleManagedTargetCss(source,capability,'common',key,'borderWidth');
  assert.doesNotMatch(cleared,/border-style: solid/);
  assert.match(cleared,/border-style: dashed/);
  assert.doesNotMatch(patchCompatibleManagedCss(css,capability,model,{common:{},light:{},dark:{}}),/border-style/);
 }
 assert.doesNotMatch(renderCompatibleManagedCss(capability,{common:{[key]:{borderColor:{source:'custom',value:'red'}}}}),/border-style/);
});

test('自动边框样式在 CSS 往返时不产生未知属性提示',()=>{
 const key='all|all|main|message',model={common:{[key]:{borderWidth:{source:'custom',value:2}}},light:{},dark:{}};
 const result=reverseSyncCompatibleCss(renderCompatibleManagedCss(capability,model),capability,model);
 assert.deepEqual(result.diagnostics,[]);
 assert.equal(result.model.common[key].borderWidth.value,2);
});

test('同一受管理规则里的手写边框样式在合成和恢复时保留',()=>{
 const key='all|all|main|message',model={common:{[key]:{borderWidth:{source:'custom',value:2}}},light:{},dark:{}};
 for(const style of ['dashed','var(--edge-style)']){
  const source=renderCompatibleManagedCss(capability,model).replace('border-style: solid',`border-style: ${style}`);
  const document={styles:{visualCss:source},settings:{visualModel:model}};
  assert.match(materializeCompatibleVisualCss(document,capability),new RegExp(`border-style: ${style.replace(/[()*]/g,'\\$&')}`));
  const restored=patchCompatibleManagedCss(source,capability,model,{common:{},light:{},dark:{}});
  assert.ok(restored.includes(`border-style: ${style}`));
  assert.ok(clearCompatibleManagedTargetCss(source,capability,'common',key,'borderWidth').includes(`border-style: ${style}`));
 }
 const standalone='/* compat-visual:common|'+key+' */\n.message { color: red; border-style: solid; }';
 assert.match(clearCompatibleManagedTargetCss(standalone,capability,'common',key),/border-style: solid/);
});
import { BLIVECHAT_CAPABILITY } from "../src/compat/blivechat/theme.ts";
import { OPENLIVE_CAPABILITY } from "../src/compat/openlive/theme.ts";
import { LAPLACE_CAPABILITY } from "../src/compat/laplace/theme.ts";
import { isCompatibleManagedRule } from "../src/themes/compatManagedCss.ts";
test("明暗事件规则将配色限定放在同一根元素", () => {
 for (const cap of [BLIVECHAT_CAPABILITY, OPENLIVE_CAPABILITY, LAPLACE_CAPABILITY]) {
  const selector = compatibleSelectorFor(cap, "all|all|main|username", "dark");
  assert.doesNotMatch(selector, /\[data-theme='dark'\] :root/);
  assert.match(selector, /:root\[data-theme='dark'\]/);
 }
});
test("旧礼物单事件规则保持可编辑与可清理", () => {
 for (const cap of [BLIVECHAT_CAPABILITY, OPENLIVE_CAPABILITY]) {
  const oldCap = {...cap, eventGroups: undefined};
  const key = "gift|all|main|username";
  const selector = compatibleSelectorFor(oldCap,key,"common",false);
  const rule = postcss.parse(`${selector}{color:red}`).first;
  assert.equal(isCompatibleManagedRule(cap,"common|"+key,rule),true);
 }
});
