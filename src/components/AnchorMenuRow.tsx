import { Button } from "./shadcn/button";
import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
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
  useUiLanguage();
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
    <Button variant="outline" type="button" className="anchor-menu-select" onClick={onSelect} title={uiText("anchorMenuRow.title", { uname: anchor.uname, realRoomId: anchor.realRoomId })}>
      {avatar}
      <span className={`anchor-menu-name${current || selected ? " text-accent-text" : ""}`}>{anchor.uname}</span>
      <span className="anchor-menu-room">{anchor.realRoomId}</span>
    </Button>
    <Button variant="outline" type="button" className="anchor-menu-remove" aria-label={uiText("anchorMenuRow.aria_label", { uname: anchor.uname })} title={uiText("anchorMenuRow.title2")} onClick={onRemove}>
      <Trash2 size={18} strokeWidth={2} aria-hidden="true" />
    </Button>
  </div>;
}
