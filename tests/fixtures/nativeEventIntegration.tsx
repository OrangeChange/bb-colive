import { createRoot } from "react-dom/client";
import { NativeEventPreview } from "./nativeEventPreview";
import { NativeEventLive, NativeEventReview } from "./nativeEventFeeds";
import { useEffect, useState } from "react";
import "../../src/App.css";
import { Task1MediaFixture } from './task1EventMedia';
import { Task2LotteryHosts } from './task2LotteryHosts';
import { AvatarFrameStability } from './avatarFrameStability';

function Fixture() {
  const [tab, setTab] = useState("preview");
  const [dark, setDark] = useState(false);
  const [scene, setScene] = useState(0);
  useEffect(() => {
    const original = document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", dark);
    return () => { document.documentElement.classList.toggle("dark", original); };
  }, [dark]);
  return <main className="bg-bg text-t1" style={{ height: "100vh", overflow: "auto", padding: 16 }}>
    <h1>事件集成验收</h1>
    <a href="./nativeEventStyle.html?task=4">公共参数矩阵</a>
    <div className="flex gap-2" aria-label="验收入口">
      <button onClick={() => setTab("preview")}>预览</button><button onClick={() => setTab("live")}>现场列表</button><button onClick={() => setTab("review")}>回看时间线</button>
      <button onClick={() => setDark(value => !value)}>{dark ? "浅色主题" : "深色主题"}</button>
      <button onClick={() => setScene(value => value + 1)}>恢复场景</button>
      <button onClick={() => setTab('media')}>阶段1媒体</button>
      <button onClick={() => setTab('lottery-live')}>阶段2现场名单</button>
      <button onClick={() => setTab('lottery-review')}>阶段2回看名单</button>
      <button onClick={() => setTab('lottery-hosts')}>阶段2宿主边界</button>
      <button onClick={() => setTab('pocket-live')}>红包中奖现场</button>
      <button onClick={() => setTab('pocket-review')}>红包中奖回看</button>
      <button onClick={() => setTab('avatar-stability')}>头像框位置</button>
    </div>
    {tab === 'avatar-stability' ? <AvatarFrameStability key={scene} /> : tab === 'pocket-live' ? <NativeEventLive key={`pocket-live:${scene}`} lotteryScene="pocket" /> : tab === 'pocket-review' ? <NativeEventReview key={`pocket-review:${scene}`} lotteryScene="pocket" /> : tab === 'media' ? <Task1MediaFixture key={scene} /> : tab === 'lottery-hosts' ? <Task2LotteryHosts key={scene} /> : tab === 'lottery-live' ? <NativeEventLive key={`lottery-live:${scene}`} lotteryScene /> : tab === 'lottery-review' ? <NativeEventReview key={`lottery-review:${scene}`} lotteryScene /> : tab === "preview" ? <NativeEventPreview key={scene} /> : tab === "live" ? <NativeEventLive key={scene} /> : <NativeEventReview key={scene} />}
  </main>;
}
if (typeof document !== "undefined") createRoot(document.getElementById("root")!).render(<Fixture />);
