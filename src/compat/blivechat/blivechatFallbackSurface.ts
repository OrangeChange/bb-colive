export interface BlivechatFallbackStyle { scope: string; css: string }

const fallbackSheets = new WeakMap<ShadowRoot, Map<Element, { node: HTMLElement; value: string }>>();

export function readBlivechatFallbackPresentation(parentDocument: Document, variableSource: HTMLElement) {
  const variables = new Map<string,string>();
  const computed = parentDocument.defaultView?.getComputedStyle(variableSource);
  if (computed) for (let index=0;index<computed.length;index++) {
    const name=computed.item(index);if(name.startsWith('--'))variables.set(name,computed.getPropertyValue(name));
  }
  for(let index=0;index<variableSource.style.length;index++) {
    const name=variableSource.style.item(index);if(name.startsWith('--'))variables.set(name,variableSource.style.getPropertyValue(name));
  }
  const sources=[...parentDocument.head.querySelectorAll<HTMLStyleElement|HTMLLinkElement>('style,link[rel="stylesheet"]')].map(source=>{
    const value=source.tagName==='STYLE'?source.textContent??'':(source as HTMLLinkElement).href;
    let css:string|undefined;
    if(source.tagName==='LINK')try{if(source.sheet)css=[...source.sheet.cssRules].map(rule=>rule.cssText).join('\n');}catch{/* Cross-origin links retain their stylesheet link. */}
    return {source,value,css};
  });
  return {variables,sources};
}

export function mountBlivechatFallbackRoot(slot: HTMLElement, parentDocument: Document, variableSource: HTMLElement, eventStyle?: BlivechatFallbackStyle, presentation=readBlivechatFallbackPresentation(parentDocument,variableSource)): ShadowRoot {
  const root = slot.shadowRoot ?? slot.attachShadow({ mode: "open" });
  let styles = root.querySelector<HTMLElement>("[data-blivechat-fallback-styles]");
  if (!styles) {
    styles = parentDocument.createElement("div");
    styles.setAttribute("data-blivechat-fallback-styles", "");
    root.prepend(styles);
  }
  let sheets = fallbackSheets.get(root);
  if (!sheets) { sheets = new Map(); fallbackSheets.set(root, sheets); }
  const sources = presentation.sources.map(item=>item.source);
  for (const [source, item] of sheets) if (!sources.includes(source as HTMLStyleElement)) { item.node.remove(); sheets.delete(source); }
  for (const {source,value,css:loadedCss} of presentation.sources) {
    const previous = sheets.get(source);
    if (previous?.value === value) continue;
    const node = loadedCss === undefined ? source.cloneNode(true) as HTMLElement : parentDocument.createElement("style");
    if (loadedCss !== undefined) node.textContent = loadedCss;
    if (previous && source.tagName === "STYLE") { previous.node.textContent = value; previous.value = value; continue; }
    if (!previous && node.tagName === "LINK") {
      slot.style.visibility = "hidden";
      node.dataset.fallbackPending = "true";
      node.addEventListener("load", () => { delete node.dataset.fallbackPending; if (!styles.querySelector("[data-fallback-pending]")) slot.style.removeProperty("visibility"); }, { once: true });
    }
    if (previous && node.tagName === "LINK") {
      node.addEventListener("load", () => previous.node.remove(), { once: true });
      previous.node.after(node);
    } else if (previous) previous.node.replaceWith(node); else styles.append(node);
    sheets.set(source, { node, value });
  }
  const previousEventStyle = root.querySelector("[data-blivechat-fallback-event-css]");
  if (eventStyle) {
    const style = previousEventStyle ?? parentDocument.createElement("style");
    style.setAttribute("data-blivechat-fallback-event-css", eventStyle.scope);
    if (style.textContent !== eventStyle.css) style.textContent = eventStyle.css;
    if (!previousEventStyle) styles.after(style);
  } else previousEventStyle?.remove();
  for(const[name,value]of presentation.variables)if(slot.style.getPropertyValue(name)!==value)slot.style.setProperty(name,value);
  if(slot.style.getPropertyValue('zoom'))slot.style.removeProperty("zoom");
  return root;
}

