import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appSource = readFileSync(fileURLToPath(new URL("../src/App.tsx", import.meta.url)), "utf8");
const workbenchSource = readFileSync(fileURLToPath(new URL("../src/components/RightWorkbench.tsx", import.meta.url)), "utf8");
const filterSource = readFileSync(fileURLToPath(new URL("../src/components/LiveFilterBar.tsx", import.meta.url)), "utf8");
const reviewSearchSource = readFileSync(fileURLToPath(new URL("../src/components/ReviewSearchControls.tsx", import.meta.url)), "utf8");
const rankingsSource = readFileSync(fileURLToPath(new URL("../src/components/RoomRankings.tsx", import.meta.url)), "utf8");
const insightsSource = readFileSync(fileURLToPath(new URL("../src/components/RoomInsightsView.tsx", import.meta.url)), "utf8");
const partitionSource = readFileSync(fileURLToPath(new URL("../src/components/PartitionColumn.tsx", import.meta.url)), "utf8");
const paneSource = readFileSync(fileURLToPath(new URL("../src/components/EventPane.tsx", import.meta.url)), "utf8");
const listSource = readFileSync(fileURLToPath(new URL("../src/components/EventList.tsx", import.meta.url)), "utf8");
const rowSource = readFileSync(fileURLToPath(new URL("../src/components/EventRow.tsx", import.meta.url)), "utf8");

test("现场提供双区与分区模式切换，并保留筛选工具条", () => {
  assert.match(appSource, /layoutMode/);
  assert.match(appSource, /layoutMode === "partition"/);
  assert.match(appSource, /<LiveFilterBar[\s\S]*layoutMode/);
  assert.match(filterSource, /label="现场布局"/);
  assert.match(filterSource, /<SettingsChoiceControl/);
  assert.match(filterSource, /iconOnly/);
  assert.match(filterSource, /布局：双区/);
  assert.match(filterSource, /布局：多区/);
  assert.doesNotMatch(filterSource, />现场<\/span>/);
  assert.doesNotMatch(filterSource, /label: "系统"/);
  assert.match(filterSource, /role="menuitemcheckbox"/);
  assert.match(filterSource, /relative flex h-8 items-center/);
  assert.match(filterSource, /filterButtonBase\s*=\s*"[^"\n]*inline-flex[^"\n]*h-8[^"\n]*items-center/);
  assert.doesNotMatch(filterSource, /全选|取消全选/);
  assert.doesNotMatch(filterSource, /setAllEventCategories/);
});

test("现场工具栏按布局、筛选与右侧工具分组排列", () => {
  const layoutIndex = filterSource.indexOf('label="现场布局"');
  const filterIndex = filterSource.indexOf('aria-label="现场筛选"');
  const searchIndex = filterSource.indexOf('搜索现场事件内容');
  const thresholdIndex = filterSource.indexOf('<GiftThresholdInput');
  const exitFilterIndex = filterSource.indexOf('aria-label="退出筛选"');

  assert.ok(layoutIndex >= 0);
  assert.ok(filterIndex > layoutIndex);
  assert.ok(searchIndex > filterIndex);
  assert.ok(thresholdIndex > searchIndex);
  assert.ok(exitFilterIndex > thresholdIndex);
  assert.match(filterSource, /GiftThresholdInput/);
  assert.doesNotMatch(filterSource, />左区<\/span>/);
  assert.doesNotMatch(filterSource, />右区<\/span>/);
});

test("回看分类栏提供全选和取消全选快捷键", () => {
  assert.match(reviewSearchSource, /全选|取消全选/);
  assert.match(reviewSearchSource, /setAllReviewCategories/);
  assert.match(reviewSearchSource, /aria-label="回看分类条件"/);
  const helperStart = reviewSearchSource.indexOf("function setAllReviewCategories");
  const helperEnd = reviewSearchSource.indexOf("function filterConditionCount", helperStart);
  const helper = reviewSearchSource.slice(helperStart, helperEnd);
  assert.match(helper, /filterMode:\s*filters\.filterMode/);
  assert.doesNotMatch(helper, /filterMode:\s*"include"|filterMode:\s*"exclude"/);
  assert.doesNotMatch(helper, /secondaryCategories|eventTypes/);
});

test("榜单非大航海项统一显示为观众榜", () => {
  assert.match(rankingsSource, /const label = guard \? '大航海' : '观众榜'/);
  assert.match(rankingsSource, /aria-label=\{guard \? '大航海陪伴总榜' : '观众榜'\}/);
  assert.match(insightsSource, /kind === 'guard' \? '大航海陪伴总榜' : '观众榜'/);
});

test("大航海排序切换会固定并保留榜单弹层", () => {
  const sortStart = rankingsSource.indexOf('aria-label="大航海排序方式"');
  const sortEnd = rankingsSource.indexOf('</div> : <p', sortStart);
  const sortBlock = rankingsSource.slice(sortStart, sortEnd);
  assert.match(sortBlock, /onPointerDown=\{event => \{[^}]*event\.stopPropagation\(\);[^}]*cancelClose\(\);[^}]*setPinned\(true\)/s);
  assert.match(sortBlock, /onClick=\{\(\) => \{[^}]*cancelClose\(\);[^}]*setPinned\(true\);[^}]*setGuardSort\(sort\)/s);
});

test("两个榜单在滚动到底部时自动加载，并移除旧底栏文案", () => {
  assert.match(rankingsSource, /IntersectionObserver/);
  assert.match(rankingsSource, /const root = scrollRef\.current/);
  assert.match(rankingsSource, /\{ root, rootMargin:/);
  assert.match(rankingsSource, /!onLoadMore \|\| loadMoreError/);
  assert.match(rankingsSource, /重试/);
  assert.match(rankingsSource, /onLoadMore/);
  assert.match(rankingsSource, /guardUsers\.slice\(0, 3\)/);
  assert.doesNotMatch(rankingsSource, /加载更多/);
  assert.doesNotMatch(rankingsSource, /与B站贡献榜同步/);
});

test("分区模式的上下分隔条具备水平调整语义", () => {
  assert.match(partitionSource, /aria-orientation="horizontal"/);
  assert.match(partitionSource, /调整.*区域高度/);
  assert.match(partitionSource, /gridTemplateRows/);
  assert.match(partitionSource, /<Fragment key=\{region\}>/);
});

test("事件数量和礼物汇总使用中文标签与点号分隔", () => {
  assert.match(paneSource, /事件 <span className="font-mono tabular-nums">\{count\}<\/span>/);
  assert.match(paneSource, /aria-hidden="true">·<\/span>/);
  assert.match(paneSource, /summary &&/);
  assert.match(paneSource, /font-mono/);
  assert.match(paneSource, /className="truncate text-t3"/);
});

test("双区右侧合并收益区域使用付费事件标题", () => {
  assert.match(appSource, /title="付费事件"/);
  assert.doesNotMatch(appSource, /title="礼物、SC 与大航海"/);
});

test("现场提供全局文字搜索和安全区域退出筛选入口", () => {
  assert.match(appSource, /const \[query, setQuery\] = useState<EventQuery>\(\{\}\)/);
  assert.match(appSource, /query, giftThresholdMode/);
 assert.match(appSource, /queryActive/);
  assert.match(appSource, /<LiveFilterBar[\s\S]*onClearQuery/);
  assert.doesNotMatch(appSource, /queryActive \? "top-8" : "top-0"/);
  assert.match(filterSource, /flex-wrap[\s\S]*overflow-visible/);
  assert.match(filterSource, /queryActive/);
  assert.match(filterSource, /basis-full[\s\S]*退出筛选/);
assert.match(filterSource, /搜索现场事件内容/);
  assert.match(filterSource, /onSearchTextChange/);
  assert.match(filterSource, /用户：/);
  assert.match(filterSource, /退出筛选/);
  assert.match(filterSource, /onClearQuery/);
});

test("用户名使用语义化按钮并把筛选回调贯通所有面板", () => {
  assert.match(appSource, /onUserFilter/);
  assert.match(partitionSource, /onUserFilter/);
  assert.match(paneSource, /onUserFilter/);
  assert.match(listSource, /onUserFilter/);
  assert.match(rowSource, /<button/);
  assert.match(rowSource, /筛选用户/);
});

test("进入用户筛选后在退出入口旁显示当前用户名", () => {
  assert.match(filterSource, /用户：/);
  assert.match(filterSource, /query\.userName/);
});

test("大表情筛选只属于回看菜单，不影响现场和副窗口", () => {
  const timelineSource = readFileSync(fileURLToPath(new URL("../src/components/ReviewSessionTimeline.tsx", import.meta.url)), "utf8");
  const floatingSource = readFileSync(fileURLToPath(new URL("../src/windows/FloatingEventWindow.tsx", import.meta.url)), "utf8");
  const displayWindowSource = readFileSync(fileURLToPath(new URL("../src/windows/FloatingEventWindow.tsx", import.meta.url)), "utf8");
  const settingsSource = readFileSync(fileURLToPath(new URL("../src/components/SettingsPanel.tsx", import.meta.url)), "utf8");
  assert.match(timelineSource, /显示大表情/);
  assert.match(timelineSource, /showBigEmote/);
  assert.match(readFileSync(fileURLToPath(new URL("../src/archive/archiveProjection.ts", import.meta.url)), "utf8"), /filters\.showBigEmote/);
  assert.doesNotMatch(timelineSource, /shouldShowBigEmote/);
  assert.doesNotMatch(listSource, /shouldShowBigEmote/);
  assert.doesNotMatch(rowSource, /shouldShowBigEmote/);
  assert.doesNotMatch(floatingSource, /shouldShowBigEmote/);
  assert.doesNotMatch(displayWindowSource, /shouldShowBigEmote/);
  assert.doesNotMatch(settingsSource, /label="显示大表情"/);
});

test("现场挂载独立系统提醒入口", () => {
  assert.match(appSource, /UrgentSystemNotice/);

  const bellPath = fileURLToPath(new URL("../src/components/SystemReminderBell.tsx", import.meta.url));
  const bellSource = readFileSync(bellPath, "utf8");
  assert.match(bellSource, /aria-label="系统提醒"/);
  assert.match(bellSource, /role="dialog"/);
  assert.match(bellSource, /hhmmss/);
  assert.match(bellSource, /<time[\s\S]*hhmmss\(event\.ts\)/);
  const statusSource = readFileSync(fileURLToPath(new URL("../src/components/StatusBar.tsx", import.meta.url)), "utf8");
  assert.match(statusSource, /SystemReminderBell/);
  assert.match(statusSource, /placement="top"/);
});

test("SYS_MSG 作为平台系统提示丢弃，不进入任何可见面板", () => {
  const adapterPath = fileURLToPath(new URL("../src/protocol/adapter.ts", import.meta.url));
  const adapterSource = readFileSync(adapterPath, "utf8");

  assert.match(adapterSource, /cmd === 'SYS_MSG'/);
});

test("预言玩法心跳丢弃，不进入现场或系统提醒", () => {
  const adapterPath = fileURLToPath(new URL("../src/protocol/adapter.ts", import.meta.url));
  const adapterSource = readFileSync(adapterPath, "utf8");

  assert.match(adapterSource, /cmd === 'INTERACTIVE_USER'/);
  assert.match(adapterSource, /cmd === 'PANEL_INTERACTIVE_NOTIFY_CHANGE'/);
});

test("主窗口为现场保留独立的右侧工作台空间", () => {
  assert.match(appSource, /RightWorkbench/);
  assert.match(appSource, /workbenchExpanded/);
  assert.match(appSource, /<StatusBar \/>/);
  assert.match(appSource, /<RightWorkbench/);
  assert.match(workbenchSource, /style=\{\{ width:/);
  assert.doesNotMatch(appSource, /position:\s*["']?absolute/);
});
