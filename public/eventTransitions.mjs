const entered = new WeakSet();

/** Host event motion composes with source layout transforms. */
export function applyEventTransition(node, animation, removing = false) {
  const preset = (animation?.durationMs ?? 0) > 0 ? animation.preset : 'none';
  node.dataset.eventMotion = preset;
  node.dataset.eventMotionRemoving = String(removing);
  node.style.setProperty('--event-motion-duration', `${Math.max(0, animation?.durationMs ?? 0)}ms`);
  if (preset === 'none') delete node.dataset.eventMotionEntering;
  if (entered.has(node)) return;
  entered.add(node);
  const view = node.ownerDocument.defaultView;
  const doc = node.ownerDocument;
  if (preset === 'none' || removing || doc.visibilityState === 'hidden' || view.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  node.dataset.eventMotionEntering = '';
  let frame;
  const onVisibility = () => {
    if (doc.visibilityState !== 'hidden') return;
    view.cancelAnimationFrame(frame);
    node.dataset.eventMotion = 'none';
    delete node.dataset.eventMotionEntering;
    doc.removeEventListener('visibilitychange', onVisibility);
  };
  doc.addEventListener('visibilitychange', onVisibility);
  frame = view.requestAnimationFrame(() => {
    frame = view.requestAnimationFrame(() => {
      delete node.dataset.eventMotionEntering;
      doc.removeEventListener('visibilitychange', onVisibility);
    });
  });
}

export const EVENT_TRANSITION_CSS = `
[data-event-motion]:not([data-event-motion="none"]){transition-property:opacity,translate,scale;transition-duration:var(--event-motion-duration,0ms);transition-timing-function:ease-out}
[data-event-motion-entering]{transition:none}
[data-event-motion-entering],[data-event-motion-removing="true"]{opacity:0}
[data-event-motion-entering][data-event-motion="lift"]{translate:0 6px}
[data-event-motion-entering][data-event-motion="scale"]{scale:.985}
[data-event-motion-entering][data-event-motion="slide"]{translate:-12px 0}
[data-event-motion-removing="true"]{pointer-events:none;transition-timing-function:ease-in}
[data-event-motion-removing="true"][data-event-motion="lift"]{translate:0 -4px}
[data-event-motion-removing="true"][data-event-motion="scale"]{scale:.985}
[data-event-motion-removing="true"][data-event-motion="slide"]{translate:12px 0}
[data-event-motion-removing="true"][data-event-motion="none"]{visibility:hidden}
@media(prefers-reduced-motion:reduce){[data-event-motion]:not([data-event-motion="none"]){transition:none!important;translate:none!important;scale:none!important}}
`;
