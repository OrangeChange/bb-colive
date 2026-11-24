import { maskDisplayName } from "../../events/displayNameProjection.ts";
import { createElement, useState, type ReactNode } from "react";
import type { DanmakuEvent } from "../../protocol/types.ts";
import { splitBilibiliVideoText } from "../../components/bilibiliVideoLinks.ts";
import {
  projectBlivechatEvent,
  type BlivechatContentPart,
  type BlivechatProjection,
} from "./projection.ts";

const tag = (
  name: string,
  props: Record<string, unknown> | null,
  ...children: ReactNode[]
) => createElement(name, props, ...children);
const timeText = (time: number) =>
  new Date(time).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
const currency = (value: number) =>
  `CN¥${Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
const authorTypes = ["", "member", "moderator", "owner"];
const paidColors = [
  [
    0,
    "rgba(153,236,255,1)",
    "rgba(153,236,255,1)",
    "rgba(0,0,0,1)",
    "rgba(0,0,0,.701961)",
    "rgba(0,0,0,.501961)",
    "rgba(0,0,0,1)",
  ],
  [
    0.01,
    "rgba(30,136,229,1)",
    "rgba(21,101,192,1)",
    "rgba(255,255,255,1)",
    "rgba(255,255,255,.701961)",
    "rgba(255,255,255,.501961)",
    "rgba(255,255,255,1)",
  ],
  [
    14,
    "rgba(0,229,255,1)",
    "rgba(0,184,212,1)",
    "rgba(0,0,0,1)",
    "rgba(0,0,0,.701961)",
    "rgba(0,0,0,.501961)",
    "rgba(0,0,0,1)",
  ],
  [
    35,
    "rgba(29,233,182,1)",
    "rgba(0,191,165,1)",
    "rgba(0,0,0,1)",
    "rgba(0,0,0,.541176)",
    "rgba(0,0,0,.501961)",
    "rgba(0,0,0,1)",
  ],
  [
    70,
    "rgba(255,202,40,1)",
    "rgba(255,179,0,1)",
    "rgba(0,0,0,.87451)",
    "rgba(0,0,0,.541176)",
    "rgba(0,0,0,.501961)",
    "rgba(0,0,0,.87451)",
  ],
  [
    140,
    "rgba(245,124,0,1)",
    "rgba(230,81,0,1)",
    "rgba(255,255,255,.87451)",
    "rgba(255,255,255,.701961)",
    "rgba(255,255,255,.501961)",
    "rgba(255,255,255,.87451)",
  ],
  [
    350,
    "rgba(233,30,99,1)",
    "rgba(194,24,91,1)",
    "rgba(255,255,255,1)",
    "rgba(255,255,255,.701961)",
    "rgba(255,255,255,.501961)",
    "rgba(255,255,255,1)",
  ],
  [
    700,
    "rgba(230,33,23,1)",
    "rgba(208,0,0,1)",
    "rgba(255,255,255,1)",
    "rgba(255,255,255,.701961)",
    "rgba(255,255,255,.501961)",
    "rgba(255,255,255,1)",
  ],
] as const;

function paidConfig(price: number) {
  let level = 0;
  for (let index = 1; index < paidColors.length; index += 1) {
    if (price < paidColors[index][0]) break;
    level = index;
  }
  return { level, value: paidColors[level] };
}

function ImgShadow({
  url,
  size,
  scope,
}: {
  url: string;
  size: 24 | 40;
  scope: string;
}) {
  return tag(
    "yt-img-shadow",
    {
      id: "author-photo",
      height: size,
      width: size,
      className: `no-transition style-scope ${scope}`,
      style: { backgroundColor: "transparent" },
      loaded: true,
    },
    tag("img", {
      id: "img",
      className: "style-scope yt-img-shadow",
      alt: "",
      height: size,
      width: size,
      src: url,
    }),
  );
}

function AuthorBadge({
  moderator,
  privilegeType,
}: {
  moderator: boolean;
  privilegeType: number;
}) {
  const readable = moderator
    ? "房管"
    : ["", "总督", "提督", "舰长"][privilegeType] || "大航海";
  const image = moderator
    ? tag(
        "yt-icon",
        { className: "style-scope yt-live-chat-author-badge-renderer" },
        tag(
          "svg",
          {
            viewBox: "0 0 16 16",
            className: "style-scope yt-icon",
            preserveAspectRatio: "xMidYMid meet",
            focusable: "false",
            style: {
              pointerEvents: "none",
              display: "block",
              width: "100%",
              height: "100%",
            },
          },
          tag(
            "g",
            { className: "style-scope yt-icon" },
            tag("path", {
              className: "style-scope yt-icon",
              d: "M9.64589146,7.05569719 C9.83346524,6.562372 9.93617022,6.02722257 9.93617022,5.46808511 C9.93617022,3.00042984 7.93574038,1 5.46808511,1 C4.90894765,1 4.37379823,1.10270499 3.88047304,1.29027875 L6.95744681,4.36725249 L4.36725255,6.95744681 L1.29027875,3.88047305 C1.10270498,4.37379824 1,4.90894766 1,5.46808511 C1,7.93574038 3.00042984,9.93617022 5.46808511,9.93617022 C6.02722256,9.93617022 6.56237198,9.83346524 7.05569716,9.64589147 L12.4098057,15 L15,12.4098057 L9.64589146,7.05569719 Z",
            }),
          ),
        ),
      )
    : tag("img", {
        src: `/static/img/icons/guard-level-${privilegeType}.png`,
        className: "style-scope yt-live-chat-author-badge-renderer",
        alt: readable,
      });
  return tag(
    "yt-live-chat-author-badge-renderer",
    {
      type: moderator ? "moderator" : privilegeType > 0 ? "member" : "",
      title: readable,
      className: "style-scope yt-live-chat-author-chip",
    },
    tag(
      "div",
      {
        id: "image",
        className: "style-scope yt-live-chat-author-badge-renderer",
      },
      image,
    ),
  );
}

function AuthorChip({
  projection,
  member = false,
  maskUsername = false,
}: {
  projection: BlivechatProjection;
  member?: boolean;
  maskUsername?: boolean;
}) {
  const name = maskUsername ? maskDisplayName(projection.authorName) : projection.authorName;
  const badges = member
    ? [
        createElement(AuthorBadge, {
          key: "member",
          moderator: false,
          privilegeType: projection.privilegeType,
        }),
      ]
    : [
        ...(projection.authorType === 2
          ? [
              createElement(AuthorBadge, {
                key: "admin",
                moderator: true,
                privilegeType: 0,
              }),
            ]
          : []),
        ...(projection.privilegeType > 0
          ? [
              createElement(AuthorBadge, {
                key: "member",
                moderator: false,
                privilegeType: projection.privilegeType,
              }),
            ]
          : []),
      ];
  return tag(
    "yt-live-chat-author-chip",
    {
      className: member
        ? "style-scope yt-live-chat-membership-item-renderer"
        : "style-scope yt-live-chat-text-message-renderer",
    },
    tag(
      "span",
      {
        id: "author-name",
        dir: "auto",
        className: `style-scope yt-live-chat-author-chip${member ? " member" : ""}`,
        type: authorTypes[member ? 0 : projection.authorType],
      },
      name,
      tag("span", {
        id: "chip-badges",
        className: "style-scope yt-live-chat-author-chip",
      }),
    ),
    tag(
      "span",
      { id: "chat-badges", className: "style-scope yt-live-chat-author-chip" },
      ...badges,
    ),
  );
}

function ContentParts({ parts = [], enableBilibiliVideoLinks = false }: { parts?: BlivechatContentPart[]; enableBilibiliVideoLinks?: boolean }) {
  return parts.map((part, index) =>
    part.type === "text"
      ? tag("span", { key: index }, ...(enableBilibiliVideoLinks
          ? splitBilibiliVideoText(part.text).map((textPart, textIndex) => textPart.type === "video"
              ? tag("a", { key: textIndex, href: textPart.href, className: "bilibili-video-link" }, textPart.value)
              : tag("span", { key: textIndex }, textPart.value))
          : [part.text]))
      : tag("img", {
          key: index,
          id: `emoji-${part.text}`,
          className: `emoji yt-formatted-string style-scope yt-live-chat-text-message-renderer${(part.large || (part.height > 0 && part.width >= part.height * 2)) ? " blc-large-emoji" : ""}`,
          src: part.url,
          alt: part.text,
          title: part.text,
          width: part.width || undefined,
          height: part.height || undefined,
        }),
  );
}

function TextMessage({
  projection,
  showTimestamp,
  maskUsername,
  enableBilibiliVideoLinks,
}: {
  projection: BlivechatProjection;
  showTimestamp: boolean;
  maskUsername: boolean;
  enableBilibiliVideoLinks: boolean;
}) {
  return tag(
    "yt-live-chat-text-message-renderer",
    {
      className: "style-scope yt-live-chat-item-list-renderer",
      "author-type": authorTypes[projection.authorType],
      "blc-guard-level": projection.privilegeType,
    },
    createElement(ImgShadow, {
      url: projection.avatarUrl,
      size: 24,
      scope: "yt-live-chat-text-message-renderer",
    }),
    tag(
      "div",
      {
        id: "content",
        className: "style-scope yt-live-chat-text-message-renderer",
      },
      tag(
        "span",
        {
          id: "timestamp",
          className: "style-scope yt-live-chat-text-message-renderer",
          hidden: !showTimestamp,
        },
        timeText(projection.time),
      ),
      createElement(AuthorChip, { projection, maskUsername }),
      tag(
        "span",
        {
          id: "message",
          className: "style-scope yt-live-chat-text-message-renderer",
        },
        createElement(ContentParts, { parts: projection.contentParts, enableBilibiliVideoLinks }),
      ),
    ),
  );
}

function giftDescription(projection: BlivechatProjection) {
  return `送出 ${projection.giftName} ×${projection.giftCount ?? 1}`;
}

function PaidMessage({
  projection,
  showGiftName,
  showTimestamp,
  maskUsername,
}: {
  projection: BlivechatProjection;
  showGiftName: boolean;
  showTimestamp: boolean;
  maskUsername: boolean;
}) {
  const content =
    projection.kind === "gift"
      ? showGiftName
        ? giftDescription(projection)
        : ""
      : (projection.content ?? "");
  const config = paidConfig(projection.price ?? 0);
  const [, contentBg, headerBg, header, name, time, message] = config.value;
  return tag(
    "yt-live-chat-paid-message-renderer",
    {
      className: "style-scope yt-live-chat-item-list-renderer",
      "data-blc-kind": projection.kind,
      "data-blc-gift-kind": projection.kind === "gift" ? "normal" : undefined,
      "author-type": authorTypes[projection.authorType],
      "show-only-header": content ? undefined : true,
      "blc-price-level": config.level,
      "blc-guard-level": projection.privilegeType,
      style: {
        "--yt-live-chat-paid-message-primary-color": contentBg,
        "--yt-live-chat-paid-message-secondary-color": headerBg,
        "--yt-live-chat-paid-message-header-color": header,
        "--yt-live-chat-paid-message-author-name-color": name,
        "--yt-live-chat-paid-message-timestamp-color": time,
        "--yt-live-chat-paid-message-color": message,
      },
    },
    tag(
      "div",
      {
        id: "card",
        className: "style-scope yt-live-chat-paid-message-renderer",
      },
      tag(
        "div",
        {
          id: "header",
          className: "style-scope yt-live-chat-paid-message-renderer",
        },
        createElement(ImgShadow, {
          url: projection.avatarUrl,
          size: 40,
          scope: "yt-live-chat-paid-message-renderer",
        }),
        tag(
          "div",
          {
            id: "header-content",
            className: "style-scope yt-live-chat-paid-message-renderer",
          },
          tag(
            "div",
            {
              id: "header-content-primary-column",
              className: "style-scope yt-live-chat-paid-message-renderer",
            },
            tag(
              "div",
              {
                id: "author-name",
                className: "style-scope yt-live-chat-paid-message-renderer",
              },
              maskUsername ? maskDisplayName(projection.authorName) : projection.authorName,
            ),
            tag(
              "div",
              {
                id: "purchase-amount",
                className: "style-scope yt-live-chat-paid-message-renderer",
              },
              projection.priceText ?? currency(projection.price ?? 0),
            ),
          ),
          tag(
            "span",
            {
              id: "timestamp",
              className: "style-scope yt-live-chat-paid-message-renderer",
              hidden: !showTimestamp,
            },
            timeText(projection.time),
          ),
        ),
      ),
      tag(
        "div",
        {
          id: "content",
          className: "style-scope yt-live-chat-paid-message-renderer",
        },
        tag(
          "div",
          {
            id: "message",
            dir: "auto",
            className: "style-scope yt-live-chat-paid-message-renderer",
          },
          content,
        ),
      ),
    ),
  );
}

function MembershipItem({
  projection,
  showTimestamp,
  maskUsername,
}: {
  projection: BlivechatProjection;
  showTimestamp: boolean;
  maskUsername: boolean;
}) {
  return tag(
    "yt-live-chat-membership-item-renderer",
    {
      className: "style-scope yt-live-chat-item-list-renderer",
      "data-blc-kind": "membership",
      "author-type": authorTypes[projection.authorType],
      "blc-guard-level": projection.privilegeType,
      "show-only-header": true,
    },
    tag(
      "div",
      {
        id: "card",
        className: "style-scope yt-live-chat-membership-item-renderer",
      },
      tag(
        "div",
        {
          id: "header",
          className: "style-scope yt-live-chat-membership-item-renderer",
        },
        createElement(ImgShadow, {
          url: projection.avatarUrl,
          size: 40,
          scope: "yt-live-chat-membership-item-renderer",
        }),
        tag(
          "div",
          {
            id: "header-content",
            className: "style-scope yt-live-chat-membership-item-renderer",
          },
          tag(
            "div",
            {
              id: "header-content-primary-column",
              className: "style-scope yt-live-chat-membership-item-renderer",
            },
            tag(
              "div",
              {
                id: "header-content-inner-column",
                className: "style-scope yt-live-chat-membership-item-renderer",
              },
              createElement(AuthorChip, {
                projection,
                member: true,
                maskUsername,
              }),
            ),
            tag(
              "div",
              {
                id: "header-subtext",
                className: "style-scope yt-live-chat-membership-item-renderer",
              },
              projection.membershipTitle,
            ),
          ),
          tag(
            "div",
            {
              id: "timestamp",
              className: "style-scope yt-live-chat-membership-item-renderer",
              hidden: !showTimestamp,
            },
            timeText(projection.time),
          ),
        ),
      ),
    ),
  );
}

function Ticker({
  projection,
  showTimestamp,
  maskUsername,
}: {
  projection: BlivechatProjection;
  showTimestamp: boolean;
  maskUsername: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const config = paidConfig(projection.price ?? 0);
  const detail =
    projection.kind === "membership"
      ? createElement(MembershipItem, {
          projection,
          showTimestamp,
          maskUsername,
        })
      : createElement(PaidMessage, {
          projection,
          showGiftName: false,
          showTimestamp,
          maskUsername,
        });
  const bg =
    projection.kind === "membership" ? "rgba(15,157,88,1)" : config.value[1];
  const color =
    projection.kind === "membership" ? "rgb(255,255,255)" : config.value[3];
  return tag(
    "yt-live-chat-ticker-renderer",
    {
      className: "style-scope yt-live-chat-renderer",
      "data-blc-kind": projection.kind,
      "author-type": authorTypes[projection.authorType],
      "blc-guard-level": projection.privilegeType,
      "data-blc-collapsed": !expanded,
    },
    tag(
      "div",
      {
        id: "container",
        dir: "ltr",
        className: "el-scrollbar style-scope yt-live-chat-ticker-renderer",
      },
      tag(
        "div",
        { className: "el-scrollbar__wrap" },
        tag(
          "div",
          { className: "el-scrollbar__view" },
          tag(
            "div",
            {
              id: "items",
              className: "style-scope yt-live-chat-ticker-renderer",
            },
            tag(
              "yt-live-chat-ticker-paid-message-item-renderer",
              {
                tabIndex: 0,
                className: "style-scope yt-live-chat-ticker-renderer",
                role: "button",
                "aria-expanded": String(expanded),
                onClick: () => setExpanded((value) => !value),
              },
              tag(
                "div",
                {
                  id: "container",
                  dir: "ltr",
                  className:
                    "style-scope yt-live-chat-ticker-paid-message-item-renderer",
                  style: { background: bg },
                },
                tag(
                  "div",
                  {
                    id: "content",
                    className:
                      "style-scope yt-live-chat-ticker-paid-message-item-renderer",
                    style: { color },
                  },
                  createElement(ImgShadow, {
                    url: projection.avatarUrl,
                    size: 24,
                    scope: "yt-live-chat-ticker-paid-message-item-renderer",
                  }),
                  tag(
                    "span",
                    {
                      id: "text",
                      dir: "ltr",
                      className:
                        "style-scope yt-live-chat-ticker-paid-message-item-renderer",
                    },
                    projection.kind === "membership"
                      ? "大航海"
                      : currency(projection.price ?? 0),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
    expanded ? detail : null,
  );
}

export function BlivechatProjectionView({
  projection,
  placement,
  showGiftName,
  showTimestamp = false,
  maskUsername = false,
  enableBilibiliVideoLinks = false,
}: {
  projection: BlivechatProjection;
  placement: "main" | "sticky";
  showGiftName: boolean;
  showTimestamp?: boolean;
  maskUsername?: boolean;
  enableBilibiliVideoLinks?: boolean;
}) {
  if (placement === "sticky" && projection.kind !== "text")
    return createElement(Ticker, { projection, showTimestamp, maskUsername });
  if (projection.kind === "text")
    return createElement(TextMessage, {
      projection,
      showTimestamp,
      maskUsername,
      enableBilibiliVideoLinks,
    });
  if (projection.kind === "membership")
    return createElement(MembershipItem, {
      projection,
      showTimestamp,
      maskUsername,
    });
  return createElement(PaidMessage, {
    projection,
    showGiftName,
    showTimestamp,
    maskUsername,
  });
}

export function BlivechatEvent({
  event,
  placement = "main",
  showGiftName = false,
  showTimestamp = false,
  maskUsername = false,
  enableBilibiliVideoLinks = false,
}: {
  event: DanmakuEvent;
  placement?: "main" | "sticky";
  showGiftName?: boolean;
  showTimestamp?: boolean;
  maskUsername?: boolean;
  enableBilibiliVideoLinks?: boolean;
}) {
  const projection = projectBlivechatEvent(
    event,
    { roomId: event.roomId, generation: 0 },
    1,
    Date.now(),
  );
  return projection
    ? createElement(BlivechatProjectionView, {
        projection,
        placement,
        showGiftName,
        showTimestamp,
        maskUsername,
        enableBilibiliVideoLinks,
      })
    : null;
}
