import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import { useCallback, useEffect, useState } from "react";

export function useCompatibleFrameLoad() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (ready) return;
    const timer = window.setTimeout(() => setError(uiText("compatibleFrameStatus.useCompatibleFrameLoad.timer")), 8000);
    return () => window.clearTimeout(timer);
  }, [ready, attempt]);
  const retry = useCallback(() => {
    setReady(false); setError(null); setAttempt(value => value + 1);
  }, []);
  const loaded = useCallback(() => { setReady(true); setError(null); }, []);
  return { ready, setReady, error, setError, attempt, retry, loaded };
}

export function CompatibleFrameStatus({ ready, error, onRetry }: { ready: boolean; error: string | null; onRetry(): void }) {
  useUiLanguage();
  if (ready && !error) return null;
  return <div className="compatible-frame-status" role={error ? "alert" : "status"}>
    <span>{error || uiText("compatibleFrameStatus.CompatibleFrameStatus")}</span>
    {error && <button type="button" className="native-preview-open-button" onClick={onRetry}>{uiText("common.retry")}</button>}
  </div>;
}
