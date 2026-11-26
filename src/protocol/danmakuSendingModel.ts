export type SendStatus =
  | "unavailableEmoticon"
  | "sent"
  | "sending"
  | "blocked"
  | "fast"
  | "long"
  | "muted"
  | "login"
  | "unknown"
  | "failed";
export type LiveDanmakuRequest = { roomId: number; replyUid?: string } & (
  { kind: "text"; text: string } | { kind: "emoticon"; unique: string }
);
export interface LiveEmoticon {
  unique: string;
  text: string;
  url: string;
  width: number;
  height: number;
  available: boolean;
  unlockText: string;
  textual: boolean;
}
export interface RoomEmoticonPackage {
  type: number;
  id: string;
  name: string;
  cover: string;
  emoticons: LiveEmoticon[];
}
export function sessionCookieValue(cookie: string, key: string): string {
  return (
    cookie
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith(key + "="))
      ?.slice(key.length + 1) ?? ""
  );
}
export function buildDanmakuForm(
  request: LiveDanmakuRequest,
  cookie: string,
  now: number,
): FormData {
  if (
    !sessionCookieValue(cookie, "SESSDATA") ||
    !sessionCookieValue(cookie, "bili_jct")
  )
    throw new Error("login");
  if (!Number.isSafeInteger(request.roomId) || request.roomId <= 0)
    throw new Error("room");
  if (request.kind === "emoticon" && request.replyUid)
    throw new Error("emoticon-reply");
  const msg =
    request.kind === "text"
      ? request.text.replace(/[\r\n]+/g, " ").trim()
      : request.unique;
  if (!msg) throw new Error("empty");
  const csrf = sessionCookieValue(cookie, "bili_jct");
  const form = new FormData();
  const fields: Record<string, string> = {
    bubble: "0",
    msg,
    color: "16777215",
    mode: "1",
    fontsize: "25",
    rnd: String(now),
    roomid: String(request.roomId),
    csrf,
    csrf_token: csrf,
  };
  if (request.kind === "emoticon")
    Object.assign(fields, { dm_type: "1", emoticonOptions: "[object Object]" });
  else
    Object.assign(fields, {
      room_type: "0",
      jumpfrom: "0",
      reply_mid: request.replyUid ?? "0",
      reply_attr: "0",
      replay_dmid: "",
      statistics: '{"appId":100,"platform":5}',
      reply_type: "0",
      reply_uname: "",
    });
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return form;
}
export function parseSendResult(body: unknown): {
  status: SendStatus;
  code?: number;
} {
  if (!body || typeof body !== "object") return { status: "unknown" };
  const b = body as Record<string, unknown>;
  const code = typeof b.code === "number" ? b.code : undefined;
  const text = [b.message, b.msg]
    .filter((x) => typeof x === "string")
    .join(" ")
    .trim();
  let status: SendStatus = "failed";
  if (code === undefined) status = "unknown";
  else if (code === -101 || code === -111) status = "login";
  else if (/(^|\s)f($|\s)|屏蔽|敏感|违禁|内容.*不允许/.test(text))
    status = "blocked";
  else if (/频繁|太快|msg in|too fast/i.test(text)) status = "fast";
  else if (/长度|字数|too long/i.test(text)) status = "long";
  else if (/禁言|banned|silent/i.test(text)) status = "muted";
  else if (code === 0)
    status = !text || text === "0 0" || text === "0" ? "sent" : "unknown";
  return { status, ...(code !== undefined ? { code } : {}) };
}
export function parseEmoticonPackages(body: any): RoomEmoticonPackage[] {
  if (body?.code !== 0) throw new Error("emoticons");
  return (Array.isArray(body.data?.data) ? body.data.data : []).map(
    (p: any, index: number) => ({
      id: `${p.pkg_type}:${p.pkg_id ?? index}`,
      type: Number(p.pkg_type) || 0,
      name: String(p.pkg_name ?? ""),
      cover: String(p.current_cover || p.emoticons?.[0]?.url || "").replace(
        /^http:/,
        "https:",
      ),
      emoticons: (Array.isArray(p.emoticons) ? p.emoticons : [])
        .filter(
          (e: any) =>
            e?.url &&
            (e.emoticon_unique ||
              (p.pkg_type === 3 && (e.descript || e.emoji))),
        )
        .map((e: any) => ({
          unique: String(e.emoticon_unique || e.descript || e.emoji),
          text: String(
            p.pkg_type === 3
              ? e.descript || e.emoji || ""
              : e.emoji || e.descript || "",
          ),
          url: String(e.url).replace(/^http:/, "https:"),
          width: Number(e.width) || 40,
          height: Number(e.height) || 40,
          available: e.perm === 1,
          unlockText: String(e.unlock_show_text || ""),
          textual: p.pkg_type === 3,
        })),
    }),
  );
}

/** 直播网页按可打印 ASCII 计一单位，其余 UTF-16 单元计两单位。 */
export function danmakuTextUsage(text: string): number {
  let count = 0;
  for (const char of text.replace(/\r?\n/g, " ").trim()) {
    const code = char.codePointAt(0)!;
    count += code >= 32 && code <= 126 ? 1 : 2 * char.length;
  }
  return count;
}
