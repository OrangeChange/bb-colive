import { useCallback, useEffect, useRef } from "react";
import type { GiftEffectNotice } from "../windows/giftEffectBus";
import { createGiftEffectPlayer, type GiftEffectPlayer } from "../windows/giftEffectPlayer";
import { createGiftEffectQueue, type GiftEffectQueue } from "../windows/giftEffectQueue";

interface GiftEffectOverlayProps {
  enabled: boolean;
  guardEnabled?: boolean;
  notices: readonly GiftEffectNotice[];
  /** 同一现场的不同布局共用，避免重建播放器后回放旧通知。 */
  processedNotices?: WeakSet<GiftEffectNotice>;
  /** 直播间切换代号；同房重连不变，换房时取消当前特效。 */
  roomKey: string | number | null;
  /** 外部上下文代际；变化时取消当前和排队特效，但不改变现场默认播放路径。 */
  resetKey?: string | number | null;
}

/** 事件列表上的礼物特效层：不占布局、不接收鼠标，只负责单个 VAP 队列。 */
export function GiftEffectOverlay({ enabled, guardEnabled = false, notices, processedNotices, roomKey, resetKey }: GiftEffectOverlayProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const queueRef = useRef<GiftEffectQueue<GiftEffectNotice> | null>(null);
  const playerRef = useRef<GiftEffectPlayer | null>(null);
  queueRef.current ??= createGiftEffectQueue<GiftEffectNotice>();
  playerRef.current ??= createGiftEffectPlayer();
  const activeRef = useRef(false);
  const roomKeyRef = useRef(roomKey);
  const resetKeyRef = useRef(resetKey);
  const processedNoticesRef = useRef(processedNotices ?? new WeakSet<GiftEffectNotice>());

  const playCurrent = useCallback(() => {
    const current = queueRef.current?.current;
    const stage = stageRef.current;
    if (!current || !stage) return;
    activeRef.current = true;
    playerRef.current?.play(current.resource, stage, current.event.reactKey ?? current.event.id);
  }, []);

  const finishCurrent = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    playerRef.current?.destroy();
    const next = queueRef.current?.finishCurrent();
    if (next) playCurrent();
  }, [playCurrent]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const stopEnded = player.on("ended", finishCurrent);
    const stopError = player.on("error", finishCurrent);
    return () => {
      stopEnded();
      stopError();
      player.destroy();
      queueRef.current?.cancelAll();
      activeRef.current = false;
    };
  }, [finishCurrent]);

  useEffect(() => {
    if (!enabled) queueRef.current?.clearPending(notice => !notice.event.guard && !notice.event.honor && !notice.manual);
  }, [enabled]);

  useEffect(() => {
    if (!guardEnabled) queueRef.current?.clearPending(notice => !!(notice.event.guard || notice.event.honor) && !notice.manual);
  }, [guardEnabled]);

  useEffect(() => {
    if (resetKeyRef.current !== resetKey || roomKeyRef.current !== roomKey) {
      queueRef.current?.cancelAll();
      playerRef.current?.destroy();
      activeRef.current = false;
      processedNoticesRef.current = processedNotices ?? new WeakSet<GiftEffectNotice>();
      resetKeyRef.current = resetKey;
      roomKeyRef.current = roomKey;
      return;
    }
    notices.forEach((notice) => {
      if (processedNoticesRef.current.has(notice)) return;
      processedNoticesRef.current.add(notice);
      if ((((notice.event.guard || notice.event.honor) ? guardEnabled : enabled) || notice.manual) && queueRef.current?.enqueue(notice)) playCurrent();
    });
  }, [enabled, guardEnabled, notices, processedNotices, playCurrent, resetKey, roomKey]);

  return (
    <div className="gift-effect-overlay pointer-events-none" aria-hidden="true">
      <div className="gift-effect-stage">
        <div ref={stageRef} className="gift-effect-viewport" />
      </div>
    </div>
  );
}
