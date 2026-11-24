import { readUiSource } from "./readUiSource.mjs";
import assert from "node:assert/strict";

export function readApplicationSources() {
  const read = (path) => readUiSource(new URL(`../../${path}`, import.meta.url), "utf8");
  const app = read("src/App.tsx");
  for (const entry of ["useArchiveInitialization", "useAuxiliaryWindows", "useApplicationLifecycle", "collectApplicationDiagnosticSnapshot"]) {
    assert.match(app, new RegExp(`\\b${entry}\\(`), `主窗口需要调用 ${entry}`);
  }
  return [app,
    read("src/main.tsx"),
    read("src/archive/useArchiveInitialization.ts"),
    read("src/windows/useAuxiliaryWindows.ts"),
    read("src/runtime/useApplicationLifecycle.ts"),
    read("src/diagnostics/applicationSnapshot.ts"),
  ].join("\n");
}
