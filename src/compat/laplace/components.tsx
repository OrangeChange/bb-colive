import { maskLaplaceNames } from "../../events/displayNameProjection.ts";
import { createElement, useState } from "react";
import type { DanmakuEvent } from "../../protocol/types.ts";
import { projectLaplaceEvent } from "./projection.ts";
import { DEFAULT_LAPLACE_SETTINGS } from "./settings.ts";
import { LaplaceEventRenderer, LaplaceRenderContext } from "./renderer/independent";
import type { LaplaceThemeSettings } from "../../themes/compatThemeSettings.ts";

export function projectDanmakuToLaplace(event: DanmakuEvent) {
  return (
    projectLaplaceEvent(
      event,
      { roomId: event.roomId, generation: 1 },
      1,
      event.ts,
    )?.event ?? null
  );
}

export function LaplaceEvent({
  event,
  placement,
  settings,
  mode = "obs",
}: {
  event: DanmakuEvent;
  placement: "main" | "sticky";
  settings: LaplaceThemeSettings;
  mode?: "dashboard" | "obs";
}) {
  const [expanded, setExpanded] = useState(false);
  const data = projectDanmakuToLaplace(event);
  if (!data) return null;
  const options = {
    ...DEFAULT_LAPLACE_SETTINGS,
    ...settings,
    showGiftHighlightAbove: settings.showGiftHighlightAbove ?? 30,
    classicElementScope: settings.classicElementScope ?? false,
  };
  const renderedData = settings.maskUsername && mode !== "dashboard" ? maskLaplaceNames(data) : data;
  const eventNode = createElement(LaplaceEventRenderer, {
    data: renderedData,
    as: placement === "sticky" ? "sticky" : "normal",
    mode,
  });
  const content =
    placement === "sticky"
      ? createElement(
          "div",
          {
            className: "laplace-sticky-root",
            role: "button",
            tabIndex: 0,
            "aria-expanded": expanded,
            onClick: () => setExpanded((value) => !value),
            onKeyDown: (keyboardEvent: {
              key: string;
              preventDefault(): void;
            }) => {
              if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                keyboardEvent.preventDefault();
                setExpanded((value) => !value);
              }
            },
          },
          eventNode,
          expanded
            ? createElement(
                "div",
                { className: "laplace-detail-root" },
                createElement(LaplaceEventRenderer, {
                  data: renderedData,
                  as: "normal",
                  mode,
                }),
              )
            : null,
        )
      : eventNode;
  return createElement(
    LaplaceRenderContext.Provider,
    { value: { settings: options, dashboardLiveGuards: {} } },
    content,
  );
}

const sceneClass = (value: string) =>
  `scene-${value.trim().replace(/[^a-z0-9_-]+/gi, "-") || "default"}`;

export function LaplaceEventSurface(props: Parameters<typeof LaplaceEvent>[0]) {
  return createElement(
    "div",
    { className: `events-list-wrap ${sceneClass(props.settings.sceneName ?? "default")}` },
    createElement(LaplaceEvent, props),
  );
}
