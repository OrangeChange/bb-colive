import { Checkbox } from "./shadcn/checkbox";
import { Input } from "./shadcn/input";
import { Button } from "./shadcn/button";
import { Switch } from "./shadcn/switch";
import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "./shadcn/dialog";
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
  const trigger = useRef<HTMLButtonElement>(null);
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
      <Switch



        checked={settings[key]}
        disabled={disabled}
        onCheckedChange={(event) => update({ [key]: (event === true) })}
      />
    </label>
  );
  return (
    <>
      <Button variant="outline"
        ref={trigger}
        type="button"
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line bg-bg px-2.5 ui-type-control text-t2 hover:bg-raised hover:text-accent-text"
        onClick={() => setOpen(true)}
      >
        <Settings2 size={16} strokeWidth={2} />
        {uiText("reviewStyleSettings.ReviewStyleSettings")}</Button>
      <Dialog open={open} onOpenChange={setOpen}><DialogContent asChild showCloseButton={false} aria-describedby={undefined} className="max-w-none gap-0 p-0"><section className="review-style-dialog">
            <header>
              <DialogTitle asChild><h2 id="review-style-title">{uiText("reviewStyleSettings.ReviewStyleSettings")}</h2></DialogTitle>
              <Button variant="outline" type="button" aria-label={uiText("reviewStyleSettings.aria_label")} onClick={close}>
                <X size={20} />
              </Button>
            </header>
            <div className="review-style-options">
              <label className="review-style-toggle">
                <span>{uiText("reviewStyleSettings.ReviewStyleSettings2")}</span>
                <span>
                  <Input
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
                      <Checkbox

                        checked={settings[key]}
                        onCheckedChange={(event) =>
                          update({ [key]: (event === true) })
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
              <Button variant="ghost" type="button" className="settings-icon-action" title={uiText("common.restoreDefaults")} aria-label={uiText("common.restoreDefaults")} onClick={reset}>
                <RotateCcw size={16} aria-hidden="true" />
              </Button>
              <Button variant="outline" type="button" onClick={close}>
                {uiText("reviewStyleSettings.ReviewStyleSettings15")}</Button>
            </footer>
          </section></DialogContent></Dialog>
    </>
  );
}
