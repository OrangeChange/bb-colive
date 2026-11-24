import { NATIVE_EVENT_SCOPES } from "../themes/nativeThemeCapabilities.ts";
import { normalizeNativeEventVisibility, type NativeEventVisibility, type NativeThemeDisplaySettings } from "../themes/nativeComponentAppearance.ts";
import { PanelSwitch } from "./voicePanelPrimitives.tsx";
import { SettingsChoiceControl } from "./SettingsChoiceControl";
import { SettingsIcon } from "./SettingsIcon";

const DISPLAY_OPTIONS: readonly [keyof NativeThemeDisplaySettings, string][] = [
  ["showUsername", "用户名"], ["showTimestamp", "时间"], ["maskUsername", "用户名打码"],
  ["showAvatar", "头像"], ["showAvatarFrame", "头像框"], ["showGuardIdentity", "大航海身份"],
  ["showAdminIdentity", "房管身份"], ["showAnchorIdentity", "主播身份"], ["showFanMedal", "粉丝牌"],
  ["showHonorLevel", "荣耀勋章"], ["showCurrentRank", "当前排行"], ["showGiftImage", "礼物图标"], ["showEventIcon", "事件图标"],
  ["onlyAnchorFanMedal", "只显示当前主播粉丝牌"], ["hideUnlitFanMedal", "隐藏未点亮粉丝牌"],
];

export function NativeThemeBasicSettings({ display, visibility, onDisplayChange, onVisibilityChange }: {
  display: NativeThemeDisplaySettings;
  visibility: NativeEventVisibility | undefined;
  onDisplayChange: (value: NativeThemeDisplaySettings) => void;
  onVisibilityChange: (value: NativeEventVisibility) => void;
}) {
  const eventVisibility = normalizeNativeEventVisibility(visibility);
  const toggleCategory = (id: string) => { onVisibilityChange({ ...eventVisibility, categories: { ...eventVisibility.categories, [id]: !eventVisibility.categories[id] } }); };
  const toggleChild = (id: string) => { onVisibilityChange({ ...eventVisibility, legacyLiveStatusConflict: id === "liveStatus" ? false : eventVisibility.legacyLiveStatusConflict, children: { ...eventVisibility.children, [id]: !eventVisibility.children[id] } }); };
  const row = (label: string, checked: boolean, onChange: () => void, disabled = false) => <div className="native-theme-setting-row" role="group" aria-label={label} key={label}><PanelSwitch label={label} checked={checked} disabled={disabled} onChange={onChange} /><span>{label}</span></div>;
  const eventScopes = NATIVE_EVENT_SCOPES.filter(scope => scope.id !== "all");
  const groupActions = (allSelected: boolean, noneSelected: boolean, onSet: (checked: boolean) => void) => <div className="native-theme-subgroup-actions"><button type="button" disabled={allSelected} onClick={() => onSet(true)}>全选</button><button type="button" disabled={noneSelected} onClick={() => onSet(false)}>清空</button></div>;
  const setAllCategories = (checked: boolean) => { onVisibilityChange({ ...eventVisibility, categories: { ...eventVisibility.categories, ...Object.fromEntries(eventScopes.map(scope => [scope.id, checked])) } }); };
  const detailGroup = (scopeId: "interaction" | "gift" | "system", title: string) => {
    const scope = eventScopes.find(item => item.id === scopeId)!;
    const children = scope.children ?? [];
    const selected = children.filter(child => eventVisibility.children[child.id] !== false).length;
    const setAll = (checked: boolean) => { onVisibilityChange({ ...eventVisibility, children: { ...eventVisibility.children, ...Object.fromEntries(children.map(child => [child.id, checked])) } }); };
    return <section className="native-theme-subgroup" aria-label={title}><div className="native-theme-subgroup-heading"><h4>{title}</h4>{groupActions(selected === children.length, selected === 0, setAll)}</div><div className="native-theme-toggle-grid">{children.map(child => row(child.label, eventVisibility.children[child.id] !== false, () => toggleChild(child.id)))}</div></section>;
  };
  const selectedCategories = eventScopes.filter(scope => eventVisibility.categories[scope.id] !== false).length;
  return <div className="native-theme-basic">
    <section className="native-editor-section"><header><h3><SettingsIcon name="基础设置" />基础设置</h3><p>基准字号控制主题中随基准变化的文字、媒体和间距。</p></header>
      <div className="native-theme-inline-fields native-theme-baseline-fields"><label className="native-theme-number-field"><span>基准字号</span><input type="number" min="8" max="72" step="0.5" value={display.baseFontSize} onChange={event => onDisplayChange({ ...display, baseFontSize: Number(event.target.value) })} /><span>px</span></label>
      {row('按价格梯度配色', display.usePriceGradient, () => onDisplayChange({ ...display, usePriceGradient: !display.usePriceGradient }))}</div>
    </section>
    <section className="native-editor-section"><header><h3><SettingsIcon name="事件显示" />事件显示</h3><p>事件类型控制 OBS；细项控制副窗口和 OBS。现场使用现场筛选，副窗口大类跟随现场。</p></header>
      <section className="native-theme-subgroup" aria-label="事件类型"><div className="native-theme-subgroup-heading"><h4>事件类型</h4>{groupActions(selectedCategories === eventScopes.length, selectedCategories === 0, setAllCategories)}</div><div className="native-theme-toggle-grid">{eventScopes.map(scope => row(scope.label, eventVisibility.categories[scope.id] !== false, () => toggleCategory(scope.id)))}</div></section>
      {detailGroup("interaction", "互动细项")}
      {detailGroup("gift", "礼物细项")}
      {detailGroup("system", "系统细项")}
    </section>
    <section className="native-editor-section"><header><h3><SettingsIcon name="信息元素" />信息元素</h3><p>控制主题中的用户资料、身份标识和事件媒体。</p></header>
      <div className="native-theme-toggle-grid native-theme-element-grid">{DISPLAY_OPTIONS.map(([key, label]) => row(label, Boolean(display[key]), () => onDisplayChange({ ...display, [key]: !display[key] }), key === "maskUsername" && !display.showUsername))}</div>
      <div className="native-theme-mode-grid"><div className="native-theme-mode-field"><span>大航海身份形式</span><SettingsChoiceControl label="大航海身份显示方式" value={display.guardIdentityDisplayMode} onChange={guardIdentityDisplayMode => onDisplayChange({ ...display, guardIdentityDisplayMode })} options={[{ value: "icon", label: "图标" }, { value: "text", label: "文字" }]} /></div>
      <div className="native-theme-mode-field"><span>主播身份形式</span><SettingsChoiceControl label="主播身份显示方式" value={display.anchorIdentityDisplayMode} onChange={anchorIdentityDisplayMode => onDisplayChange({ ...display, anchorIdentityDisplayMode })} options={[{ value: "icon", label: "图标" }, { value: "text", label: "文字" }]} /></div>
      <div className="native-theme-mode-field"><span>房管身份形式</span><SettingsChoiceControl label="房管身份显示方式" value={display.adminIdentityDisplayMode} onChange={adminIdentityDisplayMode => onDisplayChange({ ...display, adminIdentityDisplayMode })} options={[{ value: "icon", label: "图标" }, { value: "text", label: "文字" }]} /></div>
      <div className="native-theme-mode-field"><span>荣耀勋章形式</span><SettingsChoiceControl label="荣耀勋章显示方式" value={display.honorLevelDisplayMode} onChange={honorLevelDisplayMode => onDisplayChange({ ...display, honorLevelDisplayMode })} options={[{ value: "icon", label: "图标" }, { value: "text", label: "文字" }]} /></div></div>
    </section>
  </div>;
}
