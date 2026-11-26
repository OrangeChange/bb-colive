/** Isolated Laplace document protocol. Host owns admission and queue delivery. */
export const LAPLACE_CHANNEL = 'bb-laplace' as const;
export const LAPLACE_BRIDGE_VERSION = 1 as const;
/** Transport safety ceiling, distinct from retention policy and display caps. */
export const LAPLACE_MAX_RENDER_BYTES = 64 * 1024 * 1024;

export interface RendererEvent {
  type: string;
  id: string;
  origin: number;
  originIdx: number;
  timestampNormalized: number;
  [key: string]: unknown;
}
export interface LaplaceRenderMessage {
  channel: typeof LAPLACE_CHANNEL;
  version: typeof LAPLACE_BRIDGE_VERSION;
  type: 'render';
  generation: number;
  sequence: number;
  events: RendererEvent[];
  stickyEvents: RendererEvent[];
  settings: Record<string, unknown>;
  css: { cloud: string; remote: string; custom: string };
  preview: boolean;
  scrollable: boolean;
  followLatest?: boolean;
  giftEffectInteractive?: boolean;
  /** Exact host store-length-difference rate, not an arrival-count approximation. */
  rate: number;
  direction?: 'top' | 'bottom';
  contentAlignment?: 'top' | 'bottom';
  tickerPosition?: 'top' | 'bottom';
  renderMode?: 'dashboard' | 'obs';
  enableBilibiliVideoLinks?: boolean;
  layout?: Array<{ kind: 'source' | 'fallback'; eventId: string }>;
  /** BB source provenance only; never a restored Laplace connection setting. */
  acquisitionMode?: 'direct' | 'open-platform';
  productElements?: { classicScope: boolean };
  animation?: { preset: 'none' | 'fade' | 'lift' | 'scale' | 'slide'; durationMs: number; preferThemeAnimation?: boolean };
  removingEventIds?: string[];
  recalledEventIds?: string[];
  appearance?: { demoBgColor: string; uiHue: number; uiChroma: number };
  dashboardLiveGuards?: Record<string, { roomId: number; guardCount: number }>;
  editorSelection?: { accentColor?: string; partPlacements?: Record<string, readonly ("main"|"sticky"|"detail")[]>; identityPriority?: readonly string[]; readOnly?: boolean; pickEnabled?: boolean; part: string; inspectionRevision: number; scope: { part: string; eventType: string; identity: string; placement: "main"|"sticky"|"detail" }; reveal: boolean; selectors: Record<string, string[]>; focusSelectors: string[]; strictScope: boolean; scheme: "light" | "dark"; properties: Partial<Record<string, readonly string[]>>; scopeSelectors: { eventsByPlacement: Partial<Record<"main"|"sticky"|"detail",Record<string,string>>>; identities: Record<string,string>; placements: Record<string,string> } };
}
export type LaplaceRenderEnvelope = Omit<LaplaceRenderMessage, 'css'> & { css?: LaplaceRenderMessage['css'] };
export function sameLaplaceCss(a: LaplaceRenderMessage['css'] | undefined, b: LaplaceRenderMessage['css']): boolean {
  return Boolean(a && a.cloud === b.cloud && a.remote === b.remote && a.custom === b.custom);
}
const cssByteCache: Partial<Record<keyof LaplaceRenderMessage['css'], { text: string; bytes: number }>> = {};
function fitsRenderBytes(value: Record<string, unknown>, css: LaplaceRenderMessage['css']): boolean {
  try {
    let cssBytes = new TextEncoder().encode('{"cloud":,"remote":,"custom":}').byteLength;
    for (const key of ['cloud', 'remote', 'custom'] as const) {
      let measured = cssByteCache[key];
      if (!measured || measured.text !== css[key]) {
        measured = { text: css[key], bytes: new TextEncoder().encode(JSON.stringify(css[key])).byteLength };
        cssByteCache[key] = measured;
      }
      cssBytes += measured.bytes;
    }
    return new TextEncoder().encode(JSON.stringify({ ...value, css: null })).byteLength - 4 + cssBytes <= LAPLACE_MAX_RENDER_BYTES;
  } catch { return false; }
}
export interface LaplaceRendererReply {
  layoutSupported?: boolean;
  channel: typeof LAPLACE_CHANNEL;
  version: typeof LAPLACE_BRIDGE_VERSION;
  type: 'ready' | 'rendered' | 'error' | 'asset-missing' | 'scroll-state' | 'action' | 'context-menu' | 'pointer-down' | 'editor-picked' | 'editor-inspected';
  generation: number;
  sequence: number;
  following?: boolean;
  message?: string;
  url?: string;
  mode?: 'candidate' | 'reference';
  eventId?: string; action?: unknown; x?: number; y?: number;
  part?: string;
  refresh?: boolean;
  inspectionRevision?: number;
  scope?: { part: string; eventType: string; identity: string; placement: 'main' | 'sticky' | 'detail' };
  computed?: Record<string, { value: string; unit: string; inherited: boolean; mixed?: boolean; controlled?: boolean; applicable?: boolean }>;
  scrollTop?: number; scrollHeight?: number; clientHeight?: number;
  nearStart?: boolean; nearEnd?: boolean; anchorId?: string; anchorOffset?: number; userInitiated?: boolean;
}
export interface LaplaceControlMessage {
  channel: typeof LAPLACE_CHANNEL; version: typeof LAPLACE_BRIDGE_VERSION; type: 'control'; generation: number;
  action: 'locate' | 'scroll-latest' | 'restore-scroll'; eventId?: string; scrollTop?: number; anchorOffset?: number; followingLatest?: boolean;
}
export function isLaplaceControlMessage(value: unknown): value is LaplaceControlMessage {
  if (!record(value) || value.channel !== LAPLACE_CHANNEL || value.version !== 1 || value.type !== 'control') return false;
  if (!Number.isSafeInteger(value.generation) || Number(value.generation) < 0 || !['locate','scroll-latest','restore-scroll'].includes(String(value.action))) return false;
  if (value.action === 'locate' && (typeof value.eventId !== 'string' || value.eventId.length === 0)) return false;
  if (value.action === 'restore-scroll' && value.eventId === undefined && !Number.isFinite(value.scrollTop)) return false;
  if (value.followingLatest !== undefined && typeof value.followingLatest !== 'boolean') return false;
  return Object.keys(value).every(key => ['channel','version','type','generation','action','eventId','scrollTop','anchorOffset','followingLatest'].includes(key));
}

const eventFields = new Set(['type','id','origin','originIdx','timestamp','timestampNormalized','uid','username','avatar','guardType','guardLeader','userType','userLvl','userLvlBorder','currentRank','nameColor','wealthMedalLevel','wealthMedalIcon','medal','read','isMirror','message','messageRaw','hostRepeatCount','emote','bmotes','reply','sendType','phoneVerified','idStr','sign','coinType','giftType','price','priceNormalized','duration','giftAction','giftAmount','giftId','giftName','giftRemain','giftIcon','bizSource','blindGift','receiver','scId','deleted','guardBackground','messageTrans','transMark','toastType','toastTotalCount','toastAmount','toastAmountUnit','toastName','toastAction','toastActionType','toastTotalDays','mockPrice','mvpType','mvpAmount','mvpName','mvpTotalCount','mvpTotalPrice','mvpIcon','mvpRank','icon','rank','action','actionText','operator','blockExpired','vaildPeriod','initial','liveTime','title','areaName','parentAreaName','roomName','muteType','muteSecond','muteLevel','list','award','awards','rewards','rewardName','rewardNum','rewardImage','giftCount','messageToJoin','requireType','requireValue','joinType','joinPrice','lotteryId','redEnvelopeId','priceForStreamer','isCoupon','name','background','backgroundAnimated','backgroundStatic','bgColor','textColor','showWealthMedal','showAvatar','effectId','sourceCommand','rawOpenID','business','parentArea','area','muteBy','muteLength','priceForUsers','giftPrice','giftPriceNormalized','scAmount','scName','toastId','relation','requirement','messageColor','avatarFrame','color','isAudited','rate','terminals']);
const settingFields = new Set(['colorScheme','showUsername','showAvatar','showAvatarFrame','showSystemMessage','showStickyBar','showPhoneNotVerified','showAutoDanmaku','showGiftPriceAbove','showGiftHighlightAbove','showGiftStickyAbove','showGiftFree','showEnterEvent','showEnterEventCurrentGuardOnly','showFollowEvent','showDanmaku','showGift','showSuperChat','showToast','showRedEnvelop','showLottery','showGuardBadge','showSpoiler','showMedal','showMedalLightenedOnly','showWealthMedal','showCurrentRank','showModBadge','limitEventAmount','limitStickyAmount','baseFontSize','sceneName','roomIds']);
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
/** Field pick before postMessage: fixture and BB metadata are never sent wholesale. */
export function pickLaplaceRendererEvent(event: Record<string, unknown>): RendererEvent {
  const picked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(event)) {
    if (eventFields.has(key) && !['sign','idStr'].includes(key) && value !== undefined) picked[key] = structuredClone(value);
  }
  return picked as RendererEvent;
}
function plainData(value: unknown, depth = 0): boolean {
  if (depth > 16) return false;
  if (value == null || typeof value === 'boolean') return true;
  if (typeof value === 'string') return value.length <= 1_000_000;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 20_000 && value.every(item => plainData(item, depth + 1));
  return record(value) && Object.entries(value).every(([key, item]) => !['__proto__','constructor','prototype','token','access_token','auth','authorization','cookie','password','secret','credential','credentials','loginSyncToken'].includes(key) && plainData(item, depth + 1));
}
function fitsBytes(value: unknown, maximum: number): boolean {
  try { return new TextEncoder().encode(JSON.stringify(value)).byteLength <= maximum; } catch { return false; }
}
/** Narrow descriptor-safe extension, shared by envelopes and direct Host props.
 * Inspect descriptors before reading either slot; accessors are never invoked. */
export function hasValidProductElementsSlot(value: object): boolean {
  if (!('productElements' in value)) return true;
  const slot = Object.getOwnPropertyDescriptor(value, 'productElements');
  if (!slot || !slot.enumerable || !('value' in slot) || !record(slot.value)) return false;
  const keys = Reflect.ownKeys(slot.value);
  if (keys.length !== 1 || keys[0] !== 'classicScope') return false;
  const flag = Object.getOwnPropertyDescriptor(slot.value, 'classicScope');
  return Boolean(flag && flag.enumerable && 'value' in flag && typeof flag.value === 'boolean');
}
export function isLaplaceRenderMessage(value: unknown): value is LaplaceRenderMessage {
  return isLaplaceRenderEnvelope(value);
}
export function isLaplaceRenderEnvelope(value: unknown, previousCss?: LaplaceRenderMessage['css']): value is LaplaceRenderEnvelope {
  if (!record(value) || !hasValidProductElementsSlot(value) || value.channel !== LAPLACE_CHANNEL || value.version !== 1 || value.type !== 'render') return false;
  const keys = new Set(['channel','version','type','generation','sequence','events','stickyEvents','settings','css','preview','scrollable','followLatest','giftEffectInteractive','rate','direction','contentAlignment','tickerPosition','renderMode','enableBilibiliVideoLinks','layout','appearance','dashboardLiveGuards','acquisitionMode','productElements','animation','removingEventIds','recalledEventIds','editorSelection']);
  if (Object.keys(value).some(key => !keys.has(key))) return false;
  if (value.acquisitionMode !== undefined && !['direct','open-platform'].includes(String(value.acquisitionMode))) return false;
  if (!Number.isSafeInteger(value.generation) || Number(value.generation) < 0 || !Number.isSafeInteger(value.sequence) || Number(value.sequence) < 0) return false;
  const css = value.css === undefined ? previousCss : value.css;
  if (value.direction !== undefined && value.direction !== 'top' && value.direction !== 'bottom') return false;
  if (value.contentAlignment !== undefined && value.contentAlignment !== 'top' && value.contentAlignment !== 'bottom') return false;
  if (value.tickerPosition !== undefined && value.tickerPosition !== 'top' && value.tickerPosition !== 'bottom') return false;
  if (value.renderMode !== undefined && value.renderMode !== 'dashboard' && value.renderMode !== 'obs') return false;
  if (value.enableBilibiliVideoLinks !== undefined && typeof value.enableBilibiliVideoLinks !== 'boolean') return false;
  if (value.followLatest !== undefined && typeof value.followLatest !== 'boolean') return false;
  if (value.giftEffectInteractive !== undefined && typeof value.giftEffectInteractive !== 'boolean') return false;
  const validEvents = (events: unknown) => Array.isArray(events) && events.length <= 20_000 && events.every(event => record(event) && typeof event.type === 'string' && typeof event.id === 'string' && Number.isFinite(event.origin) && Number.isFinite(event.originIdx) && Number.isFinite(event.timestampNormalized) && Object.keys(event).every(key => eventFields.has(key)) && plainData(event));
  const validLayout = value.layout === undefined || Array.isArray(value.layout) && value.layout.length <= 20_000 && value.layout.every(item => record(item) && Object.keys(item).length === 2 && (item.kind === 'source' || item.kind === 'fallback') && typeof item.eventId === 'string' && item.eventId.length > 0);
  const validAnimation = value.animation === undefined || record(value.animation) && ['none','fade','lift','scale','slide'].includes(String(value.animation.preset)) && Number.isFinite(value.animation.durationMs) && Number(value.animation.durationMs) >= 0 && (value.animation.preferThemeAnimation === undefined || typeof value.animation.preferThemeAnimation === "boolean");
  const validRemoving = value.removingEventIds === undefined || Array.isArray(value.removingEventIds) && value.removingEventIds.length <= 20_000 && value.removingEventIds.every(id => typeof id === 'string');
  const validEditorSelection = value.editorSelection === undefined || record(value.editorSelection) && typeof value.editorSelection.part === 'string' && record(value.editorSelection.scope) && typeof value.editorSelection.scope.part === 'string' && typeof value.editorSelection.scope.eventType === 'string' && typeof value.editorSelection.scope.identity === 'string' && typeof value.editorSelection.scope.placement === 'string' && typeof value.editorSelection.reveal === 'boolean' && record(value.editorSelection.selectors) && Object.values(value.editorSelection.selectors).every(selectors => Array.isArray(selectors) && selectors.every(selector => typeof selector === 'string')) && Array.isArray(value.editorSelection.focusSelectors) && value.editorSelection.focusSelectors.every(selector => typeof selector === 'string');
  if (record(value.editorSelection) && (!Number.isSafeInteger(value.editorSelection.inspectionRevision) || Number(value.editorSelection.inspectionRevision) < 0)) return false;
  if (value.recalledEventIds !== undefined && (!Array.isArray(value.recalledEventIds) || !value.recalledEventIds.every(id => typeof id === 'string'))) return false;
  return validEvents(value.events) && validEvents(value.stickyEvents) && validLayout && validAnimation && validRemoving && validEditorSelection && record(value.settings) && Object.keys(value.settings).every(key => settingFields.has(key)) && plainData(value.settings) && record(css) && ['cloud','remote','custom'].every(key => typeof css[key] === 'string' && css[key].length <= 5_000_000) && Object.keys(css).length === 3 && typeof value.preview === 'boolean' && typeof value.scrollable === 'boolean' && typeof value.rate === 'number' && Number.isFinite(value.rate) && (value.appearance === undefined || (record(value.appearance) && Object.keys(value.appearance).every(key => ['demoBgColor','uiHue','uiChroma'].includes(key)) && typeof value.appearance.demoBgColor === 'string' && value.appearance.demoBgColor.length <= 200 && Number.isFinite(value.appearance.uiHue) && Number.isFinite(value.appearance.uiChroma))) && (value.dashboardLiveGuards === undefined || plainData(value.dashboardLiveGuards)) && fitsRenderBytes(value, css as unknown as LaplaceRenderMessage['css']);
}
export function laplaceConnectionModeClass(acquisitionMode: 'direct' | 'open-platform' | undefined): string {
  return acquisitionMode ? `connection-mode--${acquisitionMode}` : '';
}
export function isLaplaceRendererReply(value: unknown): value is LaplaceRendererReply {
  if (!record(value) || value.channel !== LAPLACE_CHANNEL || value.version !== 1 || !['ready','rendered','error','asset-missing','scroll-state','action','context-menu','pointer-down','editor-picked','editor-inspected'].includes(String(value.type))) return false;
  if (!Number.isSafeInteger(value.generation) || Number(value.generation) < 0 || !Number.isSafeInteger(value.sequence) || Number(value.sequence) < 0) return false;
  if (Object.keys(value).some(key => !['channel','version','type','generation','sequence','following','message','url','mode','eventId','action','x','y','part','scope','computed','layoutSupported','refresh','inspectionRevision','scrollTop','scrollHeight','clientHeight','nearStart','nearEnd','anchorId','anchorOffset','userInitiated'].includes(key))) return false;
  if (value.type === 'editor-picked' && typeof value.part !== 'string') return false;
  if (value.type === 'editor-inspected' && (!record(value.scope) || !record(value.computed))) return false;
  if (value.layoutSupported !== undefined && typeof value.layoutSupported !== 'boolean') return false;
  if (value.refresh !== undefined && typeof value.refresh !== 'boolean') return false;
  if (value.inspectionRevision !== undefined && (!Number.isSafeInteger(value.inspectionRevision) || Number(value.inspectionRevision) < 0)) return false;
  if (value.type === 'scroll-state' && typeof value.following !== 'boolean') return false;
  if (value.following !== undefined && typeof value.following !== 'boolean') return false;
  if (value.type === 'error' && typeof value.message !== 'string') return false;
  if (value.type === 'asset-missing' && typeof value.url !== 'string') return false;
  if (value.message !== undefined && (typeof value.message !== 'string' || value.message.length > 8000)) return false;
  if (value.url !== undefined && (typeof value.url !== 'string' || value.url.length > 4096)) return false;
  if (value.mode !== undefined && !['candidate','reference'].includes(String(value.mode))) return false;
  return plainData(value) && fitsBytes(value,16 * 1024);
}
