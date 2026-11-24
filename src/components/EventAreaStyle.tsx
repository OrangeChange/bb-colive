import { useId } from "react";
import { createEventAreaConfigCss, type EventAreaStyleInput } from "../eventAreaStyleConfig";

/** 每个区域实例生成一份有限配置，与事件数量无关。 */
export function useEventAreaStyle(input: EventAreaStyleInput) {
  const scope = useId();
  const css = createEventAreaConfigCss(scope, input);
  return {
    scope,
    css,
    style: <style data-event-style-config={scope}>{css}</style>,
  };
}
