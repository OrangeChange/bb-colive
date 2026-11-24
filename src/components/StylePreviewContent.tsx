import { uiText } from "../i18n/index.ts";
import { useStylePreviewPresentation } from "../preview/useStylePreviewPresentation.ts";
import type { StylePreviewSnapshot } from "../preview/stylePreviewState.ts";
import { NativeStylePreviewSurface } from "./NativeStylePreviewSurface.tsx";
import {
  CompatibleThemePreview,
  getCompatibleThemeEditingSurface,
} from "./CompatibleThemePreview.tsx";
import { CompatibleOutputSchemeContext } from "../themes/compatPreviewScheme.ts";
import { ObsPreviewSurface } from "../obs/ObsPreviewSurface.tsx";
import type { PreviewFrame } from "../preview/stylePreviewState.ts";
const noop = () => {};
export function StylePreviewContent({
  state,
  transparent = false,
  onPreviewFrame,
}: {
  state: StylePreviewSnapshot;
  transparent?: boolean;
  onPreviewFrame?: (frame: PreviewFrame) => void;
}) {
  const ref = useStylePreviewPresentation(state);
  const scale = state.displayScale && state.displayScale > 0 ? state.displayScale : 1;
  const background =
    state.kind === "native"
      ? state.content.previewBackground
      : state.kind === "compatible"
        ? state.content.previewBackground
        : state.previewBackground ?? "transparent";
  let content;
  if (state.kind === "native") {
    const p = state.content;
    content = (
      <NativeStylePreviewSurface title={uiText("stylePreviewContent.title")} payload={p} previewScheme={state.scheme} previewPalette={state.palette} customColor={state.customColor} previewBackground={transparent ? "transparent" : background} readingResetKey={state.frame.restart} />
    );
  } else if (state.kind === "compatible") {
    const p = state.content,
      surface = getCompatibleThemeEditingSurface(p.document.mode);
    content = surface ? (
      <CompatibleThemePreview
        {...p}
        previewPolicy={p.previewPolicy}
        transparentCanvas
        previewScheme={state.scheme}
        previewWidth={undefined}
        previewBackground="transparent"
        capability={surface.capability}
        renderer={surface.renderer}
        composeCss={surface.composeCss}
        previewFrame={onPreviewFrame ? undefined : state.frame}
        onPreviewFrame={onPreviewFrame}
        onEditorInspection={noop}
      />
    ) : null;
  } else content = <ObsPreviewSurface state={state.content} scheme={state.scheme} palette={state.palette} />;
  return (
    <CompatibleOutputSchemeContext.Provider value={state.scheme}>
      <div
        className={`native-preview-stage${!transparent && background === "transparent" ? " is-checkerboard" : ""} is-${state.scheme}`}
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          overflow: "hidden",
          backgroundColor: transparent
            ? "transparent"
            : background === "transparent"
              ? undefined
              : background,
        }}
      >
        <div
          ref={ref}
          className={`shared-style-preview-content native-theme-preview is-${state.scheme}${!transparent && background === "transparent" ? " native-preview-stage is-checkerboard" : ""}`}
          data-preview-revision={state.revision}
          data-preview-kind={state.kind}
          style={{
            width: `${100 / scale}%`,
            height: `${100 / scale}%`,
            zoom: scale,
            flex: "none",
            position: "relative",
            overflow: "hidden",
            background: transparent
              ? "transparent"
              : background === "transparent"
                ? undefined
                : background,
          }}
        >
          {content}
        </div>
      </div>
    </CompatibleOutputSchemeContext.Provider>
  );
}
