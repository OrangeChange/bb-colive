import { uiText } from "../i18n/index.ts";
import { AnchorMenuRow } from "./AnchorMenuRow.tsx";
import { AnchorRemovalDialog } from "./AnchorRemovalDialog.tsx";
/**
 * 连接条（48px，ui-design §四）：房间号输入 + 连接/断开 + 状态点 + 实时数值（mono）
 * 连接后输入框替换为主播卡（头像+名字+直播状态点），点击弹主播列表（切换/删除，连接即添加）
 * 直播状态：头像右下角圆点（绿=直播中/灰=未开播，通用语义色）+ 轻微 accent 底色（跟随主题）；菜单内同样显示
 * 房间号输入实时预览（防抖 500ms 查 room_init + Master/info）：头像+名字 / 无效提示
 */
import { useEffect, useRef, useState } from "react";
import { useSession } from "../stores/session";
import { useConnection } from "../stores/connection";
import { getMasterInfo, getRealRoomId } from "../protocol";
import { getMostRecentAnchor, type Anchor } from "../protocol";
import type { ConnStatus } from "../protocol";
import { getAnchorCardView } from "./anchorCard";
import { RoomRankings } from "./RoomRankings";
import type { RankUser } from "../protocol/roomInsights";

const STATUS_META: Record<ConnStatus, { label: string; dot: string }> = {
  idle: { label: uiText("connectBar.STATUS_META.idle.label"), dot: "bg-t3" },
  connecting: { label: uiText("connectBar.STATUS_META.connecting.label"), dot: "bg-warning" },
  connected: { label: uiText("connectBar.STATUS_META.connected.label"), dot: "bg-success-indicator" },
  reconnecting: { label: uiText("connectBar.STATUS_META.reconnecting.label"), dot: "bg-warning" },
  closed: { label: uiText("connectBar.STATUS_META.closed.label"), dot: "bg-t3" },
  error: { label: uiText("connectBar.STATUS_META.error.label"), dot: "bg-danger" },
};

/** 圆形头像：右下角直播状态点（live 传 undefined 不显示）；加载失败（或无 URL）回退名字首字 */
function Avatar({
  name,
  face,
  size = 24,
  live,
}: {
  name?: string;
  face?: string;
  size?: number;
  /** true 绿点 / false 灰点 / undefined 无点 */
  live?: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string | undefined>();
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span
        className="inline-flex size-full items-center justify-center overflow-hidden rounded-full bg-raised text-t2 select-none"
        style={{ fontSize: Math.round(size * 0.42) }}
      >
        {face && failedUrl !== face ? (
          <img
            src={face}
            alt={name ?? ""}
            className="size-full object-cover"
            onError={() => setFailedUrl(face)}
          />
        ) : (
          <span>{(name || "?").slice(0, 1)}</span>
        )}
      </span>
      {live !== undefined && (
        <span
          className={`absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-surface ${
            live ? "bg-success-indicator" : "bg-t3"
          }`}
          title={live ? uiText("connectBar.title") : uiText("connectBar.title2")}
        />
      )}
    </span>
  );
}

/** 房间号输入实时预览状态 */
interface Preview {
  status: "idle" | "loading" | "ok" | "error";
  uname?: string;
  face?: string;
  live?: boolean;
  realRoomId?: number;
  message?: string;
}

export function ConnectBar({ onUserFilter }: { onUserFilter?: (user: Pick<RankUser, "uid" | "name">) => void }) {
  const [roomInput, setRoomInput] = useState("");
  const [preview, setPreview] = useState<Preview>({ status: "idle" });
  const [menuOpen, setMenuOpen] = useState(false);
  const [removingAnchor, setRemovingAnchor] = useState<Anchor | null>(null);
  /** 已连接时临时显示输入框（「连接新房间」入口），✕/ESC 回到主播卡 */
  const [showInput, setShowInput] = useState(false);
  /** 未连接时在主播列表中选中的待连接主播；点击列表项不直接建立连接 */
  const [selectedAnchorId, setSelectedAnchorId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const previewSeq = useRef(0);
  const session = useSession((s) => s.session);
  const { state, anchors, connect, disconnect, removeAnchor, refreshAnchors } = useConnection();

  const active = state.status === "connected" || state.status === "connecting" || state.status === "reconnecting";
  const meta = STATUS_META[state.status];
  const canConnect = roomInput.trim().length >= 1 && preview.status !== "error";
  /** 最后使用的主播（最近连接优先）：未连接时回显它的主播卡 */
  const lastAnchor = getMostRecentAnchor(anchors);
  const selectedAnchor = selectedAnchorId === null
    ? null
    : anchors.find((a) => a.realRoomId === selectedAnchorId) ?? null;
  const live = state.liveStatus === 1;
  /** 主播卡展示数据：连接中有待切换目标时显示目标预览，否则显示当前/最后使用主播 */
  const card = getAnchorCardView(
    active,
    active ? { uname: state.anchorName, face: state.anchorFace, roomId: state.roomId, live } : null,
    selectedAnchor,
    lastAnchor,
  );

  // 输入停顿 500ms 后查询房间（预览主播头像+名字 / 无效提示）；只认最后一次结果
  useEffect(() => {
    const input = roomInput.trim();
    const seq = ++previewSeq.current;
    if (!input || !session) {
      setPreview({ status: "idle" });
      return;
    }
    setPreview({ status: "loading" });
    const timer = setTimeout(async () => {
      try {
        const room = await getRealRoomId(input, session.cookie);
        const live = room.live_status === 1;
        if (seq !== previewSeq.current) return;
        try {
          const master = await getMasterInfo(room.uid, session.cookie);
          if (seq !== previewSeq.current) return;
          setPreview({ status: "ok", uname: master.uname, face: master.face, live, realRoomId: room.room_id });
        } catch {
          // 预览可连接但主播信息拉不到（罕见）：仍允许连接
          if (seq !== previewSeq.current) return;
          setPreview({ status: "ok", live, realRoomId: room.room_id });
        }
      } catch (e: any) {
        if (seq !== previewSeq.current) return;
        setPreview({ status: "error", message: e?.friendly ?? uiText("connectBar.ConnectBar.timer.message") });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [roomInput, session]);

  // 点击菜单外部关闭
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  // 连接状态变化后回到连接状态提供的主播卡，避免临时选择残留到下一次断开。
  useEffect(() => {
    setSelectedAnchorId(null);
  }, [state.status]);

  const onConnect = () => {
    if (!session || !canConnect) return;
    connect(roomInput, session.cookie, session.mid);
    setRoomInput("");
    setPreview({ status: "idle" });
    setShowInput(false);
  };

  const selectedOrLastAnchor = selectedAnchor ?? lastAnchor;

  /** 列表中的主播：只选择待连接目标，实际连接由右侧按钮明确触发 */
  const switchAnchor = (a: Anchor) => {
    setMenuOpen(false);
    if (a.realRoomId === card?.roomId) return;
    setSelectedAnchorId(a.realRoomId);
  };

  const hasPendingSwitch = active && selectedAnchor !== null && selectedAnchor.realRoomId !== state.roomId;

  return (
    <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-surface px-4 py-2">
      {card && !showInput ? (
        // 主播卡（连接中=当前连接主播；未连接=回显最后使用的主播；点击弹主播列表）
        <div ref={menuRef} className="relative">
          <button
            onClick={() => {
              setMenuOpen((v) => !v);
              refreshAnchors(); // 展开即懒刷新开播状态（store 内 60s 节流）
            }}
            className={`flex h-8 items-center gap-2 rounded-md border px-2 ui-type-section-title transition-colors ${
              card.live
                ? "border-accent/40 bg-accent-subtle hover:border-accent/60"
                : "border-line bg-bg hover:border-accent"
            }`}
            title={card.uname ? uiText("connectBar.title3", { uname: card.uname, roomId: card.roomId, value: card.live ? uiText("connectBar.title.value") : "" }) : uiText("connectBar.title4", { roomId: card.roomId })}
          >
            <Avatar name={card.uname} face={card.face} live={card.live} />
            <span className="max-w-40 truncate">
              {card.uname ?? (card.roomId !== undefined ? uiText("connectBar.ConnectBar", { roomId: card.roomId }) : "…")}
            </span>
            <span className={`text-t3 transition-transform ${menuOpen ? "rotate-180" : ""}`}>▾</span>
          </button>

          {menuOpen && (
            <div className="ui-motion-enter absolute left-0 top-10 z-50 w-72 rounded-lg border border-line bg-surface p-1 shadow-xl shadow-black/20">
              <div className="px-2.5 py-1.5 ui-type-control text-t3">{uiText("connectBar.ConnectBar2")}</div>
              <div className="max-h-[50vh] overflow-y-auto">
                {anchors.length === 0 && (
                  <div className="px-2.5 py-2 ui-type-control text-t3">{uiText("connectBar.ConnectBar3")}</div>
                )}
                {anchors.map(a => <AnchorMenuRow key={a.realRoomId} anchor={a}
                  avatar={<Avatar name={a.uname} face={a.face} live={a.liveStatus === undefined ? undefined : a.liveStatus === 1} size={22} />}
                  current={a.realRoomId === state.roomId} selected={a.realRoomId === selectedAnchor?.realRoomId}
                  onSelect={() => switchAnchor(a)} onRemove={() => {setMenuOpen(false);setRemovingAnchor(a);}} />)}
              </div>
              <div className="mt-1 border-t border-line pt-1">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setShowInput(true);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 ui-type-section-title text-t2 hover:bg-raised"
                >
                  <span className="inline-flex size-[22px] items-center justify-center rounded-full border border-dashed border-t3 text-t3">＋</span>
                  {uiText("connectBar.ConnectBar4")}</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="relative">
            <input
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
                if (e.key === "Enter" && canConnect) onConnect();
                if (e.key === "Escape" && showInput) setShowInput(false);
              }}
              placeholder={uiText("connectBar.placeholder")}
              autoFocus={showInput}
              className="h-8 w-52 rounded-md border border-line bg-bg px-2.5 ui-type-section-title text-t1 placeholder:text-t3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring"
            />
            {/* 房间号实时预览：输入框下方浮层（查询中 / 头像+主播名+房间号+开播 / 无效提示） */}
            {preview.status !== "idle" && (
              <div className="ui-motion-enter absolute left-0 top-9 z-50 w-72 rounded-lg border border-line bg-surface p-2 shadow-xl shadow-black/20">
                {preview.status === "loading" && (
                  <div className="px-1 ui-type-section-title text-t3">{uiText("connectBar.ConnectBar5")}</div>
                )}
                {preview.status === "ok" && (
                  <div className="flex items-center gap-2.5 px-1 py-0.5" title={uiText("connectBar.title5")}>
                    <Avatar name={preview.uname} face={preview.face} live={preview.live} />
                    <span className="min-w-0 flex-1 truncate ui-type-section-title text-t1" title={preview.uname}>
                      {preview.uname ?? uiText("connectBar.ConnectBar6")}
                    </span>
                    {preview.realRoomId !== undefined && (
                      <span className="font-mono ui-type-meta text-t3">{preview.realRoomId}</span>
                    )}
                  </div>
                )}
                {preview.status === "error" && (
                  <div className="px-1 ui-type-section-title text-danger">{preview.message}</div>
                )}
              </div>
            )}
          </div>
          {showInput && (
            <button
              onClick={() => {
                setRoomInput("");
                setPreview({ status: "idle" });
                setShowInput(false);
              }}
              className="rounded p-1 text-t3 transition-colors hover:bg-raised hover:text-t2"
              title={uiText("connectBar.title6")}
            >
              ✕
            </button>
          )}
        </>
      )}
      {card && !showInput ? (
        active ? (
          <button
            onClick={() => {
              if (hasPendingSwitch && session && selectedAnchor) {
                connect(selectedAnchor.roomIdInput, session.cookie, session.mid);
              } else {
                disconnect();
              }
              setShowInput(false);
            }}
            title={hasPendingSwitch && selectedAnchor ? uiText("connectBar.title7", { uname: selectedAnchor.uname }) : uiText("connectBar.title8")}
            className="h-8 rounded-md bg-accent-solid px-4 ui-type-section-title font-semibold text-accent-fg transition-colors hover:bg-accent-solid-hover active:bg-accent-solid-active"
          >
            {hasPendingSwitch ? uiText("connectBar.ConnectBar7") : uiText("common.disconnect")}
          </button>
        ) : (
          // 未连接：连接当前选中的主播；未选择时连接最后使用的主播
          <button
            onClick={() => {
              if (session && selectedOrLastAnchor) {
                connect(selectedOrLastAnchor.roomIdInput, session.cookie, session.mid);
              }
            }}
            className="h-8 rounded-md bg-accent-solid px-4 ui-type-section-title font-semibold text-accent-fg transition-colors hover:bg-accent-solid-hover active:bg-accent-solid-active"
          >
            {uiText("common.connect")}</button>
        )
      ) : (
        <button
          onClick={onConnect}
          disabled={!canConnect}
          className="h-8 rounded-md bg-accent-solid px-4 ui-type-section-title font-semibold text-accent-fg transition-colors enabled:hover:bg-accent-solid-hover enabled:active:bg-accent-solid-active disabled:cursor-not-allowed disabled:opacity-40"
        >
          {uiText("common.connect")}</button>
      )}

      <div className="flex items-center gap-1.5" title={state.message ?? meta.label}>
        <span className={`size-2 rounded-full ${meta.dot} ${state.status === "connecting" || state.status === "reconnecting" ? "animate-pulse" : ""}`} />
        <span
          className={`ui-type-control ${state.status === "error" ? "text-danger" : "text-t2"}`}
        >
          {state.status === "error" ? uiText("connectBar.ConnectBar8", { value: state.message ?? uiText("connectBar.ConnectBar.value") }) : meta.label}
        </span>
      </div>

      <RoomRankings onUserFilter={onUserFilter} />
      {removingAnchor && <AnchorRemovalDialog key={removingAnchor.realRoomId} anchor={removingAnchor} onClose={() => {setRemovingAnchor(null);requestAnimationFrame(() => menuRef.current?.querySelector("button")?.focus());}} onRemove={async () => {
        await removeAnchor(removingAnchor.realRoomId);
        if (selectedAnchorId === removingAnchor.realRoomId) setSelectedAnchorId(null);
      }} />}
    </div>
  );
}
