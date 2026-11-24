export type SettingsSectionId = "general" | "display" | "filters" | "live" | "review" | "windows" | "interaction" | "voice" | "other" | "about";

export type SettingsSection = {
  id: SettingsSectionId;
  label: string;
};

export type SettingsAnchorId = "display" | "gift" | "cloud-recovery" | "diagnostics";

export type SettingsOpenRequest = {
  requestId: number;
  sectionId: SettingsSectionId;
  anchorId?: SettingsAnchorId;
  action?: "mark-issue" | "connect-cloud-recovery";
};

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { id: "general", label: "通用设置" },
  { id: "display", label: "事件显示" },
  { id: "filters", label: "事件筛选" },
  { id: "live", label: "现场" },
  { id: "review", label: "回看" },
  { id: "windows", label: "副窗口" },
  { id: "interaction", label: "事件交互" },
  { id: "voice", label: "语音与播报" },
  { id: "other", label: "其他设置" },
  { id: "about", label: "关于" },
];

/** 归一化后的累计滚轮位移阈值；持续输入可以一次跨越多个分类。 */
export const SETTINGS_WHEEL_THRESHOLD = 80;

export function isSectionNavigationTargetReached(targetTop: number, scrollTop: number, tolerance = 2): boolean {
  return Number.isFinite(targetTop)
    && Number.isFinite(scrollTop)
    && Number.isFinite(tolerance)
    && tolerance >= 0
    && Math.abs(targetTop - scrollTop) <= tolerance;
}

export type SectionWheelResult = {
  index: number;
  remainder: number;
};

export function consumeSectionWheel(
  currentIndex: number,
  remainder: number,
  delta: number,
  count: number,
  threshold = SETTINGS_WHEEL_THRESHOLD,
): SectionWheelResult {
  if (count <= 0 || threshold <= 0 || !Number.isFinite(delta)) {
    return { index: 0, remainder: 0 };
  }

  let index = Math.min(count - 1, Math.max(0, currentIndex));
  let accumulated = Number.isFinite(remainder) ? remainder + delta : delta;

  while (Math.abs(accumulated) >= threshold) {
    const direction = accumulated > 0 ? 1 : -1;
    const nextIndex = Math.min(count - 1, Math.max(0, index + direction));
    if (nextIndex === index) return { index, remainder: 0 };
    index = nextIndex;
    accumulated -= direction * threshold;
  }

  return { index, remainder: accumulated };
}

export function resolveActiveSectionIndex(
  sectionOffsets: readonly number[],
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
  topOffset = 16,
): number {
  if (sectionOffsets.length === 0) return 0;
  if (scrollTop <= 1) return 0;
  const maximum = Math.max(0, scrollHeight - clientHeight);
  if (scrollTop >= maximum - 1) return sectionOffsets.length - 1;

  const line = scrollTop + topOffset;
  let active = 0;
  sectionOffsets.forEach((offset, index) => {
    if (offset <= line) active = index;
  });
  return active;
}
