export function inspectEditorProperty(nodes, property, current = {}) {
  if(['background','borderImage'].includes(property)&&nodes.length)return {...current,applicable:nodes.every(node=>!['none','contents'].includes(node.ownerDocument.defaultView.getComputedStyle(node).display))};
  const sides = {
    paddingX: ['padding-inline-start', 'padding-inline-end'], paddingY: ['padding-block-start', 'padding-block-end'],
    marginX: ['margin-inline-start', 'margin-inline-end'], marginY: ['margin-block-start', 'margin-block-end'],
    borderWidth: ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width'],
    borderColor: ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'],
    borderRadius: ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'],
  }[property];
  if (!sides || !nodes.length) return current;
  let mixed = Boolean(current.mixed), applicable = true;
  for (const node of nodes) {
    const style = node.ownerDocument.defaultView.getComputedStyle(node);
    if (new Set(sides.map(side => style.getPropertyValue(side))).size > 1) mixed = true;
    if (property === 'marginY' && style.display === 'inline' && node.namespaceURI !== 'http://www.w3.org/2000/svg'
      && !['IMG', 'VIDEO', 'IFRAME', 'OBJECT', 'EMBED', 'INPUT', 'TEXTAREA', 'SELECT', 'CANVAS'].includes(node.tagName)) applicable = false;
  }
  return { ...current, mixed, applicable };
}
