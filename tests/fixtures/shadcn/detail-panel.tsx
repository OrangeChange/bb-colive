import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ThemeColorField } from "../../../src/components/ThemeColorField";
import { ThemeColorField as BaselineColorField } from "./baseline/ThemeColorField";
import { DateTimeField } from "../../../src/components/DateTimeField";
import "../../../src/components/nativeThemeEditor.css";
const q = new URLSearchParams(location.search),
  after = q.get("kind") === "after",
  section = q.get("section");
document.documentElement.classList.toggle("dark", q.get("scheme") === "dark");
if (after) await import("../../../src/shadcn.css");
else await import("../../../src/App.css");
function App() {
  const [date, setDate] = useState<Date | undefined>(
    new Date(2026, 10, 25, 19, 30),
  );
  const [color, setColor] = useState("rgba(212, 56, 112, 0.75)");
  const [preview, setPreview] = useState("");
  const Field = after ? ThemeColorField : BaselineColorField;
  const text = date
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
    : "";
  return (
    <main style={{ padding: 28, fontSize: 14 }}>
      <label style={{ display: "block", marginBottom: 10 }}>
        {section === "date" ? "开始时间" : "文字颜色"}
      </label>
      {section === "date" ? (
        after ? (
          <DateTimeField label="开始时间" value={date} onChange={setDate} />
        ) : (
          <input
            aria-label="开始时间"
            type="datetime-local"
            step="60"
            value={text}
            onChange={(e) =>
              setDate(e.target.value ? new Date(e.target.value) : undefined)
            }
            style={{
              height: 32,
              padding: "0 10px",
              width: "100%",
              border: "1px solid var(--border)",
              borderRadius: 6,
              background: "var(--bg)",
              color: "var(--text-1)",
            }}
          />
        )
      ) : (
        <>
          <Field
            label="文字颜色"
            value={color}
            onChange={setColor}
            onPreviewChange={setPreview}
            onPreviewCancel={() => setPreview("")}
          />
          <div
            style={{
              marginTop: 26,
              padding: 16,
              borderRadius: 6,
              background: "var(--surface-raised)",
              color: preview || color,
              fontSize: 18,
            }}
          >
            直播中的每一个瞬间
          </div>
          <output
            style={{
              display: "block",
              marginTop: 12,
              color: "var(--text-2)",
              fontSize: 12,
            }}
          >
            {color}
          </output>
        </>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
