import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { NativeCssCodeEditor } from "../src/components/NativeCssCodeEditor.tsx";
import "../src/App.css";
import "../src/components/nativeThemeEditor.css";

function Fixture() {
  const [value, setValue] = useState(".event {\n  color: #ffffff;\n}\n");
  return <main style={{ width: 720, height: 480, padding: 20, display: "flex", flexDirection: "column" }}>
    <NativeCssCodeEditor documentKey="custom" label="编辑自定义 CSS" readOnly={false} value={value} onChange={setValue} onSave={() => undefined} />
  </main>;
}

createRoot(document.getElementById("root")!).render(<Fixture />);
