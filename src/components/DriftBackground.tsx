/**
 * 弹幕漂移背景（签名元素，ui-design §五）：
 * 登录页与空态的底层，3~5 条低透明度仿真弹幕缓慢漂过。
 * prefers-reduced-motion 时降级为静态散布。
 */
import { useMemo } from "react";

const SAMPLES = [
  "前排！",
  "来了来了",
  "主播声音真好听",
  "23333",
  "哈哈哈哈哈",
  "666666",
  "泪目",
  "太强了吧",
  "awa",
  "好耶！",
  "就是这个人",
  "下次一定",
];

interface DriftItem {
  text: string;
  top: number; // %
  left: number; // 静态降级时用
  duration: number; // s
  delay: number; // 负值：立即处于漂移中途
  size: number; // px
}

const reduced =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function DriftBackground() {
  const items = useMemo<DriftItem[]>(
    () =>
      Array.from({ length: 5 }, () => ({
        text: SAMPLES[Math.floor(Math.random() * SAMPLES.length)],
        top: 6 + Math.random() * 82,
        left: 5 + Math.random() * 65,
        duration: 45 + Math.random() * 30,
        delay: -Math.random() * 60,
        size: 13 + Math.random() * 5,
      })),
    [],
  );

  return (
    <div className="drift-background pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {items.map((item, i) =>
        reduced ? (
          <span
            key={i}
            className="drift-item text-t3/60"
            style={{ top: `${item.top}%`, left: `${item.left}%`, fontSize: item.size }}
          >
            {item.text}
          </span>
        ) : (
          <span
            key={i}
            className="drift-item text-t3/50"
            style={{
              top: `${item.top}%`,
              fontSize: item.size,
              animationDuration: `${item.duration}s`,
              animationDelay: `${item.delay}s`,
            }}
          >
            {item.text}
          </span>
        ),
      )}
    </div>
  );
}
