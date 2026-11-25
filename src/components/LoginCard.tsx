import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
/**
 * 扫码登录卡片：二维码 + 状态反馈（待扫码/已扫码/过期自动刷新/成功过渡，ui-design §七）
 * 挂载即启动登录循环（过期自动重扫在 session store 内处理）。
 */
import { useEffect, useRef } from "react";
import QRCode from "qrcode";
import { useSession } from "../stores/session";
import { DriftBackground } from "./DriftBackground";

function QrCanvas({ url, dimmed }: { url: string | null; dimmed?: boolean }) {
  useUiLanguage();
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!url || !ref.current) return;
    // 二维码保持黑白高对比，不随主题变（扫码识别优先）
    QRCode.toCanvas(ref.current, url, {
      width: 184,
      margin: 1,
      color: { dark: "#000000ff", light: "#ffffffff" },
    }).catch(() => {});
  }, [url]);

  return (
    <div className={`rounded-lg border border-line bg-white p-2 transition-opacity ${dimmed ? "opacity-30" : ""}`}>
      <canvas ref={ref} width={184} height={184} className="block" role="img" aria-label={url ? uiText("loginCard.aria_label") : uiText("loginCard.aria_label2")} />
    </div>
  );
}

export function SessionUnavailablePanel({ message, onRetry, onRelogin }: {
  message: string;
  onRetry: () => void;
  onRelogin: () => void;
}) {
  useUiLanguage();
  return <>
    <h1 className="ui-type-display font-display font-medium tracking-tight text-t1">BB CoLive</h1>
    <p className="ui-type-control text-t3">{uiText("loginCard.SessionUnavailablePanel")}</p>
    <p className="ui-type-control text-danger">{message}</p>
    <div className="flex items-center gap-2">
      <button type="button" className="rounded-lg bg-accent-solid px-4 py-2 ui-type-control font-medium text-accent-fg" onClick={onRetry}>{uiText("common.retry")}</button>
      <button type="button" className="rounded-lg border border-line bg-bg px-4 py-2 ui-type-control text-t2" onClick={onRelogin}>{uiText("loginCard.SessionUnavailablePanel2")}</button>
    </div>
  </>;
}

export function LoginScreen() {
  useUiLanguage();
  const phase = useSession((s) => s.phase);
  const qrUrl = useSession((s) => s.qrUrl);
  const qrStatus = useSession((s) => s.qrStatus);
  const error = useSession((s) => s.error);
  const startLogin = useSession((s) => s.startLogin);
  const restore = useSession((s) => s.restore);

  useEffect(() => {
    if (phase === "loggedOut") startLogin();
  }, [phase, startLogin]);

  const success = qrStatus?.kind === "success";
  const restoreUnavailable = phase === "restoreUnavailable";
  const statusText =
    success
      ? uiText("loginCard.LoginScreen.statusText")
      : error ??
        (qrStatus?.kind === "scanned"
          ? uiText("loginCard.LoginScreen.statusText2")
          : qrStatus?.kind === "expired"
            ? uiText("loginCard.LoginScreen.statusText3")
            : !qrUrl ? uiText("loginCard.LoginScreen.statusText4") : uiText("loginCard.LoginScreen.statusText5"));

  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center bg-bg">
      <DriftBackground />
      <div className="relative flex flex-col items-center gap-4 rounded-2xl border border-line bg-surface px-10 py-8 shadow-sm">
        {restoreUnavailable ? <SessionUnavailablePanel message={error ?? uiText("loginCard.message")} onRetry={() => void restore()} onRelogin={startLogin} /> : <>
          <h1 className="ui-type-display font-display font-medium tracking-tight text-t1">BB CoLive</h1>
          <p className="ui-type-control text-t3">{uiText("loginCard.LoginScreen")}</p>
          {qrUrl ? <QrCanvas url={qrUrl} dimmed={success} /> : <div className="flex size-[202px] items-center justify-center rounded-lg border border-line bg-bg ui-type-control text-t3" aria-busy={!error}>{uiText("loginCard.LoginScreen2")}{error ? uiText("loginCard.LoginScreen3") : uiText("loginCard.LoginScreen4")}</div>}
          <p role="status" className={`ui-type-control ${success ? "font-medium text-success" : error ? "text-danger" : qrStatus?.kind === "scanned" ? "text-success" : "text-t2"}`}>{statusText}</p>
        </>}
      </div>
    </div>
  );
}
