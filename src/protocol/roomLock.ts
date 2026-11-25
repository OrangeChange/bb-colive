import type { DanmakuEvent } from './types.ts';

/** ROOM_LOCK 的无时区日期按北京时间解释；接口期限使用 Unix 秒。 */
export function parseRoomLockExpiry(value: unknown): number | undefined {
  if (typeof value === 'number' || typeof value === 'string' && /^\d+$/.test(value)) {
    const time = Number(value) * 1000;
    return time > 0 && Number.isFinite(new Date(time).getTime()) ? time : undefined;
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) || value.startsWith('0000')) return undefined;
  const time = Date.parse(value.replace(' ', 'T') + '+08:00');
  if (!Number.isFinite(time) || time <= 0) return undefined;
  const local = new Date(time + 8 * 3600_000).toISOString().slice(0, 19).replace('T', ' ');
  return local === value ? time : undefined;
}

/** 只补充同一条封禁事件的期限，查询失败仍保留封禁事实。 */
export async function completeRoomLock(event: DanmakuEvent, query: () => Promise<{ is_locked?: boolean; lock_till?: number }>): Promise<DanmakuEvent> {
  if (event.roomLock?.endsAt) return event;
  try {
    const info = await query();
    const endsAt = info.is_locked === true ? parseRoomLockExpiry(info.lock_till) : undefined;
    return endsAt ? { ...event, roomLock: { endsAt, source: 'room-info' } } : event;
  } catch {
    return event;
  }
}

export function formatRoomLockExpiry(time: number): string {
  const parts = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(time);
  const part = (type: string) => parts.find(value => value.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}:${part('second')}（北京时间）`;
}
