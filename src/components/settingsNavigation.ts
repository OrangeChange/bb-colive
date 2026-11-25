import { localized, uiText } from "../i18n/index.ts";
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

export const SETTINGS_SECTIONS: readonly SettingsSection[] = localized(() => ([
  { id: "general", label: uiText("settingsNavigation.SETTINGS_SECTIONS.label") },
  { id: "display", label: uiText("settingsNavigation.SETTINGS_SECTIONS.label2") },
  { id: "filters", label: uiText("settingsNavigation.SETTINGS_SECTIONS.label3") },
  { id: "live", label: uiText("common.live") },
  { id: "review", label: uiText("common.review") },
  { id: "windows", label: uiText("settingsNavigation.SETTINGS_SECTIONS.label4") },
  { id: "interaction", label: uiText("settingsNavigation.SETTINGS_SECTIONS.label5") },
  { id: "voice", label: uiText("settingsNavigation.SETTINGS_SECTIONS.label6") },
  { id: "other", label: uiText("settingsNavigation.SETTINGS_SECTIONS.label7") },
  { id: "about", label: uiText("settingsNavigation.SETTINGS_SECTIONS.label8") },
]));

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
