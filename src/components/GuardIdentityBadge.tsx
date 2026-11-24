import { useState } from "react";
import type { GuardIdentityDisplayMode } from "../eventDisplaySettings";
import type { GuardIconSet } from "../protocol/types";
import { publicGuardLevel } from "../events/publicEventStyle";

type GuardLevel = 1 | 2 | 3;

const GUARD_ICON_TABLE: Record<GuardIconSet, Record<GuardLevel, string>> = {
  base: {
    1: "/guard-identities/standard-captain.png",
    2: "/guard-identities/standard-admiral.png",
    3: "/guard-identities/standard-governor.png",
  },
  enhanced: {
    1: "/guard-identities/captain.png",
    2: "/guard-identities/admiral.png",
    3: "/guard-identities/governor.png",
  },
};

const GUARD_LEVEL_BY_LABEL: Record<string, GuardLevel> = { 舰长: 1, 提督: 2, 总督: 3 };

function normalizeGuardLevel(label: string, guardLevel?: number): GuardLevel {
  if (guardLevel === 1 || guardLevel === 2 || guardLevel === 3) return guardLevel;
  return GUARD_LEVEL_BY_LABEL[label] ?? 1;
}

export function resolveGuardIdentityIconSrc({
  iconUrl,
  failedUrl,
  iconSet = "base",
  guardLevel,
  label = "舰长",
}: {
  iconUrl?: string;
  failedUrl?: string;
  iconSet?: GuardIconSet;
  guardLevel?: number;
  label?: string;
}): string {
  const level = normalizeGuardLevel(label, guardLevel);
  const fallback = GUARD_ICON_TABLE[iconSet][level];
  return iconUrl && failedUrl !== iconUrl ? iconUrl : fallback;
}

export function GuardIdentityBadge({
  label,
  iconUrl,
  iconSet,
  guardLevel,
  mode,
  textClassName,
  iconClassName = "guard-badge h-4 w-auto max-w-9 shrink-0 object-contain",
}: {
  label: string;
  iconUrl?: string;
  iconSet?: GuardIconSet;
  guardLevel?: number;
  mode: GuardIdentityDisplayMode;
  textClassName: string;
  iconClassName?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const styleLevel = publicGuardLevel(normalizeGuardLevel(label, guardLevel));
  if (mode === "icon") {
    const src = resolveGuardIdentityIconSrc({ iconUrl, failedUrl, iconSet, guardLevel, label });
    return (
      <img
        src={src}
        alt={label}
        title={label}
        aria-label={`大航海身份：${label}`}
        height={16}
        loading="lazy"
        className={iconClassName}
        data-level={styleLevel}
        onError={src === iconUrl ? () => setFailedUrl(iconUrl) : undefined}
      />
    );
  }
  return <span className={`guard-badge ${textClassName}`} data-level={styleLevel} aria-label={`大航海身份：${label}`} title={label}>{label}</span>;
}
