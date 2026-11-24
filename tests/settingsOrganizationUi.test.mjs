import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${root}/${path}`, "utf8");

test("设置页按显示、筛选、交互和输出职责拆分分类", () => {
  const navigation = read("src/components/settingsNavigation.ts");
  const source = read("src/components/SettingsPanel.tsx");

  assert.match(navigation, /"general" \| "display" \| "filters" \| "live" \| "review" \| "windows" \| "interaction" \| "voice"/);
  for (const label of ["通用设置", "事件显示", "事件筛选", "现场", "回看", "副窗口", "事件交互", "语音与播报", "其他设置", "关于"]) {
    assert.match(navigation, new RegExp(`label: "${label}"`));
  }

  const section = (id, nextId) => {
    const start = source.indexOf(`data-settings-section="${id}"`);
    const end = source.indexOf(`data-settings-section="${nextId}"`, start);
    assert.ok(start >= 0 && end > start, `${id} section should precede ${nextId}`);
    return source.slice(start, end);
  };

  const display = section("display", "filters");
  const filters = section("filters", "live");
  const review = section("review", "windows");
  const interaction = section("interaction", "voice");
  const voice = section("voice", "other");
  const other = section("other", "about");

  assert.doesNotMatch(display, /主题、元素显示和外观|编辑样式|ThemeWorkspace/);
  assert.doesNotMatch(display, /<SettingSwitch label="显示头像"/);
  assert.doesNotMatch(display, /GiftThresholdInput|只显示大航海进房/);
  assert.match(filters, /GiftThresholdInput|只显示大航海进房|金额计算|显示自动弹幕|显示未验证手机号用户弹幕/);
  assert.match(review, /进入回看时打开当前主播|reviewOpenCurrentOwner/);
  assert.match(interaction, /事件快捷菜单|用户昵称|朗读昵称\/用户名/);
  assert.match(voice, /声音输出|收听范围/);
  assert.doesNotMatch(voice, /事件快捷菜单|用户昵称|朗读昵称\/用户名/);
  assert.doesNotMatch(other, /进入回看时打开当前主播|reviewOpenCurrentOwner/);
  assert.match(source, /featureId: "review-archive"[\s\S]*action: "entry-preference"/);
});

test("容量、过期和合并集中在副窗口与 OBS 分组，不进入弹幕窗专属设置", () => {
  const source = read("src/components/SettingsPanel.tsx");
  const displayStart = source.indexOf('data-settings-section="display"');
  const commonStart = source.indexOf('<SettingsSubsectionTitle title="副窗口与 OBS"', displayStart);
  const commonEnd = source.indexOf('data-settings-section="filters"', commonStart);
  assert.ok(commonStart > displayStart && commonEnd > commonStart);
  const common = source.slice(commonStart, commonEnd);
  assert.match(common, /hint="仅影响副窗口与 OBS，不影响现场历史和回看。"/);
  for (const id of ["event-window-capacity", "event-expiry", "event-expiry-seconds", "merge-danmu", "merge-danmu-seconds"]) {
    assert.equal(source.split(`searchId="${id}"`).length - 1, 1, `${id} 只有一个控件`);
    assert.ok(common.includes(`searchId="${id}"`), `${id} 属于公共分组`);
  }
  assert.match(common, /label="输出保留条数"/);
  const display = source.slice(source.indexOf('data-settings-anchor="display"'), source.indexOf('data-settings-section="interaction"'));
  assert.doesNotMatch(display, /eventWindowCapacity|setEventWindowCapacity/);
});

test("公共输出行为的搜索名称与分组同步，金额计算仍属于事件筛选", () => {
  const source = read("src/components/SettingsPanel.tsx");
  const entriesText = source.match(/const SETTINGS_SEARCH_ENTRIES[^=]*= (\[[\s\S]*?\n\]);/)[1];
  const entries = new Function(`return ${entriesText}`)();
  for (const [id, label] of [
    ["event-window-capacity", "输出保留条数"],
    ["event-expiry", "事件定时消失"],
    ["event-expiry-seconds", "消失时间"],
    ["merge-danmu", "合并相同弹幕"],
    ["merge-danmu-seconds", "合并时间"],
  ]) {
    const entry = entries.find((item) => item.id === id);
    assert.ok(entry, `${id} 可搜索`);
    assert.equal(entry.label, label);
    assert.equal(entry.sectionId, "display");
    assert.ok(entry.keywords.includes("副窗口") && entry.keywords.includes("OBS"));
  }
  assert.ok(entries.find((item) => item.id === "event-window-capacity").keywords.includes("容量"));
  assert.ok(entries.find((item) => item.id === "event-expiry").keywords.includes("过期"));
  const amount = entries.find((item) => item.id === "gift-threshold-mode");
  assert.equal(amount.label, "金额计算");
  assert.equal(amount.sectionId, "filters");
  assert.match(source, /label="金额计算"/);
});

test("副窗口恢复默认统一调用分类重置，不重复重置容量", () => {
  const source = read("src/components/SettingsPanel.tsx");
  const body = source.match(/const resetWindows = \(\) => \{([\s\S]*?)\n  \};/)[1];
  let resets = 0;
  new Function("resetWindowsSettings", body)(
    () => { resets++; },
  );
  assert.equal(resets, 1);
});

test("信息流行为独立控制内容对齐和最新事件位置", () => {
  const source = read("src/components/SettingsPanel.tsx");
  const start = source.indexOf('<SettingsSubsectionTitle title="信息流行为"');
  const end = source.indexOf('<SettingsSubsectionTitle title="事件动画"', start);
  const controls = source.slice(start, end);
  const alignment = controls.match(/<Segmented[^>]*>\s*label="内容对齐"[\s\S]*?\/>/)?.[0];
  const latest = controls.match(/<Segmented[^>]*>\s*label="最新事件位置"[\s\S]*?\/>/)?.[0];
  assert.ok(alignment, "信息流行为中有内容对齐控件");
  assert.ok(latest, "信息流行为中有最新事件位置控件");
  assert.match(alignment, /value=\{liveContentAlignment\}/);
  assert.match(alignment, /onChange=\{setLiveContentAlignment\}/);
  assert.match(alignment, /value: "top", label: "顶部"/);
  assert.match(alignment, /value: "bottom", label: "底部"/);
  assert.match(alignment, /searchId="content-alignment"/);
  assert.match(latest, /value=\{liveScrollDirection\}/);
  assert.match(latest, /onChange=\{setLiveScrollDirection\}/);
  assert.match(latest, /value: "top", label: "上方"/);
  assert.match(latest, /value: "bottom", label: "下方"/);
  assert.match(latest, /searchId="feed-direction"/);
  assert.match(source, /const liveContentAlignment = useGeneralSettings\(\(state\) => state\.liveContentAlignment\)/);
  assert.match(source, /const setLiveContentAlignment = useGeneralSettings\(\(state\) => state\.setLiveContentAlignment\)/);
});

test("内容对齐和最新事件位置分别可搜索并定位到事件显示", () => {
  const source = read("src/components/SettingsPanel.tsx");
  const entriesText = source.match(/const SETTINGS_SEARCH_ENTRIES[^=]*= (\[[\s\S]*?\n\]);/)[1];
  const entries = new Function(`return ${entriesText}`)();
  for (const [id, label, keywords] of [
    ["content-alignment", "内容对齐", ["顶部", "底部", "对齐"]],
    ["feed-direction", "最新事件位置", ["上方", "下方", "信息流方向"]],
  ]) {
    const entry = entries.find((item) => item.id === id);
    assert.ok(entry, `${label} 可搜索`);
    assert.equal(entry.label, label);
    assert.equal(entry.sectionId, "display");
    for (const keyword of keywords) assert.ok(entry.keywords.includes(keyword), `${label} 可按 ${keyword} 查找`);
  }
});

test("事件筛选恢复默认保留现场分类", () => {
  const source = read("src/components/SettingsPanel.tsx");
  const body = source.match(/const resetFilters = \(\) => \{([\s\S]*?)\n  \};/)[1];
  const filters = { left: ["danmu"], right: ["gift"] };
  let state = { filters, giftThreshold: 99, giftThresholdMode: "cumulative", audienceFilters: { minimumWealthLevel: 20 } };
  const defaults = { giftThreshold: 0, giftThresholdMode: "unit", audienceFilters: { minimumWealthLevel: 0 }, filters: {} };
  new Function("createDefaultSceneSettings", "setSceneSettings", "resetEventFiltersSettings", body)(
    () => defaults,
    (update) => { state = update(state); },
    () => {},
  );
  assert.equal(state.filters, filters);
  assert.equal(state.giftThreshold, 0);
  assert.equal(state.giftThresholdMode, "unit");
  assert.deepEqual(state.audienceFilters, defaults.audienceFilters);
});

test("设置分类的恢复默认边界与分类内容一致", () => {
  const source = read("src/components/SettingsPanel.tsx");
  for (const action of [
    "resetEventDisplaySettings",
    "resetEventFiltersSettings",
    "resetReviewSettings",
    "resetEventInteractionSettings",
    "resetVoiceOutputSettings",
  ]) {
    assert.match(source, new RegExp(action));
  }
  assert.match(source, /恢复设置页默认/);
  assert.match(source, /const resetAll = \(\) => \{[\s\S]*?resetDisplay\(\);[\s\S]*?resetFilters\(\);[\s\S]*?resetReviewSettings\(\);[\s\S]*?resetEventInteractionSettings\(\);[\s\S]*?resetVoiceOutputSettings\(\);/);
});
