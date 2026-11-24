import { useEffect, useRef, useState } from "react";
import { EventRow } from "../../src/components/EventRow";
import { EventRowSlot } from "../../src/components/EventRowSlot";
import { useEventAreaStyle } from "../../src/components/EventAreaStyle";
import { createDefaultEventStyleSettings, type EventStyleSettings } from "../../src/eventStyleSettings";
import { DEFAULT_EVENT_DISPLAY_PREFERENCES } from "../../src/eventDisplaySettings";
import { getNativeEventSample } from "./nativeEventSamples";

export const task4Variables = {
  "--event-font-size": "24px", "--event-line-height": "1.6", "--avatar-size": "32px",
  "--gift-icon-size": "32px", "--emote-size": "28px", "--big-emote-size": "80px",
  "--guard-badge-size": "32px", "--badge-font-size": "18px", "--fan-medal-scale": "1.5",
  "--wealth-medal-size": "24px", "--rank-badge-size": "20px", "--username-color": "rgb(100, 30, 180)",
  "--message-color": "rgb(20, 110, 160)", "--count-font-size": "22px", "--price-font-size": "23px",
  "--price-color": "rgb(180, 40, 60)", "--event-background": "rgb(220, 240, 225)",
  "--event-padding": "10px", "--event-gap": "10px", "--event-spacing": "8px",
  "--event-font-family": "serif", "--event-font-weight": "500", "--event-stroke-width": "1px",
  "--event-stroke-color": "rgb(200, 100, 20)", "--badge-color": "rgb(250, 250, 240)",
  "--badge-background": "rgb(40, 70, 100)",
};

export function readTask4DefaultResults(root: ParentNode) {
  return [...root.querySelectorAll<HTMLElement>("[data-task4-area]")].flatMap(area => {
    const live = ["a", "b", "chat", "pay"].includes(area.dataset.task4Area!);
    const expected = [
      [".event", "fontSize", live ? "16px" : "13px"],
      [".event", "lineHeight", "20px"],
      [".event", "gap", "8px"],
      ['[data-task4-sample="normal-gift"] .user', "gap", "2px 6px"],
      ['[data-task4-sample="normal-gift"] .gift-count', "fontSize", "14px"],
      ['[data-task4-sample="normal-gift"] .gift-count', "lineHeight", "20px"],
      ['[data-task4-sample="normal-gift"] .price', "fontSize", live ? "14px" : "12px"],
      ['[data-task4-sample="normal-gift"] .price', "lineHeight", "20px"],
      ['[data-task4-sample="translated-sc"] .price', "fontSize", live ? "14px" : "13px"],
      ['[data-task4-sample="translated-sc"] .price', "lineHeight", "20px"],
      [".banner-emote", "maxWidth", "240px"],
      [".banner-emote", "maxHeight", "20px"],
    ] as const;
    return expected.map(([selector, property, want]) => {
      const node = area.querySelector<HTMLElement>(selector);
      const actual = node ? getComputedStyle(node)[property] : "缺少部件";
      return { area: area.dataset.task4Area, selector, property, want, actual, pass: actual === want };
    });
  });
}

function samples() {
  const entries = ["text", "normal-gift", "free-gift", "blind-gift", "mixed-emote", "big-emote", "banner-emote", "translated-sc", "deleted-sc", "guard-special", "lottery-start", "pocket-start", "lottery-result", "pocket-result", "identity", "live-start", "live-end"].map(key => ({ key, event: getNativeEventSample(key) }));
  const unit = getNativeEventSample("guard-special"); unit.guard!.unit = "天";
  const deleted = getNativeEventSample("translated-sc"); deleted.scDeleted = true;
  entries.push({ key: "guard-unit-only", event: unit }, { key: "deleted-translated-sc", event: deleted });
  for (const { key, event } of entries) {
    if (event.user) {
      event.user.avatar = "/wealth-levels/1.png";
      if (key === "identity") { event.user.currentRank = 2; event.user.wealthLevel = 1; event.user.medal = { name: "固定牌", level: 21 }; }
    }
    if (event.gift) { event.gift.webp = "/wealth-levels/1.png"; event.gift.gif = undefined; event.gift.icon = undefined; event.gift.blindWebp = "/wealth-levels/2.png"; }
    if (event.emoticon) event.emoticon.url = "/wealth-levels/1.png";
    if (event.emotes) for (const emote of Object.values(event.emotes)) emote.url = "/wealth-levels/1.png";
  }
  return entries;
}

type Layout = "live" | "review" | "default" | "window";
export function Task4Area({ id, layout, fontSize, settings, narrow, textBadges, animateOnMount = false }: { id: string; layout: Layout; fontSize: number; settings: EventStyleSettings; narrow: boolean; textBadges: boolean; animateOnMount?: boolean }) {
  const area = useEventAreaStyle({ settings, layout, fontSize: layout === "review" || layout === "default" ? 13 : fontSize, bigEmoteSize: 40, padding: 6, spacing: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState("等待测量");
  const [revisions, setRevisions] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const nodes = [...ref.current.querySelectorAll<HTMLElement>(".event-row-slot")];
    const observer = new ResizeObserver(() => {
      const value = JSON.stringify(nodes.map(node => ({ sample: node.dataset.task4Sample, height: node.getBoundingClientRect().height, spacer: node.querySelector(".event-row-slot-spacer")?.getBoundingClientRect().height ?? 0 })));
      setGeometry(value); setRevisions(current => current + 1);
    });
    nodes.forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, []);
  const entries = samples();
  return <section data-task4-instance={id}>
    <h2>{id} · {layout}</h2>
    <div ref={ref} data-style-api="1" data-event-style-scope={area.scope} data-task4-area={id}
      className={`event-area ${layout === "window" ? `window ${id === "pay" ? "window-pay" : "window-chat"}` : layout === "default" ? "review" : layout}`}
      style={{ width: narrow ? 240 : 560, maxWidth: "100%" }}>
      {area.style}
      <div className="event-list">
        {entries.map(({ key, event }, index) => <EventRowSlot key={key} className="event-row-slot" data-task4-sample={key} showEventSpacing={index < entries.length - 1}>
          <EventRow ev={event} showTime={false} animateOnMount={animateOnMount} liveLayout={layout === "live" || layout === "window"} reviewLayout={layout === "review"}
            eventStyleSettings={settings} displayPreferences={{ ...DEFAULT_EVENT_DISPLAY_PREFERENCES, eventAnimationPreset: "lift", showCurrentRank: true, showHonorLevel: true, guardIdentityDisplayMode: textBadges ? "text" : "icon", honorLevelDisplayMode: textBadges ? "text" : "icon" }} />
        </EventRowSlot>)}
      </div>
    </div>
    <details><summary>槽位测量 · 更新 {revisions}</summary><output data-task4-geometry={id} data-resize-revisions={revisions}>{geometry}</output></details>
  </section>;
}

export function Task4Fixture() {
  const [settings, setSettings] = useState(createDefaultEventStyleSettings);
  const [fontSize, setFontSize] = useState(16);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [target, setTarget] = useState("a");
  const [ordinary, setOrdinary] = useState(false);
  const [inherited, setInherited] = useState(false);
  const [dark, setDark] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [textBadges, setTextBadges] = useState(false);
  const [animateOnMount, setAnimateOnMount] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const [defaultResults, setDefaultResults] = useState<ReturnType<typeof readTask4DefaultResults>>([]);
  useEffect(() => {
    const original = document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", dark);
    return () => { document.documentElement.classList.toggle("dark", original); };
  }, [dark]);
  const selector = `[data-task4-area="${target}"]`;
  const custom = `@layer custom { ${selector}{${Object.entries(variables).map(([name, value]) => `${name}:${value};`).join("")}} ${inherited ? '[data-task4-inheritance]{--message-color:rgb(120, 40, 180);--price-font-size:23px;--event-gap:10px;--badge-background:rgb(40, 70, 100);}' : ""} ${ordinary ? `${selector} .event {font-size:21px;padding:9px;background:rgb(230, 220, 240);} ${selector} .username {color:rgb(140, 20, 70);} ${selector} .gift-icon {width:36px;height:36px;}` : ""} }`;
  return <main ref={rootRef} data-task4-fixture className="bg-bg text-t1" style={{ padding: 16, height: "100vh", overflow: "auto" }}>
    <h1>Task4 参数与级联</h1>
    <p>固定本地图片；参数只改变本页，不写入设置。</p>
    <style data-task4-custom>{custom}</style>
    <div className="flex flex-wrap gap-2">
      <label>目标区域<select aria-label="目标区域" value={target} onChange={event => setTarget(event.target.value)}>{["a", "b", "review", "default", "chat", "pay"].map(id => <option key={id}>{id}</option>)}</select></label>
      <button onClick={() => setVariables({ ...task4Variables })}>全部变量</button>
      <button onClick={() => setVariables({ "--event-gap": "10px", "--count-font-size": "22px", "--price-font-size": "23px", "--username-color": "rgb(100, 30, 180)", "--message-color": "rgb(20, 110, 160)", "--badge-color": "rgb(250, 250, 240)", "--badge-background": "rgb(40, 70, 100)" })}>父区域变量</button>
      <button onClick={() => setVariables({ "--avatar-size": "2em", "--gift-icon-size": "1.25em", "--emote-size": "1em", "--big-emote-size": "3em" })}>跟随字号</button>
      <button onClick={() => setVariables({ "--avatar-size": "32px", "--gift-icon-size": "32px", "--emote-size": "28px", "--big-emote-size": "60px" })}>固定尺寸</button>
      <button onClick={() => setFontSize(18)}>字号18</button><button onClick={() => setFontSize(24)}>字号24</button>
      <button onClick={() => setVariables({ "--event-spacing": "8px" })}>间距8</button>
      <button onClick={() => setVariables({ "--big-emote-size": "80px", "--event-padding": "10px 6px" })}>大表情80</button>
      <button onClick={() => setOrdinary(value => !value)}>普通CSS覆盖</button>
      <button onClick={() => setInherited(value => !value)}>祖先继承</button>
      <button onClick={() => { const next = createDefaultEventStyleSettings(); next.roles.captain.username = { r: 80, g: 30, b: 180, a: 1 }; next.roles.anchor.inheritFrom = "captain"; next.eventTypes.gift.content = { r: 20, g: 110, b: 160, a: 1 }; setSettings(next); }}>角色继承与类型色</button>
      <button onClick={() => { const next = createDefaultEventStyleSettings(); next.roles.normal.background = { r: 40, g: 80, b: 120, a: .25 }; setSettings(next); }}>角色背景</button>
      <button onClick={() => { const next = createDefaultEventStyleSettings(); next.roles.normal.background = { r: 40, g: 80, b: 120, a: .25 }; next.eventTypes.system.background = { r: 0, g: 0, b: 0, a: 0 }; setSettings(next); }}>类型透明背景</button>
      <button onClick={() => setDark(value => !value)}>切换主题</button><button onClick={() => setNarrow(value => !value)}>窄宽240</button>
      <button onClick={() => setTextBadges(value => !value)}>徽章文字/图片</button>
      <button onClick={() => setAnimateOnMount(true)}>启用动画</button><button onClick={() => setAnimateOnMount(false)}>停用动画</button>
      <button onClick={() => { setVariables({}); setOrdinary(false); setInherited(false); setFontSize(16); setSettings(createDefaultEventStyleSettings()); }}>复原</button>
      <button onClick={() => { if (rootRef.current) setDefaultResults(readTask4DefaultResults(rootRef.current)); }}>默认核对</button>
    </div>
    <output data-task4-default-results>{defaultResults.length ? JSON.stringify({ total: defaultResults.length, failed: defaultResults.filter(result => !result.pass) }) : "复原后点击默认核对"}</output>
    <details><summary>逐项变量</summary><div className="grid grid-cols-2 gap-2">{Object.entries(task4Variables).map(([name, example]) => <label key={name}>{name}<input aria-label={name} placeholder={example} value={variables[name] ?? ""} onChange={event => setVariables(current => { const next = { ...current }; if (event.target.value) next[name] = event.target.value; else delete next[name]; return next; })} /><button onClick={() => setVariables(current => ({ ...current, [name]: example }))}>应用</button></label>)}</div></details>
    <div data-task4-inheritance className={dark ? "dark bg-bg text-t1" : "bg-bg text-t1"} style={{ display: "flex", flexWrap: "wrap", gap: 16, padding: 8 }}>
      {([{ id: "a", layout: "live", size: fontSize }, { id: "b", layout: "live", size: 16 }, { id: "review", layout: "review", size: 13 }, { id: "default", layout: "default", size: 13 }, { id: "chat", layout: "window", size: fontSize }, { id: "pay", layout: "window", size: fontSize }] as const).map(({ id, layout, size }) => <Task4Area key={id} id={id} layout={layout} fontSize={size} settings={settings} narrow={narrow} textBadges={textBadges} animateOnMount={animateOnMount} />)}
    </div>
  </main>;
}
