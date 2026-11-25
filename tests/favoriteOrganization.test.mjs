import { readUiSource } from "./helpers/readUiSource.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readUiSource(`${root}/${path}`, "utf8");
const loadHelper = async () => {
  const path = `${root}/src/favoriteOrganization.ts`;
  assert.equal(existsSync(path), true, "收藏整理状态辅助模块尚未创建");
  return import("../src/favoriteOrganization.ts");
};

const tag = (tagId, name) => ({ tagId, name, createdAt: tagId, updatedAt: tagId, usageCount: 0 });

test("标签列表刷新时保留编辑器刚创建的标签，并按名称去重", () => {
  return loadHelper().then(({ mergeFavoriteTags }) => {
  const current = [tag(1, "待复盘"), tag(2, "新标签")];
  const incoming = [tag(1, "待复盘"), tag(3, "外部标签")];

  assert.deepEqual(
    mergeFavoriteTags(current, incoming).map((item) => item.name),
    ["待复盘", "新标签", "外部标签"],
  );
  });
});

test("标签按钮只切换当前收藏的选中状态", () => {
  return loadHelper().then(({ toggleFavoriteTag }) => {
  assert.deepEqual(toggleFavoriteTag(["待复盘"], "礼物"), ["待复盘", "礼物"]);
  assert.deepEqual(toggleFavoriteTag(["待复盘", "礼物"], "待复盘"), ["礼物"]);
  });
});

test("收藏主界面不会因实时档案刷新清空编辑状态", () => {
  const source = read("src/components/ReviewFavoritesPanel.tsx");
  assert.doesNotMatch(source, /setEditingKey\(null\);\s*void load\(\);/);
});

test("收藏主界面的编辑收藏使用统一弹窗而不是卡片内嵌展开", () => {
  const source = read("src/components/ReviewFavoritesPanel.tsx");
  assert.match(source, /const \[editingItem, setEditingItem\] = useState<ArchiveFavoriteItem \| null>\(null\);/);
  assert.doesNotMatch(source, /<FavoriteOrganizationEditor\s+inline/);
  assert.match(source, /editingItem && <FavoriteOrganizationEditor/);
  const editorSource = read("src/components/FavoriteOrganizationEditor.tsx");
  assert.doesNotMatch(editorSource, /inline\?: boolean/);
  assert.doesNotMatch(editorSource, /return inline \?/);
});

test("标签管理区域明确说明删除标签不会删除收藏内容", () => {
  const source = read("src/components/ReviewFavoritesPanel.tsx");
  assert.match(source, /只删除标签关联，不影响收藏、备注或原始事件/);
});

test("收藏编辑备注框不会拖拽改变弹窗布局", () => {
  const source = read("src/components/FavoriteOrganizationEditor.tsx");
  assert.match(source, /<Textarea[\s\S]*resize-none/);
});

test("收藏筛选提供收藏时间/事件时间切换和跨天快捷范围", () => {
  const source = read("src/components/ReviewFavoritesPanel.tsx");
  assert.match(source, /timeField/);
  assert.match(source, /时间依据/);
  assert.match(source, /过去 7 天/);
  assert.match(source, /过去 30 天/);
  assert.match(source, /本周/);
  assert.match(source, /上周/);
  assert.match(source, /本月/);
  assert.match(source, /上月/);
  assert.match(source, /自定义/);
  assert.match(source, /<DateTimeField/);
});

test("收藏筛选把标签放在更多筛选之外，并将管理标签放到列表工具栏", () => {
  const source = read("src/components/ReviewFavoritesPanel.tsx");
  const advancedIndex = source.indexOf("{advanced &&");
  const tagIndex = source.indexOf("<span>标签</span>");
  const toolbarIndex = source.indexOf('className="flex flex-wrap items-center gap-2 px-1"');
  const manageIndex = source.indexOf("管理标签");
  assert.ok(tagIndex >= 0 && tagIndex < advancedIndex, "标签筛选应位于更多筛选面板之外");
  assert.match(source, /tagFilter\.names\.length > 1/);
  assert.match(source, /hasActiveFilters && <Button/);
  assert.ok(manageIndex > toolbarIndex, "管理标签应位于列表工具栏，而不是更多筛选面板内");
});

test("收藏分类复用回看分类名称", () => {
  const source = read("src/components/ReviewFavoritesPanel.tsx");
  assert.match(source, /CATEGORY_OPTIONS/);
  assert.doesNotMatch(source, /\["lottery", ["']抽奖["']\]/);
});

test("收藏自定义时间按内容布局，并把开始结束输入放到下一行", () => {
  const source = read("src/components/ReviewFavoritesPanel.tsx");
  assert.doesNotMatch(source, /md:grid-cols-2/);
  assert.match(source, /className="mt-2 flex flex-wrap items-center gap-2/);
  assert.match(source, /<DateTimeField/);
  assert.match(source, /label=["']时间范围开始["']/);
  assert.match(source, /label=["']时间范围结束["']/);
});

test("档案刷新时不应清空收藏页的多选状态", () => {
  const source = read("src/components/ReviewFavoritesPanel.tsx");
  assert.doesNotMatch(
    source,
    /setSelected\(new Set\(\)\);\s*void load\(\);\s*\}, \[active, load, rangeError, refreshKey/,
    "archiveRevision 刷新不应与筛选刷新共用清空选择的 effect",
  );
});

test("收藏页全选状态按当前可见条目判断，而不是比较集合大小", () => {
  const source = read("src/components/ReviewFavoritesPanel.tsx");
  assert.match(source, /visibleItems\.every\(\(item\) => selected\.has\(targetKey\(item\)\)\)/);
  assert.doesNotMatch(source, /selected\.size === page\.items\.length/);
});

test("收藏筛选标签使用明确的激活样式和选中标记", () => {
  const source = read("src/components/ReviewFavoritesPanel.tsx");
  assert.match(source, /tagFilter\.names\.includes\(tag\.name\)/);
  assert.match(source, /font-medium/);
  assert.match(source, /activeTag \? "✓ "/);
});
