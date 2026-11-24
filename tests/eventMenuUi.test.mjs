import postcss from 'postcss';
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(fileURLToPath(new URL("../src/components/EventContextMenu.tsx", import.meta.url)), "utf8");
const previewSource = readFileSync(fileURLToPath(new URL("../src/components/ImagePreviewOverlay.tsx", import.meta.url)), "utf8");
const eventRow = readFileSync(fileURLToPath(new URL("../src/components/EventRow.tsx", import.meta.url)), "utf8");
const eventList = readFileSync(fileURLToPath(new URL("../src/components/EventList.tsx", import.meta.url)), "utf8");
const eventPane = readFileSync(fileURLToPath(new URL("../src/components/EventPane.tsx", import.meta.url)), "utf8");
const partitionColumn = readFileSync(fileURLToPath(new URL("../src/components/PartitionColumn.tsx", import.meta.url)), "utf8");
const app = readFileSync(fileURLToPath(new URL("../src/App.tsx", import.meta.url)), "utf8");
const reviewPanel = readFileSync(fileURLToPath(new URL("../src/components/ReviewPanel.tsx", import.meta.url)), "utf8");
const cssSource = readFileSync(fileURLToPath(new URL("../src/App.css", import.meta.url)), "utf8");
const settings = readFileSync(fileURLToPath(new URL("../src/components/SettingsPanel.tsx", import.meta.url)), "utf8");


const scaledEventSize = "var(--event-font-size, calc(var(--review-main, 14px) * 16 / 14))";
const menuSize = `var(--event-menu-size, calc(${scaledEventSize} * 24 / 16))`;
function cssDeclaration(selector, property) {
  let value;
  postcss.parse(cssSource).walkRules(rule => {
    if (rule.selector === selector) rule.walkDecls(property, declaration => { value = declaration.value; });
  });
  return value;
}

test("现场事件菜单按约定顺序提供六个动作，并保留键盘入口", () => {
  const menuStart = source.indexOf("const actions");
  assert.ok(menuStart >= 0);
  const menu = source.slice(menuStart, menuStart + 7000);
  const labels = ["筛选该用户", "语音播报", "添加昵称", "打开用户主页", "收藏事件", "标记事件"];
  let previous = -1;
  for (const label of labels) {
    const index = menu.indexOf(label);
    assert.ok(index > previous, `${label} 菜单顺序不正确`);
    previous = index;
  }
  assert.match(menu, /onKeyDown/);
  assert.match(menu, /aria-label/);
});

test("事件菜单动作使用语义图标，并让筛选、昵称、收藏、标记图标随状态切换", () => {
  assert.match(source, /type MenuIconName = [\s\S]*"filter"[\s\S]*"voice"[\s\S]*"nickname"[\s\S]*"profile"[\s\S]*"favorite"[\s\S]*"mark"/);
  for (const icon of ["filter", "voice", "nickname", "profile", "favorite", "mark"]) {
    assert.match(source, new RegExp(`icon: "${icon}"`));
  }
  assert.match(source, /active: userFiltered/);
  assert.match(source, /active: Boolean\(userNickname\)/);
  assert.match(source, /active: favorited/);
  assert.match(source, /active: marked/);
  assert.match(source, /<MenuActionIcon name=\{action\.icon\} active=\{action\.active\} \/>/);
  const iconIndex = source.indexOf("<MenuActionIcon name={action.icon}");
  const labelIndex = source.indexOf("{action.label}</span>", iconIndex);
  assert.ok(iconIndex >= 0 && labelIndex > iconIndex, "菜单图标应位于文字前");
  assert.match(source, /fill=\{active \? "currentColor" : "none"\}/);
});

test("事件行快捷菜单支持播报、筛选、收藏、标记，并只常驻收藏与标记状态", () => {
  assert.match(eventRow, /shortcutActions/);
  assert.doesNotMatch(eventRow, /actionPaddingRight/);
  assert.match(source, /visibleShortcutActions/);
  assert.match(source, /event-quick-action/);
  assert.match(source, /onSpeakEvent\(event\)/);
  assert.match(source, /onUserFilter/);
  assert.match(source, /onToggleFavorite\(event\)/);
  assert.match(source, /onToggleMark\(handlers\.regionKey, event\)/);
  assert.match(source, /shortcutActionPersistent/);
  assert.match(source, /favorited && !visible\.includes\("favorite"\)/);
  assert.match(source, /marked && !visible\.includes\("mark"\)/);
  assert.match(cssSource, /event-quick-action-persistent/);
  assert.match(cssSource, /event-quick-action-persistent \.event-context-menu-action-icon\s*\{[^}]*filter: drop-shadow/);
  assert.ok(cssSource.includes(`right: calc(var(--shortcut-hover-offset, 0) * (${menuSize} + calc(${scaledEventSize} * 2 / 16)))`));
  assert.match(cssSource, /transition:[^;]*width/);
  assert.doesNotMatch(cssSource, /\.event-row-with-menu:focus-within \.event-quick-action/);
});

test("事件快捷菜单设置支持指针拖动排序，并用删除标记移除按钮", () => {
  assert.match(settings, /shortcutActions/);
  assert.match(settings, /onPointerDown/);
  assert.match(settings, /onPointerMove/);
  assert.match(settings, /onPointerUp/);
  assert.match(settings, /setPointerCapture/);
  assert.match(settings, /dragRowCenters/);
  assert.match(settings, /dragTargetHysteresisPx/);
  assert.match(settings, /findShortcutTarget/);
  assert.doesNotMatch(settings, /elementFromPoint/);
  assert.match(settings, /dragOverAction/);
  assert.match(settings, /dragPointer/);
  assert.match(settings, /dragGrabOffset/);
  assert.match(settings, /dragPreviewSize/);
  assert.match(settings, /dragRowSlot/);
  assert.match(settings, /left: dragPointer\.x - dragGrabOffset\.x/);
  assert.match(settings, /top: dragPointer\.y - dragGrabOffset\.y/);
  assert.match(settings, /settings-shortcut-drag-preview/);
  assert.match(settings, /data-shortcut-delete/);
  assert.match(settings, /stopPropagation/);
  assert.match(cssSource, /settings-shortcut-drag-preview/);
  assert.match(cssSource, /settings-shortcut-item[\s\S]*transform/);
  const previewCssStart = cssSource.indexOf(".settings-shortcut-drag-preview");
  const previewCss = cssSource.slice(previewCssStart, previewCssStart + 600);
  assert.match(previewCss, /transition: transform/);
  assert.doesNotMatch(previewCss, /left 80ms|top 80ms/);
  assert.match(settings, /删除快捷/);
  const selectedActionStart = settings.indexOf("<div className=\"flex min-w-0 flex-1 cursor-grab");
  const selectedActionEnd = settings.indexOf("</div>", selectedActionStart) + "</div>".length;
  assert.doesNotMatch(settings.slice(selectedActionStart, selectedActionEnd), /onClick/);
  assert.doesNotMatch(settings, /onMoveShortcut/);
  assert.doesNotMatch(settings, /移到上方/);
  assert.doesNotMatch(settings, /移到下方/);
  assert.doesNotMatch(settings, /draggable/);
});

test("事件快捷菜单设置将显示按钮改为全宽分区，并分离可添加操作", () => {
  assert.match(settings, /<div className="settings-shortcut-picker min-w-0">/);
  assert.match(settings, /settings-shortcut-picker-header/);
  assert.match(settings, /<span className="ui-type-control text-t2">显示按钮<\/span>/);
  assert.match(settings, /已选 \{selectedCount\}\/3/);
  assert.match(settings, /settings-shortcut-selected-list[^>]*title="拖动或使用方向键调整顺序"/);
  assert.match(settings, /<div className="settings-shortcut-add-label ui-type-meta text-t3">可添加<\/div>/);
  assert.doesNotMatch(settings, /settings-control-row settings-shortcut-row/);
});

test("设置提供 0 到 3 个事件快捷图标的多选控制", () => {
  assert.match(settings, /事件快捷菜单/);
  assert.match(settings, /shortcutActions/);
  assert.match(settings, /最多选择 3 个/);
  assert.match(settings, /aria-pressed=\{false\}/);
  assert.match(settings, /VOICE_SHORTCUT_ACTION_OPTIONS/);
  assert.match(settings, /value: "speak"[\s\S]*value: "filter"[\s\S]*value: "favorite"[\s\S]*value: "mark"/);
});

test("事件菜单会根据当前筛选状态切换筛选动作，并支持退出用户筛选", () => {
  assert.match(source, /isUserFiltered\?: \(user: DanmakuUser\) => boolean/);
  assert.match(source, /onClearUserFilter\?: \(\) => void/);
  assert.match(source, /const userFiltered = Boolean\(user && handlers\.isUserFiltered\?\.\(user\)\)/);
  assert.match(source, /label: userFiltered \? "退出筛选" : "筛选该用户"/);
  assert.match(source, /userFiltered \? handlers\.onClearUserFilter\?\.\(\) : handlers\.onUserFilter\?\.\(user\)/);
  assert.match(source, /const actionDisabled = userFiltered \? !handlers\.onClearUserFilter : !handlers\.onUserFilter/);
});

test("筛选中的现场和回看事件菜单提供查看上下文，并由各自列表定位原事件", () => {
  assert.match(source, /onViewContext\?: \(event: DanmakuEvent, regionKey: string\) => void/);
  assert.match(source, /label: "查看上下文"/);
  assert.match(source, /handlers\.onViewContext\?\.\(event, handlers\.regionKey\)/);
  assert.match(app, /onViewContext/);
  assert.match(app, /setQuery\(\{\}\)/);
  assert.match(eventList, /contextTargetRegionKey/);
  assert.match(eventList, /locateLiveEvent\(/);
  assert.match(eventList, /locationRowsRef\.current/);
  assert.match(eventList, /setLocatedMarkKey\(contextTargetKey\)/);
  assert.match(reviewPanel, /createCategoryOnlyArchiveFilters/);
});

test("事件菜单昵称操作使用编辑弹窗回调，不跳转设置页", () => {
  assert.match(source, /onSaveNickname\?: \(user: DanmakuUser, nickname: string\) => void/);
  assert.match(source, /onDeleteNickname\?: \(user: DanmakuUser\) => void/);
  assert.match(source, /nicknameDialogOpen/);
  assert.match(source, /添加昵称/);
  assert.match(source, /更改昵称/);
  assert.match(source, /删除昵称/);
  assert.doesNotMatch(source, /onAddNickname/);
});

test("昵称说明使用通用用户名表述，并保持单行显示", () => {
  assert.match(source, /昵称作为通用用户名/);
  assert.match(source, /whitespace-nowrap/);
  assert.doesNotMatch(source, /替换现场显示的用户名/);
  assert.match(settings, /昵称作为通用用户名/);
  assert.match(settings, /title="昵称作为通用用户名，影响界面显示和语音播报。"/);
  assert.doesNotMatch(settings, /昵称会替换现场事件中的用户名/);
});

test("现场昵称弹窗相对整个事件区域居中，并支持拖动", () => {
  assert.match(app, /const eventAreaRef = useRef<HTMLElement>\(null\)/);
  assert.match(app, /<main ref=\{eventAreaRef\}/);
  assert.match(app, /eventAreaRef=\{eventAreaRef\}/);
  assert.match(eventPane, /eventAreaRef\?: RefObject<HTMLElement \| null>/);
  assert.match(eventPane, /eventAreaRef=\{eventAreaRef\}/);
  assert.match(eventList, /eventAreaRef\?: RefObject<HTMLElement \| null>/);
  assert.match(eventList, /eventAreaRef=\{eventAreaRef\}/);
  assert.match(partitionColumn, /eventAreaRef\?: RefObject<HTMLElement \| null>/);
  assert.match(partitionColumn, /eventAreaRef=\{eventAreaRef\}/);
  assert.match(eventRow, /eventAreaRef\?: RefObject<HTMLElement \| null>/);
  assert.match(source, /eventAreaRef\?: RefObject<HTMLElement \| null>/);
  assert.match(source, /eventAreaRef\?\.current\?\.getBoundingClientRect\(\)/);
  assert.match(source, /onPointerDown/);
  assert.match(source, /setPointerCapture/);
  assert.match(source, /cursor-move/);
});

test("设置昵称弹窗始终相对设置面板居中且不提供拖动入口", () => {
  assert.match(settings, /frameRef\.current\?\.getBoundingClientRect\(\)/);
  assert.match(settings, /settings-user-nickname-popover/);
  assert.match(settings, /maxHeight/);
  const nicknamePopupStart = settings.indexOf("settings-user-nickname-popover");
  const nicknamePopup = settings.slice(nicknamePopupStart, nicknamePopupStart + 9000);
  assert.doesNotMatch(nicknamePopup, /onPointerDown/);
  assert.doesNotMatch(nicknamePopup, /setPointerCapture/);
});

test("昵称说明完整显示，弹窗为完整文案预留宽度且不显示省略号", () => {
  const eventPopupStart = source.indexOf("event-context-nickname-dialog");
  const eventPopup = source.slice(eventPopupStart, eventPopupStart + 5000);
  assert.match(eventPopup, /w-\[min\(460px,calc\(100vw-16px\)\)\]/);
  assert.match(eventPopup, /whitespace-nowrap ui-type-meta/);
  assert.doesNotMatch(eventPopup, /truncate whitespace-nowrap ui-type-meta/);

  const settingsPopupStart = settings.indexOf("settings-user-nickname-popover");
  const settingsPopup = settings.slice(settingsPopupStart, settingsPopupStart + 9000);
  assert.match(settings, /const width = Math\.min\(460, /);
  assert.match(settingsPopup, /title="昵称作为通用用户名，影响界面显示和语音播报。"/);
  assert.doesNotMatch(settingsPopup, /昵称作为通用用户名，影响界面显示和语音播报。<\/p>/);
  assert.doesNotMatch(settingsPopup, /新增请从事件菜单操作/);
});

test("跳转到标记后只高亮本次定位的事件，并自动结束高亮", () => {
  assert.match(eventList, /const \[locatedMarkKey, setLocatedMarkKey\] = useState<string \| null>\(null\)/);
  assert.match(eventList, /const rowKey = getEventRowKey\(markedEvent\)/);
  assert.match(eventList, /setLocatedMarkKey\(rowKey\)/);
  assert.match(eventList, /setTimeout\([\s\S]*setLocatedMarkKey/);
  assert.match(eventList, /locatedMarkKey === getEventRowKey\(ev\)/);
  assert.match(eventRow, /locatedHighlight\?: boolean/);
  assert.match(eventRow, /event-row-located-indicator/);
  assert.doesNotMatch(eventRow, /locatedHighlight \? "event-row-located"/);
  assert.match(cssSource, /@keyframes located-event-pulse/);
  assert.match(cssSource, /\.event-row-located-indicator/);
  const locatedRuleStart = cssSource.indexOf(".event-row-located-indicator {");
  const locatedRuleEnd = cssSource.indexOf("}", locatedRuleStart) + 1;
  const locatedRule = cssSource.slice(locatedRuleStart, locatedRuleEnd);
  assert.doesNotMatch(locatedRule, /transform|height|width|padding|margin/);
  assert.match(cssSource, /located-event-pulse[\s\S]*background-color/);
  assert.match(cssSource, /\.theme-surface\.live \.event\.event-row-with-menu\s*\{\s*position: relative/);
});

test("点击事件菜单头像在整个事件区域显示方形预览，并提供遮罩关闭入口", () => {
  assert.match(source, /avatarPreviewOpen/);
  assert.match(source, /setAvatarPreviewOpen\(true\)/);
  assert.match(source, /ImagePreviewOverlay/);
  assert.match(source, /variant="avatar"/);
  assert.match(source, /boundsRef=\{eventAreaRef\}/);
  assert.match(previewSource, /role="dialog"/);
  assert.match(previewSource, /aria-modal="true"/);
  assert.match(previewSource, /bg-bg\/80/);
  assert.match(previewSource, /size-60[^\n]*rounded-full[^\n]*object-cover/);
  assert.match(source, /closeLabel="关闭头像预览"/);
  assert.match(previewSource, /onPointerDown/);
});

test("事件菜单按钮固定在右侧操作轨道内，默认不显示边界", () => {
  assert.match(source, /event-row-actions absolute right-2 z-10 flex items-center gap-1/);
  assert.doesNotMatch(source, /top-1\/2 -translate-y-1\/2/);
  assert.match(source, /className="[^"]*event-menu-trigger[^"]*border border-transparent[^"]*bg-transparent[^"]*shadow-none/);
  assert.match(source, /className="event-menu-glyph"/);
  assert.match(source, /<LucideEllipsis className="event-menu-glyph"/);
  assert.doesNotMatch(source, /•••/);
  assert.doesNotMatch(source, /border-line\/70 bg-surface\/95/);
  assert.match(source, /event-row-actions/);
  assert.equal(cssDeclaration('.theme-surface.live .event.event-row-with-menu .event-row-actions', 'left'), `calc(100cqi - calc(${scaledEventSize} * 8 / 16))`);
  const railStart = cssSource.indexOf(".event-row-with-menu .event-row-actions {");
  const railEnd = cssSource.indexOf("}", railStart) + 1;
  const railBlock = cssSource.slice(railStart, railEnd);
  assert.match(railBlock, /inset-block: 0/);
  assert.match(railBlock, /display: flex/);
  assert.match(railBlock, /align-items: center/);
  assert.doesNotMatch(railBlock, /top: 50%|transform: translateY/);
  const triggerStart = cssSource.indexOf(".event-row-with-menu .event-menu-trigger {");
  const triggerEnd = cssSource.indexOf("}", triggerStart) + 1;
  const triggerBlock = cssSource.slice(triggerStart, triggerEnd);
  assert.ok(triggerBlock.includes(`width: ${menuSize}`));
  assert.ok(triggerBlock.includes(`height: ${menuSize}`));
  assert.match(triggerBlock, /overflow: hidden/);
  const glyphStart = cssSource.indexOf(".event-menu-glyph {");
  const glyphEnd = cssSource.indexOf("}", glyphStart) + 1;
  const glyphBlock = cssSource.slice(glyphStart, glyphEnd);
  assert.match(glyphBlock, /width: calc\(var\(--event-menu-size, 24px\) \* 2 \/ 3\)/);
  assert.match(glyphBlock, /height: calc\(var\(--event-menu-size, 24px\) \* 2 \/ 3\)/);
  assert.match(glyphBlock, /max-width: 100%/);
  assert.match(glyphBlock, /max-height: 100%/);
  assert.doesNotMatch(cssSource, /transform: translateY\(-50%\) translateX\(4px\)/);
  assert.equal(cssDeclaration(".event-row-with-menu .event-quick-action", "transform"), `translateX(calc(${scaledEventSize} * 4 / 16))`);
  assert.doesNotMatch(cssSource, /transform: translateY\(-50%\) translateX\(0\)/);
  assert.match(cssSource, /transform: translateX\(0\)/);
  assert.match(cssSource, /event-row-with-menu \.event-menu-trigger:hover/);
});

test("快捷按钮从更多按钮锚点展开，并让收藏黄色、标记琥珀橙色在菜单中保持一致", () => {
  assert.match(eventRow, /eventHasPersistentAction/);
  assert.match(cssSource, /:has\(> \.event-row-has-persistent-action\)::after/);
  assert.match(source, /event-quick-actions/);
  assert.match(source, /shortcutRestOffset/);
  assert.match(source, /shortcutHoverOffset/);
  assert.match(source, /actionToneClass\(QUICK_ACTION_ICON\[shortcutAction\], active\)/);
  assert.match(source, /actionToneClass\(action\.icon, action\.active\)/);
  assert.match(cssSource, /\.event-action-favorite\s*\{[^}]*--event-action-state: rgb\(234, 179, 8\)/);
  assert.match(cssSource, /\.event-action-mark\s*\{[^}]*--event-action-state: rgb\(245, 158, 11\)/);
  assert.match(cssSource, /right: calc\(var\(--shortcut-rest-offset/);
  assert.match(cssSource, /right: calc\(var\(--shortcut-hover-offset/);
  assert.match(cssSource, /transition: right[^;]*180ms/);
  assert.match(cssSource, /background: linear-gradient\(90deg, transparent 0%,[\s\S]*var\(--surface-raised\) 100%\)/);
});

test("昵称管理位于事件交互设置，并提供朗读开关和滚动容器", () => {
  assert.match(settings, /事件交互/);
  assert.match(settings, /朗读昵称\/用户名/);
  assert.match(settings, /用户昵称/);
  assert.match(settings, /settings-user-nickname-summary/);
  assert.match(settings, /nicknameManagerOpen/);
  assert.match(settings, /role="dialog"/);
  assert.match(settings, /编辑/);
  assert.match(settings, /删除/);
  assert.doesNotMatch(settings, /settings-user-nickname-fields/);
  assert.doesNotMatch(settings, /输入 UID/);
  assert.doesNotMatch(settings, />\s*保存昵称\s*</);
});

test("事件菜单顶部把用户名放在头像上方，并把两种时间分别排成独立一行", () => {
  assert.match(source, /nickname\?: string/);
  assert.match(source, /eventFontSize\?: number/);
  assert.match(source, /event-context-menu-identity[^\n]*flex-col/);
  assert.match(source, /event-context-menu-user/);
  assert.match(source, /event-context-menu-user[^\n]*w-full[^\n]*text-left/);
  assert.match(source, /event-context-menu-meta[^\n]*justify-start/);
  assert.match(source, /user\?\.avatar/);
  assert.match(source, /userName/);
  assert.match(source, /（\{userNickname\}）/);
  assert.match(source, /event-context-menu-time[^\n]*flex[^\n]*flex-col/);
  assert.match(source, /event-context-menu-time[^\n]*font-mono ui-type-meta/);
  assert.match(source, /event-context-menu-time[^\n]*whitespace-nowrap/);
  assert.match(source, /title=\{userIdentity\}/);
  assert.match(source, /formatEventAge\(event\.ts, ageNow\)[\s\S]*formatEventTime\(event\.ts\)/);
  assert.match(eventRow, /<EventContextMenu event=\{ev\} nickname=\{ev\.user \? userNicknames\[ev\.user\.uid\] : undefined\} eventFontSize=\{size\}/);

  const menuStart = cssSource.indexOf(".event-context-menu {");
  const menuEnd = cssSource.indexOf("\n}", menuStart) + 2;
  const menuBlock = cssSource.slice(menuStart, menuEnd);
  assert.match(menuBlock, /--type-control-size: calc\(var\(--event-context-menu-event-size, 16px\) \* 0\.875\)/);
  assert.match(menuBlock, /--type-control-line: var\(--event-context-menu-event-size, 16px\)/);
  assert.match(menuBlock, /--type-meta-size: 12px/);
  assert.match(menuBlock, /--type-meta-line: var\(--event-context-menu-event-size, 16px\)/);
  assert.match(menuBlock, /--type-micro-size: calc\(var\(--event-context-menu-event-size, 16px\) \* 0\.75\)/);
  assert.match(menuBlock, /--type-micro-line: var\(--event-context-menu-event-size, 16px\)/);
});

test("现场操作渐变由整行槽位承载，不占用主题伪元素", () => {
  assert.match(cssSource, /event-row-slot-content:has\(> \.event-row-with-menu\)::after/);
  assert.doesNotMatch(cssSource, /(?:^|\n)\.event-row-with-menu::after\s*\{/);
  assert.match(cssSource, /bottom: var\(--event-menu-bottom\)/);
});
