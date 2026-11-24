export interface ImageTargetContext {
  box: boolean;
  replaced: boolean;
  reference: Element | null;
  clipping: Element[];
  before: { occupied: boolean; image: string };
  after: { occupied: boolean; image: string };
}

export function inspectImageTarget(element: HTMLElement): ImageTargetContext {
  const view = element.ownerDocument.defaultView!;
  const style = view.getComputedStyle(element);
  const replaced = /^(IMG|SVG|VIDEO|CANVAS|INPUT|IFRAME)$/i.test(
    element.tagName,
  );
  const pseudo = (name: string) => {
    const s = view.getComputedStyle(element, name);
    return {
      occupied:
        !["none", "normal"].includes(s.content) ||
        s.backgroundImage !== "none" ||
        s.animationName !== "none" ||
        s.transform !== "none",
      image: s.backgroundImage,
    };
  };
  const clipping: Element[] = [];
  let reference: Element | null = null;
  for (let node: Element | null = element; node; node = node.parentElement) {
    const s = view.getComputedStyle(node);
    if (
      !reference &&
      (s.position !== "static" ||
        s.transform !== "none" ||
        s.perspective !== "none" ||
        s.filter !== "none" ||
        /(layout|paint|strict|content)/.test(s.contain))
    )
      reference = node;
    if (
      node !== element &&
      /(hidden|clip|scroll|auto)/.test(s.overflowX + " " + s.overflowY)
    )
      clipping.push(node);
  }
  return {
    box: !["none", "contents"].includes(style.display),
    replaced,
    reference,
    clipping,
    before: pseudo("::before"),
    after: pseudo("::after"),
  };
}
