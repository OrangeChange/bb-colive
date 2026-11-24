import { uiText } from "../i18n/index.ts";
import { IsolatedPreviewFrame } from "../components/IsolatedPreviewFrame.tsx";
import { ObsStateView } from "./ObsStateView.tsx";
import type { ObsWireState } from "./obsProtocol.ts";
import "./obs.css";

export function ObsPreviewSurface({ state, scheme, palette }: { state: ObsWireState; scheme: "light" | "dark"; palette: import("../theme.ts").Palette }) {
  const content = <ObsStateView state={state} scheme={scheme} />;
  return (state.snapshot.mode ?? "native") === "native" ? <IsolatedPreviewFrame title={uiText("obsPreviewSurface.title")} previewCss="" previewScheme={scheme} previewPalette={palette} customColor={state.customColor} previewBackground="transparent">{content}</IsolatedPreviewFrame> : content;
}
