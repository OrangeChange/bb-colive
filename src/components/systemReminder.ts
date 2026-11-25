import { formatRoomLockExpiry } from '../protocol/roomLock.ts';
import { MsgType, MsgTypeName, type DanmakuEvent } from "../protocol/types.ts";

/** 由独立提醒模块收束的系统事件；不再混入互动信息流。 */
export const SYSTEM_REMINDER_TYPES = new Set<MsgType>([
  MsgType.RoomBlock,
  MsgType.RoomSilent,
  MsgType.AdminChange,
  MsgType.RoomChange,
  MsgType.LiveStart,
  MsgType.LiveEnd,
  MsgType.Warning,
  MsgType.CutOff,
  MsgType.RoomLock,
]);

export const URGENT_SYSTEM_TYPES = new Set<MsgType>([
  MsgType.Warning,
  MsgType.CutOff,
  MsgType.RoomLock,
]);

export function isSystemReminderEvent(event: DanmakuEvent): boolean {
  return SYSTEM_REMINDER_TYPES.has(event.msgType);
}

export function getSystemReminderEvents(events: readonly DanmakuEvent[]): DanmakuEvent[] {
  return events.filter(isSystemReminderEvent);
}

function stripSystemPrefix(text: string): string {
  return text.replace(/^\s*\[系统\]\s*[:：]\s*/, "").trim();
}

/** 原生事件行与系统提醒共用内容；缺少的范围、原因和期限不补写。 */
export function getSystemMessage(event: DanmakuEvent): { title: string; detail?: string; expiry?: string; user?: boolean } {
  const text = stripSystemPrefix(event.text ?? "");
  switch (event.msgType) {
    case MsgType.RoomBlock:
      return { title: ["被禁言", event.roomBlock?.validPeriod?.trim()].filter(Boolean).join(" "), user: true };
    case MsgType.RoomSilent: {
      const info = event.roomSilent;
      const off = info?.action === "off" || text === "ROOM_SILENT_OFF";
      const title = off ? "已解除房间禁言" : "已开启房间禁言";
      if (off) return { title };
      const explicit = text.match(/^(.+开启了禁言)\r?\n范围[：:]\s*(.+)$/);
      if (explicit) return { title: explicit[1], detail: `范围：${explicit[2]}` };
      const level = info?.level;
      const scope = info?.type === "all" ? "全体用户"
        : info?.type === "level" && level != null ? `用户等级低于 ${level} 级的用户`
        : info?.type === "medal" && level != null ? `粉丝勋章等级低于 ${level} 级的用户`
        : info?.type === "member" ? "会员限制" : "";
      const expiry = info?.second === -1 ? "长期有效"
        : info?.second && info.second > 0 ? `截至 ${new Date(info.second * 1000).toLocaleString("zh-CN", { hour12: false })}` : "";
      return { title, detail: [scope ? `范围：${scope}` : (!text.startsWith("ROOM_SILENT_") && text !== title ? text : ""), expiry].filter(Boolean).join("；") || undefined };
    }
    case MsgType.AdminChange:
      return { title: text === "被设为房管" ? "已被设为房管" : text === "房管被撤销" ? "的房管身份已被撤销" : text.replace(/^房管名单更新（(\d+) 人）$/, "房管名单已更新，共 $1 人"), user: Boolean(event.user) };
    case MsgType.LiveStart: return { title: "直播开始" };
    case MsgType.LiveEnd: return { title: "直播结束" };
    case MsgType.RoomLock:
      return { title: "直播间被封禁", detail: text && text !== "直播间被封禁" ? text : undefined,
        expiry: event.roomLock?.endsAt ? `解禁时间：${formatRoomLockExpiry(event.roomLock.endsAt)}` : "解禁时间未提供" };
    case MsgType.Warning:
    case MsgType.CutOff: {
      const action = event.msgType === MsgType.Warning ? "被警告" : "被切断";
      const title = `直播间${action}`;
      return { title, detail: text && text !== title && !["直播间被超管警告", "直播间被超管切断"].includes(text) ? text : undefined };
    }
    case MsgType.RoomChange: {
      const title = event.stats?.roomTitle;
      const area = [event.stats?.roomParentArea, event.stats?.roomArea].filter(Boolean).filter((v, i, list) => list.indexOf(v) === i).join(" - ");
      return { title: title ? `直播间标题更新：${title}` : area ? "直播间分区更新" : text || "直播间信息已更新", detail: area ? `分区：${area}` : undefined };
    }
    default: return { title: text || MsgTypeName[event.msgType] || "系统提醒" };
  }
}

export function formatSystemReminderText(event: DanmakuEvent): string {
  const message = getSystemMessage(event);
  const name = message.user && event.user ? event.user.uname?.trim() || `UID ${event.user.uid}` : "";
  return [name ? `${name} ${message.title}` : message.title, message.detail, message.expiry].filter(Boolean).join("\n");
}

export function isUrgentSystemEvent(event: DanmakuEvent): boolean {
  return URGENT_SYSTEM_TYPES.has(event.msgType);
}

export function getLatestUrgentSystemEvent(events: readonly DanmakuEvent[]): DanmakuEvent | null {
  let latestStart = -Infinity;
  let latest: DanmakuEvent | null = null;
  let locked: DanmakuEvent | null = null;
  for (const event of events) {
    if (event.msgType === MsgType.LiveStart) latestStart = Math.max(latestStart, event.ts);
    if (isUrgentSystemEvent(event) && (!latest || event.ts >= latest.ts)) latest = event;
    if (event.msgType === MsgType.RoomLock && (!locked || event.ts >= locked.ts)) locked = event;
  }
  if (locked && locked.ts > latestStart) return locked;
  return latest && latest.ts > latestStart ? latest : null;
}
