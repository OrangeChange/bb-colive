import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultEventStyleSettings } from "../src/eventStyleSettings.ts";
import { createBuiltinNativeTheme } from "../src/themes/nativeBuiltinThemes.ts";
import { patchManagedNativeCss, renderManagedNativeCss, replaceManagedNativeCss, scopeNativePreviewCss, tryScopeNativePreviewCss } from "../src/themes/nativeManagedCss.ts";
import { NATIVE_PART_SELECTORS } from "../src/themes/nativeSemanticSelectors.ts";
import { normalizeNativeEventVisibility } from "../src/themes/nativeComponentAppearance.ts";

test("原生主题使用公开语义选择器生成受管理 CSS", () => {
  const settings = createDefaultEventStyleSettings();
  settings.roles.captain.username = { r: 1, g: 2, b: 3, a: 1 };
  const css = renderManagedNativeCss(settings);
  assert.match(css, /\.event\.guard-level-3/);
  assert.match(css, /--username-color: rgba\(1, 2, 3, 1\)/);
  assert.equal(NATIVE_PART_SELECTORS.translation, ".bili-translation");
  assert.equal(NATIVE_PART_SELECTORS.avatarFrame, ".avatar-frame");
});

test("预览 CSS 只作用于预览容器并保留媒体规则", () => {
  const css = scopeNativePreviewCss(".event, .message { color: red } @media (width < 500px) { .event { gap: 2px } }", ".native-theme-preview");
  assert.match(css, /:where\(\.native-theme-preview\) :is\(\.event\)/);
  assert.match(css, /:where\(\.native-theme-preview\) :is\(\.message\)/);
  assert.match(css, /@media/);
  assert.doesNotMatch(css, /(^|\})\s*\.event\s*\{/);
});

test("预览作用域覆盖逗号分支并将根选择器落到预览容器", () => {
  const css = scopeNativePreviewCss(":root, body { --tone: red } .gift-price, .price { color: var(--tone) }", ".native-theme-preview");
  assert.match(css, /:where\(\.native-theme-preview\):is\(:root, \*\),\s*:where\(\.native-theme-preview\):is\(body, \*\)/);
  assert.match(css, /:where\(\.native-theme-preview\) :is\(\.gift-price\),\s*:where\(\.native-theme-preview\) :is\(\.price\)/);
  assert.doesNotMatch(css, /\.gift-price,\s*\.price/);
});

test("深浅覆盖加预览作用域后仍以文档配色类作为祖先", () => {
  const css = scopeNativePreviewCss(".dark .event .message { color: white; }\n.light .event .message { color: black; }", ".native-theme-preview");
  assert.match(css, /:where\(\.native-theme-preview\) :is\(\.dark \.event \.message\)/);
  assert.match(css, /:where\(\.native-theme-preview\) :is\(\.light \.event \.message\)/);
  assert.doesNotMatch(css, /\.native-theme-preview \.(?:dark|light)/);
});

test("受管理部件的逗号选择器每个分支都保持预览作用域", () => {
  const theme = createBuiltinNativeTheme("native-default");
  theme.settings.visualModel = {
    "gift|all|giftPrice": { color: { source: "custom", value: "#123456" } },
  };
  const css = renderManagedNativeCss(theme.settings, ".native-theme-preview");
  assert.match(css, /\.native-theme-preview \.event\.type-gift \.price\.gift-price/);
});

test("未完成的自定义 CSS 不会中断预览渲染", () => {
  const result = tryScopeNativePreviewCss(".event { color:", ".native-theme-preview");
  assert.equal(result.css, "");
  assert.match(result.error ?? "", /Unclosed block|Unknown word|CssSyntaxError/);
});

test("多分支事件和部件选择器都保留事件与身份作用域", () => {
  const theme = createBuiltinNativeTheme("native-default");
  theme.settings.visualModel = {
    "guard|captain|giftPrice": { color: { source: "custom", value: "#ff0000" } },
  };
  const css = renderManagedNativeCss(theme.settings);
  assert.match(css, /\.event\.type-guard\.guard-level-3 \.price\.gift-price/);
  assert.match(css, /\.event\.type-guard-honor\.guard-level-3 \.price\.gift-price/);
});

test("系统子分类和置顶栏生成可命中的完整作用域", () => {
  const theme = createBuiltinNativeTheme("native-default");
  theme.settings.visualModel = {
    "liveStart|all|message": { color: { source: "custom", value: "#112233" } },
    "warning|admin|stickyEvent": { background: { source: "custom", value: "#334455" } },
  };
  const css = renderManagedNativeCss(theme.settings);
  assert.match(css, /\.event\.live-start \.message/);
  assert.match(css, /\.event\.live-warning\.mod\.event-sticky/);
  assert.doesNotMatch(css, /\.event \.event\.sticky/);
});

test("未知事件范围不会退化为全部事件", () => {
  const theme = createBuiltinNativeTheme("native-default");
  theme.settings.visualModel = {
    "connection|all|message": { color: { source: "custom", value: "#778899" } },
  };
  const css = renderManagedNativeCss(theme.settings);
  assert.doesNotMatch(css, /#778899/);
});

test("事件行使用公共排版参数，礼物图宽度直接设置在部件上", () => {
  const theme = createBuiltinNativeTheme("native-default");
  theme.settings.visualModel = {
    "all|all|row": {
      fontFamily: { source: "custom", value: "Microsoft YaHei UI" },
      fontSize: { source: "custom", value: 28 },
      lineHeight: { source: "custom", value: 1.5 },
      gap: { source: "custom", value: 9 },
      color: { source: "custom", value: "#123456" },
      background: { source: "custom", value: "#654321" },
    },
    "gift|all|giftImage": { width: { source: "custom", value: 36 } },
  };
  const css = renderManagedNativeCss(theme.settings);
  assert.match(css, /--event-font-family: "Microsoft YaHei UI"/);
  assert.match(css, /--event-font-size: 28px/);
  assert.match(css, /--event-line-height: 1\.5/);
  assert.match(css, /--event-gap: 9px/);
  assert.match(css, /--message-color: #123456/);
  assert.match(css, /--event-background: #654321/);
  assert.match(css, /\.event\.type-gift \.gift-icon,[\s\S]*\.event\.type-lottery \.gift-icon \{\s*width: 36px;/);
});

test("边框宽度会同时建立可见边框样式", () => {
  const theme = createBuiltinNativeTheme("native-default");
  theme.settings.visualModel = {
    "all|all|message": {
      borderWidth: { source: "custom", value: 2 },
      borderColor: { source: "custom", value: "#abcdef" },
    },
  };
  const css = renderManagedNativeCss(theme.settings);
  assert.match(css, /border-width: 2px/);
  assert.match(css, /border-style: solid/);
  assert.match(css, /border-color: #abcdef/);
});

test("文本媒体和容器只输出各自可消费的属性", () => {
  const theme = createBuiltinNativeTheme("native-default");
  theme.settings.visualModel = {
    "all|all|message": {
      visible: { source: "custom", value: true }, fontFamily: { source: "custom", value: "MiSans TC" },
      fontSize: { source: "custom", value: 24 }, lineHeight: { source: "custom", value: 1.6 },
      color: { source: "custom", value: "#123456" }, width: { source: "custom", value: 999 },
    },
    "all|all|avatar": {
      width: { source: "custom", value: 32 }, height: { source: "custom", value: 32 },
      marginY: { source: "custom", value: 3 }, fontSize: { source: "custom", value: 99 },
    },
    "all|all|content": {
      paddingX: { source: "custom", value: 4 }, paddingY: { source: "custom", value: 5 },
      marginX: { source: "custom", value: 6 }, marginY: { source: "custom", value: 7 },
      gap: { source: "custom", value: 8 }, borderRadius: { source: "custom", value: 9 },
    },
  };
  const css = renderManagedNativeCss(theme.settings);
  assert.match(css, /\.event \.message \{[\s\S]*display: revert-layer;[\s\S]*font-family: "MiSans TC",[\s\S]*font-size: 24px;[\s\S]*line-height: 1\.6;[\s\S]*color: #123456;/);
  assert.doesNotMatch(css, /\.event \.message \{[\s\S]*width: 999px/);
  assert.match(css, /\.event \{[\s\S]*--avatar-size: 32px/);
  assert.match(css, /\.event \.avatar \{[\s\S]*margin-block: 3px/);
  assert.doesNotMatch(css, /\.event \.avatar \{[\s\S]*font-size: 99px/);
  assert.match(css, /\.event \.content \{[\s\S]*padding-inline: 4px;[\s\S]*padding-block: 5px;[\s\S]*margin-inline: 6px;[\s\S]*margin-block: 7px;[\s\S]*gap: 8px;[\s\S]*border-radius: 9px/);
});

test("更新受管理 CSS 保留未知规则和注释", () => {
  const source = "/* 用户说明 */\n.unknown { filter: blur(1px); }";
  const result = replaceManagedNativeCss(source, createDefaultEventStyleSettings());
  assert.match(result, /用户说明/);
  assert.match(result, /\.unknown \{ filter: blur\(1px\); \}/);
  assert.equal((result.match(/danmu-managed:start/g) ?? []).length, renderManagedNativeCss(createDefaultEventStyleSettings()) ? 1 : 0);
  const again = replaceManagedNativeCss(result, createDefaultEventStyleSettings());
  assert.equal(again, result);
});

test("控件修改只更新目标声明并保留相邻内容", () => {
  const previous = createBuiltinNativeTheme("native-default").settings;
  previous.visualModel = { common: {
    "all|all|message": {
      fontSize: { source: "custom", value: { mode: "fixed", value: 14 } },
      marginX: { source: "custom", value: { mode: "fixed", value: 2 } },
    },
  }, light: {}, dark: {} };
  const next = structuredClone(previous);
  next.visualModel.common["all|all|message"].fontSize.value = { mode: "base-relative", ratio: 1.125 };
  const source = `/* 前置说明 */\n/* visual:common|all|all|message */\n.event .message {\n  font-size: 14px; /* 保留这个注释 */\n  margin-inline: 0.125rem;\n  filter: blur(1px);\n}\n.unknown { order: 2; }`;
  const result = patchManagedNativeCss(source, previous, next);
  assert.equal(result, `/* 前置说明 */\n/* visual:common|all|all|message */\n.event .message {\n  font-size: calc(var(--event-font-size, 16px) * 1.125); /* 保留这个注释 */\n  margin-inline: 0.125rem;\n  filter: blur(1px);\n}\n.unknown { order: 2; }`);
});

test("恢复继承只删除目标声明的全部重复项", () => {
  const previous = createBuiltinNativeTheme("native-default").settings;
  previous.visualModel = { common: {
    "all|all|message": {
      fontSize: { source: "custom", value: { mode: "fixed", value: 14 } },
      color: { source: "custom", value: "#123456" },
    },
  }, light: {}, dark: {} };
  const next = structuredClone(previous);
  delete next.visualModel.common["all|all|message"].fontSize;
  const source = `/* visual:common|all|all|message */\n.event .message { font-size: 12px; color: #123456; font-size: 14px; }`;
  assert.equal(
    patchManagedNativeCss(source, previous, next),
    `/* visual:common|all|all|message */\n.event .message { color: #123456; }`,
  );
});

test("用户名遮罩不写入通用CSS，避免影响现场与回看", () => {
  const theme = createBuiltinNativeTheme("native-default");
  theme.settings.display.maskUsername = true;
  const css = renderManagedNativeCss(theme.settings);
  assert.doesNotMatch(css, /content: "\*\*\*"|filter:\s*blur|font-size:\s*0/);
});

test("礼物和系统一级分类覆盖各自全部公开事件类型", () => {
  const theme = createBuiltinNativeTheme("native-default");
  theme.settings.eventVisibility.categories.gift = false;
  theme.settings.eventVisibility.categories.system = false;
  const css = renderManagedNativeCss(theme.settings);
  assert.match(css, /\.theme-target-obs \.event\.type-gift, \.theme-target-obs \.event\.type-redpocket, \.theme-target-obs \.event\.type-lottery/);
  assert.match(css, /\.theme-target-obs \.event\.type-system:where\(:not\(\.system-cover-audit\)\), \.theme-target-obs \.event\.type-live-status/);
  assert.doesNotMatch(css, /, \.event\.system-cover-audit/);
});

test("旧开播下播值不一致时保留冲突提示且不继续暴露封面审核", () => {
  const visibility = normalizeNativeEventVisibility({ children: { liveStart: true, liveEnd: false, coverAudit: false } });
  assert.equal(visibility.legacyLiveStatusConflict, true);
  assert.equal(visibility.children.liveStatus, true);
  assert.equal("liveStart" in visibility.children, false);
  assert.equal("liveEnd" in visibility.children, false);
  assert.equal("coverAudit" in visibility.children, false);
});

import { readManagedNativeEventVisibility } from '../src/themes/nativeManagedCss.ts';
test('旧发布主题只从受控区块恢复事件开关',()=>{const settings=createDefaultEventStyleSettings();settings.eventVisibility=normalizeNativeEventVisibility({categories:{interaction:false},children:{normal:false}});const css=renderManagedNativeCss(settings);const restored=readManagedNativeEventVisibility(css+'\n.event.type-chat {display:none}');assert.equal(restored.categories.interaction,false);assert.equal(restored.children.normal,false);assert.equal(restored.categories.danmaku,true);assert.equal(readManagedNativeEventVisibility('.event.type-chat {display:none}'),undefined);});

test('原生组合身份的可视化颜色遵守身份优先级而非写入顺序', async () => {
  const {createRequire}=await import('node:module');
  const {JSDOM}=createRequire(import.meta.url)('../vendor/blivechat/node_modules/jsdom');
  for(const reverse of [false,true]){
    const settings=createBuiltinNativeTheme('native-default').settings;
    const entries=[['all|captain|username',{color:{source:'custom',value:'#14a032'}}],['all|admin|username',{color:{source:'custom',value:'#e6780a'}}]];
    settings.visualModel={common:Object.fromEntries(reverse?entries.reverse():entries),light:{},dark:{}};
    const dom=new JSDOM('<style></style><div class="event guard-level-3 mod"><span class="username">房管舰长</span></div>');
    try{
      const sheet=dom.window.document.querySelector('style'),name=dom.window.document.querySelector('.username');
      sheet.textContent=renderManagedNativeCss(settings);
      assert.equal(dom.window.getComputedStyle(name).color,'rgb(20, 160, 50)');
      settings.display.identityPriority=['anchor','admin','viceroy','admiral','captain','normal'];
      sheet.textContent=renderManagedNativeCss(settings);
      assert.equal(dom.window.getComputedStyle(name).color,'rgb(230, 120, 10)');
      const override=dom.window.document.createElement('style');override.textContent='.event .username {color:rgb(1,2,3)!important}';dom.window.document.head.append(override);
      assert.equal(dom.window.getComputedStyle(name).color,'rgb(1, 2, 3)');
    }finally{dom.window.close()}
  }
});


test('明确开启的互动大类可从发布 CSS 恢复',()=>{
  const settings=createDefaultEventStyleSettings();
  settings.eventVisibility=normalizeNativeEventVisibility({categories:{interaction:true}});
  assert.equal(readManagedNativeEventVisibility(renderManagedNativeCss(settings)).categories.interaction,true);
});
