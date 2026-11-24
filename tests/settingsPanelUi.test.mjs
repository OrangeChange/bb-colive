import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${root}/${path}`, "utf8");
const source = read("src/components/SettingsPanel.tsx");
const stylePanelSource = read("src/components/StylePanel.tsx");
const listSelectSource = read("src/components/SettingsListSelect.tsx");
const surfaceSource = read("src/components/WorkbenchSurface.tsx");
const filterSource = read("src/eventFilterSettings.ts");
const eventViewSource = read("src/events/eventView.ts");

test("设置面板使用连续信息流内框与固定分类导航", () => {
  assert.match(source, /settings-panel-frame/);
  assert.match(source, /settings-section-navigator/);
  assert.match(source, /role="listbox"/);
  assert.match(source, /consumeSectionWheel/);
  assert.match(source, /onWheel=/);
  assert.match(source, /WorkbenchScroll/);
  assert.match(surfaceSource, /overflow-y-auto/);
});

test("设置分类保留滚轮导航，并提供可定位到具体设置项的查找入口", () => {
  assert.match(source, /查找设置/);
  assert.match(source, /SETTINGS_SEARCH_ENTRIES/);
  assert.match(source, /id: "window-opacity", label: "玻璃着色与不透明度"/);
  assert.match(source, /jumpToSearchResult/);
  assert.match(source, /settingsSearchPopoverRef/);
  assert.match(source, /settingsSearchPosition/);
  assert.match(source, /createPortal\(/);
  assert.match(source, /settings-search-popover/);
  assert.match(source, /onWheel=\{handleNavigatorWheel\}/);
});

test("设置开关不应被普通输入控件的宽度规则拉伸", () => {
  const css = read("src/App.css");
  assert.match(source, /settings-control-field/);
  assert.match(css, /\.settings-control-row\s*>\s*\.settings-control-field/);
  assert.doesNotMatch(css, /\.settings-control-row\s*>\s*\.relative\s*,/);
  assert.match(read("src/components/SettingsSwitch.tsx"), /className=\{`relative h-5 w-9/);
});

test("顶部设置分类下拉的箭头、提示和定位不应干扰菜单", () => {
  const css = read("src/App.css");
  assert.match(source, /settings-section-navigator-shell/);
  assert.match(source, /settings-section-navigator-label/);
  assert.match(source, /aria-label=\{`\$\{currentLabel\}，滚轮切换分类/);
  assert.doesNotMatch(source, /title="滚轮切换 · 展开"/);
  assert.match(css, /\.settings-section-navigator-label\s*\{[\s\S]*?flex:\s*1 1 auto/);
  assert.match(css, /\.settings-section-navigator-menu\s*\{[^}]*left:\s*0[^}]*right:\s*auto/);
  assert.match(css, /\.settings-section-navigator-menu\s*\{[\s\S]*?top:\s*calc\(100% \+ 4px\)/);
  assert.doesNotMatch(source, /settings-section-navigator-menu[^\n]*w-44/);
});

test("分类跳转使用滚动容器相对坐标，避免标题被顶栏遮挡", () => {
  assert.match(source, /function getSettingsScrollTop/);
  assert.match(source, /scroller\.getBoundingClientRect\(\)/);
  assert.match(source, /target\.getBoundingClientRect\(\)/);
  assert.match(source, /getSettingsScrollTop\(scroller, target\)/);
});

test("分类高亮使用与跳转一致的滚动容器坐标", () => {
  assert.match(source, /const sectionScrollerRect = scroller\.getBoundingClientRect\(\)/);
  assert.match(source, /target\.getBoundingClientRect\(\)\.top[\s\S]*?sectionScrollerRect\.top/);
  assert.doesNotMatch(source, /const offsets = SETTINGS_SECTIONS\.map\(\(section\) => sectionRefs\.current\.get\(section\.id\)\?\.offsetTop/);
  assert.match(source, /scrollTargetRef\.current = null;[\s\S]*?setCurrentSection\(targetSectionId\);[\s\S]*?return;/);
});

test("其他设置与关于行复用统一标签布局", () => {
  const otherStart = source.indexOf('data-settings-section="other"');
  const aboutStart = source.indexOf('data-settings-section="about"');
  const otherSection = source.slice(otherStart, aboutStart);
  assert.match(otherSection, /settings-control-label[^>]*>主窗口布局/);
  assert.match(otherSection, /settings-control-label[^>]*>弹幕窗布局/);
  assert.match(otherSection, /settings-control-label[^>]*>收益窗布局/);
  assert.match(otherSection, /settings-control-label[^>]*>全部窗口布局/);
  assert.match(otherSection, /settings-control-label[^>]*>设置页默认/);
  assert.match(source.slice(aboutStart), /SoftwareUpdateSettings/);
  assert.match(read("src/updates/SoftwareUpdateSettings.tsx"), /aria-label="关于 BB CoLive"/);
});

test("设置页渲染已经接入真实状态的分类", () => {
  for (const title of ["通用设置", "事件显示", "事件筛选", "现场", "回看", "副窗口", "事件交互", "语音与播报", "其他设置", "关于"]) {
    assert.match(source, new RegExp(title));
  }
  assert.doesNotMatch(source, />数据与记录</);
});

test("设置面板提供主题、事件显示和副窗口真实控件", () => {
  assert.match(source, /配色主题/);
  assert.match(source, /深浅模式/);
  assert.match(source, /双区/);
  assert.match(source, /多区/);
  assert.match(source, /GiftThresholdInput/);
  assert.match(read("src/components/SettingsSwitch.tsx"), /role="switch"/);
  assert.match(source, /弹幕窗/);
  assert.match(source, /礼物窗/);
  assert.match(source, /恢复本分类默认/);
});

test("粉丝牌显示范围属于主题编辑器并使用统一状态模型", () => {
  const editor = read("src/components/NativeThemeBasicSettings.tsx");
  assert.match(editor, /只显示当前主播粉丝牌/);
  assert.match(editor, /隐藏未点亮粉丝牌/);
  assert.match(editor, /onlyAnchorFanMedal/);
  assert.match(editor, /hideUnlitFanMedal/);
});

test("所有恢复默认入口先进入统一二次确认", () => {
  assert.match(source, /ConfirmDialog/);
  assert.match(source, /pendingReset/);
  assert.match(source, /requestReset/);
  assert.match(source, /确认恢复/);
  assert.doesNotMatch(source, /onClick=\{resetGeneral\}/);
  assert.doesNotMatch(source, /onClick=\{resetDisplay\}/);
  assert.doesNotMatch(source, /onClick=\{resetFilters\}/);
  assert.doesNotMatch(source, /onClick=\{resetLive\}/);
  assert.doesNotMatch(source, /onClick=\{resetWindows\}/);
});

test("通用设置提供界面比例、启动行为和窗口行为", () => {
  assert.match(source, /界面比例/);
  assert.match(source, /关闭窗口时/);
  assert.match(source, /最小化时/);
  assert.match(source, /开机随系统自启/);
  assert.match(source, /启动后自动连接/);
  assert.match(source, /hint="仅在托盘运行；若同时开启启动后自动连接/);
  assert.match(source, /最近使用的主播/);
  assert.ok(source.indexOf('label="关闭窗口时"') < source.indexOf('label="最小化时"'));
});

test("主题编辑器提供元素显示开关和唯一基准字号", () => {
  const editor = read("src/components/NativeThemeBasicSettings.tsx");
  for (const label of [
    "头像",
    "大航海身份",
    "房管身份",
    "主播身份",
    "粉丝牌",
    "礼物图标",
    "事件图标",
  ]) {
    assert.match(editor, new RegExp(label));
  }
  assert.match(editor, />基准字号</);
  assert.match(editor, /PanelSwitch/);
});

test("主题编辑器统一保存身份显示和表现设置", () => {
  const basic = read("src/components/NativeThemeBasicSettings.tsx");
  const visual = read("src/components/NativeThemeVisualEditor.tsx");
  assert.match(basic, /showGuardIdentity/);
  assert.match(basic, /showHonorLevel/);
  assert.match(visual, /selection\.identity/);
});

test("样式工作区提供字体选择和文字描边开关", () => {
  const editor = read("src/components/NativeThemeVisualEditor.tsx");
  assert.match(editor, /字体/);
  assert.match(editor, /fontFamily/);
  assert.match(stylePanelSource, /list_installed_fonts/);
  assert.match(editor, /ThemeVisualPropertyField/);
  assert.match(read("src/components/ThemeVisualPropertyField.tsx"), /SettingsFontFamilySelect/);
  assert.match(stylePanelSource, /installedFontFamilies/);
});

test("事件显示分别命名内容对齐和最新事件位置，事件筛选承载金额计算", () => {
  assert.match(source, /label="内容对齐"/);
  assert.match(source, /label="最新事件位置"/);
  assert.doesNotMatch(source, /label="信息流方向"/);
  assert.match(source, /label="金额计算"/);
  assert.doesNotMatch(source, /label="事件滚动方向"/);
  assert.doesNotMatch(source, /label="判断方式"/);
});

test("副窗口通用外观和事件定时消失位于两个窗口控件之前", () => {
  const windowsStart = source.indexOf('data-settings-section="windows"');
  const displayStart = source.indexOf('data-settings-anchor="display"', windowsStart);
  const appearanceStart = source.indexOf("窗口外观", windowsStart);
  assert.ok(windowsStart >= 0 && appearanceStart > windowsStart && appearanceStart < displayStart);
  assert.match(source, /窗口外观/);
  assert.match(source, /事件定时消失/);
  assert.match(source, /eventExpiry/);
  assert.match(source, /type="number"/);
});

test("副窗口外观提供相同弹幕合并开关和时间窗口", () => {
  assert.match(source, /title="副窗口"|<SectionTitle title="副窗口"/);
  assert.match(source, /label="合并相同弹幕"/);
  assert.match(source, /mergeSameDanmu/);
  assert.match(source, /sameDanmuWindowSeconds/);
});

test("副窗口设置按一级、二级、三级标题区分，并提供弹幕窗筛选", () => {
  assert.match(source, /data-settings-level="1"/);
  assert.match(source, /data-settings-level=\{level\}/);
  assert.match(source, /level=\{3\}/);
  assert.match(source, /事件筛选/);
  assert.match(source, /label="弹幕"/);
  assert.match(source, /label="互动"/);
  for (const label of ["进房", "关注", "分享", "特别关注", "互相关注", "点赞"]) {
    assert.match(eventViewSource, new RegExp(label));
  }
  assert.match(source, /displayWindowFilters/);
  assert.match(source, /INTERACT_KIND_OPTIONS/);
});

test("副窗口筛选使用扁平筛选行，一级状态与二级展开彼此独立", () => {
  assert.match(source, /function SettingsFilterRow/);
  assert.match(source, /settings-filter-row/);
  assert.match(source, /settings-filter-row-toggle/);
  assert.match(source, /settings-filter-row-disclosure/);
  assert.match(source, /active \? "显示" : "隐藏"/);
  assert.doesNotMatch(source, /function SettingsFilterSubmenu/);
  const filterBlock = source.slice(source.indexOf("function SettingsFilterRow"), source.indexOf("export function SettingsPanel"));
  assert.doesNotMatch(filterBlock, /SwitchButton/);
});

test("设置层级用留白和细线区分，不使用二级胶囊标题与三级圆点", () => {
  const css = read("src/App.css");
  const levelTwo = css.match(/\.settings-subsection-title\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  const levelThree = css.match(/\.settings-tertiary-title\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(levelTwo, /border-bottom/);
  assert.doesNotMatch(levelTwo, /border-left/);
  assert.doesNotMatch(levelTwo, /background:/);
  assert.match(levelThree, /margin:/);
  assert.match(css, /\.settings-tertiary-title::after\s*\{/);
  assert.doesNotMatch(css, /\.settings-tertiary-title::before\s*\{/);
});

test("一级标题与二级标题拉开层级，顶部分类导航和三类下拉控件复用同一外框", () => {
  const css = read("src/App.css");
  assert.match(css, /\.settings-section-title\s*\{[\s\S]*?padding-bottom/);
  assert.match(css, /\.settings-section-title\s*>\s*h3\s*\{[\s\S]*?font-size:\s*16px/);
  assert.match(source, /settings-section-navigator settings-control-surface/);
  assert.match(source, /settings-control-menu/);
  assert.match(source, /settings-filter-row settings-control-surface/);
  assert.match(listSelectSource, /settings-list-select-trigger settings-control-surface/);
  assert.match(css, /\.settings-control-surface\s*\{/);
  assert.match(css, /\.settings-filter-row\.is-active\s*\{/);
});

test("弹幕和互动筛选按可用宽度自动适配，三级标题保留完整分组线", () => {
  assert.match(source, /settings-filter-grid/);
  const css = read("src/App.css");
  assert.match(css, /\.settings-filter-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit/);
  assert.match(css, /\.settings-tertiary-title\s*\{[\s\S]*?margin:\s*14px 0 8px/);
  assert.match(css, /\.settings-tertiary-title::after\s*\{[\s\S]*?flex:\s*1 1 auto/);
});

test("设置面板恢复原有字号层级，字体下拉选项保持可读", () => {
  const css = read("src/App.css");
  assert.match(css, /\.settings-section-title\s*>\s*h3\s*\{[\s\S]*?font-size:\s*16px[\s\S]*?line-height:\s*22px/);
  assert.match(css, /\.settings-subsection-title\s*\{[\s\S]*?font-size:\s*14px[\s\S]*?line-height:\s*20px/);
  assert.doesNotMatch(css, /\.settings-control-label\s*\{[\s\S]*?font-size:\s*16px/);
  assert.doesNotMatch(css, /\.settings-filter-row-toggle\s*\{[\s\S]*?font-size:\s*16px/);
  assert.match(css, /\.settings-filter-row-state\s*\{[\s\S]*?font-size:\s*12px[\s\S]*?line-height:\s*16px/);
  assert.match(read("src/components/SettingsListSelect.tsx"), /export function SettingsFontFamilySelect/);
  assert.match(listSelectSource, /role="combobox"/);
  assert.match(listSelectSource, /role="listbox"/);
  assert.match(css, /\.settings-list-select-menu\s*\{[\s\S]*?max-height:/);
  assert.match(css, /\.settings-list-select-menu-item\s*\{[\s\S]*?font-size:\s*14px[\s\S]*?line-height:\s*20px/);
});

test("字体下拉菜单可滚动，当前字体与其他设置控件统一字号", () => {
  const css = read("src/App.css");
  const commonMenuIndex = css.indexOf(".settings-control-menu");
  const fontMenuIndex = css.indexOf(".settings-list-select-menu {");
  assert.ok(commonMenuIndex >= 0 && fontMenuIndex > commonMenuIndex);
  const fontMenu = css.slice(fontMenuIndex, css.indexOf(".settings-list-select-menu-item", fontMenuIndex));
  assert.match(fontMenu, /overflow-y:\s*auto/);
  assert.match(listSelectSource, /settings-list-select-trigger settings-control-surface ui-type-control/);
});

test("顶部设置分类下拉菜单保留完整列表并显示独立滚动条", () => {
  const css = read("src/App.css");
  assert.match(source, /settings-section-navigator-menu/);
  assert.match(css, /\.settings-section-navigator-menu\s*\{[\s\S]*?max-height:/);
  assert.match(css, /\.settings-section-navigator-menu\s*\{[\s\S]*?overflow-y:\s*auto/);
  assert.match(css, /\.settings-section-navigator-menu::-webkit-scrollbar\s*\{[\s\S]*?width:/);
  assert.match(css, /\.settings-section-navigator-menu\s*\{[\s\S]*?scrollbar-width:\s*thin/);
});

test("窄工作台下设置标题保持单行，不被分类控件挤压换行", () => {
  const css = read("src/App.css");
  const start = css.indexOf(".settings-panel-header > h2");
  const block = css.slice(start, css.indexOf("}", start) + 1);
  assert.match(block, /white-space:\s*nowrap/);
});

test("三级标题下的筛选内容与标题使用相同的水平缩进", () => {
  assert.match(source, /settings-tertiary-content[\s\S]*?settings-filter-grid/);
  const css = read("src/App.css");
  assert.match(css, /\.settings-tertiary-content\s*\{[\s\S]*?margin:\s*0 8px/);
  assert.match(css, /\.settings-filter-grid\s*\{[\s\S]*?margin-top:\s*0/);
});

test("副窗口保留圆角，事件定时消失集中到事件显示", () => {
  const windowsStart = source.indexOf('data-settings-section="windows"');
  const displayStart = source.indexOf('data-settings-section="display"');
  const filtersStart = source.indexOf('data-settings-section="filters"', displayStart);
  const common = source.slice(windowsStart, source.indexOf('data-settings-anchor="display"', windowsStart));
  assert.match(common, /label="圆角"/);
  assert.doesNotMatch(common, /label="事件定时消失"/);
  assert.match(source.slice(displayStart, filtersStart), /label="事件定时消失"/);
});

test("副窗口外观颜色弹层根据可用空间选择上下方向并使用紧凑宽度", () => {
  assert.match(source, /getColorPopoverPlacement/);
  assert.match(source, /settings-surface-color-popover fixed/);
  assert.match(source, /w-\[260px\]/);
});

test("事件类型筛选不进入事件显示，弹幕窗独立承载筛选，最低礼物单价使用独立通用控件", () => {
  const displayStart = source.indexOf('data-settings-section="display"');
  const filtersStart = source.indexOf('data-settings-section="filters"', displayStart);
  const displaySection = source.slice(displayStart, filtersStart);
  assert.doesNotMatch(source, /显示范围/);
  assert.doesNotMatch(displaySection, /事件筛选|SettingsFilterSubmenu/);
  assert.match(source, /SettingsFilterRow/);
  assert.match(source, /GiftThresholdInput/);
});

test("每个分类的恢复默认覆盖该分类内的全部选项", () => {
  const generalStart = source.indexOf("const resetGeneral = () =>");
  const displayStart = source.indexOf("const resetDisplay = () =>");
  const filtersStart = source.indexOf("const resetFilters = () =>");
  const liveStart = source.indexOf("const resetLive = () =>");
  const windowsStart = source.indexOf("const resetWindows = () =>");
  const allStart = source.indexOf("const resetAll = () =>");
  const generalBlock = source.slice(generalStart, liveStart);
  const displayBlock = source.slice(displayStart, filtersStart);
  const filtersBlock = source.slice(filtersStart, liveStart);
  const liveBlock = source.slice(liveStart, windowsStart);
  const windowsBlock = source.slice(windowsStart, allStart);

  assert.match(generalBlock, /setPalette\("sakura"\)/);
  assert.match(generalBlock, /setMode\("system"\)/);
  assert.match(generalBlock, /resetGeneralSettings\(\)/);

  assert.match(displayBlock, /resetEventDisplaySettings/);
  assert.match(filtersBlock, /resetEventFiltersSettings/);
  assert.match(filtersBlock, /giftThreshold|giftThresholdMode/);
  assert.match(filtersBlock, /setEventDisplayPreference|resetEventFiltersSettings/);
  assert.match(liveBlock, /layoutMode|resetLiveSettings/);

  assert.match(windowsBlock, /setWindowEventFontSize|resetWindowsSettings/);
  assert.match(windowsBlock, /setWindowBigEmoteWidth|resetWindowsSettings/);
  assert.match(source, /label="开启弹幕窗"/);
  assert.match(source, /label="锁定并穿透鼠标"/);
  assert.match(source, /label="开启收益窗"/);
  assert.match(source, /onToggleGiftLock/);

  assert.match(source, /const resetAll = \(\) => \{[\s\S]*?resetGeneral\(\);[\s\S]*?resetDisplay\(\);[\s\S]*?resetFilters\(\);[\s\S]*?resetLive\(\);[\s\S]*?resetWindows\(\);/);
});

test("副窗口恢复默认不改变当前窗口的运行状态", () => {
  const windowsStart = source.indexOf("const resetWindows = () =>");
  const allStart = source.indexOf("const resetAll = () =>", windowsStart);
  const windowsBlock = source.slice(windowsStart, allStart);
  assert.match(windowsBlock, /resetWindowsSettings\(\)/);
  assert.doesNotMatch(windowsBlock, /onToggleDisplay\(\)|onToggleDisplayLock\(\)|onToggleGift\(\)|onToggleGiftLock\(\)/);
});

test("基准字号使用可上下微调的单一数字输入", () => {
  const editor = read("src/components/NativeThemeBasicSettings.tsx");
  assert.match(editor, /type="number" min="8" max="72" step="0\.5"/);
  assert.match(editor, /baseFontSize/);
});

test("事件显示位于现场之前，现场不再承载事件尺寸和显示开关", () => {
  const danmuIndex = source.indexOf('data-settings-section="display"');
  const liveIndex = source.indexOf('data-settings-section="live"');
  assert.ok(danmuIndex >= 0 && danmuIndex < liveIndex);
  const liveSection = source.slice(liveIndex, source.indexOf('data-settings-section="windows"', liveIndex));
  assert.doesNotMatch(liveSection, /现场事件基准字号|显示头像|最低礼物单价/);
});

test("大表情尺寸不再提供独立旧控件", () => {
  const editor = read("src/components/NativeThemeBasicSettings.tsx") + read("src/components/NativeThemeVisualEditor.tsx");
  assert.doesNotMatch(editor, /主窗口大表情宽度|副窗口大表情宽度/);
});

test("设置控件默认按内容并排，空间不足时整行切换而不是全局提前堆叠", () => {
  const css = read("src/App.css");
  assert.match(css, /\.settings-panel-frame\s*\{[\s\S]*?container-type:\s*inline-size/);
  assert.match(css, /\.settings-control-row[\s\S]*?display:\s*flex/);
  assert.match(css, /\.settings-control-row[\s\S]*?flex-wrap:\s*wrap/);
  assert.match(css, /\.settings-control-label[\s\S]*?white-space:\s*normal/);
  assert.match(css, /\.settings-control-row\s*>\s*\.settings-control-label\s*\{[\s\S]*?flex:\s*1 1 0[\s\S]*?min-width:\s*72px/);
  assert.doesNotMatch(css, /@container\s+settings-panel\s*\(max-width:\s*380px\)[\s\S]*?\.settings-segmented-row/);
});

test("分段选项按最长内容保留宽度并避免第三项被挤压", () => {
  const css = read("src/App.css");
  assert.match(css, /\.settings-control-value\s*\{[\s\S]*?width:\s*224px/);
  assert.match(css, /\.settings-segmented-row\s*>\s*\.settings-control-value\s*\{[\s\S]*?width:\s*max-content[\s\S]*?height:\s*var\(--settings-control-height\)/);
  assert.match(css, /\.settings-segmented-row\s*>\s*\.settings-control-value\s*>\s*button\s*\{[\s\S]*?height:\s*26px[\s\S]*?white-space:\s*nowrap/);
  assert.match(css, /\.settings-segmented-row\s*>\s*\.settings-control-value\s*>\s*button\s*\{[\s\S]*?flex:\s*0 0 auto/);
});

test("分段控件在内容确实放不下时整组换行并占满可用宽度", () => {
  const css = read("src/App.css");
  assert.match(source, /const rowRef = useRef<HTMLDivElement>\(null\)/);
  assert.match(source, /new ResizeObserver\(measure/);
  assert.match(source, /data-segmented-layout=\{layout\}/);
  assert.match(css, /\.settings-segmented-row\s*>\s*\.settings-control-value\s*>\s*button\s*\{[\s\S]*?padding-inline:\s*10px/);
  assert.match(css, /\.settings-segmented-row\[data-segmented-layout="stacked"\][^}]*>/);
  assert.match(css, /\.settings-segmented-row\[data-segmented-layout="stacked"\]\s*>\s*\.settings-control-label\s*\{[\s\S]*?flex:\s*1 1 100%/);
  assert.match(css, /\.settings-segmented-row\[data-segmented-layout="stacked"\]\s*>\s*\.settings-control-value\s*\{[\s\S]*?width:\s*100%/);
  assert.match(css, /\.settings-segmented-row\[data-segmented-layout="stacked"\]\s*>\s*\.settings-control-value\s*>\s*button\s*\{[\s\S]*?flex:\s*1 1 0/);
});

test("分段控件不再把长度判断写死为固定断点", () => {
  assert.doesNotMatch(source, /data-segmented-width/);
  assert.doesNotMatch(read("src/App.css"), /@container\s+settings-panel\s+\(max-width:\s*300px\)/);
});

test("顶部分类菜单按最长选项自适应宽度，并与触发按钮左对齐", () => {
  const css = read("src/App.css");
  assert.match(css, /\.settings-section-navigator-menu\s*\{[\s\S]*?left:\s*0/);
  assert.match(css, /\.settings-section-navigator-menu\s*\{[\s\S]*?right:\s*auto/);
  assert.match(css, /\.settings-section-navigator-menu\s*\{[\s\S]*?width:\s*max-content/);
  assert.match(css, /\.settings-section-navigator-menu\s*\{[\s\S]*?min-width:\s*8rem/);
  assert.match(css, /\.settings-section-navigator-menu\s*>\s*button[\s\S]*?white-space:\s*nowrap/);
});

test("设置行和辅助文字使用同一套垂直节奏", () => {
  const css = read("src/App.css");
  assert.match(css, /--settings-row-height:\s*40px/);
  assert.match(css, /--settings-control-height:\s*32px/);
  assert.match(css, /\.settings-control-row\s*\{[\s\S]*?row-gap:\s*var\(--settings-wrap-gap\)/);
  assert.match(css, /\.settings-helper-copy\s*\{[\s\S]*?margin:\s*2px 0 10px/);
  assert.match(css, /--settings-stacked-gap:\s*8px/);
});

test("相邻设置控件使用统一的组间距，包含搜索定位容器后的控件行", () => {
  const css = read("src/App.css");
  assert.match(css, /--settings-group-gap:\s*8px/);
  assert.match(css, /\.settings-section\s*>\s*:\s*is\(\.settings-control-row,\s*\[data-settings-search\]\)\s*\+\s*:\s*is\(\.settings-control-row,\s*\[data-settings-search\]\)\s*\{[\s\S]*?margin-top:\s*var\(--settings-group-gap\)/);
});

test("设置控件标签列收窄并保留可换行空间", () => {
  const css = read("src/App.css");
  assert.match(css, /--settings-control-gap:\s*8px/);
  assert.match(css, /\.settings-control-row\s*>\s*\.settings-control-label\s*\{[\s\S]*?min-width:\s*72px/);
  assert.match(css, /\.settings-control-label\s*\{[\s\S]*?overflow-wrap:\s*anywhere[\s\S]*?white-space:\s*normal/);
});

test("分段控件换行后使用独立的紧凑间距并占满整行", () => {
  const css = read("src/App.css");
  assert.match(css, /\.settings-segmented-row\[data-segmented-layout="stacked"\]\s*\{[\s\S]*?column-gap:\s*0[\s\S]*?row-gap:\s*var\(--settings-stacked-gap\)/);
  assert.match(css, /\.settings-segmented-row\[data-segmented-layout="stacked"\]\s*>\s*\.settings-control-value\s*\{[\s\S]*?width:\s*100%/);
});

test("普通下拉行换行后也使用整行布局", () => {
  const css = read("src/App.css");
  assert.match(source, /useAdaptiveSettingsRowLayout/);
  assert.match(source, /data-settings-layout=\{[^}]*\}/);
  assert.match(css, /\.settings-control-row\[data-settings-layout="stacked"\]\s*\{[\s\S]*?column-gap:\s*0[\s\S]*?row-gap:\s*var\(--settings-stacked-gap\)/);
  assert.match(css, /\.settings-control-row\[data-settings-layout="stacked"\]\s*>\s*\.settings-control-value\s*\{[\s\S]*?width:\s*100%/);
  assert.match(css, /\.settings-control-row\[data-settings-layout="stacked"\]\s+\.settings-list-select-wrap\s*\{[\s\S]*?width:\s*100%[\s\S]*?max-width:\s*none/);
});

test("顶部分类触发器继续收窄但不影响下拉菜单宽度", () => {
  const css = read("src/App.css");
  assert.match(css, /\.settings-section-navigator\s*\{[\s\S]*?min-width:\s*7rem/);
  assert.match(css, /\.settings-section-navigator-shell\s*\{[\s\S]*?max-width:\s*8rem/);
  assert.match(css, /\.settings-section-navigator-menu\s*\{[\s\S]*?min-width:\s*8rem/);
});

test("设置分类触发器的文字左对齐，备注收敛到悬停提示", () => {
  const css = read("src/App.css");
  assert.match(css, /\.settings-section-navigator\s*\{[\s\S]*?text-align:\s*left/);
  assert.match(source, /className="settings-section-navigator settings-control-surface ml-0 flex h-8 min-w-0 items-center justify-start/);
  assert.match(source, /hint="仅在托盘运行；若同时开启启动后自动连接，会连接最近使用的主播；没有凭证或主播记录时跳过。"/);
  assert.match(source, /hint="开启后，收藏事件会立即打开备注和标签编辑；关闭时可长按收藏图标编辑。"/);
  assert.match(source, /title="开启后优先进入当前连接栏主播的档案；关闭后进入所有主播档案馆。快捷入口仍可直接查看当前主播和当前场次。"/);
  assert.match(source, /hint="事件行的更多菜单左侧可显示快捷按钮；收藏和标记状态会单独常驻。"/);
  assert.doesNotMatch(source, /hint="语音与个性播报共用此输出设置。"/);
  for (const phrase of ["开机自启时仅在托盘运行。", "开启后，收藏事件会立即打开备注和标签编辑；", "开启后优先进入当前连接栏主播的档案；", "事件行的更多菜单左侧可显示快捷按钮；", "语音与个性播报共用此输出设置。"])
    assert.doesNotMatch(source, new RegExp(`settings-helper-copy[^>]*>[\\s\\S]*?${phrase}`));
});

test("设置页移除普通解释性备注且不承载样式入口", () => {
  assert.doesNotMatch(source, />拖动可排序<\/div>/);
  assert.match(source, /settings-shortcut-selected-list[^>]*title="拖动或使用方向键调整顺序"/);
  assert.doesNotMatch(source, /主题、元素显示和外观|编辑样式|ThemeWorkspace/);
  assert.doesNotMatch(source, /昵称作为通用用户名，影响界面显示和语音播报。<\/p>/);
  assert.doesNotMatch(source, /语音与个性播报共用此输出设置。/);
});

test("设置开关滑块以轨道左边缘为定位基准", () => {
  assert.match(read("src/components/SettingsSwitch.tsx"), /absolute left-0\.5 top-0\.5/);
  assert.match(read("src/components/SettingsSwitch.tsx"), /translate-x-\[17px\]/);
});

test("设置内框沿用主区域底色并给正文保留十六像素横向留白", () => {
  assert.match(source, /settings-panel-frame[^\n]+bg-bg/);
  assert.match(source, /settings-panel-frame[^\n]+inset-3/);
  assert.match(surfaceSource, /settings-panel-scroll[^\n]+px-4/);
});

test("设置分类导航向右收紧但不侵入右侧按钮轨道", () => {
  assert.match(source, /settings-panel-header[^\n]+pr-11/);
  assert.match(source, /settings-search-trigger/);
  assert.match(source, /settings-section-navigator[^\n]+ml-0/);
});

test("设置滚动内容保留完整区域并用正文底部留白避让按钮", () => {
  assert.match(surfaceSource, /settings-panel-scroll[^\n]+pb-14/);
  assert.match(surfaceSource, /settings-panel-scrollbar/);
});

test("样式不在设置页提供第二入口", () => {
  assert.doesNotMatch(source, /事件个性化设置/);
  assert.doesNotMatch(source, /编辑样式|ThemeWorkspace|IconStyleEditor/);
});

test("管理昵称保持说明在左、按钮在右的横向布局", () => {
  const css = read("src/App.css");
  assert.match(css, /\.settings-style-editor-summary\s*\{[\s\S]*?flex-direction:\s*row/);
  assert.doesNotMatch(css, /@container\s+settings-panel\s+\(max-width:\s*380px\)[\s\S]*?\.settings-style-editor-summary/);
  assert.match(css, /\.settings-style-editor-summary\s*\{[\s\S]*?justify-content:\s*space-between/);
  assert.match(source, /settings-style-editor-summary\s+settings-user-nickname-summary/);
});

test("事件显示只保留行为设置，基础视觉控件集中到样式工作区", () => {
  const displayStart = source.indexOf('data-settings-section="display"');
  const filtersStart = source.indexOf('data-settings-section="filters"');
  const display = source.slice(displayStart, filtersStart);
  assert.doesNotMatch(display, /主窗口基准字号|副窗口基准字号|头像大小|字体字重|文字描边/);
  const styleEditor = read("src/components/NativeThemeVisualEditor.tsx");
  assert.match(styleEditor, /nativeVisualPropertySectionsForPart\(selection.part, activeShape\)/);
  assert.match(read("src/themes/nativeThemeCapabilities.ts"), /spacing: \["paddingX", "paddingY"/);
  assert.match(source, /setEventAnimationPreset/);
});

test("回看设置包含全局档案管理入口和保留时长设置", () => {
  const panel = read("src/components/SettingsPanel.tsx");
  const archiveSettings = read("src/components/ReviewArchiveSettings.tsx");
  const workbench = read("src/components/RightWorkbench.tsx");
  assert.match(panel, /ReviewArchiveSettings/);
  assert.match(archiveSettings, /导入档案/);
  assert.match(archiveSettings, /导出档案/);
  assert.match(archiveSettings, /按日期范围导出/);
  assert.match(archiveSettings, /kind: "date"/);
  assert.match(archiveSettings, /仅保留指定主播/);
  assert.match(archiveSettings, /keepOnlyOwnerId/);
  assert.match(archiveSettings, /按日期范围/);
  assert.match(archiveSettings, /默认保留策略|档案保留时长/);
  assert.match(archiveSettings, /按范围清理档案/);
  assert.match(workbench, /archiveRepository/);
});

test("回看设置的说明文字收敛到字段悬停提示", () => {
  const archiveSource = read("src/components/ReviewArchiveSettings.tsx");
  for (const phrase of [
    "导入或导出全部主播档案；包含事件内容和资源地址，不包含图片、设置或凭证。",
    "按开播日期筛选，结束日期包含当天。",
    "可为指定主播单独设置，只影响手动清理。",
    "图片只保存链接，不保存图片文件。",
    "先预览影响范围。仅保留指定主播会删除其他可删除档案。",
  ]) {
    assert.doesNotMatch(archiveSource, new RegExp(`>${phrase}<\\/div>`));
    assert.match(archiveSource, new RegExp(`title="${phrase}"`));
  }
});

test("回看设置中的清理档案必须经过二次确认弹窗", () => {
  const archiveSettings = read("src/components/ReviewArchiveSettings.tsx");
  assert.match(archiveSettings, /ConfirmDialog/);
  assert.match(archiveSettings, /确认清理档案/);
  assert.match(archiveSettings, /删除后无法恢复/);
  assert.doesNotMatch(archiveSettings, /onClick=\{confirmDelete\}/);
});

test("字体列表在样式工作区按需加载并缓存", () => {
  assert.match(stylePanelSource, /ensureInstalledFonts/);
  assert.match(stylePanelSource, /fontLoadPromiseRef/);
  assert.match(stylePanelSource, /useMemo/);
  assert.match(stylePanelSource, /onOpenFonts(?::|=\{)\s*ensureInstalledFonts/);
  assert.match(stylePanelSource, /ensureInstalledFonts = useCallback\([\s\S]*?invoke<string\[\]>\("list_installed_fonts"\)/);
  assert.doesNotMatch(stylePanelSource, /useEffect\([^\n]*list_installed_fonts/);
});

test("设置下拉会在打开时根据菜单实际高度重新定位", () => {
  assert.match(listSelectSource, /menuRef\.current\?\.getBoundingClientRect\(\)\.height/);
  assert.match(listSelectSource, /resolveSettingsMenuPosition/);
  assert.match(listSelectSource, /ResizeObserver/);
});

test("自适应设置行使用完整 data 属性名写入布局状态", () => {
  assert.match(source, /row\.setAttribute\(layoutAttribute,\s*"inline"\)/);
  assert.match(source, /row\.setAttribute\(layoutAttribute,\s*nextLayout\)/);
  assert.doesNotMatch(source, /row\.dataset\[layoutAttribute\]/);
});
