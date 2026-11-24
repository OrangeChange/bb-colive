export const COMPATIBLE_RECALL_CSS = '.event-recall-status{display:inline-block;margin-inline-start:.25em;padding-inline:.25em;border:1px solid currentColor;background:color-mix(in srgb,currentColor 8%,transparent);border-radius:.25em;vertical-align:baseline;font:inherit;line-height:inherit;white-space:nowrap;opacity:.7;text-decoration:none}';

export function reconcileCompatibleRecall(row, recalled, selector = '#message') {
  row.classList.toggle('event-recalled', recalled);
  const existing = row.querySelector('.event-recall-status');
  if (!recalled) { existing?.remove(); return; }
  const content = row.querySelector(selector) ?? row;
  if (existing?.parentElement === content) return;
  const badge = existing ?? row.ownerDocument.createElement('span');
  badge.className = 'event-recall-status';
  badge.textContent = '已撤回';
  content.append(badge);
}
