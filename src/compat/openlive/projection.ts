import { MsgType } from "../../protocol/eventTypeCodes.ts";
import type { DanmakuEvent, EmoteInfo, GuardLevel } from "../../protocol/types.ts";
import { stableCompatibleEventId } from "../compatibleLiveBridge.ts";

export interface OpenLiveScope { roomId: number; generation: number }
export type OpenLiveContentPart =
  | { type: "text"; text: string }
  | { type: "image"; text: string; url: string; width: number; height: number; large: boolean };
export interface OpenLiveInputRecord {
  method: "onAddText" | "onAddLike" | "onAddGift" | "onAddSuperChat" | "onAddMember" | "onDelSuperChat";
  payload: Record<string, unknown>;
  receivedAt: number;
  sequence: number;
}

const encoded = (value: string | number) => encodeURIComponent(String(value));
const privilege = (level: GuardLevel | undefined) => level ? 4 - level : 0;
const safeLike = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;

function parts(content: string, emotes: Record<string, EmoteInfo> = {}): OpenLiveContentPart[] {
  const tokens = Object.keys(emotes).filter(token => token && emotes[token]?.url).sort((a, b) => b.length - a.length);
  const output: OpenLiveContentPart[] = [];
  let start = 0;
  for (let position = 0; position < content.length;) {
    const token = tokens.find(candidate => content.startsWith(candidate, position));
    if (!token) { position += 1; continue; }
    if (position > start) output.push({ type: "text", text: content.slice(start, position) });
    const image = emotes[token];
    output.push({ type: "image", text: token, url: image.url, width: image.width, height: image.height, large: image.height >= 100 || (image.height > 0 && image.width >= image.height * 2) });
    position += token.length;
    start = position;
  }
  if (start < content.length || output.length === 0) output.push({ type: "text", text: content.slice(start) });
  return output;
}

/** 将软件已准入事实投影为开放版回调输入。 */
export function projectOpenLiveEvent(event: DanmakuEvent, scope: OpenLiveScope, sequence: number, receivedAt: number): OpenLiveInputRecord | null {
  if (event.roomId !== scope.roomId) return null;
  if (event.msgType === MsgType.ScDeleted) return {
    method: "onDelSuperChat", payload: { ids: (event.scDeleteIds ?? []).map(id => `bb-openlive:${scope.roomId}:${scope.generation}:sc:${encoded(id)}`) }, receivedAt, sequence,
  };
  const user = event.user;
  const common = {
    id: event.msgType === MsgType.SuperChat
      ? `bb-openlive:${scope.roomId}:${scope.generation}:sc:${encoded(event.id)}`
      : `bb-openlive:${scope.roomId}:${scope.generation}:${sequence}:${encoded(event.id)}`,
    sourceId: event.id,
    avatarUrl: user?.avatar ?? "",
    authorName: user?.uname ?? "",
    uid: user?.uid,
    time: event.ts,
    timestamp: event.ts / 1000,
    authorType: user?.isAnchor ? 3 : user?.isAdmin ? 2 : user?.guardLevel ? 1 : 0,
    privilegeType: privilege(user?.guardLevel),
    medalName: user?.medal?.name,
    medalLevel: user?.medal?.level,
    isFanGroup: user?.medal?.isLighted !== false,
    medalLighted: user?.medal?.isLighted,
    isCurrentRoom: user?.medal?.isCurrentRoom,
  };
  if (event.msgType === MsgType.Danmu) {
    const repeat = Number(event.danmuRepeatCount ?? 0) > 1 ? ` ×${event.danmuRepeatCount}` : "";
    const content = `${event.replyTo?.uname ? `@${event.replyTo.uname} ${event.text ?? ""}` : event.text ?? ""}${repeat}`;
    return { method: "onAddText", receivedAt, sequence, payload: { ...common, content, contentParts: event.emoticon ? [{ type: "image", text: content, url: event.emoticon.url, width: event.emoticon.width, height: event.emoticon.height, large: true }] : parts(content, event.emotes) } };
  }
  if (event.msgType === MsgType.Interact && event.interactKind === "like" && safeLike(event.likeCount)) {
    return { method: "onAddLike", receivedAt, sequence, payload: { ...common, likeCount: event.likeCount, content: event.likeCount > 1 ? `点赞了直播间${event.likeCount}次` : "点赞了直播间" } };
  }
  if (event.msgType === MsgType.Gift && event.gift && !event.isComboUpdate) {
    const gift = event.gift;
    const unit = gift.blindGiftName
      ? gift.blindHitPriceRmb ?? gift.priceRmb ?? gift.price / 1000
      : gift.coinType === "gold" ? gift.priceRmb ?? gift.price / 1000 : 0;
    const price = gift.blindGiftName ? unit * gift.count : gift.totalRmb ?? (gift.coinType === "gold" ? gift.total / 1000 : 0);
    return { method: "onAddGift", receivedAt, sequence, payload: { ...common, price, giftName: gift.name, num: gift.count, bbPaidAmount: { unit, cumulative: price } } };
  }
  if (event.msgType === MsgType.SuperChat && event.sc) return { method: "onAddSuperChat", receivedAt, sequence, payload: { ...common, price: event.sc.price, content: event.sc.message, translation: event.sc.trans ?? "" } };
  if (event.msgType === MsgType.GuardBuy && event.guard) return { method: "onAddMember", receivedAt, sequence, payload: { ...common, price: event.guard.priceRmb ?? (event.guard.price == null ? 0 : event.guard.price / 1000), num: event.guard.count, privilegeType: privilege(event.guard.level), title: `${event.guard.action ?? "开通"}${event.guard.count}${event.guard.unit ?? "月"}${["", "舰长", "提督", "总督"][event.guard.level]}` } };
  return null;
}

export function projectOpenLiveCallback(event: DanmakuEvent, sequence: number): OpenLiveInputRecord | null {
  if (event.msgType === MsgType.SuperChat && event.scDeleted) return {
    method: "onDelSuperChat", payload: { ids: [stableCompatibleEventId(event)] }, receivedAt: event.ts, sequence,
  };

  const record = projectOpenLiveEvent(event, { roomId: event.roomId, generation: 0 }, sequence, event.ts);
  if (!record) return null;
  if (record.method === "onDelSuperChat") return { ...record, payload: { ...record.payload, ids: [...(event.scDeleteIds ?? [])] } };
  const richText = record.method === "onAddText" ? {
    richContent: (record.payload.contentParts as OpenLiveContentPart[]).map(part => part.type === "text"
      ? { type: 0, text: part.text }
      : { type: 1, text: part.text, url: part.url, width: part.width, height: part.height }),
    emoticon: event.emoticon?.url ?? null,
  } : {};
  return { ...record, payload: { ...record.payload, ...richText, id: stableCompatibleEventId(event), sourceId: event.id } };
}
