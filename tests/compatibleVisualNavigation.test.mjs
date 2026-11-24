import test from "node:test";
import assert from "node:assert/strict";
import { buildCompatibleVisualNavigation, compatibleNavigationItemLabel, resolveCompatibleNavigationSelection } from "../src/themes/compatibleVisualNavigation.ts";
import { LAPLACE_CAPABILITY } from "../src/compat/laplace/theme.ts";
import { OPENLIVE_CAPABILITY } from "../src/compat/openlive/theme.ts";

test("开放版包含行内小表情，导航不重复暴露付费正文目标", () => {
  const flatten = items => items.flatMap(item => [item, ...flatten(item.children ?? [])]);
  const items = buildCompatibleVisualNavigation("blivechat-open", OPENLIVE_CAPABILITY.parts).flatMap(group => flatten(group.items));
  assert.ok(items.some(item => item.part === "smallEmote"));
  assert.equal(items.some(item => item.part === "paidContent"), false);
});
test("弹幕范围不提供付费卡片公共头部，特化事件入口仍可使用", () => {
  const flatten = items => items.flatMap(item => [item, ...flatten(item.children ?? [])]);
  const items = buildCompatibleVisualNavigation("blivechat-open", OPENLIVE_CAPABILITY.parts, ["danmaku"]).flatMap(group => flatten(group.items));
  assert.equal(items.some(item => item.id === "card-header" && item.part), false);
  assert.ok(items.some(item => item.event === "superchat"));
});
test("LAPLACE 置顶具备真实头像层、金额层和大航海内容入口", () => {
  const flatten = items => items.flatMap(item => [item, ...flatten(item.children ?? [])]);
  const items = buildCompatibleVisualNavigation("laplace", LAPLACE_CAPABILITY.parts).flatMap(group => flatten(group.items)).filter(item => item.placement === "sticky");
  for (const part of ["avatarWrap", "avatarFrame", "avatarImageWrap", "priceCurrency", "priceFigure", "guardContent", "giftImageWrap"]) assert.ok(items.some(item => item.part === part), part);
});

test("公共部件的路径决定主消息范围，不沿用置顶上下文", () => {
  const current = { event: "gift", identity: "all", placement: "sticky", part: "avatar" };
  assert.deepEqual(resolveCompatibleNavigationSelection({ id: "avatar", part: "avatar", placement: "main" }, current),
    { event: "gift", identity: "all", placement: "main", part: "avatar" });
});

test("事件快捷入口与公共入口共享同一编辑目标", () => {
  const current = { event: "superchat", identity: "all", placement: "main", part: "avatar" };
  const common = { id: "message", part: "message", placement: "main" };
  const shortcut = { id: "sc-message", part: "message", placement: "main", event: "superchat" };
  const expected = { event: "superchat", identity: "all", placement: "main", part: "message" };
  assert.deepEqual(resolveCompatibleNavigationSelection(common, current), expected);
  assert.deepEqual(resolveCompatibleNavigationSelection(shortcut, current), expected);
});

test("导航目录不产生编辑目标", () => {
  assert.equal(resolveCompatibleNavigationSelection({ id: "cards", placement: "main", children: [] },
    { event: "all", identity: "all", part: "message" }), null);
});

test("全局部件清除事件和身份筛选", () => {
  const current = { event: "gift", identity: "captain", placement: "main", part: "message" };
  assert.deepEqual(resolveCompatibleNavigationSelection({ id: "list", part: "list", placement: "main", global: true }, current),
    { event: "all", identity: "all", placement: "main", part: "list" });
});

const paths = groups => {
  const result = [];
  const visit = (items, parent) => items.forEach(item => {
    const path = [...parent, item.label];
    result.push(path.join(" / "));
    visit(item.children ?? [], path);
  });
  groups.forEach(group => visit(group.items, [group.label]));
  return result;
};

test("BLC 导航保留批准的父子层级且不伪造跨区所有事件", () => {
  const groups = buildCompatibleVisualNavigation("blivechat", {
    eventArea: { label: "事件区", placements: ["main"] }, eventList: { label: "事件列表", placements: ["main"] },
    event: { label: "普通事件", placements: ["main", "detail"] }, contentArea: { label: "内容区域", placements: ["main"] },
    card: { label: "卡片", placements: ["main"] }, cardHeader: { label: "头部", placements: ["main"] },
    cardHeaderContent: { label: "头部信息区", placements: ["main"] }, cardPrimaryColumn: { label: "主信息列", placements: ["main"] },
    membershipInfoRow: { label: "用户信息行", placements: ["main"] }, paidContent: { label: "正文区域", placements: ["main"] },
    avatar: { label: "头像区域" }, avatarImage: { label: "头像" },
    username: { label: "用户名" }, message: { label: "正文" }, amount: { label: "价格" },
    smallEmote: { label: "行内表情" }, largeEmote: { label: "大表情" }, ticker: { label: "置顶栏", placements: ["sticky"] },
    tickerItem: { label: "单项背景", placements: ["sticky"] }, tickerItemContent: { label: "单项内容", placements: ["sticky"] },
  });
  assert.deepEqual(groups.map(group => group.label), ["显示区域", "用户信息", "事件内容", "表情", "礼物", "醒目留言"]);
  const actual = paths(groups);
  assert.ok(actual.includes("显示区域 / 事件 / 普通事件 / 内容区域"), actual.join("\n"));
  assert.ok(actual.includes("显示区域 / 事件 / 置顶事件 / 单项背景"), actual.join("\n"));
  assert.ok(actual.includes("用户信息 / 头像区域 / 头像"), actual.join("\n"));
  assert.equal(JSON.stringify(groups).includes("所有事件"), false);
  const ticker = groups[0].items.find(item => item.id === "ticker");
  assert.equal(compatibleNavigationItemLabel(ticker), "置顶栏");
});

test("LAPLACE 导航保留共同事件根并将活动归入红包与天选", () => {
  const groups = buildCompatibleVisualNavigation("laplace", LAPLACE_CAPABILITY.parts);
  const actual = paths(groups);
  assert.ok(actual.includes("显示区域 / 事件 / 所有事件"), actual.join("\n"));
  assert.ok(actual.includes("显示区域 / 事件 / 普通事件 / 内容区域"), actual.join("\n"));
  assert.ok(actual.includes("用户信息 / 头像区域 / 头像图片区域 / 头像"), actual.join("\n"));
  assert.ok(actual.includes("红包与天选 / 红包 / 奖励列表 / 奖励项 / 数量"), actual.join("\n"));
});

test("LAPLACE 正式能力表提供角色、价格、表情与礼物的真实子层", () => {
  const actual = paths(buildCompatibleVisualNavigation("laplace", LAPLACE_CAPABILITY.parts));
  for (const expected of [
    "用户信息 / 头像区域 / 头像框",
    "用户信息 / 头像区域 / 头像图片区域 / 头像",
    "用户信息 / 粉丝牌 / 名称内容区 / 牌内大航海徽章",
    "事件内容 / 价格 / 货币符号",
    "事件内容 / 价格 / 金额数值",
    "表情 / 行内表情区域 / 行内表情",
    "弹幕 / 回复信息 / 回复用户名",
    "礼物 / 礼物详情 / 乘号",
    "礼物 / 盲盒信息 / 盲盒名称",
    "礼物 / 盲盒金额 / 开出价值",
    "礼物 / 收礼对象 / 收礼者头像",
  ]) assert.ok(actual.includes(expected), `${expected}\n\n${actual.join("\n")}`);
});

test("开放版礼物详情不暴露来源始终为空的正文，保留SC详情和主区正文", () => {
  const flatten = items => items.flatMap(item => [item, ...flatten(item.children ?? [])]);
  const items = buildCompatibleVisualNavigation("blivechat-open", OPENLIVE_CAPABILITY.parts).flatMap(group => flatten(group.items));
  assert.equal(items.some(item => item.part === "message" && item.event === "gift" && item.placement === "detail"), false);
  assert.ok(items.some(item => item.part === "message" && item.event === "superchat" && item.placement === "detail"));
  assert.ok(items.some(item => item.part === "message" && item.placement === "main"));
});
