import { fetch } from "@tauri-apps/plugin-http";
import { BILI_HEADERS, biliGet, encWbi, keyFromUrl, type NavData } from "./api";
import type { Session } from "./login";
import {
  buildDanmakuForm,
  parseSendResult,
  parseEmoticonPackages,
  type LiveDanmakuRequest,
} from "./danmakuSendingModel";
export async function getRoomEmoticonPackages(
  roomId: number,
  cookie: string,
  signal?: AbortSignal,
) {
  const response = await fetch(
    `https://api.live.bilibili.com/xlive/web-ucenter/v2/emoticon/GetEmoticons?platform=pc&room_id=${roomId}`,
    {
      headers: { ...BILI_HEADERS, Cookie: cookie },
      signal: signal ?? AbortSignal.timeout(15000),
    },
  );
  if (!response.ok) throw new Error("emoticons");
  return parseEmoticonPackages(await response.json());
}
export async function sendLiveDanmaku(
  request: LiveDanmakuRequest,
  session: Session,
) {
  let form: FormData;
  try {
    form = buildDanmakuForm(
      request,
      session.cookie,
      Math.floor(Date.now() / 1000),
    );
  } catch {
    return { status: "login" as const };
  }
  let nav;
  try {
    nav = await biliGet<NavData>(
      "https://api.bilibili.com/x/web-interface/nav",
      session.cookie,
      AbortSignal.timeout(15000),
    );
  } catch {
    return { status: "failed" as const };
  }
  if (!nav.isLogin || String(nav.mid) !== session.mid)
    return { status: "login" as const };
  const query = encWbi(
    { web_location: "444.8" },
    keyFromUrl(nav.wbi_img.img_url),
    keyFromUrl(nav.wbi_img.sub_url),
    Math.floor(Date.now() / 1000),
  );
  try {
    const response = await fetch(
      `https://api.live.bilibili.com/msg/send?${query}`,
      {
        method: "POST",
        headers: {
          ...BILI_HEADERS,
          Cookie: session.cookie,
          referer: `https://live.bilibili.com/${request.roomId}`,
        },
        body: form,
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) return { status: "unknown" as const };
    return parseSendResult(await response.json());
  } catch {
    return { status: "unknown" as const };
  }
}
