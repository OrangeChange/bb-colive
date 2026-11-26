import { fetch } from "@tauri-apps/plugin-http";
import { biliGet, BILI_HEADERS, type NavData } from "./api";
import { liveRequestCookie } from "./danmakuSending";
import { sessionCookieValue } from "./danmakuSendingModel";
import { parseMedalPanel, parseWornMedal } from "./liveMedalsModel";
import type { Session } from "./login";
export async function getLiveMedals(
  roomId: number,
  cookie: string,
  page: number,
  signal?: AbortSignal,
) {
  const requestCookie = await liveRequestCookie(cookie, signal);
  const [data, info] = await Promise.all([
    biliGet<any>(
      `https://api.live.bilibili.com/xlive/app-ucenter/v1/fansMedal/panel?room_id=${roomId}&page=${page}&page_size=20`,
      requestCookie,
      signal,
    ),
    page === 1
      ? biliGet<any>(
          `https://api.live.bilibili.com/xlive/web-room/v1/index/getInfoByUser?room_id=${roomId}`,
          requestCookie,
          signal,
        )
      : Promise.resolve(undefined),
  ]);
  return {
    ...parseMedalPanel(data),
    ...(info
      ? {
          current: parseWornMedal(info.medal),
          limit: Number(info.property?.danmu?.length) || undefined,
        }
      : {}),
  };
}
export async function wearLiveMedal(
  medalId: number,
  session: Session,
  signal: AbortSignal,
) {
  const nav = await biliGet<NavData>(
    "https://api.bilibili.com/x/web-interface/nav",
    session.cookie,
    signal,
  );
  if (!nav.isLogin || String(nav.mid) !== session.mid) throw new Error("login");
  const cookie = await liveRequestCookie(session.cookie, signal);
  const csrf = sessionCookieValue(cookie, "bili_jct");
  if (!csrf || !Number.isSafeInteger(medalId) || medalId <= 0)
    throw new Error("medal");
  if (signal.aborted) throw new Error("cancelled");
  const response = await fetch(
    "https://api.live.bilibili.com/xlive/app-ucenter/v1/fansMedal/wear",
    {
      method: "POST",
      headers: { ...BILI_HEADERS, Cookie: cookie },
      body: new URLSearchParams({
        medal_id: String(medalId),
        target_id: "0",
        room_id: "0",
        csrf,
        csrf_token: csrf,
      }),
      signal,
    },
  );
  if (!response.ok || (await response.json()).code !== 0)
    throw new Error("medal");
}
