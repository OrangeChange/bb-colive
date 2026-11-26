import { invoke } from "@tauri-apps/api/core";

type LiveRequest =
  | { kind: "send"; query: string; headers: Record<string, string>; body: number[] }
  | { kind: "roomInfo"; roomId: number; headers: Record<string, string> };

/** 先取得取消句柄，再提交请求，切房时不会漏掉尚在排队的发送。 */
export async function liveHttp(request: LiveRequest, signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("cancelled");
  const rid = await invoke<number>("prepare_live_http", { request });
  const cancel = () => { void invoke("cancel_live_http", { rid }).catch(() => {}); };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    if (signal?.aborted) throw new Error("cancelled");
    const result = await invoke<{ status: number; body: string }>("execute_live_http", { rid });
    if (signal?.aborted) throw new Error("cancelled");
    return new Response(result.body, { status: result.status });
  } finally {
    signal?.removeEventListener("abort", cancel);
    cancel();
  }
}

export async function postLiveDanmaku(
  query: string,
  headers: Record<string, string>,
  form: FormData,
  signal: AbortSignal,
) {
  const encoded = new Request("https://api.live.bilibili.com/msg/send", { method: "POST", body: form });
  const body = Array.from(new Uint8Array(await encoded.arrayBuffer()));
  return liveHttp({ kind: "send", query, headers: { ...headers, "content-type": encoded.headers.get("content-type")! }, body }, signal);
}
