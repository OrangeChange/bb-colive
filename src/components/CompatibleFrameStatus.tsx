import { useCallback, useEffect, useState } from "react";

export function useCompatibleFrameLoad() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (ready) return;
    const timer = window.setTimeout(() => setError("样式预览加载失败，请重试"), 8000);
    return () => window.clearTimeout(timer);
  }, [ready, attempt]);
  const retry = useCallback(() => {
    setReady(false); setError(null); setAttempt(value => value + 1);
  }, []);
  const loaded = useCallback(() => { setReady(true); setError(null); }, []);
  return { ready, setReady, error, setError, attempt, retry, loaded };
}

export function CompatibleFrameStatus({ ready, error, onRetry }: { ready: boolean; error: string | null; onRetry(): void }) {
  if (ready && !error) return null;
  return <div className="compatible-frame-status" role={error ? "alert" : "status"}>
    <span>{error || "正在加载样式预览…"}</span>
    {error && <button type="button" className="native-preview-open-button" onClick={onRetry}>重试</button>}
  </div>;
}
