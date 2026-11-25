import { formatRoomLockExpiry } from '../protocol/roomLock.ts';

/** 日期与时分秒分别保持完整，窄宽度在两组之间换行。 */
export function RoomLockExpiry({ endsAt, className }: { endsAt?: number; className?: string }) {
  const value = endsAt ? formatRoomLockExpiry(endsAt) : undefined;
  return <time className={className} dateTime={endsAt ? new Date(endsAt).toISOString() : undefined}>
    {value ? <>解禁时间：<wbr /><span className="whitespace-nowrap">{value.slice(0, 10)}</span>{' '}
      <span className="whitespace-nowrap">{value.slice(11, 19)}</span>{value.slice(19)}</> : '解禁时间未提供'}
  </time>;
}
