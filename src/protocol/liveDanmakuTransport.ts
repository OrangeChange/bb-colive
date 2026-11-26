import { invoke } from "@tauri-apps/api/core";

type LiveRequest =
  | { kind: "send"; query: string; headers: Record<string, string>; body: number[] }
  | { kind: "roomInfo"; roomId: number; headers: Record<string, string> };

/** 先取得取消句柄，再提交请求，切房时不会漏掉尚在排队的发送。 */
export async function liveHttp(request: LiveRequest, signal?: AbortSignal, timings?: Record<string, number>) {
  if (signal?.aborted) throw new Error("cancelled");
  const prepareStarted = performance.now();
  const rid = await invoke<number>("prepare_live_http", { request }).finally(() => {
    if (timings) timings.bridgePrepareMs = performance.now() - prepareStarted;
  });
  const cancel = () => { void invoke("cancel_live_http", { rid }).catch(() => {}); };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    if (signal?.aborted) throw new Error("cancelled");
    const executeStarted = performance.now();
    const result = await invoke<{ status: number; body: string; headersMs: number; bodyMs: number; localPort?: number | null }>("execute_live_http", { rid }).finally(() => {
      if (timings) timings.bridgeExecuteMs = performance.now() - executeStarted;
    });
    if (timings) {
      timings.responseWaitMs = result.headersMs;
      timings.responseReadMs = result.bodyMs;
      if (result.localPort != null) timings.connectionPort = result.localPort;
    }
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
  timings?: Record<string, number>,
) {
  const started = performance.now();
  const encoded = new Request("https://api.live.bilibili.com/msg/send", { method: "POST", body: form });
  const body = Array.from(new Uint8Array(await encoded.arrayBuffer()));
  if (timings) timings.encodingMs = performance.now() - started;
  return liveHttp({ kind: "send", query, headers: { ...headers, "content-type": encoded.headers.get("content-type")! }, body }, signal, timings);
}
