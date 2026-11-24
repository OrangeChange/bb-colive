import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/App.css';
import { FloatingEventWindow } from '../../src/windows/FloatingEventWindow';
import { Sidebar } from '../../src/components/Sidebar';
import * as channels from '../../src/windows/eventWindowChannels';
import { DEFAULT_EVENT_WINDOW_PREFERENCES, EVENT_WINDOW_PREFERENCES_EVENT, createEventWindowPreferences, type EventWindowPreferences } from '../../src/windows/eventWindowPreferences';
import { MIN_EVENT_EXPIRY_SECONDS } from '../../src/windows/windowEventExpiry';
import { nativeEventSamples, getNativeEventSample } from './nativeEventSamples';
import { createStickyProjection, STICKY_SNAPSHOT_EVENT } from '../../src/windows/stickyEventModel';
import { MsgType, type DanmakuEvent } from '../../src/protocol/types';
import { nativeEventBrowserPorts as ports } from '../helpers/nativeEventBrowserPorts';
import { createDiagnosticContext } from '../../src/diagnostics/diagnosticLogger';
import { installWindowDiagnosticSender } from '../../src/diagnostics/windowDiagnosticBridge';
import type { WindowDiagnosticMessage } from '../../src/diagnostics/windowDiagnosticBridge';
import type { EventWindowRoomStatePayload } from '../../src/windows/eventWindowChannels';
import { isDisplayEvent } from '../../src/windows/displayWindowModel';
import { isGiftWindowEvent, revenueEventKind, createRevenueWindowSelection, changeRevenueWindowSelection } from '../../src/windows/giftWindowModel';

const kind = channels.isEventWindowKind(ports.label) ? ports.label : 'display';
const isRevenue = kind !== 'display';
const acceptsCategory = (event: DanmakuEvent) => kind === 'display' ? isDisplayEvent(event)
  : kind === 'gift' ? isGiftWindowEvent(event) : revenueEventKind(event) === (kind === 'gift-only' ? 'gift' : kind);
document.documentElement.dataset.window = isRevenue ? 'gift' : 'display';
const c = isRevenue ? channels.revenueWindowChannels(kind) : null;
const readyChannel = c?.readyEvent ?? channels.DISPLAY_READY_EVENT;
const roomChannel = c?.roomChangedEvent ?? channels.DISPLAY_ROOM_CHANGED_EVENT;
const ackChannel = c?.readyAckEvent ?? channels.DISPLAY_READY_ACK_EVENT;
const eventChannel = c?.eventName ?? channels.DISPLAY_EVENT_NAME;
let room: EventWindowRoomStatePayload = { roomId: 6431492, generation: 1 };
let previousRoom = room.roomId;
let ready = false, version = 0, batch = 0;
let preferences = structuredClone(DEFAULT_EVENT_WINDOW_PREFERENCES);
const receivedIds: string[] = [];
const diagnosticInputs: WindowDiagnosticMessage[] = [];
const updates = new Set<() => void>();
const update = () => updates.forEach(callback => callback());
const media = '/wealth-levels/1.png';
const primarySticky = createStickyProjection();
const wallNow = Date.now;
let timeOffset = 0;
Date.now = () => wallNow() + timeOffset;
let windowOpen = true;
let stickySamples: DanmakuEvent[] = [];
let stickyBatch = 0;
async function sendWindowEvent(event: DanmakuEvent) {
  if (event.roomId === room.roomId && isRevenue) primarySticky.accept(event,Date.now());
  if (windowOpen) await ports.emitTo(kind,eventChannel,event);
  update();
}
async function sendStickySamples() {
  const now = Date.now();
  const samples = [
    getNativeEventSample('normal-gift'),getNativeEventSample('normal-gift'),getNativeEventSample('normal-gift'),
    getNativeEventSample('blind-gift'),getNativeEventSample('sc'),getNativeEventSample('guard-governor'),
    getNativeEventSample('lottery-start'),getNativeEventSample('pocket-start'),
  ];
  stickySamples=samples.map((event,index)=>{
    event.id=`sticky-${index}${stickyBatch ? `-${stickyBatch}` : ''}`;event.reactKey=event.id;event.roomId=room.roomId!;event.ts=now-index*1000;
    delete event.dedupe;delete event.comboId;
    if(event.user)event.user.avatar=media;
    if(event.gift){event.gift.webp=media;event.gift.icon=media;event.gift.paymentRmb=[29.99,30,100,30][index];event.gift.totalRmb=event.gift.paymentRmb;event.gift.count=1;
      if(index===3){event.gift.blindHitPriceRmb=200;event.gift.priceRmb=200;event.gift.blindPriceRmb=30;}}
    return event;
  });
  stickyBatch++;
  const accepts=acceptsCategory;
  for(const event of stickySamples.filter(accepts))await sendWindowEvent(event);
}

async function syncPreferences(next = preferences) {
  preferences = next;
  const payload = createEventWindowPreferences({
    windowEventFontSize: next.fontSize,
    eventWindowCapacity: next.capacity,
    liveScrollDirection: next.scrollDirection, windowAppearance: next.appearance,
    eventExpiry: next.eventExpiry, mergeSameDanmu: next.mergeSameDanmu,
    stickyEvents: next.stickyEvents,
    sameDanmuWindowSeconds: next.sameDanmuWindowSeconds, showGiftWindowEffect: next.showGiftEffect,
    displayWindowFilters: next.displayFilters, eventDisplayPreferences: next.display,
    eventStyleSettings: next.eventStyleSettings,
  }, { giftThreshold: next.giftThreshold, giftThresholdMode: next.giftThresholdMode });
  await ports.emitTo(kind, EVENT_WINDOW_PREFERENCES_EVENT, payload);
  primarySticky.configure(next.stickyEvents,Date.now());
  version++; update();
}

async function sendSamples(roomId = room.roomId, mediaUrl = media) {
  batch++;
  const accepts = acceptsCategory;
  const samples = nativeEventSamples.filter(sample => sample.handling === 'row' && accepts(sample.event));
  for (const sample of samples) {
    const event = structuredClone(sample.event);
    const key = `window-${kind}-${roomId}-${room.generation}-${batch}-${sample.key}${mediaUrl === media ? '' : '-failed-media'}`;
    event.roomId = roomId ?? 0; event.id = key; event.reactKey = key;
    event.ts = 1700000000000 + room.generation * 1000000 + batch * 1000 + samples.indexOf(sample);
    delete event.comboId; delete event.dedupe;
    if (event.user) event.user.avatar = mediaUrl;
    if (event.gift) {
      event.gift.webp = mediaUrl; event.gift.icon = mediaUrl;
      if (event.gift.blindWebp) event.gift.blindWebp = mediaUrl;
      if (mediaUrl !== media) {
        event.gift.gif = mediaUrl;
        event.gift.blindWebp = mediaUrl;
        event.gift.blindGif = mediaUrl;
        event.gift.blindIcon = mediaUrl;
      }
    }
    if (event.emoticon) event.emoticon.url = mediaUrl;
    if (event.emotes) for (const emote of Object.values(event.emotes)) emote.url = mediaUrl;
    await ports.emitTo(kind, eventChannel, event);
  }
}

async function initialize() {
  createDiagnosticContext({ invoke: ports.invoke });
  await ports.listen<WindowDiagnosticMessage>('diagnostic:window-record', async ({ payload }) => {
    diagnosticInputs.push(payload);
    await ports.invoke('append_log', { file: payload.kind === 'render' ? 'render.log' : 'app.log', lines: JSON.stringify(payload) + '\n' });
    update();
  }, 'main');
  await ports.listen<EventWindowRoomStatePayload>(readyChannel, async ({ payload }) => {
    if (payload.roomId !== room.roomId || payload.generation !== room.generation) {
      await ports.emitTo(kind, roomChannel, room);
      return;
    }
    await syncPreferences();
    if(isRevenue)await ports.emitTo(kind,STICKY_SNAPSHOT_EVENT,{...room,events:primarySticky.snapshot(Date.now()).filter(acceptsCategory)});
    await ports.emitTo(kind, ackChannel, payload);
    ready = true; update();
  }, 'main');
  await ports.listen<{ id: string }>(eventChannel, ({ payload }) => { receivedIds.push(payload.id); update(); });
  await installWindowDiagnosticSender(kind);
  createRoot(document.getElementById('root')!).render(<Fixture />);
}

function Fixture() {
  const [selection, setSelection] = useState(() => changeRevenueWindowSelection(createRevenueWindowSelection(),{type:'toggle'}));
  const [locked, setLocked] = useState(false);
  const [, refresh] = useState(0);
  const [suppressEnd, setSuppressEnd] = useState(false);
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [stickyCheck, setStickyCheck] = useState('');
  useEffect(() => {
    const callback = () => refresh(value => value + 1);
    updates.add(callback);
    const stop = ports.subscribe(callback);
    const observer = new MutationObserver(() => setVisibleIds(Array.from(document.querySelectorAll('.event-area .event-row-slot[data-event-id]')).map(row => row.getAttribute('data-event-id')!)));
    observer.observe(document.getElementById('window-host')!, { childList: true, subtree: true, attributes: true });
    return () => { updates.delete(callback); stop(); observer.disconnect(); };
  }, []);
  useEffect(() => {
    const stop = (event: Event) => { if (suppressEnd && (event.target as Element).closest('.event-area')) event.stopImmediatePropagation(); };
    document.addEventListener('animationend', stop, true);
    return () => document.removeEventListener('animationend', stop, true);
  }, [suppressEnd]);
  const run = (operation: () => Promise<unknown>) => { void operation().catch(reason => setError(`操作失败：${String(reason)}。请检查诊断记录后重试。`)); };
  const change = (next: Partial<EventWindowPreferences>) => run(() => syncPreferences({ ...preferences, ...next }));
  return <>
    <style>{`
      html[data-window] #root { height: auto; min-height: 100vh; padding: 16px; background: #17212a; color: #eef3f5; }
      .fixture-controls { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
      .fixture-controls button { padding: 6px 10px; border: 1px solid #70818e; border-radius: 5px; }
      .fixture-controls button:focus-visible { outline: 2px solid #77d4c4; }
      #window-host { width: min(480px, 100%); height: 560px; background: repeating-conic-gradient(#64727e 0% 25%, #394754 0% 50%) 0 / 24px 24px; }
      .fixture-status { display: block; white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.5 monospace; max-height: 240px; overflow: auto; }
    `}</style>
    <h1>{{display:'弹幕窗',gift:'收益窗','gift-only':'礼物窗',superchat:'醒目留言窗',guard:'大航海窗'}[kind]}验收</h1>
    <p>图片使用本地荣耀图片作为合成媒体。</p>
    <nav><a href="?kind=display">弹幕窗</a> · <a href="?kind=gift">组合窗口</a> · <a href="?kind=gift-only">礼物子窗</a> · <a href="?kind=superchat">醒目留言窗</a> · <a href="?kind=guard">大航海窗</a></nav>
    <div className="fixture-controls" aria-label="分窗开关验收">
      {(['combined','split'] as const).map(mode => <button id={`mode-${mode}`} key={mode} aria-pressed={selection.mode===mode} onClick={() => setSelection(current => changeRevenueWindowSelection(current,{type:'mode',mode}))}>{mode==='combined'?'组合窗口':'分窗显示'}</button>)}
      <button id="revenue-total" aria-pressed={selection.open} onClick={() => setSelection(current=>changeRevenueWindowSelection(current,{type:'toggle'}))}>收益窗总开关</button>
      <output id="revenue-selection">{JSON.stringify(selection)}</output>
    </div>
    <div id="sidebar-host"><Sidebar giftOpen={selection.open} giftLocked={locked} revenueSelection={selection}
      onToggleGift={() => setSelection(current=>changeRevenueWindowSelection(current,{type:'toggle'}))}
      onToggleGiftLock={() => setLocked(current=>!current)}
      onToggleRevenueChild={child => setSelection(current=>changeRevenueWindowSelection(current,{type:'child',kind:child}))} /></div>
    <div className="fixture-controls" aria-label="浮窗验收控件">
      <button id="send-samples" disabled={!ready} onClick={() => run(() => sendSamples())}>发送样本</button>
      <button id="send-failed-media" disabled={!ready} onClick={() => run(() => sendSamples(room.roomId, '/__native-event-fixture__/missing.png'))}>发送失败媒体样本</button>
      <button id="switch-room" disabled={!ready} onClick={() => run(async () => {
        previousRoom = room.roomId; room = { roomId: room.roomId === 6431492 ? 6431493 : 6431492, generation: room.generation + 1 };
        primarySticky.clear(); ready = false; update(); await ports.emitTo(kind, roomChannel, room);
      })}>切换房间</button>
      <button id="send-old-room" disabled={!ready || previousRoom === room.roomId} onClick={() => run(() => sendSamples(previousRoom))}>发送旧房事件</button>
      <button id="sync-settings" disabled={!ready} onClick={() => change({ fontSize: preferences.fontSize === 24 ? 18 : 24,
        display: { ...preferences.display, showHonorLevel: true, showCurrentRank: true, guardIdentityDisplayMode: 'text', honorLevelDisplayMode: 'text' } })}>同步字号与身份</button>
      <button id="hide-identities" disabled={!ready} onClick={() => change({ display: { ...preferences.display, showGuardIdentity: false, showAdminIdentity: false, showAnchorIdentity: false, showFanMedal: false, showHonorLevel: false, showCurrentRank: false } })}>隐藏身份</button>
      {[0, 82, 100].map(opacity => <button key={opacity} id={`opacity-${opacity}`} disabled={!ready} onClick={() => change({ appearance: { ...preferences.appearance, opacity: opacity / 100 } })}>透明度 {opacity}</button>)}
      <button id="expiry-on" disabled={!ready} onClick={() => change({ eventExpiry: { enabled: true, seconds: MIN_EVENT_EXPIRY_SECONDS } })}>定时消失开（1秒）</button>
      <button id="expiry-off" disabled={!ready} onClick={() => change({ eventExpiry: { ...preferences.eventExpiry, enabled: false } })}>定时消失关</button>
      <button id="animation-none" disabled={!ready} onClick={() => change({ display: { ...preferences.display, eventAnimationPreset: 'none' } })}>无动画</button>
      <button id="capacity-one" disabled={!ready} onClick={() => change({ capacity: 1 })}>严格保留 1 条</button>
      <button id="animation-fade" disabled={!ready} onClick={() => change({ display: { ...preferences.display, eventAnimationPreset: 'fade', eventAnimationDurationMs: 800 } })}>动画入退（800毫秒）</button>
      <button id="suppress-animationend" aria-pressed={suppressEnd} onClick={() => setSuppressEnd(value => !value)}>不派 animationend：{suppressEnd ? '开' : '关'}</button>
      <button id="spacing-toggle" disabled={!ready} onClick={() => change({ display: { ...preferences.display, eventSpacing: preferences.display.eventSpacing === 8 ? 0 : 8 } })}>间距 0／8</button>
      <button id="direction-toggle" disabled={!ready} onClick={() => change({ scrollDirection: preferences.scrollDirection === 'bottom' ? 'top' : 'bottom' })}>追加方向</button>
      <button id="auto-danmaku-toggle" disabled={!ready} aria-pressed={preferences.display.showAutoDanmaku} onClick={() => change({ display: { ...preferences.display, showAutoDanmaku: !preferences.display.showAutoDanmaku } })}>显示自动弹幕</button>
      <button id="phone-verification-toggle" disabled={!ready} aria-pressed={preferences.display.showPhoneNotVerified} onClick={() => change({ display: { ...preferences.display, showPhoneNotVerified: !preferences.display.showPhoneNotVerified } })}>显示未验证手机号用户弹幕</button>
      <button id="send-phone-verification" disabled={!ready || kind !== 'display'} onClick={() => run(async () => {
        const now = Date.now();
        for (const [index, phoneVerified] of [false, true, undefined].entries()) {
          const event = getNativeEventSample('text');
          event.id = `phone-check-${now}-${index}`; event.reactKey = event.id;
          event.ts = now + index; event.roomId = room.roomId!;
          event.text = '手机号验证合并验收';
          event.user = { ...event.user!, phoneVerified };
          await sendWindowEvent(event);
        }
      })}>发送未验证、已验证与未知同文弹幕</button>
      <button id="merge-danmaku-toggle" disabled={!ready} aria-pressed={preferences.mergeSameDanmu} onClick={() => change({ mergeSameDanmu: !preferences.mergeSameDanmu })}>合并相同弹幕</button>
      <button id="send-auto-danmaku" disabled={!ready || kind !== 'display'} onClick={() => run(async () => {
        const now = Date.now();
        for (const [index, auto] of [true, false].entries()) {
          const event = getNativeEventSample('text');
          event.id = `auto-check-${now}-${index}`; event.reactKey = event.id;
          event.ts = now + index; event.roomId = room.roomId!;
          event.text = '自动弹幕合并验收'; event.isAutoDanmaku = auto; event.danmakuSendType = auto ? 2 : 0;
          await sendWindowEvent(event);
        }
      })}>发送自动与普通同文弹幕</button>
      <button id="restore-settings" disabled={!ready} onClick={() => run(() => syncPreferences(structuredClone(DEFAULT_EVENT_WINDOW_PREFERENCES)))}>恢复设置</button>
      <button id="sticky-on" onClick={()=>change({stickyEvents:{...preferences.stickyEvents,enabled:true}})}>开启固定展示</button>
      <button id="sticky-off" onClick={()=>change({stickyEvents:{...preferences.stickyEvents,enabled:false}})}>关闭固定展示</button>
      <button id="sticky-top" onClick={()=>change({stickyEvents:{...preferences.stickyEvents,position:'top'}})}>固定顶部</button>
      <button id="sticky-bottom" onClick={()=>change({stickyEvents:{...preferences.stickyEvents,position:'bottom'}})}>固定底部</button>
      <button id="sticky-amount" onClick={()=>change({stickyEvents:{...preferences.stickyEvents,sort:'amount'}})}>金额排序</button>
      <button id="sticky-time" onClick={()=>change({stickyEvents:{...preferences.stickyEvents,sort:'time'}})}>时间排序</button>
      <button id="sticky-limit" onClick={()=>change({stickyEvents:{...preferences.stickyEvents,maxCount:preferences.stickyEvents.maxCount===3?10:3}})}>上限3／10</button>
      <button id="send-sticky" onClick={()=>run(sendStickySamples)}>发送固定样本</button>
      <button id="check-sticky" onClick={()=>{
        const bar = document.querySelector<HTMLElement>('.sticky-area');
        const cards = Array.from(document.querySelectorAll<HTMLElement>('.event.sticky'));
        if (!bar || cards.length < 2) { setStickyCheck('请先发送固定样本'); return; }
        const top = cards[0].getBoundingClientRect().top;
        const singleLine = cards.every(card => Math.abs(card.getBoundingClientRect().top - top) < 1
          && getComputedStyle(card.querySelector('.content')!).flexWrap === 'nowrap');
        const clipped = getComputedStyle(bar).overflowX === 'hidden' && getComputedStyle(bar).flexWrap === 'nowrap';
        const styled = cards.every(card => getComputedStyle(card).backgroundColor !== 'rgba(0, 0, 0, 0)'
          && parseFloat(getComputedStyle(card).borderRadius) > 0);
        const expectedFont = preferences.fontSize * .875;
        const expectedLine = preferences.fontSize * 1.25;
        const uniformText = cards.every(card => Array.from(card.querySelectorAll<HTMLElement>('.price,.lottery')).every(text =>
          Math.abs(parseFloat(getComputedStyle(text).fontSize) - expectedFont) < .1
          && Math.abs(parseFloat(getComputedStyle(text).lineHeight) - expectedLine) < .1));
        const uniformHeight = cards.every(card => Math.abs(card.getBoundingClientRect().height - (expectedLine + preferences.display.eventPadding / 3 * 2)) < .1);
        setStickyCheck(JSON.stringify({singleLine,clipped,styled,uniformText,uniformHeight,width:bar.clientWidth,contentWidth:bar.scrollWidth}));
      }}>验证固定栏</button>
      <output id="sticky-check">{stickyCheck}</output>
      <button id="sticky-repeat" onClick={()=>run(async()=>{for(const event of stickySamples)await sendWindowEvent(event);})}>重复固定样本</button>
      <button id="sticky-combo" onClick={()=>run(async()=>{const first=stickySamples[1];if(first)await sendWindowEvent({...first,firstOccurredAt:first.ts,ts:Date.now(),gift:{...first.gift!,count:2,paymentRmb:60,totalRmb:60}});})}>更新连击</button>
      <button id="sticky-recall" onClick={()=>run(()=>sendWindowEvent({id:'delete-sc',roomId:room.roomId!,ts:Date.now(),msgType:MsgType.ScDeleted,scDeleteIds:stickySamples[4]?[stickySamples[4].id]:[]}))}>撤回醒目留言</button>
      <button id="sticky-check-exit" onClick={()=>run(async()=>{
        const id=stickySamples[4]?.id;
        if (!id) { setStickyCheck('请先发送固定样本'); return; }
        await sendWindowEvent({id:'check-delete-sc',roomId:room.roomId!,ts:Date.now(),msgType:MsgType.ScDeleted,scDeleteIds:[id]});
        const start=performance.now();
        const frames:{opacity:number;x:number}[]=[];
        while(performance.now()-start<1500) {
          await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
          const card=Array.from(document.querySelectorAll<HTMLElement>('.event.sticky')).find(element=>element.dataset.eventId===id);
          if (card) {
            const style=getComputedStyle(card);
            frames.push({opacity:Number(style.opacity),x:new DOMMatrixReadOnly(style.transform).m41});
          } else break;
        }
        const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
        setStickyCheck(JSON.stringify({reduced,slidOut:frames.some(frame=>frame.x<0&&frame.opacity<1),removed:!Array.from(document.querySelectorAll<HTMLElement>('.event.sticky')).some(element=>element.dataset.eventId===id),frames}));
      })}>验证固定退出动画</button>
      <button id="sticky-award" onClick={()=>run(async()=>{for(const start of stickySamples.filter(event=>event.lottery))await sendWindowEvent({...start,id:`result-${start.id}`,msgType:start.msgType===MsgType.AnchorLotStart?MsgType.AnchorLotAward:MsgType.RedPocketWinner,ts:Date.now()});})}>发送开奖结果</button>
      <button id="time-5" onClick={()=>{timeOffset+=5000;update();}}>推进5秒</button>
      <button id="time-60" onClick={()=>{timeOffset+=60000;update();}}>推进60秒</button>
      <button id="time-7200" onClick={()=>{timeOffset+=7200000;update();}}>推进2小时</button>
      <button id="close-window" onClick={()=>{windowOpen=false;ready=false;update();}}>关闭窗口</button>
      <button id="reopen-window" onClick={()=>{windowOpen=true;update();}}>重开窗口</button>
      <button id="narrow-window" onClick={()=>{const host=document.getElementById('window-host')!;host.style.width=host.style.width==='320px'?'480px':'320px';}}>窄窗320／480</button>
    </div>
    <output id="window-status" data-ready={ready} data-room={room.roomId} data-generation={room.generation} data-preferences-version={version} className="fixture-status">{JSON.stringify({ ready, room, preferencesVersion: version, receivedIds, visibleIds, diagnosticCalls: ports.calls.length, diagnosticRecords: diagnosticInputs.length, suppressAnimationend: suppressEnd }, null, 2)}</output>
    {error && <p role="alert">{error}</p>}
    <div id="window-host">{windowOpen && <FloatingEventWindow kind={kind} />}</div>
    <details><summary>诊断记录</summary><pre id="diagnostic-records" className="fixture-status">{JSON.stringify(diagnosticInputs, null, 2)}</pre><pre id="diagnostic-calls" className="fixture-status">{JSON.stringify(ports.calls, null, 2)}</pre></details>
  </>;
}
void initialize();
