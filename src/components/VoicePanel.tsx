import { ChevronDown as LucideChevronDown, Mic, SlidersHorizontal, RotateCcw } from "lucide-react";
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

const CATEGORY_LABELS: Record<VoiceEventCategory, string> = {
  danmu: "弹幕",
  interact: "互动",
  gift: "礼物",
  blindBox: "盲盒",
  redPocket: "红包",
  anchorLottery: "天选",
  superChat: "醒目留言",
  guard: "大航海",
  system: "系统",
};

const FIELD_LABELS: Record<VoiceTemplateField, string> = {
  username: "用户名",
  content: "内容",
  giftName: "礼物名称",
  blindGiftName: "盲盒名称",
  quantity: "数量",
  amount: "金额",
  guardName: "大航海类型",
  duration: "开通时长",
  months: "开通时长",
  companionDays: "陪伴天数",
  emoteName: "表情名称",
};

const PRIORITY_OPTIONS: { value: VoicePriority; label: string }[] = [
  { value: "high", label: "高" },
  { value: "medium", label: "中" },
  { value: "normal", label: "普通" },
];

const VOICE_ENGINE_OPTIONS = [
  { value: "edge-online", label: "Edge 在线" },
  { value: "windows-system", label: "Windows 系统" },
  { value: "fish-audio", label: "Fish Audio" },
  { value: "custom-http", label: "自定义 API" },
] as const;
const FISH_AUDIO_FORMAT_OPTIONS = [
  { value: "mp3", label: "MP3" },
  { value: "wav", label: "WAV" },
] as const;
const CUSTOM_HTTP_AUTH_OPTIONS = [
  { value: "none", label: "无" },
  { value: "bearer", label: "Bearer" },
  { value: "api-key", label: "API Key Header" },
] as const;
const CUSTOM_HTTP_RESPONSE_OPTIONS = [
  { value: "audio", label: "原始音频" },
  { value: "json-base64", label: "JSON Base64" },
] as const;
const VOICE_QUEUE_MODE_OPTIONS = [
  { value: "original", label: "原始顺序" },
  { value: "priority", label: "优先级顺序" },
] as const;
const VOICE_OVERFLOW_OPTIONS = [
  { value: "drop-oldest", label: "丢弃最旧" },
  { value: "drop-newest", label: "丢弃最新" },
  { value: "drop-normal-first", label: "优先丢弃普通" },
] as const;
const CUSTOM_HTTP_PRESET_OPTIONS = [
  { value: "openai-compatible", label: CUSTOM_HTTP_PRESET_LABELS["openai-compatible"] },
  { value: "gpt-sovits", label: CUSTOM_HTTP_PRESET_LABELS["gpt-sovits"] },
  { value: "index-tts", label: CUSTOM_HTTP_PRESET_LABELS["index-tts"] },
  { value: "custom-json", label: CUSTOM_HTTP_PRESET_LABELS["custom-json"] },
] as const;

const DEFAULT_EDGE_VOICE = "zh-CN-XiaoxiaoNeural";
const DEFAULT_WINDOWS_VOICE = "Huihui";
const EDGE_VOICE_GROUPS = ["中文（普通话）", "中文（粤语）", "中文（方言）", "中文（台湾）", "English（美国）", "English（英国）", "日本語", "多语言音色"];
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
            <input
              aria-label={`发音原词 ${rule.id}`}
              className={`${controlClass} min-w-0 w-full`}
              value={rule.source}
              placeholder="关键词"
              onChange={(event) => updateDraft(rule.id, { source: event.target.value })}
              onBlur={() => commitRule(draftRules.find((candidate) => candidate.id === rule.id) ?? rule)}
            />
            <span className="voice-pronunciation-arrow ui-type-meta text-t3" aria-hidden="true">读作</span>
            <input
              aria-label={`发音读作 ${rule.id}`}
              className={`${controlClass} min-w-0 w-full`}
              value={rule.replacement}
              placeholder="发音"
              onChange={(event) => updateDraft(rule.id, { replacement: event.target.value })}
              onBlur={() => commitRule(draftRules.find((candidate) => candidate.id === rule.id) ?? rule)}
            />
            <div className="voice-pronunciation-actions flex shrink-0 items-center gap-2">
              <PanelSwitch label={`启用发音修正规则 ${rule.source || "新规则"}`} checked={rule.enabled} onChange={() => toggleRule(rule)} />
              <button type="button" aria-label={`删除发音修正规则 ${rule.source || "新规则"}`} className="voice-pronunciation-delete rounded px-1.5 ui-type-control text-t3 transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger" onClick={() => removeRule(rule.id)}>×</button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={`${controlClass} border-accent/50 text-accent-text`} onClick={addRule}>添加发音修正</button>
        <span className="ui-type-meta text-t3">只处理用户名、正文和互动文案</span>
      </div>
    </div>
  );
}

function FishReferenceVoiceManager({ fishAudio, updateFishAudio, openFishResource }: { fishAudio: FishAudioSettings; updateFishAudio: (value: Partial<FishAudioSettings>) => void; openFishResource: (url: string) => Promise<void> }) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [draftId, setDraftId] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
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
    setFeedback(message);
  };

  const lookupAndSaveVoice = async (modelId: string, saveFallback = false) => {
    const requestId = ++lookupSequence.current;
    setFeedback(null);
    setBusy(true);
    try {
      const voice = await lookupFishAudioModel({ baseUrl: fishAudio.baseUrl, apiKey: fishAudio.apiKey, modelId });
      if (requestId !== lookupSequence.current) return;
      saveVoice(voice, `已识别：${voice.name}`);
    } catch (error) {
      if (requestId !== lookupSequence.current) return;
      if (saveFallback) {
        const fallback = normalizeFishReferenceVoice({ id: modelId });
        if (fallback) {
          saveVoice(fallback, "已保存 ID，填写 API Key 后可识别模型名");
          return;
        }
      }
      setFeedback(error instanceof Error ? error.message : String(error));
    } finally {
      if (requestId === lookupSequence.current) setBusy(false);
    }
  };

  const submitInput = () => {
    const modelId = draftId.trim();
    if (!/^[a-z0-9]{32}$/i.test(modelId)) {
      setFeedback("请输入 32 位参考音色 ID");
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
    setFeedback(`已移除预设：${voice.name}${voice.id === currentId ? "，当前音色仍在使用" : ""}`);
  };

  return (
    <div ref={pickerRef} className="fish-reference-picker relative flex min-w-0 w-full items-center gap-2">
      <div className="relative min-w-0 flex-1">
        <button type="button" aria-label="参考音色" aria-haspopup="listbox" aria-expanded={isOpen} className={`${controlClass} ${selectClass} fish-reference-picker-trigger flex items-center justify-between gap-2 text-left`} onClick={() => setIsOpen((open) => !open)}>
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{currentPreset ? optionLabel(currentPreset) : currentId ? `当前音色 · ${currentId.slice(0, 8)}（未保存）` : "未选择"}</span>
          <LucideChevronDown className={`size-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
        {isOpen && (
          <div data-ui-overlay="true" onPointerDown={(event) => event.stopPropagation()} className="ui-overlay-surface fish-reference-picker-popover absolute left-0 right-0 top-full z-30 mt-1 p-2">
            <div className="flex min-w-0 items-center gap-2">
              <input aria-label="参考音色 ID" className={`${controlClass} min-w-0 flex-1`} value={draftId} onChange={(event) => setDraftId(event.target.value)} onKeyDown={handleInputKeyDown} placeholder="输入 ID，回车识别" autoFocus />
              <button type="button" className={`${controlClass} shrink-0 border-accent/50 text-accent-text`} disabled={busy} aria-busy={busy} onClick={submitInput}>识别</button>
              {busy && <span className="shrink-0 ui-type-meta text-accent-text" aria-live="polite">识别中</span>}
            </div>
            {feedback && <div role="status" aria-live="polite" className={`mt-2 ui-type-meta ${feedback.startsWith("已") ? "text-accent-text" : "text-danger"}`}>{feedback}</div>}
            <div role="listbox" aria-label="已保存参考音色" className="mt-2 max-h-48 overflow-y-auto">
              {currentId && !currentPreset && (
                <div role="option" aria-selected="true" className="ui-select-item flex items-center gap-1">
                  <button type="button" className="ui-select-item-text min-w-0 flex-1 text-left" onClick={() => selectVoice(currentId)}>当前音色 · {currentId.slice(0, 8)}（未保存）</button>
                </div>
              )}
              {fishAudio.referenceVoices.map((voice) => (
                <div key={voice.id} role="option" aria-selected={voice.id === currentId} className={`ui-select-item flex items-center gap-1 ${voice.id === currentId ? "bg-bg text-accent-text" : "text-t2"}`}>
                  <button type="button" className="ui-select-item-text min-w-0 flex-1 px-1 text-left" onClick={() => selectVoice(voice.id)}>{optionLabel(voice)}</button>
                  <button type="button" aria-label={`删除预设 ${voice.name}`} className="size-6 shrink-0 rounded text-t3 transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger" onClick={() => deleteVoice(voice)}><span aria-hidden="true">×</span></button>
                </div>
              ))}
              {fishAudio.referenceVoices.length === 0 && !currentId && <div className="px-2 py-1 ui-type-meta text-t3">暂无预设</div>}
            </div>
          </div>
        )}
      </div>
      <button type="button" className={`${controlClass} shrink-0 border-accent/50 text-accent-text`} onClick={() => void openFishResource(FISH_VOICE_LIBRARY_URL)}>查找音色</button>
    </div>
  );
}

function VoiceTemplateComposer({ category, segments, onChange }: { category: VoiceEventCategory; segments: TemplateSegment[]; onChange: (segments: TemplateSegment[]) => void }) {
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
              className={`voice-template-module inline-flex min-w-0 shrink-0 items-stretch whitespace-nowrap overflow-hidden rounded-md border border-accent/35 bg-accent-subtle ${dragIndex === index ? "opacity-60" : ""}`}
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
                className="voice-template-drag-handle inline-flex min-w-0 cursor-grab items-center gap-1 px-2 py-1 ui-type-meta text-accent-text outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-accent-ring"
                role="button"
                tabIndex={0}
                draggable={true}
                aria-grabbed={dragIndex === index}
                aria-label={`拖动${FIELD_LABELS[segment.field]}模块`}
                aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
                title="拖动模块调整顺序，也可使用方向键"
                onDragStart={(event) => handleDragStart(event, index)}
                onDragEnd={() => setDragIndex(null)}
                onKeyDown={(event) => handleModuleKeyDown(event, index)}
              >
                <span aria-hidden="true" className="select-none text-t3 opacity-70">⠿</span>
                <span className="truncate">{FIELD_LABELS[segment.field]}</span>
              </span>
              <button
                type="button"
                aria-label={`删除${FIELD_LABELS[segment.field]}模块`}
                title="删除动态字段"
                onClick={() => onChange(normalizeSegments(editableSegments.filter((_, itemIndex) => itemIndex !== index)))}
                className="voice-template-delete shrink-0 px-1.5 ui-type-meta text-t3 text-accent-text/75 transition-colors hover:bg-accent/15 hover:text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
              >
                ×
              </button>
            </span>
          ) : (
            <span key={`${segment.kind}-${index}`} className="voice-template-text-slot inline-flex shrink-0 items-center">
              <input
                aria-label={`模板文字 ${index + 1}`}
                title="输入固定文字"
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
          <button
            type="button"
            key={field}
            onClick={() => onChange(normalizeSegments([...editableSegments, { kind: "field", field }]))}
            className="rounded-md border border-line bg-surface px-2 py-1 ui-type-meta text-t3 transition-colors hover:border-accent/60 hover:text-accent-text"
          >
            +{FIELD_LABELS[field]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function VoicePanel() {
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
  const statusText = snapshot.status === "playing" ? "正在播报" : snapshot.status === "paused" ? "已暂停" : snapshot.status === "error" ? "需要处理" : settings.enabled ? "等待播报" : "未开启";
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
      label: voiceNeedsSelection ? "需要选择音色" : activeVoice?.label ?? engineVoiceName,
    };
    const available = settings.engine === "edge-online"
      ? EDGE_VOICE_GROUPS.flatMap((group) => voices
        .filter((voice) => voice.group === group && voice.name !== engineVoiceName)
        .map((voice) => ({ value: voice.name, label: voice.label, title: voice.label, group })))
      : voices
        .filter((voice) => voice.name !== engineVoiceName)
        .map((voice) => ({ value: voice.name, label: voice.label }));
    return [current, ...available];
  }, [activeVoice?.label, engineVoiceName, settings.engine, voiceNeedsSelection, voices]);

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
      setFishLinkError(`打开 Fish Audio 页面失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const applyCustomJson = (value: string, field: "fixedBody" | "extraHeaders") => {
    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("必须是 JSON 对象");
      if (field === "fixedBody") updateCustomHttp({ fixedBody: parsed });
      else updateCustomHttp({ extraHeaders: parsed });
      setTestError(null);
    } catch {
      setTestError(field === "fixedBody" ? "固定请求字段必须是有效 JSON 对象" : "额外请求头必须是有效 JSON 对象");
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
      setTestError("当前模板没有可试听内容");
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
              <h1 className="ui-type-section-title font-medium text-t1">语音</h1>
              <p className="mt-0.5 ui-type-meta text-t3">直播事件语音播报</p>
            </div>
            <div className="flex items-center gap-3">
              <PanelSwitch label="开启语音" checked={settings.enabled} disabled={!settings.enabled && !voiceReady} onChange={toggleEnabled} />
            </div>
          </header>

          <div className="voice-panel-scroll min-h-0 flex-1 overflow-y-auto">
            <section className={sectionClass}>
              <SectionToolbar title="播报状态" actionsClassName="voice-runtime-actions" status={<RuntimeQueueStatus text={statusText} state={snapshot.status} />}>
                <button type="button" aria-label={playbackPaused ? "继续播报" : "暂停播报"} className={controlClass} onClick={togglePlayback} disabled={!canControlPlayback}>{playbackPaused ? "继续" : "暂停"}</button>
                <button type="button" className={controlClass} onClick={() => voiceController.skip()} disabled={!canControlPlayback}>跳过当前</button>
                <button type="button" className={controlClass} onClick={() => voiceController.clear()}>清空队列</button>
              </SectionToolbar>
              {(snapshot.error || voiceError || testError || voiceNeedsSelection) && (
                <div className="mt-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 ui-type-meta text-danger">
                  <div>{snapshot.error || voiceError || testError || "当前音色不可用，请手动选择音色后再开启语音"}</div>
                  {snapshot.status === "error" && <button type="button" className="mt-1 rounded border border-danger/40 px-2 py-0.5 text-danger hover:bg-danger/10" onClick={() => voiceController.start()}>重试</button>}
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
              <h2 className="settings-experience-heading mb-3 ui-type-section-title font-medium text-t1"><Mic size={17} aria-hidden="true" />语音引擎</h2>
              <div className="voice-setting-grid voice-engine-settings grid min-w-0 gap-x-6 gap-y-1">
                <SettingRow label="引擎">
                  <UiSelect ariaLabel="语音引擎" size="standard" className="voice-select-control voice-select-compact" options={VOICE_ENGINE_OPTIONS} value={settings.engine} disabled={testBusy} onValueChange={(value) => changeEngine(value as VoiceEngine)} />
                </SettingRow>
                {settings.engine === "custom-http" || settings.engine === "fish-audio" ? null : (
                  <SettingRow label="音色" hint={activeVoice?.local ? "本机已安装" : undefined}>
                    <UiSelect ariaLabel="语音音色" size="standard" className={selectClass} options={engineVoiceOptions} value={engineVoiceName} onValueChange={changeVoice} />
                  </SettingRow>
                )}
              </div>
              {settings.engine === "fish-audio" && (
                <div className="voice-setting-grid mt-3 grid min-w-0 gap-x-6 gap-y-1">
                  <SettingRow label="API 地址"><input aria-label="Fish Audio API 地址" className={controlClass} value={settings.fishAudio.baseUrl} onChange={(event) => updateFishAudio({ baseUrl: event.target.value })} /></SettingRow>
                  <SettingRow label="API Key">
                    <div className="flex min-w-0 items-center gap-2">
                      <input aria-label="Fish Audio API Key" type="password" autoComplete="off" className={`${controlClass} min-w-0 flex-1`} value={settings.fishAudio.apiKey} onChange={(event) => updateFishAudio({ apiKey: event.target.value })} />
                      <button type="button" className={`${controlClass} shrink-0 border-accent/50 text-accent-text`} onClick={() => void openFishResource(FISH_API_KEY_URL)}>获取 API Key</button>
                    </div>
                  </SettingRow>
                  <SettingRow label="参考音色">
                    <FishReferenceVoiceManager fishAudio={settings.fishAudio} updateFishAudio={updateFishAudio} openFishResource={openFishResource} />
                  </SettingRow>
                  <SettingRow label="模型"><input aria-label="Fish Audio 模型" className={controlClass} value={settings.fishAudio.model} onChange={(event) => updateFishAudio({ model: event.target.value })} /></SettingRow>
                  <SettingRow label="音频格式"><SettingsChoiceControl label="Fish Audio 音频格式" options={FISH_AUDIO_FORMAT_OPTIONS} value={settings.fishAudio.format} onChange={(value) => updateFishAudio({ format: value as FishAudioSettings["format"] })} /></SettingRow>
                  {fishLinkError && <div role="status" aria-live="polite" className="col-span-full ui-type-meta text-danger">{fishLinkError}</div>}
                </div>
              )}
              {settings.engine === "custom-http" && (
                <div className="mt-3 space-y-3">
                  <div className="voice-setting-grid grid min-w-0 gap-x-6 gap-y-1">
                    <SettingRow label="接口预设" hint="选择请求格式"><SettingsChoiceControl label="自定义 API 接口预设" options={CUSTOM_HTTP_PRESET_OPTIONS} value={settings.customHttp.preset} onChange={(value) => applyCustomHttpPreset(value as CustomHttpPreset)} /></SettingRow>
                    <SettingRow label="API 地址"><input aria-label="自定义 API 地址" className={controlClass} value={settings.customHttp.endpoint} onChange={(event) => updateCustomHttp({ endpoint: event.target.value })} /></SettingRow>
                    <SettingRow label="鉴权"><SettingsChoiceControl label="自定义 API 鉴权" options={CUSTOM_HTTP_AUTH_OPTIONS} value={settings.customHttp.authType} onChange={(value) => updateCustomHttp({ authType: value as CustomHttpVoiceSettings["authType"] })} /></SettingRow>
                    {settings.customHttp.authType !== "none" && <SettingRow label="API Key"><input aria-label="自定义 API Key" type="password" autoComplete="off" className={controlClass} value={settings.customHttp.apiKey} onChange={(event) => updateCustomHttp({ apiKey: event.target.value })} /></SettingRow>}
                    <SettingRow label="模型"><input aria-label="自定义 API 模型值" className={controlClass} value={settings.customHttp.model} onChange={(event) => updateCustomHttp({ model: event.target.value })} /></SettingRow>
                    <SettingRow label="音色/参考音频"><input aria-label="自定义 API 音色或参考音频" className={controlClass} value={customVoiceName} onChange={(event) => changeCustomVoice(event.target.value)} /></SettingRow>
                    <SettingRow label="文本字段" hint="支持 input.text"><input aria-label="自定义 API 文本字段" className={controlClass} value={settings.customHttp.textField} onChange={(event) => updateCustomHttp({ textField: event.target.value })} /></SettingRow>
                    <SettingRow label="音色字段" hint="可留空"><input aria-label="自定义 API 音色字段" className={controlClass} value={settings.customHttp.voiceField} onChange={(event) => updateCustomHttp({ voiceField: event.target.value })} /></SettingRow>
                    <SettingRow label="模型字段" hint="可留空"><input aria-label="自定义 API 模型字段" className={controlClass} value={settings.customHttp.modelField} onChange={(event) => updateCustomHttp({ modelField: event.target.value })} /></SettingRow>
                    <SettingRow label="响应类型"><SettingsChoiceControl label="自定义 API 响应格式" options={CUSTOM_HTTP_RESPONSE_OPTIONS} value={settings.customHttp.responseFormat} onChange={(value) => updateCustomHttp({ responseFormat: value as CustomHttpVoiceSettings["responseFormat"] })} /></SettingRow>
                    {settings.customHttp.responseFormat === "json-base64" && <SettingRow label="音频字段" hint="支持 data.audio"><input aria-label="自定义 API 音频字段" className={controlClass} value={settings.customHttp.audioField} onChange={(event) => updateCustomHttp({ audioField: event.target.value })} /></SettingRow>}
                  </div>
                  <details className="voice-advanced-settings">
                    <summary className="voice-advanced-summary"><span>高级请求设置</span><span className="voice-advanced-hint">单位按接口要求填写</span><span aria-hidden="true" className="voice-advanced-chevron" /></summary>
                    <div className="voice-setting-grid mt-2 grid min-w-0 gap-x-6 gap-y-1">
                      {settings.customHttp.authType === "api-key" && <SettingRow label="Key Header"><input aria-label="自定义 API Key Header" className={controlClass} value={settings.customHttp.apiKeyHeader} onChange={(event) => updateCustomHttp({ apiKeyHeader: event.target.value })} /></SettingRow>}
                      <SettingRow label="速度字段" hint="可留空"><input aria-label="自定义 API 速度字段" className={controlClass} value={settings.customHttp.rateField} onChange={(event) => updateCustomHttp({ rateField: event.target.value })} /></SettingRow>
                      <SettingRow label="音调字段" hint="可留空"><input aria-label="自定义 API 音调字段" className={controlClass} value={settings.customHttp.pitchField} onChange={(event) => updateCustomHttp({ pitchField: event.target.value })} /></SettingRow>
                      <SettingRow label="音量字段" hint="可留空"><input aria-label="自定义 API 音量字段" className={controlClass} value={settings.customHttp.volumeField} onChange={(event) => updateCustomHttp({ volumeField: event.target.value })} /></SettingRow>
                      <SettingRow label="固定请求字段" hint="支持嵌套 JSON"><textarea aria-label="固定请求字段" className={`${controlClass} min-h-20 resize-none whitespace-pre-wrap`} value={customFixedBodyText} onChange={(event) => setCustomFixedBodyText(event.target.value)} onBlur={(event) => applyCustomJson(event.target.value, "fixedBody")} /></SettingRow>
                      <SettingRow label="额外请求头" hint="JSON 对象"><textarea aria-label="额外请求头" className={`${controlClass} min-h-20 resize-none whitespace-pre-wrap`} value={customHeadersText} onChange={(event) => setCustomHeadersText(event.target.value)} onBlur={(event) => applyCustomJson(event.target.value, "extraHeaders")} /></SettingRow>
                    </div>
                  </details>
                </div>
              )}
            </section>

            <section className={sectionClass}>
              <h2 className="settings-experience-heading mb-3 ui-type-section-title font-medium text-t1"><SlidersHorizontal size={17} aria-hidden="true" />声音参数</h2>
              <div className="voice-setting-grid grid min-w-0 gap-x-6 gap-y-1">
                <SettingRow label="语速"><VoiceRange label="语速" value={settings.speechRate} min={0.5} max={2} step={0.1} display={`${settings.speechRate.toFixed(1)}×`} onChange={(speechRate) => settings.setVoiceSettings({ speechRate })} /></SettingRow>
                <SettingRow label="音调"><VoiceRange label="音调" value={settings.pitch} min={-50} max={50} step={1} display={String(settings.pitch)} onChange={(pitch) => settings.setVoiceSettings({ pitch })} /></SettingRow>
                <SettingRow label="音量"><VoiceRange label="音量" value={settings.volume} min={0} max={1} step={0.05} display={`${Math.round(settings.volume * 100)}%`} onChange={(volume) => settings.setVoiceSettings({ volume })} /></SettingRow>
                <SettingRow label="播放增益"><VoiceRange label="播放增益" value={settings.playbackGain} min={1} max={2} step={0.05} display={`${Math.round(settings.playbackGain * 100)}%`} onChange={(playbackGain) => settings.setVoiceSettings({ playbackGain })} /></SettingRow>
              </div>
              <VoiceTestPanel key={settings.engine} onTest={text => voiceController.test(text)} onBusyChange={setTestBusy} />
            </section>

            <section className={sectionClass}>
              <SectionHeading>队列规则</SectionHeading>
              <div className="voice-setting-grid grid min-w-0 gap-x-6 gap-y-2">
                <SettingRow label="排序方式"><SettingsChoiceControl label="队列排序方式" options={VOICE_QUEUE_MODE_OPTIONS} value={settings.queueMode} onChange={queueMode => settings.setVoiceSettings({ queueMode })} /></SettingRow>
                <SettingRow label="播报间隔"><div className="flex items-center gap-2"><input className={`${controlClass} w-24 font-mono`} type="number" min={0} max={30} step={0.5} value={settings.eventIntervalSeconds} onChange={(event) => settings.setVoiceSettings({ eventIntervalSeconds: Number(event.target.value) })} /><span className="ui-type-meta text-t3">秒</span></div></SettingRow>
                <SettingRow label="排队上限"><input className={`${controlClass} w-24 font-mono`} type="number" min={10} max={500} value={settings.queueLimit} onChange={(event) => settings.setVoiceSettings({ queueLimit: Number(event.target.value) })} /></SettingRow>
                <SettingRow label="溢出处理"><UiSelect ariaLabel="队列溢出处理" size="standard" className="voice-select-control voice-select-compact" options={VOICE_OVERFLOW_OPTIONS} value={settings.overflowPolicy} onValueChange={(value) => settings.setVoiceSettings({ overflowPolicy: value as "drop-oldest" | "drop-newest" | "drop-normal-first" })} /></SettingRow>
                <SettingRow label="过期事件不再播报"><PanelSwitch label="过期事件不再播报" checked={settings.expiryEnabled} onChange={() => settings.setVoiceSettings({ expiryEnabled: !settings.expiryEnabled })} /></SettingRow>
                {settings.expiryEnabled && <SettingRow label="过期时间"><input className={`${controlClass} w-24 font-mono`} type="number" min={5} max={600} value={settings.expirySeconds} onChange={(event) => settings.setVoiceSettings({ expirySeconds: Number(event.target.value) })} /></SettingRow>}
              </div>
              <div className="voice-setting-grid mt-3 grid min-w-0 gap-x-6 gap-y-1">
                {VOICE_EVENT_CATEGORIES.map((category) => <SettingRow key={category} label={`${CATEGORY_LABELS[category]}优先级`}><SettingsChoiceControl label={`${CATEGORY_LABELS[category]}优先级`} options={PRIORITY_OPTIONS} value={settings.priorities[category]} onChange={value => settings.setVoiceSettings({ priorities: { ...settings.priorities, [category]: value } })} /></SettingRow>)}
              </div>
            </section>

            <section className={sectionClass}>
              <SectionHeading>事件播报</SectionHeading>
              <div className="voice-setting-grid grid min-w-0 gap-x-6 gap-y-1">
                {VOICE_EVENT_CATEGORIES.map((category) => <SettingRow key={category} label={CATEGORY_LABELS[category]}><PanelSwitch label={`播报${CATEGORY_LABELS[category]}`} checked={settings.eventEnabled[category]} onChange={() => settings.setVoiceSettings({ eventEnabled: { ...settings.eventEnabled, [category]: !settings.eventEnabled[category] } })} /></SettingRow>)}
                <SettingRow label="屏蔽大表情弹幕"><PanelSwitch label="屏蔽大表情弹幕" checked={settings.blockBigEmoteDanmu} onChange={() => settings.setVoiceSettings({ blockBigEmoteDanmu: !settings.blockBigEmoteDanmu })} /></SettingRow>
                <SettingRow label="屏蔽低价醒目留言"><PanelSwitch label="屏蔽低价醒目留言" checked={settings.blockLowPriceSuperChat} onChange={() => settings.setVoiceSettings({ blockLowPriceSuperChat: !settings.blockLowPriceSuperChat })} /></SettingRow>
                <SettingRow label="屏蔽低价大航海"><PanelSwitch label="屏蔽低价大航海" checked={settings.blockLowPriceGuard} onChange={() => settings.setVoiceSettings({ blockLowPriceGuard: !settings.blockLowPriceGuard })} /></SettingRow>
              </div>
              <p className="mt-2 ui-type-meta text-t3">“只显示大航海进房”沿用通用设置，并同时作用于语音。</p>
            </section>

            <section className={sectionClass}>
              <SectionHeading>发音修正</SectionHeading>
              <VoicePronunciationEditor rules={settings.pronunciationRules} onChange={(pronunciationRules) => settings.setVoiceSettings({ pronunciationRules })} />
            </section>

            <section className={sectionClass}>
              <SectionHeading>播报模板</SectionHeading>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {VOICE_EVENT_CATEGORIES.map((category) => <button type="button" key={category} className={`whitespace-nowrap rounded-md border px-2.5 py-1 ui-type-control ${currentTemplateCategory === category ? "border-accent bg-accent-subtle text-accent-text" : "border-line text-t3 hover:text-t1"}`} onClick={() => setTemplateSelection(category === "interact" ? { kind: "interact", interactKind: "entry" } : { kind: "category", category })}>{CATEGORY_LABELS[category]}</button>)}
              </div>
              {currentTemplateCategory === "interact" && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {INTERACT_KIND_OPTIONS.map((option) => <button type="button" key={option.key} className={`whitespace-nowrap rounded-md border px-2.5 py-1 ui-type-control ${templateSelection.kind === "interact" && templateSelection.interactKind === option.key ? "border-accent bg-accent-subtle text-accent-text" : "border-line text-t3 hover:text-t1"}`} onClick={() => setTemplateSelection({ kind: "interact", interactKind: option.key })}>{option.label}</button>)}
                </div>
              )}
              {(currentTemplateCategory === "redPocket" || currentTemplateCategory === "anchorLottery") && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  <button type="button" className={`whitespace-nowrap rounded-md border px-2.5 py-1 ui-type-control ${templateSelection.kind === "category" ? "border-accent bg-accent-subtle text-accent-text" : "border-line text-t3 hover:text-t1"}`} onClick={() => setTemplateSelection({ kind: "category", category: currentTemplateCategory })}>{CATEGORY_LABELS[currentTemplateCategory]}开始</button>
                  <button type="button" className={`whitespace-nowrap rounded-md border px-2.5 py-1 ui-type-control ${templateSelection.kind === "result" ? "border-accent bg-accent-subtle text-accent-text" : "border-line text-t3 hover:text-t1"}`} onClick={() => setTemplateSelection({ kind: "result", category: currentTemplateCategory as "redPocket" | "anchorLottery" })}>{CATEGORY_LABELS[currentTemplateCategory]}结果</button>
                </div>
              )}
              <VoiceTemplateComposer category={currentTemplateCategory} segments={currentTemplate} onChange={updateTemplate} />
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button type="button" aria-label="试听当前模板" className={`voice-template-audition ${controlClass} border-accent/50 text-accent-text`} onClick={runTemplateTest}>试听</button>
                <button type="button" className={`${controlClass} text-t3`} onClick={resetTemplate}>恢复本模板默认</button>
              </div>
            </section>

            <section className={`${sectionClass} flex justify-end`}>
              <button type="button" className={`${controlClass} border-danger/40 text-danger`} disabled={testBusy} title="恢复默认" aria-label="恢复默认" onClick={reset}><RotateCcw size={16} aria-hidden="true" /></button>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}
