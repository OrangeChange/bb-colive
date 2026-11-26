import { useEventOverlayGeometry, placeEventOverlay, type OverlayRect } from "./eventOverlayGeometry";
import { Input } from "./shadcn/input";
import { Button } from "./shadcn/button";
import { formatUiDateTime } from "../i18n/format.ts";
import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import { Funnel as LucideFunnel, LocateFixed as LucideLocateFixed, Volume2 as LucideVolume2, Tag as LucideTag, UserRound as LucideUserRound, Star as LucideStar, Bookmark as LucideBookmark, Copy as LucideCopy, Sparkles as LucideSparkles, Reply as LucideReply, Ellipsis as LucideEllipsis } from "lucide-react";
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
  onReplyUser?: (event: DanmakuEvent) => void;
  canReplyUser?: (event: DanmakuEvent) => boolean;
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

export function clampRemoteMenuPosition(left: number, top: number, width: number, height: number, bounds: { left: number; top: number; right: number; bottom: number }) {
  const boundary={...bounds,width:bounds.right-bounds.left,height:bounds.bottom-bounds.top};
  const anchor={left,top,right:left,bottom:top,width:0,height:0};
  const point=placeEventOverlay(anchor,width,height,boundary,{left,top});
  return {left:point.left,top:point.top,ready:true};
}

export type EventMenuScope = "live" | "review";

type EventContextMenuProps = {
  event: DanmakuEvent;
  nickname?: string;
  eventFontSize?: number;
  shortcutActions: readonly VoiceShortcutAction[];
  eventAreaRef?: RefObject<HTMLElement | null>;
  getAnchorRect?: () => OverlayRect | null;
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

export type MenuIconName = "filter" | "context" | "voice" | "nickname" | "profile" | "favorite" | "mark" | "copy" | "effect" | "reply";

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
    case "reply": return <LucideReply className="event-context-menu-action-icon" aria-hidden="true" />;
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
  reply: "reply",
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
  if (!Number.isFinite(ts) || ts <= 0) return uiText("eventContextMenu.formatEventTime");
  return formatUiDateTime(ts, { second: "2-digit" });
}

export function EventContextMenu({ event, nickname, eventFontSize, shortcutActions, eventAreaRef, getAnchorRect, scope = "live", handlers, remoteOpenRequest, onInteractionChange, dismissRevision }: EventContextMenuProps) {
  useUiLanguage();
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
  const remoteOrigin = useRef<{revision: number; anchor: OverlayRect} | null>(null);
  const geometry = useEventOverlayGeometry(open, triggerRef, {area: eventAreaRef, getAnchorRect, onDetach: () => setOpen(false)});
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
      if (keyboardEvent.key !== "Escape" || keyboardEvent.defaultPrevented) return;
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
    if (!open || !geometry || !menuRef.current) return;
    const rect = {width: menuRef.current.offsetWidth, height: menuRef.current.offsetHeight};
    let point: {left: number; top: number} | undefined;
    if (remoteOpenRequest) {
      if (remoteOrigin.current?.revision !== remoteOpenRequest.revision) remoteOrigin.current = {revision: remoteOpenRequest.revision, anchor: geometry.anchor};
      point = {left: remoteOpenRequest.left + geometry.anchor.left - remoteOrigin.current.anchor.left,
        top: remoteOpenRequest.top + geometry.anchor.top - remoteOrigin.current.anchor.top};
    }
    const next = placeEventOverlay(geometry.anchor, rect.width, rect.height, geometry.boundary, point);
    setPosition({left: next.left, top: next.top, ready: true});
  }, [open, geometry, remoteOpenRequest?.revision]);

  useLayoutEffect(() => {
    if (open && position.ready && document.activeElement === triggerRef.current)
      menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
  }, [open, position.ready]);

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
  const userName = user?.uname?.trim() || uiText("eventContextMenu.EventContextMenu.userName");
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
    .filter((action) => (scope !== "review" || action !== "mark") && (action !== "reply" || (scope === "live" && !!handlers.onReplyUser && !!user?.uid)));
  const shortcutActionLabel = (action: VoiceShortcutAction): string => {
    if (action === "reply") return uiText("danmaku.reply");
    if (action === "speak") return uiText("eventContextMenu.EventContextMenu.shortcutActionLabel");
    if (action === "filter") return userFiltered ? uiText("eventContextMenu.EventContextMenu.shortcutActionLabel2") : uiText("eventContextMenu.EventContextMenu.shortcutActionLabel3");
    if (action === "favorite") return favorited ? uiText("eventContextMenu.EventContextMenu.shortcutActionLabel4") : uiText("eventContextMenu.EventContextMenu.shortcutActionLabel5");
    return marked ? uiText("eventContextMenu.EventContextMenu.shortcutActionLabel6") : uiText("eventContextMenu.EventContextMenu.shortcutActionLabel7");
  };
  const shortcutActionActive = (action: VoiceShortcutAction): boolean => (
    action === "filter" ? userFiltered : action === "favorite" ? favorited : action === "mark" ? marked : false
  );
  const shortcutActionPersistent = (action: VoiceShortcutAction): boolean => (
    (action === "favorite" && favorited) || (action === "mark" && marked)
  );
  const persistentShortcutActions = visibleShortcutActions.filter(shortcutActionPersistent);
  const actions: MenuAction[] = [
    ...(scope === "live" && handlers.onReplyUser && user?.uid ? [{label:uiText("danmaku.reply"),icon:"reply" as const,disabled:handlers.canReplyUser?.(event)===false,onSelect:()=>handlers.onReplyUser?.(event)}] : []),
    {
      label: userFiltered ? uiText("eventContextMenu.EventContextMenu.actions.label") : uiText("eventContextMenu.EventContextMenu.actions.label2"),
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
      label: uiText("eventContextMenu.EventContextMenu.actions.label3"),
      icon: "context" as const,
      onSelect: () => handlers.onViewContext?.(event, handlers.regionKey),
    }] : []),
    {
      label: uiText("eventContextMenu.EventContextMenu.actions.label4"),
      icon: "voice",
      onSelect: () => handlers.onSpeakEvent(event),
    },
    {
      label: uiText("eventContextMenu.EventContextMenu.actions.label5"),
      icon: "copy",
      disabled: !buildEventContentText(event),
      onSelect: () => {
        const text = buildEventContentText(event);
        if (text && navigator.clipboard?.writeText) void navigator.clipboard.writeText(text).catch(() => {});
      },
    },
    {
      label: userNickname ? uiText("eventContextMenu.EventContextMenu.actions.label6") : uiText("eventContextMenu.EventContextMenu.actions.label7"),
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
      label: uiText("eventContextMenu.EventContextMenu.actions.label8"),
      icon: "profile",
      disabled: !user || !handlers.onOpenUser,
      onSelect: () => { if (user) handlers.onOpenUser?.(user); },
    },
    {
      label: favoriteError ? uiText("eventContextMenu.EventContextMenu.actions.label9", { value: favorited ? uiText("eventContextMenu.actions.label.value") : uiText("eventContextMenu.actions.label.value2") }) : favorited ? uiText("eventContextMenu.EventContextMenu.actions.label10") : uiText("eventContextMenu.EventContextMenu.actions.label11"),
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
      label: (event.guard || event.honor) && scope !== "review" ? uiText("eventContextMenu.EventContextMenu.actions.label12") : uiText("eventContextMenu.EventContextMenu.actions.label13"),
      icon: "effect" as const,
      onSelect: () => handlers.onPlayGiftEffect?.(event),
    }] : []),
    ...(scope === "review" ? [] : [{
      label: marked ? uiText("eventContextMenu.EventContextMenu.actions.label14") : uiText("eventContextMenu.EventContextMenu.actions.label15"),
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
          const disabled = (shortcutAction === "filter" && (!user || actionDisabled)) || (shortcutAction === "reply" && handlers.canReplyUser?.(event) === false);
          const persistentIndex = persistentShortcutActions.indexOf(shortcutAction);
          const shortcutRestOffset = persistent && persistentIndex >= 0
            ? persistentShortcutActions.length - 1 - persistentIndex
            : 0;
          const shortcutHoverOffset = visibleShortcutActions.length - 1 - index;
          return (
            <Button variant="ghost"
              key={shortcutAction}
              type="button"
              className={`event-quick-action inline-flex items-center justify-center rounded-md border border-transparent bg-transparent text-t2 shadow-none transition-[opacity,transform,color,border-color,background-color] enabled:hover:border-accent/60 enabled:hover:bg-raised enabled:hover:text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring disabled:cursor-not-allowed disabled:opacity-45 ${persistent ? "event-quick-action-persistent" : ""} ${actionToneClass(QUICK_ACTION_ICON[shortcutAction], active)}`}
              style={{
                "--shortcut-rest-offset": shortcutRestOffset,
                "--shortcut-hover-offset": shortcutHoverOffset,
              } as CSSProperties}
              aria-label={shortcutActionLabel(shortcutAction)}
              title={shortcutAction === "favorite" && handlers.onEditFavorite ? (favorited ? uiText("eventContextMenu.title") : uiText("eventContextMenu.title2")) : shortcutActionLabel(shortcutAction)}
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
                if (shortcutAction === "reply") handlers.onReplyUser?.(event);
                else if (shortcutAction === "speak") handlers.onSpeakEvent(event);
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
            </Button>
          );
        })}
        </div>
        <Button variant="ghost"
          ref={triggerRef}
          type="button"
          className="event-menu-trigger inline-flex items-center justify-center rounded-md border border-transparent bg-transparent text-t2 shadow-none transition-[opacity,transform,color,border-color,background-color] hover:border-accent/60 hover:bg-raised hover:text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
          aria-label={uiText("eventContextMenu.aria_label")}
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
        </Button>
      </div>
      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          onKeyDown={event => {
            const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
            const index = items.indexOf(document.activeElement as HTMLButtonElement);
            const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
              : event.key === "ArrowDown" ? (index + 1) % items.length
              : event.key === "ArrowUp" ? (index + items.length - 1) % items.length : -1;
            if (next >= 0) { event.preventDefault(); items[next]?.focus(); }
            if (event.key === "Tab") { setOpen(false); triggerRef.current?.focus(); }
          }}
          aria-label={uiText("eventContextMenu.aria_label2")}
          className="ui-motion-enter event-context-menu fixed z-[70] w-[238px] max-h-[min(440px,calc(100vh-16px))] overflow-y-auto rounded-lg border border-line bg-surface p-1.5 shadow-2xl shadow-black/30"
          style={{
            left: position.left,
            top: position.top,
            visibility: position.ready && geometry ? "visible" : "hidden",
            maxWidth: geometry ? Math.max(1, geometry.boundary.width - 16) : undefined,
            maxHeight: geometry ? Math.min(440, Math.max(1, geometry.boundary.height - 16)) : undefined,
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
                  <Button variant="ghost" size={null}
                    type="button"
                    className="size-6 shrink-0 rounded-full border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
                    aria-label={uiText("eventContextMenu.aria_label3", { userName: userName })}
                    title={uiText("eventContextMenu.title3")}
                    onClick={() => {
                      setOpen(false);
                      setAvatarPreviewOpen(true);
                    }}
                  >
                    <img src={user.avatar} alt="" className="size-6 rounded-full object-cover" />
                  </Button>
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
              <Button variant="ghost"
                key={action.label}
                type="button"
                role="menuitem"
                aria-disabled={action.disabled || undefined}
                aria-pressed={action.pressed}
                title={action.icon === "favorite" && action.onLongPress ? (favorited ? uiText("eventContextMenu.title") : uiText("eventContextMenu.title2")) : undefined}
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
              </Button>
            ))}
          </div>
        </div>,
        document.body,
      )}
      {user?.avatar && (
        <ImagePreviewOverlay
          open={avatarPreviewOpen}
          src={user.avatar}
          alt={uiText("eventContextMenu.alt", { userName: userName })}
          label={uiText("eventContextMenu.label", { userName: userName })}
          closeLabel={uiText("eventContextMenu.closeLabel")}
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
          aria-label={userNickname ? uiText("eventContextMenu.aria_label4") : uiText("eventContextMenu.aria_label5")}
          className="ui-motion-enter event-context-nickname-dialog fixed z-[71] w-[min(460px,calc(100vw-16px))] rounded-lg border border-line bg-surface p-3 shadow-2xl shadow-black/30"
          style={{
            left: nicknameDialogPosition.left,
            top: nicknameDialogPosition.top,
            visibility: nicknameDialogPosition.ready ? "visible" : "hidden",
          }}
        >
          <div
            className={`flex items-center justify-between gap-3 ${nicknameDragging ? "cursor-grabbing" : "cursor-move"}`}
            title={uiText("eventContextMenu.title4")}
            onPointerDown={handleNicknameDragStart}
            onPointerMove={handleNicknameDragMove}
            onPointerUp={handleNicknameDragEnd}
            onPointerCancel={handleNicknameDragEnd}
          >
            <div className="ui-type-control font-medium text-t1">{userNickname ? uiText("eventContextMenu.EventContextMenu") : uiText("eventContextMenu.EventContextMenu2")}</div>
            <Button size="icon-sm" variant="ghost"
              type="button"
              aria-label={uiText("eventContextMenu.aria_label6")}
              className="rounded px-1.5 py-0.5 ui-type-control text-t3 transition-colors hover:bg-raised hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => {
                setNicknameDialogOpen(false);
                triggerRef.current?.focus();
              }}
            >
              ×
            </Button>
          </div>
          <p className="mt-1.5 whitespace-nowrap ui-type-meta text-t3" title={uiText("eventContextMenu.title5")}>{uiText("eventContextMenu.EventContextMenu3")}</p>
          <label className="mt-3 block">
            <span className="ui-type-micro text-t3">{uiText("eventContextMenu.EventContextMenu4")}</span>
            <Input
              ref={nicknameInputRef}
              value={nicknameDraft}
              onChange={(inputEvent) => setNicknameDraft(inputEvent.target.value)}
              className="settings-control-surface mt-1 h-8 w-full px-2 ui-type-control text-t1"
              aria-label={uiText("eventContextMenu.aria_label7")}
              placeholder={uiText("eventContextMenu.placeholder")}
            />
          </label>
          <div className="mt-3 flex items-center justify-end gap-1.5">
            <Button variant="ghost"
              type="button"
              className="rounded-md px-2 py-1.5 ui-type-control text-t3 transition-colors hover:bg-raised hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
              onClick={() => {
                setNicknameDialogOpen(false);
                triggerRef.current?.focus();
              }}
            >
              {uiText("common.cancel")}</Button>
            {userNickname && handlers.onDeleteNickname && (
              <Button variant="ghost"
                type="button"
                className="rounded-md px-2 py-1.5 ui-type-control text-danger transition-colors hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
                onClick={() => {
                  setNicknameDraft("");
                  handlers.onDeleteNickname?.(user);
                  setNicknameDialogOpen(false);
                  triggerRef.current?.focus();
                }}
              >
                {uiText("eventContextMenu.EventContextMenu5")}</Button>
            )}
            <Button variant="default"
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
              {uiText("common.save")}</Button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
