import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "../../../src/components/shadcn/button";
import "../../../src/shadcn.css";
import "./review.css";
function App() {
  const q = new URLSearchParams(location.search),
    [section, setSection] = useState(
      q.get("section") === "color" ? "color" : "date",
    ),
    [dark, setDark] = useState(q.get("scheme") === "dark");
  document.documentElement.classList.toggle("dark", dark);
  return (
    <main className="comparison">
      <header className="comparison-header">
        <div className="comparison-brand">
          <img src="/icon.svg" alt="" />
          <div>
            <h1>日期与颜色控件</h1>
            <p>
              {section === "date"
                ? "原日期时间控件 / 日历与时分同组选择"
                : "相同取色核心 / 统一格式选择与输入状态"}
            </p>
          </div>
        </div>
        <div className="comparison-options">
          <Button
            variant={section === "date" ? "default" : "outline"}
            onClick={() => setSection("date")}
          >
            日期
          </Button>
          <Button
            variant={section === "color" ? "default" : "outline"}
            onClick={() => setSection("color")}
          >
            颜色
          </Button>
          <Button variant="outline" onClick={() => setDark(!dark)}>
            {dark ? "深色" : "浅色"}
          </Button>
        </div>
      </header>
      <div className="comparison-columns">
        {["before", "after"].map((kind) => (
          <section key={kind}>
            <div className="comparison-column-title">
              <h2>{kind === "before" ? "当前控件" : "shadcn/ui · 试作"}</h2>
            </div>
            <iframe
              style={{ height: 650 }}
              title={kind === "before" ? "迁移前" : "迁移后"}
              key={kind + section + dark}
              src={`./detail-panel.html?kind=${kind}&section=${section}&scheme=${dark ? "dark" : "light"}`}
            />
          </section>
        ))}
      </div>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
