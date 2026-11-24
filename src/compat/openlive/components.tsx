import { maskDisplayName } from "../../events/displayNameProjection.ts";
import { createElement, useState, type CSSProperties, type ReactNode } from "react";
import type { DanmakuEvent } from "../../protocol/types.ts";
import { splitBilibiliVideoText } from "../../components/bilibiliVideoLinks.ts";
import { projectOpenLiveEvent, type OpenLiveContentPart, type OpenLiveInputRecord } from "./projection.ts";

const tag = (name: string, props: Record<string, unknown> | null, ...children: ReactNode[]) => createElement(name, props, ...children);
const timeText = (time: number) => new Date(time).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
const currency = (value: number) => `CN¥${Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
const payload = (record: OpenLiveInputRecord) => record.payload as Record<string, any>;
const authorTypeText = (data: Record<string, any>) => data.privilegeType ? "member" : (["", "member", "moderator", "owner"][data.authorType] ?? "");
const medalColors = [
  [37, "linear-gradient(to right, #ff6e1a, #fdb870)", "#ff6e1a", "#fdb870"], [33, "linear-gradient(to right, #881537, #c15b85)", "#881537", "#c15b85"],
  [29, "linear-gradient(to right, #361b69, #7668c3)", "#361b69", "#7668c3"], [25, "linear-gradient(to right, #10205b, #6382e9)", "#10205b", "#111111"],
  [21, "linear-gradient(to right, #1e5950, #4e988d)", "#1e5950", "#111111"], [17, "#c79d24", "#c79d24", "#c79d24"],
  [13, "#be6686", "#be6686", "#be6686"], [9, "#8d7ca6", "#8d7ca6", "#8d7ca6"], [5, "#5d7b9e", "#5d7b9e", "#5d7b9e"], [1, "#5c968e", "#5c968e", "#5c968e"],
] as const;

function Avatar({ data, size = 24, scope }: { data: Record<string, any>; size?: number; scope: string }) {
  return tag("yt-img-shadow", { id: "author-photo", height: size, width: size, loaded: true, className: `no-transition style-scope ${scope}` },
    tag("img", { id: "img", className: "style-scope yt-img-shadow", alt: "", height: size, width: size, src: data.avatarUrl }));
}

function Medal({ data }: { data: Record<string, any> }) {
  if (!data.medalName || data.isFanGroup === false) return null;
  const [, background, border, color] = medalColors.find(([level]) => (data.medalLevel ?? 0) >= level) ?? medalColors[medalColors.length - 1];
  return tag("yt-live-chat-author-medal-renderer", {
    className: "style-scope yt-live-chat-author-chip",
    "is-fan-group": true,
    "medal-name": data.medalName, "medal-level": data.medalLevel, "medal-nevel": data.medalLevel,
    "is-current-room": data.isCurrentRoom === true, style: { "--yt-live-chat-medal-background-color": background, "--yt-live-chat-medal-border-color": border, "--yt-live-chat-medal-text-color": color } as CSSProperties,
  }, tag("div", { id: "medal-card", className: "style-scope yt-live-chat-author-medal-renderer" },
    tag("div", { id: "medal-name", className: "style-scope yt-live-chat-author-medal-renderer" }, data.medalName),
    tag("div", { id: "medal-level", className: "style-scope yt-live-chat-author-medal-renderer" }, String(data.medalLevel ?? 0))));
}

function Badge({ data }: { data: Record<string, any> }) {
  const admin = data.authorType === 2;
  const type = data.privilegeType ? "member" : admin ? "moderator" : "";
  if (!type) return null;
  const readable = [admin ? "房管" : "", data.privilegeType ? (["", "总督", "提督", "舰长"][data.privilegeType] || "大航海") : ""].filter(Boolean).join("、");
  const adminIcon = admin ? tag("yt-icon", { className: "style-scope yt-live-chat-author-badge-renderer" },
        tag("svg", { viewBox: "0 0 16 16", className: "style-scope yt-icon", preserveAspectRatio: "xMidYMid meet", focusable: "false", style: { pointerEvents: "none", display: "block", width: "100%", height: "100%" } },
          tag("g", { className: "style-scope yt-icon" }, tag("path", { className: "style-scope yt-icon", d: "M9.64589146,7.05569719 C9.83346524,6.562372 9.93617022,6.02722257 9.93617022,5.46808511 C9.93617022,3.00042984 7.93574038,1 5.46808511,1 C4.90894765,1 4.37379823,1.10270499 3.88047304,1.29027875 L6.95744681,4.36725249 L4.36725255,6.95744681 L1.29027875,3.88047305 C1.10270498,4.37379824 1,4.90894766 1,5.46808511 C1,7.93574038 3.00042984,9.93617022 5.46808511,9.93617022 C6.02722256,9.93617022 6.56237198,9.83346524 7.05569716,9.64589147 L12.4098057,15 L15,12.4098057 L9.64589146,7.05569719 Z" }))))
    : null;
  const guardIcon = data.privilegeType ? tag("img", { src: `/static/img/icons/guard-level-${data.privilegeType}.png`, className: "style-scope yt-live-chat-author-badge-renderer", alt: readable }) : null;
  return tag("yt-live-chat-author-badge-renderer", { type, className: "style-scope yt-live-chat-author-chip", title: readable },
    tag("div", { id: "image", className: "style-scope yt-live-chat-author-badge-renderer" }, guardIcon, adminIcon));
}

function Author({ data, maskUsername, timestamp }: { data: Record<string, any>; maskUsername: boolean; timestamp?: ReactNode }) {
  const type = authorTypeText(data);
  return tag("yt-live-chat-author-chip", { className: "style-scope yt-live-chat-text-message-renderer" },
    timestamp,
    tag("span", { id: "author-name", dir: "auto", type, className: "style-scope yt-live-chat-author-chip" }, maskUsername ? maskDisplayName(data.authorName) : data.authorName, tag("span", { id: "chip-badges", className: "style-scope yt-live-chat-author-chip" })),
    tag("span", { id: "chat-medal", className: "style-scope yt-live-chat-author-chip" }, createElement(Medal, { data })),
    tag("span", { id: "chat-badges", className: "style-scope yt-live-chat-author-chip" }, createElement(Badge, { data })));
}

function Content({ parts = [], enableBilibiliVideoLinks = false }: { parts?: OpenLiveContentPart[]; enableBilibiliVideoLinks?: boolean }) {
  return parts.map((part, index) => part.type === "text"
    ? tag("span", { key: index, id: "message" }, ...(enableBilibiliVideoLinks
        ? splitBilibiliVideoText(part.text).map((textPart, textIndex) => textPart.type === "video"
            ? tag("a", { key: textIndex, href: textPart.href, className: "bilibili-video-link" }, textPart.value)
            : tag("span", { key: textIndex }, textPart.value))
        : [part.text]))
    : tag("img", { key: index, id: part.large ? "emoticon" : `emoji-${index}`, className: `emoji yt-formatted-string style-scope yt-live-chat-text-message-renderer${part.large ? " openlive-large-emote" : ""}`, src: part.url, alt: part.text, width: part.width, height: part.height }));
}

const paidTiers = [
  [1000, "rgba(208,0,0,1)", "rgba(230,33,23,1)", "rgba(255,255,255,1)", "rgba(255,255,255,0.701961)", "rgba(255,255,255,0.501961)", "rgba(255,255,255,1)"],
  [100, "rgba(230,81,0,1)", "rgba(245,124,0,1)", "rgba(255,255,255,0.87451)", "rgba(255,255,255,0.701961)", "rgba(255,255,255,0.501961)", "rgba(255,255,255,0.87451)"],
  [50, "rgba(255,179,0,1)", "rgba(255,202,40,1)", "rgba(0,0,0,0.87451)", "rgba(0,0,0,0.541176)", "rgba(0,0,0,0.501961)", "rgba(0,0,0,0.87451)"],
  [30, "rgba(0,191,165,1)", "rgba(29,233,182,1)", "rgba(0,0,0,1)", "rgba(0,0,0,0.541176)", "rgba(0,0,0,0.501961)", "rgba(0,0,0,1)"],
  [1, "rgba(21,101,192,1)", "rgba(30,136,229,1)", "rgba(255,255,255,1)", "rgba(255,255,255,0.701961)", "rgba(255,255,255,0.501961)", "rgba(255,255,255,1)"],
  [.1, "rgba(119, 255, 246, 1)", "rgba(69, 230, 227, 1)", "rgba(255,255,255,1)", "rgba(255,255,255,0.701961)", "rgba(255,255,255,0.501961)", "rgba(255,255,255,1)"],
  [0, "rgba(153, 236, 255, 1)", "rgba(153, 236, 255, 1)", "rgba(255,255,255,1)", "rgba(255,255,255,0.701961)", "rgba(255,255,255,0.501961)", "rgba(255,255,255,1)"],
] as const;
function paidStyle(price: number): CSSProperties {
  const [, headerBg, contentBg, header, author, time, content] = paidTiers.find(([minimum]) => price >= minimum) ?? paidTiers[paidTiers.length - 1];
  return { "--yt-live-chat-paid-message-primary-color": contentBg, "--yt-live-chat-paid-message-secondary-color": headerBg, "--yt-live-chat-paid-message-header-color": header, "--yt-live-chat-paid-message-author-name-color": author, "--yt-live-chat-paid-message-timestamp-color": time, "--yt-live-chat-paid-message-color": content } as CSSProperties;
}

function TextMessage({ data, showTimestamp, maskUsername, enableBilibiliVideoLinks }: { data: Record<string, any>; showTimestamp: boolean; maskUsername: boolean; enableBilibiliVideoLinks: boolean }) {
  return tag("yt-live-chat-text-message-renderer", { className: "style-scope yt-live-chat-item-list-renderer", "author-type": authorTypeText(data), privilegeType: String(data.privilegeType ?? 0), "is-owner": String(data.authorType === 3), "is-admin": String(data.authorType === 2), "data-openlive-kind": data.likeCount == null ? "danmaku" : "like", "data-openlive-placement": "main", "data-show-timestamp": showTimestamp },
    tag("div", { id: "card", className: "style-scope yt-live-chat-text-message-renderer" }, createElement(Avatar, { data, scope: "yt-live-chat-text-message-renderer" }),
    tag("div", { id: "content", className: "style-scope yt-live-chat-text-message-renderer" },
      createElement(Author, { data, maskUsername, timestamp: tag("span", { id: "timestamp", className: "style-scope yt-live-chat-text-message-renderer" }, timeText(data.time)) }),
      tag("div", { id: "image-and-message", className: "style-scope yt-live-chat-text-message-renderer" },
        data.likeCount == null ? createElement(Content, { parts: data.contentParts, enableBilibiliVideoLinks }) : tag("span", { id: "message" }, data.content)))));
}

function PaidMessage({ data, kind, placement = "main", showGiftInfo, showTimestamp, maskUsername }: { data: Record<string, any>; kind: "gift" | "superchat"; placement?: "main" | "detail"; showGiftInfo: boolean; showTimestamp: boolean; maskUsername: boolean }) {
  const giftText = `${data.giftName ?? ""} ×${data.num ?? 1}`;
  const content = kind === "gift" ? (showGiftInfo ? giftText : "") : data.content;
  return tag("yt-live-chat-paid-message-renderer", { className: "style-scope yt-live-chat-item-list-renderer", "data-openlive-kind": kind, "data-openlive-gift-kind": "normal", "data-openlive-placement": placement, "data-show-timestamp": showTimestamp, "author-type": authorTypeText(data), privilegeType: String(data.privilegeType ?? 0), "is-admin": String(data.authorType === 2), "show-only-header": content ? undefined : true, style: paidStyle(data.price) },
    tag("div", { id: "card", className: "style-scope yt-live-chat-paid-message-renderer" },
      tag("div", { id: "header", className: "style-scope yt-live-chat-paid-message-renderer" },
        createElement(Avatar, { data, size: 40, scope: "yt-live-chat-paid-message-renderer" }),
        tag("div", { id: "header-content", className: "style-scope yt-live-chat-paid-message-renderer" },
          tag("div", { id: "header-content-primary-column", className: "style-scope yt-live-chat-paid-message-renderer" },
            tag("div", { id: "author-name", className: "style-scope yt-live-chat-paid-message-renderer" }, maskUsername ? maskDisplayName(data.authorName) : data.authorName),
            tag("div", { id: "purchase-amount", className: "style-scope yt-live-chat-paid-message-renderer" }, currency(data.price))),
          tag("span", { id: "timestamp", className: "style-scope yt-live-chat-paid-message-renderer" }, timeText(data.time)))),
      tag("div", { id: "content", className: "style-scope yt-live-chat-paid-message-renderer" }, tag("div", { id: "message", className: "style-scope yt-live-chat-paid-message-renderer" }, content))));
}

function Membership({ data, placement = "main", showTimestamp, maskUsername }: { data: Record<string, any>; placement?: "main" | "detail"; showTimestamp: boolean; maskUsername: boolean }) {
  return tag("yt-live-chat-membership-item-renderer", { className: "style-scope yt-live-chat-item-list-renderer", "data-openlive-kind": "guard", "data-openlive-placement": placement, "data-show-timestamp": showTimestamp, "author-type": authorTypeText(data), privilegeType: String(data.privilegeType ?? 0), "is-admin": String(data.authorType === 2) },
    tag("div", { id: "card", className: "style-scope yt-live-chat-membership-item-renderer" },
      tag("div", { id: "header", className: "style-scope yt-live-chat-membership-item-renderer" },
        createElement(Avatar, { data, size: 40, scope: "yt-live-chat-membership-item-renderer" }),
        tag("div", { id: "header-content", className: "style-scope yt-live-chat-membership-item-renderer" },
          tag("div", { id: "header-content-primary-column", className: "style-scope yt-live-chat-membership-item-renderer" },
            tag("div", { id: "header-content-inner-column", className: "style-scope yt-live-chat-membership-item-renderer" },
              tag("yt-live-chat-author-chip", { className: "style-scope yt-live-chat-membership-item-renderer" },
                tag("span", { id: "author-name", type: authorTypeText(data), className: "member style-scope yt-live-chat-author-chip" }, maskUsername ? maskDisplayName(data.authorName) : data.authorName, tag("span", { id: "chip-badges" })),
                tag("span", { id: "chat-badges" }, createElement(Badge, { data })))),
            tag("div", { id: "header-subtext", className: "style-scope yt-live-chat-membership-item-renderer" }, data.title)),
          tag("div", { id: "timestamp", className: "style-scope yt-live-chat-membership-item-renderer" }, timeText(data.time))))));
}

function Ticker({ record, showTimestamp, maskUsername }: { record: OpenLiveInputRecord; showTimestamp: boolean; maskUsername: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const data = payload(record);
  const membership = record.method === "onAddMember";
  const detail = membership
    ? createElement(Membership, { data, placement: "detail", showTimestamp, maskUsername })
    : createElement(PaidMessage, { data, kind: record.method === "onAddSuperChat" ? "superchat" : "gift", placement: "detail", showGiftInfo: false, showTimestamp, maskUsername });
  const style = membership ? { background: "rgba(15,157,88,1)", color: "rgb(255,255,255)" } : { background: paidTiers.find(([minimum]) => data.price >= minimum)?.[2], color: paidTiers.find(([minimum]) => data.price >= minimum)?.[3] };
  const collapsed = tag("yt-live-chat-ticker-paid-message-item-renderer", {
    className: "style-scope yt-live-chat-ticker-renderer", role: "button", tabIndex: 0,
    "aria-expanded": String(expanded), onClick: () => setExpanded(value => !value),
  }, tag("div", {
    id: "container", className: "style-scope yt-live-chat-ticker-paid-message-item-renderer", style: { background: style.background },
  }, tag("div", {
    id: "content", className: "style-scope yt-live-chat-ticker-paid-message-item-renderer", style: { color: style.color },
  }, createElement(Avatar, { data, scope: "yt-live-chat-ticker-paid-message-item-renderer" }), tag("span", { id: "text" }, membership ? "大航海" : currency(data.price)))));
  return tag("yt-live-chat-ticker-renderer", { className: "style-scope yt-live-chat-renderer", "data-openlive-kind": membership ? "guard" : record.method === "onAddSuperChat" ? "superchat" : "gift", "data-openlive-gift-kind": "normal" },
    tag("div", { id: "container", className: "style-scope yt-live-chat-ticker-renderer", dir: "ltr" },
      tag("div", { id: "items", className: "style-scope yt-live-chat-ticker-renderer" }, collapsed)),
    expanded ? detail : null);
}

export function OpenLiveProjectionView({ record, placement, showGiftInfo, showTimestamp = false, maskUsername = false, enableBilibiliVideoLinks = false }: { record: OpenLiveInputRecord; placement: "main" | "sticky"; showGiftInfo: boolean; showTimestamp?: boolean; maskUsername?: boolean; enableBilibiliVideoLinks?: boolean }) {
  const data = payload(record);
  if (placement === "sticky" && ["onAddGift", "onAddSuperChat", "onAddMember"].includes(record.method)) return createElement(Ticker, { record, showTimestamp, maskUsername });
  if (record.method === "onAddText" || record.method === "onAddLike") return createElement(TextMessage, { data, showTimestamp, maskUsername, enableBilibiliVideoLinks });
  if (record.method === "onAddGift") return createElement(PaidMessage, { data, kind: "gift", showGiftInfo, showTimestamp, maskUsername });
  if (record.method === "onAddSuperChat") return createElement(PaidMessage, { data, kind: "superchat", showGiftInfo: false, showTimestamp, maskUsername });
  if (record.method === "onAddMember") return createElement(Membership, { data, showTimestamp, maskUsername });
  return null;
}

export function OpenLiveEvent({ event, placement = "main", showGiftInfo = true, showTimestamp = false, maskUsername = false, enableBilibiliVideoLinks = false }: { event: DanmakuEvent; placement?: "main" | "sticky"; showGiftInfo?: boolean; showTimestamp?: boolean; maskUsername?: boolean; enableBilibiliVideoLinks?: boolean }) {
  const record = projectOpenLiveEvent(event, { roomId: event.roomId, generation: 0 }, 1, Date.now());
  return record ? createElement(OpenLiveProjectionView, { record, placement, showGiftInfo: placement === "main" && showGiftInfo, showTimestamp, maskUsername, enableBilibiliVideoLinks }) : null;
}
