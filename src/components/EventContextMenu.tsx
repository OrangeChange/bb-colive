import { Funnel as LucideFunnel, LocateFixed as LucideLocateFixed, Volume2 as LucideVolume2, Tag as LucideTag, UserRound as LucideUserRound, Star as LucideStar, Bookmark as LucideBookmark, Copy as LucideCopy, Sparkles as LucideSparkles, Ellipsis as LucideEllipsis } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { DanmakuEvent, DanmakuUser } from "../protocol/types";
import { formatEventAge } from "../eventAnnotations";
import type { VoiceShortcutAction } from "../voice/voiceTypes";
import { recordFeatureDiagnostic } from "../diagnostics/featureDiagnostics.ts";
import { ImagePreviewOverlay } from "./ImagePreviewOverlay";
import { resolveFavoriteClickAction } from "../favoriteInteraction";
import { buildEventContentText } from "../events/eventContentText.ts";

export type EventMenuHandlers = {
  regionKey: string;
  onSpeakEvent: (event: DanmakuEvent) => void;
  onUserFilter?: (user: DanmakuUser) => void;
  isUserFiltered?: (user: DanmakuUser) => boolean;
  onClearUserFilter?: () => void;
  onViewContext?: (event: DanmakuEvent, regionKey: string) => void;
  /** 现场搜索结束后供对应虚拟列表一次性定位原事件。 */
  contextTargetRegionKey?: string;
  contextTargetKey?: string;
  onContextTargetConsumed?: (regionKey: string, eventKey: string) => void;
  onSaveNickname?: (user: DanmakuUser, nickname: string) => void;
  onDeleteNickname?: (user: DanmakuUser) => void;
  onOpenUser?: (user: DanmakuUser) => void;
  onPlayGiftEffect?: (event: DanmakuEvent) => void;
  isFavorite: (event: DanmakuEvent) => boolean;
  onToggleFavorite: (event: DanmakuEvent) => void | Promise<void>;
  /** 长按收藏图标时打开备注/标签编辑器；未收藏时先完成收藏。 */
  onEditFavorite?: (event: DanmakuEvent) => void | Promise<void>;
  /** 开启后，点击新增收藏会在收藏成功后打开编辑器。 */
  favoriteEditOnAdd?: boolean;
  getFavoriteError?: (event: DanmakuEvent) => string | null;
  isMarked?: (regionKey: string, event: DanmakuEvent) => boolean;
  onToggleMark?: (regionKey: string, event: DanmakuEvent) => void;
};

export function clampRemoteMenuPosition(left: number, top: number, width: number, height: number, bounds: { left: number; top: number; right: number; bottom: number }, margin = 8) {
  const minLeft = Math.max(margin, bounds.left);
  const minTop = Math.max(margin, bounds.top);
  const maxLeft = Math.max(minLeft, Math.min(window.innerWidth - margin, bounds.right) - width);
  const maxTop = Math.max(minTop, Math.min(window.innerHeight - margin, bounds.bottom) - height);
  return { left: Math.max(minLeft, Math.min(left, maxLeft)), top: Math.max(minTop, Math.min(top, maxTop)), ready: true };
}

export type EventMenuScope = "live" | "review";

type EventContextMenuProps = {
  event: DanmakuEvent;
  nickname?: string;
  eventFontSize?: number;
  shortcutActions: readonly VoiceShortcutAction[];
  eventAreaRef?: RefObject<HTMLElement | null>;
  scope?: EventMenuScope;
  handlers: EventMenuHandlers;
  onInteractionChange?: (active: boolean) => void;
  dismissRevision?: number;
  remoteOpenRequest?: { revision: number; left: number; top: number };
};

export function runEventFavoriteAction(event: DanmakuEvent, handlers: EventMenuHandlers): void {
  const action = resolveFavoriteClickAction(handlers.isFavorite(event), handlers.favoriteEditOnAdd === true);
  if (action === "favorite-and-edit" && handlers.onEditFavorite) {
    void Promise.resolve().then(() => handlers.onToggleFavorite(event)).then(() => handlers.onEditFavorite?.(event)).catch(() => {});
    return;
  }
  void Promise.resolve().then(() => handlers.onToggleFavorite(event)).catch(() => {});
}

export type MenuIconName = "filter" | "context" | "voice" | "nickname" | "profile" | "favorite" | "mark" | "copy" | "effect";

type MenuAction = {
  label: string;
  icon: MenuIconName;
  onSelect: () => void;
  disabled?: boolean;
  pressed?: boolean;
  active?: boolean;
  opensDialog?: boolean;
  onLongPress?: () => void;
};

function actionToneClass(icon: MenuIconName, active = false): string {
  if (!active) return "";
  if (icon === "favorite") return "event-action-favorite";
  if (icon === "mark") return "event-action-mark";
  return "text-accent-text";
}

export function MenuActionIcon({ name, active = false }: { name: MenuIconName; active?: boolean }) {
  switch (name) {
    case "filter":
      return (
        <LucideFunnel className="event-context-menu-action-icon" aria-hidden="true" fill={active ? "currentColor" : "none"} />
      );
    case "context":
      return (
        <LucideLocateFixed className="event-context-menu-action-icon" aria-hidden="true" />
      );
    case "voice":
      return (
        <LucideVolume2 className="event-context-menu-action-icon" aria-hidden="true" />
      );
    case "nickname":
      return (
        <LucideTag className="event-context-menu-action-icon" aria-hidden="true" />
      );
    case "profile":
      return (
        <LucideUserRound className="event-context-menu-action-icon" aria-hidden="true" />
      );
    case "favorite":
      return (
        <LucideStar className="event-context-menu-action-icon" aria-hidden="true" fill={active ? "currentColor" : "none"} />
      );
    case "mark":
      return (
        <LucideBookmark className="event-context-menu-action-icon" aria-hidden="true" fill={active ? "currentColor" : "none"} />
      );
    case "copy":
      return <LucideCopy className="event-context-menu-action-icon" aria-hidden="true" />;
    case "effect":
      return <LucideSparkles className="event-context-menu-action-icon" aria-hidden="true" />;
  }
}

const QUICK_ACTION_ICON: Record<VoiceShortcutAction, MenuIconName> = {
  speak: "voice",
  filter: "filter",
  favorite: "favorite",
  mark: "mark",
};

export function resolveVisibleShortcutActions(
  shortcutActions: readonly VoiceShortcutAction[],
  favorited: boolean,
  marked: boolean,
): VoiceShortcutAction[] {
  const visible = [...shortcutActions];
  if (favorited && !visible.includes("favorite")) visible.push("favorite");
  if (marked && !visible.includes("mark")) visible.push("mark");
  return visible;
}

function formatEventTime(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return "时间未知";
  return new Date(ts).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function EventContextMenu({ event, nickname, eventFontSize, shortcutActions, eventAreaRef, scope = "live", handlers, remoteOpenRequest, onInteractionChange, dismissRevision }: EventContextMenuProps) {
  const [open, setOpen] = useState(false);

  const [nicknameDialogOpen, setNicknameDialogOpen] = useState(false);
  const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);
  const interactionChange = useRef(onInteractionChange); interactionChange.current = onInteractionChange;
  const previousActive = useRef(false);
  const activeInteraction = open || nicknameDialogOpen || avatarPreviewOpen;
  useEffect(() => { if (previousActive.current !== activeInteraction) { previousActive.current = activeInteraction; interactionChange.current?.(activeInteraction); } }, [activeInteraction]);
  const previousDismiss = useRef(dismissRevision);
  useEffect(() => { if (previousDismiss.current !== dismissRevision) { previousDismiss.current = dismissRevision; setOpen(false); } }, [dismissRevision]);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [position, setPosition] = useState({ left: 8, top: 8, ready: false });
  const [nicknameDialogPosition, setNicknameDialogPosition] = useState({ left: 8, top: 8, ready: false });
  const [nicknameDragging, setNicknameDragging] = useState(false);
  const [ageNow, setAgeNow] = useState(() => Date.now());
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const nicknameDialogRef = useRef<HTMLDivElement>(null);
  const nicknameInputRef = useRef<HTMLInputElement>(null);
  const nicknameDragRef = useRef<{ pointerId: number; startX: number; startY: number; startLeft: number; startTop: number } | null>(null);
  const favoriteLongPressRef = useRef<{ timer: number; triggered: boolean } | null>(null);

  const clearFavoriteLongPress = () => {
    const current = favoriteLongPressRef.current;
    if (!current) return;
    window.clearTimeout(current.timer);
  };

  const beginFavoriteLongPress = (pointerEvent: ReactPointerEvent<HTMLButtonElement>, onLongPress?: () => void) => {
    if (pointerEvent.button !== 0 || !onLongPress) return;
    clearFavoriteLongPress();
    favoriteLongPressRef.current = {
      triggered: false,
      timer: window.setTimeout(() => {
        if (!favoriteLongPressRef.current) return;
        favoriteLongPressRef.current.triggered = true;
        onLongPress();
      }, 550),
    };
  };

  const consumeFavoriteLongPress = (): boolean => {
    const current = favoriteLongPressRef.current;
    clearFavoriteLongPress();
    favoriteLongPressRef.current = null;
    return current?.triggered === true;
  };

  useEffect(() => {
    if (!open && !nicknameDialogOpen) return;
    const closeOnOutsidePointer = (pointerEvent: PointerEvent) => {
      const target = pointerEvent.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target) || nicknameDialogRef.current?.contains(target)) return;
      setOpen(false);
      setNicknameDialogOpen(false);
    };
    const closeOnEscape = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key !== "Escape") return;
      keyboardEvent.preventDefault();
      setOpen(false);
      setNicknameDialogOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, nicknameDialogOpen]);

  useEffect(() => {
    if (!remoteOpenRequest) return;
    setAgeNow(Date.now());
    setPosition({ left: remoteOpenRequest.left, top: remoteOpenRequest.top, ready: true });
    setOpen(true);
  }, [remoteOpenRequest?.revision]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setAgeNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const menu = menuRef.current;
      if (!menu) return;
      if (remoteOpenRequest) {
        const menuRect = menu.getBoundingClientRect();
        const margin = 8;
        const area = eventAreaRef?.current?.getBoundingClientRect();
        setPosition(clampRemoteMenuPosition(remoteOpenRequest.left, remoteOpenRequest.top, menuRect.width, menuRect.height, area ?? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }, margin));
        return;
      }
      const trigger = triggerRef.current;
      if (!trigger) return;
      const triggerRect = trigger.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const gap = 8;
      const margin = 8;
      const belowTop = triggerRect.bottom + gap;
      const aboveTop = triggerRect.top - menuRect.height - gap;
      const top = belowTop + menuRect.height <= window.innerHeight - margin || aboveTop < margin
        ? Math.min(belowTop, window.innerHeight - menuRect.height - margin)
        : aboveTop;
      const left = Math.min(
        Math.max(margin, triggerRect.right - menuRect.width),
        window.innerWidth - menuRect.width - margin,
      );
      setPosition({
        left: Math.max(margin, left),
        top: Math.max(margin, top),
        ready: true,
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, remoteOpenRequest?.revision, eventAreaRef]);

  useLayoutEffect(() => {
    if (!nicknameDialogOpen) return;
    const updatePosition = () => {
      const dialog = nicknameDialogRef.current;
      if (!dialog) return;
      const areaRect = eventAreaRef?.current?.getBoundingClientRect();
      const dialogRect = dialog.getBoundingClientRect();
      const margin = 8;
      const area = areaRect && areaRect.width > 0 && areaRect.height > 0
        ? areaRect
        : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight, right: window.innerWidth, bottom: window.innerHeight };
      const maxLeft = Math.max(margin, window.innerWidth - dialogRect.width - margin);
      const maxTop = Math.max(margin, window.innerHeight - dialogRect.height - margin);
      const centeredLeft = area.left + (area.width - dialogRect.width) / 2;
      const centeredTop = area.top + (area.height - dialogRect.height) / 2;
      const left = Math.max(margin, Math.min(maxLeft, centeredLeft));
      const top = Math.max(margin, Math.min(maxTop, centeredTop));
      setNicknameDialogPosition({ left, top: Math.max(margin, top), ready: true });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    const resizeObserver = typeof ResizeObserver === "undefined" || !nicknameDialogRef.current
      ? null
      : new ResizeObserver(updatePosition);
    if (resizeObserver && nicknameDialogRef.current) resizeObserver.observe(nicknameDialogRef.current);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      resizeObserver?.disconnect();
    };
  }, [eventAreaRef, nicknameDialogOpen]);

  useEffect(() => {
    if (!nicknameDialogOpen) return;
    const id = requestAnimationFrame(() => nicknameInputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [nicknameDialogOpen]);

  const handleNicknameDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    nicknameDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: nicknameDialogPosition.left,
      startTop: nicknameDialogPosition.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setNicknameDragging(true);
  };

  const handleNicknameDragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = nicknameDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const dialogRect = nicknameDialogRef.current?.getBoundingClientRect();
    const width = dialogRect?.width ?? 280;
    const height = dialogRect?.height ?? 180;
    const maxLeft = Math.max(8, window.innerWidth - width - 8);
    const maxTop = Math.max(8, window.innerHeight - height - 8);
    setNicknameDialogPosition((current) => ({
      ...current,
      left: Math.max(8, Math.min(maxLeft, drag.startLeft + event.clientX - drag.startX)),
      top: Math.max(8, Math.min(maxTop, drag.startTop + event.clientY - drag.startY)),
    }));
  };

  const handleNicknameDragEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (nicknameDragRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    nicknameDragRef.current = null;
    setNicknameDragging(false);
  };

  const closeAvatarPreview = () => {
    setAvatarPreviewOpen(false);
  };

  const user = event.user;
  const userNickname = nickname?.trim();
  const userName = user?.uname?.trim() || "未知用户";
  const userIdentity = userNickname ? `${userName}（${userNickname}）` : userName;
  const menuEventSize = Number.isFinite(eventFontSize) ? eventFontSize : 16;
  const userFiltered = Boolean(user && handlers.isUserFiltered?.(user));
  const actionDisabled = userFiltered ? !handlers.onClearUserFilter : !handlers.onUserFilter;
  const favorited = handlers.isFavorite(event);
  const marked = scope !== "review" && Boolean(handlers.isMarked?.(handlers.regionKey, event));
  const favoriteError = handlers.getFavoriteError?.(event) ?? null;
  const handleFavoriteClick = () => {
    runEventFavoriteAction(event, handlers);
  };
  const visibleShortcutActions = resolveVisibleShortcutActions(shortcutActions, favorited, marked)
    .filter((action) => scope === "review" ? action !== "mark" : true);
  const shortcutActionLabel = (action: VoiceShortcutAction): string => {
    if (action === "speak") return "语音播报";
    if (action === "filter") return userFiltered ? "退出筛选" : "筛选该用户";
    if (action === "favorite") return favorited ? "取消收藏" : "收藏事件";
    return marked ? "取消标记" : "标记事件";
  };
  const shortcutActionActive = (action: VoiceShortcutAction): boolean => (
    action === "filter" ? userFiltered : action === "favorite" ? favorited : action === "mark" ? marked : false
  );
  const shortcutActionPersistent = (action: VoiceShortcutAction): boolean => (
    (action === "favorite" && favorited) || (action === "mark" && marked)
  );
  const persistentShortcutActions = visibleShortcutActions.filter(shortcutActionPersistent);
  const actions: MenuAction[] = [
    {
      label: userFiltered ? "退出筛选" : "筛选该用户",
      icon: "filter",
      disabled: !user || actionDisabled,
      active: userFiltered,
      pressed: userFiltered,
      onSelect: () => {
        if (!user) return;
        userFiltered ? handlers.onClearUserFilter?.() : handlers.onUserFilter?.(user);
      },
    },
    ...(handlers.onViewContext ? [{
      label: "查看上下文",
      icon: "context" as const,
      onSelect: () => handlers.onViewContext?.(event, handlers.regionKey),
    }] : []),
    {
      label: "语音播报",
      icon: "voice",
      onSelect: () => handlers.onSpeakEvent(event),
    },
    {
      label: "复制内容",
      icon: "copy",
      disabled: !buildEventContentText(event),
      onSelect: () => {
        const text = buildEventContentText(event);
        if (text && navigator.clipboard?.writeText) void navigator.clipboard.writeText(text).catch(() => {});
      },
    },
    {
      label: userNickname ? "更改昵称" : "添加昵称",
      icon: "nickname",
      disabled: !user || !handlers.onSaveNickname,
      active: Boolean(userNickname),
      opensDialog: true,
      onSelect: () => {
        if (!user) return;
        setNicknameDraft(userNickname ?? "");
        setNicknameDialogPosition((current) => ({ ...current, ready: false }));
        setNicknameDialogOpen(true);
      },
    },
    {
      label: "打开用户主页",
      icon: "profile",
      disabled: !user || !handlers.onOpenUser,
      onSelect: () => { if (user) handlers.onOpenUser?.(user); },
    },
    {
      label: favoriteError ? `${favorited ? "取消收藏" : "收藏事件"}（上次失败）` : favorited ? "取消收藏" : "收藏事件",
      icon: "favorite",
      pressed: favorited,
      active: favorited,
      onSelect: handleFavoriteClick,
      onLongPress: handlers.onEditFavorite ? () => {
        void Promise.resolve(handlers.onEditFavorite?.(event)).catch(() => {});
        setOpen(false);
      } : undefined,
    },
    ...(handlers.onPlayGiftEffect ? [{
      label: (event.guard || event.honor) && scope !== "review" ? "播放大航海特效" : "播放礼物特效",
      icon: "effect" as const,
      onSelect: () => handlers.onPlayGiftEffect?.(event),
    }] : []),
    ...(scope === "review" ? [] : [{
      label: marked ? "取消标记" : "标记事件",
      icon: "mark" as const,
      pressed: marked,
      active: marked,
      onSelect: () => {
        if (handlers.onToggleMark) handlers.onToggleMark(handlers.regionKey, event);
      },
    }]),
  ];

  return (
    <>
      <div className={`event-row-actions absolute right-2 z-10 flex items-center gap-1${remoteOpenRequest ? " hidden" : ""}`}>
        <div className="event-quick-actions">
        {visibleShortcutActions.map((shortcutAction, index) => {
          const active = shortcutActionActive(shortcutAction);
          const persistent = shortcutActionPersistent(shortcutAction);
          const disabled = shortcutAction === "filter" && (!user || actionDisabled);
          const persistentIndex = persistentShortcutActions.indexOf(shortcutAction);
          const shortcutRestOffset = persistent && persistentIndex >= 0
            ? persistentShortcutActions.length - 1 - persistentIndex
            : 0;
          const shortcutHoverOffset = visibleShortcutActions.length - 1 - index;
          return (
            <button
              key={shortcutAction}
              type="button"
              className={`event-quick-action inline-flex items-center justify-center rounded-md border border-transparent bg-transparent text-t2 shadow-none transition-[opacity,transform,color,border-color,background-color] enabled:hover:border-accent/60 enabled:hover:bg-raised enabled:hover:text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring disabled:cursor-not-allowed disabled:opacity-45 ${persistent ? "event-quick-action-persistent" : ""} ${actionToneClass(QUICK_ACTION_ICON[shortcutAction], active)}`}
              style={{
                "--shortcut-rest-offset": shortcutRestOffset,
                "--shortcut-hover-offset": shortcutHoverOffset,
              } as CSSProperties}
              aria-label={shortcutActionLabel(shortcutAction)}
              title={shortcutAction === "favorite" && handlers.onEditFavorite ? (favorited ? "点击取消收藏；长按编辑备注和标签" : "点击收藏；长按编辑备注和标签") : shortcutActionLabel(shortcutAction)}
              aria-pressed={shortcutAction === "filter" || shortcutAction === "favorite" || shortcutAction === "mark" ? active : undefined}
              disabled={disabled}
              onPointerDown={(pointerEvent) => {
                if (shortcutAction === "favorite") beginFavoriteLongPress(pointerEvent, handlers.onEditFavorite ? () => { void Promise.resolve(handlers.onEditFavorite?.(event)).catch(() => {}); } : undefined);
              }}
              onPointerUp={() => { if (shortcutAction === "favorite") clearFavoriteLongPress(); }}
              onPointerCancel={() => { if (shortcutAction === "favorite") consumeFavoriteLongPress(); }}
              onClick={(clickEvent) => {
                clickEvent.stopPropagation();
                if (disabled) return;
                recordFeatureDiagnostic({
                  featureId: "event-interaction",
                  stage: "request",
                  action: `quick-${shortcutAction}`,
                  outcome: "selected",
                  eventId: event.reactKey ?? event.id,
                  data: { active },
                });
                if (shortcutAction === "speak") handlers.onSpeakEvent(event);
                else if (shortcutAction === "filter") {
                  if (!user) return;
                  userFiltered ? handlers.onClearUserFilter?.() : handlers.onUserFilter?.(user);
                } else if (shortcutAction === "favorite") {
                  if (consumeFavoriteLongPress()) return;
                  handleFavoriteClick();
                }
                else if (handlers.onToggleMark) handlers.onToggleMark(handlers.regionKey, event);
              }}
            >
              <MenuActionIcon name={QUICK_ACTION_ICON[shortcutAction]} active={active} />
            </button>
          );
        })}
        </div>
        <button
          ref={triggerRef}
          type="button"
          className="event-menu-trigger inline-flex items-center justify-center rounded-md border border-transparent bg-transparent text-t2 shadow-none transition-[opacity,transform,color,border-color,background-color] hover:border-accent/60 hover:bg-raised hover:text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
          aria-label="打开事件菜单"
          aria-haspopup="menu"
          aria-expanded={open}
          onKeyDown={(keyboardEvent) => {
            if (keyboardEvent.key === "ArrowDown" && !open) {
              keyboardEvent.preventDefault();
              setAgeNow(Date.now());
              setPosition((current) => ({ ...current, ready: false }));
              setOpen(true);
            } else if (keyboardEvent.key === "Escape" && open) {
              keyboardEvent.preventDefault();
              setOpen(false);
            }
          }}
          onClick={() => {
            setAgeNow(Date.now());
            setPosition((current) => ({ ...current, ready: false }));
            setOpen((current) => !current);
          }}
        >
          <LucideEllipsis className="event-menu-glyph" aria-hidden="true" />
        </button>
      </div>
      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label="事件菜单"
          className="ui-motion-enter event-context-menu fixed z-[70] w-[238px] max-h-[min(440px,calc(100vh-16px))] overflow-y-auto rounded-lg border border-line bg-surface p-1.5 shadow-2xl shadow-black/30"
          style={{
            left: position.left,
            top: position.top,
            visibility: position.ready ? "visible" : "hidden",
            "--event-context-menu-event-size": `${menuEventSize}px`,
          } as CSSProperties}
        >
          <div className="border-b border-line/70 px-2.5 pb-2 pt-1.5">
            <div className="event-context-menu-identity flex min-w-0 flex-col items-stretch gap-1.5">
              <div className="event-context-menu-user min-w-0 w-full text-left" title={userIdentity}>
                <div className="truncate ui-type-control text-t1">
                  <span>{userName}</span>
                  {userNickname && <span className="text-t2">（{userNickname}）</span>}
                </div>
              </div>
              <div className="event-context-menu-meta flex w-full shrink-0 items-center justify-start gap-2">
                {user?.avatar && (
                  <button
                    type="button"
                    className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
                    aria-label={`${userName}头像预览`}
                    title="查看头像预览"
                    onClick={() => {
                      setOpen(false);
                      setAvatarPreviewOpen(true);
                    }}
                  >
                    <img src={user.avatar} alt="" className="size-6 rounded-full object-cover" />
                  </button>
                )}
                <div className="event-context-menu-time flex min-w-0 flex-col whitespace-nowrap font-mono ui-type-meta text-t3">
                  <span>{formatEventAge(event.ts, ageNow)}</span>
                  <time className="shrink-0" dateTime={Number.isFinite(event.ts) ? new Date(event.ts).toISOString() : undefined}>
                    {formatEventTime(event.ts)}
                  </time>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-1 flex flex-col" role="none">
            {favoriteError && <div role="status" className="px-2.5 py-1 ui-type-micro text-danger">{favoriteError}</div>}
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                aria-disabled={action.disabled || undefined}
                aria-pressed={action.pressed}
                title={action.icon === "favorite" && action.onLongPress ? (favorited ? "点击取消收藏；长按编辑备注和标签" : "点击收藏；长按编辑备注和标签") : undefined}
                disabled={action.disabled}
                className={`event-context-menu-item flex min-h-9 w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left ui-type-control text-t2 transition-colors enabled:hover:bg-raised enabled:hover:text-t1 focus-visible:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring disabled:cursor-not-allowed disabled:opacity-45 ${actionToneClass(action.icon, action.active)}`}
                onPointerDown={(pointerEvent) => { if (action.icon === "favorite") beginFavoriteLongPress(pointerEvent, action.onLongPress); }}
                onPointerUp={() => { if (action.icon === "favorite") clearFavoriteLongPress(); }}
                onPointerCancel={() => { if (action.icon === "favorite") consumeFavoriteLongPress(); }}
                onClick={() => {
                  if (action.disabled) return;
                  if (action.icon === "favorite" && consumeFavoriteLongPress()) return;
                  recordFeatureDiagnostic({
                    featureId: "event-interaction",
                    stage: action.opensDialog ? "open" : "request",
                    action: `menu-${action.icon}`,
                    outcome: "selected",
                    eventId: event.reactKey ?? event.id,
                    data: { active: Boolean(action.active) },
                  });
                  action.onSelect();
                  setOpen(false);
                  if (!action.opensDialog) triggerRef.current?.focus();
                }}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <MenuActionIcon name={action.icon} active={action.active} />
                  <span className="truncate">{action.label}</span>
                </span>
                {action.pressed && <span className="ui-type-micro text-current" aria-hidden="true">●</span>}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
      {user?.avatar && (
        <ImagePreviewOverlay
          open={avatarPreviewOpen}
          src={user.avatar}
          alt={`${userName}头像`}
          label={`${userName}头像预览`}
          closeLabel="关闭头像预览"
          variant="avatar"
          boundsRef={eventAreaRef}
          restoreFocusRef={triggerRef}
          onClose={closeAvatarPreview}
        />
      )}
      {nicknameDialogOpen && user && createPortal(
        <div
          ref={nicknameDialogRef}
          role="dialog"
          aria-label={userNickname ? "更改昵称" : "添加昵称"}
          className="ui-motion-enter event-context-nickname-dialog fixed z-[71] w-[min(460px,calc(100vw-16px))] rounded-lg border border-line bg-surface p-3 shadow-2xl shadow-black/30"
          style={{
            left: nicknameDialogPosition.left,
            top: nicknameDialogPosition.top,
            visibility: nicknameDialogPosition.ready ? "visible" : "hidden",
          }}
        >
          <div
            className={`flex items-center justify-between gap-3 ${nicknameDragging ? "cursor-grabbing" : "cursor-move"}`}
            title="拖动移动昵称弹窗"
            onPointerDown={handleNicknameDragStart}
            onPointerMove={handleNicknameDragMove}
            onPointerUp={handleNicknameDragEnd}
            onPointerCancel={handleNicknameDragEnd}
          >
            <div className="ui-type-control font-medium text-t1">{userNickname ? "更改昵称" : "添加昵称"}</div>
            <button
              type="button"
              aria-label="关闭昵称编辑"
              className="rounded px-1.5 py-0.5 ui-type-control text-t3 transition-colors hover:bg-raised hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => {
                setNicknameDialogOpen(false);
                triggerRef.current?.focus();
              }}
            >
              ×
            </button>
          </div>
          <p className="mt-1.5 whitespace-nowrap ui-type-meta text-t3" title="昵称作为通用用户名，影响界面显示和语音播报。">昵称作为通用用户名，影响界面显示和语音播报。</p>
          <label className="mt-3 block">
            <span className="ui-type-micro text-t3">昵称</span>
            <input
              ref={nicknameInputRef}
              value={nicknameDraft}
              onChange={(inputEvent) => setNicknameDraft(inputEvent.target.value)}
              className="settings-control-surface mt-1 h-8 w-full px-2 ui-type-control text-t1"
              aria-label="输入昵称"
              placeholder="输入通用昵称"
            />
          </label>
          <div className="mt-3 flex items-center justify-end gap-1.5">
            <button
              type="button"
              className="rounded-md px-2 py-1.5 ui-type-control text-t3 transition-colors hover:bg-raised hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
              onClick={() => {
                setNicknameDialogOpen(false);
                triggerRef.current?.focus();
              }}
            >
              取消
            </button>
            {userNickname && handlers.onDeleteNickname && (
              <button
                type="button"
                className="rounded-md px-2 py-1.5 ui-type-control text-danger transition-colors hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
                onClick={() => {
                  setNicknameDraft("");
                  handlers.onDeleteNickname?.(user);
                  setNicknameDialogOpen(false);
                  triggerRef.current?.focus();
                }}
              >
                删除昵称
              </button>
            )}
            <button
              type="button"
              disabled={!nicknameDraft.trim() || !handlers.onSaveNickname}
              className="rounded-md border border-accent/60 bg-accent-subtle px-2.5 py-1.5 ui-type-control font-medium text-accent-text transition-colors enabled:hover:border-accent enabled:hover:bg-accent-solid enabled:hover:text-accent-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => {
                const nextNickname = nicknameDraft.trim();
                if (!nextNickname) return;
                handlers.onSaveNickname?.(user, nextNickname);
                setNicknameDialogOpen(false);
                triggerRef.current?.focus();
              }}
            >
              保存
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
