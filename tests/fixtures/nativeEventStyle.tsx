import { createRoot } from "react-dom/client";
import { useState } from "react";
import { EventRow } from "../../src/components/EventRow";
import { DEFAULT_EVENT_DISPLAY_PREFERENCES } from "../../src/eventDisplaySettings";
import { getNativeEventSample, nativeEventSamples } from "./nativeEventSamples";
import "../../src/shadcn.css";
import { Task4Fixture } from "./task4EventStyle";
import { Task1MediaFixture } from './task1EventMedia';

const layouts = [
  { name: "现场布局", key: "live", props: { liveLayout: true } },
  { name: "回看布局", key: "review", props: { reviewLayout: true } },
  { name: "默认布局", key: "default", props: {} },
];

const localImage = "/wealth-levels/1.png";
const alternateImage = "/wealth-levels/2.png";
const failedImage = "/__native-event-fixture__/missing-image.png";

export function Task3MediaFixture() {
  const [avatar, setAvatar] = useState<string | undefined>(localImage);
  const [showAvatar, setShowAvatar] = useState(true);
  const [showGiftImage, setShowGiftImage] = useState(true);
  const [giftMode, setGiftMode] = useState<"local" | "fallback" | "failed" | "absent">("local");
  const [emoteFailed, setEmoteFailed] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [effectClicks, setEffectClicks] = useState(0);
  const [parentClicks, setParentClicks] = useState(0);
  const samples = ["text", "normal-gift", "free-gift", "blind-gift", "mixed-emote", "big-emote", "banner-emote", "translated-sc", "deleted-sc", "guard-special", "lottery-start", "pocket-start", "lottery-result", "pocket-result"].map((key) => {
    const event = getNativeEventSample(key);
    if (event.user) event.user.avatar = avatar;
    if (event.gift) {
      event.gift.webp = giftMode === "absent" ? undefined : giftMode === "local" ? localImage : failedImage;
      event.gift.gif = giftMode === "absent" || giftMode === "local" ? undefined : `${failedImage}?candidate=gif`;
      event.gift.icon = giftMode === "absent" ? undefined : giftMode === "failed" ? `${failedImage}?candidate=icon` : alternateImage;
      event.gift.blindWebp = giftMode === "absent" ? undefined : giftMode === "failed" ? failedImage : alternateImage;
      event.gift.blindGif = undefined;
      event.gift.blindIcon = undefined;
    }
    if (event.emoticon) event.emoticon.url = emoteFailed ? failedImage : localImage;
    if (event.emotes) for (const emote of Object.values(event.emotes)) emote.url = emoteFailed ? failedImage : localImage;
    return { key, event };
  });
  const unitOnly = getNativeEventSample("guard-special"); unitOnly.guard!.unit = "天";
  if (unitOnly.user) unitOnly.user.avatar = avatar;
  samples.push({ key: "guard-unit-only", event: unitOnly });
  const deletedTranslated = getNativeEventSample("translated-sc"); deletedTranslated.scDeleted = true;
  if (deletedTranslated.user) deletedTranslated.user.avatar = avatar;
  samples.push({ key: "deleted-translated-sc", event: deletedTranslated });
  return <section data-task3-fixture>
    <h2 className="ui-type-section-title">Task3 固定媒体场景</h2>
    <p className="ui-type-control">合成头像和礼物图使用随软件打包的财富图片。失败场景使用不存在的本地地址，不依赖远程图片成功，不连接直播间、不写入档案。</p>
    <div className="flex flex-wrap gap-2" style={{ marginBlock: 12 }}>
      <button type="button" onClick={() => setAvatar(localImage)}>本地头像</button>
      <button type="button" onClick={() => setAvatar(undefined)}>头像缺失</button>
      <button type="button" onClick={() => setAvatar(failedImage)}>头像失败</button>
      <button type="button" onClick={() => setAvatar(alternateImage)}>头像恢复</button>
      <button type="button" onClick={() => setShowAvatar((value) => !value)}>{showAvatar ? "关闭头像" : "显示头像"}</button>
      <button type="button" onClick={() => setShowGiftImage((value) => !value)}>{showGiftImage ? "关闭礼物图片" : "显示礼物图片"}</button>
      <button type="button" onClick={() => setGiftMode("fallback")}>礼物候选回退</button>
      <button type="button" onClick={() => setGiftMode("failed")}>礼物全部失败</button>
      <button type="button" onClick={() => setGiftMode("absent")}>礼物无图源</button>
      <button type="button" onClick={() => setEmoteFailed(true)}>表情失败</button>
      <button type="button" onClick={() => { setGiftMode("local"); setEmoteFailed(false); }}>恢复媒体</button>
      <button type="button" onClick={() => { setEpoch((value) => value + 1); setEffectClicks(0); setParentClicks(0); }}>重新挂载样本</button>
    </div>
    <p role="status" data-task3-clicks>特效点击 {effectClicks} · 父级点击 {parentClicks}</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
      {layouts.map(({ name, key, props }) => <section key={`${key}-${epoch}`} data-task3-layout={key} style={{ minWidth: 0 }}>
        <h3 className="ui-type-section-title">{name}</h3>
        {samples.map(({ key: sampleKey, event }) => <div key={sampleKey} data-task3-sample={sampleKey} style={{ marginBottom: 8 }} onClick={() => setParentClicks((value) => value + 1)}>
          <p className="ui-type-micro text-t3">{sampleKey} · 合成</p>
          <EventRow ev={event} showTime={false} animateOnMount={false}
            displayPreferences={{ ...DEFAULT_EVENT_DISPLAY_PREFERENCES, showAvatar, showGiftImage }} {...props}
            giftEffectResolver={(ev) => ev.gift ? { id: 1, giftIds: [ev.gift.id], planPlatforms: [], webMp4: "", webMp4Json: "" } : null}
            onPlayGiftEffect={() => setEffectClicks((value) => value + 1)} />
        </div>)}
      </section>)}
    </div>
  </section>;
}

function Fixture() {
  if (new URLSearchParams(window.location.search).get("task") === "1") return <main className="bg-bg text-t1" style={{ padding: 16, height: '100vh', overflow: 'auto' }}><Task1MediaFixture /></main>;
  if (new URLSearchParams(window.location.search).get("task") === "4") return <Task4Fixture />;
  if (new URLSearchParams(window.location.search).get("task") === "3") return <main className="bg-bg text-t1" style={{ padding: 16, height: "100vh", overflow: "auto" }}><Task3MediaFixture /></main>;
  return <main className="bg-bg text-t1" style={{ padding: 16, minHeight: "100vh", overflow: "auto", height: "100vh" }}>
    <h1 className="ui-type-page-title">固定事件样本</h1>
    <p className="ui-type-control">合成样本，使用已认可的静态图片地址。不连接直播间、不进行网络采集、不写入档案；浏览器可能请求展示图片。</p>
    <p className="ui-type-control">当前真实事件行样式。现场、回看、弹幕窗和礼物窗的完整区域验收待后续阶段扩展。</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
      {layouts.map(({ name, props }) => <section key={name} style={{ minWidth: 0 }}>
        <h2 className="ui-type-section-title">{name}</h2>
        {nativeEventSamples.filter((sample) => sample.handling === "row").map((sample) => <div key={sample.key} data-sample={sample.key} style={{ marginBottom: 8 }}>
          <p className="ui-type-micro text-t3">{sample.key} · {sample.event.msgType} · 合成</p>
          <EventRow ev={sample.event} showTime={false} displayPreferences={DEFAULT_EVENT_DISPLAY_PREFERENCES} {...props} />
        </div>)}
      </section>)}
    </div>
    <h2 className="ui-type-section-title">统计与更新事件</h2>
    <p className="ui-type-control">这些样本更新统计或原留言，不追加显示行。</p>
    {nativeEventSamples.filter((sample) => sample.handling !== "row").map((sample) => <p key={sample.key} className="ui-type-meta">{sample.key} · {sample.event.msgType} · {sample.handling === "stats" ? "更新统计" : "更新原醒目留言"}</p>)}
  </main>;
}

if (typeof document !== "undefined") createRoot(document.getElementById("root")!).render(<Fixture />);
