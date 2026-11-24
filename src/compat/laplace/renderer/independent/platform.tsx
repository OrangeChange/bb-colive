import * as React from 'react';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import postcss from 'postcss';
import valueParser from 'postcss-value-parser';

export function OriginalScrollArea({ viewportRef, className, children, onScrollPositionChange, scrollbarSize = 0 }: { viewportRef: React.Ref<HTMLDivElement>; className?: string; children: React.ReactNode; onScrollPositionChange?: () => void; scrollbarSize?: number }) {
  return <ScrollArea.Root dir="ltr" data-slot="scroll-area" className={`relative overflow-hidden ${className || ''}`} style={{ '--scrollbar-size': `${scrollbarSize}px` } as React.CSSProperties}>
    <ScrollArea.Viewport ref={viewportRef} className="scroll-area size-full focus-visible:outline-ac/20 [&>div]:block!" onScroll={onScrollPositionChange}>{children}</ScrollArea.Viewport>
    <ScrollArea.Scrollbar orientation="vertical" style={{ width: scrollbarSize }}><ScrollArea.Thumb /></ScrollArea.Scrollbar>
    <ScrollArea.Corner />
  </ScrollArea.Root>;
}

export function useOriginalStyle(value: () => string, name: string) {
  const css = value();
  React.useEffect(() => {
    const fonts = new Set<string>();
    if (css.includes('@font-face')) {
      try {
        postcss.parse(css).walkAtRules('font-face', rule => {
          rule.walkDecls('src', declaration => {
            const source = valueParser(declaration.value).nodes.find(node => node.type === 'function' && node.value.toLowerCase() === 'url');
            const url = source?.type === 'function' ? source.nodes[0]?.value : undefined;
            if (url && /^https?:\/\//.test(url)) fonts.add(url);
          });
        });
      } catch { /* Browser-recoverable CSS remains handled by the stylesheet. */ }
    }
    const preloads = [...fonts].map(url => {
      const link = document.createElement('link');
      link.rel = 'preload'; link.as = 'font'; link.href = url;
      link.crossOrigin = 'anonymous'; link.referrerPolicy = 'no-referrer';
      document.head.append(link);
      return link;
    });
    const style = document.createElement('style'); style.id = `dynamic-${name}`; style.textContent = css;
    document.head.appendChild(style);
    return () => { style.remove(); preloads.forEach(link => link.remove()); };
  }, [css, name]);
}

type Spring = { stiffness?: number; damping?: number; mass?: number };
function springMotion(spring: Spring) {
  const stiffness = spring.stiffness ?? 1000, damping = spring.damping ?? 100, mass = spring.mass ?? 1;
  const positions: number[] = [];
  let position = 0, velocity = 0;
  const step = 0.001;
  do {
    velocity += (stiffness * (1 - position) - damping * velocity) / mass * step;
    position += velocity * step;
    positions.push(position);
  } while (positions.length < 5000 && (Math.abs(1 - position) >= 0.0001 || Math.abs(velocity) >= 0.0001));
  const samples = [0, ...Array.from({ length: 80 }, (_, index) => positions[Math.ceil((index + 1) * positions.length / 80) - 1]), 1];
  return {
    duration: positions.length,
    easing: CSS.supports('animation-timing-function', 'linear(0, 1)')
      ? `linear(${samples.map(value => value.toFixed(4)).join(', ')})`
      : 'cubic-bezier(0.16, 1, 0.3, 1)',
  };
}

type FlipProps = { className?: string; flipKey: string; spring?: Spring; enabled?: boolean; children: React.ReactNode };
type Boxes = Map<string, DOMRect>;
export class Flipper extends React.Component<FlipProps> {
  private root: HTMLDivElement | null = null;
  private animations = new Set<Animation>();
  private rows() { return [...this.root?.querySelectorAll<HTMLElement>('[data-flip-id]') || []].filter(node => node.closest('[data-flip-root]') === this.root); }
  getSnapshotBeforeUpdate(previous: FlipProps): Boxes | null {
    if (!this.root || this.props.enabled === false || window.matchMedia('(prefers-reduced-motion: reduce)').matches || this.root.closest('.reduced-motion')) {
      for (const animation of this.animations) animation.cancel(); this.animations.clear();
      return null;
    }
    if (previous.flipKey === this.props.flipKey) return null;
    for (const animation of this.animations) animation.cancel(); this.animations.clear();
    return new Map(this.rows().map(node => [node.dataset.flipId!, node.getBoundingClientRect()]));
  }
  componentDidUpdate(_previous: FlipProps, _state: unknown, boxes: Boxes | null) {
    if (!boxes) return;
    const spring = springMotion(this.props.spring || {});
    for (const row of this.rows()) {
      const previous = boxes.get(row.dataset.flipId!); if (!previous) continue;
      const next = row.getBoundingClientRect(), x = previous.left - next.left, y = previous.top - next.top;
      const scaleX = next.width ? previous.width / next.width : 1, scaleY = next.height ? previous.height / next.height : 1;
      if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5 && Math.abs(scaleX - 1) < 0.001 && Math.abs(scaleY - 1) < 0.001) continue;
      const resized = Math.abs(scaleX - 1) >= 0.001 || Math.abs(scaleY - 1) >= 0.001;
      const start = resized ? `translate(${x}px, ${y}px) scale(${scaleX}, ${scaleY})` : `translate3d(${x}px, ${y}px, 0)`;
      const animation = row.animate([
        { transform: start, transformOrigin: '0 0' },
        { transform: 'none', transformOrigin: '0 0' },
      ], { duration: spring.duration, easing: spring.easing, fill: 'none' });
      this.animations.add(animation);
      animation.onfinish = animation.oncancel = () => this.animations.delete(animation);
    }
  }
  componentWillUnmount() { for (const animation of this.animations) animation.cancel(); this.animations.clear(); }
  render() { return <div ref={node => { this.root = node; }} data-flip-root="" className={this.props.className}>{this.props.children}</div>; }
}
export function Flipped({ flipId, children }: { flipId: string; children: React.ReactElement }) {
  return React.cloneElement(children, { 'data-flip-id': flipId } as Record<string, string>);
}
