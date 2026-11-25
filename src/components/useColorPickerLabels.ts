import { useLayoutEffect, type RefObject } from "react";
import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";

/** react-colorful 的交互层不提供语言参数，沿用原有滑块及键盘行为。 */
export function useColorPickerLabels(container: RefObject<HTMLElement | null>) {
  useUiLanguage();
  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const saturation = root.querySelector(
      '[class~="react-colorful__saturation"] [role="slider"]',
    );
    const hue = root.querySelector(
      '[class~="react-colorful__hue"] [role="slider"]',
    );
    const alpha = root.querySelector(
      '[class~="react-colorful__alpha"] [role="slider"]',
    );
    saturation?.setAttribute("aria-label", uiText("uiControls.color"));
    const values = saturation
      ?.getAttribute("aria-valuetext")
      ?.match(/\d+(?:\.\d+)?/g);
    if (values?.length === 2)
      saturation?.setAttribute(
        "aria-valuetext",
        uiText("uiControls.colorValue", {
          saturation: values[0],
          brightness: values[1],
        }),
      );
    hue?.setAttribute("aria-label", uiText("uiControls.hue"));
    alpha?.setAttribute("aria-label", uiText("uiControls.alpha"));
  });
}
