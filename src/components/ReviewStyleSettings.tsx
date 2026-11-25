import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Settings2, X, RotateCcw } from "lucide-react";
import { SettingsChoiceControl } from "./SettingsChoiceControl";
import { SettingsIcon } from "./SettingsIcon";
import { useGeneralSettings } from "../generalSettings.ts";
import {
  MIN_EVENT_FONT_SIZE,
  MAX_EVENT_FONT_SIZE,
  clampEventFontSize,
} from "../eventDisplaySettings.ts";
import type { ReviewStyleSettings as Preferences } from "../reviewStyleSettings.ts";

export function ReviewStyleSettings() {
  useUiLanguage();
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
    key: Exclude<keyof Preferences, "fontSize" | "identityDisplayMode">,
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
        {uiText("reviewStyleSettings.ReviewStyleSettings")}</button>
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
              <h2 id="review-style-title">{uiText("reviewStyleSettings.ReviewStyleSettings")}</h2>
              <button type="button" aria-label={uiText("reviewStyleSettings.aria_label")} onClick={close}>
                <X size={20} />
              </button>
            </header>
            <div className="review-style-options">
              <label className="review-style-toggle">
                <span>{uiText("reviewStyleSettings.ReviewStyleSettings2")}</span>
                <span>
                  <input
                    className="review-style-font"
                    aria-label={uiText("reviewStyleSettings.aria_label2")}
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
              {toggle("showAvatar", uiText("reviewStyleSettings.ReviewStyleSettings3"))}
              {toggle("showAvatarFrame", uiText("reviewStyleSettings.ReviewStyleSettings4"), !settings.showAvatar)}
              <fieldset>
                <legend><SettingsIcon name="badges" />{uiText("reviewStyleSettings.ReviewStyleSettings5")}</legend>
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
                      {[uiText("reviewStyleSettings.ReviewStyleSettings6"), uiText("reviewStyleSettings.ReviewStyleSettings7"), uiText("reviewStyleSettings.ReviewStyleSettings8")][index]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="review-style-toggle">
                <span>{uiText("reviewStyleSettings.ReviewStyleSettings9")}</span>
                <SettingsChoiceControl label={uiText("reviewStyleSettings.label")} value={settings.identityDisplayMode} onChange={identityDisplayMode => update({ identityDisplayMode })} options={[{ value: "icon", label: uiText("reviewStyleSettings.options.label") }, { value: "text", label: uiText("reviewStyleSettings.options.label2") }]} />
              </div>
              {toggle("showFanMedal", uiText("reviewStyleSettings.ReviewStyleSettings10"))}
              {toggle("showLevelAndRank", uiText("reviewStyleSettings.ReviewStyleSettings11"))}
              {toggle("showIcons", uiText("reviewStyleSettings.ReviewStyleSettings12"))}
              {toggle("usePriceGradient", uiText("reviewStyleSettings.ReviewStyleSettings13"))}
              {toggle("uniformTextColor", uiText("reviewStyleSettings.ReviewStyleSettings14"))}
            </div>
            <footer>
              <button type="button" className="settings-icon-action" title={uiText("common.restoreDefaults")} aria-label={uiText("common.restoreDefaults")} onClick={reset}>
                <RotateCcw size={16} aria-hidden="true" />
              </button>
              <button type="button" onClick={close}>
                {uiText("reviewStyleSettings.ReviewStyleSettings15")}</button>
            </footer>
          </dialog>,
          document.body,
        )}
    </>
  );
}
