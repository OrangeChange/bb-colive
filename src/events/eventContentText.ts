import { formatSystemReminderText } from '../components/systemReminder.ts';
import { MsgType, type DanmakuEvent } from "../protocol/types.ts";
import { resolveReplyMention } from "./replyMentions.ts";

/** 事件自身的可读内容，不包含发送者资料和收藏整理信息。 */
export function buildEventContentText(event: DanmakuEvent): string {
  if (event.msgType === MsgType.RoomLock) return formatSystemReminderText(event);
  const reply = resolveReplyMention(event.text ?? "", event.replyTo);
  return [
    event.text,
    reply?.prepend ? reply.label : undefined,
    event.gift?.name,
    event.gift?.blindGiftName,
    event.sc?.message,
    event.sc?.trans,
    event.guard?.action,
    event.lottery?.awardName,
    event.lottery?.giftName,
    event.lottery?.danmu,
    event.pocket?.danmu,
    event.honor?.firstLine,
    event.honor?.secondLine,
  ].filter((part): part is string => typeof part === "string" && part.length > 0).join(" ");
}
