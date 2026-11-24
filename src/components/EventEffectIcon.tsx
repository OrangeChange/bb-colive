/** 图标尺寸与布局由事件语义类控制，按钮只提供手动播放。 */
export function EventEffectIcon({ src, className, label, onPlay }: { src: string; className: string; label: string; onPlay?: () => void }) {
  if (!onPlay) return <img className={className} src={src} alt="" draggable={false} />;
  return <button type="button" className={`${className} event-effect-trigger`} aria-label={label} title={label}
    onClick={event => { event.stopPropagation(); onPlay(); }}>
    <img className="event-effect-image" src={src} alt="" draggable={false} />
  </button>;
}
