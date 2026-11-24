import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Settings2, X, RotateCcw } from "lucide-react";
import { SettingsIcon } from "./SettingsIcon";
import { useGeneralSettings } from "../generalSettings.ts";
import {
  MIN_EVENT_FONT_SIZE,
  MAX_EVENT_FONT_SIZE,
  clampEventFontSize,
} from "../eventDisplaySettings.ts";
import type { ReviewStyleSettings as Preferences } from "../reviewStyleSettings.ts";

export function ReviewStyleSettings() {
  const [open, setOpen] = useState(false);
  const settings = useGeneralSettings((s) => s.reviewStyleSettings);
  const [fontInput, setFontInput] = useState(String(settings.fontSize));
  useEffect(() => setFontInput(String(settings.fontSize)), [settings.fontSize]);
  const update = useGeneralSettings((s) => s.setReviewStyleSettings);
  const reset = useGeneralSettings((s) => s.resetReviewStyle);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const toggle = (
    key: Exclude<keyof Preferences, "fontSize">,
    label: string,
    disabled = false,
  ) => (
    <label
      className={`review-style-toggle ${disabled ? "review-style-toggle-disabled" : ""}`}
    >
      <span>{label}</span>
      <input
        className="review-style-switch"
        type="checkbox"
        role="switch"
        checked={settings[key]}
        disabled={disabled}
        onChange={(event) => update({ [key]: event.target.checked })}
      />
    </label>
  );
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line bg-bg px-2.5 ui-type-control text-t2 hover:bg-raised hover:text-accent-text"
        onClick={() => setOpen(true)}
      >
        <Settings2 size={16} strokeWidth={2} />
        样式设置
      </button>
      {open &&
        createPortal(
          <dialog
            ref={dialog}
            className="review-style-dialog"
            aria-labelledby="review-style-title"
            onCancel={(event) => {
              event.preventDefault();
              close();
            }}
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                const r = event.currentTarget.getBoundingClientRect();
                if (
                  event.clientX < r.left ||
                  event.clientX > r.right ||
                  event.clientY < r.top ||
                  event.clientY > r.bottom
                )
                  close();
              }
            }}
          >
            <header>
              <h2 id="review-style-title">样式设置</h2>
              <button type="button" aria-label="关闭样式设置" onClick={close}>
                <X size={20} />
              </button>
            </header>
            <div className="review-style-options">
              <label className="review-style-toggle">
                <span>基准字号</span>
                <span>
                  <input
                    className="review-style-font"
                    aria-label="基准字号"
                    type="number"
                    min={MIN_EVENT_FONT_SIZE}
                    max={MAX_EVENT_FONT_SIZE}
                    step={1}
                    value={fontInput}
                    onChange={(event) => {
                      const value = event.target.value;
                      setFontInput(value);
                      const size = Number(value);
                      if (
                        value &&
                        size >= MIN_EVENT_FONT_SIZE &&
                        size <= MAX_EVENT_FONT_SIZE
                      )
                        update({ fontSize: size });
                    }}
                    onBlur={() => {
                      const size =
                        fontInput && Number.isFinite(Number(fontInput))
                          ? clampEventFontSize(Number(fontInput))
                          : settings.fontSize;
                      setFontInput(String(size));
                      update({ fontSize: size });
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                  />{" "}
                  px
                </span>
              </label>
              <input className="settings-range review-style-font-range" style={{ "--settings-range-progress": `${(settings.fontSize - MIN_EVENT_FONT_SIZE) / (MAX_EVENT_FONT_SIZE - MIN_EVENT_FONT_SIZE) * 100}%` } as CSSProperties} type="range" aria-label="基准字号滑动调整" min={MIN_EVENT_FONT_SIZE} max={MAX_EVENT_FONT_SIZE} step={1} value={settings.fontSize} onChange={event => update({ fontSize: Number(event.target.value) })} />
              {toggle("showAvatar", "头像")}
              {toggle("showAvatarFrame", "头像框", !settings.showAvatar)}
              <fieldset>
                <legend><SettingsIcon name="身份标记" />身份标记</legend>
                <div className="review-style-identities">
                  {(
                    [
                      "showGuardIdentity",
                      "showAnchorIdentity",
                      "showAdminIdentity",
                    ] as const
                  ).map((key, index) => (
                    <label key={key}>
                      <input
                        type="checkbox"
                        checked={settings[key]}
                        onChange={(event) =>
                          update({ [key]: event.target.checked })
                        }
                      />
                      {["大航海", "主播", "房管"][index]}
                    </label>
                  ))}
                </div>
              </fieldset>
              {toggle("showFanMedal", "粉丝牌")}
              {toggle("showLevelAndRank", "等级与排名")}
              {toggle("showIcons", "图标")}
              {toggle("usePriceGradient", "按价格梯度配色")}
              {toggle("uniformTextColor", "统一文字颜色")}
            </div>
            <footer>
              <button type="button" className="settings-icon-action" title="恢复默认" aria-label="恢复默认" onClick={reset}>
                <RotateCcw size={16} aria-hidden="true" />
              </button>
              <button type="button" onClick={close}>
                完成
              </button>
            </footer>
          </dialog>,
          document.body,
        )}
    </>
  );
}
