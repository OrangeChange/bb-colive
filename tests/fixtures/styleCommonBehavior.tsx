import { createRoot } from "react-dom/client";
import { useMemo, useState } from "react";
import { EventList } from "../../src/components/EventList.tsx";
import { createFeedScrollSession } from "../../src/events/feedScroll.ts";
import { DEFAULT_EVENT_DISPLAY_PREFERENCES } from "../../src/eventDisplaySettings.ts";
import { createCompatibleThemeModeAdapter } from "../../src/themes/themeModeAdapters.ts";
import { resolvePublishedBlivechatRender } from "../../src/compat/blivechat/runtime.tsx";
import { resolvePublishedOpenLiveRender } from "../../src/compat/openlive/runtime.tsx";
import { resolvePublishedLaplaceRender } from "../../src/compat/laplace/runtime.tsx";
import type { ThemeMode } from "../../src/themes/themeTypes.ts";
import type { DanmakuEvent } from "../../src/protocol/types.ts";
import { createBuiltinNativeTheme } from "../../src/themes/nativeBuiltinThemes.ts";
import { createObsSnapshot } from "../../src/obs/createObsSnapshot.ts";
import { ObsOutputView } from "../../src/obs/ObsOutputView.tsx";
import { DEFAULT_STICKY_EVENT_SETTINGS } from "../../src/windows/stickyEventModel.ts";
import { GiftEffectOverlay } from "../../src/components/GiftEffectOverlay.tsx";
import {RendererHost} from "../../src/compat/laplace/RendererHost.tsx";
import {projectLaplaceEvent} from "../../src/compat/laplace/projection.ts";
import type { GiftEffectNotice } from "../../src/windows/giftEffectBus.ts";
import "../../src/compat/blivechat/register.tsx";
import "../../src/compat/openlive/register.tsx";
import "../../src/compat/laplace/register.tsx";
import "../../src/App.css";
import "../../src/obs/obs.css";

const query = new URLSearchParams(location.search);
const mode = (query.get("mode") ?? "native") as ThemeMode;
const direction = query.get("direction") === "top" ? "top" : "bottom";
const animation = query.get("animation") ?? "slide";
const target = query.get("target") ?? "live";
const alignment: "top" | "bottom" | undefined = query.has("legacy") ? undefined : query.get("alignment") === "bottom" ? "bottom" : "top";
const duration = Number(query.get("duration") ?? 800);
function App() {
  const [flow,setFlow]=useState(direction),[align,setAlign]=useState(alignment);
  const [events, setEvents] = useState<DanmakuEvent[]>([]);
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const [notices, setNotices] = useState<GiftEffectNotice[]>([]);
  const [effectsEnabled, setEffectsEnabled] = useState(true);
  const [room, setRoom] = useState(1);
  const session = useMemo(() => createFeedScrollSession(0), []);
  const document = useMemo(() => {
    const value = mode === "native" ? createBuiltinNativeTheme("native-default") : createCompatibleThemeModeAdapter(mode).createBuiltinTheme();
    if (query.has("medal") && mode === "laplace") Object.assign(value.settings, { showMedal: true, showMedalCurrentRoomOnly: true, showMedalLightenedOnly: true });
    if(query.has("hide"))Object.assign(value.settings,{showAvatar:false,showUsername:false,showMedal:false,classicElementScope:query.has("classic")});
    return value;
  }, []);
  const render = useMemo(() => {
    if (mode === "native") return undefined;
    const current = { document, context: { target, targetId: target, roomId: "1" } } as any;
    const context = { target, targetId: target, placement: "main", roomId: 1 } as any;
    return mode === "blivechat" ? resolvePublishedBlivechatRender(current, context)
      : mode === "blivechat-open" ? resolvePublishedOpenLiveRender(current, context)
        : resolvePublishedLaplaceRender(current, context);
  }, []);
  const append = () => setEvents(rows => [...rows, {
    id: `row-${rows.length + 1}`, roomId: 1, ts: Date.now(), msgType: query.has("fallback") ? 10 : query.has("gift") ? 1 : 0,
    ...(query.has("fallback") ? {interactKind:"entry"} : {}),
    ...(query.has("gift") ? {gift:{id:34868,name:"特效礼物",count:1,price:50000,total:50000,priceRmb:50,totalRmb:50,paymentRmb:50,coinType:"gold"}} : {}),
    ...(query.has("late")&&rows.length%5===0?{emoticon:{url:`/media/style-preview-avatar-1.jpg?late=${rows.length}`,width:100,height:100}}:{}),
    text: `事件 ${rows.length + 1} ${query.has("late")?"长文本换行验收".repeat(12):""}`, user: { uid: "1", uname: "验收用户", phoneVerified: true,
      ...(query.has("medal") ? { medal: { name: `粉丝牌${rows.length + 1}`, level: 10,
        isCurrentRoom: [true, false, true, true, undefined][rows.length % 5],
        isLighted: [true, true, undefined, false, true][rows.length % 5] } } : {}) },
  } as DanmakuEvent]);
  const display = { ...DEFAULT_EVENT_DISPLAY_PREFERENCES, eventAnimationPreset: animation as any, eventAnimationDurationMs: duration };
  const play = (broken = false, manual = false) => setNotices(previous => [...previous, {
    manual,
    event: { id: `effect-${previous.length}`, roomId: room, ts: Date.now(), msgType: 1 } as DanmakuEvent,
    resource: { id: 2071, giftIds: [34868], planPlatforms: [2],
      webMp4: "/.superpowers/sdd/2026-11-01-style-common-behavior/effect.mp4",
      webMp4Json: broken ? "/missing-effect.json" : "/.superpowers/sdd/2026-11-01-style-common-behavior/effect.json" },
  }]);
  return <><button onClick={append}>追加事件</button><button onClick={()=>setFlow(v=>v==='top'?'bottom':'top')}>切换最新位置</button><button onClick={()=>setAlign(v=>v==='top'?'bottom':'top')}>切换内容对齐</button><button onClick={() => setRemoving(new Set(events.map(event => event.id)))}>退出事件</button>
    <button onClick={() => play()}>播放特效</button><button onClick={() => play(true)}>播放损坏特效</button>
    <button onClick={() => setEffectsEnabled(value => !value)}>切换特效开关</button><button onClick={() => setRoom(value => value + 1)}>切换房间</button>
    <section className="event-area live" style={{ width: query.has("resize") ? "min(100%,600px)" : 400, height: 500, position: "relative" }}>
    {query.has("reference") ? <RendererHost variant="product" settings={document.settings as any} css={{cloud:"",remote:"",custom:""}} events={events.map((event,index)=>projectLaplaceEvent(event,{roomId:1,generation:0},index,event.ts)?.event).filter(Boolean) as any} stickyEvents={[]} renderMode={target==="live"?"dashboard":"obs"} scrollable /> : target === "obs" ? <ObsOutputView events={events} removingEventIds={removing} snapshot={createObsSnapshot(document,"obs","1",Number(query.get("scale")??1),DEFAULT_STICKY_EVENT_SETTINGS)} stickyCards={[]} stickyEvents={DEFAULT_STICKY_EVENT_SETTINGS} scrollDirection={flow} contentAlignment={align} softwareDisplay={display} compatibleMainRender={render} /> : <EventList events={events} visibleIndices={events.map((_, index) => index)} viewKey="investigation" feedKey="investigation" feedSession={session}
      liveLayout displayScale={Number(query.get("scale")??1)} scrollDirection={flow} contentAlignment={align} compatibleEventRender={render}
      eventMenuHandlers={{onSpeakEvent:()=>{},isFavorite:()=>false,onToggleFavorite:()=>{},onPlayGiftEffect:()=>play(false,true)}}
      onPlayGiftEffect={()=>play(false,true)}
      displayPreferences={display} />}
    {query.has("effects") && <GiftEffectOverlay enabled={effectsEnabled} notices={notices} roomKey={room} />}
  </section></>;
}
createRoot(document.getElementById("root")!).render(<App />);
