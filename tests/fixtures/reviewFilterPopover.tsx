import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ReviewFilterPopover } from "../../src/components/ReviewFilterPopover";
import { ReviewFilterSubmenu } from "../../src/components/ReviewSearchControls";
import "../../src/App.css";

function Fixture() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const anchorRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return <main style={{ padding: 40 }}>
    <h1>筛选浮层交互验证</h1>
    <section ref={anchorRef} style={{ width: 420 }}>
      <button ref={triggerRef} aria-controls="fixture-filter" onClick={() => setOpen(!open)}>更多筛选</button>
    </section>
    <button style={{ position: "fixed", right: 40, top: 40 }} onClick={() => {}}>外部按钮</button>
    <output aria-label="父层状态">{open ? "打开" : "关闭"}</output>
    <output aria-label="已选子项">{selected.join("、") || "无"}</output>
    <ReviewFilterPopover open={open} onOpenChange={setOpen} anchorRef={anchorRef} triggerRef={triggerRef}>
      <input aria-label="关键词" />
      <ReviewFilterSubmenu label="礼物" active filterMode="include"
        options={[{ value: "普通礼物", label: "普通礼物" }, { value: "付费礼物", label: "付费礼物" }]}
        isSelected={(value) => selected.includes(value)} onPrimaryToggle={() => {}}
        onToggle={(value) => setSelected((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])} />
      <input aria-label="下一个条件" />
    </ReviewFilterPopover>
  </main>;
}

document.addEventListener("keydown", (event) => {
  console.log(JSON.stringify({ type: event.type, key: event.key, focus: (document.activeElement as HTMLElement)?.getAttribute("aria-label") ?? document.activeElement?.textContent }));
});
document.addEventListener("focusin", (event) => {
  const target = event.target as HTMLElement;
  console.log(JSON.stringify({ type: event.type, focus: target.getAttribute("aria-label") ?? target.textContent }));
});
createRoot(document.getElementById("root")!).render(<Fixture />);
