import type { DanmakuUser } from "./protocol/types.ts";

export type UserNicknames = Record<string, string>;

export function normalizeUserNicknames(value: unknown): UserNicknames {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([uid, nickname]) => {
      const normalizedUid = uid.trim();
      const normalizedNickname = typeof nickname === "string" ? nickname.trim() : "";
      return normalizedUid && normalizedNickname ? [[normalizedUid, normalizedNickname]] : [];
    }),
  );
}

export function resolveArchiveUserDisplayName(
  user: Pick<DanmakuUser, "uid" | "uname"> | undefined,
  profileMap: UserNicknames = {},
): string {
  if (!user) return "";
  return profileMap[user.uid]?.trim() || user.uname || "";
}

export function resolveUserDisplayName(
  user: Pick<DanmakuUser, "uid" | "uname"> | undefined,
  nicknames: UserNicknames = {},
): string {
  return resolveArchiveUserDisplayName(user, nicknames);
}

export function upsertUserNickname(current: UserNicknames, uid: string, nickname: string): UserNicknames {
  const normalizedUid = uid.trim();
  const normalizedNickname = nickname.trim();
  if (!normalizedUid || !normalizedNickname) return { ...current };
  return { ...current, [normalizedUid]: normalizedNickname };
}

export function removeUserNickname(current: UserNicknames, uid: string): UserNicknames {
  const next = { ...current };
  delete next[uid.trim()];
  return next;
}
