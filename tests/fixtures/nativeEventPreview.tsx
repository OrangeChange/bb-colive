import { useState } from "react";
import { StylePreviewArea } from "../../src/components/StylePreviewArea";
import type { StylePreviewContext, StylePreviewMode } from "../../src/components/stylePreviewContext";
import { DEFAULT_EVENT_DISPLAY_PREFERENCES } from "../../src/eventDisplaySettings";
import { createDefaultEventStyleSettings } from "../../src/eventStyleSettings";
import { getNativeEventSample, nativeEventSamples } from "./nativeEventSamples";

export function NativeEventPreview() {
  const [context, setContext] = useState<StylePreviewContext>("live");
  const [mode, setMode] = useState<StylePreviewMode>("current");
  const [display, setDisplay] = useState({ ...DEFAULT_EVENT_DISPLAY_PREFERENCES });
  const [settings] = useState(createDefaultEventStyleSettings);
  const [failed, setFailed] = useState(false);
  const [mainSize] = useState(16);
  const [windowSize] = useState(22);
  const [narrow, setNarrow] = useState(false);
  const events = nativeEventSamples.filter(sample => sample.handling === "row").map(sample => {
    const event = getNativeEventSample(sample.key);
    const image = failed ? "/__native-event-fixture__/missing.png" : "/wealth-levels/1.png";
    if (event.user) event.user.avatar = image;
    if (event.gift) { event.gift.webp = image; event.gift.icon = undefined; event.gift.gif = undefined; event.gift.blindWebp = image; }
    if (event.emoticon) event.emoticon.url = image;
    if (event.emotes) for (const emote of Object.values(event.emotes)) emote.url = image;
    return event;
  });
  const input = { eventStyleSettings: settings, displayPreferences: display, eventFontSize: mainSize, windowEventFontSize: windowSize };
  return <section data-preview-fixture>
    <p>合成本地媒体样本，复用已认可财富图片；不连接直播间、不写入档案。</p>
    <div className="flex flex-wrap gap-2" aria-label="预览控制">
      {([ ["live", "现场"], ["review", "回看"], ["window-chat", "弹幕窗"], ["window-pay", "礼物窗"] ] as const).map(([value, label]) => <button key={value} aria-pressed={context === value} onClick={() => setContext(value)}>{label}</button>)}
      <button onClick={() => setMode("all")} aria-pressed={mode === "all"}>全部部件</button>
      <button onClick={() => setMode("current")} aria-pressed={mode === "current"}>当前设置</button>
      <button onClick={() => setDisplay(value => ({ ...value, showAvatar: false, showGuardIdentity: false, showAdminIdentity: false, showAnchorIdentity: false, showFanMedal: false, showHonorLevel: false, showCurrentRank: false, showGiftImage: false }))}>隐藏身份与媒体</button>
      <button onClick={() => setDisplay(value => ({ ...value, showGuardIdentity: true, showHonorLevel: true, guardIdentityDisplayMode: "text", honorLevelDisplayMode: "text" }))}>身份文字</button>
      <button onClick={() => setDisplay(value => ({ ...value, showGuardIdentity: true, showHonorLevel: true, guardIdentityDisplayMode: "icon", honorLevelDisplayMode: "icon" }))}>身份图标</button>
      <button onClick={() => setFailed(value => !value)}>图片成功／失败</button>
      <button onClick={() => setDisplay({ ...DEFAULT_EVENT_DISPLAY_PREFERENCES })}>恢复设置</button>
      <button onClick={() => setNarrow(value => !value)}>{narrow ? "宽区域" : "窄区域240"}</button>
    </div>
    <output data-preview-fixture-state>{JSON.stringify({ context, mode, mainSize, windowSize, failed, narrow, display })}</output>
    <div style={{ height: 520, width: narrow ? 240 : 760, maxWidth: "100%", display: "flex", flexDirection: "column" }}><StylePreviewArea context={context} mode={mode} events={events} {...input} /></div>
  </section>;
}
