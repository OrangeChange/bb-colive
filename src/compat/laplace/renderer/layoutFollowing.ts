import { flowGeometry } from "./flowGeometry";
export function laplaceAutoScrollBehavior(rate: number): ScrollBehavior {
  return rate > 6 ? 'auto' : 'smooth';
}

/** 保留阅读位置；迟到的布局变化在事件滚动结束后补偿。 */
export function attachLaplaceLayoutFollowing(node: HTMLElement, ports = {
  observe: (callback: () => void) => new ResizeObserver(callback),
  request: (callback: FrameRequestCallback) => requestAnimationFrame(callback),
  cancel: (id: number) => cancelAnimationFrame(id),
  writingMode: () => getComputedStyle(node).writingMode,
  fonts: document.fonts,
}, allowed: () => boolean = () => true, direction: 'top' | 'bottom' = 'bottom') {
  const geometry = () => `${node.clientWidth}:${node.clientHeight}:${node.scrollWidth}:${node.scrollHeight}`;
  const atBottom = () => direction === 'top' ? flowGeometry(node).position <= 2 : flowGeometry(node).extent - flowGeometry(node).viewport - flowGeometry(node).position <= 2;
  let previous = geometry(), following = allowed(), automatic = false, frame: number | undefined, disposed = false;
  let pendingLayout = false;
  let scrollRequest = 0, completionPending = false;
  let destination: number | undefined;
  let scrollBehavior: ScrollBehavior | undefined;
  let anchor: { node: HTMLElement; offset: number; rows: HTMLElement[] } | undefined;
  const horizontal = flowGeometry(node).horizontal;
  const paddingProperty = horizontal ? (ports.writingMode().endsWith('-rl') ? 'padding-left' : 'padding-right') : 'padding-bottom';
  const content = (node.firstElementChild ?? node) as HTMLElement;
  const originalPadding = content.style.getPropertyValue(paddingProperty);
  const originalPriority = content.style.getPropertyPriority(paddingProperty);
  const basePadding = parseFloat(getComputedStyle(content).getPropertyValue(paddingProperty)) || 0;
  let readingReserve = 0;
  const clearReserve = () => {
    if (!readingReserve) return;
    content.style.setProperty(paddingProperty, originalPadding, originalPriority);
    readingReserve = 0;
  };
  const rememberAnchor = () => {
    const flow = flowGeometry(node);
    const rows = [...node.querySelectorAll<HTMLElement>('[data-event-id]')];
    const row = rows.find(row => {
      const box = row.getBoundingClientRect();
      return flow.offset(row) + (flow.horizontal ? box.width : box.height) > 0;
    });
    anchor = row ? { node: row, offset: flow.offset(row), rows } : undefined;
  };
  const atDestination = () => {
    const flow = flowGeometry(node);
    const target = Math.min(destination ?? 0, Math.max(0, flow.extent - flow.viewport));
    return Math.abs(flow.position - target) <= 2;
  };
  const finishScroll = () => {
    if (disposed) return;
    automatic = false;
    completionPending = false;
    if (pendingLayout) layout();
  };
  const scrollToEnd = (behavior: ScrollBehavior = 'auto') => {
    following = true;
    pendingLayout = false;
    if (frame !== undefined) { ports.cancel(frame); frame = undefined; }
    clearReserve();
    const flow = flowGeometry(node);
    const target = direction === 'top' ? 0 : Math.max(0, flow.extent - flow.viewport);
    if (automatic && destination === target && scrollBehavior === behavior) return;
    destination = target;
    scrollBehavior = behavior;
    if (Math.abs(flow.position - target) <= 0.5) { previous = geometry(); return; }
    automatic = true;
    previous = geometry();
    const request = ++scrollRequest;
    const completion = flow.scroll(target, behavior);
    completionPending = Boolean(completion);
    if (completion) void completion.then(() => {
      if (disposed || request !== scrollRequest) return;
      completionPending = false;
      if (automatic && atDestination()) finishScroll();
    });
  };
  const layout = () => {
    if (disposed || geometry() === previous && !pendingLayout) return;
    pendingLayout = true;
    if (automatic || frame !== undefined) return;
    frame = ports.request(() => {
      frame = undefined;
      if (disposed) return;
      if (automatic) return;
      pendingLayout = false;
      if (following && allowed()) scrollToEnd('auto');
      else if (anchor) {
        if (!node.contains(anchor.node)) {
          const index = anchor.rows.indexOf(anchor.node);
          const survivor = [...anchor.rows.slice(index + 1), ...anchor.rows.slice(0, index).reverse()].find(row => node.contains(row));
          if (survivor) anchor.node = survivor;
        }
        if (!node.contains(anchor.node)) { previous = geometry(); return; }
        const flow = flowGeometry(node);
        const target = flow.position + flow.offset(anchor.node) - anchor.offset;
        const shortage = target - Math.max(0, flow.extent - flow.viewport);
        if (shortage > 0) {
          readingReserve += shortage;
          content.style.setProperty(paddingProperty, `${basePadding + readingReserve}px`);
        }
        if (Math.abs(flowGeometry(node).position - target) > 0.5) flowGeometry(node).scroll(target);
      }
      previous = geometry();
    });
  };
  const scroll = () => {
    if (automatic) { if (!completionPending && atDestination()) finishScroll(); return; }
    if (geometry() !== previous) { layout(); return; }
    following = atBottom();
    if (!following) rememberAnchor();
  };
  const scrollEnd = () => { if (automatic && !completionPending && atDestination()) finishScroll(); };
  const pauseFollowing = () => {
    automatic = false;
    scrollRequest++; completionPending = false;
    following = false;
    if (frame !== undefined) { ports.cancel(frame); frame = undefined; }
  };
  const reading = (event: Event) => {
    if (event instanceof KeyboardEvent && !['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key)) return;
    pauseFollowing();
    following = event instanceof WheelEvent && event.deltaY >= 0 && atBottom();
  };
  const observer = ports.observe(layout);
  const mutations = new MutationObserver(() => {
    if (following && allowed()) return;
    pendingLayout = true;
    layout();
  });
  mutations.observe(content, {childList: true, subtree: true});
  observer.observe(node);
  if (node.firstElementChild) observer.observe(node.firstElementChild);
  node.addEventListener('scroll', scroll);
  node.addEventListener('scrollend', scrollEnd);
  node.addEventListener('wheel', reading, {passive:true});
  node.addEventListener('touchstart', reading, {passive:true});
  node.addEventListener('keydown', reading);
  node.addEventListener('load', layout, true);
  ports.fonts?.addEventListener('loadingdone', layout);
  return {scrollToEnd, rememberReadingPosition: rememberAnchor, followEvents(behavior: ScrollBehavior) {
    if (allowed()) scrollToEnd(behavior);
  }, pause() {
    const wasAutomatic = automatic;
    pauseFollowing();
    if (wasAutomatic) { const flow = flowGeometry(node); flow.scroll(flow.position, 'auto'); }
    rememberAnchor();
  }, dispose() {
    disposed = true; observer.disconnect(); mutations.disconnect();
    clearReserve();
    if (frame !== undefined) ports.cancel(frame);
    node.removeEventListener('scroll', scroll); node.removeEventListener('scrollend', scrollEnd);
    node.removeEventListener('wheel', reading); node.removeEventListener('touchstart', reading); node.removeEventListener('keydown', reading);
    node.removeEventListener('load', layout, true); ports.fonts?.removeEventListener('loadingdone', layout);
  }};
}
