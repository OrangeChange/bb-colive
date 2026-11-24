import { MsgType } from "../../protocol/eventTypeCodes.ts";
import type { DanmakuEvent, EmoteInfo, GuardLevel } from "../../protocol/types.ts";
import { stableCompatibleEventId } from "../compatibleLiveBridge.ts";

export interface BlivechatScope { roomId: number; generation: number }
export type BlivechatContentPart =
  | { type: "text"; text: string }
  | { type: "image"; text: string; url: string; width: number; height: number; large: boolean };

export interface BlivechatProjection {
  kind: "text" | "gift" | "superchat" | "membership";
  id: string;
  time: number;
  avatarUrl: string;
  authorName: string;
  authorType: 0 | 1 | 2 | 3;
  privilegeType: number;
  contentParts?: BlivechatContentPart[];
  price?: number;
  priceText?: string;
  content?: string;
  giftName?: string;
  giftCount?: number;
  membershipTitle?: string;
  translation?: string;
  membershipCount?: number;
  membershipUnit?: string;
  membershipPrice?: number;
}

export const toBlivechatPrivilege = (level: GuardLevel | undefined): number => level ? 4 - level : 0;
const encoded = (value: string | number) => encodeURIComponent(String(value));

function contentParts(content: string, emotes: Record<string, EmoteInfo> = {}): BlivechatContentPart[] {
  const tokens = Object.keys(emotes).filter(token => token && emotes[token]?.url).sort((a, b) => b.length - a.length);
  const parts: BlivechatContentPart[] = [];
  let start = 0;
  let position = 0;
  while (position < content.length) {
    const token = tokens.find(candidate => content.startsWith(candidate, position));
    if (!token) { position += 1; continue; }
    if (position > start) parts.push({ type: "text", text: content.slice(start, position) });
    const image = emotes[token];
    parts.push({ type: "image", text: token, url: image.url, width: image.width, height: image.height, large: image.height >= 100 || (image.height > 0 && image.width >= image.height * 2) });
    position += token.length;
    start = position;
  }
  if (start < content.length || parts.length === 0) parts.push({ type: "text", text: content.slice(start) });
  return parts;
}

/** 将软件已准入的单条事件投影到 blivechat 1.10.4 ChatRenderer 的四类真实组件。 */
export function projectBlivechatEvent(event: DanmakuEvent, scope: BlivechatScope, sequence: number, _receivedAt: number): BlivechatProjection | null {
  if (event.roomId !== scope.roomId) return null;
  const user = event.user;
  const privilegeType = toBlivechatPrivilege(user?.guardLevel);
  const common = {
    id: `bb:${scope.roomId}:${scope.generation}:${sequence}:${encoded(event.id)}`,
    time: event.ts,
    avatarUrl: user?.avatar ?? "",
    authorName: user?.uname ?? "",
    authorType: (user?.isAnchor ? 3 : user?.isAdmin ? 2 : privilegeType ? 1 : 0) as 0 | 1 | 2 | 3,
    privilegeType,
  };
  if (event.msgType === MsgType.Danmu) {
    const original = event.text ?? "";
    const reply = event.replyTo?.uname ?? "";
    const content = reply ? `@${reply} ${original}` : original;
    const parts = event.emoticon
      ? [{ type: "image", text: content, url: event.emoticon.url, width: event.emoticon.width, height: event.emoticon.height, large: true } as const]
      : contentParts(content, event.emotes);
    return { ...common, kind: "text", contentParts: parts };
  }
  if (event.msgType === MsgType.Gift && event.gift && !event.gift.blindGiftName && !event.isComboUpdate) {
    const gift = event.gift;
    return {
      ...common,
      kind: "gift",
      price: gift.totalRmb ?? (gift.coinType === "gold" ? gift.total / 1000 : 0),
      priceText: gift.coinType === "gold" ? undefined : `${gift.name}x${gift.count}`,
      giftName: gift.name,
      giftCount: gift.count,
    };
  }
  if (event.msgType === MsgType.SuperChat && event.sc) {
    return { ...common, kind: "superchat", price: event.sc.price, content: event.sc.message, translation: event.sc.trans };
  }
  if (event.msgType === MsgType.GuardBuy && event.guard) {
    const guard = event.guard;
    const action = guard.action ?? "开通";
    return {
      ...common,
      kind: "membership",
      privilegeType: toBlivechatPrivilege(guard.level),
      membershipTitle: `${action}${guard.count}${guard.unit ?? "月"}${["", "舰长", "提督", "总督"][guard.level]}`,
      membershipCount: guard.count,
      membershipUnit: guard.unit ?? "月",
      membershipPrice: guard.priceRmb ?? (guard.price === undefined ? undefined : guard.price / 1000),
    };
  }
  return null;
}

export interface BlivechatCallback { method: string; payload: Record<string, unknown>; receivedAt: number; sequence: number }

/** 软件事件进入来源文档的唯一边界；输出保持 blivechat ChatClient callback 形状。 */
export function projectBlivechatCallback(event: DanmakuEvent, sequence: number): BlivechatCallback | null {
  if (event.msgType === MsgType.SuperChat && event.scDeleted) return {
    method: "onDelSuperChat", payload: { ids: [stableCompatibleEventId(event)] }, receivedAt: event.ts, sequence,
  };

  if (event.msgType === MsgType.ScDeleted) {
    return { method: "onDelSuperChat", payload: { ids: [...(event.scDeleteIds ?? [])] }, receivedAt: event.ts, sequence };
  }
  const projected = projectBlivechatEvent(event, { roomId: event.roomId, generation: 0 }, sequence, event.ts);
  if (!projected) return null;
  const medal = event.user?.medal?.isCurrentRoom === false ? undefined : event.user?.medal;
  const common = {
    id: stableCompatibleEventId(event), avatarUrl: projected.avatarUrl, authorName: projected.authorName,
    authorType: projected.authorType, privilegeType: projected.privilegeType,
    authorLevel: event.user?.userLevel ?? 0, isMobileVerified: event.user?.phoneVerified !== false,
    medalName: medal?.name ?? "", medalLevel: medal?.level ?? 0,
  };
  let method = ""; let payload: Record<string, unknown>;
  if (projected.kind === "text") {
    method = "onAddText";
    const repeat = Number(event.danmuRepeatCount ?? 0) > 1 ? ` ×${event.danmuRepeatCount}` : "";
    const contentParts = projected.contentParts?.map(part => part.type === "text" ? { type: 0, text: part.text } : { type: 1, text: part.text, url: part.url, width: part.width, height: part.height }) ?? [];
    payload = { ...common, content: `${projected.contentParts?.map(part => part.text).join("") ?? ""}${repeat}`, contentParts: repeat ? [...contentParts, { type: 0, text: repeat }] : contentParts, emoticon: event.emoticon?.url ?? null, translation: projected.translation ?? "" };
  } else if (projected.kind === "gift") {
    method = "onAddGift";
    payload = { ...common, totalCoin: (projected.price ?? 0) * 1000, giftName: projected.giftName ?? "", num: projected.giftCount ?? 1, totalFreeCoin: event.gift?.coinType === "gold" ? 0 : event.gift?.total ?? 0, giftId: event.gift?.id ?? 0, giftIconUrl: event.gift?.webp ?? event.gift?.gif ?? event.gift?.icon ?? "" };
  } else if (projected.kind === "membership") {
    method = "onAddMember";
    payload = { ...common, title: projected.membershipTitle ?? "", num: projected.membershipCount ?? 1, unit: projected.membershipUnit ?? "月", totalCoin: (projected.membershipPrice ?? 0) * 1000 };
  } else {
    method = "onAddSuperChat";
    payload = { ...common, price: projected.price ?? 0, content: projected.content ?? "", translation: projected.translation ?? "" };
  }
  return { method, payload, receivedAt: event.ts, sequence };
}

