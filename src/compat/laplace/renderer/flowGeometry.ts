export function flowGeometry(node: HTMLElement) {
  const mode = getComputedStyle(node).writingMode;
  const horizontal = mode.startsWith('vertical') || mode.startsWith('sideways');
  const sign = mode.endsWith('-rl') ? -1 : 1;
  return {
    horizontal,
    position: horizontal ? node.scrollLeft * sign : node.scrollTop,
    extent: horizontal ? node.scrollWidth : node.scrollHeight,
    viewport: horizontal ? node.clientWidth : node.clientHeight,
    offset(element: Element) {
      const box = element.getBoundingClientRect(), root = node.getBoundingClientRect();
      return horizontal ? (sign < 0 ? root.right - box.right : box.left - root.left) : box.top - root.top;
    },
    scroll(position: number, behavior: ScrollBehavior = 'auto'): Promise<void> | void {
      return node.scrollTo(horizontal ? {left: position * sign, behavior} : {top: position, behavior});
    },
  };
}
