export function laplaceEditorIdentity(node: Element, selection: { identityPriority?: readonly string[]; scopeSelectors: { identities: Record<string, string> } }): string {
  const event = node.closest('.event') ?? node;
  const selectors = selection.scopeSelectors.identities;
  const priority = [...new Set([...(selection.identityPriority ?? []), ...Object.keys(selectors)])];
  for (const identity of priority) {
    const selector = selectors[identity];
    if (selector && event.matches(selector)) return identity;
  }
  return 'all';
}
