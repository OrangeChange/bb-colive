import { RoomLockExpiry } from './RoomLockExpiry';
import { ReviewInlineItems } from './ReviewInlineItems.tsx';
import { Gift as LucideGift, Heart as LucideHeart } from 'lucide-react';
import { useGeneralSettings } from '../generalSettings.ts';
import { reviewDisplayPreferences, REVIEW_PRICE_GRADIENT } from '../reviewStyleSettings.ts';
import { Clock3 as LucideClock3, Play as LucidePlay, Square as LucideSquare, UserRoundX as LucideUserRoundX, Volume2 as LucideVolume2, VolumeX as LucideVolumeX, ShieldCheck as LucideShieldCheck, TriangleAlert as LucideTriangleAlert, Ban as LucideBan, LockKeyhole as LucideLockKeyhole, SquarePen as LucideSquarePen } from "lucide-react";
import { NativeRoleIcon } from "./NativeRoleIcon.tsx";
import { GuardHonorWatermark } from "./GuardHonorWatermark.tsx";
import { maskDisplayName } from "../events/displayNameProjection.ts";
import { priceGradientClass } from '../themes/nativePriceGradient.ts';
/**
 * 事件行渲染（ui-design §四/§五）：
 * - 实时事件使用语义卡片，紧凑历史布局保留独立密度
 * - 徽章：舰队（分等级色）/ 房管 / 主播 / 勋章
 * - 时间与活动状态按宿主和显示设置呈现
 * - 事件身份、动作、主内容与状态保持独立部件
 */
import { createContext, Fragment, memo, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import {
  HIGHLIGHT_TYPES,
  MsgType,
  MsgTypeName,
  type DanmakuEvent,
  type DanmakuUser,
  type EmoticonInfo,
  type EmoteInfo,
} from "../protocol";
import { FanMedalBadge } from "./FanMedalBadge";
import { GuardIdentityBadge } from "./GuardIdentityBadge";
import { LotteryWinnerList } from "./LotteryWinnerList";
import {
  DEFAULT_EVENT_DISPLAY_PREFERENCES,
  DEFAULT_EVENT_FONT_SIZE,
  getEventAnimationDuration,
  getEventAnimationExitDuration,
  shouldShowFanMedal,
  type EventDisplayPreferences,
} from "../eventDisplaySettings";
import {
  DEFAULT_EVENT_STYLE_SETTINGS,
  getEventStyleType,
  type EventStyleSettings,
  type EventStyleType,
} from "../eventStyleSettings";
import { resolveEventRowStyle } from "../eventRowStyles";
import { getWealthMedalAssetPath } from "../wealthMedalAssets";
import { BilibiliVideoText } from "./BilibiliVideoText";
import { resolveUserDisplayName, type UserNicknames } from "../userNicknames";
import { EventContextMenu, type EventMenuHandlers, type EventMenuScope } from "./EventContextMenu";
import { useEventUserNicknames, useEventShortcutActions } from "../events/eventInteractionSettings.ts";
import { resolveReplyMention } from "../events/replyMentions";
import type { GiftEffectResource } from "../protocol/giftEffects";
import { formatReviewEventTime } from "../archive/archiveProjection.ts";
import { publicEventClass, publicIdentityClasses, publicGuardPurchaseClass } from "../events/publicEventStyle";
import { GIFT_FALLBACK_PATH, BLIND_BOX_FALLBACK_PATH } from "../eventMediaAssets";
import { UserAvatar } from "./UserAvatar";
import { GuardPurchaseIcon } from "./GuardPurchaseIcon";
import { NativeEventIcon } from "./NativeEventIcon";
import { useActivityPresentation } from '../events/useActivityClock';
import { getSystemMessage, isSystemReminderEvent } from "./systemReminder";

type EventDisplayContextValue = EventDisplayPreferences & {
  eventStyleSettings: EventStyleSettings;
  liveLayout: boolean;
  archiveLayout?: boolean;
  enableBilibiliVideoLinks: boolean;
  userNicknames: UserNicknames;
  eventStyleType: EventStyleType;
  maskUsername: boolean;
};

export const EventDisplayContext = createContext<EventDisplayContextValue>({
  ...DEFAULT_EVENT_DISPLAY_PREFERENCES,
  eventStyleSettings: DEFAULT_EVENT_STYLE_SETTINGS,
  liveLayout: false,
  enableBilibiliVideoLinks: false,
  userNicknames: {},
  eventStyleType: "system",
  maskUsername: false,
});

const GUARD_NAME: Record<1 | 2 | 3, string> = { 1: "舰长", 2: "提督", 3: "总督" };
const GUARD_CLASS: Record<1 | 2 | 3, string> = {
  1: "text-ev-guard1 bg-ev-guard1/10",
  2: "text-ev-guard2 bg-ev-guard2/10",
  3: "text-ev-guard3 bg-ev-guard3/10",
};
const GUARD_NAME_CLASS: Record<1 | 2 | 3, string> = {
  1: "text-ev-guard1",
  2: "text-ev-guard2",
  3: "text-ev-guard3",
};

/** 用户名身份色：始终按真实身份显示；身份开关只控制旁边的身份标记。 */
function identityNameClass(user: DanmakuUser | undefined): string {
  const base = "min-w-0 max-w-full shrink font-medium";
  if (!user) return `${base} text-t2`;
  if (user.isAnchor) return `${base} text-ev-sc`;
  if (user.isAdmin) return `${base} text-success`;
  if (user.guardLevel > 0) {
    return `${base} ${GUARD_NAME_CLASS[user.guardLevel as 1 | 2 | 3]}`;
  }
  return `${base} text-t2`;
}

/** 事件主色（高亮行彩条/文字用） */
function evColor(ev: DanmakuEvent): string | null {
  switch (ev.msgType) {
    case MsgType.Gift:
      return "var(--event-gift)";
    case MsgType.SuperChat:
      return "var(--event-sc)";
    case MsgType.GuardBuy:
      return `var(--event-guard-${ev.guard?.level ?? 1})`;
    case MsgType.GuardHonor:
      return "var(--event-guard-honor)";
    case MsgType.LiveStart:
      return "var(--status-success)";
    case MsgType.LiveEnd:
      return "var(--status-warning)";
    case MsgType.AnchorLotStart:
    case MsgType.AnchorLotAward:
      return "var(--event-lottery)";
    case MsgType.RedPocketStart:
    case MsgType.RedPocketWinner:
      return "var(--event-red)";
    default:
      return null;
  }
}

const hhmmss = (ts: number) =>
  new Date(ts).toLocaleTimeString("zh-CN", { hour12: false });

function NativeEventTime({ ts, className = "time" }: { ts: number; className?: string }) {
  const context = useContext(EventDisplayContext);
  const ref = useRef<HTMLTimeElement>(null);
  const [edge, setEdge] = useState<{ right: string; bottom: string } | null>(null);
  useLayoutEffect(() => {
    const time = ref.current!;
    const card = time.closest<HTMLElement>(".event");
    const layout = card;
    const content = card?.querySelector<HTMLElement>(":scope > .content");
    const row = card?.closest<HTMLElement>(".event:not(.event-sticky)");
    if (row && getComputedStyle(time).getPropertyValue("--bubble-surface")) {
      setEdge(null);
      const slot = row.closest<HTMLElement>(".event-row-slot-content, .event-area");
      if (!layout || row.classList.contains("type-interaction") || !slot) return;
      const update = () => {
        // 分行时累加每段文字的宽度，回到外置布局前仍按完整时间留位。
        const range = document.createRange();
        let textWidth = 0;
        for (const node of time.childNodes) {
          range.selectNodeContents(node);
          for (const rect of range.getClientRects()) textWidth += rect.width;
        }
        const scale = slot.offsetWidth ? slot.getBoundingClientRect().width / slot.offsetWidth : 1;
        if (!scale) return;
        const style = getComputedStyle(time);
        const naturalWidth = Math.ceil(textWidth / scale + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
          + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth));
        const base = parseFloat(getComputedStyle(slot).fontSize);
        row.style.setProperty("--bubble-time-width", naturalWidth + "px");
        time.toggleAttribute("data-time-wrapped", slot.clientWidth - naturalWidth < 10 * base);
      };
      update();
      const observer = new ResizeObserver(update);
      observer.observe(time);
      observer.observe(slot);
      return () => {
        observer.disconnect();
        row.style.removeProperty("--bubble-time-width");
        time.removeAttribute("data-time-wrapped");
      };
    }
    if (!layout || !content || !card || getComputedStyle(time).display === "inline") {
      setEdge(null);
      return;
    }
    const update = () => {
      if (card.querySelector('.winner-list[open]')) {
        setEdge(null);
        return;
      }
      const rects: DOMRect[] = [];
      const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if (!node.textContent?.trim()) continue;
        range.selectNodeContents(node);
        rects.push(...Array.from(range.getClientRects()));
      }
      content.querySelectorAll("img, svg").forEach(media => rects.push(media.getBoundingClientRect()));
      const visible = rects.filter(r => r.width > 0 && r.height > 0);
      const lastRect = visible.reduce<DOMRect | null>((last, rect) => !last || rect.bottom > last.bottom ? rect : last, null);
      const lineTop = lastRect ? lastRect.bottom - Math.min(lastRect.height, parseFloat(getComputedStyle(content).lineHeight) || lastRect.height) : 0;
      const lastRight = Math.max(...visible.filter(r => r.bottom > lineTop + 0.5).map(r => r.right));
      const box = card.getBoundingClientRect(), style = getComputedStyle(card);
      const scale = card.offsetWidth ? box.width / card.offsetWidth : 1;
      const border = parseFloat(style.borderRightWidth);
      const contentStyle = getComputedStyle(content);
      const contentPadding = parseFloat(contentStyle.paddingRight);
      const rightEdge = box.right - (parseFloat(style.paddingRight) + border) * scale;
      const right = card.closest('.lottery-result, .redpocket-result') ? rightEdge : Math.min(rightEdge, content.getBoundingClientRect().right - contentPadding * scale);
      const gap = parseFloat(getComputedStyle(layout).columnGap) || 0;
      const fits = visible.length > 0 && lastRight + gap * scale + time.getBoundingClientRect().width <= right;
      const next = fits ? { right: `${(box.right - right) / scale - border}px`, bottom: style.paddingBottom } : null;
      setEdge(previous => previous?.right === next?.right && previous?.bottom === next?.bottom ? previous : next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(content);
    observer.observe(card);
    document.fonts.addEventListener("loadingdone", update);
    return () => { observer.disconnect(); document.fonts.removeEventListener("loadingdone", update); };
  }, [ts, context]);
  const text = hhmmss(ts);
  return <time ref={ref} className={`${className}${edge ? " time-inline" : ""}`} style={edge ? { "--time-edge-right": edge.right, "--time-edge-bottom": edge.bottom } as CSSProperties : undefined} dateTime={new Date(ts).toISOString()}>{text.slice(0, 5)}<span className="time-seconds">{text.slice(5)}</span></time>;
}

/** 开奖等待时长标签：「（5分钟后开奖）」；<1分钟显示秒，无/无效返回 null */
const waitLabel = (sec?: number): string | null => {
  if (!sec || sec <= 0) return null;
  if (sec < 60) return `（${sec}秒后开奖）`;
  return `（${Math.round(sec / 60)}分钟后开奖）`;
};

/** 大航海购买时长：保留服务端在单次购买中携带的特殊时长（如「*5天」）。 */
function guardDurationLabel(guard?: { count?: number; unit?: string }): string | null {
  if (!guard) return null;
  const count = guard.count ?? 1;
  const raw = guard.unit?.trim().replace(/^\*/, "") || "月";
  return `×${count === 1 && /^\d/.test(raw) ? "" : count}${raw}`;
}

function GuardDuration({ guard, style }: { guard?: { count?: number; unit?: string }; style?: CSSProperties }) {
  const label = guardDurationLabel(guard);
  if (!label) return null;
  const value = label.slice(1);
  const count = guard?.count ?? 1;
  const number = count > 1 ? String(count) : value.match(/^\d+(?:\.\d+)?/)?.[0];
  const unit = number ? value.slice(number.length) : value;
  return (
    <span className="guard-duration inline-flex h-[20px] items-center font-mono event-type-section-title" style={style}>
      <span className="prefix quantity-prefix">×</span>
      {number && <span className="number quantity-number">{number}</span>}
      {unit && <span className="unit quantity-unit">{unit}</span>}
    </span>
  );
}

function ScTranslation({ trans }: { trans?: string }) {
  return typeof trans === "string" && trans.trim()
    ? <span className="bili-translation block basis-full min-w-0 break-all text-t2">{trans}</span>
    : null;
}

/** 礼物价格：银瓜子免费显示「免费」，金瓜子按 ¥N（整数不带小数，小额带两位） */
export function giftPriceLabel(g: { isFree?: boolean; totalRmb?: number; priceRmb?: number }): string {
  if (g.isFree) return "免费";
  const rmb = g.totalRmb ?? g.priceRmb ?? NaN;
  if (!Number.isFinite(rmb)) return "金额未知";
  if (rmb <= 0) return "¥0";
  // 整数元不带小数（¥198），分级小额带两位（¥0.1）
  return `¥${Number.isInteger(rmb) ? rmb : rmb.toFixed(2).replace(/0$/, "")}`;
}

export function GiftPrice({ value, style }: { value: string; style?: CSSProperties }) {
  return value === "免费" || value === "金额未知"
    ? <span className={`price gift-price${value === "免费" ? " gift-free-label" : ""} font-ui event-type-control`} style={style}>{value}</span>
    : <CurrencyPrice value={value} className="gift-price font-mono event-type-control" style={style} />;
}

export function CurrencyPrice({ value, className = "", style, leadingSpace = false }: { value: string | number; className?: string; style?: CSSProperties; leadingSpace?: boolean }) {
  const normalized = String(value).replace(/^¥/, "");
  return <span className={`price ${className}`.trim()} style={style}>{leadingSpace ? " " : null}<span className="price-unit">¥</span><span className="price-value">{normalized}</span></span>;
}

/** 礼物图标按 webp、gif、静态图、内置回退图依次加载。 */
type GiftEffectResolver = (event: DanmakuEvent) => GiftEffectResource | null;
type GiftEffectHandler = (event: DanmakuEvent) => void;

export function GiftIcon({
  gift,
  fallback = true,
  onPlayEffect,
  allowManualRetry = false,
  className = "gift-icon",
}: {
  gift?: { name?: string; webp?: string; gif?: string; icon?: string };
  fallback?: boolean;
  onPlayEffect?: () => void;
  allowManualRetry?: boolean;
  className?: string;
}) {
  const { showGiftImage } = useContext(EventDisplayContext);
  const [idx, setIdx] = useState(0);
  const remoteSources = [gift?.webp, gift?.gif, gift?.icon].filter(Boolean) as string[];
  const sources = [...remoteSources, fallback ? GIFT_FALLBACK_PATH : BLIND_BOX_FALLBACK_PATH];
  useEffect(() => setIdx(0), [sources.join("\u0000")]);
  if (!showGiftImage) return null;
  // 按优先级列出可用图源：动图优先
  const wrap = (content: ReactNode) => onPlayEffect ? (
    <button
      type="button"
      className={`${className} event-gift-effect-trigger pointer-events-auto inline-flex shrink-0 items-center justify-center`}
      aria-label={`播放${gift?.name ?? "礼物"}特效`}
      title={`播放${gift?.name ?? "礼物"}特效`}
      onClick={(event) => {
        event.stopPropagation();
        onPlayEffect();
      }}
    >
      {content}
    </button>
  ) : content;
  if (sources.length === 0 || idx >= sources.length) {
    if (!fallback) return null
    if (allowManualRetry && remoteSources.length > 0) {
      return (
        <button
          type="button"
          className={`${className} event-resource-retry inline-flex shrink-0 items-center justify-center rounded-sm`}
          aria-label="重新加载礼物图标"
          title="重新加载礼物图标"
          onClick={(event) => {
            event.stopPropagation();
            setIdx(0);
          }}
        >
          <LucideGift width="1em" height="1em" aria-hidden="true" />
        </button>
      );
    }
    return wrap(<span className={`${onPlayEffect ? "event-effect-image" : className} inline-flex shrink-0 items-center justify-center text-base leading-none`}><LucideGift width="1em" height="1em" aria-hidden="true" /></span>)
  }
  return wrap(
    <img
      src={sources[idx]}
      alt=""
      loading="lazy"
      className={`${onPlayEffect ? "event-effect-image" : className} event-gift-icon inline-block shrink-0 object-contain`}
      onError={() => setIdx((i) => i + 1)}
    />
  )
}

export function Avatar({ user, plain = false }: { user?: DanmakuUser; reviewLayout?: boolean; plain?: boolean }) {
  const { showAvatar, showAvatarFrame } = useContext(EventDisplayContext);
  return <UserAvatar user={user} showAvatar={showAvatar} showAvatarFrame={showAvatarFrame && !plain} />;
}

export function BlindProfit({ difference }: { difference: number | null }) {
  return difference != null && difference !== 0 ? <span className={`blind-profit font-mono ${difference > 0 ? 'is-gain' : 'is-loss'}`}>
    {difference > 0 ? '▲+' : '▼-'}{Math.abs(difference)}
  </span> : null;
}

export function GuardEventIcon({ event, onPlayEffect }: { event: DanmakuEvent; onPlayEffect?: () => void }) {
  const { showEventIcon } = useContext(EventDisplayContext);
  if (!showEventIcon) return null;
  return <GuardPurchaseIcon level={event.guard?.level ?? event.user?.guardLevel} milestone={event.user?.guardMilestone} onPlayEffect={onPlayEffect} />;
}

function Badges({ user, hideGuard = false, hideMedal = false }: { user?: DanmakuUser; hideGuard?: boolean; hideMedal?: boolean }) {
  const preferences = useContext(EventDisplayContext);
  if (!user) return null;
  const nativeIcons = preferences.liveLayout || preferences.archiveLayout;
  const anchorIcon = nativeIcons && preferences.anchorIdentityDisplayMode === "icon";
  const adminIcon = nativeIcons && preferences.adminIdentityDisplayMode === "icon";
  const wealthLevelAssetPath = getWealthMedalAssetPath(user.wealthLevel);
  const showWealth = preferences.showHonorLevel && Number.isFinite(user.wealthLevel) && (user.wealthLevel ?? 0) > 0;
  const showMedal = !hideMedal && Boolean(user.medal?.name) && shouldShowFanMedal(user.medal, preferences);
  if (!(user.guardLevel > 0 && preferences.showGuardIdentity && !hideGuard)
    && !(user.isAnchor && preferences.showAnchorIdentity)
    && !(user.isAdmin && preferences.showAdminIdentity)
    && !showWealth && !showMedal) return null;
  return (
    <span className="badges">
      {user.guardLevel > 0 && preferences.showGuardIdentity && !hideGuard && (
        <GuardIdentityBadge
          label={GUARD_NAME[user.guardLevel as 1 | 2 | 3]}
          iconUrl={user.guardIconUrl}
          iconSet={user.guardIconSet}
          guardLevel={user.guardLevel}
          mode={preferences.guardIdentityDisplayMode}
          textClassName={`shrink-0 rounded px-1 py-px event-type-micro ${GUARD_CLASS[user.guardLevel as 1 | 2 | 3]}`}
        />
      )}
      {user.isAnchor && preferences.showAnchorIdentity && (
        <span className={`streamer-badge shrink-0 rounded bg-ev-sc/10 px-1 py-px event-type-micro text-ev-sc${anchorIcon ? " identity-icon" : ""}`} aria-label="主播" title="主播">
          {anchorIcon ? <NativeRoleIcon role="anchor" /> : "主播"}
        </span>
      )}
      {user.isAdmin && preferences.showAdminIdentity && (
        <span className={`mod-badge shrink-0 rounded border border-success/40 bg-success/10 px-1 py-px event-type-micro text-success${adminIcon ? " identity-icon" : ""}`} aria-label="房管" title="房管">
          {adminIcon ? <NativeRoleIcon role="admin" /> : "房管"}
        </span>
      )}
      {showWealth && (
        preferences.honorLevelDisplayMode === "text" ? (
          <span
            className="wealth-medal shrink-0 rounded border border-line bg-raised px-1 py-px event-type-micro font-mono text-t2 tabular-nums"
            data-level={user.wealthLevel}
            aria-label={`荣耀等级 Lv${user.wealthLevel}`}
            title={`荣耀等级 Lv${user.wealthLevel}`}
          >
            Lv{user.wealthLevel}
          </span>
        ) : wealthLevelAssetPath ? (
          <img
            src={wealthLevelAssetPath}
            alt={`荣耀等级 ${user.wealthLevel}级`}
            title={`荣耀等级 ${user.wealthLevel}级`}
            width={36}
            height={16}
            loading="lazy"
            className="wealth-medal h-4 w-9 shrink-0 object-contain"
            data-level={user.wealthLevel}
          />
        ) : <span
          className="wealth-medal shrink-0 rounded border border-line bg-raised px-1 py-px event-type-micro text-t2"
          data-level={user.wealthLevel}
          aria-label={`荣耀等级 ${user.wealthLevel}级`}
          title={`荣耀等级 ${user.wealthLevel}级`}
        >
          {user.wealthLevel}
        </span>
      )}
      {showMedal && (
        <FanMedalBadge medal={user.medal} eventStyle={!preferences.archiveLayout} />
      )}
    </span>
  );
}

type UserFilterHandler = (user: DanmakuUser) => void;

function ReplyMentionLabel({ user, onUserFilter }: { user: DanmakuUser; onUserFilter?: UserFilterHandler }): ReactNode {
  const { maskUsername } = useContext(EventDisplayContext);
  const label = `@${maskUsername ? maskDisplayName(user.uname) : user.uname}`;
  if (!onUserFilter) return <span className="reply">{label}</span>;
  return (
    <button
      type="button"
      className="reply cursor-pointer underline decoration-dotted underline-offset-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-ring"
      aria-label={`筛选用户：${maskUsername ? maskDisplayName(user.uname) : user.uname}`}
      title={`按用户筛选：${maskUsername ? maskDisplayName(user.uname) : user.uname}`}
      onClick={() => onUserFilter(user)}
    >
      {label}
    </button>
  );
}

function renderUserText(
  text: string,
  {
    replyTo,
    onUserFilter,
    enableBilibiliVideoLinks,
    includeSyntheticReplyMention = true,
    key,
  }: {
    replyTo?: DanmakuUser;
    onUserFilter?: UserFilterHandler;
    enableBilibiliVideoLinks: boolean;
    includeSyntheticReplyMention?: boolean;
    key?: string | number;
  },
): ReactNode {
  const resolution = resolveReplyMention(text, replyTo);
  const match = resolution?.match ?? null;
  const renderPlain = (value: string, partKey?: string) => {
    if (!value) return null;
    if (enableBilibiliVideoLinks) return <BilibiliVideoText key={partKey} text={value} />;
    return partKey === undefined ? value : <Fragment key={partKey}>{value}</Fragment>;
  };

  if (resolution?.prepend && includeSyntheticReplyMention && replyTo) {
    const content = (
      <>
        <ReplyMentionLabel user={replyTo} onUserFilter={onUserFilter} />{" "}
        {renderPlain(text, `${key ?? "reply"}-after`)}
      </>
    );
    return key === undefined ? content : <Fragment key={key}>{content}</Fragment>;
  }

  if (!match || !replyTo) {
    if (enableBilibiliVideoLinks) return <BilibiliVideoText {...(key === undefined ? {} : { key })} text={text} />;
    return key === undefined ? text : <Fragment key={key}>{text}</Fragment>;
  }

  const link = <ReplyMentionLabel user={replyTo} onUserFilter={onUserFilter} />;
  const content = (
    <>
      {renderPlain(text.slice(0, match.start), `${key ?? "reply"}-before`)}
      {link}
      {renderPlain(text.slice(match.end), `${key ?? "reply"}-after`)}
    </>
  );
  return key === undefined ? content : <Fragment key={key}>{content}</Fragment>;
}

function UsernameText({ name }: { name: string }) {
  return <span className="username-text">{name}</span>;
}

function Uname({ user, onUserFilter, hideGuard = false, hideMedal = false, plain = false, inline = false }: { user?: DanmakuUser; onUserFilter?: UserFilterHandler; hideGuard?: boolean; hideMedal?: boolean; plain?: boolean; inline?: boolean }) {
  const { userNicknames, showCurrentRank, maskUsername } = useContext(EventDisplayContext);
  if (!user) return null;
  const originalDisplayName = resolveUserDisplayName(user, userNicknames);
  const displayName = maskUsername ? maskDisplayName(originalDisplayName) : originalDisplayName;
  const className = [
    identityNameClass(user),
    "username event-user-name",
    "event-type-main",
    onUserFilter ? "cursor-pointer rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-ring" : "",
  ].join(" ");
  const Tag = onUserFilter && !inline ? "button" : "span";
  const inlineButton = inline && Boolean(onUserFilter);
  const name = (
    <Tag
      className={className}
      type={Tag === "button" ? "button" : undefined}
      role={inlineButton ? "button" : undefined}
      tabIndex={inlineButton ? 0 : undefined}
      aria-label={onUserFilter ? `筛选用户：${displayName}` : undefined}
      title={onUserFilter ? `按用户筛选：${displayName}` : displayName}
      onClick={onUserFilter ? () => onUserFilter(user) : undefined}
      onKeyDown={inlineButton ? event => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          if (event.key === "Enter" && !event.repeat) event.currentTarget.click();
        }
      } : undefined}
      onKeyUp={inlineButton ? event => {
        if (event.key === " ") {
          event.preventDefault();
          event.currentTarget.click();
        }
      } : undefined}
    >
      <UsernameText name={displayName} />
    </Tag>
  );
  const rank = user.currentRank;
  const rankClass = rank === 1 || rank === 2 || rank === 3 ? ` event-current-rank--${rank}` : "";
  const rankBadge = !plain && showCurrentRank && Number.isFinite(rank) && (rank ?? 0) > 0 ? (
    <span
      className={`rank-badge event-current-rank${rankClass}`}
      data-rank={rank}
      aria-label={`榜单排名：第${rank}名`}
      title={`榜单排名：第${rank}名`}
    >
      榜{rank}
    </span>
  ) : null;
  return <span className="user">{rankBadge}{name}{!plain && <Badges user={user} hideGuard={hideGuard} hideMedal={hideMedal} />}</span>;
}

/** 用户产生的正文颜色；礼物、系统等具有明确语义色的行仍由其自身颜色覆盖。 */
function UserContent({ children, className = "", replyTo, onUserFilter }: { user?: DanmakuUser; children: ReactNode; className?: string; replyTo?: DanmakuUser; onUserFilter?: UserFilterHandler }) {
  const { enableBilibiliVideoLinks } = useContext(EventDisplayContext);
  const content = typeof children === "string"
    ? renderUserText(children, { replyTo, onUserFilter, enableBilibiliVideoLinks })
    : children;
  return <span className={`event-user-content ${className}`}>{content}</span>;
}

/** 正则元字符转义（emotes 的 key 是 "[dog]" 这类含括号文本） */
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 大表情：整条弹幕一张图。payload 尺寸不可信（upower 表情谎报 20x20、真实 162x162），
 *  保持自然等比显示，普通表情尺寸由事件区域的主题变量控制；
 *  官方横幅表情（official_ 前缀，实测均为 195~200x60 横幅）按横幅比例单独限制宽高。 */
function BigEmote({ emoticon, name, allowManualRetry = false, onLoad }: { emoticon: EmoticonInfo; name?: string; allowManualRetry?: boolean; onLoad?: (element: HTMLImageElement) => void }) {
  const [err, setErr] = useState(false);
  useEffect(() => setErr(false), [emoticon.url]);
  if (err) {
    if (allowManualRetry) {
      return (
        <button
          type="button"
          className="event-resource-retry min-w-0 truncate text-t1"
          aria-label="重新加载表情"
          title="重新加载表情"
          onClick={() => setErr(false)}
        >
          {name || "表情"}
        </button>
      );
    }
    return <span className="min-w-0 break-all text-t1">{name || "表情"}</span>;
  }
  const isOfficial = emoticon.unique?.startsWith("official_");
  return (
    <img
      src={emoticon.url}
      alt={name || "表情"}
      loading="lazy"
      className={`emote ${isOfficial ? "banner-emote" : "big-emote"} block shrink-0 rounded-sm object-contain`}
      onLoad={(event) => onLoad?.(event.currentTarget)}
      onError={() => setErr(true)}
    />
  );
}

/** 小表情：与文字混排，按 emotes 占位符切分，命中的段渲染小图（其余按文本） */
function MixedText({ text, emotes, replyTo, onUserFilter, allowManualRetry = false }: { text: string; emotes: Record<string, EmoteInfo>; user?: DanmakuUser; replyTo?: DanmakuUser; onUserFilter?: UserFilterHandler; allowManualRetry?: boolean }) {
  const keys = Object.keys(emotes);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  useEffect(() => setFailed({}), [text, keys.join("\u0000")]);
  const { enableBilibiliVideoLinks } = useContext(EventDisplayContext);
  if (keys.length === 0) return <span className="message event-user-content min-w-0 break-all text-t1">{renderUserText(text, { replyTo, onUserFilter, enableBilibiliVideoLinks })}</span>;
  const replyResolution = resolveReplyMention(text, replyTo);
  const replyPrefix = replyResolution?.prepend && replyTo ? (
    <>
      <ReplyMentionLabel user={replyTo} onUserFilter={onUserFilter} />{" "}
    </>
  ) : null;
  const parts = text.split(new RegExp(`(${keys.map(escapeRe).join("|")})`, "g"));
  return (
    <span className="message event-user-content min-w-0 break-all text-t1">
      {replyPrefix}
      {parts.map((p, i) =>
        emotes[p] ? failed[p] && allowManualRetry ? (
          <button
            key={i}
            type="button"
            className="event-resource-retry mx-0.5 inline-block h-5 max-w-24 truncate align-[-3px] text-t2"
            aria-label={`重新加载表情 ${p}`}
            title={`重新加载表情 ${p}`}
            onClick={() => setFailed((current) => ({ ...current, [p]: false }))}
          >
            {p}
          </button>
        ) : failed[p] ? (
          <Fragment key={i}>{p}</Fragment>
        ) : (
          <img
            key={i}
            src={emotes[p].url}
            alt={p}
            loading="lazy"
            // 20px 官方原始尺寸，微下沉对齐文字基线
            className="emote inline-emote mx-0.5 inline-block h-5 w-5 align-[-3px] object-contain"
            onError={() => setFailed((current) => ({ ...current, [p]: true }))}
          />
        ) : p ? (
          renderUserText(p, { replyTo, onUserFilter, enableBilibiliVideoLinks, includeSyntheticReplyMention: false, key: i })
        ) : null,
      )}
    </span>
  );
}

const NativeLayoutParts = createContext<{avatar?: ReactNode; status?: ReactNode; winners?: ReactNode}>({});

function NativeEventParts({ info, children, time, media, inlineTime = false, groupInfo = false }: {
  info: ReactNode; children: ReactNode; time?: ReactNode; media?: ReactNode; inlineTime?: boolean; groupInfo?: boolean;
}) {
  const { avatar, status, winners } = useContext(NativeLayoutParts);
  return <>
    {groupInfo ? <span className="info">{avatar}{info}</span> : <>{avatar}{info}</>}
    {media}
    <span className="content">{children}</span>
    {status}
    {winners}
    {inlineTime && time ? " " : null}
    {time}
  </>;
}

function ActivityResultSummary({ event, kind }: { event: DanmakuEvent; kind: "lottery" | "redpocket"; onUserFilter?: UserFilterHandler }) {
  const {archiveLayout}=useContext(EventDisplayContext);
  const received=event.lottery?.winners?.length ?? 0;
  const count=received > 0 ? Math.max(received, event.lottery?.awardNum ?? received) : 0;
  const content=<>{count > 0 && <><span className="winner-count">{count} 人</span>{"获得 "}</>}{event.lottery?.awardName && <span className={kind === "lottery" ? "lottery-name" : "redpocket-name"}>{event.lottery.awardName}</span>}</>;
  return <span className={`${kind} result-description${archiveLayout ? " review-inline-flow" : ""}`}>{archiveLayout ? <ReviewInlineItems>{content}</ReviewInlineItems> : content}</span>;
}

function Content({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  const {archiveLayout}=useContext(EventDisplayContext);
  if(archiveLayout)return <span className={`content review-inline-flow ${className}`} style={style}><ReviewInlineItems>{children}</ReviewInlineItems></span>;
  return <span className={`content ${className}`} style={style}>{children}</span>;
}

function InlineEventGroup({children,className}: {children:ReactNode;className:string}) {
  const {archiveLayout}=useContext(EventDisplayContext);
  return <span className={`${className}${archiveLayout ? " review-inline-flow" : ""}`}>{archiveLayout ? <ReviewInlineItems>{children}</ReviewInlineItems> : children}</span>;
}

function SystemMessage({ ev, onUserFilter }: { ev: DanmakuEvent; onUserFilter?: UserFilterHandler }) {
  const { maskUsername, archiveLayout, showEventIcon } = useContext(EventDisplayContext);
  const message = getSystemMessage(ev);
  const icons = {
    [MsgType.LiveStart]: LucidePlay,
    [MsgType.LiveEnd]: LucideSquare,
    [MsgType.RoomBlock]: LucideUserRoundX,
    [MsgType.RoomSilent]: ev.roomSilent?.action === "off" ? LucideVolume2 : LucideVolumeX,
    [MsgType.AdminChange]: LucideShieldCheck,
    [MsgType.Warning]: LucideTriangleAlert,
    [MsgType.CutOff]: LucideBan,
    [MsgType.RoomLock]: LucideLockKeyhole,
    [MsgType.RoomChange]: LucideSquarePen,
    [MsgType.CoverAudit]: LucideSquarePen,
  };
  const Icon = icons[ev.msgType as keyof typeof icons];
  const tone = ev.msgType === MsgType.Warning || ev.msgType === MsgType.RoomBlock ? "var(--status-warning)"
    : (ev.msgType === MsgType.CutOff || ev.msgType === MsgType.RoomLock) ? "var(--status-danger)"
    : ev.msgType === MsgType.LiveStart ? "var(--status-success)" : undefined;
  const user = ev.user && !ev.user.uname && !maskUsername ? { ...ev.user, uname: `UID ${ev.user.uid}` } : ev.user;
  return <Content className="system-message" style={tone ? { "--local-system-message-tone": tone } as CSSProperties : undefined}>
    {showEventIcon && Icon && <Icon className="event-icon system-message-icon" aria-hidden="true" />}
    <span className="system-message-copy">
      <span className="system-message-title">{message.user && <><Avatar user={user} plain /><Uname user={user} onUserFilter={onUserFilter} plain inline />{" "}</>}<span className="message">{message.title}</span>{!archiveLayout && (ev.msgType === MsgType.LiveStart || ev.msgType === MsgType.LiveEnd) && <NativeEventTime ts={ev.ts} className="time lifecycle-time" />}</span>
      {message.detail && <span className="message system-message-detail">{message.detail}</span>}
      {message.expiry && <RoomLockExpiry className="system-message-expiry" endsAt={ev.roomLock?.endsAt} />}
    </span>
  </Content>;
}

/** 例外事件保持紧凑布局；大表情本身就是正文，不再额外造一行。 */
function canUseLiveSplit(ev: DanmakuEvent): boolean {
  switch (ev.msgType) {
    case MsgType.Danmu:
    case MsgType.Gift:
    case MsgType.SuperChat:
    case MsgType.AnchorLotStart:
    case MsgType.AnchorLotAward:
    case MsgType.RedPocketStart:
    case MsgType.RedPocketWinner:
      return true;
    case MsgType.Interact:
    case MsgType.EntryEffect:
    case MsgType.GuardBuy:
      return true;
    case MsgType.GuardHonor:
      return false;
    default:
      return false;
  }
}

function DanmuRepeatBadge({ count }: { count?: number }) {
  if ((count ?? 0) <= 1) return null;
  return (
    <span className="repeat-count danmu-repeat-badge inline-flex h-[20px] items-center rounded-full bg-accent-subtle px-1.5 event-type-micro font-mono font-medium text-accent-text">
      ×{count}
    </span>
  );
}

/** 现场布局下的“元信息 + 正文”渲染；回看使用 Body 并允许内容自然换行。 */
function Quantity({ count, className = "" }: { count: number; className?: string }) {
  return <span className={`quantity ${className}`.trim()}><span className="prefix quantity-prefix">×</span><span className="number quantity-number">{count}</span></span>;
}

function RedPocketAwards({ event }: { event: DanmakuEvent }) {
  const { archiveLayout } = useContext(EventDisplayContext);
  const awards = event.lottery?.awards;
  if (!awards?.length) return null;
  return <span className="redpocket-awards">
    <span className="prefix">奖励</span>{" "}
    {awards.map((award, index) => <Fragment key={index}>
      {index > 0 && "、"}<span className="redpocket-award">
        <span className="redpocket-name">{award.name}</span>
        {(!archiveLayout || award.count > 1) && <Quantity count={award.count} className="redpocket-count" />}
      </span>
    </Fragment>)}
  </span>;
}

function LiveSplitBody({ ev, onUserFilter, giftEffectResource, onPlayGiftEffect, allowManualRetry = false, time }: { ev: DanmakuEvent; color: string | null; onUserFilter?: UserFilterHandler; giftEffectResource?: GiftEffectResource | null; onPlayGiftEffect?: GiftEffectHandler; allowManualRetry?: boolean; time?: ReactNode }) {
  const preferences = useContext(EventDisplayContext);
  const user = ev.user;
  switch (ev.msgType) {
    case MsgType.Danmu:
      return <NativeEventParts time={time} inlineTime info={<Uname user={user} onUserFilter={onUserFilter} inline />}>
        {ev.emoticon ? <span className="message"><BigEmote emoticon={ev.emoticon} name={ev.text} allowManualRetry={allowManualRetry} /></span> : ev.emotes ? <MixedText text={ev.text ?? ""} emotes={ev.emotes} replyTo={ev.replyTo} onUserFilter={onUserFilter} allowManualRetry={allowManualRetry} /> : <UserContent replyTo={ev.replyTo} onUserFilter={onUserFilter} className="message">{ev.text}</UserContent>}
        <DanmuRepeatBadge count={ev.danmuRepeatCount} />{ev.danmuDeleted && <>{" "}<span className="status deleted">已撤回</span></>}
      </NativeEventParts>;
    case MsgType.Interact:
    case MsgType.EntryEffect:
      return <NativeEventParts time={time} inlineTime info={<Uname user={user} onUserFilter={onUserFilter} inline />}><UserContent className="action">{ev.text}</UserContent></NativeEventParts>;
    case MsgType.Gift: {
      const gift = ev.gift, count = gift?.count ?? 1;
      const hit = gift?.blindGiftName ? gift.blindHitPriceRmb ?? gift.priceRmb : undefined;
      const hitTotal = hit === undefined ? undefined : Math.round(hit * count * 100) / 100;
      const cost = gift?.blindPriceRmb === undefined ? undefined : Math.round(gift.blindPriceRmb * count * 100) / 100;
      return <NativeEventParts time={time} info={<Uname user={user} onUserFilter={onUserFilter} />}>
        <span className="action">送出</span>
        <GiftIcon gift={gift} onPlayEffect={giftEffectResource && onPlayGiftEffect ? () => onPlayGiftEffect(ev) : undefined} allowManualRetry={allowManualRetry} />
        <span className="gift"><span className="gift-name">{gift?.name}</span><Quantity count={count} className="gift-count" /></span>
        <GiftPrice value={giftPriceLabel(gift?.blindGiftName ? { isFree: gift.isFree, totalRmb: hitTotal } : gift ?? {})} />
        {gift?.blindGiftName && <span className="blind-gift">
          <GiftIcon className="blind-gift-icon" fallback={false} gift={{webp:gift.blindWebp, gif:gift.blindGif, icon:gift.blindIcon}} allowManualRetry={allowManualRetry} />
          <span className="blind-gift-name">{gift.blindGiftName}</span>{count > 1 && <Quantity count={count} className="blind-gift-count" />}
          {cost !== undefined && <CurrencyPrice value={cost} className="blind-price" />}<span className="action">开出</span>{" "}
          <BlindProfit difference={hitTotal !== undefined && cost !== undefined ? Math.round((hitTotal-cost)*100)/100 : null} />
        </span>}
      </NativeEventParts>;
    }
    case MsgType.GuardBuy: {
      const level=ev.guard?.level ?? 1, action=ev.guard?.action;
      const verb=action === "升级" ? "升级为" : action === "降级" ? "降级为" : action ?? (ev.guard?.opType === 2 ? "续费" : ev.guard?.opType === 3 ? "升级为" : ev.guard?.opType === 1 ? "开通" : "上舰");
      const days=ev.text?.match(/陪伴主播的第(\d+)天/)?.[1];
      return <NativeEventParts time={time} info={<Uname user={user} onUserFilter={onUserFilter} hideGuard hideMedal />}>
        <span className="action">{verb}</span>
        <GuardEventIcon event={ev} onPlayEffect={giftEffectResource && onPlayGiftEffect ? () => onPlayGiftEffect(ev) : undefined} />
        <span className="guard"><span className="guard-name">{GUARD_NAME[level]}</span><GuardDuration guard={ev.guard} /></span>
        {ev.guard?.priceRmb !== undefined && <CurrencyPrice value={ev.guard.priceRmb} />}
        {days && <span className="guard-companion-days"><span className="prefix">陪伴</span>{" "}<span className="number">{days}</span>{" "}<span className="unit">天</span></span>}
      </NativeEventParts>;
    }
    case MsgType.SuperChat:
      return <NativeEventParts time={time} groupInfo info={<><Uname user={user} onUserFilter={onUserFilter} /><CurrencyPrice value={ev.sc?.price ?? 0} /><NativeEventIcon visible={preferences.showEventIcon} kind="superchat" /></>}>
        <span className="message"><UserContent>{ev.sc?.message ?? ev.text}</UserContent></span><ScTranslation trans={ev.sc?.trans} />{ev.scDeleted && <>{" "}<span className="status deleted">已撤回</span></>}
      </NativeEventParts>;
    case MsgType.AnchorLotStart:
      return <NativeEventParts time={time} media={preferences.showEventIcon && <NativeEventIcon visible={preferences.showEventIcon} kind="lottery" />} info={<span className="action activity-title">天选福袋</span>}>
        <span className="lottery"><span className="activity-prize"><span className="lottery-name">{ev.lottery?.awardName}</span>{ev.lottery?.awardNum !== undefined && <Quantity className="lottery-count" count={ev.lottery.awardNum} />}</span>
        {ev.lottery?.danmu && <span className="lottery-command"><span className="prefix">口令</span><span className="text">「{ev.lottery.danmu}」</span></span>}
        {ev.lottery?.giftName && <span className="lottery-required-gift"><span className="prefix">需送出</span>{" "}<span className="gift-name">{ev.lottery.giftName}</span></span>}
        {ev.lottery?.requireText && <span className="lottery-requirement"><span className="prefix">条件</span>{" "}<span className="text">{ev.lottery.requireText}</span></span>}</span>
      </NativeEventParts>;
    case MsgType.RedPocketStart: {
      const name=ev.pocket?.rpType === 2 ? "大航海红包" : ev.pocket?.rpType === 3 || ev.pocket?.rpType === 5 ? "电池红包" : "红包";
      return <NativeEventParts time={time} info={<Uname user={user} onUserFilter={onUserFilter} />}>
        <span className="redpocket">
          <span className="activity-action">{preferences.showEventIcon && <NativeEventIcon visible={preferences.showEventIcon} kind="redpocket" rpType={ev.pocket?.rpType} />}<span className="action">发出{name}</span></span>
          {ev.lottery?.totalPrice !== undefined && <CurrencyPrice value={ev.lottery.totalPrice/1000} />}
          <RedPocketAwards event={ev} />
          {ev.pocket?.danmu && <span className="redpocket-command"><span className="prefix">口令</span><span className="text">「{ev.pocket.danmu}」</span></span>}
        </span>
      </NativeEventParts>;
    }
    case MsgType.AnchorLotAward:
    case MsgType.RedPocketWinner: {
      const kind=ev.msgType === MsgType.AnchorLotAward ? "lottery" : "redpocket";
      return <NativeEventParts time={time} media={<NativeEventIcon visible={preferences.showEventIcon} kind={kind} rpType={ev.pocket?.rpType} />} info={<span className="action result-title">{kind === "lottery" ? "天选开奖" : "红包开奖"}</span>}><ActivityResultSummary event={ev} kind={kind} /></NativeEventParts>;
    }
    default: return null;
  }
}

function Body({ ev, onUserFilter, giftEffectResource, onPlayGiftEffect, allowManualRetry = false, onContentSizeChange }: { ev: DanmakuEvent; color: string | null; onUserFilter?: UserFilterHandler; giftEffectResource?: GiftEffectResource | null; onPlayGiftEffect?: GiftEffectHandler; allowManualRetry?: boolean; onContentSizeChange?: (element: HTMLImageElement) => void }) {
  const preferences = useContext(EventDisplayContext);
  const user = ev.user;
  const playGiftEffect = giftEffectResource && onPlayGiftEffect ? () => onPlayGiftEffect(ev) : undefined;

  const body=(()=>{
  switch (ev.msgType) {
    case MsgType.Danmu:
      return (
        <>
          <Uname user={user} onUserFilter={onUserFilter} />
          <Content>
          {ev.emoticon ? (
          <span className="message"><BigEmote emoticon={ev.emoticon} name={ev.text} allowManualRetry={allowManualRetry} onLoad={onContentSizeChange} /></span>
          ) : ev.emotes ? (
            <MixedText text={ev.text ?? ""} emotes={ev.emotes} user={user} replyTo={ev.replyTo} onUserFilter={onUserFilter} allowManualRetry={allowManualRetry} />
          ) : (
            <UserContent user={user} replyTo={ev.replyTo} onUserFilter={onUserFilter} className="message min-w-0 break-all text-t1">{ev.text}</UserContent>
          )}
          <DanmuRepeatBadge count={ev.danmuRepeatCount} />
          {ev.danmuDeleted && <span className="status deleted">已撤回</span>}
          </Content>
        </>
      );

    case MsgType.Gift: {
      const count = ev.gift?.count ?? 1;
      const blindHitTotal = ev.gift?.blindGiftName
        ? Math.round(((ev.gift.blindHitPriceRmb ?? ev.gift.priceRmb ?? 0) * count) * 100) / 100
        : undefined;
      const blindBoxTotal = ev.gift?.blindGiftName && ev.gift.blindPriceRmb != null
        ? Math.round((ev.gift.blindPriceRmb * count) * 100) / 100
        : undefined;
      const blindDiff = blindHitTotal != null && blindBoxTotal != null
        ? Math.round((blindHitTotal - blindBoxTotal) * 100) / 100
        : null;
      return (
        <>
          <Uname user={user} onUserFilter={onUserFilter} />
          <Content>
          <span className="action text-t2">送出</span>
          <GiftIcon gift={ev.gift} onPlayEffect={playGiftEffect} allowManualRetry={allowManualRetry} />
          <span className="gift inline-flex items-center gap-0">
          <span className="gift-name font-medium">
            {ev.gift?.name}
          </span>
          <Quantity count={ev.gift?.count ?? 1} className="gift-count" />
          </span>
          {/* 盲盒：显示爆出物价值（price）；普通礼物：实付总价（total_coin） */}
          <GiftPrice
            value={ev.gift
              ? giftPriceLabel(
                  ev.gift.blindGiftName
                    ? { isFree: ev.gift.isFree, totalRmb: blindHitTotal, priceRmb: blindHitTotal }
                    : ev.gift,
                )
              : ""}
          />
          {ev.gift?.blindGiftName && (
              <>
                <GiftIcon className="blind-gift-icon" fallback={false} gift={{ webp: ev.gift!.blindWebp, gif: ev.gift!.blindGif, icon: ev.gift!.blindIcon }} allowManualRetry={allowManualRetry} />
                <span className="blind-gift">
                <span className="blind-gift-name">{ev.gift!.blindGiftName}</span>
                {count > 1 && <Quantity count={count} className="blind-gift-count" />}
              {blindBoxTotal != null ? <CurrencyPrice value={blindBoxTotal} leadingSpace={count > 1} className="blind-price" /> : ""}<span className="action">开出</span>
                <BlindProfit difference={blindDiff} />
                </span>
              </>
          )}
          </Content>
        </>
      );
    }

    case MsgType.SuperChat:
      return (
        <>
          <NativeEventIcon visible={preferences.showEventIcon} kind="superchat" />
          <Uname user={user} onUserFilter={onUserFilter} />
          <Content>
          <CurrencyPrice value={ev.sc?.price ?? 0} className="font-mono font-semibold" />
          {/* SUPER_CHAT_MESSAGE_DELETE 命中：内容加删除线 + 已删除标记 */}
          <span
            className={`message min-w-0 break-all ${ev.scDeleted ? "text-t3 " : "text-t1"}`}
          >
            <UserContent user={user}>{ev.sc?.message ?? ev.text}</UserContent>
          </span>
          <ScTranslation trans={ev.sc?.trans} />
          {ev.scDeleted && (
            <span className="status deleted rounded bg-raised px-1.5 py-0.5 event-type-micro text-t3">
              已撤回
            </span>
          )}
          </Content>
        </>
      );

    case MsgType.GuardBuy: {
      const level = ev.guard?.level ?? 1;
      // 服务端 toast_msg 的动作词优先；op_type 仅在缺少原始文案时兜底。
      const op = ev.guard?.opType;
      const action = ev.guard?.action;
      const verb = action === "升级" ? "升级为"
        : action === "降级" ? "降级为"
        : action ?? (op === 2 ? "续费" : op === 3 ? "升级为" : op === 1 ? "开通" : "上舰");
      // 陪伴天数取自 toast_msg（「今天是TA陪伴主播的第N天」）；升级等不含则不显示
      const days = ev.text && /陪伴主播的第(\d+)天/.test(ev.text)
        ? ev.text.match(/陪伴主播的第(\d+)天/)![1]
        : null;
      return (
        <>
          <GuardEventIcon event={ev} onPlayEffect={playGiftEffect} />
          <Uname user={user} onUserFilter={onUserFilter} hideGuard hideMedal />
          <Content>
          <span className="action text-t2">{verb}</span>
          <span className="guard inline-flex items-center gap-0">
          <span className="guard-name font-medium">
            {GUARD_NAME[level]}
          </span>
          <GuardDuration guard={ev.guard} />
          </span>
          {ev.guard?.priceRmb !== undefined ? (
            <CurrencyPrice value={ev.guard.priceRmb} className="guard-price inline-flex h-[20px] items-center font-mono event-type-control" />
          ) : null}
          {days && (
            <span className="guard-companion-days event-type-meta text-t3"><span className="prefix">陪伴</span>{" "}<span className="number">{days}</span>{" "}<span className="unit">天</span></span>
          )}
          </Content>
        </>
      );
    }

    case MsgType.GuardHonor: {
      // 富文本 <%...%> 高亮占位符：解析成高亮 span（官方文案「恭喜主播<%名%>」）
      const honorLine = (s: string, milestone = false) =>
        s.split(/(<%[^%]*%>)/g).filter(Boolean).map((p, i) =>
          p.startsWith("<%") ? (
            <span key={i} className={`honor-highlight font-semibold ${milestone && /^<%\d+%>$/.test(p) ? "honor-milestone" : ""}`}>{p.slice(2, -2)}</span>
          ) : (
            <span key={i} className="text-t2">{p}</span>
          ),
        );
      return (
        <>
          {preferences.showEventIcon && <GuardHonorWatermark honor={ev.honor} onPlayEffect={playGiftEffect} />}
          <Content>
          {ev.honor && (
            <span className="message honor-message min-w-0">
              <span className="honor-heading">{honorLine(ev.honor.firstLine)}</span>
              {ev.honor.secondLine && <span className="honor-summary">{honorLine(ev.honor.secondLine, /达成|突破|累计|规模|舰队/.test(ev.honor.secondLine))}</span>}
            </span>
          )}
          </Content>
        </>
      );
    }

    case MsgType.AnchorLotStart: {
      const wait = waitLabel(ev.lottery?.maxTime);
      return (
        <>
          <NativeEventIcon visible={preferences.showEventIcon} kind="lottery" />
          <Content>
          <span className="action font-medium">
            天选福袋
          </span>
          {(ev.lottery?.awardName || (ev.lottery?.awardNum ?? 0) > 1 || ev.lottery?.danmu || ev.lottery?.giftName || ev.lottery?.requireText || wait) && <InlineEventGroup className="lottery inline-flex flex-wrap items-center gap-x-1.5">
          <span className="text-t2">
            {ev.lottery?.awardName && <span className="lottery-name">{ev.lottery.awardName}</span>}
            {ev.lottery && ev.lottery.awardNum > 1 && <span className="lottery-count">{`×${ev.lottery.awardNum}`}</span>}
          </span>
          {ev.lottery?.danmu && (
            <span className="lottery-command event-type-control text-t3"><span className="prefix">口令</span>「<span className="text">{ev.lottery.danmu}</span>」</span>
          )}
          {ev.lottery?.giftName && (
            <span className="lottery-required-gift event-type-control text-t3"><span className="prefix">需送出</span>{" "}<span className="gift-name">{ev.lottery.giftName}</span></span>
          )}
          {ev.lottery?.requireText && <span className="lottery-requirement">{ev.lottery.requireText}</span>}
          <ActivityStatus event={ev} />
          </InlineEventGroup>}
          </Content>
        </>
      );
    }

    case MsgType.AnchorLotAward:
      return <><NativeEventIcon visible={preferences.showEventIcon} kind="lottery" /><span className="action font-medium">天选开奖</span><Content><ActivityResultSummary event={ev} kind="lottery" /></Content></>;

    // 红包开始：显示发起人、总额、奖励清单、口令和等待时长
    case MsgType.RedPocketStart: {
      return (
        <>
          <NativeEventIcon visible={preferences.showEventIcon} kind="redpocket" rpType={ev.pocket?.rpType} />
          <Uname user={user} onUserFilter={onUserFilter} />
          <Content>
          <InlineEventGroup className="redpocket inline-flex flex-wrap items-center gap-x-1.5">
          <span className="action text-t2">发出{ev.pocket?.rpType === 2 ? "大航海红包" : ev.pocket?.rpType === 3 || ev.pocket?.rpType === 5 ? "电池红包" : "红包"}</span>{" "}
          {ev.lottery?.totalPrice !== undefined ? (
          <CurrencyPrice value={ev.lottery.totalPrice / 1000} className="font-mono event-type-control" />
          ) : null}
          <RedPocketAwards event={ev} />
          {ev.pocket?.danmu && (
            <span className="redpocket-command text-t2"><span className="prefix">口令</span>「<span className="text">{ev.pocket.danmu}</span>」</span>
          )}
          <ActivityStatus event={ev} />
          </InlineEventGroup>
          </Content>
        </>
      );
    }

    case MsgType.RedPocketWinner:
      return <><NativeEventIcon visible={preferences.showEventIcon} kind="redpocket" rpType={ev.pocket?.rpType} /><span className="action font-medium">红包开奖</span><Content><ActivityResultSummary event={ev} kind="redpocket" /></Content></>;

    case MsgType.Recall:
      return (
        <>
          <Uname user={user} onUserFilter={onUserFilter} />
          <Content><UserContent user={user} className="message text-t3 line-through">撤回了一条弹幕</UserContent></Content>
        </>
      );

    case MsgType.Warning:
    case MsgType.CutOff:
    case MsgType.RoomLock:
    case MsgType.LiveStart:
    case MsgType.LiveEnd:
    case MsgType.RoomBlock:
    case MsgType.RoomSilent:
    case MsgType.AdminChange:
    case MsgType.RoomChange:
    case MsgType.CoverAudit:
      return <SystemMessage ev={ev} onUserFilter={onUserFilter} />;

    default:
      // Interact/EntryEffect/RoomBlock/AdminChange/RoomChange/Unknown 等：安静的次级行
      // 点赞（复用 Interact，text 为「为主播点赞了」）用心形图标区分
      const isLike = ev.msgType === MsgType.Interact && ev.text?.includes("点赞");
      return (
        <>
          {preferences.showEventIcon && !preferences.archiveLayout && isLike && <span className="event-icon text-danger"><LucideHeart width="1em" height="1em" aria-hidden="true" /></span>}
          <Uname user={user} onUserFilter={onUserFilter} />
          <Content><UserContent user={user} className={`${ev.msgType === MsgType.Interact ? "action" : "message"} text-t3`}>
            {ev.text ?? MsgTypeName[ev.msgType]}
            {ev.msgType === MsgType.Unknown && (
              <span className="font-mono event-type-meta"> ({ev.text})</span>
            )}
          </UserContent></Content>
        </>
      );
  }
  })();
  return preferences.archiveLayout ? <ReviewInlineItems wide>{body}</ReviewInlineItems> : body;
}

function ActivityStatus({event, fixedNow}: {event: DanmakuEvent; fixedNow?: number}) {
  const presentation = useActivityPresentation(event, fixedNow);
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const row = ref.current?.closest<HTMLElement>('.event');
    if (row) row.dataset.activityState = presentation.state;
  }, [presentation.state]);
  return <span ref={ref} className={`activity-status activity-${presentation.state}${presentation.state === 'running' && (presentation.remainingSeconds ?? 11) <= 10 ? ' activity-urgent' : ''} ${event.msgType === MsgType.AnchorLotStart ? 'lottery-wait' : 'redpocket-wait'}`}
    data-activity-state={presentation.state} data-urgent={presentation.state === 'running' && (presentation.remainingSeconds ?? 11) <= 10 || undefined}>
    <LucideClock3 className="activity-clock" aria-hidden="true" />{presentation.label}
  </span>;
}

function NativeEventFrame({event, live, plainAvatar, fixedNow, winners, children}: {event: DanmakuEvent; live: boolean; plainAvatar: boolean; fixedNow?: number; winners?: ReactNode; children: ReactNode}) {
  const avatarUser = (event.msgType === MsgType.AnchorLotStart || event.msgType === MsgType.GuardHonor) ? (event.broadcaster ?? {uid:"",uname:"",guardLevel:0}) : event.user;
  const avatar = plainAvatar || (event.msgType === MsgType.GuardHonor && !event.broadcaster) ? null : <Avatar user={avatarUser} plain={plainAvatar} />;
  if (!live) return <>{avatar}{children}</>;
  if (event.msgType === MsgType.Interact || event.msgType === MsgType.EntryEffect)
    return <NativeLayoutParts.Provider value={{avatar}}>{children}</NativeLayoutParts.Provider>;
  const result = event.msgType === MsgType.AnchorLotAward || event.msgType === MsgType.RedPocketWinner;
  const activity = event.msgType === MsgType.AnchorLotStart || event.msgType === MsgType.RedPocketStart;
  return <NativeLayoutParts.Provider value={{avatar: !result ? avatar : null, winners, status: activity ? <ActivityStatus event={event} fixedNow={fixedNow} /> : null}}>{children}</NativeLayoutParts.Provider>;
}

type EventContentProps = Parameters<typeof Body>[0];

function NativeEventContent({ time, ...props }: EventContentProps & { time: ReactNode }) {
  const {avatar, status} = useContext(NativeLayoutParts);
  if (canUseLiveSplit(props.ev)) return <LiveSplitBody {...props} time={time} />;
  return <>
    {avatar}
    <Body {...props} />
    {status}
    {time}
  </>;
}

export const EventRow = memo(function EventRow({
  ev,
  liveLayout = false,
  reviewLayout = false,
  archiveLayout = reviewLayout,
  showTime = true,
  maskUsername = false,
  onUserFilter,
  allowWinnerExpansion = true,
  displayPreferences: suppliedDisplayPreferences = DEFAULT_EVENT_DISPLAY_PREFERENCES,
  eventStyleSettings: suppliedEventStyleSettings = DEFAULT_EVENT_STYLE_SETTINGS,
  eventFontSize: suppliedEventFontSize = DEFAULT_EVENT_FONT_SIZE,
  enableBilibiliVideoLinks = false,
  eventAreaRef,
  locatedHighlight = false,
  eventMenu,
  eventMenuScope,
  giftEffectResolver,
  onPlayGiftEffect,
  onContentSizeChange,
  animateOnMount = true,
  onAnimationMount,
  userNicknames: displayUserNicknames,
  activityNow,
}: {
  ev: DanmakuEvent;
  liveLayout?: boolean;
  reviewLayout?: boolean;
  archiveLayout?: boolean;
  showTime?: boolean;
  maskUsername?: boolean;
  onUserFilter?: UserFilterHandler;
  allowWinnerExpansion?: boolean;
  displayPreferences?: EventDisplayPreferences;
  eventStyleSettings?: EventStyleSettings;
  eventFontSize?: number;
  enableBilibiliVideoLinks?: boolean;
  eventAreaRef?: RefObject<HTMLElement | null>;
  locatedHighlight?: boolean;
  eventMenu?: EventMenuHandlers;
  eventMenuScope?: EventMenuScope;
  giftEffectResolver?: GiftEffectResolver;
  onPlayGiftEffect?: GiftEffectHandler;
  onContentSizeChange?: (element: HTMLImageElement) => void;
  animateOnMount?: boolean;
  onAnimationMount?: () => void;
  userNicknames?: UserNicknames;
  activityNow?: number;
}) {
  const reviewStyle = useGeneralSettings(state => archiveLayout ? state.reviewStyleSettings : undefined);
  const displayPreferences = reviewStyle ? reviewDisplayPreferences(reviewStyle) : suppliedDisplayPreferences;
  const eventStyleSettings = archiveLayout ? DEFAULT_EVENT_STYLE_SETTINGS : suppliedEventStyleSettings;
  const eventFontSize = reviewStyle?.fontSize ?? suppliedEventFontSize;
  const animationMountedRef = useRef(false);
  const localUserNicknames = useEventUserNicknames();
  const userNicknames = displayUserNicknames ?? localUserNicknames;
  const shortcutActions = useEventShortcutActions();
  useEffect(() => {
    if (!animateOnMount || animationMountedRef.current) return;
    animationMountedRef.current = true;
    onAnimationMount?.();
  }, [animateOnMount, onAnimationMount]);
  const eventHasPersistentAction = Boolean(eventMenu && (
    eventMenu.isFavorite(ev)
    || (eventMenuScope !== "review" && Boolean(eventMenu.isMarked?.(eventMenu.regionKey, ev)))
  ));
  const eventStyleType = getEventStyleType(ev.msgType, ev.guard?.level ?? ev.user?.guardLevel);
  const resolvedStyle = resolveEventRowStyle(eventStyleSettings, ev.user, eventStyleType);
  const semanticColor = evColor(ev);
  const color = resolvedStyle.contentColor ?? semanticColor;
  const giftEffectResource = (ev.msgType === MsgType.Gift && ev.gift) || (!reviewLayout && (ev.guard || ev.honor))
    ? giftEffectResolver?.(ev) ?? null
    : null;
  const lifecycleClass = ev.msgType === MsgType.LiveStart
    ? "event-row-lifecycle-start"
    : ev.msgType === MsgType.LiveEnd
      ? "event-row-lifecycle-end"
      : "";
  const systemEvent = isSystemReminderEvent(ev);
  const nativeTime = !archiveLayout && showTime && !systemEvent && ev.msgType !== MsgType.GuardHonor ? <NativeEventTime ts={ev.ts} /> : null;
  const highlight = lifecycleClass !== "" || HIGHLIGHT_TYPES.includes(ev.msgType);

  const size = Number.isFinite(eventFontSize) ? eventFontSize : DEFAULT_EVENT_FONT_SIZE;
  const eventAnimationDuration = getEventAnimationDuration(
    displayPreferences.eventAnimationPreset,
    displayPreferences.eventAnimationDurationMs,
  );
  const eventAnimationExitDuration = getEventAnimationExitDuration(
    displayPreferences.eventAnimationPreset,
    displayPreferences.eventAnimationDurationMs,
  );
  const rowStyle: CSSProperties = {
    ...(archiveLayout ? {"--review-size": `${eventFontSize}px`} : {}),
    "--event-animation-duration": `${eventAnimationDuration}ms`,
    "--event-animation-exit-duration": `${eventAnimationExitDuration}ms`,
  } as CSSProperties;

  if (ev.msgType === MsgType.RedPocketGift || ev.msgType === MsgType.Recall || ev.msgType === MsgType.CoverAudit) return null;

  const winners = allowWinnerExpansion && (ev.msgType === MsgType.AnchorLotAward || ev.msgType === MsgType.RedPocketWinner) && (
    <LotteryWinnerList
      key={ev.reactKey ?? ev.id}
      totalCount={ev.lottery?.awardNum}
      showAvatar={displayPreferences.showAvatar}
      winners={maskUsername ? ev.lottery?.winners?.map(winner => ({ ...winner, uname: maskDisplayName(winner.uname) })) : ev.lottery?.winners}
      onWinnerFilter={onUserFilter ? winner => onUserFilter({
        uid: winner.uid,
        uname: ev.lottery?.winners?.find(original => original.uid === winner.uid)?.uname ?? winner.uname,
        guardLevel: 0,
      }) : undefined}
    />
  );

  return (
    <EventDisplayContext.Provider value={{ ...displayPreferences, eventStyleSettings, liveLayout, archiveLayout, enableBilibiliVideoLinks, userNicknames, eventStyleType, maskUsername }}>
      <div
        className={[
          "event event-row group",
          publicEventClass(ev),
          archiveLayout
            ? priceGradientClass(ev, REVIEW_PRICE_GRADIENT, reviewStyle?.usePriceGradient === true)
            : priceGradientClass(ev, (eventStyleSettings as import('../themes/nativeComponentAppearance.ts').NativeThemeSettings).priceGradient, (eventStyleSettings as import('../themes/nativeComponentAppearance.ts').NativeThemeSettings).display?.usePriceGradient === true),
          ev.danmuDeleted || ev.scDeleted ? "deleted" : "",
          publicIdentityClasses(ev.user),
          `event-role-${resolvedStyle.role}`,
          publicGuardPurchaseClass(ev),
          archiveLayout ? "event-surface-archive" : "",
          reviewStyle?.uniformTextColor ? "review-uniform-text" : "",
          reviewLayout && ev.emoticon ? (ev.emoticon.unique?.startsWith("official_") ? "event-emote-banner" : "event-emote-big") : "",
          "event-type-main",
          !liveLayout && highlight ? "event-row-highlight" : "",
          lifecycleClass,
          animateOnMount ? `event-animation-${displayPreferences.eventAnimationPreset}` : "event-animation-none",
          resolvedStyle.hasBackground ? "event-row-custom-bg" : "",
          eventHasPersistentAction ? "event-row-has-persistent-action" : "",
          eventMenu ? "event-row-with-menu" : "",
        ].join(" ")}
        style={rowStyle}
        data-event-role={resolvedStyle.role}
        data-event-style-type={eventStyleType}
        data-event-surface={archiveLayout ? "archive" : undefined}
        data-event-layout={liveLayout ? "live" : reviewLayout ? "review" : "default"}
        data-event-emote={reviewLayout && ev.emoticon ? (ev.emoticon.unique?.startsWith("official_") ? "banner" : "big") : undefined}
      >
        {locatedHighlight && <span className="event-row-located-indicator" aria-hidden="true" />}
        <NativeEventFrame event={ev} live={!archiveLayout} plainAvatar={systemEvent} fixedNow={activityNow} winners={winners}>
        {archiveLayout ? <div className="event-body">
          <Body ev={ev} color={color} onUserFilter={onUserFilter} giftEffectResource={giftEffectResource} onPlayGiftEffect={onPlayGiftEffect} allowManualRetry={reviewLayout} onContentSizeChange={onContentSizeChange} />
          {winners}
        </div> : <NativeEventContent ev={ev} color={color} time={nativeTime} onUserFilter={onUserFilter} giftEffectResource={giftEffectResource} onPlayGiftEffect={onPlayGiftEffect} allowManualRetry={reviewLayout} onContentSizeChange={onContentSizeChange} />}


        {archiveLayout && (
          <time className="time w-[72px] shrink-0 text-right font-mono event-type-meta text-t3">
            {formatReviewEventTime(ev.ts)}
          </time>
        )}
        </NativeEventFrame>
        {eventMenu && <EventContextMenu event={ev} nickname={ev.user ? userNicknames[ev.user.uid] : undefined} eventFontSize={size} shortcutActions={shortcutActions} eventAreaRef={eventAreaRef} scope={eventMenuScope} handlers={eventMenu} />}
      </div>
    </EventDisplayContext.Provider>
  );
});
