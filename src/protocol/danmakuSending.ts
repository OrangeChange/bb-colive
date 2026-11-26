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
import { liveHttp, postLiveDanmaku } from "./liveDanmakuTransport";
import {
  buildDanmakuForm,
  parseSendResult,
  parseEmoticonPackages,
  type LiveDanmakuRequest,
  type RoomEmoticonPackage,
} from "./danmakuSendingModel";
const PREPARATION_AGE_MS = 5 * 60_000;
let liveDevice: { b_3: string; b_4: string } | undefined;
let deviceRequest: Promise<{ b_3: string; b_4: string }> | undefined;
interface SendingPreparation {
  key: string;
  cookie: string;
  imgKey: string;
  subKey: string;
  expiresAt: number;
}
let prepared: SendingPreparation | undefined;
let preparing:
  { key: string; promise: Promise<SendingPreparation> } | undefined;
const emoticons = new Map<
  string,
  { packages: RoomEmoticonPackage[]; expiresAt: number }
>();
const loadingEmoticons = new Map<string, Promise<RoomEmoticonPackage[]>>();
const loadingRoomInfo = new Map<string, Promise<any>>();
export function clearLiveSendingPreparation() {
  prepared = undefined;
  preparing = undefined;
  emoticons.clear();
  loadingEmoticons.clear();
  loadingRoomInfo.clear();
}
export function invalidateLiveEmoticons(cookie: string, roomId?: number) {
  const prefix = `${cookie}\n`;
  for (const map of [emoticons, loadingEmoticons])
    for (const key of map.keys())
      if (
        roomId === undefined
          ? key.startsWith(prefix)
          : key === `${prefix}${roomId}`
      )
        map.delete(key);
}
/** 取消当前等待者，不中断其他入口共用的准备请求。 */
function awaitSharedResult<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new Error("cancelled"));
  return new Promise((resolve, reject) => {
    const cancel = () => {
      signal.removeEventListener("abort", cancel);
      reject(new Error("cancelled"));
    };
    signal.addEventListener("abort", cancel, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", cancel);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", cancel);
        reject(error);
      },
    );
  });
}
export async function liveRequestCookie(cookie: string, signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("cancelled");
  if (!liveDevice) {
    if (!deviceRequest) {
      deviceRequest = biliGet<{ b_3: string; b_4: string }>(
        "https://api.bilibili.com/x/frontend/finger/spi",
        undefined,
        AbortSignal.timeout(15000),
      )
        .then((value) => {
          if (!value.b_3 || !value.b_4) throw new Error("device");
          liveDevice = value;
          return value;
        })
        .finally(() => {
          deviceRequest = undefined;
        });
    }
    await awaitSharedResult(deviceRequest, signal);
  }
  if (signal?.aborted) throw new Error("cancelled");
  const base = cookie
    .split(";")
    .filter((p) => !/^\s*buvid[34]=/.test(p))
    .join(";");
  return `${base}; buvid3=${liveDevice!.b_3}; buvid4=${liveDevice!.b_4}`;
}
/** 只准备发送所需的登录信息、签名材料与设备信息，不发送消息。 */
export async function prepareLiveDanmaku(
  session: Session,
  refreshAheadMs = 0,
): Promise<SendingPreparation> {
  const key = `${session.mid}:${session.savedAt}:${session.cookie}`;
  if (prepared?.key === key && prepared.expiresAt - Date.now() > refreshAheadMs)
    return prepared;
  if (preparing?.key === key) return preparing.promise;
  const promise = Promise.all([
    biliGet<NavData>(
      "https://api.bilibili.com/x/web-interface/nav",
      session.cookie,
      AbortSignal.timeout(15000),
    ),
    liveRequestCookie(session.cookie),
  ])
    .then(([nav, cookie]) => {
      if (!nav.isLogin || String(nav.mid) !== session.mid)
        throw new Error("login");
      const value = {
        key,
        cookie,
        imgKey: keyFromUrl(nav.wbi_img.img_url),
        subKey: keyFromUrl(nav.wbi_img.sub_url),
        expiresAt: Date.now() + PREPARATION_AGE_MS,
      };
      if (preparing?.promise === promise) prepared = value;
      return value;
    })
    .catch((error) => {
      if (
        prepared?.key === key &&
        ((error instanceof Error && error.message === "login") ||
          (error instanceof ApiError &&
            [-101, -111].some((code) => code === error.code)))
      )
        prepared = undefined;
      throw error;
    })
    .finally(() => {
      if (preparing?.promise === promise) preparing = undefined;
    });
  preparing = { key, promise };
  return promise;
}
/** 同一账号、房间的并发查询共用连接，不保留佩戴状态缓存。 */
export async function getLiveRoomSendingInfo(roomId: number, cookie: string, signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("cancelled");
  const key = `${cookie}\n${roomId}`;
  let pending = loadingRoomInfo.get(key);
  if (!pending) {
    pending = (async () => {
      const timeout = AbortSignal.timeout(15000);
      const requestCookie = await liveRequestCookie(cookie, timeout);
      const response = await liveHttp({ kind: "roomInfo", roomId, headers: { ...BILI_HEADERS, Cookie: requestCookie } }, timeout);
      if (!response.ok) throw new ApiError("room information unavailable", response.status);
      const result = await response.json();
      if (result.code !== 0) throw new ApiError("room information unavailable", result.code);
      return result.data;
    })().finally(() => {
      if (loadingRoomInfo.get(key) === pending) loadingRoomInfo.delete(key);
    });
    loadingRoomInfo.set(key, pending);
  }
  return awaitSharedResult(pending, signal);
}

export async function prepareLiveRoomSending(session: Session, roomId: number, signal: AbortSignal) {
  await awaitSharedResult(prepareLiveDanmaku(session), signal);
  if (signal.aborted) return;
  await getLiveRoomSendingInfo(roomId, session.cookie, signal);
}

export async function getRoomEmoticonPackages(
  roomId: number,
  cookie: string,
  signal?: AbortSignal,
  refresh = false,
) {
  if (signal?.aborted) throw new Error("cancelled");
  const key = `${cookie}\n${roomId}`;
  if (refresh) invalidateLiveEmoticons(cookie, roomId);
  const existing = emoticons.get(key);
  if (existing && existing.expiresAt > Date.now()) return existing.packages;
  let request = loadingEmoticons.get(key);
  if (!request) {
    request = (async () => {
      const timeout = AbortSignal.timeout(15000);
      const requestCookie = await liveRequestCookie(cookie, timeout);
      const response = await fetch(
        `https://api.live.bilibili.com/xlive/web-ucenter/v2/emoticon/GetEmoticons?platform=pc&room_id=${roomId}`,
        {
          headers: { ...BILI_HEADERS, Cookie: requestCookie },
          signal: timeout,
        },
      );
      if (!response.ok) throw new Error("emoticons");
      const packages = parseEmoticonPackages(await response.json());
      if (loadingEmoticons.get(key) === request)
        emoticons.set(key, {
          packages,
          expiresAt: Date.now() + PREPARATION_AGE_MS,
        });
      return packages;
    })().finally(() => {
      if (loadingEmoticons.get(key) === request) loadingEmoticons.delete(key);
    });
    loadingEmoticons.set(key, request);
  }
  const packages = await awaitSharedResult(request, signal);
  if (signal?.aborted) throw new Error("cancelled");
  return packages;
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
    if (controller.signal.aborted) return { status: "failed" as const };
    const ready = await awaitSharedResult(
      prepareLiveDanmaku(session),
      controller.signal,
    );
    if (controller.signal.aborted) return { status: "failed" as const };
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
    if (controller.signal.aborted) return { status: "failed" as const };
    const query = encWbi(
      { web_location: "444.8" },
      ready.imgKey,
      ready.subKey,
      Math.floor(Date.now() / 1000),
    );
    submitted = true;
    const response = await postLiveDanmaku(
      query,
      {
        ...BILI_HEADERS,
        Cookie: ready.cookie,
        referer: `https://live.bilibili.com/${request.roomId}`,
      },
      form,
      controller.signal,
    );
    if (!response.ok) return { status: "unknown" as const };
    const result = parseSendResult(await response.json());
    if (result.status === "login") clearLiveSendingPreparation();
    else if (
      request.kind === "emoticon" &&
      ["failed", "unavailableEmoticon"].includes(result.status)
    )
      invalidateLiveEmoticons(session.cookie, request.roomId);
    return result;
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
