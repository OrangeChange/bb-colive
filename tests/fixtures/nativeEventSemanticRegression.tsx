import { useState } from "react";
import { createRoot } from "react-dom/client";
import "../../src/shadcn.css";
import { EventRow } from "../../src/components/EventRow";
import { useEventAreaStyle } from "../../src/components/EventAreaStyle";
import { createDefaultEventStyleSettings } from "../../src/eventStyleSettings";
import { DEFAULT_EVENT_DISPLAY_PREFERENCES } from "../../src/eventDisplaySettings";
import { getNativeEventSample } from "./nativeEventSamples";

type Context = "live" | "review" | "chat" | "pay";
type Result = { check: string; pass: boolean; actual: unknown };
const contexts: Context[] = ["live", "review", "chat", "pay"];

function Area({ context }: { context: Context }) {
  const layout = context === "review" ? "review" : context === "live" ? "live" : "window";
  const settings = createDefaultEventStyleSettings();
  settings.eventTypes.lottery.content = { r: 255, g: 0, b: 0, a: 1 };
  settings.eventTypes.redPocket.content = { r: 255, g: 0, b: 0, a: 1 };
  const area = useEventAreaStyle({ settings, layout, fontSize: 16, bigEmoteSize: 40, padding: 6, spacing: 0 });
  const entries = ["translated-sc", "normal-gift", "lottery-start", "lottery-result", "pocket-result", "medal", "long-zh", "long-en", "long-emoji"];
  return <section><h2>{context}</h2><div data-semantic-context={context} data-event-style-scope={area.scope}
    className={`event-area ${layout === "window" ? `window window-${context}` : layout}`} style={{ width: 240 }}>
    {area.style}
    {entries.map(key => {
      const event = getNativeEventSample(key.startsWith("long") || key === "medal" ? "identity" : key);
      if (key === "medal") event.user = { uid: "medal-user", uname: "普通用户", guardLevel: 0, medal: { name: "十二级粉丝牌", level: 12 } };
      if (key.startsWith("long")) event.user = { ...getNativeEventSample("identity").user!, uname: key === "long-zh" ? "长中文昵称测试".repeat(5) : key === "long-emoji" ? "星光🧑‍🚀👨‍👩‍👧‍👦✨昵称".repeat(5) : "LongEnglishNameWithoutSpaces".repeat(4), avatar: "/wealth-levels/1.png", wealthLevel: 1 };
      if (event.user) event.user.avatar = "/wealth-levels/1.png";
      if (event.gift) event.gift.webp = "/wealth-levels/1.png";
      return <div data-semantic-sample={key} key={key}><EventRow ev={event} liveLayout={layout !== "review"} reviewLayout={layout === "review"}
        showTime={false} animateOnMount={false} eventStyleSettings={settings}
        displayPreferences={{ ...DEFAULT_EVENT_DISPLAY_PREFERENCES, showCurrentRank: true, showHonorLevel: true }} /></div>;
    })}
  </div></section>;
}

const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

export async function verifySemanticRegression() {
  const results: Result[] = [];
  const record = (check: string, actual: unknown, expected: unknown) => results.push({ check, pass: JSON.stringify(actual) === JSON.stringify(expected), actual });
  const style = document.createElement("style");
  document.head.append(style);
  const css = async (value: string) => { style.textContent = `@layer custom {${value}}`; await settle(); };
  const areas = contexts.map(context => document.querySelector<HTMLElement>(`[data-semantic-context="${context}"]`)!);
  const font = (node: Element) => [getComputedStyle(node).fontSize, getComputedStyle(node).lineHeight];
  try {
    for (const area of areas) {
      const context = area.dataset.semanticContext!;
      const titles = [...area.querySelectorAll<HTMLElement>(".action")].filter(node => ["天选福袋", "天选开奖", "红包开奖"].includes(node.textContent!.trim()));
      for (const title of titles) record(`${context} 设置正文颜色 ${title.textContent}`, getComputedStyle(title).color, "rgb(255, 0, 0)");
      const medal = area.querySelector('[data-semantic-sample="medal"] .fan-medal')!;
      record(`${context} 粉丝牌默认文字`, [".medal-name", ".medal-level"].map(selector => getComputedStyle(medal.querySelector(selector)!).color), ["rgb(255, 255, 255)", "rgb(255, 255, 255)"]);
    }
    const medalBackgrounds = areas.map(area => getComputedStyle(area.querySelector('[data-semantic-sample="medal"] .fan-medal')!).backgroundImage);
    await css('[data-semantic-context] .event {--badge-color:rgb(255,0,0);--message-color:rgb(0,0,255);--username-color:rgb(0,128,0)}');
    for (const area of areas) {
      for (const node of area.querySelectorAll('[data-semantic-sample="medal"] .medal-name,[data-semantic-sample="medal"] .medal-level')) record(`${area.dataset.semanticContext} 自定义徽章颜色`, getComputedStyle(node).color, "rgb(255, 0, 0)");
      for (const node of area.querySelectorAll('.type-lottery .action,.redpocket-result .action')) record(`${area.dataset.semanticContext} 局部正文颜色`, getComputedStyle(node).color, "rgb(0, 0, 255)");
      record(`${area.dataset.semanticContext} 用户名颜色独立`, getComputedStyle(area.querySelector('[data-semantic-sample="medal"] .username')!).color, "rgb(0, 128, 0)");
    }
    record("粉丝牌渐变保持不变", areas.map(area => getComputedStyle(area.querySelector('[data-semantic-sample="medal"] .fan-medal')!).backgroundImage), medalBackgrounds);
    await css('[data-semantic-context=live] .message,[data-semantic-context=live] .bili-translation {--event-font-size:30px;--event-line-height:2}');
    const sc = areas[0].querySelector('[data-semantic-sample="translated-sc"]')!;
    for (const selector of [".message", ".bili-translation"]) record(`局部 ${selector} 字号行高`, font(sc.querySelector(selector)!), ["30px", "60px"]);
    record("实例字号隔离", font(areas[2].querySelector('[data-semantic-sample="translated-sc"] .message')!), ["16px", "20px"]);
    await css('[data-semantic-context=live] .event {--event-font-size:30px;--event-line-height:2}');
    for (const selector of [".message", ".bili-translation"]) record(`根参数 ${selector}`, font(sc.querySelector(selector)!), ["30px", "60px"]);
    await css('[data-semantic-context=live] .message,[data-semantic-context=live] .bili-translation {font-size:31px;line-height:2} [data-semantic-context] .action{color:rgb(128,0,128)}');
    for (const selector of [".message", ".bili-translation"]) record(`直接 CSS ${selector}`, font(sc.querySelector(selector)!), ["31px", "62px"]);
    record("直接标题颜色覆盖", getComputedStyle(areas[0].querySelector('.type-lottery .action')!).color, "rgb(128, 0, 128)");
    await css('[data-semantic-context] .gift-icon,[data-semantic-context] .mod-badge,[data-semantic-context] .fan-medal {--event-font-size:30px}');
    for (const area of areas) {
      const live = area.dataset.semanticContext !== "review";
      record(`${area.dataset.semanticContext} 局部礼物图片尺寸`, getComputedStyle(area.querySelector('.gift-icon')!).width, live ? "37.5px" : "20px");
      record(`${area.dataset.semanticContext} 局部粉丝牌高度`, getComputedStyle(area.querySelector('.fan-medal')!).height, live ? "33.75px" : "18px");
      record(`${area.dataset.semanticContext} 局部房管徽章字级`, getComputedStyle(area.querySelector('.mod-badge')!).fontSize, live ? "22.5px" : "10px");
    }
    await css('');
    record("正文撤销覆盖", font(sc.querySelector('.message')!), ["16px", "20px"]);
    for (const area of areas) record(`${area.dataset.semanticContext} 粉丝牌撤销覆盖`, getComputedStyle(area.querySelector('[data-semantic-sample="medal"] .medal-name')!).color, "rgb(255, 255, 255)");
    await css('[data-semantic-context] .event{--event-font-size:24px}');
    for (const width of [240, 1700, 240]) {
      for (const area of areas) area.style.width = `${width}px`;
      await settle();
      for (const area of areas) for (const key of ["long-zh", "long-en", "long-emoji"]) {
        const event = area.querySelector(`[data-semantic-sample="${key}"] .event`)!;
        const username = event.querySelector('.username')!;
        record(`${area.dataset.semanticContext} ${key} ${width} 无横向溢出`, event.scrollWidth <= event.clientWidth, true);
        record(`${area.dataset.semanticContext} ${key} ${width} 三点显隐`, username.querySelector('[aria-hidden="true"]')?.textContent ?? "", width === 240 ? "..." : "");
        const text = username.firstElementChild!.firstElementChild!;
        record(`${area.dataset.semanticContext} ${key} ${width} 末字完整显示`, text.scrollWidth <= text.clientWidth, true);
        const original = username.getAttribute('title')!;
        const boundaries = [...new Intl.Segmenter("zh-CN", { granularity: "grapheme" }).segment(original)].map(({ index, segment }) => index + segment.length);
        record(`${area.dataset.semanticContext} ${key} ${width} 完整字符边界`, original.startsWith(text.textContent!) && boundaries.includes(text.textContent!.length), true);
      }
    }
  } finally { style.remove(); for (const area of areas) area.style.width = "240px"; }
  return results;
}

function Fixture() {
  const [results, setResults] = useState<Result[]>([]);
  return <main className="bg-bg text-t1" style={{ padding: 16 }}><h1>事件语义回归验收</h1>
    <button onClick={async () => setResults(await verifySemanticRegression())}>运行回归核验</button>
    <output data-semantic-results>{JSON.stringify({ total: results.length, failed: results.filter(result => !result.pass), results }, null, 2)}</output>
    {contexts.map(context => <Area key={context} context={context} />)}
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
