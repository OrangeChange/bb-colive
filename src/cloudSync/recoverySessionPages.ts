import type { CloudRecoverySessionItem, CloudRecoverySessionPage } from './recoveryTransport.ts';

export async function readRecoverySessionPages(
  fetchPage: (cursor?: string) => Promise<CloudRecoverySessionPage>,
  onPage?: (page: CloudRecoverySessionPage) => void,
  active: () => boolean = () => true,
  initialCursor?: string,
): Promise<CloudRecoverySessionItem[]> {
  const items = new Map<string, CloudRecoverySessionItem>();
  let cursor = initialCursor;
  const cursors = new Set<string>();
  while (active()) {
    const page = await fetchPage(cursor);
    if (!active()) return [];
    for (const item of page.items) items.set(item.session_id, item);
    if (page.hasMore && (!page.nextCursor || page.nextCursor === cursor || cursors.has(page.nextCursor))) {
      throw new Error('云端场次分页无法继续，请重新读取');
    }
    onPage?.(page);
    if (!page.hasMore) return [...items.values()];
    cursor = page.nextCursor!;
    cursors.add(cursor);
  }
  return [];
}
