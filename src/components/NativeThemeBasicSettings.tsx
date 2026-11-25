import { useUiLanguage } from "../i18n/react.ts";
import { localized, uiText } from "../i18n/index.ts";
import { NATIVE_EVENT_SCOPES } from "../themes/nativeThemeCapabilities.ts";
import { normalizeNativeEventVisibility, type NativeEventVisibility, type NativeThemeDisplaySettings } from "../themes/nativeComponentAppearance.ts";
import { PanelSwitch } from "./voicePanelPrimitives.tsx";
import { SettingsChoiceControl } from "./SettingsChoiceControl";
import { SettingsIcon } from "./SettingsIcon";

const DISPLAY_OPTIONS: readonly [keyof NativeThemeDisplaySettings, string][] = localized(() => ([
  ["showUsername", uiText("nativeThemeBasicSettings.DISPLAY_OPTIONS")], ["showTimestamp", uiText("nativeThemeBasicSettings.DISPLAY_OPTIONS2")], ["maskUsername", uiText("nativeThemeBasicSettings.DISPLAY_OPTIONS3")],
  ["showAvatar", uiText("nativeThemeBasicSettings.DISPLAY_OPTIONS4")], ["showAvatarFrame", uiText("nativeThemeBasicSettings.DISPLAY_OPTIONS5")], ["showGuardIdentity", uiText("nativeThemeBasicSettings.DISPLAY_OPTIONS6")],
  ["showAdminIdentity", uiText("nativeThemeBasicSettings.DISPLAY_OPTIONS7")], ["showAnchorIdentity", uiText("nativeThemeBasicSettings.DISPLAY_OPTIONS8")], ["showFanMedal", uiText("nativeThemeBasicSettings.DISPLAY_OPTIONS9")],
  ["showHonorLevel", uiText("nativeThemeBasicSettings.DISPLAY_OPTIONS10")], ["showCurrentRank", uiText("nativeThemeBasicSettings.DISPLAY_OPTIONS11")], ["showGiftImage", uiText("nativeThemeBasicSettings.DISPLAY_OPTIONS12")], ["showEventIcon", uiText("nativeThemeBasicSettings.DISPLAY_OPTIONS13")],
  ["onlyAnchorFanMedal", uiText("nativeThemeBasicSettings.DISPLAY_OPTIONS14")], ["hideUnlitFanMedal", uiText("nativeThemeBasicSettings.DISPLAY_OPTIONS15")],
]));

export function NativeThemeBasicSettings({ display, visibility, onDisplayChange, onVisibilityChange }: {
  display: NativeThemeDisplaySettings;
  visibility: NativeEventVisibility | undefined;
  onDisplayChange: (value: NativeThemeDisplaySettings) => void;
  onVisibilityChange: (value: NativeEventVisibility) => void;
}) {
  useUiLanguage();
  const eventVisibility = normalizeNativeEventVisibility(visibility);
  const toggleCategory = (id: string) => { onVisibilityChange({ ...eventVisibility, categories: { ...eventVisibility.categories, [id]: !eventVisibility.categories[id] } }); };
  const toggleChild = (id: string) => { onVisibilityChange({ ...eventVisibility, legacyLiveStatusConflict: id === "liveStatus" ? false : eventVisibility.legacyLiveStatusConflict, children: { ...eventVisibility.children, [id]: !eventVisibility.children[id] } }); };
  const row = (label: string, checked: boolean, onChange: () => void, disabled = false) => <div className="native-theme-setting-row" role="group" aria-label={label} key={label}><PanelSwitch label={label} checked={checked} disabled={disabled} onChange={onChange} /><span>{label}</span></div>;
  const eventScopes = NATIVE_EVENT_SCOPES.filter(scope => scope.id !== "all");
  const groupActions = (allSelected: boolean, noneSelected: boolean, onSet: (checked: boolean) => void) => <div className="native-theme-subgroup-actions"><button type="button" disabled={allSelected} onClick={() => onSet(true)}>{uiText("common.selectAll")}</button><button type="button" disabled={noneSelected} onClick={() => onSet(false)}>{uiText("common.clear")}</button></div>;
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
    <section className="native-editor-section"><header><h3><SettingsIcon name="basic" />{uiText("nativeThemeBasicSettings.NativeThemeBasicSettings")}</h3><p>{uiText("nativeThemeBasicSettings.NativeThemeBasicSettings2")}</p></header>
      <div className="native-theme-inline-fields native-theme-baseline-fields"><label className="native-theme-number-field"><span>{uiText("nativeThemeBasicSettings.NativeThemeBasicSettings3")}</span><input type="number" min="8" max="72" step="0.5" value={display.baseFontSize} onChange={event => onDisplayChange({ ...display, baseFontSize: Number(event.target.value) })} /><span>px</span></label>
      {row(uiText("nativeThemeBasicSettings.NativeThemeBasicSettings4"), display.usePriceGradient, () => onDisplayChange({ ...display, usePriceGradient: !display.usePriceGradient }))}</div>
    </section>
    <section className="native-editor-section"><header><h3><SettingsIcon name="display" />{uiText("nativeThemeBasicSettings.NativeThemeBasicSettings5")}</h3><p>{uiText("nativeThemeBasicSettings.NativeThemeBasicSettings6")}</p></header>
      <section className="native-theme-subgroup" aria-label={uiText("nativeThemeBasicSettings.aria_label")}><div className="native-theme-subgroup-heading"><h4>{uiText("nativeThemeBasicSettings.NativeThemeBasicSettings7")}</h4>{groupActions(selectedCategories === eventScopes.length, selectedCategories === 0, setAllCategories)}</div><div className="native-theme-toggle-grid">{eventScopes.map(scope => row(scope.label, eventVisibility.categories[scope.id] !== false, () => toggleCategory(scope.id)))}</div></section>
      {detailGroup("interaction", uiText("nativeThemeBasicSettings.NativeThemeBasicSettings8"))}
      {detailGroup("gift", uiText("nativeThemeBasicSettings.NativeThemeBasicSettings9"))}
      {detailGroup("system", uiText("nativeThemeBasicSettings.NativeThemeBasicSettings10"))}
    </section>
    <section className="native-editor-section"><header><h3><SettingsIcon name="information" />{uiText("nativeThemeBasicSettings.NativeThemeBasicSettings11")}</h3><p>{uiText("nativeThemeBasicSettings.NativeThemeBasicSettings12")}</p></header>
      <div className="native-theme-toggle-grid native-theme-element-grid">{DISPLAY_OPTIONS.map(([key, label]) => row(label, Boolean(display[key]), () => onDisplayChange({ ...display, [key]: !display[key] }), key === "maskUsername" && !display.showUsername))}</div>
      <div className="native-theme-mode-grid"><div className="native-theme-mode-field"><span>{uiText("nativeThemeBasicSettings.NativeThemeBasicSettings13")}</span><SettingsChoiceControl label={uiText("nativeThemeBasicSettings.label")} value={display.guardIdentityDisplayMode} onChange={guardIdentityDisplayMode => onDisplayChange({ ...display, guardIdentityDisplayMode })} options={[{ value: "icon", label: uiText("nativeThemeBasicSettings.options.label") }, { value: "text", label: uiText("nativeThemeBasicSettings.options.label2") }]} /></div>
      <div className="native-theme-mode-field"><span>{uiText("nativeThemeBasicSettings.NativeThemeBasicSettings14")}</span><SettingsChoiceControl label={uiText("nativeThemeBasicSettings.label2")} value={display.anchorIdentityDisplayMode} onChange={anchorIdentityDisplayMode => onDisplayChange({ ...display, anchorIdentityDisplayMode })} options={[{ value: "icon", label: uiText("nativeThemeBasicSettings.options.label") }, { value: "text", label: uiText("nativeThemeBasicSettings.options.label2") }]} /></div>
      <div className="native-theme-mode-field"><span>{uiText("nativeThemeBasicSettings.NativeThemeBasicSettings15")}</span><SettingsChoiceControl label={uiText("nativeThemeBasicSettings.label3")} value={display.adminIdentityDisplayMode} onChange={adminIdentityDisplayMode => onDisplayChange({ ...display, adminIdentityDisplayMode })} options={[{ value: "icon", label: uiText("nativeThemeBasicSettings.options.label") }, { value: "text", label: uiText("nativeThemeBasicSettings.options.label2") }]} /></div>
      <div className="native-theme-mode-field"><span>{uiText("nativeThemeBasicSettings.NativeThemeBasicSettings16")}</span><SettingsChoiceControl label={uiText("nativeThemeBasicSettings.label4")} value={display.honorLevelDisplayMode} onChange={honorLevelDisplayMode => onDisplayChange({ ...display, honorLevelDisplayMode })} options={[{ value: "icon", label: uiText("nativeThemeBasicSettings.options.label") }, { value: "text", label: uiText("nativeThemeBasicSettings.options.label2") }]} /></div></div>
    </section>
  </div>;
}
