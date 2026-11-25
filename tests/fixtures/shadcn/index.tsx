import { useState } from "react";
import { createRoot } from "react-dom/client";
import "../../../src/shadcn.css";
import "./review.css";
import { Button } from "../../../src/components/shadcn/button";
import { Separator } from "../../../src/components/shadcn/separator";
import { Moon, Sun } from "lucide-react";
function App() {
  const query = new URLSearchParams(location.search);
  const [dark, setDark] = useState(query.get("scheme") === "dark");
  const [palette, setPalette] = useState(
    query.get("palette") === "pine" ? "pine" : "sakura",
  );
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.dataset.theme = palette;
  const params = `scheme=${dark ? "dark" : "light"}&palette=${palette}`;
  return (
    <main className="comparison">
      <header className="comparison-header">
        <div className="comparison-brand">
          <img src="/icon.svg" alt="" />
          <div>
            <h1>组件迁移对比</h1>
            <p>BB CoLive · 相同内容、字体与品牌配色</p>
          </div>
        </div>
        <div className="comparison-options">
          <Button
            variant="outline"
            onClick={() => setPalette(palette === "sakura" ? "pine" : "sakura")}
          >
            {palette === "sakura" ? "樱花粉" : "青瓷绿"}
          </Button>
          <Button variant="outline" onClick={() => setDark(!dark)}>
            {dark ? <Moon /> : <Sun />}
            {dark ? "深色" : "浅色"}
          </Button>
        </div>
      </header>
      <Separator />
      <div className="comparison-columns">
        {["before", "after"].map((kind) => (
          <section key={kind}>
            <div className="comparison-column-title">
              <h2>{kind === "before" ? "当前组件" : "shadcn/ui · 适配后"}</h2>
              <span>
                {kind === "before"
                  ? "现有实现直接渲染"
                  : "官方 Radix Nova · 品牌主题"}
              </span>
            </div>
            <iframe
              onLoad={(e) => {
                const frame = e.currentTarget;
                frame.style.height = `${Math.max(1040, frame.contentDocument?.documentElement.scrollHeight ?? 0) + 2}px`;
              }}
              title={kind === "before" ? "迁移前" : "迁移后"}
              src={`./panel.html?kind=${kind}&${params}`}
              key={kind + params}
            />
          </section>
        ))}
      </div>
      <footer className="comparison-footer">
        这是可操作的组件试作，不保存设置，不影响正在运行的程序。
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
