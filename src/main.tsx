import "./brandMigration.ts";
import React from "react";
import { ObsExternalValidation } from "./obs/ObsExternalValidation.tsx";
import ReactDOM from "react-dom/client";
import "./App.css";
import { invoke } from "@tauri-apps/api/core";
import { installInteractionPolicy } from "./uiInteraction";
import { createDiagnosticContext, flushAllDiagnosticLogs, getDiagnosticContext } from "./diagnostics/diagnosticLogger.ts";
import { renderDiagnosticLogger } from "./diagnostics/renderLogger.ts";
import { recordFeatureActivity, type FeatureDiagnosticStage } from "./diagnostics/featureDiagnostics.ts";
import { installWindowDiagnosticReceiver, installWindowDiagnosticSender, stopWindowDiagnosticBridge } from "./diagnostics/windowDiagnosticBridge.ts";
import { isEventWindowKind } from './windows/eventWindowChannels';
import "./compat/blivechat/register.tsx";
import "./compat/openlive/register.tsx";
import "./compat/laplace/register.tsx";

installInteractionPolicy(document);

// 副窗口按原生标签加载共享事件窗口。
// 不带参数默认 main
const windowType = new URLSearchParams(window.location.search).get("window") || "main";
if (windowType === "display") document.documentElement.dataset.window = "display";
if (isEventWindowKind(windowType) && windowType !== 'display') document.documentElement.dataset.window = "gift";

async function mount() {
  let Component: React.ComponentType;
  if (isEventWindowKind(windowType)) {
    (await import("./theme.ts")).initTheme();
    await installWindowDiagnosticSender(windowType);
    const { FloatingEventWindow } = await import("./windows/FloatingEventWindow");
    Component = () => <FloatingEventWindow kind={windowType} />;
  } else if (windowType === "native-style-preview") {
    Component = (await import("./components/NativeStylePreviewWindow.tsx")).NativeStylePreviewWindow;

  } else {
    createDiagnosticContext({
      invoke: (command, args) => invoke(command, args),
    });
    await installWindowDiagnosticReceiver({
      recordApp: (input) => {
        if (typeof input.data?.featureId === "string" && typeof input.data.stage === "string") {
          recordFeatureActivity(input.data.featureId, input.data.stage as FeatureDiagnosticStage, input.outcome, "app");
        }
        return getDiagnosticContext().record(input);
      },
      recordRender: (input) => {
        if ("featureId" in input) {
          recordFeatureActivity(input.featureId, input.stage as FeatureDiagnosticStage, input.outcome, "render");
          return renderDiagnosticLogger.recordFeature(input);
        }
        return renderDiagnosticLogger.record(input);
      },
      flushLogs: flushAllDiagnosticLogs,
    });
    await (await import("./obs/obsService.ts")).startObsHost();
    Component = (await import("./App")).default;
  }
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <Component />
      {windowType === "main" && <ObsExternalValidation />}
    </React.StrictMode>,
  );
}
void mount();
if (import.meta.hot) import.meta.hot.dispose(stopWindowDiagnosticBridge);
