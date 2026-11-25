import { useState } from "react";
import { createRoot } from "react-dom/client";
import { UiSelect } from "../../../src/components/ui/Select";
import "../../../src/shadcn.css";
function App() {
  const [value, setValue] = useState("short");
  return (
    <main style={{ padding: 24, display: "grid", gap: 24 }}>
      {[120, 320].map((width) => (
        <UiSelect
          key={width}
          ariaLabel={"选项宽度" + width}
          className="test-select-width"
          options={[
            { value: "short", label: "短选项" },
            {
              value: "long",
              label:
                "这是用于核对长选项显示的名称 Chinese English 日本語 123456789",
            },
          ]}
          value={value}
          onValueChange={setValue}
        />
      ))}
      <div
        style={{
          justifySelf: "end",
          width: 120,
          maxWidth: "100%",
          minWidth: 0,
        }}
      >
        <UiSelect
          ariaLabel="右侧选项"
          className="test-select-right"
          options={[
            { value: "short", label: "短选项" },
            {
              value: "long",
              label:
                "这是用于右侧展开核验的较长选项名称 Chinese English 日本語",
            },
          ]}
          value={value}
          onValueChange={setValue}
        />
      </div>
      <style>
        {
          ".test-select-width:first-child{width:120px}.test-select-width:nth-child(2){width:320px;max-width:100%}"
        }
      </style>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
