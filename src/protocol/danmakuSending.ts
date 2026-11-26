import { fetch } from "@tauri-apps/plugin-http";
import {
  BILI_HEADERS,
  biliGet,
  encWbi,
  keyFromUrl,
  type NavData,
  ApiError,
} from "./api";
import type { Session } from "./login";
import {
  buildDanmakuForm,
  parseSendResult,
  parseEmoticonPackages,
  type LiveDanmakuRequest,
} from "./danmakuSendingModel";
let liveDevice: { b_3: string; b_4: string } | undefined;
export async function liveRequestCookie(cookie: string, signal?: AbortSignal) {
  if (!liveDevice) {
    const value = await biliGet<{ b_3: string; b_4: string }>(
      "https://api.bilibili.com/x/frontend/finger/spi",
      undefined,
      signal,
    );
    if (!value.b_3 || !value.b_4) throw new Error("device");
    liveDevice = value;
  }
  const base = cookie
    .split(";")
    .filter((p) => !/^\s*buvid[34]=/.test(p))
    .join(";");
  return `${base}; buvid3=${liveDevice.b_3}; buvid4=${liveDevice.b_4}`;
}
export async function getRoomEmoticonPackages(
  roomId: number,
  cookie: string,
  signal?: AbortSignal,
) {
  const requestCookie = await liveRequestCookie(cookie, signal);
  const response = await fetch(
    `https://api.live.bilibili.com/xlive/web-ucenter/v2/emoticon/GetEmoticons?platform=pc&room_id=${roomId}`,
    {
      headers: { ...BILI_HEADERS, Cookie: requestCookie },
      signal: signal ?? AbortSignal.timeout(15000),
    },
  );
  if (!response.ok) throw new Error("emoticons");
  return parseEmoticonPackages(await response.json());
}
export async function sendLiveDanmaku(
  request: LiveDanmakuRequest,
  session: Session,
  signal?: AbortSignal,
) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  const timer = setTimeout(cancel, 15000);
  let submitted = false;
  try {
    const form = buildDanmakuForm(
      request,
      session.cookie,
      Math.floor(Date.now() / 1000),
    );
    const nav = await biliGet<NavData>(
      "https://api.bilibili.com/x/web-interface/nav",
      session.cookie,
      controller.signal,
    );
    if (!nav.isLogin || String(nav.mid) !== session.mid)
      return { status: "login" as const };
    if (request.kind === "emoticon") {
      const packages = await getRoomEmoticonPackages(
        request.roomId,
        session.cookie,
        controller.signal,
      );
      if (
        !packages.some((p) =>
          p.emoticons.some((e) => e.unique === request.unique && e.available),
        )
      )
        return { status: "unavailableEmoticon" as const };
    }
    const requestCookie = await liveRequestCookie(
      session.cookie,
      controller.signal,
    );
    if (controller.signal.aborted) return { status: "failed" as const };
    const query = encWbi(
      { web_location: "444.8" },
      keyFromUrl(nav.wbi_img.img_url),
      keyFromUrl(nav.wbi_img.sub_url),
      Math.floor(Date.now() / 1000),
    );
    submitted = true;
    const response = await fetch(
      `https://api.live.bilibili.com/msg/send?${query}`,
      {
        method: "POST",
        headers: {
          ...BILI_HEADERS,
          Cookie: requestCookie,
          referer: `https://live.bilibili.com/${request.roomId}`,
        },
        body: form,
        signal: controller.signal,
      },
    );
    if (!response.ok) return { status: "unknown" as const };
    return parseSendResult(await response.json());
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.code === -101 || error.code === -111)
    )
      return { status: "login" as const };
    if (error instanceof Error && error.message === "login")
      return { status: "login" as const };
    return { status: submitted ? ("unknown" as const) : ("failed" as const) };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
