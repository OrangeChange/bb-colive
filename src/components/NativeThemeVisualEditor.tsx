import { Button } from "./shadcn/button";
import { useUiLanguage } from "../i18n/react.ts";
import { localized, uiText } from "../i18n/index.ts";
import { ThemeVisualScope } from "./ThemeVisualScope.tsx";
import { SettingsIcon } from "./SettingsIcon";
import {resolveThemeImageDecorations,clearThemeImageDecorations} from "../themes/themeImageDecorations.ts";
import {nativeImageTargetSelector} from "../themes/nativeManagedCss.ts";
import {ThemeDecorationField} from "./ThemeDecorationField.tsx";
import type {ThemeImageDecorations} from "../themes/themeImageDecorations.ts";
import { inspectNativeVisualPart, type NativeInspectedValue } from "../themes/nativeVisualInspection.ts";
import { findNativeNavigation, nativeNavigationPart, normalizeNativeNavigationSelection } from "../themes/nativeVisualNavigation.ts";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { nativeEventScopePath, nativePartSupportsEvent, NATIVE_EVENT_SCOPES, NATIVE_IDENTITY_SCOPES, NATIVE_SEMANTIC_PARTS, NATIVE_VISUAL_NAVIGATION, nativeVisualPartUsesGlobalScope, nativeVisualPropertySectionsForPart, resolveNativePartShape, type NativeVisualNavigationItem } from "../themes/nativeThemeCapabilities.ts";
import { clearNativeVisualTarget, nativeVisualTargetKey, normalizeNativeThemeDisplaySettings, normalizeNativeVisualModel, readNativeVisualProperty, resolveNativeLength, setNativeVisualProperty, toBaseRelativeNativeLength, type NativeThemeSettings, type NativeVisualModel, type NativeVisualProperty, type NativeVisualScheme, type NativeVisualSetting, type NativeVisualValue } from "../themes/nativeComponentAppearance.ts";
import type { NativeSemanticPartId } from "../themes/nativeSemanticSelectors.ts";
import { UiSelect } from "./ui/Select.tsx";
import { ThemeVisualPropertyField, THEME_NUMBER_FIELDS } from "./ThemeVisualPropertyField.tsx";
import { nativeVisualCodeDefault, resolveNativeVisualProperty } from "../themes/nativeThemeDefaults.ts";
import type { EventStyleRole } from "../eventStyleSettings.ts";
import type { ThemeCssControlledField } from "../themes/themeEditorSession.ts";
import { ThemeVisualNavigation, type ThemeVisualNavigationNode } from "./ThemeVisualNavigation.tsx";
import { ThemeVisualPropertyPanel } from "./ThemeVisualPropertyPanel.tsx";
import { NativePriceGradientControls, priceKindsForScope } from './NativePriceGradientControls.tsx';
import { themePriceGradient, priceBandColor, setPriceBandColor, type NativePriceGradient, type PriceGradientScope } from '../themes/nativePriceGradient.ts';

const NUMBER_FIELDS = THEME_NUMBER_FIELDS;
const PROPERTY_LABELS: Partial<Record<NativeVisualProperty, string>> = localized(() => ({ visible: uiText("common.show"), fontFamily: uiText("common.font"), color: uiText("common.color"), background: uiText("nativeThemeVisualEditor.PROPERTY_LABELS.background"), borderColor: uiText("nativeThemeVisualEditor.PROPERTY_LABELS.borderColor") }));

export interface NativeVisualSelection { event: string; identity: string; part: NativeSemanticPartId }

const GUARD_FIRST_PRIORITY: EventStyleRole[] = ["viceroy", "admiral", "captain", "anchor", "admin", "normal"];
const STAFF_FIRST_PRIORITY: EventStyleRole[] = ["anchor", "admin", "viceroy", "admiral", "captain", "normal"];

function scopeOptions(choices: typeof NATIVE_EVENT_SCOPES, parents: string[] = []): {value:string;label:string}[] {
  return choices.flatMap(item => {
    const path = [...parents, item.label];
    return [{value:item.id,label:path.join(" / ")}, ...scopeOptions(item.children ?? [], path)];
  });
}
const COMPACT_EVENT_OPTIONS = scopeOptions(NATIVE_EVENT_SCOPES);

export function updateNativeNavigationGroup<T>(current: ReadonlySet<T>, id: T, open: boolean): Set<T> {
  const next = new Set(current);
  open ? next.add(id) : next.delete(id);
  return next;
}

function propertyFallback(property: NativeVisualProperty, settings: NativeThemeSettings, selection: NativeVisualSelection, baseCss = ""): NativeVisualValue {
  const codeDefault = nativeVisualCodeDefault(selection, property, settings, baseCss);
  if (codeDefault !== undefined) return codeDefault;
  if (property === "visible") return true;
  if (property === "fontFamily") return settings.fontFamily;
  if (property === "fontSize") return settings.display.baseFontSize;
  if (property === "lineHeight") return 1.4;
  if (property === "color" || property === "borderColor") return "#ffffff";
  if (property === "background") return "transparent";
  if (property === "borderImage") return "none";
  return 0;
}

export function NativeThemeVisualEditor({ dirty, settings, baseCss = "", selection, cssControlled, fontFamilyOptions, onOpenFonts, onSelectionChange, onChange, onPreviewChange, onPreviewCancel, interactionKey = "", onDisplayChange, previewRoot, onGradientChange, onGradientPreviewChange, onPricePreview, onDecorationsChange,onDecorationsPreviewChange }: {
  dirty?: boolean; settings: NativeThemeSettings; baseCss?: string; selection: NativeVisualSelection; cssControlled: ThemeCssControlledField[]; fontFamilyOptions: string[];
  onOpenFonts: () => void; onSelectionChange: (selection: NativeVisualSelection) => void; onChange: (model: NativeVisualModel, images?: ThemeImageDecorations) => void; onPreviewChange: (model: NativeVisualModel) => void;
  onDisplayChange: (display: NativeThemeSettings["display"]) => void;
  onPreviewCancel?: () => void; interactionKey?: string; previewRoot?: HTMLElement | null;
  onGradientChange?: (model: NativePriceGradient) => void;
  onGradientPreviewChange?: (model: NativePriceGradient) => void;
  onPricePreview?: (min: number | undefined) => void;
  onDecorationsChange?: (value:ThemeImageDecorations)=>void;
  onDecorationsPreviewChange?: (value:ThemeImageDecorations)=>void;
}) {
  useUiLanguage();
  const [editScheme, setEditScheme] = useState<NativeVisualScheme>("common");
  const [priceBand,setPriceBand]=useState('');
  const gradient=themePriceGradient(settings.priceGradient,baseCss);
  const kinds=priceKindsForScope(selection.event);
  const gradientScope:PriceGradientScope = ['normal','blind','superchat'].includes(selection.event) ? selection.event as PriceGradientScope : 'common';
  const activeBand=kinds.some(k=>gradient.types[k]) ? gradient.bands.find(b=>b.id===priceBand) : undefined;
  useEffect(()=>{onPricePreview?.(activeBand?.min);return()=>onPricePreview?.(undefined);},[activeBand?.min,selection.event]);
  const navigationRef = useRef<HTMLElement>(null);
  const [inspection, setInspection] = useState<Partial<Record<NativeVisualProperty, NativeInspectedValue>>>({});
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setInspection(previewRoot ? inspectNativeVisualPart(previewRoot, selection) : {}));
    };
    const documents = new Map<Document, MutationObserver>();
    const connect = () => {
      for (const iframe of previewRoot?.querySelectorAll("iframe") ?? []) {
        const document = iframe.contentDocument;
        if (!document || documents.has(document)) continue;
        const observer = new MutationObserver(schedule);
        observer.observe(document, { subtree: true, childList: true });
        document.addEventListener("load", schedule, true);
        document.addEventListener("toggle", schedule, true);
        documents.set(document, observer);
      }
      schedule();
    };
    const observer = new MutationObserver(connect);
    if (previewRoot) observer.observe(previewRoot, { subtree: true, childList: true });
    previewRoot?.addEventListener("load", connect, true);
    connect();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      previewRoot?.removeEventListener("load", connect, true);
      for (const [document, observer] of documents) {
        observer.disconnect();
        document.removeEventListener("load", schedule, true);
        document.removeEventListener("toggle", schedule, true);
      }
    };
  }, [previewRoot, selection.event, selection.identity, selection.part, settings, interactionKey]);

  const display = normalizeNativeThemeDisplaySettings(settings.display);
  const model = normalizeNativeVisualModel(settings.visualModel);
  const activeShape = resolveNativePartShape(selection.part, { event: selection.event, display: settings.display });
  const propertySections = nativeVisualPropertySectionsForPart(selection.part, activeShape);
  const controlledProperties = new Set(cssControlled.filter(field => field.scheme === editScheme && field.targetKey === nativeVisualTargetKey(selection)).map(field => field.property));
  const globalScope = nativeVisualPartUsesGlobalScope(selection.part);
  const hasLocalOverrides = Object.keys(model[editScheme][nativeVisualTargetKey(selection)] ?? {}).length > 0 || Object.prototype.hasOwnProperty.call(settings.imageDecorations ?? {},`${editScheme}|${nativeVisualTargetKey(selection)}`);
  const scopePath = nativeEventScopePath(selection.event);
  const eventScope = scopePath[0] ?? NATIVE_EVENT_SCOPES[0];
  const eventChildren = useMemo(() => eventScope.children ?? [], [eventScope]);
  const activityChildren = scopePath[1]?.children ?? [];
  const partLabel = NATIVE_SEMANTIC_PARTS.find(item => item.id === selection.part)?.label ?? selection.part;
  const identityLabel = activeBand ? uiText("nativeThemeVisualEditor.NativeThemeVisualEditor.identityLabel") : NATIVE_IDENTITY_SCOPES.find(item => item.id === selection.identity)?.label ?? uiText("nativeThemeVisualEditor.NativeThemeVisualEditor.identityLabel");
  const schemeLabel = editScheme === "common" ? uiText("nativeThemeVisualEditor.NativeThemeVisualEditor.schemeLabel") : editScheme === "light" ? uiText("common.light") : uiText("common.dark");
  const priorityMode = settings.display.identityPriority[0] === "anchor" || settings.display.identityPriority[0] === "admin" ? "staff-first" : "guard-first";
  const itemPart = nativeNavigationPart;
  const activeNavigation = findNativeNavigation(selection);
  const navigationPath = activeNavigation?.path.filter((label, index, labels) => index === 0 || label !== labels[index - 1]).join(" / ") ?? partLabel;
  const set = (property: NativeVisualProperty, setting: NativeVisualSetting) => onChange(setNativeVisualProperty(model, selection, property, setting, editScheme));
  const editDirect = (property: NativeVisualProperty, nextValue: NativeVisualValue) => set(property, { source: "custom", value: nextValue });
  const previewDirect = (property: NativeVisualProperty, nextValue: NativeVisualValue) => onPreviewChange(setNativeVisualProperty(model, selection, property, { source: "custom", value: nextValue }, editScheme));
  const settingFor = (property: NativeVisualProperty) => readNativeVisualProperty(model, selection, property, editScheme);
  const effectiveFor = (property: NativeVisualProperty) => {
    const codeDefault = nativeVisualCodeDefault(selection, property, settings, baseCss);
    return resolveNativeVisualProperty(model, selection, property, editScheme, codeDefault).value ?? propertyFallback(property, settings, selection, baseCss);
  };
  const statusFor = (property: NativeVisualProperty) => controlledProperties.has(property) ? uiText("nativeThemeVisualEditor.NativeThemeVisualEditor.statusFor") : settingFor(property).source !== "inherit" ? uiText("nativeThemeVisualEditor.NativeThemeVisualEditor.statusFor2") : editScheme === "common" ? uiText("nativeThemeVisualEditor.NativeThemeVisualEditor.statusFor3") : uiText("nativeThemeVisualEditor.NativeThemeVisualEditor.statusFor4");
  const changeSelection = (next: NativeVisualSelection) => onSelectionChange(normalizeNativeNavigationSelection(next));
  const choosePart = (item: NativeVisualNavigationItem, event?: string) => {
    const part = itemPart(item);
    if (!part) return;
    changeSelection(nativeVisualPartUsesGlobalScope(part) ? { event: "all", identity: "all", part } : { ...selection, ...(event ? { event } : {}), part });
  };
  const navigationNodes = (items: readonly NativeVisualNavigationItem[], inheritedEvent?: string): ThemeVisualNavigationNode[] => items.filter(item => {
    const part = itemPart(item);
    return !part || nativePartSupportsEvent(part, item.event ?? inheritedEvent ?? selection.event);
  }).map(item => {
    const event = item.event ?? inheritedEvent, part = itemPart(item);
    return {id:item.id,label:item.label ?? NATIVE_SEMANTIC_PARTS.find(candidate=>candidate.id===part)?.label ?? item.id,part,
      active:activeNavigation?.item===item,
      onSelect:part ? ()=>choosePart(item,event) : undefined,children:item.children ? navigationNodes(item.children,event) : undefined};
  });
  const propertyField = (property: NativeVisualProperty): ReactNode => {
    if(activeBand){
      const field=property==='background' && ['row','card','event','stickyEvent'].includes(selection.part) ? 'background'
        : property==='color' && ['price','priceUnit','priceValue','giftPrice','giftValue'].includes(selection.part) ? 'color' : undefined;
      if(!field)return null;
      const own=gradient.colors[gradientScope]?.[activeBand.id]?.[editScheme]?.[field];
      return <ThemeVisualPropertyField saved={!dirty} key={`gradient-${activeBand.id}-${editScheme}-${field}`} property={property} allowGradient={false}
        label={field==='background'?uiText("nativeThemeVisualEditor.label"):uiText("common.color")} value={priceBandColor(gradient,gradientScope,activeBand.id,editScheme,field)} status={own?uiText("nativeThemeVisualEditor.status"):gradientScope==='common'?uiText("nativeThemeVisualEditor.status2"):uiText("nativeThemeVisualEditor.status3")}
        fontFamilyOptions={fontFamilyOptions} onOpenFonts={onOpenFonts}
        onChange={value=>onGradientChange?.(setPriceBandColor(gradient,gradientScope,activeBand.id,editScheme,field,String(value)))}
        onPreviewChange={value=>onGradientPreviewChange?.(setPriceBandColor(gradient,gradientScope,activeBand.id,editScheme,field,String(value)))} onPreviewCancel={onPreviewCancel}
        onRestore={own?()=>onGradientChange?.(setPriceBandColor(gradient,gradientScope,activeBand.id,editScheme,field,undefined)):undefined}/>;
    }
    const effective=effectiveFor(property),setting=settingFor(property),number=NUMBER_FIELDS[property];
    const authored = resolveNativeVisualProperty(model, selection, property, editScheme).source !== "code";
    const inspected = authored ? undefined : inspection[property];
    const value=inspected?.value ?? (number ? (property==="lineHeight"||property==="fontWeight") ? Number(effective) : resolveNativeLength(effective,display.baseFontSize) : effective);
    const encode=(value:NativeVisualValue)=>typeof value==="number"&&property!=="lineHeight"&&property!=="fontWeight" ? toBaseRelativeNativeLength(value,display.baseFontSize) : value;
    return <ThemeVisualPropertyField saved={!dirty} key={`${interactionKey}|${nativeVisualTargetKey(selection)}|${editScheme}|${property}`} property={property} imageAvailable={inspection[property]?.applicable!==false} imageScale={{variable:"--event-font-size",value:display.baseFontSize}} label={selection.part==="bigEmote"&&property==="width"?uiText("nativeThemeVisualEditor.label2"):["honor","guardBadge"].includes(selection.part)&&activeShape==="image"&&property==="height"?uiText("nativeThemeVisualEditor.label2"):PROPERTY_LABELS[property]??number?.[0]}
      value={value} missing={Boolean(previewRoot) && Object.keys(inspection).length === 0} mixed={inspected?.mixed} status={statusFor(property)} controlled={controlledProperties.has(property)} unit={number&&property!=="lineHeight"&&property!=="fontWeight"?"px":undefined}
      limits={number?[number[1],number[2],number[3]]:undefined} fontFamilyOptions={fontFamilyOptions} onOpenFonts={onOpenFonts}
      onChange={value=>editDirect(property,encode(value))} onPreviewChange={value=>previewDirect(property,encode(value))} onPreviewCancel={onPreviewCancel}
      onRestore={setting.source!=="inherit"?()=>set(property,{source:"inherit"}):undefined}/>;
  };

  const editSchemeControl = <div className="native-scope-setting native-edit-scheme"><span>{uiText("nativeThemeVisualEditor.NativeThemeVisualEditor.editSchemeControl")}</span><UiSelect ariaLabel={uiText("nativeThemeVisualEditor.ariaLabel")} value={editScheme} onValueChange={value => { onPreviewCancel?.(); setEditScheme(value as NativeVisualScheme); }} options={[{ value: "common", label: uiText("nativeThemeVisualEditor.options.label") }, { value: "light", label: uiText("common.light") }, { value: "dark", label: uiText("common.dark") }]} /></div>;
  const identityPriorityControl = <div className="native-scope-setting native-identity-priority"><span className="native-identity-priority-label">{uiText("nativeThemeVisualEditor.NativeThemeVisualEditor.identityPriorityControl")}</span><UiSelect className="native-identity-priority-select" ariaLabel={uiText("nativeThemeVisualEditor.ariaLabel2")} value={priorityMode} onValueChange={value => onDisplayChange({ ...settings.display, identityPriority: value === "staff-first" ? STAFF_FIRST_PRIORITY : GUARD_FIRST_PRIORITY })} options={[{ value: "guard-first", label: uiText("nativeThemeVisualEditor.options.label2") }, { value: "staff-first", label: uiText("nativeThemeVisualEditor.options.label3") }]} /></div>;

  return <div className="native-visual-editor">
    <ThemeVisualScope summary={`${eventScope.label} · ${identityLabel} · ${schemeLabel}${activeBand ? uiText("nativeThemeVisualEditor.summary", { min: activeBand.min }) : ""}`}><div className="native-scope-strip">{globalScope
      ? <div className="native-global-scope"><span>{uiText("nativeThemeVisualEditor.NativeThemeVisualEditor")}</span><strong>{uiText("nativeThemeVisualEditor.NativeThemeVisualEditor2")}</strong>{editSchemeControl}{identityPriorityControl}</div>
      : <><div className="native-scope-compact">
        <div className="native-scope-setting"><span>{uiText("nativeThemeVisualEditor.NativeThemeVisualEditor3")}</span><UiSelect ariaLabel={uiText("nativeThemeVisualEditor.ariaLabel3")} value={selection.event} options={COMPACT_EVENT_OPTIONS} onValueChange={event => changeSelection({...selection,event})} /></div>
        {editSchemeControl}
        {!activeBand && <><div className="native-scope-setting"><span>{uiText("nativeThemeVisualEditor.NativeThemeVisualEditor4")}</span><UiSelect ariaLabel={uiText("nativeThemeVisualEditor.ariaLabel4")} value={selection.identity} options={NATIVE_IDENTITY_SCOPES.map(item=>({value:item.id,label:item.label}))} onValueChange={identity=>changeSelection({...selection,identity})} /></div>{identityPriorityControl}</>}
      </div><div className="native-event-scope-primary"><span>{uiText("nativeThemeVisualEditor.NativeThemeVisualEditor3")}</span>{NATIVE_EVENT_SCOPES.map(item => <Button variant="outline" type="button" className={scopePath.some(scope => scope.id === item.id) ? "is-active" : ""} onClick={() => changeSelection({ ...selection, event: item.id })} key={item.id}>{item.label}</Button>)}{editSchemeControl}</div>
        {eventChildren.length > 0 && <div className="native-event-scope-children"><span>{uiText("nativeThemeVisualEditor.NativeThemeVisualEditor5")}</span>{eventChildren.map(item => <Button variant="outline" type="button" className={scopePath.some(scope => scope.id === item.id) ? "is-active" : ""} onClick={() => changeSelection({ ...selection, event: item.id })} key={item.id}>{item.label}</Button>)}</div>}
        {activityChildren.length > 0 && <div className="native-event-scope-children"><span>{uiText("nativeThemeVisualEditor.NativeThemeVisualEditor6")}</span>{activityChildren.map(item => <Button variant="outline" type="button" className={selection.event === item.id ? "is-active" : ""} onClick={() => changeSelection({...selection,event:item.id})} key={item.id}>{item.label}</Button>)}</div>}
        {!activeBand&&<div className="native-identity-scope"><span>{uiText("nativeThemeVisualEditor.NativeThemeVisualEditor4")}</span>{NATIVE_IDENTITY_SCOPES.map(item => <Button variant="outline" type="button" className={selection.identity === item.id ? "is-active" : ""} onClick={() => changeSelection({ ...selection, identity: item.id })} key={item.id}>{item.label}</Button>)}{identityPriorityControl}</div>}</>}
      {!globalScope&&onGradientChange&&<NativePriceGradientControls event={selection.event} model={gradient} selected={activeBand?.id??''} onSelect={id=>{onPreviewCancel?.();setPriceBand(id);}} onChange={onGradientChange} applied={settings.display.usePriceGradient}/>}
    </div></ThemeVisualScope>
    <div className="native-visual-body"><ThemeVisualNavigation navigationRef={navigationRef} groups={NATIVE_VISUAL_NAVIGATION.map(group=>({...group,items:navigationNodes(group.items,group.event)}))} />
      <ThemeVisualPropertyPanel imageTarget={{root:previewRoot,selector:nativeImageTargetSelector(settings,nativeVisualTargetKey({...selection,part:selection.part==='avatarFrame'?'avatarWrap':selection.part}),editScheme)}} title={partLabel} context={globalScope
        ? [{ label: uiText("nativeThemeVisualEditor.context.label"), value: uiText("nativeThemeVisualEditor.context.value") }, { label: uiText("nativeThemeVisualEditor.context.label2"), value: navigationPath, path: true }, { label: uiText("nativeThemeVisualEditor.context.label3"), value: schemeLabel }]
        : [{ label: uiText("nativeThemeVisualEditor.context.label4"), value: scopePath.map(scope => scope.label).join(" / ") || eventScope.label }, { label: uiText("nativeThemeVisualEditor.context.label5"), value: identityLabel }, { label: uiText("nativeThemeVisualEditor.context.label2"), value: navigationPath, path: true }, { label: uiText("nativeThemeVisualEditor.context.label3"), value: schemeLabel }]}
        canRestore={!activeBand&&hasLocalOverrides} onRestore={() => onChange(clearNativeVisualTarget(model, selection, editScheme),clearThemeImageDecorations(settings.imageDecorations,`${editScheme}|${nativeVisualTargetKey(selection)}`))}>
        {activeBand&&<p className="ui-type-control text-t3">{activeBand.min}{uiText("nativeThemeVisualEditor.NativeThemeVisualEditor7")}{gradientScope==='common'?uiText("nativeThemeVisualEditor.NativeThemeVisualEditor8"):uiText("nativeThemeVisualEditor.NativeThemeVisualEditor9")}{uiText("nativeThemeVisualEditor.NativeThemeVisualEditor10")}</p>}
        {!activeBand&&onDecorationsChange&&<ThemeDecorationField inherited={!Object.prototype.hasOwnProperty.call(settings.imageDecorations??{},`${editScheme}|${nativeVisualTargetKey(selection)}`)} onPreviewInherit={()=>onDecorationsPreviewChange?.(clearThemeImageDecorations(settings.imageDecorations,`${editScheme}|${nativeVisualTargetKey(selection)}`))} scale={{variable:"--event-font-size",value:display.baseFontSize}} avatarFrame={selection.part==='avatarFrame'} root={previewRoot} selector={nativeImageTargetSelector(settings,nativeVisualTargetKey({...selection,part:selection.part==='avatarFrame'?'avatarWrap':selection.part}),editScheme)} images={resolveThemeImageDecorations(settings.imageDecorations,`${editScheme}|${nativeVisualTargetKey(selection)}`,scopePath.slice(0,-1).reverse().map(scope=>scope.id))} onInherit={()=>onDecorationsChange(clearThemeImageDecorations(settings.imageDecorations,`${editScheme}|${nativeVisualTargetKey(selection)}`))} onPreviewCancel={onPreviewCancel} onPreviewChange={images=>onDecorationsPreviewChange?.({...settings.imageDecorations,[`${editScheme}|${nativeVisualTargetKey(selection)}`]:images})} onChange={images=>onDecorationsChange({...settings.imageDecorations,[`${editScheme}|${nativeVisualTargetKey(selection)}`]:images})}/>}
        <div className="native-property-sections">{propertySections.filter(section=>selection.part!=="avatarFrame"&&(!activeBand||section.properties.some(p=>p==='background'&&['row','card','event','stickyEvent'].includes(selection.part)||p==='color'&&['price','priceUnit','priceValue','giftPrice','giftValue'].includes(selection.part)))).map(section => <details key={section.id} open={section.defaultExpanded||Boolean(activeBand)}><summary><SettingsIcon name={section.id === "display" ? "visibility" : section.id} />{section.label}</summary><div className="native-property-grid">{section.properties.map(propertyField)}</div></details>)}</div>
      </ThemeVisualPropertyPanel></div>
  </div>;
}
