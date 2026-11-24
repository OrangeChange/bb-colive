import { readUiSource } from "./helpers/readUiSource.mjs";
import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("主播事件检索主区与单场主区使用同一收藏和更多筛选行", async () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const vite = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-reviewSearchControls.test.mjs",optimizeDeps:{noDiscovery:true,include:[]},
    root,
    configFile: false, esbuild: { jsx: "automatic" },
    server: { middlewareMode: true, watch: null },
    appType: "custom",
    logLevel: "silent",
  });

  try {
    const [{ ReviewOwnerEventFilters }, searchControls] = await Promise.all([
      vite.ssrLoadModule("/src/components/ReviewOwnerEventFilters.tsx"),
      vite.ssrLoadModule("/src/components/ReviewSearchControls.tsx"),
    ]);
    const { ReviewAdvancedFilters, ReviewSearchControls, advancedFilterConditionCount } = searchControls;
    const noop = () => undefined;
    const filters = { keywordConditions: [{ field: "content", value: "测试" }] };
    const ownerMarkup = renderToStaticMarkup(React.createElement(ReviewOwnerEventFilters, {
      query: { filters, sort: "latestMatch", direction: "desc" },
      onChange: noop,
      onReplaceFilters: noop,
      onClear: noop,
      collapsed: false,
      onCollapsedChange: noop,
    }));
    const sessionMarkup = renderToStaticMarkup(React.createElement(ReviewSearchControls, {
      level: "session",
      query: { searchText: "", searchScope: "session", filters },
      onChange: noop,
      onReplaceFilters: noop,
      collapsed: false,
      onCollapsedChange: noop,
    }));
    const ownerAdvancedMarkup = renderToStaticMarkup(React.createElement(ReviewAdvancedFilters, {
      level: "owner",
      filters,
      onChangeFilters: noop,
    }));
    const sessionAdvancedMarkup = renderToStaticMarkup(React.createElement(ReviewAdvancedFilters, {
      level: "session",
      filters,
      searchScope: "session",
      onChangeFilters: noop,
      onChangeSearchScope: noop,
    }));

    for (const markup of [ownerMarkup, sessionMarkup]) {
      assert.match(markup, /只看收藏/);
      assert.match(markup, /更多筛选/);
      assert.ok(markup.indexOf("快捷筛选") < markup.indexOf("只看收藏"));
      assert.ok(markup.indexOf("只看收藏") < markup.indexOf("更多筛选"));
    }
    assert.doesNotMatch(ownerMarkup, /关键词默认连接方式|事件范围|事件时间|已启用的更多条件/);
    assert.doesNotMatch(ownerMarkup, /事件结果排序字段/);
    for (const markup of [ownerAdvancedMarkup, sessionAdvancedMarkup]) {
      const categoryIndex = markup.indexOf('aria-label="回看分类条件"');
      const userIndex = markup.indexOf('aria-label="回看用户条件"');
      const giftIndex = markup.indexOf('aria-label="回看礼物金额条件"');
      const timeIndex = markup.indexOf('aria-label="回看时间条件"');
      assert.ok(categoryIndex >= 0 && categoryIndex < userIndex);
      assert.ok(userIndex < giftIndex && giftIndex < timeIndex);
    }
    assert.doesNotMatch(ownerAdvancedMarkup, /回看检索范围/);
    assert.match(sessionAdvancedMarkup, /回看检索范围/);
    assert.ok(
      sessionAdvancedMarkup.indexOf('aria-label="回看时间条件"')
        < sessionAdvancedMarkup.indexOf('aria-label="回看检索范围"'),
      "单场检索范围应与时间范围同处筛选末行，并排在时间范围之后",
    );
    assert.match(ownerAdvancedMarkup, /review-filter-time-full/);
    assert.match(sessionAdvancedMarkup, /review-filter-time-scope-grid/);
    assert.equal(advancedFilterConditionCount({
      primaryCategories: [],
      userIdentity: "guard",
      giftPriceMinRmb: 10,
      fromTs: 1,
      favoriteOnly: true,
      showBigEmote: false,
    }), 4, "更多筛选计数只汇总高级条件，不把收藏和大表情显示算进去");
  } finally {
    await vite.close();
  }
});

test("高级筛选仅取消分类组上方分割线", () => {
  const css = readUiSource(fileURLToPath(new URL("../src/App.css", import.meta.url)), "utf8");

  assert.ok(/\.review-filter-category-section\s*\{[^}]*border-top:\s*0;[^}]*padding-top:\s*0;/.test(css), "分类组应单独移除上边线和对应顶部留白");
  assert.ok(/\.review-filter-advanced-section\s*\{[^}]*border-top:\s*1px solid var\(--border\);/.test(css), "其余高级筛选分组仍保留分割线");
});

test("回看一级分类不再单独展示生命周期", () => {
  const source = readUiSource(
    fileURLToPath(new URL("../src/components/ReviewSearchControls.tsx", import.meta.url)),
    "utf8",
  );

  assert.match(source, /value:\s*["']system["']/);
  assert.doesNotMatch(source, /value:\s*["']lifecycle["']/);
});

test("主播页提供场次和事件检索两个独立模式", () => {
  const paths = [
    new URL("../src/components/ReviewOwnerToolbar.tsx", import.meta.url),
    new URL("../src/components/ReviewOwnerSessionFilters.tsx", import.meta.url),
    new URL("../src/components/ReviewOwnerEventFilters.tsx", import.meta.url),
  ];
  assert.ok(paths.every(existsSync), "主播双模式组件尚未创建");
  const [toolbar, sessions, events] = paths.map((path) => readUiSource(path, "utf8"));

  assert.match(toolbar, />场次</);
  assert.match(toolbar, />事件检索</);
  assert.match(toolbar, /aria-pressed=/);
  assert.match(toolbar, /focus-visible:ring-2/);
  assert.match(toolbar, /flex-wrap/);
  assert.match(toolbar, /border-accent bg-accent-subtle/);
  assert.match(sessions, /搜索直播标题/);
  assert.match(sessions, /开播时间/);
  assert.match(sessions, /只看有收藏的场次/);
  assert.match(sessions, /aria-label=/);
  assert.match(sessions, /h-8/);
  assert.match(sessions, /flex-wrap/);
  assert.doesNotMatch(sessions, /用户身份|主播粉丝牌|礼物价格/);
  assert.doesNotMatch(events, /事件范围|事件时间|只查收藏事件|关键词默认连接方式/);
  assert.match(events, /aria-pressed=/);
  assert.match(events, /focus-visible:ring-2/);
  assert.match(events, /flex-wrap/);
  assert.match(events, /aria-label=["']只看收藏["']/);
  assert.match(events, /aria-label=["']更多筛选["']/);
  assert.doesNotMatch(events, /显示大表情/);
});

test("主播事件筛选复用单场高级筛选，排序与大表情控制归结果工具栏", () => {
  const toolbar = readUiSource(fileURLToPath(new URL("../src/components/ReviewOwnerToolbar.tsx", import.meta.url)), "utf8");
  const sessions = readUiSource(fileURLToPath(new URL("../src/components/ReviewOwnerSessionFilters.tsx", import.meta.url)), "utf8");
  const events = readUiSource(fileURLToPath(new URL("../src/components/ReviewOwnerEventFilters.tsx", import.meta.url)), "utf8");
  const panel = readUiSource(fileURLToPath(new URL("../src/components/ReviewPanel.tsx", import.meta.url)), "utf8");
  const results = readUiSource(fileURLToPath(new URL("../src/components/ReviewOwnerEventResults.tsx", import.meta.url)), "utf8");
  const css = readUiSource(fileURLToPath(new URL("../src/App.css", import.meta.url)), "utf8");

  assert.match(toolbar, /aria-label=["']主播档案查看方式["']/);
  assert.match(sessions, /搜索直播标题/);
  assert.match(sessions, /场次开播时间/);
  assert.match(sessions, /直播状态/);
  assert.match(sessions, /记录质量/);
  assert.match(events, /data-review-owner-event-keyword-row/);
  assert.match(events, /<ReviewAdvancedFilters level="owner"/);
  assert.match(events, /更多筛选/);
  assert.doesNotMatch(events, /事件范围|事件时间|用户身份|主播粉丝牌|礼物最低价格/);
  assert.match(results, /事件排序字段/);
  assert.match(results, /事件排序方向/);
  assert.match(results, /显示大表情/);
  assert.match(panel, /<ReviewOwnerEventResultsToolbar/);
  assert.match(css, /review-owner-event-filters \[data-review-owner-event-keyword-input\]/);
  assert.match(results, /review-owner-event-results/);
});

test("主播场次和事件筛选共用单场筛选框架，并支持折叠状态", () => {
  const panel = readUiSource(fileURLToPath(new URL("../src/components/ReviewPanel.tsx", import.meta.url)), "utf8");
  const sessions = readUiSource(fileURLToPath(new URL("../src/components/ReviewOwnerSessionFilters.tsx", import.meta.url)), "utf8");
  const events = readUiSource(fileURLToPath(new URL("../src/components/ReviewOwnerEventFilters.tsx", import.meta.url)), "utf8");

  assert.match(sessions, /<ReviewFilterShell[\s\S]*?collapsed=\{collapsed\}[\s\S]*?onCollapsedChange=\{onCollapsedChange\}/);
  assert.match(events, /<ReviewFilterShell[\s\S]*?collapsed=\{collapsed\}[\s\S]*?onCollapsedChange=\{onCollapsedChange\}/);
  assert.match(panel, /const handleReviewOwnerWheel = useCallback/);
  assert.match(panel, /onWheel=\{route\.level === "session" \? handleReviewSessionWheel : route\.level === "owner" && !showManagement \? handleReviewOwnerWheel : undefined\}/);
});

test("主播页向下滚动收起筛选，回到页面顶部向上滚动时按自动收起状态展开", () => {
  const panel = readUiSource(fileURLToPath(new URL("../src/components/ReviewPanel.tsx", import.meta.url)), "utf8");
  const handler = panel.match(/const handleReviewOwnerWheel = useCallback\([\s\S]*?\n  \}, \[[^\n]*\]\);/);
  assert.ok(handler, "主播页需要单独处理自然页面滚动手势");
  assert.match(handler[0], /handleReviewTimelineScrollIntent\(event\.deltaY < 0 \? "up" : "down", page\.scrollTop <= 1\)/);
  assert.match(handler[0], /scrollTop\s*<=\s*1/);
  assert.doesNotMatch(handler[0], /preventDefault|scrollBy/);
});

test("主播页更多条件浮层从筛选框下方展开，并按视口剩余高度限制内部滚动", () => {
  const events = readUiSource(fileURLToPath(new URL("../src/components/ReviewOwnerEventFilters.tsx", import.meta.url)), "utf8");
  const popover = readUiSource(fileURLToPath(new URL("../src/components/ReviewFilterPopover.tsx", import.meta.url)), "utf8");
  assert.match(events, /<ReviewFilterPopover/);
  assert.match(popover, /positionReviewFilterPopover\(/);
  assert.match(popover, /maxHeight: position\?\.maxHeight/);
});
