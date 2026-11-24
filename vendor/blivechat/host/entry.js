import { COMPATIBLE_RECALL_CSS, reconcileCompatibleRecall } from '../../../public/compatibleEventStatus.mjs';
import { pickPreviewEditorPart, installPreviewEditorHover } from '../../../public/previewEditorHit.mjs';
import { inspectEditorProperty } from '../../../src/compat/editorPropertyInspection.mjs';
import { createPreviewWindow, markPreviewEditorSelection, previewEditorIdentity, previewEditorSelectionNeedsScroll } from "../../../public/previewWindow.mjs";
import { composeCompatibleCssLayers } from 'bb-css-layer';
import { EVENT_TRANSITION_CSS, applyEventTransition } from '../../../public/eventTransitions.mjs';
import { observePreviewRuntime,applyPreviewPresentation } from "../../../public/previewCapture.mjs";
import Vue from 'vue';
import ElementUI from 'element-ui';
import 'element-ui/lib/theme-chalk/index.css';
import { createBlivechatSimulation } from '../../../public/blivechatSimulation.mjs';
import { bindSimulationIdentity } from '../../../public/previewSimulationIdentity.mjs';
import ChatRenderer from '../upstream/frontend/src/components/ChatRenderer/index.vue';
import Ticker from '../upstream/frontend/src/components/ChatRenderer/Ticker.vue';
import { getGiftShowContent } from '../upstream/frontend/src/components/ChatRenderer/constants';
import { i18n, setLocale } from './i18n';
import { BlivechatRuntime, DEFAULT_CONFIG, RETENTION, isPinned } from '../../../src/compat/blivechat/runtime/core.mjs';
import { readNativeTextFilterFacts } from '../../../src/nativeTextFilterFacts.mjs';
import { TEXT_OPERATION, attachTextOperation, checkNativeTextConfig } from '../../../src/compat/blivechat/runtime/nativeText.mjs';
import { resolveContentParts, resourceUrl } from './images';
import { prepareBlivechatPreviewRecord } from '../../../src/compat/blivechat/previewRecords.mjs';
import './document.css';

// The upstream app installs the complete Element UI plugin.  Registering
// only Badge/Scrollbar leaves el-tooltip as an unknown custom element, which
// changes author-badge DOM and ordinary message row geometry.
Vue.use(ElementUI); Vue.config.productionTip = false;
Vue.config.ignoredElements = [/^yt-/];
const TYPE = 'bb-blivechat';
const parentOrigin = window.location.origin;
const post = (command, data) => { if (window.parent !== window) window.parent.postMessage({ type: TYPE, command, data }, parentOrigin); };
let customCss = '', appearanceCss = '', presetCss = '', presetState = 'unloaded', presetPromise = null, presetIsInline = false, templateFrame = null, templateConnected = false, templateReady = false, templateTimeout = null, reconfiguring = false;
let lastPublicConfigKey = '';
let templateGeneration = 0, runtime, hydrationGeneration = 0, hydrating = false, hydrationTail = [], hydrationTailBytes = 0;
let previewObserving = false;
let inFlightText = [];
let hostOptions = { scale: 1, tickerEnabled: true, enableBilibiliVideoLinks: false, direction: 'bottom', managed: false };
let presentation = { layout: [], stickyRecords: [], direction: 'bottom', position: 'top', animation: { preset: 'none', durationMs: 0 } };
let softwarePaidMessages = [];
const originalAdd = ChatRenderer.methods.handleAddMessage;
const originalScrollToBottom = ChatRenderer.methods.scrollToBottom;
const originalOnScroll = ChatRenderer.methods.onScroll;
const originalTickerUpdateProgress = Ticker.methods.updateProgress;
const originalTickerNeedToShow = Ticker.methods.needToShow;
const originalTickerGetPinTime = Ticker.methods.getPinTime;
const HostTicker = { ...Ticker, methods: { ...Ticker.methods,
  needToShow(message) { return Number.isFinite(message.bbHostExpiresAt) ? Date.now() < message.bbHostExpiresAt : originalTickerNeedToShow.call(this, message); },
  getPinTime(message) { return Number.isFinite(message.bbHostExpiresAt) && Number.isFinite(message.bbHostStartedAt)
    ? Math.max(1 / 60000, (message.bbHostExpiresAt - message.bbHostStartedAt) / 60000)
    : originalTickerGetPinTime.call(this, message); },
  updateProgress() {
    if (!this.messages.some(message => Number.isFinite(message.bbHostExpiresAt))) return originalTickerUpdateProgress.call(this);
    this.curTime = new Date();
    const filtered = this.messages.filter(message => !Number.isFinite(message.bbHostExpiresAt) || +this.curTime < message.bbHostExpiresAt);
    if (this.pinnedMessage && !filtered.some(message => message.id === this.pinnedMessage.id)) this.pinnedMessage = null;
    if (filtered.length !== this.messages.length) {
      softwarePaidMessages = filtered.slice();
      this.$emit('update:messages', filtered.slice());
    }
  },
} };
const managedFlushes = new WeakMap();
const OriginalRenderer = { ...ChatRenderer,
  components: { ...ChatRenderer.components, Ticker: HostTicker },
  props: { ...ChatRenderer.props, mainGiftDescription: { type: Boolean, default: false } },
  // Native capacity trimming can yield before appending its buffer.
  beforeUpdate() { syncManagedMessageOrder(this); },
  methods: { ...ChatRenderer.methods,
  enqueueMessages(messages) {
    if (hostOptions.managed) return this.handleMessageGroup(messages);
    return ChatRenderer.methods.enqueueMessages.call(this, messages);
  },
  // The public setting controls only the main list; preserve the original ticker default.
  getGiftShowContent(message) { return getGiftShowContent(message, this.mainGiftDescription); },
  flushMessagesBuffer() {
    const flush = () => {
      const result = ChatRenderer.methods.flushMessagesBuffer.call(this);
      syncManagedMessageOrder(this);
      if (!runtime?.config.hostNativeTextFilter) return result;
      const session = runtime.session;
      return Promise.resolve(result).then(() => { if (session === runtime.session) runtime.observeTextLanes(); });
    };
    if (!hostOptions.managed) return flush();
    const pending = managedFlushes.get(this);
    if (pending) return pending;
    const result = (async () => {
      do {
        const current = new Set(presentation.layout.filter(item => item.kind === 'source').map(item => item.eventId));
        const messages = this.messages.filter(message => current.has(message.id));
        if (messages.length !== this.messages.length) {
          this.messages = messages;
          // Commit removals before additions so Vue keeps retained rows in place.
          await this.$nextTick();
        }
        await flush();
      } while (hostOptions.managed && this.messagesBuffer.length && this.canScrollToBottomOrTimedOut());
    })().finally(() => managedFlushes.delete(this));
    managedFlushes.set(this, result);
    return result;
  },
  handleMessageGroup(messages) {
    const previous = inFlightText;
    inFlightText = messages;
    try { return ChatRenderer.methods.handleMessageGroup.call(this, messages); }
    finally {
      for (const message of messages) if (message[TEXT_OPERATION]) runtime.finishTextOperation(message[TEXT_OPERATION]);
      inFlightText = previous;
    }
  },
  handleUpdateMessage(message) {
    if (message[TEXT_OPERATION]) { runtime.consumeTextOperation(message[TEXT_OPERATION]); return; }
    return ChatRenderer.methods.handleUpdateMessage.call(this, message);
  },
  handleAddMessage(message) {
    if (message[TEXT_OPERATION]) { runtime.consumeTextOperation(message[TEXT_OPERATION]); return; }
    const record = runtime.getRecord(message.id);
    const preservedTime = record?.preserveClock ? record.firstPresentedAt : undefined;
    if (runtime.config.hostEventFilter) {
      // A queued add must not revive a deletion received before queue delivery.
      if (message.type === 3 && (runtime.tombstoneOverflow || runtime.tombstones.has(message.id))) return;
      if (!runtime.isCategoryVisible(message)) {
        message.addTime = new Date(preservedTime ?? Date.now());
        runtime.markPresented(message.id, +message.addTime);
        return;
      }
    }
    const admission = hostOptions.managed ? Object.create(this) : this;
    if (hostOptions.managed) Object.defineProperty(admission, 'paidMessages', { value: [] });
    originalAdd.call(admission, message);
    // Main-list admission is separate from original ticker admission.
    const current = runtime.projectedById.get(message.id) || message;
    if (!runtime.isMainVisible(current)) this.messagesBuffer = this.messagesBuffer.filter(item => item.id !== message.id);
    if (preservedTime !== undefined) {
      message.addTime = new Date(preservedTime);
      const paid = this.paidMessages.find(item => item.id === message.id);
      if (paid) paid.addTime = new Date(preservedTime);
    }
    runtime.markPresented(message.id, +message.addTime);
  },
  // Product-hosted documents own reading intent; never resume following merely
  // because the upstream five-second timeout elapsed.
  canScrollToBottomOrTimedOut() { return previewObserving || this.atBottom === true; },
  showNewMessages() {
    if (previewObserving && !this.atBottom) { this.resetSmoothScroll(); this.maybeResizeScrollContainer(); return; }
    return ChatRenderer.methods.showNewMessages.call(this);
  },
  scrollToBottom() {
    if (previewObserving && !this.atBottom) return;
    if (hostOptions.managed && hostOptions.direction === 'top') {
      const scroller = document.getElementById('item-scroller');
      if (scroller) scroller.scrollTop = 0;
      this.atBottom = true;
      return;
    }
    return originalScrollToBottom.call(this);
  },
  onScroll(...args) {
    if (hostOptions.managed && hostOptions.direction === 'top') {
      const scroller = document.getElementById('item-scroller');
      this.atBottom = !!scroller && scroller.scrollTop < 15;
      this.flushMessagesBuffer();
      return;
    }
    return originalOnScroll.apply(this, args);
  },
} };
function presentationOrderedMessages(messages) {
  const order = new Map(presentation.layout.filter(item => item.kind === 'source').map((item, index) => [item.eventId, index]));
  return messages.slice().sort((left, right) => (order.get(left.id) ?? order.size) - (order.get(right.id) ?? order.size));
}
function syncManagedMessageOrder(renderer) {
  if (!hostOptions.managed) return;
  const messages = presentationOrderedMessages(renderer.messages);
  if (messages.some((message, index) => message !== renderer.messages[index])) renderer.messages = messages;
}
const app = new Vue({ i18n, data: () => ({ config: {}, useTemplate: false }),
  render(h) { return this.useTemplate ? h('div', { class: 'bb-template-container', ref: 'templateContainer' }) : h(OriginalRenderer, {
    ref: 'renderer', props: { maxNumber: this.config.maxNumber, showGiftName: false, mainGiftDescription: this.config.showGiftName },
  }); },
}).$mount('#app');
const appearanceStyle = document.createElement('style'); appearanceStyle.id = 'bb-blivechat-appearance-css';
const userStyle = document.createElement('style'); userStyle.id = 'bb-blivechat-custom-css';
const presetStyle = document.createElement('style'); presetStyle.id = 'bb-blivechat-preset-css';
document.head.append(appearanceStyle, userStyle, presetStyle);
const hostStyle = document.createElement('style'); hostStyle.id = 'bb-blivechat-host-css'; document.head.append(hostStyle);
let syncingPresentation = false;
const presentedRows = new WeakSet();
let fallbackSlotSignature = null;
let userScrollIntent = false;
let pointerScrollIntent = false;
function blcKind(message) { return message?.type === 0 ? 'danmaku' : message?.type === 1 ? 'gift' : message?.type === 2 ? 'membership' : message?.type === 3 ? 'superchat' : 'unknown'; }
function bindStableIds(rows, messages, placement = 'main') {
  const used = new Set(rows.map(row => row.dataset.compatibleEventId).filter(Boolean));
  const available = messages.filter(message => message?.id && !used.has(message.id));
  for (const row of rows) if (!row.dataset.compatibleEventId && available.length) { const message = available.shift(); row.dataset.compatibleEventId = message.id; row.dataset.blcKind = blcKind(message); row.dataset.blcPlacement = placement; if (message.type === 1) row.dataset.blcGiftKind = 'normal'; }
}
function syncActionIds() {
  const doc = window.document; if (!doc) return;
  const renderer = app.$refs.renderer; if (!renderer) return;
  const rows = [...doc.querySelectorAll('#items.style-scope.yt-live-chat-item-list-renderer > *')];
  bindStableIds(rows, renderer.messages, 'main');
  const tickerRows = [...doc.querySelectorAll('yt-live-chat-ticker-renderer yt-live-chat-ticker-paid-message-item-renderer')];
  const ticker = renderer.$children.find(child => child.$options.name === 'Ticker');
  bindStableIds(tickerRows, ticker?.showMessages?.map(message => message.raw) || [], 'sticky');
  const pinned = doc.querySelector('yt-live-chat-ticker-renderer > yt-live-chat-paid-message-renderer,yt-live-chat-ticker-renderer > yt-live-chat-membership-item-renderer');
  if (pinned && ticker?.pinnedMessage) { pinned.dataset.compatibleEventId = ticker.pinnedMessage.id; pinned.dataset.blcKind = blcKind(ticker.pinnedMessage); pinned.dataset.blcPlacement = 'detail'; }
  const recalled = new Set(presentation.layout.filter(item => item.recalled).map(item => item.eventId));
  for (const row of rows) reconcileCompatibleRecall(row, recalled.has(row.dataset.compatibleEventId));
  syncPresentation();
  if (editorSelection) applyEditorSelection(editorSelection, true);
}
const actionObserver = new MutationObserver(syncActionIds); actionObserver.observe(document.body, { childList: true, subtree: true });
function actionRow(target) { return target.closest?.('[data-compatible-event-id]'); }
function bilibiliVideoHref(target) {
  const message = target.closest?.('#message');
  if (!message || !message.contains(target)) return null;
  const match = String(target.textContent || '').match(/(?:^|[^0-9A-Za-z])((?:av\d+|bv[0-9A-Za-z]{10}))(?![0-9A-Za-z])/i);
  if (!match) return null;
  const value = match[1];
  const id = value.slice(0, 2).toLowerCase() === 'av' ? `av${value.slice(2)}` : `BV${value.slice(2)}`;
  return `https://www.bilibili.com/video/${id}`;
}
document.addEventListener('click', event => {
  const row = actionRow(event.target); if (!row) return;
  const link = event.target.closest?.('a[href]'); if (link && hostOptions.enableBilibiliVideoLinks) { event.preventDefault(); post('action', { eventId: row.dataset.compatibleEventId, action: { type: 'open-link', href: link.href } }); return; }
  const videoHref = hostOptions.enableBilibiliVideoLinks && bilibiliVideoHref(event.target);
  if (videoHref) { event.preventDefault(); post('action', { eventId: row.dataset.compatibleEventId, action: { type: 'open-link', href: videoHref } }); return; }
  if (event.target.closest?.('#author-name')) post('action', { eventId: row.dataset.compatibleEventId, action: 'filter-user' });
});
document.addEventListener('contextmenu', event => {
  const row = actionRow(event.target); if (!row) return;
  event.preventDefault();
  const eventId = row.dataset.compatibleEventId;
  post('context-menu', { eventId, x: event.clientX, y: event.clientY });
});
document.addEventListener('pointerdown', event => {
  if (event.button === 2) return;
  post('pointer-down', {});
}, true);
function moveLegacyPresentationRow(items, node, next) {
  const animations = presentedRows.has(node) ? node.getAnimations({ subtree: true })
    .filter(animation => animation instanceof CSSAnimation)
    .map(animation => ({ target: animation.effect.target, pseudo: animation.effect.pseudoElement,
      name: animation.animationName, time: animation.currentTime, paused: animation.playState === 'paused' })) : null;
  items.insertBefore(node, next);
  if (!animations) return;
  for (const animation of node.getAnimations({ subtree: true })) {
    if (!(animation instanceof CSSAnimation)) continue;
    const index = animations.findIndex(previous => previous.target === animation.effect.target
      && previous.pseudo === animation.effect.pseudoElement && previous.name === animation.animationName);
    // Finished non-filling entries are absent from the pre-move animation list.
    if (index < 0) { animation.cancel(); continue; }
    const [previous] = animations.splice(index, 1);
    animation.currentTime = previous.time;
    if (previous.paused) animation.pause();
  }
}
function syncPresentation() {
  if (syncingPresentation) return;
  const items = document.querySelector('#items.style-scope.yt-live-chat-item-list-renderer');
  if (!items) return;
  syncingPresentation = true;
  try {
    const sourceRows = new Map([...items.children].filter(node => node.dataset.compatibleEventId).map(node => [node.dataset.compatibleEventId, node]));
    const wantedFallback = new Set();
    const desired = [];
    for (const item of presentation.layout) {
      let node;
      if (item.kind === 'fallback') {
        wantedFallback.add(item.eventId);
        node = [...items.querySelectorAll('[data-compatible-fallback-id]')].find(value => value.dataset.compatibleFallbackId === item.eventId);
        if (!node) { node = document.createElement('div'); node.className = 'bb-compatible-fallback-slot'; node.dataset.compatibleFallbackId = item.eventId; node.dataset.compatibleEventId = item.eventId; }
      } else node = sourceRows.get(item.eventId);
      if (node) {
        node.dataset.compatibleEventRemoving = item.removing === true ? 'true' : 'false';
        applyEventTransition(node, presentation.animation, item.removing === true);
        desired.push(node);
      }
    }
    if (!hostOptions.managed && presentation.contentAlignment) {
      const messages = app.$refs.renderer.messages.slice();
      if (hostOptions.direction === "top") messages.reverse();
      for (const message of messages) {
        const node = sourceRows.get(message.id);
        if (node && !desired.includes(node)) desired.push(node);
      }
    }
    for (const node of items.querySelectorAll('[data-compatible-fallback-id]')) if (!wantedFallback.has(node.dataset.compatibleFallbackId)) node.remove();
    const current = [...items.children].filter(node => desired.includes(node));
    if (current.length !== desired.length || current.some((node, index) => node !== desired[index])) {
      // Move only necessary rows and preserve their animation progress.
      let previous = null;
      for (const node of desired) {
        const next = previous ? previous.nextSibling : items.firstChild;
        if (node !== next) {
          if (node.parentNode === items && items.moveBefore) items.moveBefore(node, next);
          else moveLegacyPresentationRow(items, node, next);
        }
        previous = node;
      }
    }
    const entering = desired.filter(node => !presentedRows.has(node));
    if (entering.length) requestAnimationFrame(() => requestAnimationFrame(() => {
      for (const node of entering) presentedRows.add(node);
    }));
    const signature = [...wantedFallback].join('\n');
    if (signature !== fallbackSlotSignature) { fallbackSlotSignature = signature; post('fallback-slots-ready', { ids: [...wantedFallback] }); }
  } finally { syncingPresentation = false; }
}
function postScrollState(userInitiated = false) {
  const scroller = document.getElementById('item-scroller'); if (!scroller) return;
  const followingLatest = hostOptions.direction === 'top' ? scroller.scrollTop <= 4 : scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= 4;
  const rows = [...document.querySelectorAll('#items.style-scope.yt-live-chat-item-list-renderer > [data-compatible-event-id]')];
  const first = rows.find(row => row.getBoundingClientRect().bottom > scroller.getBoundingClientRect().top);
  post('scroll-state', { userInitiated, followingLatest, scrollTop: scroller.scrollTop, scrollHeight: scroller.scrollHeight, clientHeight: scroller.clientHeight, anchorId: first?.dataset.compatibleEventId, anchorOffset: first ? first.getBoundingClientRect().top - scroller.getBoundingClientRect().top : 0, nearStart: scroller.scrollTop <= 80, nearEnd: scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= 80 });
}
const itemScroller = document.getElementById('item-scroller');
const tickerScroller = document.querySelector('yt-live-chat-ticker-renderer .el-scrollbar__wrap');
function scrollTickerWithWheel(event, scroller) {
  // Block Element UI's own wheel handler before it can cancel boundary events.
  // We only cancel the browser event when this renderer actually moves horizontally.
  event.stopImmediatePropagation();
  const max = scroller.scrollWidth - scroller.clientWidth;
  if (max <= 1) return;
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (!delta) return;
  const current = scroller.scrollLeft;
  if ((delta > 0 && current >= max - 1) || (delta < 0 && current <= 1)) return;
  const next = Math.max(0, Math.min(max, current + delta));
  if (next === current) return;
  scroller.scrollLeft = next;
  event.preventDefault();
}
document.addEventListener('wheel', event => {
  const target = event.target instanceof Element ? event.target.closest('yt-live-chat-ticker-renderer .el-scrollbar__wrap') : null;
  if (target === tickerScroller) scrollTickerWithWheel(event, tickerScroller);
}, { passive: false, capture: true });
function syncListContentWidth() {
  const width = itemScroller?.clientWidth;
  if (width > 0) document.documentElement.style.setProperty('--bb-list-content-width', `${width}px`);
}
const listContentResizeObserver = itemScroller && typeof ResizeObserver === 'function' ? new ResizeObserver(syncListContentWidth) : null;
listContentResizeObserver?.observe(itemScroller);
const itemContent = document.querySelector('#items.style-scope.yt-live-chat-item-list-renderer');
const itemContentResizeObserver = itemContent && typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
  if (hostOptions.managed) app.$refs.renderer?.maybeResizeScrollContainer();
}) : null;
itemContentResizeObserver?.observe(itemContent);
window.addEventListener('resize', syncListContentWidth);
requestAnimationFrame(syncListContentWidth);
itemScroller?.addEventListener('wheel', event => {
  userScrollIntent = true;
  if (previewObserving && event.deltaY < 0 && itemScroller.scrollHeight > itemScroller.clientHeight + 1) {
    app.$refs.renderer.atBottom = false;
    app.$refs.renderer.resetSmoothScroll();
  }
}, { passive: true });
itemScroller?.addEventListener('keydown', event => { if (['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key)) userScrollIntent = true; });
itemScroller?.addEventListener('pointerdown', () => { pointerScrollIntent = true; });
document.addEventListener('pointerup', () => { pointerScrollIntent = false; });
itemScroller?.addEventListener('scroll', () => {
  const userInitiated = pointerScrollIntent || userScrollIntent;
  if (!pointerScrollIntent) userScrollIntent = false;
  postScrollState(userInitiated);
});
function updateHostStyle() {
  const hidden = hostOptions.tickerEnabled ? '' : 'yt-live-chat-ticker-renderer{display:none!important}';
  const placement = presentation.position === 'bottom'
    ? 'yt-live-chat-renderer{display:flex!important;flex-direction:column!important}yt-live-chat-item-list-renderer{flex:1 1 auto!important;min-height:0!important}yt-live-chat-ticker-renderer{order:2!important;flex:none!important}'
    : '';
  const animation = EVENT_TRANSITION_CSS;
  const alignment = (hostOptions.managed || presentation.contentAlignment) ? `#item-scroller.yt-live-chat-item-list-renderer{display:flex!important;flex-direction:column!important;justify-content:flex-start!important}#item-offset.yt-live-chat-item-list-renderer{height:auto!important;min-height:0!important;flex:none!important;margin-top:${presentation.contentAlignment === 'bottom' ? 'auto' : '0'}!important}#item-scroller.animated.yt-live-chat-item-list-renderer #items.yt-live-chat-item-list-renderer{position:relative!important;inset:auto!important;flex:none!important}` : '';
  const css = `${hidden}${placement}${animation}${alignment}${COMPATIBLE_RECALL_CSS}`;
  if (hostStyle.textContent !== css) hostStyle.textContent = css;
  document.documentElement.dataset.tickerPosition = presentation.position;
  const ticker = document.querySelector('yt-live-chat-ticker-renderer'); if (ticker) ticker.hidden = !hostOptions.tickerEnabled || !ticker.__vue__?.showMessages?.length;
}
app.$watch(() => app.$refs.renderer.paidMessages, () => Vue.nextTick(updateHostStyle), { deep: true });
function applyHostOptions(data) {
  if (!data || typeof data !== 'object') throw new Error('宿主显示设置无效');
  const scale = Number(data.scale);
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('宿主显示缩放无效');
  hostOptions = { scale, tickerEnabled: data.tickerEnabled !== false, enableBilibiliVideoLinks: data.enableBilibiliVideoLinks === true, direction: data.direction === 'top' ? 'top' : 'bottom', managed: data.managed === true };
  runtime.retention = { ...runtime.retention, ttlMs: hostOptions.managed ? Infinity : RETENTION.ttlMs };
  if (hostOptions.managed) itemScroller?.setAttribute("tabindex", "0");
  if (data.contentAlignment) presentation.contentAlignment = data.contentAlignment === 'bottom' ? 'bottom' : 'top';
  document.documentElement.style.setProperty('--bb-host-scale', String(scale));
  document.body.style.zoom = String(scale);
  document.body.dataset.bbHostRenderMode = data.renderMode === "dashboard" ? "dashboard" : "output";
  updateHostStyle();
  syncPresentation();
  postScrollState();
}
function locateEvent(eventId) {
  const row = [...document.querySelectorAll('[data-compatible-event-id]')].find(node => node.dataset.compatibleEventId === eventId);
  if (!row) { post('located', { eventId, found: false }); return; }
  document.querySelectorAll('[data-compatible-located]').forEach(node => node.removeAttribute('data-compatible-located'));
  row.setAttribute('data-compatible-located', ''); row.scrollIntoView?.({ block: 'center' });
  post('located', { eventId, found: true }); postScrollState();
}
async function applyPresentation(data) {
  if (!data || !Array.isArray(data.layout) || !Array.isArray(data.stickyRecords)) throw new Error('来源呈现窗口无效');
  const preset = ['none','fade','lift','scale','slide'].includes(data.animation?.preset) ? data.animation.preset : 'none';
  const durationMs = Number.isFinite(data.animation?.durationMs) ? Math.max(0, data.animation.durationMs) : 0;
  presentation = { layout: data.layout.filter(item => item && typeof item.eventId === 'string' && (item.kind === 'source' || item.kind === 'fallback')).map(item => ({ ...item, removing: item.removing === true, recalled: item.recalled === true })), stickyRecords: data.stickyRecords.filter(item => item?.record && Number.isFinite(item.startedAt) && Number.isFinite(item.expiresAt)), direction: data.direction === 'top' ? 'top' : 'bottom', contentAlignment: data.contentAlignment === 'bottom' ? 'bottom' : 'top', position: data.position === 'bottom' ? 'bottom' : 'top', animation: { preset, durationMs } };
  fallbackSlotSignature = null;
  hostOptions.direction = presentation.direction;
  softwarePaidMessages = presentation.stickyRecords.flatMap(item => {
    const projector = new BlivechatRuntime({ translate: key => i18n.t(key), resolveParts: resolveContentParts });
    projector.setConfig({ minGiftPrice: 0, mergeGift: false, mergeSimilarDanmaku: false, maxNumber: 1 });
    projector.receive({ ...normalizeInput(item.record), replay: true, receivedAt: item.startedAt });
    const message = projector.projected[0];
    return message ? [{ ...message, addTime: new Date(item.startedAt), bbHostStartedAt: item.startedAt, bbHostExpiresAt: item.expiresAt }] : [];
  });
  const renderer = app.$refs.renderer;
  if (renderer) {
    const ticker = renderer.$children.find(child => child.$options.name === 'Ticker');
    const pinnedId = ticker?.pinnedMessage?.id;
    renderer.paidMessages = softwarePaidMessages.slice();
    if (ticker) ticker.pinnedMessage = softwarePaidMessages.find(message => message.id === pinnedId) || null;
    const main = new Set(presentation.layout.filter(item => item.kind === 'source').map(item => item.eventId));
    const filtered = (previewWindow.active ? runtime.snapshot().messages : renderer.messages).filter(message => main.has(message.id));
    const messages = hostOptions.managed ? presentationOrderedMessages(filtered) : filtered;
    if (!hostOptions.managed || messages.length !== renderer.messages.length || messages.some((message, index) => message !== renderer.messages[index])) renderer.messages = messages;
  }
  updateHostStyle();
  await Vue.nextTick(); syncActionIds(); syncPresentation();
  if (hostOptions.managed) renderer.maybeResizeScrollContainer();
  postScrollState(); post('presented', { records: presentation.layout.length });
}
const presetUrl = new URL('/custom_public/preset.css', location.href).href;
async function loadPreset() {
  if (presetState === 'loaded') return;
  if (presetPromise) return presetPromise;
  presetPromise = fetch(presetUrl, { credentials: 'same-origin' }).then(response => {
    if (!response.ok) throw new Error('此安装尚未提供 /custom_public/preset.css；请添加预设 CSS 文件后重试。');
    return response.text();
  }).then(css => {
    presetCss = css.replace(/url\((['"]?)([^)'"\s]+)\1\)/g, (all, quote, url) => `url(${quote}${new URL(url, presetUrl).href}${quote})`)
      .replace(/(@import\s+)(['"])([^'"]+)\2/gi, (all, prefix, quote, url) => `${prefix}${quote}${new URL(url, presetUrl).href}${quote}`);
    presetState = 'loaded'; updateCss();
  })
    .catch(error => { presetState = 'missing'; post('error', { code: 'preset-unavailable', message: error.message }); })
    .finally(() => { presetPromise = null; });
  return presetPromise;
}
function updateCss() {
  const usePreset = !runtime.config.templateUrl && runtime.config.importPresetCss;
  const preset = usePreset && presetState === 'loaded' ? composeCompatibleCssLayers([[presetCss, 'default']]) : '';
  const appearance = runtime.config.templateUrl ? '' : composeCompatibleCssLayers([[appearanceCss, 'config']]);
  const user = runtime.config.templateUrl ? '' : composeCompatibleCssLayers([[customCss, 'custom']]);
  if (presetStyle.textContent !== preset) presetStyle.textContent = preset;
  if (appearanceStyle.textContent !== appearance) appearanceStyle.textContent = appearance;
  if (userStyle.textContent !== user) userStyle.textContent = user;
}

function templatePost(type, data) { if (templateFrame && templateConnected) templateFrame.contentWindow.postMessage({ type, data }, '*'); }
function disposeTemplate() {
  clearTimeout(templateTimeout); templateTimeout = null;
  templateConnected = false; templateReady = false;
  if (templateFrame) templateFrame.remove(); templateFrame = null;
}
function snapshotToTemplate() {
  const snapshot = runtime.snapshot();
  const visibleIds = new Set(snapshot.messages.map(message => message.id));
  const activeOutsideCap = snapshot.paidMessages.filter(message => !visibleIds.has(message.id)).reverse();
  for (const message of activeOutsideCap.concat(snapshot.messages)) templatePost('blcAddMsg', message);
}
async function remountTemplate() {
  const generation = ++templateGeneration;
  disposeTemplate();
  app.useTemplate = !!runtime.config.templateUrl;
  document.body.style.backgroundColor = app.useTemplate ? 'transparent' : '';
  await Vue.nextTick();
  if (generation !== templateGeneration) return;
  if (!app.useTemplate) { runtime.rebuild(); return; }
  const frame = document.createElement('iframe');
  frame.className = 'bb-template-frame'; frame.title = 'blivechat 自定义模板';
  frame.setAttribute('sandbox', 'allow-scripts'); frame.referrerPolicy = 'no-referrer';
  frame.src = runtime.config.templateUrl; templateFrame = frame;
  app.$refs.templateContainer.appendChild(frame);
  templateTimeout = setTimeout(() => post('error', { code: 'template-timeout', message: '模板未在 10 秒内完成 blcsdk 连接。请检查地址、SDK 或站点嵌入限制。' }), 10000);
}
function originalMerge(method, args, member) {
  const renderer = app.$refs.renderer; if (!renderer) return null;
  const originalUpdate = renderer.updateMessage, originalEnqueue = renderer.enqueueMessages; let mergedId = null;
  renderer.updateMessage = (id, values) => {
    mergedId = id;
    if (member) {
      const token = runtime.bindTextMerge(member, id);
      // Annotate the actual object created by original updateMessage, immediately
      // before original enqueueMessages groups it. Never invent a control packet.
      renderer.enqueueMessages = messages => {
        for (const message of messages) attachTextOperation(message, token);
        return originalEnqueue.call(renderer, messages);
      };
    }
    return originalUpdate.call(renderer, id, values);
  };
  try { renderer[method](...args); }
  finally { renderer.updateMessage = originalUpdate; renderer.enqueueMessages = originalEnqueue; }
  return mergedId;
}
const sink = {
  getLiveIds() {
    const renderer = app.$refs.renderer; if (!renderer) return null;
    const messages = [...renderer.messages, ...renderer.messagesBuffer, ...renderer.paidMessages, ...renderer.smoothedMessageQueue.flat(), ...inFlightText];
    const ids = new Set(messages.filter(message => message.type < 4).map(message => message.id));
    for (const message of messages) {
      const record = runtime.getTextOperationRecord(message[TEXT_OPERATION]);
      if (record) ids.add(record.id);
    }
    ids.textGroups = new Set([...ids].map(id => runtime.getRecord(id)?.text?.group).filter(group => group !== undefined && group !== null));
    return ids;
  },
  mergeSimilarText: (content, member) => originalMerge('mergeSimilarText', [content], member),
  mergeSimilarGift: (...args) => originalMerge('mergeSimilarGift', args),
  addMessage(message, token) {
    if (token) attachTextOperation(message, token);
    if (runtime.config.templateUrl) { if (templateReady && runtime.isCategoryVisible(message)) templatePost('blcAddMsg', message); }
    else app.$refs.renderer?.addMessage(message);
  },
  delMessages(ids) {
    if (runtime.config.templateUrl) { if (templateReady) templatePost('blcDelMsgs', { ids }); }
    else app.$refs.renderer?.delMessages(ids);
  },
  setMainVisibility(id, visible, message) {
    const renderer = app.$refs.renderer;
    if (!renderer) return;
    const present = renderer.messages.some(item => item.id === id) || renderer.messagesBuffer.some(item => item.id === id);
    const queued = renderer.smoothedMessageQueue.flat().some(item => item.id === id && item.type < 4);
    if (!visible) {
      renderer.messages = renderer.messages.filter(item => item.id !== id);
      renderer.messagesBuffer = renderer.messagesBuffer.filter(item => item.id !== id);
    } else if (!present && !queued) {
      // Crossing the threshold restores the same row/clock, not a new paid event.
      renderer.messagesBuffer.push(message);
      renderer.flushMessagesBuffer();
    }
    Vue.nextTick(() => { renderer.maybeResizeScrollContainer(); renderer.maybeScrollToBottom(); });
  },
  updateMessage(id, newValuesObj) {
    if (runtime.config.templateUrl) { if (templateReady) templatePost('blcUpdateMsg', { id, newValuesObj }); }
    else app.$refs.renderer?.updateMessage(id, newValuesObj);
  },
  readTextLanes() {
    const renderer = app.$refs.renderer;
    return renderer ? { main: renderer.messages, buffer: renderer.messagesBuffer, queue: renderer.smoothedMessageQueue.flat() }
      : { main: [], buffer: [], queue: [] };
  },
  findNativeTextGroup(content, lanes) {
    let target = null;
    // Execute the deployed Vue method with a read-only receiver. The same source
    // iterator supplies control barriers and its exact recent-five semantics.
    const receiver = {
      smoothedMessageQueue: [lanes.queue], messagesBuffer: lanes.buffer, messages: lanes.main,
      iterMessageArrs: ChatRenderer.methods.iterMessageArrs,
      iterRecentMessages: ChatRenderer.methods.iterRecentMessages,
      isAddMessage: ChatRenderer.methods.isAddMessage,
      updateMessage(id) { target = id; },
    };
    ChatRenderer.methods.mergeSimilarText.call(receiver, content);
    return target;
  },
  applyNativeText(plan) {
    const renderer = app.$refs.renderer; if (!renderer || runtime.config.templateUrl) return;
    renderer.messages.splice(0, renderer.messages.length, ...plan.main);
    renderer.messagesBuffer.splice(0, renderer.messagesBuffer.length, ...plan.buffer);
    runtime.observeTextLanes();
  },
  planPrivateReconcile(previous, next, textPlan) {
    const renderer = app.$refs.renderer; if (!renderer || next.templateUrl) return null;
    const projected = textPlan?.projected || runtime.projected;
    let main = textPlan?.main || renderer.messages;
    let buffer = textPlan?.buffer || renderer.messagesBuffer;
    let paid = renderer.paidMessages;
    const categoryChanged = next.hostEventFilter && (previous.hostShowGuard !== next.hostShowGuard || previous.hostShowSuperChat !== next.hostShowSuperChat);
    if (categoryChanged) {
      const newlyEnabled = message => message.type === 2 && !previous.hostShowGuard && next.hostShowGuard
        || message.type === 3 && !previous.hostShowSuperChat && next.hostShowSuperChat;
      const visible = message => !(message.type === 3 && (runtime.tombstoneOverflow || runtime.tombstones.has(message.id)))
        && (message.type !== 2 || next.hostShowGuard) && (message.type !== 3 || next.hostShowSuperChat);
      buffer = buffer.filter(visible);
      const pending = new Set([...renderer.smoothedMessageQueue.flat().filter(message => message.type < 4), ...buffer].map(message => message.id));
      const restore = projected.filter(message => newlyEnabled(message) && visible(message)
        && runtime.getRecord(message.id)?.firstPresentedAt !== undefined && !pending.has(message.id));
      const order = new Map(projected.map((message, index) => [message.id, index]));
      const merge = (current, additions, predicate, cap, descending = false) => {
        const byId = new Map(current.filter(predicate).map(message => [message.id, message]));
        for (const message of additions) if (!byId.has(message.id) && predicate(message)) byId.set(message.id, { ...message });
        const ordered = [...byId.values()].sort((a, b) => (order.get(a.id) ?? -1) - (order.get(b.id) ?? -1));
        const capped = ordered.slice(-cap); return descending ? capped.reverse() : capped;
      };
      main = merge(main, restore, message => visible(message) && runtime.isMainVisible(message, next), next.maxNumber);
      const now = Date.now();
      paid = merge(paid, restore, message => visible(message) && message.type !== 0 && isPinned(message, now), 100, true);
    }
    return { main, buffer, paid, categoryChanged };
  },
  applyPrivateReconcile(plan) {
    const renderer = app.$refs.renderer; if (!renderer) return;
    renderer.messages.splice(0, renderer.messages.length, ...plan.main);
    renderer.messagesBuffer.splice(0, renderer.messagesBuffer.length, ...plan.buffer);
    runtime.observeTextLanes();
    if (plan.categoryChanged && !hostOptions.managed) {
      renderer.paidMessages = plan.paid;
      const ticker = renderer.$children.find(child => child.$options.name === 'Ticker');
      if (ticker?.pinnedMessage && !plan.paid.some(message => message.id === ticker.pinnedMessage.id)) ticker.pinnedMessage = null;
    }
  },
  reconcileCategories(previous, next) {
    const plan = this.planPrivateReconcile(previous, next, null);
    if (plan) this.applyPrivateReconcile(plan);
  },
  replace(messages, paidMessages) {
    if (runtime.config.templateUrl) {
      // Original SDK has no reset/hot-config protocol. Reconnect a fresh nested sandbox.
      if (templateConnected && !reconfiguring) remountTemplate();
      return;
    }
    const renderer = app.$refs.renderer; if (!renderer) return;
    const ticker = renderer.$children.find(child => child.$options.name === 'Ticker');
    const pinnedId = ticker?.pinnedMessage?.id;
    if (renderer.emitSmoothedMessageTimerId !== null) clearTimeout(renderer.emitSmoothedMessageTimerId);
    renderer.emitSmoothedMessageTimerId = null; renderer.resetSmoothScroll();
    renderer.smoothedMessageQueue = []; renderer.messagesBuffer = [];
    renderer.enqueueIntervals = []; renderer.lastEnqueueTime = null; renderer.estimatedEnqueueInterval = null;
    const nextPaid = hostOptions.managed ? softwarePaidMessages : paidMessages;
    renderer.messages = messages; renderer.paidMessages = nextPaid.slice();
    if (ticker) ticker.pinnedMessage = nextPaid.find(message => message.id === pinnedId) || null;
    Vue.nextTick(() => { renderer.maybeResizeScrollContainer(); renderer.maybeScrollToBottom(); });
  },
};
runtime = new BlivechatRuntime({ sink, translate: key => i18n.t(key), resolveParts: resolveContentParts });
let capturedPreview=null,stopPreviewWatch=null,pendingHydrationPreview=null;
const previewWindow=createPreviewWindow({windowSize:40,renderer:app.$refs.renderer,scroller:document.getElementById("item-scroller"),hydrate:async records=>{capturePreview(false);try{await onHostMessage({source:window.parent,origin:parentOrigin,data:{type:TYPE,command:"hydrate",data:{records}}});}finally{if(stopPreviewWatch)capturePreview(true);}},afterRender:async()=>{await Vue.nextTick();syncActionIds();app.$refs.renderer.maybeResizeScrollContainer();}});
itemScroller?.addEventListener("wheel",event=>{if(!previewWindow.active)return;if(event.deltaY<0&&itemScroller.scrollTop<=80)void previewWindow.move(hostOptions.direction === "top" ? "forward" : "backward");else if(event.deltaY>0&&itemScroller.scrollHeight-itemScroller.clientHeight-itemScroller.scrollTop<=80)void previewWindow.move(hostOptions.direction === "top" ? "backward" : "forward");},{passive:true});
itemScroller?.addEventListener("scroll",()=>{if(!previewWindow.active||!pointerScrollIntent&&!userScrollIntent)return;if(itemScroller.scrollTop<=80)void previewWindow.move(hostOptions.direction==="top"?"forward":"backward");else if(itemScroller.scrollHeight-itemScroller.clientHeight-itemScroller.scrollTop<=80)void previewWindow.move(hostOptions.direction==="top"?"backward":"forward");},{capture:true,passive:true});
itemScroller?.addEventListener("keydown",event=>{if(!previewWindow.active||(hostOptions.direction==="top"?event.key!=="Home":event.key!=="End"))return;event.preventDefault();event.stopImmediatePropagation();void onHostMessage({source:window.parent,origin:parentOrigin,data:{type:TYPE,command:"scroll-latest"}});},{capture:true});
function sendPreviewPresentation(){if(!hydrating&&capturedPreview)post("preview-frame",{...capturedPreview,...(previewWindow.active?{windowed:true,records:previewWindow.records}:{}),presentation:simulationSession?runtime.snapshot():{messages:app.$refs.renderer.messages,paidMessages:app.$refs.renderer.paidMessages}});}
const capturePreview = observePreviewRuntime(runtime,data=>{capturedPreview=data;sendPreviewPresentation();},publish=>{
  if(hydrating)pendingHydrationPreview=publish;
  else if(simulationSession)void runtime.drain().then(publish);
  else queueMicrotask(publish);
});
function flushHydrationPreview(){
  if(!pendingHydrationPreview)return;
  const publish=pendingHydrationPreview;pendingHydrationPreview=null;queueMicrotask(publish);
}
function observePreview(enabled){previewObserving=enabled===true;capturePreview(enabled);if(enabled&&!stopPreviewWatch)stopPreviewWatch=app.$watch(()=>[app.$refs.renderer.messages,app.$refs.renderer.paidMessages],()=>{if(!simulationSession)sendPreviewPresentation();},{deep:true});else if(!enabled&&stopPreviewWatch){stopPreviewWatch();stopPreviewWatch=null;capturedPreview=null;}}

app.config = runtime.config;
// QA-only observability. The build injects BB_BLIVECHAT_QA=true only for the
// local QA artifact; the normal production build dead-code eliminates this
// branch, so it exposes no runtime interface in the delivered renderer.
if (process.env.BB_BLIVECHAT_QA && new URLSearchParams(window.location.search).has('qa')) {
  window.__bbBlivechatQA = { getRuntime: () => runtime, getRenderer: () => app.$refs.renderer };
}
const simulation = createBlivechatSimulation();
let simulationSession = null;
let editorSelection = null;
let editorSelectionKey = '';
const editorFrames = new Set();
function scheduleEditorFrame(callback) { const frame = requestAnimationFrame(time => { editorFrames.delete(frame); callback(time); }); editorFrames.add(frame); return frame; }
const editorStyle = document.createElement('style'); editorStyle.id = 'bb-compatible-editor-style'; document.head.appendChild(editorStyle);
const editorRevealState=new Map();
function restoreEditorReveal(){for(const[node,props]of editorRevealState)for(const[prop,state]of Object.entries(props)){if(state.value)node.style.setProperty(prop,state.value,state.priority);else node.style.removeProperty(prop);}editorRevealState.clear();}
function rememberEditorStyle(node,property){let state=editorRevealState.get(node);if(!state){state={};editorRevealState.set(node,state);}if(!state[property])state[property]={value:node.style.getPropertyValue(property),priority:node.style.getPropertyPriority(property)};}
function authoredDisplayBeforeNone(node){let result='';const visit=rules=>{for(const rule of rules||[]){if(rule.selectorText)try{if(node.matches(rule.selectorText)){const value=rule.style?.getPropertyValue('display');if(value&&value!=='none')result=value;}}catch{}if(rule.cssRules)visit(rule.cssRules);}};for(const sheet of document.styleSheets)try{visit(sheet.cssRules);}catch{}return result||'block';}
function revealEditorNode(node){const computed=getComputedStyle(node);if(computed.display==='none'){rememberEditorStyle(node,'display');node.style.setProperty('display',authoredDisplayBeforeNone(node),'important');node.setAttribute('data-compatible-editor-reveal-display','');}if(computed.visibility==='hidden'||computed.visibility==='collapse'){rememberEditorStyle(node,'visibility');node.style.setProperty('visibility','visible','important');node.setAttribute('data-compatible-editor-reveal-visibility','');}if(computed.opacity==='0'){rememberEditorStyle(node,'opacity');node.style.setProperty('opacity','1','important');node.setAttribute('data-compatible-editor-reveal-opacity','');}if(editorRevealState.has(node))node.setAttribute('data-compatible-editor-reveal','');}
let editorPinnedId = null;
function ensureEditorDetail(selection) {
  const renderer = app.$refs.renderer;
  const ticker = renderer?.$children?.find(child => child.$options?.name === 'Ticker');
  if (!ticker) return;
  if (selection?.scope?.placement !== 'detail') {
    if (editorPinnedId && ticker.pinnedMessage?.id === editorPinnedId) ticker.pinnedMessage = null;
    editorPinnedId = null; return;
  }
  const type = {gift:1,'gift-normal':1,superchat:3,guard:2}[selection.scope.eventType];
  const message = renderer.paidMessages?.find(message => type === undefined || message.type === type);
  if (message && ticker.pinnedMessage?.id !== message.id) { editorPinnedId = message.id; ticker.pinnedMessage = message; }
}

function applyEditorSelection(data, force = false) { if(data?.accentColor)document.documentElement.style.setProperty('--preview-editor-accent',data.accentColor); if(!data || data.readOnly || data.pickEnabled === false)document.querySelectorAll('[data-compatible-editor-hover]').forEach(node=>node.removeAttribute('data-compatible-editor-hover'));
  ensureEditorDetail(data);
  const nextSelection = data && typeof data === 'object' ? data : null;
  const shouldScroll = !force && previewEditorSelectionNeedsScroll(editorSelection, nextSelection);
  const nextKey = JSON.stringify(nextSelection ? Object.fromEntries(Object.entries(nextSelection).filter(([key]) => key !== 'inspectionRevision')) : null);
  if (!force && nextKey === editorSelectionKey && nextSelection && document.querySelector('[data-compatible-editor-selected]')) {
    if (nextSelection.inspectionRevision === editorSelection?.inspectionRevision) return;
    editorSelection = nextSelection;
    refreshEditorInspection();
    return;
  }
  if (!force && nextKey === editorSelectionKey && !nextSelection) return;
  restoreEditorReveal();
  editorSelection = nextSelection;
  editorSelectionKey = nextKey;
  document.querySelectorAll('[data-compatible-editor-selected],[data-compatible-editor-reveal],[data-compatible-editor-reveal-display],[data-compatible-editor-reveal-visibility],[data-compatible-editor-reveal-opacity]').forEach(node => { for(const name of ['data-compatible-editor-selected','data-compatible-editor-reveal','data-compatible-editor-reveal-display','data-compatible-editor-reveal-visibility','data-compatible-editor-reveal-opacity'])node.removeAttribute(name); });
  const scheme = editorSelection?.scheme === 'dark' ? 'dark' : 'light'; document.documentElement.dataset.theme = scheme; document.documentElement.classList.toggle('dark', scheme === 'dark'); document.documentElement.classList.toggle('light', scheme === 'light');
  editorStyle.textContent = editorSelection && editorSelection.pickEnabled !== false ? '[data-compatible-editor-selected]{outline:2px solid var(--preview-editor-accent,currentColor)!important;outline-offset:-2px!important}' : '';
  if (!editorSelection) return;
  markPreviewEditorSelection(document, editorSelection, { scroll: shouldScroll, schedule: scheduleEditorFrame, reveal: revealEditorNode });
  refreshEditorInspection();
}
let editorSelectionFrame = 0;
const editorSelectionObserver = new MutationObserver(() => {
  if (!editorSelection || editorSelectionFrame) return;
  editorSelectionFrame = requestAnimationFrame(() => {
    editorSelectionFrame = 0;
    if (editorSelection) applyEditorSelection(editorSelection, true);
  });
});
editorSelectionObserver.observe(document.body, { childList: true, subtree: true });
function pickEditorPart(target, point) { return pickPreviewEditorPart(target, editorSelection?.selectors, point, (part,node)=>!editorSelection?.partPlacements?.[part] || editorSelection.partPlacements[part].includes(editorScopeFor(node,part).placement)); }
const editorCssProperties={visible:'display',color:'color',background:'background-color',fontFamily:'font-family',fontSize:'font-size',lineHeight:'line-height',paddingX:'padding-inline-start',paddingY:'padding-block-start',marginX:'margin-inline-start',marginY:'margin-block-start',gap:'gap',width:'width',height:'height',borderWidth:'border-top-width',borderColor:'border-top-color',borderRadius:'border-top-left-radius',borderImage:'border-image'};
function selectorSpecificity(selector){return(selector.match(/#[\w-]+/g)||[]).length*100+(selector.match(/\.[\w-]+|\[[^\]]+\]|:[\w-]+/g)||[]).length*10+(selector.match(/(^|[\s>+~])\w+/g)||[]).length;}
function matchEditorScope(node,selectors,fallback){let best=null;for(const[name,source]of Object.entries(selectors||{}))for(const selector of String(source).split(','))try{const matched=node.closest(selector);if(!matched)continue;let distance=0,current=node;while(current&&current!==matched){distance++;current=current.parentElement;}const candidate={name,distance,specificity:selectorSpecificity(selector),length:selector.length};if(!best||distance<best.distance||distance===best.distance&&(candidate.specificity>best.specificity||candidate.specificity===best.specificity&&candidate.length>best.length))best=candidate;}catch{}return best?.name||fallback;}
function authoredEditorValues(nodes,properties){
 const values=new Map(nodes.map(node=>[node,new Map()]));
 const visit=rules=>{for(const rule of rules||[]){
  if(rule.media&&!matchMedia(rule.conditionText).matches)continue;
  if(rule.selectorText&&rule.style){
   const declarations=properties.flatMap(property=>{const value=rule.style.getPropertyValue(property);return value?[[property,value,rule.style.getPropertyPriority(property)==='important']]:[];});
   if(declarations.length)for(const node of nodes)try{if(node.matches(rule.selectorText))for(const[property,value,important]of declarations){const previous=values.get(node).get(property)||'';if(!previous.endsWith('!important')||important)values.get(node).set(property,value+(important?' !important':''));}}catch{}
  }
  if(rule.cssRules)visit(rule.cssRules);
 }};
 for(const sheet of document.styleSheets)try{visit(sheet.cssRules);}catch{}
 for(const node of nodes)for(const property of properties){const value=node.style?.getPropertyValue(property);if(value){const important=node.style.getPropertyPriority(property)==='important';if(!values.get(node).get(property)?.endsWith('!important')||important)values.get(node).set(property,value+(important?' !important':''));}}
 return values;
}
function editorScopeFor(node,part){const scope=editorSelection.scopeSelectors||{};const placement=matchEditorScope(node,scope.placements,'main');return{part,eventType:matchEditorScope(node,scope.eventsByPlacement?.[placement]||{},'all'),identity:previewEditorIdentity(node,editorSelection),placement};}
function inspectEditorNode(picked,requestedScope){const scope=requestedScope||editorScopeFor(picked.node,picked.part),nodes=[];if(requestedScope)for(const node of document.querySelectorAll('[data-compatible-editor-selected]'))nodes.push(node);else for(const selector of editorSelection.selectors?.[picked.part]||[])try{for(const node of document.querySelectorAll(selector)){const candidate=editorScopeFor(node,picked.part);if(candidate.eventType===scope.eventType&&candidate.identity===scope.identity&&candidate.placement===scope.placement&&!nodes.includes(node))nodes.push(node);}}catch{}if(!nodes.length)nodes.push(picked.node);const properties=editorSelection.properties?.[picked.part]||[],authoredValues=authoredEditorValues(nodes,properties.map(property=>editorCssProperties[property]).filter(Boolean)),styles=new Map(nodes.map(node=>[node,getComputedStyle(node)])),parents=new Map(nodes.map(node=>[node,node.parentElement?getComputedStyle(node.parentElement):null]));const computed={};for(const property of properties){const cssProperty=editorCssProperties[property];if(!cssProperty)continue;const samples=nodes.map(node=>{const style=styles.get(node),parent=parents.get(node),authored=authoredValues.get(node).get(cssProperty)||'';const value=property==='visible'?String(style.display!=='none'&&style.visibility!=='hidden'&&style.visibility!=='collapse'&&style.opacity!=='0'):(property==='background'&&style.backgroundImage!=='none'?style.background:style.getPropertyValue(cssProperty).trim());return{value,authored,inherited:!authored&&!!parent&&['color','font-family','font-size','line-height'].includes(cssProperty)&&style.getPropertyValue(cssProperty).trim()===parent.getPropertyValue(cssProperty).trim()};});const values=new Set(samples.map(x=>x.value)),units=new Set(samples.map(x=>x.value.match(/[a-z%]+$/i)?.[0]||''));computed[property]={value:samples[0].value,unit:units.size===1?[...units][0]:'',inherited:samples.every(x=>x.inherited),mixed:values.size>1,controlled:samples.some(x=>/!important$/.test(x.authored))};}for(const property of Object.keys(computed))computed[property]=inspectEditorProperty(nodes,property,computed[property]);return{scope,computed,layoutSupported:nodes.every(node=>/flex|grid/.test(getComputedStyle(node).display)),inspectionRevision:editorSelection?.inspectionRevision};}
let cssInspectionTimer;
function scheduleCssInspection(){clearTimeout(cssInspectionTimer);cssInspectionTimer=setTimeout(()=>{if(editorSelection&&!editorSelection.readOnly)refreshEditorInspection();},50);}
function refreshEditorInspection(){if(editorSelection?.readOnly)return;const node=document.querySelector('[data-compatible-editor-selected]');if(editorSelection)post('editor-inspected',node?{...inspectEditorNode({part:editorSelection.part,node},editorSelection.scope),refresh:true}:{scope:editorSelection.scope,computed:{},refresh:true,inspectionRevision:editorSelection.inspectionRevision});}
document.addEventListener('click', event => {
  if (editorSelection?.readOnly || !editorSelection?.selectors || editorSelection.pickEnabled === false) return;
  const target = event.target instanceof Element ? event.target : null; if (!target) return;
  const picked = pickEditorPart(target, {x:event.clientX,y:event.clientY}); if (picked) { event.preventDefault(); event.stopPropagation(); post('editor-inspected',{...inspectEditorNode(picked),eventId:picked.node.closest('[data-compatible-event-id]')?.dataset.compatibleEventId}); }
}, true);
function stopSimulation() { if(simulationSession)runtime.config={...runtime.config,mergeGift:false,mergeSimilarDanmaku:false};simulationSession = null; runtime.sink = sink; }
function configureSimulation() { stopSimulation(); }
function beginSimulation(data) {
  previewWindow.cancel();
  ++hydrationGeneration; hydrating = false; hydrationTail = []; hydrationTailBytes = 0; runtime.sink = sink;
  simulationSession = data.session;
  runtime.reset();
  runtime.sink = {};
  flushHydrationPreview();
}
function generateSimulation(data) {
  if (!simulationSession || data.session !== simulationSession) return;
  const record = bindSimulationIdentity(data.record ?? simulation.next(data), data.session, data.sequence);
  if (!record) return;
  if (data.verifiedOnly) record.payload.isMobileVerified = true;
  if (data.manualOnly) record.payload.isGiftDanmaku = false;
  if (record.payload.emoticon) record.payload.emoticon = resourceUrl(record.payload.emoticon);
  const prepared = prepareBlivechatPreviewRecord(record);
  if (prepared) {
    runtime.config={...runtime.config,mergeGift:true,mergeSimilarDanmaku:data.mergeSameDanmu===true};
    runtime.receive(prepared);
  }
}
function normalizeInput(record) {
  const facts = readNativeTextFilterFacts(record);
  const payload = { ...(record?.payload ?? record?.data) };
  if (payload.emoticon) payload.emoticon = resourceUrl(payload.emoticon);
  return { method: record?.method, payload, receivedAt: record?.receivedAt, sequence: record?.sequence, replay: record?.replay,
    ...(facts === undefined ? {} : { source: { nativeTextFilterFacts: facts } }) };
}
async function onHostMessage(event) {
  // Third-party template can only connect through its exact opaque-origin sandbox.
  if (templateFrame && event.source === templateFrame.contentWindow) {
    if (event.origin !== 'null' || event.data?.type !== 'blcTemplateConnect' || templateConnected) return;
    templateConnected = true; clearTimeout(templateTimeout); templateTimeout = null;
    templatePost('blcInit', { blcVersion: 'v1.10.4', sdkVersion: '1.0.1', config: {
      showGiftName: runtime.config.showGiftName, mergeSimilarDanmaku: runtime.config.mergeSimilarDanmaku,
      mergeGift: runtime.config.mergeGift, maxNumber: runtime.config.maxNumber,
    } });
    const injectCss = runtime.config.importPresetCss && presetIsInline ? presetCss : '';
    const injectCssUrls = runtime.config.importPresetCss && !presetIsInline ? [presetUrl] : [];
    if (injectCss || injectCssUrls.length) templatePost('blcInjectCss', { injectCssUrls, injectCss });
    // The original SDK appends one sheet per message. Keep each author prelude
    // legal and namespace-scoped, with the maintained appearance sheet earlier.
    if (customCss.includes('blc-inject-into-template')) {
      for (const injectCss of [appearanceCss, customCss]) {
        if (injectCss) templatePost('blcInjectCss', { injectCssUrls: [], injectCss });
      }
    }
    // Let the original SDK await init() and install its handler before replay.
    const connectedFrame = templateFrame, generation = templateGeneration;
    setTimeout(() => { if (templateConnected && templateFrame === connectedFrame && templateGeneration === generation) { snapshotToTemplate(); templateReady = true; } }, 0);
    post('template-ready', { sdkVersion: '1.0.1', sandbox: 'allow-scripts' }); return;
  }
  if (event.source !== window.parent || event.origin !== parentOrigin || event.data?.type !== TYPE) return;
  const { command, data } = event.data;
  try {
    if (command === 'preview-observe') { observePreview(data); return; }
    else if(command === 'preview-window'){
      stopSimulation(true);await previewWindow.replace(data.records,{fromStart:command==='preview-window'});return;
    }
    else if(command === 'preview-present'){
      if (data.hostPresentation) await applyPresentation(data.hostPresentation);
      const renderer=app.$refs.renderer;applyPreviewPresentation(renderer,data,previewWindow);
      await Vue.nextTick();syncActionIds();renderer.maybeResizeScrollContainer();return;
    } else if (command === 'event-batch') {
      presentation = data.presentation;
      for (const record of data.records) runtime.receive(normalizeInput(record));
      await runtime.drain();await Vue.nextTick();if(presentation===data.presentation)await applyPresentation(data.presentation);
    } else if (command === 'event') {
      const input = normalizeInput(data);
      if (hydrating) {
        const bytes = new TextEncoder().encode(JSON.stringify(input)).byteLength;
        if (hydrationTail.length >= runtime.retention.maxCallbacks || hydrationTailBytes + bytes > runtime.retention.maxBytes) throw new Error('载入期间收到的消息超过预览缓存上限；请重置后重试。');
        hydrationTail.push(input); hydrationTailBytes += bytes; return;
      }
      runtime.receive(input);
    } else if (command === 'hydrate') {
      if (hostOptions.managed && data?.presentation) presentation = data.presentation;
      if (!Array.isArray(data?.records)) throw new Error('历史快照必须包含 records 数组');
      if (data.records.length > runtime.retention.maxCallbacks) throw new Error('历史快照超过回调数量上限');
      const inputs = data.records.map(normalizeInput);
      let hydrationBytes = 0;
      for (const record of inputs) {
        hydrationBytes += new TextEncoder().encode(JSON.stringify(record)).byteLength;
        if (hydrationBytes > runtime.retention.maxBytes) throw new Error('历史快照超过容量上限');
      }
      const generation = ++hydrationGeneration;
      hydrating = true; hydrationTail = []; hydrationTailBytes = 0; runtime.reset(false); runtime.sink = {};
      try {
        for (let index = 0; index < inputs.length; index++) {
          if (generation !== hydrationGeneration) return;
          runtime.receive({ ...inputs[index], replay: true });
          if ((index + 1) % 64 === 0) await new Promise(resolve => setTimeout(resolve, 0));
        }
        await runtime.drain();
      } finally {
        if (generation === hydrationGeneration) {
          runtime.sink = sink; hydrating = false; runtime.rebuild(!hostOptions.managed);
          const tail = hydrationTail; hydrationTail = []; hydrationTailBytes = 0;
          for (const record of tail) runtime.receive(record);
          flushHydrationPreview();
        }
      }
      if (generation !== hydrationGeneration) return;
      await Vue.nextTick();
      if (hostOptions.direction === 'top') {
        const scroller = document.getElementById('item-scroller');
        if (scroller) { scroller.scrollTop = 0; app.$refs.renderer.atBottom = true; }
      }
      if (hostOptions.managed && data?.presentation && presentation===data.presentation) await applyPresentation(data.presentation);
      post('hydrated', { generation, records: data.records.length });
    } else if (command === 'config') {
      checkNativeTextConfig(data);
      const publicConfigKey = JSON.stringify(data, Object.keys(data || {}).sort());
      if (publicConfigKey === lastPublicConfigKey) return;
      const oldConfig = JSON.stringify(runtime.config);
      const oldTemplate = runtime.config.templateUrl;
      if (data?.lang) setLocale(data.lang);
      reconfiguring = true;
      try { runtime.setConfig(data); } finally { reconfiguring = false; }
      lastPublicConfigKey = publicConfigKey;
      app.config = runtime.config; updateCss();
      if (runtime.config.importPresetCss && presetState !== 'loaded') loadPreset();
      if (oldTemplate !== runtime.config.templateUrl || runtime.config.templateUrl && oldConfig !== JSON.stringify(runtime.config)) await remountTemplate();
    } else if (command === 'css') {
      if (typeof data?.css !== 'string') throw new Error('CSS 必须是文本');
      if (data.appearanceCss !== undefined && typeof data.appearanceCss !== 'string') throw new Error('外观 CSS 必须是文本');
      const nextAppearanceCss = data.appearanceCss ?? '';
      const changed = customCss !== data.css || appearanceCss !== nextAppearanceCss || typeof data.presetCss === 'string' && presetCss !== data.presetCss;
      customCss = data.css; appearanceCss = nextAppearanceCss;
      if (editorSelection && Number.isSafeInteger(data.inspectionRevision)) editorSelection = { ...editorSelection, inspectionRevision: data.inspectionRevision };
      if (typeof data.presetCss === 'string') { presetCss = data.presetCss; presetState = 'loaded'; presetIsInline = true; } updateCss();
      if (changed && runtime.config.templateUrl) await remountTemplate();
      if (editorSelection && !editorSelection.readOnly) scheduleCssInspection();
    } else if (command === 'simulation-begin') {
      beginSimulation(data);
    } else if (command === 'simulation-next') {
      generateSimulation(data);
    } else if (command === 'simulation') {
      if(data?.playing)previewWindow.cancel();
      if (data?.playing && hydrating) {
        ++hydrationGeneration; hydrating = false; hydrationTail = []; hydrationTailBytes = 0; runtime.sink = sink; runtime.reset();
        flushHydrationPreview();
      }
      configureSimulation(data);
    } else if (command === 'host') {
      applyHostOptions(data);
    } else if (command === 'presentation') {
      await applyPresentation(data);
    } else if (command === 'locate') {
      if(previewWindow.active)await previewWindow.locate(data?.eventId);
      locateEvent(data?.eventId);
    } else if (command === 'scroll-latest') {
      if(previewWindow.active)await previewWindow.latest();
      const scroller = document.getElementById('item-scroller'), renderer = app.$refs.renderer;
      if (!renderer) return;
      renderer.atBottom = true;
      await renderer.flushMessagesBuffer();
      await Vue.nextTick();
      if (hostOptions.direction === 'top' && scroller) scroller.scrollTop = 0;
      else renderer.scrollToBottom();
      postScrollState();
    } else if (command === 'restore-scroll') {
      const scroller = document.getElementById('item-scroller');
      if (!scroller || !Number.isFinite(data?.scrollTop) || typeof data?.followingLatest !== 'boolean') throw new Error('阅读位置无效');
      const anchor = typeof data.anchorId === 'string' ? [...document.querySelectorAll('[data-compatible-event-id]')].find(node => node.dataset.compatibleEventId === data.anchorId) : null;
      scroller.scrollTop = anchor && Number.isFinite(data.anchorOffset) ? Math.max(0, anchor.offsetTop - data.anchorOffset) : Math.max(0, data.scrollTop); app.$refs.renderer.atBottom = data.followingLatest;
      if (data.followingLatest) {
        await app.$refs.renderer.flushMessagesBuffer();
        await Vue.nextTick();
        if (hostOptions.direction === 'top') scroller.scrollTop = 0;
        else app.$refs.renderer.scrollToBottom();
      } else postScrollState();
    } else if (command === 'reset') {
      previewWindow.cancel();
      ++hydrationGeneration; hydrating = false; hydrationTail = []; hydrationTailBytes = 0; runtime.sink = sink;
      stopSimulation(true); runtime.reset(); if (runtime.config.templateUrl) await remountTemplate();
      flushHydrationPreview();
    } else if (command === 'inspect') {
      post('snapshot', runtime.snapshot());
    } else if (command === 'editor-select') {
      applyEditorSelection(data);
    } else return;
    post('status', runtime.stats());
  } catch (error) { post('error', { code: 'invalid-command', message: error.message }); }
}
window.addEventListener('message', onHostMessage);
// TTL is retention only. Original Ticker owns its normal 1-second expiry/update lifecycle.
const retentionTimer = setInterval(() => { if (!hostOptions.managed && runtime.prune()) runtime.rebuild(false); }, 60000);
window.addEventListener('pagehide', event => { if (!event.persisted) {
  window.removeEventListener('message', onHostMessage);
  clearInterval(retentionTimer);
  for (const frame of editorFrames) cancelAnimationFrame(frame);
  editorFrames.clear();
  if (editorSelectionFrame) cancelAnimationFrame(editorSelectionFrame);
  editorSelectionFrame = 0;
  actionObserver.disconnect(); editorSelectionObserver.disconnect(); itemContentResizeObserver?.disconnect(); restoreEditorReveal(); stopSimulation(true); disposeTemplate(); app.$destroy();
  listContentResizeObserver?.disconnect(); window.removeEventListener('resize', syncListContentWidth);
} });
post('ready', { version: '1.10.4', renderer: 'original-vue2', retainedSettings: Object.keys(DEFAULT_CONFIG) });

installPreviewEditorHover(document, event => editorSelection?.readOnly || editorSelection?.pickEnabled === false || !editorSelection?.selectors ? null : pickEditorPart(event.target, {x:event.clientX,y:event.clientY}));
