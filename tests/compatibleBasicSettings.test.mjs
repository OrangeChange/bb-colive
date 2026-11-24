import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

let vite, surfaces, defaults, PanelSwitch, UiSelect, resolveDefault, sourceConfig, EventSettings, eventPolicy, blcConfig, MsgType;
before(async () => {
  vite = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-compatibleBasicSettings.test.mjs", root: fileURLToPath(new URL("..", import.meta.url)), configFile: false, esbuild: { jsx: "automatic" }, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null }, appType: "custom", logLevel: "silent" });
  for (const mode of ["blivechat", "openlive", "laplace"]) await vite.ssrLoadModule(`/src/compat/${mode}/register.tsx`);
  ({ getCompatibleThemeEditingSurface: surfaces } = await vite.ssrLoadModule("/src/components/CompatibleThemePreview.tsx"));
  ({ createDefaultCompatibleThemeSettings: defaults } = await vite.ssrLoadModule("/src/themes/compatThemeSettings.ts"));
  ({ PanelSwitch } = await vite.ssrLoadModule("/src/components/voicePanelPrimitives.tsx"));
  ({ UiSelect } = await vite.ssrLoadModule("/src/components/ui/Select.tsx"));
  ({ resolveCompatibleCodeDefault: resolveDefault } = await vite.ssrLoadModule("/src/themes/compatThemeCapabilities.ts"));
  ({ createOpenLiveSourceConfig: sourceConfig } = await vite.ssrLoadModule("/src/compat/openlive/sourceConfig.ts"));
  ({ createBlivechatSourceConfig: blcConfig } = await vite.ssrLoadModule("/src/compat/blivechat/sourceConfig.ts"));
  ({ CompatibleThemeEventSettings: EventSettings } = await vite.ssrLoadModule("/src/components/CompatibleThemeEventSettings.tsx"));
  eventPolicy = await vite.ssrLoadModule("/src/themes/compatibleEventVisibility.ts");
  ({ MsgType } = await vite.ssrLoadModule("/src/protocol/types.ts"));
});

test("三版事件组清空只改本组，大类不禁用副窗口细项，能力符合事件矩阵", () => {
  for (const mode of ["blivechat", "blivechat-open", "laplace"]) {
    let settings = defaults(mode);
    const initialFollow = eventPolicy.normalizeCompatibleEventVisibility(mode, settings.eventVisibility).children.follow;
    const render = () => EventSettings({ document: { mode, settings }, onSettingsChange: next => { settings = next; } });
    const section = label => nodes(render()).find(node => node.type === "section" && node.props["aria-label"] === label);
    const action = (group, label) => nodes(section(group)).find(node => node.type === "button" && node.props.children === label).props.onClick();
    const toggle = label => nodes(render()).find(node => node.type === PanelSwitch && node.props.label === label).props.onChange();
    action("礼物细项", "清空");
    assert.equal(settings.eventVisibility.categories.gift, true);
    assert.equal(settings.eventVisibility.categories.superchat, true);
    assert.equal(settings.eventVisibility.children.free, false);
    assert.equal(settings.eventVisibility.children.follow, initialFollow);
    toggle("礼物");
    assert.ok(nodes(section("礼物细项")).filter(node => node.type === PanelSwitch).every(node => !node.props.disabled));
    toggle("礼物");
    assert.equal(settings.eventVisibility.children.free, false);
    action("礼物细项", "全选");
    assert.equal(settings.eventVisibility.children.free, true);
    const scopes = eventPolicy.compatibleEventScopes(mode);
    assert.equal(scopes.some(scope => scope.id === "system"), mode === "laplace");
    assert.deepEqual(scopes.find(scope => scope.id === "interaction")?.children.map(child => child.id) ?? [], mode === "laplace" ? ["enter", "follow", "share", "specialFollow", "mutualFollow", "like"] : mode === "blivechat-open" ? ["like"] : []);
  }
});

test("主题事件准入区分礼物、SC、大航海与子项，默认配置恢复宿主过滤", () => {
  const visibility = { categories: { gift: false }, children: { free: false, like: false, userMute: false } };
  for (const mode of ["blivechat", "blivechat-open", "laplace"]) {
    const allows = msgType => eventPolicy.isCompatibleThemeEventVisible(mode, visibility, { msgType });
    assert.equal(allows(MsgType.Gift), false);
    assert.equal(allows(MsgType.SuperChat), true);
    assert.equal(allows(MsgType.GuardBuy), true);
  }
  assert.equal(eventPolicy.isLaplaceThemeSampleVisible(visibility, { type: "user-block" }), false);
  assert.equal(eventPolicy.isLaplaceThemeSampleVisible(visibility, { type: "live-start" }), true);
  for (const config of [blcConfig, sourceConfig]) {
    assert.equal(config({ eventVisibility: visibility }).hostShowFreeGift, false);
    assert.equal(config({}).hostShowFreeGift, true);
  }
});

test("LAPLACE 首次修改单一事件不会开启来源默认关闭的其他事件", () => {
  let settings = defaults("laplace");
  const render = () => EventSettings({ document: { mode: "laplace", settings }, onSettingsChange: next => { settings = next; } });
  const before = eventPolicy.laplaceThemeVisibilitySettings(settings.eventVisibility);
  assert.equal(before.showEnterEvent, false);
  assert.equal(before.showFollowEvent, false);
  assert.equal(before.showGiftFree, false);
  const superchat = nodes(render()).find(node => node.type === PanelSwitch && node.props.label === "醒目留言");
  superchat.props.onChange();
  const after = eventPolicy.laplaceThemeVisibilitySettings(settings.eventVisibility);
  assert.equal(after.showSuperChat, false);
  assert.equal(after.showEnterEvent, before.showEnterEvent);
  assert.equal(after.showFollowEvent, before.showFollowEvent);
  assert.equal(after.showGiftFree, before.showGiftFree);
});
after(async () => { await vite?.close(); });

function nodes(element) {
  if (!element || typeof element !== "object") return [];
  return [element, ...[element.props?.children].flat(Infinity).flatMap(nodes)];
}
function editor(mode, extra = {}) {
  let settings = { ...defaults(mode), ...extra };
  const render = () => {
    const element = surfaces(mode).renderBasicControls({ document: { mode, settings }, onSettingsChange: next => { settings = next; } });
    return element.type(element.props);
  };
  return {
    render,
    get settings() { return settings; },
    toggle(label) {
      const control = nodes(render()).find(node => node.type === PanelSwitch && node.props.label === label);
      assert.ok(control, `缺少开关：${label}`);
      control.props.onChange();
    },
    number(label, value) {
      const row = nodes(render()).find(node => node.type === "label" && nodes(node).some(child => child.type === "span" && child.props.children === label));
      const input = nodes(row).find(node => node.type === "input");
      assert.ok(input, `缺少数值控件：${label}`);
      input.props.onChange({ target: { value: String(value) } });
    },
    select(label, value) {
      const input = nodes(render()).find(node => node.type === UiSelect && node.props.ariaLabel === label);
      assert.ok(input, `缺少选择控件：${label}`);
      input.props.onValueChange(value);
    },
    text(label, value) {
      const row = nodes(render()).find(node => node.type === "label" && nodes(node).some(child => child.type === "span" && child.props.children === label));
      const input = nodes(row).find(node => node.type === "input" && node.props.type !== "number");
      assert.ok(input, `缺少文本控件：${label}`);
      input.props.onChange({ target: { value } });
    },
  };
}

test("三版基础页复用原生开关、分组和数值样式，修改保留已有草稿字段", () => {
  for (const mode of ["blivechat", "blivechat-open", "laplace"]) {
    const visualAuthored = { common: { "all|all|main|message": ["fontSize"] }, light: {}, dark: {} };
    const e = editor(mode, { visualAuthored, eventVisibility: { categories: { gift: false } } });
    const html = renderToStaticMarkup(e.render());
    assert.match(html, /role="switch"/);
    assert.doesNotMatch(html, /type="checkbox"/);
    assert.match(html, /native-theme-toggle-grid/);
    assert.match(html, /信息元素/);
    assert.match(html, /模式特色/);
    assert.doesNotMatch(html, />礼物显示</);
    assert.match(html, /native-theme-feature-grid/);
    e.toggle("时间");
    assert.equal(e.settings.showTimestamp, true);
    assert.deepEqual(e.settings.visualAuthored, visualAuthored);
    assert.deepEqual(e.settings.eventVisibility, { categories: { gift: false } });
  }
});

test("BLC 的 G/F 独立设置，礼物描述默认关闭且不重置比例", () => {
  const e = editor("blivechat");
  assert.equal(e.settings.globalScale, 1);
  assert.equal(e.settings.fontScale, 1);
  assert.equal(e.settings.showGiftName, false);
  e.number("整体比例", 1.5);
  assert.equal(e.settings.fontScale, 1);
  e.number("字体比例", 1.5);
  e.toggle("显示礼物名称与数量");
  assert.equal(e.settings.showGiftName, true);
  assert.equal(e.settings.globalScale, 1.5);
  assert.equal(e.settings.fontScale, 1.5);
});

test("开放版不提供皮肤和大表情重复入口，编辑保留既有皮肤及尺寸", () => {
  for (const skin of ["none", "default"]) {
    const e = editor("blivechat-open", { skin, emoticonSize: 123 });
    assert.doesNotMatch(renderToStaticMarkup(e.render()), /来源默认皮肤|大表情大小|基准字号/);
    assert.equal(e.settings.showGiftInfo, true);
    e.toggle("显示礼物名称与数量");
    assert.equal(e.settings.showGiftInfo, false);
    assert.equal(e.settings.emoticonSize, 123);
    assert.equal(sourceConfig(e.settings).emoticonSize, 123);
    assert.equal(e.settings.skin, skin);
    assert.equal(sourceConfig(e.settings).skin, skin);
    const part = Object.values(surfaces("blivechat-open").capability.parts).find(part => part.settingByProperty?.width === "emoticonSize");
    assert.ok(part);
    assert.equal(resolveDefault(part, "danmaku", "main", "width", e.settings), 123);
  }
});

test("LAPLACE 基础设置不另存输出配色，场景与独立身份开关保留各自状态", () => {
  const e = editor("laplace", { sceneName: "blue" });
  assert.equal(e.settings.showGiftHighlightAbove, 30);
  assert.equal(e.settings.baseFontSize, 20);
  assert.equal(e.settings.classicElementScope, false);
  e.number("基准字号", 24);
  assert.equal(nodes(e.render()).some(node => node.type === UiSelect && node.props.ariaLabel === "配色"), false);
  assert.doesNotMatch(renderToStaticMarkup(e.render()), /aria-label="场景"/);
  e.toggle("头像");
  assert.equal(e.settings.showAvatar, false);
  assert.equal(e.settings.showUsername, true);
  e.toggle("用户名");
  e.toggle("经典控制范围");
  assert.equal(e.settings.showAvatar, false);
  assert.equal(e.settings.showUsername, false);
  e.toggle("解析剧透内容");
  e.toggle("粉丝牌");
  e.number("礼物高亮金额", 100);
  assert.equal(e.settings.baseFontSize, 24);
  assert.equal(e.settings.colorScheme, "light");
  assert.equal(e.settings.sceneName, "blue");
  assert.equal(e.settings.showSpoiler, false);
  assert.equal(e.settings.showMedal, false);
  assert.equal(e.settings.showGiftHighlightAbove, 100);
  assert.equal(e.settings.showGiftStickyAbove, undefined);
  assert.equal(e.settings.showGiftPriceAbove, undefined);
});

test("BLC 信息元素可分别隐藏房管、大航海标记，切换不影响用户名", () => {
  for (const mode of ["blivechat", "blivechat-open"]) {
    const e = editor(mode);
    e.toggle("房管标记");
    e.toggle("大航海标记");
    assert.equal(e.settings.showModBadge, false);
    assert.equal(e.settings.showGuardBadge, false);
    assert.equal(e.settings.showUsername, true);
  }
});

test("开放版粉丝牌条件各自保存且不重置来源皮肤", () => {
  const e = editor("blivechat-open", { skin: "default" });
  e.toggle("只显示当前直播间粉丝牌");
  e.toggle("只显示已点亮粉丝牌");
  assert.equal(e.settings.showMedalCurrentRoomOnly, true);
  assert.equal(e.settings.showMedalLightenedOnly, false);
  assert.equal(e.settings.skin, "default");
});


test("三版用户名打码名称与说明一致且只修改该开关", () => {
  for (const mode of ["blivechat", "blivechat-open", "laplace"]) {
    const e = editor(mode);
    const before = structuredClone(e.settings);
    const html = renderToStaticMarkup(e.render());
    assert.match(html, /用户名打码/);
    assert.doesNotMatch(html, /隐藏用户名/);
    e.toggle("用户名打码");
    assert.deepEqual(e.settings, { ...before, maskUsername: !before.maskUsername });
  }
});

test("产品来源预览入口传递公共策略和目标，全部部件不修改草稿", async () => {
  const captureKey = "__compatiblePreviewBoundary";
  const received = [];
  globalThis[captureKey] = received;
  const server = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-compatibleBasicSettings.test.mjs",
    configFile: false, esbuild: { jsx: "automatic" },
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null }, appType: "custom", logLevel: "silent",
    plugins: [{ name: "preview-boundary", enforce: "pre", transform(_code, id) {
      const name = id.replaceAll("\\", "/");
      for (const component of ["BlivechatSource", "OpenLiveSource"]) {
        if (name.endsWith(`/${component}Surface.tsx`)) return `export function ${component}Preview(props) { globalThis.${captureKey}.push(props); return null; }`;
      }
    } }],
  });
  try {
    for (const mode of ["blivechat", "openlive"]) await server.ssrLoadModule(`/src/compat/${mode}/register.tsx`);
    const { getCompatibleThemeEditingSurface: getSurface } = await server.ssrLoadModule("/src/components/CompatibleThemePreview.tsx");
    for (const mode of ["blivechat", "blivechat-open"]) {
      const document = { mode, settings: defaults(mode), styles: { baseCss: "", visualCss: "", customCss: "" } };
      const before = structuredClone(document);
      const previewPolicy = { capacity: 2, stickySettings: { enabled: false, obsEnabled: true, maxCount: 2, giftThreshold: 50 } };
      renderToStaticMarkup(getSurface(mode).renderer({ document, thumbnail: false, previewTarget: "obs", previewMode: "design", displayAll: true, previewPolicy, scrollDirection: "top", contentAlignment: "bottom" }));
      const props = received.at(-1);
      assert.equal(props.previewPolicy, previewPolicy);
      assert.equal(props.previewTarget, "obs");
      assert.equal(props.scrollDirection, "top");
      assert.equal(props.contentAlignment, "bottom");
      assert.deepEqual(document, before);
    }
  } finally { await server.close(); delete globalThis[captureKey]; }
});


test("LAPLACE 默认关闭互动大类，六项互动全部保留开启", () => {
  const visibility = eventPolicy.normalizeCompatibleEventVisibility("laplace", undefined);
  assert.equal(visibility.categories.interaction, false);
  for (const key of ["enter","follow","share","specialFollow","mutualFollow","like"]) assert.equal(visibility.children[key],true);
  assert.equal(visibility.children.free,false);
});
