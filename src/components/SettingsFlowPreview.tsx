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

  return <section className="settings-flow-preview" aria-label="信息流排列示意">
    <div className="settings-flow-preview-header ui-type-meta text-t3">
      <span>排列示意</span>
      <button type="button" className="settings-inline-button settings-flow-play" onClick={replay}
        disabled={alignment === undefined || getEventAnimationDuration(preset, duration) === 0}
        title={preset === "none" ? "当前为无动画" : duration === 0 ? "当前动画时长为 0" : "仅在示意中播放当前动画"}>
        <Play size={14} aria-hidden="true" />试播动画
      </button>
    </div>
    {alignment === undefined ? <p className="settings-hint">选择内容对齐后显示排列示意。</p> :
      <div className="settings-flow-preview-events" data-alignment={alignment}>
        {samples.map(sample => <p key={sample.name} ref={sample.newest ? newestRef : undefined} className="ui-type-meta text-t2">
          {sample.newest && <span className="settings-flow-new">新</span>}{sample.name}：{sample.text}
        </p>)}
      </div>}
  </section>;
}
