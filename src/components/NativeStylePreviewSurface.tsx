import type { NativeThemeSettings } from "../themes/nativeComponentAppearance.ts";
import type { ComponentProps } from "react";
import { IsolatedPreviewFrame } from "./IsolatedPreviewFrame.tsx";
import { StylePreviewArea } from "./StylePreviewArea.tsx";
import type { NativeStylePreviewPayload } from "../preview/stylePreviewState.ts";

export function NativeStylePreviewSurface({ payload, readingResetKey, ...props }: Omit<ComponentProps<typeof IsolatedPreviewFrame>, "children" | "previewCss"> & { payload: NativeStylePreviewPayload; readingResetKey?: string | number }) {
 return <IsolatedPreviewFrame {...props} previewCss={payload.previewCss + (payload.previewMotion === "design" && props.onContentClick ? "\n.event,.event *{pointer-events:auto!important}" : "")}>
   <StylePreviewArea {...payload} maskUsername={payload.context !== "live" && payload.context !== "review" && (payload.eventStyleSettings as NativeThemeSettings).display?.maskUsername === true} showStickyPreview={payload.context !== "live" && payload.context !== "review"} followLatest readingResetKey={readingResetKey} />
 </IsolatedPreviewFrame>;
}
