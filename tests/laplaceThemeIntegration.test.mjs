import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

let vite, modules;
before(async () => {
  vite = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-laplaceThemeIntegration.test.mjs",optimizeDeps:{noDiscovery:true,include:[]}, configFile: false, esbuild: { jsx: "automatic" }, server: { middlewareMode: true, watch: null }, appType: "custom", logLevel: "silent" });
  modules = {
    projection: await vite.ssrLoadModule("/src/compat/laplace/projection.ts"),
    components: await vite.ssrLoadModule("/src/compat/laplace/components.tsx"),
    theme: await vite.ssrLoadModule("/src/compat/laplace/theme.ts"),
    cssScope: await vite.ssrLoadModule("/src/compat/blivechat/cssScope.ts"),
    policy: await vite.ssrLoadModule("/src/compat/laplace/productPresentationPolicy.ts"),
    settings: await vite.ssrLoadModule("/src/themes/compatThemeSettings.ts"),
    capabilities: await vite.ssrLoadModule("/src/themes/compatThemeCapabilities.ts"),
    managed: await vite.ssrLoadModule("/src/themes/compatManagedCss.ts"),
    runtime: await vite.ssrLoadModule("/src/compat/laplace/runtime.tsx"),
    rendererContext: await vite.ssrLoadModule("/src/compat/laplace/renderer/runtime-context.mjs"),
    adapters: await vite.ssrLoadModule("/src/themes/themeModeAdapters.ts"),
    register: await vite.ssrLoadModule("/src/compat/laplace/register.tsx"),
    samples: await vite.ssrLoadModule("/src/compat/laplace/renderer/samples.ts"),
    styleLoader: await vite.ssrLoadModule("/src/compat/laplace/styleLoader.ts"),
  };
});
after(async () => vite?.close());

const base = { roomId: 1, ts: 1700000000000, user: { uid: "1", uname: "用户", avatar: "/media/noface.gif", guardLevel: 0 } };
const laplaceSource = readFileSync(resolve("src/compat/laplace/source.css"), "utf8");
test("内置 LAPLACE 模板随产品交付且字节与目录契约一致", () => {
  for (const [name, expected] of Object.entries(modules.styleLoader.LAPLACE_TEMPLATE_HASHES)) {
    const path = resolve(`public/laplace/templates/${name}.css`);
    assert.equal(existsSync(path), true, `${name} 模板缺失`);
    assert.equal(createHash("sha256").update(readFileSync(path)).digest("hex"), expected, `${name} 模板字节不匹配`);
  }
});
test("六互动与支持事件映射到真实 LAPLACE 类型", () => {
  const kinds = [["entry", "interaction"], ["follow", "interaction"], ["share", "interaction"], ["specialFollow", "interaction"], ["mutualFollow", "interaction"], ["like", "like-click"]];
  for (const [interactKind, type] of kinds) assert.equal(modules.components.projectDanmakuToLaplace({ ...base, id: interactKind, msgType: 10, interactKind, likeCount: 3 })?.type, type);
  assert.equal(modules.components.projectDanmakuToLaplace({ ...base, id: "guard", msgType: 3, guard: { level: 1, count: 1, unit: "月", action: "开通", priceRmb: 198 } })?.type, "toast");
  for (const [msgType, type] of [[22,"live-start"],[23,"live-end"],[18,"user-block"],[19,"room-mute-on"],[21,"room-name-update"],[24,"live-warning"],[25,"live-cutoff"]]) assert.equal(modules.components.projectDanmakuToLaplace({ ...base, id: type, msgType, text: type })?.type, type);
});

test("红包投喂不冒充活动，盲盒支付与开出价值分离", () => {
  const feed = modules.components.projectDanmakuToLaplace({ ...base, id: "feed", msgType: 8, text: "投喂", gift: { id: 9, name: "红包投喂", count: 1, total: 1000, coinType: "gold" } });
  assert.equal(feed.type, "gift");
  const event = modules.components.projectDanmakuToLaplace({ ...base, id: "blind", msgType: 1, gift: { id: 1, name: "开出礼物", count: 2, price: 2500, total: 5000, totalRmb: 5, paymentRmb: 10, coinType: "gold", blindGiftName: "盲盒", blindPriceRmb: 10, blindHitPriceRmb: 2.5 } });
  assert.equal(event.blindGift.name, "盲盒");
  assert.equal(event.priceNormalized, 10);
  assert.equal(event.giftName, "开出礼物");
  assert.equal(event.giftPrice, 2.5);
  assert.equal(event.giftAmount, 2);
  assert.equal(event.blindGift.gift_tip_price, 2500);
  const html = renderToStaticMarkup(React.createElement(modules.components.LaplaceEvent, { event: { ...base, id: "blind", msgType: 1, gift: { id: 1, name: "开出礼物", count: 2, total: 5000, paymentRmb: 10, coinType: "gold", blindGiftName: "盲盒", blindHitPriceRmb: 2.5 } }, placement: "main", settings: modules.settings.createDefaultCompatibleThemeSettings("laplace") }));
  assert.match(html, /price-actual[\s\S]*price-figure">10/); assert.match(html, /price-currency">¥<\/span><span class="price-figure">5/);
});

test("红包、SC、大航海与系统事实字段遵守来源契约", () => {
  const settings = modules.settings.createDefaultCompatibleThemeSettings("laplace");
  const start = modules.components.projectDanmakuToLaplace({ ...base, id: "red", msgType: 6, lottery: { id: "r", awards: undefined } });
  assert.deepEqual(start.list, []);
  assert.doesNotThrow(() => renderToStaticMarkup(React.createElement(modules.components.LaplaceEvent, { event: { ...base, id: "red", msgType: 6, lottery: { id: "r" } }, placement: "main", settings })));
  const result = modules.components.projectDanmakuToLaplace({ ...base, id: "winner", msgType: 7, lottery: { id: "r", winners: [{ uid: 2, uname: "中奖者", avatar: "a", giftId: 3 }] } });
  assert.deepEqual(result.list, [[2, "中奖者", "a", 3]]);
  const guard = modules.components.projectDanmakuToLaplace({ ...base, id: "guard", msgType: 3, guard: { level: 1, count: 2, unit: "月", action: "开通", priceRmb: 198 } });
  assert.equal(guard.toastType, 3); assert.equal(typeof guard.toastName, "string");
  const sc = modules.components.projectDanmakuToLaplace({ ...base, id: "sc", msgType: 2, sc: { price: 30, message: "正文", trans: "译文", duration: 60 } });
  assert.equal(sc.transMark, 1);
  for (const msgType of [24, 25]) assert.equal(modules.components.projectDanmakuToLaplace({ ...base, id: `s${msgType}`, msgType, text: "系统" }).roomId, 1);
  const sourcedWarning = modules.projection.projectLaplaceEvent({ ...base, id: "source-warning", msgType: 24, laplace: { sourceMode: "direct", sourceCommand: "WARNING", platform: "bilibili", timestampUnit: "milliseconds", timestampFallback: false, event: { type: "live-warning" } } }, { roomId: 1, generation: 1 }, 1, base.ts);
  assert.equal(sourcedWarning.event.roomId, 1);
});

test("B 模型只缩放相对声明，固定 rem 与手写 px 保持", () => {
  const settings = modules.settings.createDefaultCompatibleThemeSettings("laplace");
  assert.match(modules.theme.createLaplaceBaseCss({ ...settings, baseFontSize: 20 }), /--event-font-size:20px/);
  assert.match(modules.theme.createLaplaceBaseCss({ ...settings, baseFontSize: 24 }), /--event-font-size:24px/);
  const css = `${modules.theme.createLaplaceBaseCss({ ...settings, baseFontSize: 24 })}\n.fixed{gap:.25rem;font-size:17px}`;
  assert.doesNotMatch(css, /:root\{[^}]*(?:^|;)font-size:24px/);
  assert.match(css, /gap:\.25rem/); assert.match(css, /font-size:17px/);
  const avatar = modules.theme.LAPLACE_CAPABILITY.parts.avatar;
  const text = modules.theme.LAPLACE_CAPABILITY.parts.message;
  assert.equal(modules.capabilities.resolveCompatibleCodeDefault(avatar, "gift", "main", "width", { baseFontSize: 20 }), 40);
  assert.equal(modules.capabilities.resolveCompatibleCodeDefault(avatar, "gift", "main", "width", { baseFontSize: 24 }), 48);
  assert.equal(modules.capabilities.resolveCompatibleCodeDefault(text, "danmaku", "main", "fontSize", { baseFontSize: 24 }), 24);
  const visual = { common: { "danmaku|all|main|message": { lineHeight: { source: "custom", value: 1.4 } } }, light: {}, dark: {} };
  assert.match(modules.managed.renderCompatibleManagedCss(modules.theme.LAPLACE_CAPABILITY, visual), /line-height: 1\.4;/);
});

test("事件与位置使用来源默认值且文本行高保持无单位", () => {
  const { LAPLACE_CAPABILITY: capability } = modules.theme;
  const defaults = (part, event, placement, property, baseFontSize) =>
    modules.capabilities.resolveCompatibleCodeDefault(capability.parts[part], event, placement, property, { baseFontSize });
  assert.equal(defaults("avatar", "danmaku", "main", "width", 20), 30);
  assert.equal(defaults("avatar", "gift", "main", "width", 20), 40);
  assert.equal(defaults("avatar", "gift", "main", "width", 24), 48);
  assert.equal(defaults("avatar", "superchat", "main", "width", 20), 50);
  assert.equal(defaults("avatar", "guard", "main", "width", 24), 60);
  assert.equal(defaults("amount", "gift", "main", "fontSize", 20), 12);
  assert.equal(defaults("amount", "gift", "main", "fontSize", 24), 14.4);
  assert.equal(defaults("event", "danmaku", "main", "paddingY", 20), 2.5);
  assert.equal(defaults("event", "danmaku", "main", "paddingX", 24), 12);
  const sourceDefaults = modules.theme.createLaplaceBaseCss({ ...modules.settings.createDefaultCompatibleThemeSettings("laplace"), baseFontSize: 20 });
  assert.doesNotMatch(sourceDefaults, /event--gift|event--superchat|event--toast|\.price/);
  assert.match(sourceDefaults, /@layer custom-css/);
  assert.match(laplaceSource, /event--gift\.event-show-as--sticky\{--avatar-size:var\(--event-line-height\);--gift-size:calc\(var\(--event-line-height\) \* 1\.25\)\}/);
  assert.match(laplaceSource, /event--superchat\.event-show-as--sticky\{--avatar-size:var\(--event-line-height\)/);
  assert.match(laplaceSource, /event--toast\.event-show-as--sticky\{--avatar-size:var\(--event-line-height\)/);
  for (const part of ["translation", "amount", "timestamp"])
    assert.equal(capability.parts[part].units.lineHeight, "number");
  assert.equal(capability.parts.fanMedal.codeDefaults.color, "#fff");
  assert.equal(capability.parts.fanMedal.codeDefaults.background, "#a0a2a8");
  assert.deepEqual(capability.parts.timestamp.events.includes("superchat"), false);
  assert.deepEqual(capability.parts.timestamp.events.includes("guard"), false);
});

test("dashboard 包装器保留正文用户名与系统文本，中奖用户名仅由提示层呈现", () => {
  const settings = modules.settings.createDefaultCompatibleThemeSettings("laplace");
  const message = renderToStaticMarkup(React.createElement(modules.components.LaplaceEvent, {
    event: { ...base, id: "dashboard-message", msgType: 0, text: "正文" }, placement: "main", settings, mode: "dashboard",
  }));
  assert.match(message, /用户/);
  const system = renderToStaticMarkup(React.createElement(modules.components.LaplaceEvent, {
    event: { ...base, id: "dashboard-system", msgType: 18, text: "系统文本" }, placement: "main", settings, mode: "dashboard",
  }));
  assert.match(system, /禁言/);
  const winner = renderToStaticMarkup(React.createElement(modules.components.LaplaceEvent, {
    event: { ...base, id: "dashboard-winner", msgType: 7, lottery: { id: "r", awardName: "红包", winners: [{ uid: "2", uname: "中奖者" }] } }, placement: "main", settings, mode: "dashboard",
  }));
  assert.match(winner, /data-user-uid="2"/);
  assert.doesNotMatch(winner.replace(/<[^>]*>/g, ''), /中奖者/);
});

test("用户名遮罩覆盖回复目标且中奖名单不把用户名写入正文", () => {
  const settings = { ...modules.settings.createDefaultCompatibleThemeSettings("laplace"), maskUsername: true };
  const reply = renderToStaticMarkup(React.createElement(modules.components.LaplaceEvent, {
    event: { ...base, id: "reply", msgType: 0, text: "回复", replyTo: { uid: "2", uname: "回复对象", avatar: "", guardLevel: 0 } }, placement: "main", settings,
  }));
  assert.doesNotMatch(reply, /用户|回复对象/);
  assert.match(reply, /\*\*\*/);
  const winner = renderToStaticMarkup(React.createElement(modules.components.LaplaceEvent, {
    event: { ...base, id: "winner-mask", msgType: 7, lottery: { id: "r", awardName: "红包", winners: [{ uid: "2", uname: "中奖者" }] } }, placement: "main", settings, mode: "dashboard",
  }));
  assert.doesNotMatch(winner.replace(/<[^>]*>/g, ''), /中奖者/);
  assert.match(winner, /data-user-uid="2"/);
});

test("时间戳 CSS 命中当前 root 且正式结构包含来源场景容器", () => {
  const settings = modules.settings.createDefaultCompatibleThemeSettings("laplace");
  const css = modules.theme.createLaplaceBaseCss({ ...settings, showTimestamp: true });
  const scoped = modules.cssScope.scopeBlivechatCss(css, "laplace:formal");
  assert.match(scoped, /\[data-blivechat-scope="laplace:formal"\]\[data-show-timestamp="true"\] \.timestamp/);
  assert.doesNotMatch(scoped, /\[data-blivechat-scope="laplace:formal"\] \[data-show-timestamp/);
  const html = renderToStaticMarkup(React.createElement(modules.components.LaplaceEventSurface, {
    event: { ...base, id: "surface", msgType: 0, text: "正文" }, placement: "main", settings, mode: "dashboard",
  }));
  assert.match(html, /class="events-list-wrap scene-default"/);
  assert.match(html, /event--message/);
});

test("关闭普通时间不隐藏开播和下播的来源强制时间", () => {
  const document = modules.adapters.createCompatibleThemeModeAdapter("laplace").createBuiltinTheme();
  document.settings = { ...document.settings, showTimestamp: false };
  const css = modules.runtime.composeLaplaceRendererCssSources(document).custom;
  assert.match(css, /\.timestamp:not\(\.inline\)\{display:none!important\}/);
  assert.doesNotMatch(css, /(?:^|[}\s])\.timestamp\{display:none!important\}/);
});

test("礼物资源按房间和礼物匹配本地文件且不受请求尺寸影响", () => {
  const resolved = modules.rendererContext.resolveAsset("https://workers.laplace.cn/bilibili/room-gift-config/25034104?gift=32188&size=320");
  assert.equal(resolved, "/laplace/files/workers.laplace.cn/room-gift-config/25034104/32188.webp");
});

test("预览开奖样例保留官方的中奖者名称", () => {
  const samples = modules.samples.getOriginalSamples("design");
  const names = samples.flatMap(event => event.type === "red-envelope-result"
    ? (event.list ?? []).map(entry => Array.isArray(entry) ? entry[1] : entry?.uname)
    : event.type === "lottery-result" ? (event.list ?? []).map(entry => entry?.uname) : []);
  const original = JSON.parse(readFileSync('src/compat/laplace/renderer/sample-data.json', 'utf8')).design;
  const expected = original.flatMap(event => event.type === 'red-envelope-result' ? event.list.map(entry => entry[1]) : event.type === 'lottery-result' ? event.list.map(entry => entry.uname) : []);
  assert.deepEqual(names, expected);
});

test("正式 wrapper 与 sticky 能力选择器可达且不虚构独立详情区域", () => {
  const main = modules.managed.compatibleSelectorFor(modules.theme.LAPLACE_CAPABILITY, "danmaku|all|main|message", "common");
  const detail = modules.managed.compatibleSelectorFor(modules.theme.LAPLACE_CAPABILITY, "gift|all|detail|message", "common");
  assert.match(main, /^:root:root:root:root :where\(\.event-list \.event--message\)/); assert.match(main, /event--message/);
  assert.match(readFileSync("src/compat/laplace/register.tsx", "utf8"), /className: "laplace-theme-root"/);
  assert.equal(detail, null);
  assert.match(readFileSync("src/compat/laplace/components.tsx", "utf8"), /className: "laplace-detail-root"/);
  assert.match(readFileSync("src/compat/laplace/renderer/stableRoots.ts", "utf8"), /\.gift-sticky-bar/);
  assert.equal(modules.managed.compatibleSelectorFor(modules.theme.LAPLACE_CAPABILITY, "danmaku|all|sticky|message", "common"), null);
});

test("LAPLACE 运行时按目标使用模式、发布投影并保持 OBS 快照路径", async () => {
  const bindingState = new Map(), publications = new Set(), records = new Map();
  const bindings = { async load(){return [...bindingState.values()]}, async bind(v){bindingState.set(v.targetId,v)}, async setDisplayScale(id,s){bindingState.set(id,{...bindingState.get(id),displayScale:s})}, async remove(id){bindingState.delete(id)}, subscribe(){return()=>{}} };
  const windowProjections = [];
  const ports = { async load(){return[]}, async loadTarget(id){return records.get(id)}, async save(v){records.set(v.context.targetId,structuredClone(v))}, async remove(){}, async publish(v){for(const listener of publications)listener(v)}, subscribe(listener){publications.add(listener);return()=>publications.delete(listener)}, async loadBindings(){return[...bindingState.values()]}, subscribeBindings(){return()=>{}}, async publishWindowProjection(v){windowProjections.push(structuredClone(v))} };
  const runtime = modules.runtime.createLaplaceThemeRuntime(bindings, ports); await runtime.start();
  const document = modules.adapters.createCompatibleThemeModeAdapter("laplace").createBuiltinTheme();
  document.settings = { ...document.settings, showTimestamp: true, maskUsername: true };
  const projections = [];
  await runtime.publish(document, { target:"live", targetId:"live", roomId:"1", displayScale:1 }, p => projections.push(p));
  await runtime.publish(document, { target:"windows", targetId:"windows", roomId:"1", displayScale:1 }, p => projections.push(p));
  assert.equal(projections.length, 1);
  assert.equal(windowProjections.length, 1);
  assert.equal(windowProjections[0].projection.displayScale, 1);
  const live = runtime.resolve({target:"live",targetId:"live",roomId:1,placement:"main"});
  const windows = runtime.resolve({target:"windows",targetId:"windows",roomId:1,placement:"main"});
  assert.equal(live.laplaceMode, "dashboard");
  assert.equal(live.rootProps.showTimestamp, false);
  assert.equal(live.listSurface.config.maskUsername, false);
  assert.equal(windows.laplaceMode, "obs");
  assert.equal(windows.rootProps.showTimestamp, true);
  assert.equal(windows.listSurface.config.maskUsername, true);
  await runtime.updateScale("windows", "windows", 1.25, p => projections.push(p));
  assert.equal(projections.length, 1);
  assert.equal(windowProjections.at(-1).projection.displayScale, 1.25);
});

test("剧透与高亮边界保持来源行为", () => {
  const html = renderToStaticMarkup(React.createElement(modules.components.LaplaceEvent, {event:{...base,id:"spoiler",msgType:0,text:"a||b||c"},placement:"main",settings:modules.settings.createDefaultCompatibleThemeSettings("laplace")}));
  assert.match(html, /class="spoiler/);
  assert.equal(modules.policy.productHighlight(29.99, 30), false);
  assert.equal(modules.policy.productHighlight(30, 30), true);
  assert.equal(modules.policy.productHighlight(30.01, 30), true);
});

test("LAPLACE 预览解析后的配色进入事件组件设置", () => {
  assert.equal(typeof modules.rendererContext.resolveLaplaceRenderSettings, "function");
  const resolved = modules.rendererContext.resolveLaplaceRenderSettings(
    { colorScheme: "light", baseFontSize: 20 },
    { colorScheme: "light", baseFontSize: 24 },
    "dark",
  );
  assert.equal(resolved.colorScheme, "dark");
  assert.equal(resolved.baseFontSize, 24);
});

test("LAPLACE 提示内容不参与事件正文布局", () => {
  const handle = modules.rendererContext.jr();
  const html = renderToStaticMarkup(
    React.createElement(modules.rendererContext.ut, { handle },
      React.createElement(React.Fragment, null,
        React.createElement(modules.rendererContext.rt, {
          handle,
          payload: "中奖用户名",
          render: React.createElement("span", null, "头像触发区"),
        }),
        React.createElement(modules.rendererContext.ot, null, "说明内容"),
      ),
    ),
  );
  assert.match(html, /头像触发区/);
  assert.doesNotMatch(html, /中奖用户名|说明内容/);
});

test("LAPLACE 名单保留对应的遮罩与换行规则", () => {
  const css = readFileSync(resolve("public/laplace/product/default.css"), "utf8");
  assert.doesNotMatch(css, /\.event--red-envelope-result \.rewards-items-mask\.is-masked \.rewards-items-wrap\{flex-wrap:nowrap\}/);
  assert.match(css, /\.event--lottery-result \.rewards-items-mask\.is-masked \.rewards-items-wrap\{flex-wrap:nowrap\}/);
});

test("现场关闭剧透后保留双竖线且不生成 spoiler", () => {
  const settings = { ...modules.settings.createDefaultCompatibleThemeSettings("laplace"), showSpoiler: false };
  const html = renderToStaticMarkup(React.createElement(modules.components.LaplaceEvent, {
    event: { ...base, id: "spoiler-off", msgType: 0, text: "正文||剧透||" }, placement: "main", settings, mode: "dashboard",
  }));
  assert.match(html, /正文\|\|剧透\|\|/);
  assert.doesNotMatch(html, /class="spoiler"/);
});

test("副窗口与 OBS 的点亮粉丝牌由 showMedal 控制真实节点", () => {
  const event = { ...base, id: "medal", msgType: 0, text: "正文", user: { ...base.user, medal: { name: "粉丝牌", level: 12, isLighted: true, type: 1 } } };
  const defaults = modules.settings.createDefaultCompatibleThemeSettings("laplace");
  const shown = renderToStaticMarkup(React.createElement(modules.components.LaplaceEvent, { event, placement: "main", settings: { ...defaults, showMedal: true }, mode: "obs" }));
  const hidden = renderToStaticMarkup(React.createElement(modules.components.LaplaceEvent, { event, placement: "main", settings: { ...defaults, showMedal: false }, mode: "obs" }));
  assert.match(shown, /fans-medal/);
  assert.doesNotMatch(hidden, /fans-medal/);
});

test("真实 product component 输出来源 DOM", () => {
  const settings = modules.settings.createDefaultCompatibleThemeSettings("laplace");
  const html = renderToStaticMarkup(React.createElement(modules.components.LaplaceEvent, { event: { ...base, id: "m", msgType: 0, text: "正文" }, placement: "main", settings }));
  assert.match(html, /event--message/); assert.match(html, /username/); assert.match(html, /class="message"/);
});

test("真实注册预览直接挂载 product 文档且旧 dashboard 组件仅作回退证据", () => {
  const document = modules.adapters.createCompatibleThemeModeAdapter("laplace").createBuiltinTheme();
  const preview = renderToStaticMarkup(React.createElement(modules.register.LaplacePreview, { document, thumbnail: false }));
  assert.match(preview, /\/laplace\/product\/index\.html/);
  assert.match(preview, /data-laplace-sample-count="65"/);
  const dashboard = renderToStaticMarkup(React.createElement(modules.components.LaplaceEventSurface, {
    event: { ...base, id: "registered-dashboard", msgType: 0, text: "正文" },
    placement: "main",
    settings: modules.settings.createDefaultCompatibleThemeSettings("laplace"),
    mode: "dashboard",
  }));
  assert.match(dashboard, /events-list-wrap scene-default/);
  assert.match(dashboard, /用户/);
});

test('LAPLACE 动态回退样例不加入房管任免和大航海荣誉', async () => {
  const { DEFAULT_STYLE_PREVIEW_POLICY } = await import('../src/preview/stylePreviewPolicy.ts');
  const { MsgType } = await import('../src/protocol/types.ts');
  const candidates = modules.register.laplaceNativePreviewCandidates({ policy: DEFAULT_STYLE_PREVIEW_POLICY, target: 'windows', displayAll: true, decision: () => 'fallback' });
  assert.ok(candidates.length > 0);
  assert.ok(candidates.every(event => ![MsgType.AdminChange, MsgType.GuardHonor].includes(event.msgType)));
});

test("来源资产映射均指向可构建的 public 输出", () => {
  const locations = JSON.parse(readFileSync(resolve("src/compat/laplace/renderer/asset-locations.json"), "utf8"));
  const map = Object.fromEntries(Object.entries(locations).map(([url,path])=>[url,"/laplace/"+path]));
  assert.ok(Object.keys(map).length >= 53);
  for (const publicPath of Object.values(map)) assert.equal(existsSync(resolve(`public${publicPath}`)), true, publicPath);
});

test("LAPLACE 不把不可解析的远程头像地址送入 DOM", () => {
  const resolved = modules.rendererContext.resolveAsset("https://workers.laplace.cn/bilibili/avatar/open-user-id");
  assert.equal(resolved, "/laplace/files/rsrc.laplace.cn/assets/chat/no-avatar.jpg");
  assert.doesNotMatch(resolved, /unavailable|workers\.laplace/);
});

test("LAPLACE 官网动态礼物在本地保留完整 WebP 动画帧", () => {
  for (const [id, frames] of [[32188, 30], [25, 17], [31115, 17], [32313, 8], [30047, 22], [30732, 34], [34762, 9]]) {
    for (const size of [320, 960]) {
      const url = `https://workers.laplace.cn/bilibili/room-gift-config/25034104?gift=${id}&size=${size}`;
      const bytes = readFileSync(resolve(`public${modules.rendererContext.resolveAsset(url)}`));
      assert.equal(bytes.toString("ascii", 8, 12), "WEBP", `礼物 ${id} 必须使用官网原始动态图`);
      let frameCount = 0;
      for (let offset = 12; offset + 8 <= bytes.length;) {
        if (bytes.toString("ascii", offset, offset + 4) === "ANMF") frameCount++;
        const length = bytes.readUInt32LE(offset + 4);
        offset += 8 + length + (length % 2);
      }
      assert.equal(frameCount, frames, `礼物 ${id} 动画帧必须完整`);
    }
  }
});

test("LAPLACE 已确认礼物资源使用固定本地原图，来源确实缺失时才回退", () => {
  const mapped = new Map([
    ["https://workers.laplace.cn/bilibili/room-gift-config/25034104?gift=1&size=960", "/laplace/files/i0.hdslb.com/bfs/live/07d4dad91d7f68d92cb6a324ad9395ae2adefd47.webp"],
    ["https://workers.laplace.cn/bilibili/room-gift-config/25034104?gift=32188&size=960", "/laplace/files/workers.laplace.cn/room-gift-config/25034104/32188.webp"],
    ["https://workers.laplace.cn/bilibili/room-gift-config/25034104?gift=25&size=960", "/laplace/files/workers.laplace.cn/room-gift-config/25034104/25.webp"],
    ["https://workers.laplace.cn/bilibili/room-gift-config/25034104?gift=31115&size=960", "/laplace/files/workers.laplace.cn/room-gift-config/25034104/31115.webp"],
    ["https://workers.laplace.cn/bilibili/room-gift-config/25034104?gift=32313&size=960", "/laplace/files/workers.laplace.cn/room-gift-config/25034104/32313.webp"],
    ["https://workers.laplace.cn/bilibili/room-gift-config/25034104?gift=30047&size=960", "/laplace/files/workers.laplace.cn/room-gift-config/25034104/30047.webp"],
    ["https://workers.laplace.cn/bilibili/room-gift-config/25034104?gift=30607&size=320", "/laplace/files/s1.hdslb.com/bfs/live/d4a0827cbb6b00e48f4d3e6c0f4fdd6e24c93a8f.png"],
    ["https://workers.laplace.cn/bilibili/room-gift-config/25034104?gift=30732&size=960", "/laplace/files/workers.laplace.cn/room-gift-config/25034104/30732.webp"],
    ["https://workers.laplace.cn/bilibili/room-gift-config/25034104?gift=34762&size=960", "/laplace/files/workers.laplace.cn/room-gift-config/25034104/34762.webp"],
  ]);
  for (const [url, expected] of mapped) {
    assert.equal(modules.rendererContext.resolveAsset(url), expected);
    assert.equal(existsSync(resolve(`public${expected}`)), true, expected);
  }
  for (const url of [
    "https://workers.laplace.cn/bilibili/room-gift-config/25034104?gift=30004&size=320",
    "https://workers.laplace.cn/bilibili/room-gift-config/25034104?gift=32762&size=960",
  ]) assert.equal(modules.rendererContext.resolveAsset(url), url);
});

test("LAPLACE 实际预览产物包含按房间与礼物匹配本地资源的解析逻辑", () => {
  const product = readFileSync(resolve("public/laplace/product/renderer.js"), "utf8");
  assert.match(product, /roomGiftAssets/);
  assert.match(product, /room-gift-config/);
});

test("LAPLACE 预览样例保留官方译文及翻译标记", () => {
  const samples = [...modules.samples.getOriginalSamples("static"), ...modules.samples.getOriginalSamples("design")];
  assert.ok(samples.some(sample => sample.type === "superchat"));
  const original = JSON.parse(readFileSync('src/compat/laplace/renderer/sample-data.json', 'utf8'));
  for (const sample of samples.filter(sample => sample.type === 'superchat')) {
    const source = [...original.static, ...original.design].find(event => event.id === sample.id);
    assert.equal(sample.messageTrans, source.messageTrans);
    assert.equal(sample.transMark, source.transMark);
  }
});

test("LAPLACE 礼物预览保留逐礼物来源身份并由本地映射解析", () => {
  const samples = [...modules.samples.getOriginalSamples("static"), ...modules.samples.getOriginalSamples("design")];
  const gifts = samples.filter(sample => sample.type === "gift");
  assert.ok(gifts.length > 0);
  assert.equal(gifts.some(sample => /^\/media\/style-preview-(?:gift|free-gift|blind-hit)\.webp$/.test(String(sample.giftIcon ?? ""))), false);
  const mapped = gifts.filter(sample => [32188, 25, 31115, 32313, 30047, 30732, 34762].includes(Number(sample.giftId)));
  assert.ok(mapped.length > 0);
  for (const sample of mapped) {
    const source = sample.giftIcon || `https://workers.laplace.cn/bilibili/room-gift-config/${sample.origin}?gift=${sample.giftId}&size=960`;
    const media = JSON.parse(readFileSync('src/preview/laplace-preview-gifts.json', 'utf8'));
    assert.equal(modules.rendererContext.resolveAsset(source), media[sample.giftId].image, `${sample.giftId}:${source}`);
  }
});
