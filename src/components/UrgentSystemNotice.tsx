import { Button } from "./shadcn/button";
import { RoomLockExpiry } from './RoomLockExpiry';
import { useEffect, useState } from 'react';
import { Ban, LockKeyhole, TriangleAlert } from 'lucide-react';
import { useUiLanguage } from '../i18n/react.ts';
import { uiText } from '../i18n/index.ts';
import { formatRemainingDuration } from '../i18n/duration.ts';
import { MsgType, type DanmakuEvent } from '../protocol/types';
import { getSystemMessage } from './systemReminder';

export function UrgentSystemNotice({ event, onDismiss }: { event: DanmakuEvent | null; onDismiss: () => void }) {
  useUiLanguage();
  const [now, setNow] = useState(Date.now);
  const endsAt = event?.roomLock?.endsAt;
  useEffect(() => {
    setNow(Date.now());
    if (!endsAt || endsAt <= Date.now()) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= endsAt) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [event?.id, endsAt]);
  if (!event) return null;
  const message = getSystemMessage(event);
  const Icon = event.msgType === MsgType.RoomLock ? LockKeyhole : event.msgType === MsgType.CutOff ? Ban : TriangleAlert;
  return (
    <div role="alert" aria-live="assertive" className="ui-motion-enter flex shrink-0 items-start gap-2 border-b border-danger/30 bg-danger/10 px-3 py-2 ui-type-control text-danger">
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{message.title}</div>
        {message.detail && <div className="break-words text-danger/90">{message.detail}</div>}
        {message.expiry && <RoomLockExpiry className="block break-words text-danger/90" endsAt={endsAt} />}
        {endsAt && <div className="break-words tabular-nums text-danger/90" aria-live="off">{endsAt > now
          ? uiText('roomLock.remaining', { duration: formatRemainingDuration(endsAt - now) })
          : uiText('roomLock.awaitingConfirmation')}</div>}
      </div>
      <Button size="icon-sm" variant="ghost" type="button" aria-label={uiText('uiControls.closeNotice')} onClick={onDismiss}
        className="shrink-0 rounded px-1 text-danger/70 hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger">×</Button>
    </div>
  );
}
