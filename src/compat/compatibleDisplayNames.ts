import { maskDisplayName } from "../events/displayNameProjection.ts";
import type { DanmakuEvent } from "../protocol/types.ts";
import type { UserNicknames } from "../userNicknames.ts";

/** 只调整投影后的姓名，原始事件和身份字段保持不变。 */
export function projectCompatibleDisplayNames<T>(value: T, event: DanmakuEvent, nicknames: UserNicknames, masked: boolean): T {
  if (!value || typeof value !== "object" || Object.keys(nicknames).length === 0) return value;
  const name = (uid: unknown) => {
    const nickname = nicknames[String(uid)]?.trim();
    return nickname ? masked ? maskDisplayName(nickname) : nickname : undefined;
  };
  const user = (input: Record<string, any>, uid: unknown = input.uid) => {
    const display = name(uid);
    if (!display) return input;
    return { ...input, ...Object.fromEntries(["authorName", "username", "uname"].filter(key => key in input).map(key => [key, display])) };
  };
  const input = value as Record<string, any>;
  if (input.payload) return { ...input, payload: user(input.payload, event.user?.uid) } as T;
  const output = { ...user(input, event.user?.uid ?? input.uid) };
  for (const key of ["reply", "receiver"]) if (input[key]) output[key] = user(input[key]);
  if (Array.isArray(input.list)) output.list = input.list.map((entry: any) => Array.isArray(entry)
    ? name(entry[0]) ? [entry[0], name(entry[0]), ...entry.slice(2)] : entry
    : entry && typeof entry === "object" ? user(entry) : entry);
  return output as T;
}
