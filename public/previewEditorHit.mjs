const parentParts = new Set(['event', 'stickyEvent', 'user', 'userInfo', 'meta']);
const contains = (box, point) => box.width > 0 && box.height > 0 && point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom;

export function pickPreviewEditorPart(target, selectors, point, accepts = () => true) {
  const candidates = [];
  for (const [part, branches] of Object.entries(selectors ?? {})) for (const selector of branches) {
    let node;
    try { node = target.closest(selector); } catch { continue; }
    if (!node || !accepts(part, node)) continue;
    const box = node.getBoundingClientRect();
    if (point && !contains(box, point)) continue;
    let distance = 0;
    for (let current = target; current && current !== node; current = current.parentElement) distance++;
    const specificity = (selector.match(/#[\w-]+/g) ?? []).length * 100 + (selector.match(/\.[\w-]+|\[[^\]]+\]|:[\w-]+/g) ?? []).length * 10;
    const priority = part === 'stickyEvent' ? 3 : part === 'message' ? 2 : part === 'event' ? 0 : 1;
    candidates.push({ part, node, distance, specificity, priority, box });
  }
  candidates.sort((a,b) => a.distance-b.distance || b.priority-a.priority || b.specificity-a.specificity);
  const best = candidates[0];
  if (!best) return null;
  if (point) {
    const parent = candidates.find(candidate => candidate.node !== best.node && parentParts.has(candidate.part) &&
      Math.min(point.x-candidate.box.left,candidate.box.right-point.x,point.y-candidate.box.top,candidate.box.bottom-point.y) <= 2);
    if (parent) return parent;
  }
  return best;
}

export function installPreviewEditorHover(root, pick) {
  const doc = root.ownerDocument ?? root;
  const style = doc.createElement('style');
  style.textContent = '[data-compatible-editor-hover]{outline:2px solid var(--preview-editor-accent,currentColor)!important;outline-offset:-2px!important}';
  doc.head.append(style);
  let hovered = null;
  const clear = () => { hovered?.removeAttribute('data-compatible-editor-hover'); hovered = null; };
  const move = event => {
    const next = pick(event)?.node ?? null;
    if (next === hovered && next?.hasAttribute("data-compatible-editor-hover")) return;
    clear(); hovered = next; hovered?.setAttribute('data-compatible-editor-hover','');
  };
  root.addEventListener('pointermove', move);
  root.addEventListener('pointerleave', clear);
  root.addEventListener('scroll', clear, true);
  return () => { clear(); style.remove(); root.removeEventListener('pointermove',move);root.removeEventListener('pointerleave',clear);root.removeEventListener('scroll',clear,true); };
}

export function previewEditorAccent(doc, scheme) {
  const probe = doc.createElement('html');
  probe.dataset.theme = doc.documentElement.dataset.theme;
  probe.classList.toggle('dark', scheme === 'dark');
  let color = doc.defaultView.getComputedStyle(doc.documentElement).getPropertyValue('--accent').trim();
  const visit = rules => {
    for (const rule of rules) {
      const accent = rule.style?.getPropertyValue('--accent');
      if (accent && rule.selectorText && probe.matches(rule.selectorText.replaceAll(':root','html'))) color = accent.trim();
      if (rule.cssRules) visit(rule.cssRules);
    }
  };
  for (const sheet of doc.styleSheets) { try { visit(sheet.cssRules); } catch {} }
  return color;
}
