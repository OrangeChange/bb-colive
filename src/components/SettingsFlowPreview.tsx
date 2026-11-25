import { Button } from "./shadcn/button";
import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import { useEffect, useRef } from "react";
import { Play } from "lucide-react";
import { getEventAnimationDuration, type EventAnimationPreset } from "../eventDisplaySettings";
import type { LiveScrollDirection } from "../events/feedScroll";

export function SettingsFlowPreview({ alignment, direction, preset, duration }: {
  alignment: "top" | "bottom" | undefined;
  direction: LiveScrollDirection;
  preset: EventAnimationPreset;
  duration: number;
}) {
  useUiLanguage();
  const newestRef = useRef<HTMLParagraphElement>(null);
  const animationRef = useRef<Animation | null>(null);
  useEffect(() => () => { animationRef.current?.cancel(); }, [alignment, direction, preset, duration]);

  const replay = () => {
    animationRef.current?.cancel();
    const milliseconds = getEventAnimationDuration(preset, duration);
    if (!newestRef.current || !milliseconds || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const initial: Keyframe = { opacity: 0 };
    if (preset === "lift") initial.transform = "translateY(6px)";
    if (preset === "scale") initial.transform = "scale(.985)";
    if (preset === "slide") initial.transform = "translateX(-12px)";
    animationRef.current = newestRef.current.animate([initial, { opacity: 1, transform: "none" }], { duration: milliseconds, easing: "ease-out" });
  };
  const samples = [
    { name: "小橙子", text: "晚上好！", newest: true },
    { name: "小鱼", text: "今天也来听歌", newest: false },
    { name: "青禾", text: "主播好", newest: false },
  ];
  if (direction === "bottom") samples.reverse();

  return <section className="settings-flow-preview" aria-label={uiText("uiControls.flowRegion")}>
    <div className="settings-flow-preview-header ui-type-meta text-t3">
      <span>{uiText("uiControls.flowPreview")}</span>
      <Button variant="outline" type="button" className="settings-inline-button settings-flow-play" onClick={replay}
        disabled={alignment === undefined || getEventAnimationDuration(preset, duration) === 0}
        title={preset === "none" ? uiText("uiControls.noAnimation") : duration === 0 ? uiText("uiControls.zeroDuration") : uiText("uiControls.previewOnly")}>
        <Play size={14} aria-hidden="true" />{uiText("uiControls.playAnimation")}
      </Button>
    </div>
    {alignment === undefined ? <p className="settings-hint">{uiText("uiControls.selectAlignment")}</p> :
      <div className="settings-flow-preview-events" data-alignment={alignment}>
        {samples.map(sample => <p key={sample.name} ref={sample.newest ? newestRef : undefined} className="ui-type-meta text-t2">
          {sample.newest && <span className="settings-flow-new">{uiText("uiControls.newMarker")}</span>}{sample.name}：{sample.text}
        </p>)}
      </div>}
  </section>;
}
