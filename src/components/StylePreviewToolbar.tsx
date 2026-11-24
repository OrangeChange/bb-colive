import * as Popover from "@radix-ui/react-popover";
import { Filter, Sun, Moon, Pause, Play, RotateCcw, Check } from "lucide-react";
import "./stylePreviewToolbar.css";
import { UiSelect, type UiSelectOption } from "./ui/Select.tsx";
import { ThemeColorField } from "./ThemeColorField.tsx";

export type StylePreviewMotion = "static" | "design" | "dynamic";
export type StylePreviewScheme = "system" | "light" | "dark";

export interface StylePreviewToolbarProps {
  eventOptions: readonly UiSelectOption[];
  eventValues: readonly string[];
  onEventsChange: (values: string[]) => void;
  eventDisabled?: boolean;
  scheme: StylePreviewScheme;
  motion: StylePreviewMotion;
  supportedMotions?: readonly StylePreviewMotion[];
  playing?: boolean;
  speed?: number;
  background: string;
  width: number;
  error?: boolean;
  onSchemeChange: (value: StylePreviewScheme) => void;
  onMotionChange: (value: StylePreviewMotion) => void;
  onPlayingChange?: () => void;
  onRestart?: () => void;
  onSpeedChange?: (value: number) => void;
  onBackgroundChange: (value: string) => void;
  onWidthChange: (value: number) => void;
}

export function StylePreviewToolbar(props: StylePreviewToolbarProps) {
  const supportedMotions = props.supportedMotions ?? [
    "static",
    "design",
    "dynamic",
  ];
  const choices = props.eventOptions.filter(
    (option) => option.value !== "all" && option.value !== "混合流",
  );
  const selected = props.eventValues;
  const changeEvents = props.onEventsChange;
  return (
    <div className="native-preview-toolbar ui-type-control compact-preview-toolbar">
      <div className="native-preview-toolbar-row is-secondary">
        <div
          className="native-preview-control-group native-preview-motion-group"
          role="group"
          aria-label="预览状态"
        >
          {(
            [
              ["static", "静态"],
              ["design", "点选"],
              ["dynamic", "动态"],
            ] as const
          ).map(([value, label]) => (
            <button
              type="button"
              key={value}
              disabled={!supportedMotions.includes(value)}
              aria-pressed={props.motion === value}
              className={props.motion === value ? "is-active" : ""}
              onClick={() => props.onMotionChange(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {props.motion === "dynamic" && (
          <div
            className="preview-playback-controls"
            role="group"
            aria-label="动态播放"
          >
            <button
              type="button"
              className="preview-icon-button"
              title={props.playing ? "暂停" : "播放"}
              aria-label={props.playing ? "暂停" : "播放"}
              onClick={props.onPlayingChange}
            >
              {props.playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button
              type="button"
              className="preview-icon-button"
              title="重新开始"
              aria-label="重新开始"
              onClick={props.onRestart}
            >
              <RotateCcw size={16} />
            </button>
            <UiSelect
              ariaLabel="动态速度"
              size="compact"
              value={String(props.speed ?? 1)}
              onValueChange={(value) => props.onSpeedChange?.(Number(value))}
              options={[0.5, 1, 1.5, 2, 2.5, 3].map((value) => ({
                value: String(value),
                label: `${value}×`,
              }))}
            />
          </div>
        )}
        <Popover.Root>
          <Popover.Trigger asChild>
            <button
              type="button"
              className={`preview-icon-button preview-event-filter${selected.length ? " is-active" : ""}`}
              title={
                selected.length
                  ? `事件筛选：${selected.join("、")}`
                  : "事件筛选：全部事件"
              }
              aria-label="事件筛选"
              disabled={props.eventDisabled}
            >
              <Filter size={16} />
              {selected.length > 0 && <span className="preview-filter-dot" />}
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className="preview-event-popover"
              sideOffset={6}
              align="end"
              aria-label="事件筛选"
            >
              <div className="preview-event-filter-heading">
                <span>事件筛选</span>
                <button
                  type="button"
                  aria-pressed={!selected.length}
                  className={`preview-filter-all${!selected.length ? " is-active" : ""}`}
                  onClick={() => changeEvents([])}
                >
                  {!selected.length && <Check size={14} aria-hidden="true" />}
                  全部事件
                </button>
              </div>
              {choices.map((option) => (
                <label key={option.value}>
                  <input
                    type="checkbox"
                    checked={selected.includes(option.value)}
                    onChange={() => {
                      const current = [...selected];
                      const next = current.includes(option.value)
                        ? current.filter((value) => value !== option.value)
                        : [...current, option.value];
                      changeEvents(next.length === choices.length ? [] : next);
                    }}
                  />
                  {option.label}
                </label>
              ))}
              <Popover.Arrow className="preview-event-popover-arrow" />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
      <div className="native-preview-toolbar-row is-canvas">
        <div className="native-preview-canvas-color" title="画布背景">
          <ThemeColorField
            label="画布背景"
            value={props.background}
            onChange={props.onBackgroundChange}
          />
        </div>
        <button
          type="button"
          className="preview-icon-button preview-scheme-toggle"
          title={
            props.scheme === "dark"
              ? "当前深色，切换为浅色"
              : "当前浅色，切换为深色"
          }
          aria-label={props.scheme === "dark" ? "切换为浅色" : "切换为深色"}
          aria-pressed={props.scheme === "dark"}
          onClick={() =>
            props.onSchemeChange(props.scheme === "dark" ? "light" : "dark")
          }
        >
          {props.scheme === "dark" ? <Moon size={16} /> : <Sun size={16} />}
        </button>
        <label className="native-preview-width" title="窗口宽度">
          <input
            aria-label="窗口宽度"
            type="number"
            min="160"
            max="1920"
            value={props.width}
            onChange={(event) =>
              props.onWidthChange(Number(event.target.value) || 160)
            }
          />
          <span className="native-preview-width-unit">px</span>
        </label>
      </div>
      {props.error && (
        <span className="native-preview-status is-error">样式存在错误</span>
      )}
    </div>
  );
}
