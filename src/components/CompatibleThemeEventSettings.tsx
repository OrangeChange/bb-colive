import { uiText } from "../i18n/index.ts";
import type { ThemeDocument } from "../themes/themeTypes.ts";
import type { CompatibleThemeMode, CompatibleVisualSettings } from "../themes/compatThemeSettings.ts";
import { compatibleEventScopes, normalizeCompatibleEventVisibility, setCompatibleEventGroup } from "../themes/compatibleEventVisibility.ts";
import { PanelSwitch } from "./voicePanelPrimitives.tsx";

export function CompatibleThemeEventSettings({ document, onSettingsChange }: { document: ThemeDocument; onSettingsChange(settings: CompatibleVisualSettings): void }) {
  const mode = document.mode as CompatibleThemeMode;
  const settings = document.settings as CompatibleVisualSettings;
  const visibility = normalizeCompatibleEventVisibility(mode, settings.eventVisibility);
  const scopes = compatibleEventScopes(mode);
  const group = (id: string, title: string, options: readonly { id: string; label: string }[]) => {
    const field = id === "categories" ? "categories" : "children";
    const count = options.filter(option => visibility[field][option.id] !== false).length;
    const setAll = (checked: boolean) => onSettingsChange({ ...settings, eventVisibility: setCompatibleEventGroup(visibility, mode, id, checked) });
    return <section className="native-theme-subgroup" aria-label={title} key={id}><div className="native-theme-subgroup-heading"><h4>{title}</h4><div className="native-theme-subgroup-actions"><button type="button" disabled={count === options.length} onClick={() => setAll(true)}>{uiText("common.selectAll")}</button><button type="button" disabled={count === 0} onClick={() => setAll(false)}>{uiText("common.clear")}</button></div></div><div className="native-theme-toggle-grid">{options.map(option => <div className="native-theme-setting-row" key={option.id}><PanelSwitch label={option.label} checked={visibility[field][option.id] !== false} onChange={() => onSettingsChange({ ...settings, eventVisibility: { ...visibility, [field]: { ...visibility[field], [option.id]: visibility[field][option.id] === false } } })} /><span>{option.label}</span></div>)}</div></section>;
  };
  return <section className={`native-editor-section${mode !== "laplace" ? " native-compatible-event-settings" : ""}`}><header><h3>{uiText("compatibleThemeEventSettings.CompatibleThemeEventSettings")}</h3><p>{uiText("compatibleThemeEventSettings.CompatibleThemeEventSettings2")}</p>{mode !== "laplace" && <p>{mode === "blivechat" ? uiText("compatibleThemeEventSettings.CompatibleThemeEventSettings3") : uiText("compatibleThemeEventSettings.CompatibleThemeEventSettings4")}</p>}</header>{group("categories", uiText("compatibleThemeEventSettings.CompatibleThemeEventSettings5"), scopes)}{scopes.filter(scope => scope.children?.length).map(scope => group(scope.id, uiText("compatibleThemeEventSettings.CompatibleThemeEventSettings6", { label: scope.label }), scope.children!))}</section>;
}
