import { Textarea } from "./shadcn/textarea";
import { Button } from "./shadcn/button";
import { Input } from "./shadcn/input";
import { useUiLanguage } from "../i18n/react.ts";
import { localized, uiText } from "../i18n/index.ts";
import { ChevronDown as LucideChevronDown, Mic, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ConnectBar } from "./ConnectBar";
import { useVoiceSettings } from "../voice/voiceSettings.ts";
import { normalizeLegacyInteractVoiceTemplate, normalizeLegacyVoiceTemplate, VOICE_EVENT_CATEGORIES, VOICE_TEMPLATE_FIELDS, DEFAULT_ANCHOR_LOTTERY_RESULT_TEMPLATE, DEFAULT_INTERACT_VOICE_TEXTS, DEFAULT_INTERACT_VOICE_TEMPLATES, DEFAULT_RED_POCKET_RESULT_TEMPLATE, type CustomHttpPreset, type CustomHttpVoiceSettings, type FishAudioSettings, type TemplateSegment, type VoiceEngine, type VoiceEventCategory, type VoiceInfo, type VoiceInteractTemplateKind, type VoicePriority, type VoicePronunciationRule, type VoiceSettings, type VoiceTemplateField } from "../voice/voiceTypes.ts";
import { voiceController, personalBroadcastController, listVoiceOptions } from "../voice/voiceRuntime.ts";
import { lookupFishAudioModel } from "../voice/fishAudioProvider.ts";
import { normalizeFishReferenceVoice, removeFishReferenceVoice, upsertFishReferenceVoice, type FishReferenceVoice } from "../voice/fishAudioModels.ts";
import { getDefaultVoiceTemplate, renderVoiceEventTemplate } from "../voice/voiceTemplates.ts";
import { ensureTemplateTextGaps, moveTemplateSegment } from "../voice/templateEditor.ts";
import { MsgType, type DanmakuEvent } from "../protocol/types.ts";
import { INTERACT_KIND_OPTIONS } from "../eventFilterSettings.ts";
import { CUSTOM_HTTP_PRESET_LABELS, getCustomHttpPresetDefaults } from "../voice/customHttpPresets.ts";
import { getVoicePanelPlaybackState } from "./personalBroadcastPanelModel.ts";
import { RuntimeQueueSummary, RuntimeQueueStatus } from "./RuntimeQueueSummary.tsx";
import { controlClass, selectClass, sectionClass, PanelSwitch, SettingRow, SectionHeading, SectionToolbar, VoiceRange } from "./voicePanelPrimitives.tsx";
import { UiSelect } from "./ui/Select";
import { VoiceTestPanel } from "./VoiceTestPanel";
import { SettingsChoiceControl } from "./SettingsChoiceControl";

const CATEGORY_LABELS: Record<VoiceEventCategory, string> = localized(() => ({
  danmu: uiText("voicePanel.CATEGORY_LABELS.danmu"),
  interact: uiText("voicePanel.CATEGORY_LABELS.interact"),
  gift: uiText("voicePanel.CATEGORY_LABELS.gift"),
  blindBox: uiText("voicePanel.CATEGORY_LABELS.blindBox"),
  redPocket: uiText("voicePanel.CATEGORY_LABELS.redPocket"),
  anchorLottery: uiText("voicePanel.CATEGORY_LABELS.anchorLottery"),
  superChat: uiText("voicePanel.CATEGORY_LABELS.superChat"),
  guard: uiText("voicePanel.CATEGORY_LABELS.guard"),
  system: uiText("voicePanel.CATEGORY_LABELS.system"),
}));

const FIELD_LABELS: Record<VoiceTemplateField, string> = localized(() => ({
  username: uiText("voicePanel.FIELD_LABELS.username"),
  content: uiText("voicePanel.statusText"),
  giftName: uiText("voicePanel.FIELD_LABELS.giftName"),
  blindGiftName: uiText("voicePanel.FIELD_LABELS.blindGiftName"),
  quantity: uiText("voicePanel.FIELD_LABELS.quantity"),
  amount: uiText("voicePanel.FIELD_LABELS.amount"),
  guardName: uiText("voicePanel.FIELD_LABELS.guardName"),
  duration: uiText("voicePanel.FIELD_LABELS.duration"),
  months: uiText("voicePanel.FIELD_LABELS.months"),
  companionDays: uiText("voicePanel.FIELD_LABELS.companionDays"),
  emoteName: uiText("voicePanel.FIELD_LABELS.emoteName"),
}));

const PRIORITY_OPTIONS: { value: VoicePriority; label: string }[] = localized(() => ([
  { value: "high", label: uiText("voicePanel.PRIORITY_OPTIONS.label") },
  { value: "medium", label: uiText("voicePanel.PRIORITY_OPTIONS.label2") },
  { value: "normal", label: uiText("voicePanel.PRIORITY_OPTIONS.label3") },
]));

const VOICE_ENGINE_OPTIONS = localized(() => ([
  { value: "edge-online", label: uiText("voicePanel.VOICE_ENGINE_OPTIONS.label") },
  { value: "windows-system", label: uiText("voicePanel.VOICE_ENGINE_OPTIONS.label2") },
  { value: "fish-audio", label: "Fish Audio" },
  { value: "custom-http", label: uiText("voicePanel.VOICE_ENGINE_OPTIONS.label3") },
] as const));
const FISH_AUDIO_FORMAT_OPTIONS = [
  { value: "mp3", label: "MP3" },
  { value: "wav", label: "WAV" },
] as const;
const CUSTOM_HTTP_AUTH_OPTIONS = localized(() => ([
  { value: "none", label: uiText("common.noneOption") },
  { value: "bearer", label: "Bearer" },
  { value: "api-key", label: "API Key Header" },
] as const));
const CUSTOM_HTTP_RESPONSE_OPTIONS = localized(() => ([
  { value: "audio", label: uiText("voicePanel.CUSTOM_HTTP_RESPONSE_OPTIONS.label") },
  { value: "json-base64", label: "JSON Base64" },
] as const));
const VOICE_QUEUE_MODE_OPTIONS = localized(() => ([
  { value: "original", label: uiText("voicePanel.VOICE_QUEUE_MODE_OPTIONS.label") },
  { value: "priority", label: uiText("voicePanel.VOICE_QUEUE_MODE_OPTIONS.label2") },
] as const));
const VOICE_OVERFLOW_OPTIONS = localized(() => ([
  { value: "drop-oldest", label: uiText("voicePanel.VOICE_OVERFLOW_OPTIONS.label") },
  { value: "drop-newest", label: uiText("voicePanel.VOICE_OVERFLOW_OPTIONS.label2") },
  { value: "drop-normal-first", label: uiText("voicePanel.VOICE_OVERFLOW_OPTIONS.label3") },
] as const));
const CUSTOM_HTTP_PRESET_OPTIONS = [
  { value: "openai-compatible", label: CUSTOM_HTTP_PRESET_LABELS["openai-compatible"] },
  { value: "gpt-sovits", label: CUSTOM_HTTP_PRESET_LABELS["gpt-sovits"] },
  { value: "index-tts", label: CUSTOM_HTTP_PRESET_LABELS["index-tts"] },
  { value: "custom-json", label: CUSTOM_HTTP_PRESET_LABELS["custom-json"] },
] as const;

const DEFAULT_EDGE_VOICE = "zh-CN-XiaoxiaoNeural";
const DEFAULT_WINDOWS_VOICE = "Huihui";
const EDGE_VOICE_GROUPS = localized(() => ([
  { value: "zh-CN", label: uiText("voicePanel.EDGE_VOICE_GROUPS") },
  { value: "zh-HK", label: uiText("voicePanel.EDGE_VOICE_GROUPS2") },
  { value: "zh-dialect", label: uiText("voicePanel.EDGE_VOICE_GROUPS3") },
  { value: "zh-TW", label: uiText("voicePanel.EDGE_VOICE_GROUPS4") },
  { value: "en-US", label: uiText("voicePanel.EDGE_VOICE_GROUPS5") },
  { value: "en-GB", label: uiText("voicePanel.EDGE_VOICE_GROUPS6") },
  { value: "ja-JP", label: uiText("voicePanel.EDGE_VOICE_GROUPS7") },
  { value: "multilingual", label: uiText("voicePanel.EDGE_VOICE_GROUPS8") },
]));
const FISH_API_KEY_URL = "https://fish.audio/app/api-keys/";
const FISH_VOICE_LIBRARY_URL = "https://fish.audio/zh-CN/app/discovery/";

type TemplateSelection =
  | { kind: "category"; category: VoiceEventCategory }
  | { kind: "interact"; interactKind: VoiceInteractTemplateKind }
  | { kind: "result"; category: "redPocket" | "anchorLottery" };

function selectionCategory(selection: TemplateSelection): VoiceEventCategory {
  return selection.kind === "interact" ? "interact" : selection.category;
}

function getTemplateForSelection(settings: VoiceSettings, selection: TemplateSelection): TemplateSegment[] {
  if (selection.kind === "interact") return normalizeLegacyInteractVoiceTemplate(settings.interactTemplates[selection.interactKind], selection.interactKind);
  if (selection.kind === "result") {
    return normalizeLegacyVoiceTemplate(selection.category === "redPocket" ? settings.redPocketResultTemplate : settings.anchorLotteryResultTemplate, selection.category);
  }
  return normalizeLegacyVoiceTemplate(settings.templates[selection.category], selection.category);
}

function getDefaultTemplateForSelection(selection: TemplateSelection): TemplateSegment[] {
  if (selection.kind === "interact") return DEFAULT_INTERACT_VOICE_TEMPLATES[selection.interactKind].map((segment) => ({ ...segment }));
  if (selection.kind === "result") {
    const template = selection.category === "redPocket" ? DEFAULT_RED_POCKET_RESULT_TEMPLATE : DEFAULT_ANCHOR_LOTTERY_RESULT_TEMPLATE;
    return template.map((segment) => ({ ...segment }));
  }
  return getDefaultVoiceTemplate(selection.category);
}

function createTemplatePreviewEvent(selection: TemplateSelection): DanmakuEvent {
  const base = {
    id: `voice-preview-${selectionCategory(selection)}`,
    roomId: 1,
    ts: 0,
    user: { uid: "voice-preview", uname: "小明", guardLevel: 0 as const },
  };
  if (selection.kind === "interact") {
    return { ...base, msgType: MsgType.Interact, interactKind: selection.interactKind, text: DEFAULT_INTERACT_VOICE_TEXTS[selection.interactKind] };
  }
  if (selection.kind === "result") {
    return selection.category === "redPocket"
      ? { ...base, msgType: MsgType.RedPocketWinner, lottery: { awardName: "瓜子红包", awardNum: 1 } }
      : { ...base, msgType: MsgType.AnchorLotAward, lottery: { awardName: "限定礼物", awardNum: 1 } };
  }
  switch (selection.category) {
    case "danmu":
      return { ...base, msgType: MsgType.Danmu, text: "这是一条弹幕样例" };
    case "gift":
      return { ...base, msgType: MsgType.Gift, gift: { id: 1, name: "小心心", count: 2, price: 100, coinType: "gold", total: 200, totalRmb: 0.2 } };
    case "blindBox":
      return { ...base, msgType: MsgType.Gift, gift: { id: 2, name: "小心心", blindGiftName: "心动盲盒", count: 2, price: 500, coinType: "gold", total: 1000, blindHitPriceRmb: 1 } };
    case "redPocket":
      return { ...base, msgType: MsgType.RedPocketStart, lottery: { awardName: "", awardNum: 0, totalPrice: 3000 } };
    case "anchorLottery":
      return { ...base, msgType: MsgType.AnchorLotStart, lottery: { awardName: "限定礼物", awardNum: 1 } };
    case "superChat":
      return { ...base, msgType: MsgType.SuperChat, text: "这是一条醒目留言", sc: { price: 30, message: "这是一条醒目留言", duration: 30 } };
    case "guard":
      return { ...base, msgType: MsgType.GuardBuy, text: "已陪伴主播365天", guard: { level: 1, count: 3, unit: "月" } };
    case "system":
      return { ...base, msgType: MsgType.RoomChange, text: "这是一条系统消息" };
    case "interact":
      return { ...base, msgType: MsgType.Interact, interactKind: "entry", text: "进房原文" };
  }
}

function findPreferredVoice(engine: VoiceEngine, availableVoices: VoiceInfo[]): VoiceInfo | undefined {
  if (engine === "edge-online") return availableVoices.find((voice) => voice.name === DEFAULT_EDGE_VOICE);
  return availableVoices.find((voice) => `${voice.name} ${voice.label}`.toLowerCase().includes(DEFAULT_WINDOWS_VOICE.toLowerCase()));
}

function VoicePronunciationEditor({ rules, onChange }: { rules: VoicePronunciationRule[]; onChange: (rules: VoicePronunciationRule[]) => void }) {
  useUiLanguage();
  const [draftRules, setDraftRules] = useState<VoicePronunciationRule[]>(() => rules);

  useEffect(() => {
    setDraftRules(rules);
  }, [rules]);

  const updateDraft = (id: string, value: Partial<VoicePronunciationRule>) => {
    setDraftRules((current) => current.map((rule) => rule.id === id ? { ...rule, ...value } : rule));
  };

  const commitRule = (candidate: VoicePronunciationRule) => {
    const source = candidate.source.trim();
    const replacement = candidate.replacement.trim();
    if (!source) return;
    const nextRule = { ...candidate, source, replacement };
    onChange(rules.some((rule) => rule.id === candidate.id)
      ? rules.map((rule) => rule.id === candidate.id ? nextRule : rule)
      : [...rules, nextRule]);
  };

  const addRule = () => {
    setDraftRules((current) => [...current, {
      id: `pronunciation-${Date.now()}-${current.length}`,
      source: "",
      replacement: "",
      enabled: true,
    }]);
  };

  const removeRule = (id: string) => {
    setDraftRules((current) => current.filter((rule) => rule.id !== id));
    onChange(rules.filter((rule) => rule.id !== id));
  };

  const toggleRule = (rule: VoicePronunciationRule) => {
    const nextRule = { ...rule, enabled: !rule.enabled };
    updateDraft(rule.id, { enabled: nextRule.enabled });
    commitRule(nextRule);
  };

  return (
    <div className="voice-pronunciation-editor space-y-2">
      <div className="voice-pronunciation-list space-y-2">
        {draftRules.map((rule) => (
          <div key={rule.id} className="voice-pronunciation-row">
            <Input
              aria-label={uiText("voicePanel.aria_label", { id: rule.id })}
              className={`${controlClass} min-w-0 w-full`}
              value={rule.source}
              placeholder={uiText("voicePanel.placeholder")}
              onChange={(event) => updateDraft(rule.id, { source: event.target.value })}
              onBlur={() => commitRule(draftRules.find((candidate) => candidate.id === rule.id) ?? rule)}
            />
            <span className="voice-pronunciation-arrow ui-type-meta text-t3" aria-hidden="true">{uiText("voicePanel.VoicePronunciationEditor")}</span>
            <Input
              aria-label={uiText("voicePanel.aria_label2", { id: rule.id })}
              className={`${controlClass} min-w-0 w-full`}
              value={rule.replacement}
              placeholder={uiText("voicePanel.placeholder2")}
              onChange={(event) => updateDraft(rule.id, { replacement: event.target.value })}
              onBlur={() => commitRule(draftRules.find((candidate) => candidate.id === rule.id) ?? rule)}
            />
            <div className="voice-pronunciation-actions flex shrink-0 items-center gap-2">
              <PanelSwitch label={uiText("voicePanel.label", { value: rule.source || uiText("voicePanel.label.value") })} checked={rule.enabled} onChange={() => toggleRule(rule)} />
              <Button size="icon-sm" variant="ghost" type="button" aria-label={uiText("voicePanel.aria_label3", { value: rule.source || uiText("voicePanel.aria_label.value") })} className="voice-pronunciation-delete rounded px-1.5 ui-type-control text-t3 transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger" onClick={() => removeRule(rule.id)}>×</Button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" type="button" className={`${controlClass} border-accent/50 text-accent-text`} onClick={addRule}>{uiText("voicePanel.VoicePronunciationEditor2")}</Button>
        <span className="ui-type-meta text-t3">{uiText("voicePanel.VoicePronunciationEditor3")}</span>
      </div>
    </div>
  );
}

function FishReferenceVoiceManager({ fishAudio, updateFishAudio, openFishResource }: { fishAudio: FishAudioSettings; updateFishAudio: (value: Partial<FishAudioSettings>) => void; openFishResource: (url: string) => Promise<void> }) {
  useUiLanguage();
  const pickerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [draftId, setDraftId] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackKind, setFeedbackKind] = useState<"success" | "error">("error");
  const lookupSequence = useRef(0);
  const currentId = fishAudio.referenceId.trim();
  const currentPreset = fishAudio.referenceVoices.find((voice) => voice.id === currentId);

  const optionLabel = (voice: FishReferenceVoice) => `${voice.name} · ${voice.id.slice(0, 8)}`;

  const selectVoice = (id: string) => {
    updateFishAudio({ referenceId: id });
    setIsOpen(false);
    setDraftId("");
    setFeedback(null);
  };

  const saveVoice = (voice: FishReferenceVoice, message: string) => {
    updateFishAudio({ referenceVoices: upsertFishReferenceVoice(fishAudio.referenceVoices, voice), referenceId: voice.id });
    setDraftId("");
    setFeedbackKind("success");
    setFeedback(message);
  };

  const lookupAndSaveVoice = async (modelId: string, saveFallback = false) => {
    const requestId = ++lookupSequence.current;
    setFeedback(null);
    setBusy(true);
    try {
      const voice = await lookupFishAudioModel({ baseUrl: fishAudio.baseUrl, apiKey: fishAudio.apiKey, modelId });
      if (requestId !== lookupSequence.current) return;
      saveVoice(voice, uiText("voicePanel.FishReferenceVoiceManager.lookupAndSaveVoice", { name: voice.name }));
    } catch (error) {
      if (requestId !== lookupSequence.current) return;
      if (saveFallback) {
        const fallback = normalizeFishReferenceVoice({ id: modelId });
        if (fallback) {
          saveVoice(fallback, uiText("voicePanel.FishReferenceVoiceManager.lookupAndSaveVoice2"));
          return;
        }
      }
      setFeedbackKind("error");
      setFeedback(error instanceof Error ? error.message : String(error));
    } finally {
      if (requestId === lookupSequence.current) setBusy(false);
    }
  };

  const submitInput = () => {
    const modelId = draftId.trim();
    if (!/^[a-z0-9]{32}$/i.test(modelId)) {
      setFeedbackKind("error");
      setFeedback(uiText("voicePanel.FishReferenceVoiceManager.submitInput"));
      return;
    }
    void lookupAndSaveVoice(modelId, true);
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    submitInput();
  };

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !pickerRef.current?.contains(target)) setIsOpen(false);
    };
    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, [isOpen]);

  useEffect(() => {
    const modelId = draftId.trim();
    if (!/^[a-z0-9]{32}$/i.test(modelId)) return undefined;
    const timer = window.setTimeout(() => void lookupAndSaveVoice(modelId), 300);
    return () => window.clearTimeout(timer);
  }, [draftId, fishAudio.apiKey, fishAudio.baseUrl]);

  const deleteVoice = (voice: FishReferenceVoice) => {
    updateFishAudio({ referenceVoices: removeFishReferenceVoice(fishAudio.referenceVoices, voice.id) });
    setFeedbackKind("success");
    setFeedback(uiText("voicePanel.FishReferenceVoiceManager.deleteVoice", { name: voice.name, value: voice.id === currentId ? uiText("voicePanel.FishReferenceVoiceManager.deleteVoice.value") : "" }));
  };

  return (
    <div ref={pickerRef} className="fish-reference-picker voice-select-tone relative flex min-w-0 w-full items-center gap-2">
      <div className="relative min-w-0 flex-1">
        <Button variant="outline" type="button" aria-label={uiText("voicePanel.aria_label4")} aria-haspopup="listbox" aria-expanded={isOpen} className={`${controlClass} ${selectClass} fish-reference-picker-trigger flex items-center justify-between gap-2 text-left`} onClick={() => setIsOpen((open) => !open)}>
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{currentPreset ? optionLabel(currentPreset) : currentId ? uiText("voicePanel.FishReferenceVoiceManager", { value: currentId.slice(0, 8) }) : uiText("voicePanel.FishReferenceVoiceManager2")}</span>
          <LucideChevronDown className={`size-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
        </Button>
        {isOpen && (
          <div data-ui-overlay="true" onPointerDown={(event) => event.stopPropagation()} className="ui-overlay-surface fish-reference-picker-popover absolute left-0 right-0 top-full z-30 mt-1 p-2">
            <div className="flex min-w-0 items-center gap-2">
              <Input aria-label={uiText("voicePanel.aria_label5")} className={`${controlClass} min-w-0 flex-1`} value={draftId} onChange={(event) => setDraftId(event.target.value)} onKeyDown={handleInputKeyDown} placeholder={uiText("voicePanel.placeholder3")} autoFocus />
              <Button variant="outline" type="button" className={`${controlClass} shrink-0 border-accent/50 text-accent-text`} disabled={busy} aria-busy={busy} onClick={submitInput}>{uiText("voicePanel.FishReferenceVoiceManager3")}</Button>
              {busy && <span className="shrink-0 ui-type-meta text-accent-text" aria-live="polite">{uiText("voicePanel.FishReferenceVoiceManager4")}</span>}
            </div>
            {feedback && <div role="status" aria-live="polite" className={`mt-2 ui-type-meta ${feedbackKind === "success" ? "text-accent-text" : "text-danger"}`}>{feedback}</div>}
            <div role="listbox" aria-label={uiText("voicePanel.aria_label6")} className="mt-2 max-h-48 overflow-y-auto">
              {currentId && !currentPreset && (
                <div role="option" aria-selected="true" className="ui-select-item flex items-center gap-1">
                  <Button variant="ghost" size={null} type="button" className="ui-select-item-text h-auto justify-start border-0 bg-transparent min-w-0 flex-1 text-left" onClick={() => selectVoice(currentId)}>{uiText("voicePanel.FishReferenceVoiceManager5")}{currentId.slice(0, 8)}{uiText("voicePanel.FishReferenceVoiceManager6")}</Button>
                </div>
              )}
              {fishAudio.referenceVoices.map((voice) => (
                <div key={voice.id} role="option" aria-selected={voice.id === currentId} className={`ui-select-item flex items-center gap-1 ${voice.id === currentId ? "bg-bg text-accent-text" : "text-t2"}`}>
                  <Button variant="ghost" size={null} type="button" className="ui-select-item-text h-auto justify-start border-0 bg-transparent min-w-0 flex-1 px-1 text-left" onClick={() => selectVoice(voice.id)}>{optionLabel(voice)}</Button>
                  <Button variant="ghost" size={null} type="button" aria-label={uiText("voicePanel.aria_label7", { name: voice.name })} className="size-6 shrink-0 rounded text-t3 transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger" onClick={() => deleteVoice(voice)}><span aria-hidden="true">×</span></Button>
                </div>
              ))}
              {fishAudio.referenceVoices.length === 0 && !currentId && <div className="px-2 py-1 ui-type-meta text-t3">{uiText("voicePanel.FishReferenceVoiceManager7")}</div>}
            </div>
          </div>
        )}
      </div>
      <Button variant="outline" type="button" className={`${controlClass} shrink-0 border-accent/50 text-accent-text`} onClick={() => void openFishResource(FISH_VOICE_LIBRARY_URL)}>{uiText("voicePanel.FishReferenceVoiceManager8")}</Button>
    </div>
  );
}

function VoiceTemplateComposer({ category, segments, onChange }: { category: VoiceEventCategory; segments: TemplateSegment[]; onChange: (segments: TemplateSegment[]) => void }) {
  useUiLanguage();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const preserveAdjacentText = category === "anchorLottery";
  const normalizeSegments = (next: TemplateSegment[]) => ensureTemplateTextGaps(next, preserveAdjacentText);
  const editableSegments = normalizeSegments(segments);
  const availableFields = VOICE_TEMPLATE_FIELDS.filter((field) => {
    if (category === "gift") return ["username", "giftName", "quantity", "amount"].includes(field);
    if (category === "blindBox") return ["username", "blindGiftName", "quantity", "giftName", "amount"].includes(field);
    if (category === "redPocket") return ["username", "amount", "content"].includes(field);
    if (category === "anchorLottery") return ["username", "giftName", "quantity", "content"].includes(field);
    if (category === "guard") return ["username", "guardName", "duration", "companionDays", "amount"].includes(field);
    if (category === "superChat") return ["username", "content", "amount"].includes(field);
    if (category === "interact") return ["username"].includes(field);
    if (category === "system") return ["content"].includes(field);
    return ["username", "content", "emoteName"].includes(field);
  });

  const update = (index: number, segment: TemplateSegment) => {
    const next = [...editableSegments];
    next[index] = segment;
    onChange(next);
  };

  const moveSegment = (from: number, to: number) => {
    const next = moveTemplateSegment(editableSegments, from, to);
    if (next !== editableSegments) onChange(normalizeSegments(next));
  };

  const handleDragStart = (event: DragEvent<HTMLElement>, index: number) => {
    setDragIndex(index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  };

  const handleModuleKeyDown = (event: React.KeyboardEvent<HTMLElement>, index: number) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      moveSegment(index, Math.max(0, index - 1));
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      moveSegment(index, Math.min(editableSegments.length - 1, index + 1));
    }
  };

  return (
    <div className="space-y-2">
      <div className="voice-template-flow flex min-h-10 flex-wrap items-center gap-x-0 gap-y-1 rounded-md border border-line bg-bg px-2 py-1.5">
        {editableSegments.map((segment, index) => (
          segment.kind === "field" ? (
            <span
              key={`${segment.kind}-${segment.field}-${index}`}
              className={`voice-template-module inline-flex min-w-0 shrink-0 items-center whitespace-nowrap overflow-hidden rounded-md border border-accent/35 bg-accent-subtle ${dragIndex === index ? "opacity-60" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                event.preventDefault();
                const from = dragIndex ?? Number(event.dataTransfer.getData("text/plain"));
                if (Number.isInteger(from)) moveSegment(from, index);
                setDragIndex(null);
              }}
            >
              <span
                className="voice-template-drag-handle inline-flex min-w-0 cursor-grab items-center gap-1 pl-2 pr-0 py-1 ui-type-meta text-accent-text outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-accent-ring"
                role="button"
                tabIndex={0}
                draggable={true}
                aria-grabbed={dragIndex === index}
                aria-label={uiText("voicePanel.aria_label8", { value: FIELD_LABELS[segment.field] })}
                aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
                title={uiText("voicePanel.title")}
                onDragStart={(event) => handleDragStart(event, index)}
                onDragEnd={() => setDragIndex(null)}
                onKeyDown={(event) => handleModuleKeyDown(event, index)}
              >
                <span aria-hidden="true" className="select-none text-t3 opacity-70">⠿</span>
                <span className="truncate">{FIELD_LABELS[segment.field]}</span>
              </span>
              <Button variant="ghost" size="icon-xs"
                type="button"
                aria-label={uiText("voicePanel.aria_label9", { value: FIELD_LABELS[segment.field] })}
                title={uiText("voicePanel.title2")}
                onClick={() => onChange(normalizeSegments(editableSegments.filter((_, itemIndex) => itemIndex !== index)))}
                className="voice-template-delete size-5 shrink-0 ui-type-meta text-t3 text-accent-text/75 transition-colors hover:bg-accent/15 hover:text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
              >
                ×
              </Button>
            </span>
          ) : (
            <span key={`${segment.kind}-${index}`} className="voice-template-text-slot inline-flex shrink-0 items-center">
              <Input
                aria-label={uiText("voicePanel.aria_label10", { value: index + 1 })}
                title={uiText("voicePanel.title3")}
                value={segment.value}
                style={{ width: segment.value ? `calc(${Math.min(32, Math.max(1, segment.value.length))}em + 0.5rem)` : "0.75rem" }}
                onChange={(event) => update(index, { kind: "text", value: event.target.value })}
                className="voice-template-text box-border min-w-0 max-w-full shrink-0 appearance-none border-b border-transparent bg-transparent px-0.5 py-1 leading-5 ui-type-control text-t2 text-t1 outline-none transition-colors hover:border-line focus:border-accent"
              />
            </span>
          )
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {availableFields.map((field) => (
          <Button variant="outline"
            type="button"
            key={field}
            onClick={() => onChange(normalizeSegments([...editableSegments, { kind: "field", field }]))}
            className="rounded-md border border-line bg-surface px-2 py-1 ui-type-meta text-t3 transition-colors hover:border-accent/60 hover:text-accent-text"
          >
            +{FIELD_LABELS[field]}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function VoicePanel() {
  const uiLanguage = useUiLanguage();
  const settings = useVoiceSettings();
  const snapshot = useSyncExternalStore(voiceController.subscribe, voiceController.getSnapshot, voiceController.getSnapshot);
  const personalSnapshot = useSyncExternalStore(personalBroadcastController.subscribe, personalBroadcastController.getSnapshot, personalBroadcastController.getSnapshot);
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const [customFixedBodyText, setCustomFixedBodyText] = useState(() => JSON.stringify(settings.customHttp.fixedBody, null, 2));
  const [customHeadersText, setCustomHeadersText] = useState(() => JSON.stringify(settings.customHttp.extraHeaders, null, 2));
  const [fishLinkError, setFishLinkError] = useState<string | null>(null);
  const [templateSelection, setTemplateSelection] = useState<TemplateSelection>({ kind: "category", category: "danmu" });
  const engineVoiceName = settings.engine === "windows-system" ? settings.engineVoices["windows-system"] : settings.engineVoices["edge-online"];
  const customVoiceName = settings.customHttp.voiceValues[settings.customHttp.preset];

  useEffect(() => {
    let active = true;
    setVoiceLoading(true);
    setVoiceError(null);
    void listVoiceOptions()
      .then((next) => {
        if (!active) return;
        setVoices(next);
        if (!next.some((voice) => voice.name === engineVoiceName)) {
          const preferredVoice = findPreferredVoice(settings.engine, next);
          if (preferredVoice && (settings.engine === "edge-online" || settings.engine === "windows-system")) {
            settings.setVoiceSettings({ engineVoices: { ...settings.engineVoices, [settings.engine]: preferredVoice.name } });
          }
        }
      })
      .catch((error) => { if (active) setVoiceError(error instanceof Error ? error.message : String(error)); })
      .finally(() => { if (active) setVoiceLoading(false); });
    return () => { active = false; };
  }, [settings.engine]);

  const usesVoiceList = settings.engine === "edge-online" || settings.engine === "windows-system";
  const voiceNeedsSelection = usesVoiceList && !voiceLoading && voices.length > 0 && !voices.some((voice) => voice.name === engineVoiceName);
  const externalConfigReady = settings.engine === "fish-audio"
    ? Boolean(settings.fishAudio.apiKey.trim() && settings.fishAudio.baseUrl.trim() && settings.fishAudio.model.trim() && settings.fishAudio.referenceId.trim())
    : settings.engine === "custom-http"
      ? Boolean(settings.customHttp.endpoint.trim() && settings.customHttp.textField.trim() && (!settings.customHttp.voiceField.trim() || customVoiceName.trim()))
      : true;
  const voiceReady = !voiceLoading && !voiceError && (usesVoiceList ? voices.length > 0 && !voiceNeedsSelection : externalConfigReady);
  const statusText = snapshot.status === "playing" ? uiText("voicePanel.VoicePanel.statusText") : snapshot.status === "paused" ? uiText("voicePanel.VoicePanel.statusText2") : snapshot.status === "error" ? uiText("voicePanel.VoicePanel.statusText3") : settings.enabled ? uiText("voicePanel.VoicePanel.statusText4") : uiText("voicePanel.VoicePanel.statusText5");
  const { canControlPlayback, playbackPaused } = getVoicePanelPlaybackState(
    snapshot,
    personalSnapshot,
    settings.personalBroadcast.mode,
  );
  const currentTemplate = getTemplateForSelection(settings, templateSelection);
  const currentTemplateCategory = selectionCategory(templateSelection);
  const activeVoice = voices.find((voice) => voice.name === engineVoiceName);
  const engineVoiceOptions = useMemo(() => {
    const current = {
      value: engineVoiceName,
      label: voiceNeedsSelection ? uiText("voicePanel.engineVoiceOptions.current.label") : activeVoice?.label ?? engineVoiceName,
    };
    const available = settings.engine === "edge-online"
      ? EDGE_VOICE_GROUPS.flatMap((group) => voices
        .filter((voice) => voice.group === group.value && voice.name !== engineVoiceName)
        .map((voice) => ({ value: voice.name, label: voice.label, title: voice.label, group: group.label })))
      : voices
        .filter((voice) => voice.name !== engineVoiceName)
        .map((voice) => ({ value: voice.name, label: voice.label }));
    return [current, ...available];
  }, [activeVoice?.label, engineVoiceName, settings.engine, voiceNeedsSelection, voices, uiLanguage]);

  const toggleEnabled = () => {
    if (settings.enabled) {
      settings.setVoiceSettings({ enabled: false });
      voiceController.stop();
      return;
    }
    if (voiceLoading || voiceNeedsSelection) return;
    settings.setVoiceSettings({ enabled: true });
    voiceController.start();
  };

  const changeEngine = (engine: VoiceEngine) => {
    const wasEnabled = settings.enabled;
    voiceController.reset();
    settings.setVoiceSettings({ engine });
    if (wasEnabled && !voiceController.getSnapshot().accepting) voiceController.start();
    setVoices([]);
    setVoiceError(null);
    setTestError(null);
  };

  useEffect(() => {
    setCustomFixedBodyText(JSON.stringify(settings.customHttp.fixedBody, null, 2));
    setCustomHeadersText(JSON.stringify(settings.customHttp.extraHeaders, null, 2));
  }, [settings.engine]);

  const updateFishAudio = (value: Partial<FishAudioSettings>) => {
    settings.setVoiceSettings({ fishAudio: { ...settings.fishAudio, ...value } });
  };

  const updateCustomHttp = (value: Partial<CustomHttpVoiceSettings>) => {
    settings.setVoiceSettings({ customHttp: { ...settings.customHttp, ...value } });
  };

  const openFishResource = async (url: string) => {
    setFishLinkError(null);
    try {
      await openUrl(url);
    } catch (error) {
      setFishLinkError(uiText("voicePanel.VoicePanel.openFishResource", { value: error instanceof Error ? error.message : String(error) }));
    }
  };

  const applyCustomJson = (value: string, field: "fixedBody" | "extraHeaders") => {
    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(uiText("voicePanel.VoicePanel.applyCustomJson"));
      if (field === "fixedBody") updateCustomHttp({ fixedBody: parsed });
      else updateCustomHttp({ extraHeaders: parsed });
      setTestError(null);
    } catch {
      setTestError(field === "fixedBody" ? uiText("voicePanel.VoicePanel.applyCustomJson2") : uiText("voicePanel.VoicePanel.applyCustomJson3"));
    }
  };

  const applyCustomHttpPreset = (preset: CustomHttpPreset) => {
    const defaults = getCustomHttpPresetDefaults(preset);
    updateCustomHttp(defaults);
    setCustomFixedBodyText(JSON.stringify(defaults.fixedBody, null, 2));
    setCustomHeadersText(JSON.stringify(defaults.extraHeaders, null, 2));
    setTestError(null);
  };

  const changeVoice = (voiceName: string) => {
    if (settings.engine !== "edge-online" && settings.engine !== "windows-system") return;
    const wasEnabled = settings.enabled;
    voiceController.reset();
    settings.setVoiceSettings({ engineVoices: { ...settings.engineVoices, [settings.engine]: voiceName } });
    if (wasEnabled && !voiceController.getSnapshot().accepting) voiceController.start();
    setTestError(null);
  };

  const changeCustomVoice = (voiceName: string) => {
    const wasEnabled = settings.enabled;
    voiceController.reset();
    settings.setVoiceSettings({
      customHttp: {
        ...settings.customHttp,
        voiceValues: { ...settings.customHttp.voiceValues, [settings.customHttp.preset]: voiceName },
      },
    });
    if (wasEnabled && !voiceController.getSnapshot().accepting) voiceController.start();
    setTestError(null);
  };

  const togglePlayback = () => {
    if (playbackPaused) {
      voiceController.resume();
    } else if (canControlPlayback) {
      voiceController.pause();
    }
  };

  const reset = () => {
    voiceController.stop();
    settings.resetVoicePanelSettings();
  };

  const updateTemplate = (segments: TemplateSegment[]) => {
    if (templateSelection.kind === "interact") {
      settings.setVoiceSettings({ interactTemplates: { ...settings.interactTemplates, [templateSelection.interactKind]: segments } });
      return;
    }
    if (templateSelection.kind === "result") {
      settings.setVoiceSettings(templateSelection.category === "redPocket"
        ? { redPocketResultTemplate: segments }
        : { anchorLotteryResultTemplate: segments });
      return;
    }
    settings.setVoiceSettings({ templates: { ...settings.templates, [templateSelection.category]: segments } });
  };

  const resetTemplate = () => {
    const segments = getDefaultTemplateForSelection(templateSelection);
    if (templateSelection.kind === "interact") {
      settings.setVoiceSettings({ interactTemplates: { ...settings.interactTemplates, [templateSelection.interactKind]: segments } });
      return;
    }
    if (templateSelection.kind === "result") {
      settings.setVoiceSettings(templateSelection.category === "redPocket"
        ? { redPocketResultTemplate: segments }
        : { anchorLotteryResultTemplate: segments });
      return;
    }
    settings.setVoiceSettings({ templates: { ...settings.templates, [templateSelection.category]: segments } });
  };

  const runTemplateTest = () => {
    setTestError(null);
    const rendered = renderVoiceEventTemplate(createTemplatePreviewEvent(templateSelection), settings);
    if (!rendered.text) {
      setTestError(uiText("voicePanel.VoicePanel.runTemplateTest"));
      return;
    }
    void voiceController.test(rendered.text).catch((error) => setTestError(error instanceof Error ? error.message : String(error)));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ConnectBar />
      <main className="voice-panel-root min-h-0 flex-1 overflow-hidden bg-bg p-3">
        <section className="voice-panel-frame flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-surface">
          <header className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
            <div>
              <h1 className="ui-type-section-title font-medium text-t1">{uiText("common.voice")}</h1>
              <p className="mt-0.5 ui-type-meta text-t3">{uiText("voicePanel.VoicePanel")}</p>
            </div>
            <div className="flex items-center gap-3">
              <PanelSwitch label={uiText("voicePanel.label2")} checked={settings.enabled} disabled={!settings.enabled && !voiceReady} onChange={toggleEnabled} />
            </div>
          </header>

          <div className="voice-panel-scroll min-h-0 flex-1 overflow-y-auto">
            <section className={sectionClass}>
              <SectionToolbar iconName="runtime" title={uiText("voicePanel.title4")} actionsClassName="voice-runtime-actions" status={<RuntimeQueueStatus text={statusText} state={snapshot.status} />}>
                <Button variant="outline" type="button" aria-label={playbackPaused ? uiText("voicePanel.aria_label11") : uiText("voicePanel.aria_label12")} className={controlClass} onClick={togglePlayback} disabled={!canControlPlayback}>{playbackPaused ? uiText("voicePanel.VoicePanel2") : uiText("voicePanel.VoicePanel3")}</Button>
                <Button variant="outline" type="button" className={controlClass} onClick={() => voiceController.skip()} disabled={!canControlPlayback}>{uiText("voicePanel.VoicePanel4")}</Button>
                <Button variant="outline" type="button" className={controlClass} onClick={() => voiceController.clear()}>{uiText("voicePanel.VoicePanel5")}</Button>
              </SectionToolbar>
              {(snapshot.error || voiceError || testError || voiceNeedsSelection) && (
                <div className="mt-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 ui-type-meta text-danger">
                  <div>{snapshot.error || voiceError || testError || uiText("voicePanel.VoicePanel6")}</div>
                  {snapshot.status === "error" && <Button variant="outline" type="button" className="mt-1 rounded border border-danger/40 px-2 py-0.5 text-danger hover:bg-danger/10" onClick={() => voiceController.start()}>{uiText("common.retry")}</Button>}
                </div>
              )}
              <RuntimeQueueSummary
                current={snapshot.current?.text ?? null}
                pendingCount={snapshot.pendingCount}
                discardedCount={snapshot.discardedCount}
                failedCount={snapshot.failedCount}
              />
            </section>

            <section className={sectionClass}>
              <h2 className="settings-experience-heading mb-3 ui-type-section-title font-medium text-t1"><Mic size={17} aria-hidden="true" />{uiText("voicePanel.VoicePanel7")}</h2>
              <div className="voice-setting-grid voice-engine-settings grid min-w-0 gap-x-6 gap-y-1">
                <SettingRow label={uiText("voicePanel.label3")}>
                  <UiSelect ariaLabel={uiText("voicePanel.ariaLabel")} size="standard" className="voice-select-control voice-select-compact" options={VOICE_ENGINE_OPTIONS} value={settings.engine} disabled={testBusy} onValueChange={(value) => changeEngine(value as VoiceEngine)} />
                </SettingRow>
                {settings.engine === "custom-http" || settings.engine === "fish-audio" ? null : (
                  <SettingRow label={uiText("voicePanel.label4")} hint={activeVoice?.local ? uiText("voicePanel.hint") : undefined}>
                    <UiSelect ariaLabel={uiText("voicePanel.ariaLabel2")} size="standard" className={`${selectClass} voice-select-tone`} options={engineVoiceOptions} value={engineVoiceName} onValueChange={changeVoice} />
                  </SettingRow>
                )}
              </div>
              {settings.engine === "fish-audio" && (
                <div className="voice-setting-grid mt-3 grid min-w-0 gap-x-6 gap-y-1">
                  <SettingRow label={uiText("voicePanel.label5")}><Input aria-label={uiText("voicePanel.aria_label13")} className={controlClass} value={settings.fishAudio.baseUrl} onChange={(event) => updateFishAudio({ baseUrl: event.target.value })} /></SettingRow>
                  <SettingRow label="API Key">
                    <div className="flex min-w-0 items-center gap-2">
                      <Input aria-label="Fish Audio API Key" type="password" autoComplete="off" className={`${controlClass} min-w-0 flex-1`} value={settings.fishAudio.apiKey} onChange={(event) => updateFishAudio({ apiKey: event.target.value })} />
                      <Button variant="outline" type="button" className={`${controlClass} shrink-0 border-accent/50 text-accent-text`} onClick={() => void openFishResource(FISH_API_KEY_URL)}>{uiText("voicePanel.VoicePanel8")}</Button>
                    </div>
                  </SettingRow>
                  <SettingRow label={uiText("voicePanel.label6")}>
                    <FishReferenceVoiceManager fishAudio={settings.fishAudio} updateFishAudio={updateFishAudio} openFishResource={openFishResource} />
                  </SettingRow>
                  <SettingRow label={uiText("voicePanel.label7")}><Input aria-label={uiText("voicePanel.aria_label14")} className={controlClass} value={settings.fishAudio.model} onChange={(event) => updateFishAudio({ model: event.target.value })} /></SettingRow>
                  <SettingRow label={uiText("voicePanel.label8")}><SettingsChoiceControl label={uiText("voicePanel.label9")} options={FISH_AUDIO_FORMAT_OPTIONS} value={settings.fishAudio.format} onChange={(value) => updateFishAudio({ format: value as FishAudioSettings["format"] })} /></SettingRow>
                  {fishLinkError && <div role="status" aria-live="polite" className="col-span-full ui-type-meta text-danger">{fishLinkError}</div>}
                </div>
              )}
              {settings.engine === "custom-http" && (
                <div className="mt-3 space-y-3">
                  <div className="voice-setting-grid grid min-w-0 gap-x-6 gap-y-1">
                    <SettingRow label={uiText("voicePanel.label10")} hint={uiText("voicePanel.hint2")}><SettingsChoiceControl label={uiText("voicePanel.label11")} options={CUSTOM_HTTP_PRESET_OPTIONS} value={settings.customHttp.preset} onChange={(value) => applyCustomHttpPreset(value as CustomHttpPreset)} /></SettingRow>
                    <SettingRow label={uiText("voicePanel.label5")}><Input aria-label={uiText("voicePanel.aria_label15")} className={controlClass} value={settings.customHttp.endpoint} onChange={(event) => updateCustomHttp({ endpoint: event.target.value })} /></SettingRow>
                    <SettingRow label={uiText("voicePanel.label12")}><SettingsChoiceControl label={uiText("voicePanel.label13")} options={CUSTOM_HTTP_AUTH_OPTIONS} value={settings.customHttp.authType} onChange={(value) => updateCustomHttp({ authType: value as CustomHttpVoiceSettings["authType"] })} /></SettingRow>
                    {settings.customHttp.authType !== "none" && <SettingRow label="API Key"><Input aria-label={uiText("voicePanel.aria_label16")} type="password" autoComplete="off" className={controlClass} value={settings.customHttp.apiKey} onChange={(event) => updateCustomHttp({ apiKey: event.target.value })} /></SettingRow>}
                    <SettingRow label={uiText("voicePanel.label7")}><Input aria-label={uiText("voicePanel.aria_label17")} className={controlClass} value={settings.customHttp.model} onChange={(event) => updateCustomHttp({ model: event.target.value })} /></SettingRow>
                    <SettingRow label={uiText("voicePanel.label14")}><Input aria-label={uiText("voicePanel.aria_label18")} className={`${controlClass} voice-select-tone`} value={customVoiceName} onChange={(event) => changeCustomVoice(event.target.value)} /></SettingRow>
                    <SettingRow label={uiText("voicePanel.label15")} hint={uiText("voicePanel.hint3")}><Input aria-label={uiText("voicePanel.aria_label19")} className={controlClass} value={settings.customHttp.textField} onChange={(event) => updateCustomHttp({ textField: event.target.value })} /></SettingRow>
                    <SettingRow label={uiText("voicePanel.label16")} hint={uiText("voicePanel.hint4")}><Input aria-label={uiText("voicePanel.aria_label20")} className={controlClass} value={settings.customHttp.voiceField} onChange={(event) => updateCustomHttp({ voiceField: event.target.value })} /></SettingRow>
                    <SettingRow label={uiText("voicePanel.label17")} hint={uiText("voicePanel.hint4")}><Input aria-label={uiText("voicePanel.aria_label21")} className={controlClass} value={settings.customHttp.modelField} onChange={(event) => updateCustomHttp({ modelField: event.target.value })} /></SettingRow>
                    <SettingRow label={uiText("voicePanel.label18")}><SettingsChoiceControl label={uiText("voicePanel.label19")} options={CUSTOM_HTTP_RESPONSE_OPTIONS} value={settings.customHttp.responseFormat} onChange={(value) => updateCustomHttp({ responseFormat: value as CustomHttpVoiceSettings["responseFormat"] })} /></SettingRow>
                    {settings.customHttp.responseFormat === "json-base64" && <SettingRow label={uiText("voicePanel.label20")} hint={uiText("voicePanel.hint5")}><Input aria-label={uiText("voicePanel.aria_label22")} className={controlClass} value={settings.customHttp.audioField} onChange={(event) => updateCustomHttp({ audioField: event.target.value })} /></SettingRow>}
                  </div>
                  <details className="voice-advanced-settings">
                    <summary className="voice-advanced-summary"><span>{uiText("voicePanel.VoicePanel9")}</span><span className="voice-advanced-hint">{uiText("voicePanel.VoicePanel10")}</span><span aria-hidden="true" className="voice-advanced-chevron" /></summary>
                    <div className="voice-setting-grid mt-2 grid min-w-0 gap-x-6 gap-y-1">
                      {settings.customHttp.authType === "api-key" && <SettingRow label="Key Header"><Input aria-label={uiText("voicePanel.aria_label23")} className={controlClass} value={settings.customHttp.apiKeyHeader} onChange={(event) => updateCustomHttp({ apiKeyHeader: event.target.value })} /></SettingRow>}
                      <SettingRow label={uiText("voicePanel.label21")} hint={uiText("voicePanel.hint4")}><Input aria-label={uiText("voicePanel.aria_label24")} className={controlClass} value={settings.customHttp.rateField} onChange={(event) => updateCustomHttp({ rateField: event.target.value })} /></SettingRow>
                      <SettingRow label={uiText("voicePanel.label22")} hint={uiText("voicePanel.hint4")}><Input aria-label={uiText("voicePanel.aria_label25")} className={controlClass} value={settings.customHttp.pitchField} onChange={(event) => updateCustomHttp({ pitchField: event.target.value })} /></SettingRow>
                      <SettingRow label={uiText("voicePanel.label23")} hint={uiText("voicePanel.hint4")}><Input aria-label={uiText("voicePanel.aria_label26")} className={controlClass} value={settings.customHttp.volumeField} onChange={(event) => updateCustomHttp({ volumeField: event.target.value })} /></SettingRow>
                      <SettingRow label={uiText("voicePanel.label24")} hint={uiText("voicePanel.hint6")}><Textarea aria-label={uiText("voicePanel.aria_label27")} className={`${controlClass} min-h-20 resize-none whitespace-pre-wrap`} value={customFixedBodyText} onChange={(event) => setCustomFixedBodyText(event.target.value)} onBlur={(event) => applyCustomJson(event.target.value, "fixedBody")} /></SettingRow>
                      <SettingRow label={uiText("voicePanel.label25")} hint={uiText("voicePanel.hint7")}><Textarea aria-label={uiText("voicePanel.aria_label28")} className={`${controlClass} min-h-20 resize-none whitespace-pre-wrap`} value={customHeadersText} onChange={(event) => setCustomHeadersText(event.target.value)} onBlur={(event) => applyCustomJson(event.target.value, "extraHeaders")} /></SettingRow>
                    </div>
                  </details>
                </div>
              )}
            </section>

            <section className={sectionClass}>
              <h2 className="settings-experience-heading mb-3 ui-type-section-title font-medium text-t1"><SlidersHorizontal size={17} aria-hidden="true" />{uiText("voicePanel.VoicePanel11")}</h2>
              <div className="voice-setting-grid grid min-w-0 gap-x-6 gap-y-1">
                <SettingRow label={uiText("voicePanel.label26")}><VoiceRange label={uiText("voicePanel.label26")} value={settings.speechRate} min={0.5} max={2} step={0.1} display={`${settings.speechRate.toFixed(1)}×`} onChange={(speechRate) => settings.setVoiceSettings({ speechRate })} /></SettingRow>
                <SettingRow label={uiText("voicePanel.label27")}><VoiceRange label={uiText("voicePanel.label27")} value={settings.pitch} min={-50} max={50} step={1} display={String(settings.pitch)} onChange={(pitch) => settings.setVoiceSettings({ pitch })} /></SettingRow>
                <SettingRow label={uiText("voicePanel.label28")}><VoiceRange label={uiText("voicePanel.label28")} value={settings.volume} min={0} max={1} step={0.05} display={`${Math.round(settings.volume * 100)}%`} onChange={(volume) => settings.setVoiceSettings({ volume })} /></SettingRow>
                <SettingRow label={uiText("voicePanel.label29")}><VoiceRange label={uiText("voicePanel.label29")} value={settings.playbackGain} min={1} max={2} step={0.05} display={`${Math.round(settings.playbackGain * 100)}%`} onChange={(playbackGain) => settings.setVoiceSettings({ playbackGain })} /></SettingRow>
              </div>
              <VoiceTestPanel key={settings.engine} onTest={text => voiceController.test(text)} onBusyChange={setTestBusy} />
            </section>

            <section className={sectionClass}>
              <SectionHeading iconName="queue">{uiText("voicePanel.VoicePanel12")}</SectionHeading>
              <div className="voice-setting-grid grid min-w-0 gap-x-6 gap-y-2">
                <SettingRow label={uiText("voicePanel.label30")}><SettingsChoiceControl label={uiText("voicePanel.label31")} options={VOICE_QUEUE_MODE_OPTIONS} value={settings.queueMode} onChange={queueMode => settings.setVoiceSettings({ queueMode })} /></SettingRow>
                <SettingRow label={uiText("voicePanel.label32")}><div className="flex items-center gap-2"><Input className={`${controlClass} w-24 font-mono`} type="number" min={0} max={30} step={0.5} value={settings.eventIntervalSeconds} onChange={(event) => settings.setVoiceSettings({ eventIntervalSeconds: Number(event.target.value) })} /><span className="ui-type-meta text-t3">{uiText("voicePanel.VoicePanel13")}</span></div></SettingRow>
                <SettingRow label={uiText("voicePanel.label33")}><Input className={`${controlClass} w-24 font-mono`} type="number" min={10} max={500} value={settings.queueLimit} onChange={(event) => settings.setVoiceSettings({ queueLimit: Number(event.target.value) })} /></SettingRow>
                <SettingRow label={uiText("voicePanel.label34")}><UiSelect ariaLabel={uiText("voicePanel.ariaLabel3")} size="standard" className="voice-select-control voice-select-compact" options={VOICE_OVERFLOW_OPTIONS} value={settings.overflowPolicy} onValueChange={(value) => settings.setVoiceSettings({ overflowPolicy: value as "drop-oldest" | "drop-newest" | "drop-normal-first" })} /></SettingRow>
                <SettingRow label={uiText("voicePanel.label35")}><PanelSwitch label={uiText("voicePanel.label35")} checked={settings.expiryEnabled} onChange={() => settings.setVoiceSettings({ expiryEnabled: !settings.expiryEnabled })} /></SettingRow>
                {settings.expiryEnabled && <SettingRow label={uiText("voicePanel.label36")}><Input className={`${controlClass} w-24 font-mono`} type="number" min={5} max={600} value={settings.expirySeconds} onChange={(event) => settings.setVoiceSettings({ expirySeconds: Number(event.target.value) })} /></SettingRow>}
              </div>
              <div className="voice-setting-grid mt-3 grid min-w-0 gap-x-6 gap-y-1">
                {VOICE_EVENT_CATEGORIES.map((category) => <SettingRow key={category} label={uiText("voicePanel.label37", { value: CATEGORY_LABELS[category] })}><SettingsChoiceControl label={uiText("voicePanel.label37", { value: CATEGORY_LABELS[category] })} options={PRIORITY_OPTIONS} value={settings.priorities[category]} onChange={value => settings.setVoiceSettings({ priorities: { ...settings.priorities, [category]: value } })} /></SettingRow>)}
              </div>
            </section>

            <section className={sectionClass}>
              <SectionHeading iconName="eventSpeech">{uiText("voicePanel.VoicePanel14")}</SectionHeading>
              <div className="voice-setting-grid grid min-w-0 gap-x-6 gap-y-1">
                {VOICE_EVENT_CATEGORIES.map((category) => <SettingRow key={category} label={CATEGORY_LABELS[category]}><PanelSwitch label={uiText("voicePanel.label38", { value: CATEGORY_LABELS[category] })} checked={settings.eventEnabled[category]} onChange={() => settings.setVoiceSettings({ eventEnabled: { ...settings.eventEnabled, [category]: !settings.eventEnabled[category] } })} /></SettingRow>)}
                <SettingRow label={uiText("voicePanel.label39")}><PanelSwitch label={uiText("voicePanel.label39")} checked={settings.blockBigEmoteDanmu} onChange={() => settings.setVoiceSettings({ blockBigEmoteDanmu: !settings.blockBigEmoteDanmu })} /></SettingRow>
                <SettingRow label={uiText("voicePanel.label40")}><PanelSwitch label={uiText("voicePanel.label40")} checked={settings.blockLowPriceSuperChat} onChange={() => settings.setVoiceSettings({ blockLowPriceSuperChat: !settings.blockLowPriceSuperChat })} /></SettingRow>
                <SettingRow label={uiText("voicePanel.label41")}><PanelSwitch label={uiText("voicePanel.label41")} checked={settings.blockLowPriceGuard} onChange={() => settings.setVoiceSettings({ blockLowPriceGuard: !settings.blockLowPriceGuard })} /></SettingRow>
              </div>
              <p className="mt-2 ui-type-meta text-t3">{uiText("voicePanel.VoicePanel15")}</p>
            </section>

            <section className={sectionClass}>
              <SectionHeading iconName="pronunciation">{uiText("voicePanel.VoicePanel16")}</SectionHeading>
              <VoicePronunciationEditor rules={settings.pronunciationRules} onChange={(pronunciationRules) => settings.setVoiceSettings({ pronunciationRules })} />
            </section>

            <section className={sectionClass}>
              <SectionHeading iconName="templates">{uiText("voicePanel.VoicePanel17")}</SectionHeading>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {VOICE_EVENT_CATEGORIES.map((category) => <Button variant="outline" type="button" key={category} className={`whitespace-nowrap rounded-md border px-2.5 py-1 ui-type-control ${currentTemplateCategory === category ? "border-accent bg-accent-subtle text-accent-text" : "border-line text-t3 hover:text-t1"}`} onClick={() => setTemplateSelection(category === "interact" ? { kind: "interact", interactKind: "entry" } : { kind: "category", category })}>{CATEGORY_LABELS[category]}</Button>)}
              </div>
              {currentTemplateCategory === "interact" && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {INTERACT_KIND_OPTIONS.map((option) => <Button variant="outline" type="button" key={option.key} className={`whitespace-nowrap rounded-md border px-2.5 py-1 ui-type-control ${templateSelection.kind === "interact" && templateSelection.interactKind === option.key ? "border-accent bg-accent-subtle text-accent-text" : "border-line text-t3 hover:text-t1"}`} onClick={() => setTemplateSelection({ kind: "interact", interactKind: option.key })}>{option.label}</Button>)}
                </div>
              )}
              {(currentTemplateCategory === "redPocket" || currentTemplateCategory === "anchorLottery") && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  <Button variant="outline" type="button" className={`whitespace-nowrap rounded-md border px-2.5 py-1 ui-type-control ${templateSelection.kind === "category" ? "border-accent bg-accent-subtle text-accent-text" : "border-line text-t3 hover:text-t1"}`} onClick={() => setTemplateSelection({ kind: "category", category: currentTemplateCategory })}>{CATEGORY_LABELS[currentTemplateCategory]}{uiText("voicePanel.VoicePanel18")}</Button>
                  <Button variant="outline" type="button" className={`whitespace-nowrap rounded-md border px-2.5 py-1 ui-type-control ${templateSelection.kind === "result" ? "border-accent bg-accent-subtle text-accent-text" : "border-line text-t3 hover:text-t1"}`} onClick={() => setTemplateSelection({ kind: "result", category: currentTemplateCategory as "redPocket" | "anchorLottery" })}>{CATEGORY_LABELS[currentTemplateCategory]}{uiText("voicePanel.VoicePanel19")}</Button>
                </div>
              )}
              <VoiceTemplateComposer category={currentTemplateCategory} segments={currentTemplate} onChange={updateTemplate} />
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Button variant="outline" type="button" aria-label={uiText("voicePanel.aria_label29")} className={`voice-template-audition ${controlClass} border-accent/50 text-accent-text`} onClick={runTemplateTest}>{uiText("voicePanel.VoicePanel20")}</Button>
                <Button variant="outline" type="button" className={`${controlClass} text-t3`} onClick={resetTemplate}>{uiText("voicePanel.VoicePanel21")}</Button>
              </div>
            </section>

            <section className={`${sectionClass} flex justify-end`}>
              <Button variant="outline" type="button" className={`${controlClass} border-danger/40 text-danger`} disabled={testBusy} title={uiText("common.restoreDefaults")} aria-label={uiText("common.restoreDefaults")} onClick={reset}>{uiText("common.restoreDefaults")}</Button>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}
