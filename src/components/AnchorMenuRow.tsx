import { useEffect, useRef, useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import type { Anchor } from "../protocol/anchors.ts";
import "./AnchorMenuRow.css";

export function AnchorMenuRow({ anchor, avatar, selected, current, onSelect, onRemove }: {
  anchor: Anchor;
  avatar: ReactNode;
  selected?: boolean;
  current?: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const [showRemove, setShowRemove] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reset = () => {
    clearTimeout(timer.current);
    setShowRemove(false);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return <div className={`anchor-menu-row ui-type-section-title${selected ? " is-selected" : anchor.liveStatus === 1 ? " is-live" : ""}${showRemove ? " is-remove-visible" : ""}`}
    onPointerEnter={event => {
      if (event.pointerType === "touch") return;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setShowRemove(true), 500);
    }} onPointerLeave={reset} onPointerCancel={reset}>
    <button type="button" className="anchor-menu-select" onClick={onSelect} title={`${anchor.uname}（房间 ${anchor.realRoomId}）`}>
      {avatar}
      <span className={`anchor-menu-name${current || selected ? " text-accent-text" : ""}`}>{anchor.uname}</span>
      <span className="anchor-menu-room">{anchor.realRoomId}</span>
    </button>
    <button type="button" className="anchor-menu-remove" aria-label={`删除主播：${anchor.uname}`} title="删除主播" onClick={onRemove}>
      <Trash2 size={18} strokeWidth={2} aria-hidden="true" />
    </button>
  </div>;
}
