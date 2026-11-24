import { uiText, UiMessageError } from "../i18n/index.ts";
/**
 * 登录会话状态：启动恢复 -> 未登录时扫码（过期自动重扫，ui-design §七）-> 登录态
 */
import { create } from "zustand";
import {
  restoreSession,
  saveSession,
  clearSession,
  qrLogin,
  type Session,
  type QrStatus,
} from "../protocol";
import { recordFeatureDiagnostic } from "../diagnostics/featureDiagnostics.ts";

export type SessionPhase = "restoring" | "restoreUnavailable" | "loggedOut" | "loggingIn" | "loggedIn";

/** 登录成功后在扫码页停留的过渡时长（展示“登录成功”反馈） */
const SUCCESS_TRANSITION_MS = 800;

interface SessionState {
  phase: SessionPhase;
  session: Session | null;
  /** 当前二维码内容（LoginCard 渲染用） */
  qrUrl: string | null;
  qrStatus: QrStatus | null;
  error: string | null;
  restore: () => Promise<void>;
  /** 开始扫码登录；内部循环直至成功/被取消，二维码过期自动重新生成 */
  startLogin: () => void;
  logout: () => Promise<void>;
}

/** 模块级取消信号（登录循环与组件生命周期解耦） */
let loginAbort: AbortController | null = null;

export const useSession = create<SessionState>((set, get) => ({
  phase: "restoring",
  session: null,
  qrUrl: null,
  qrStatus: null,
  error: null,

  restore: async () => {
    set({ phase: "restoring", error: null });
    const result = await restoreSession();
    if (result.kind === "restored") {
      set({ phase: "loggedIn", session: result.session, error: null });
      recordFeatureDiagnostic({ featureId: "session", stage: "success", action: "session-state", outcome: "logged-in" });
    } else if (result.kind === "unavailable") {
      set({
        phase: "restoreUnavailable",
        session: result.session,
        error: uiText("session.useSession.restore.error"),
      });
      recordFeatureDiagnostic({ featureId: "session", stage: "failure", action: "session-state", outcome: "restore-unavailable" });
    } else {
      set({ phase: "loggedOut", session: null, error: null });
      recordFeatureDiagnostic({ featureId: "session", stage: "success", action: "session-state", outcome: "logged-out" });
    }
  },

  startLogin: () => {
    loginAbort?.abort();
    const abort = new AbortController();
    loginAbort = abort;
    recordFeatureDiagnostic({ featureId: "session", stage: "request", action: "login-ui", outcome: "started" });
    set({ phase: "loggingIn", qrStatus: { kind: "pending" }, error: null, qrUrl: null });

    const loop = async () => {
      while (get().phase === "loggingIn" && !abort.signal.aborted) {
        try {
          const session = await qrLogin({
            onQrUrl: (url) => set({ qrUrl: url }),
            onStatus: (s) => set({ qrStatus: s }),
            signal: abort.signal,
          });
          // 登录成功即无条件生效：StrictMode 双调用下两个循环谁先成功都算数，
          // 不因自身 signal 被后来的 startLogin 中止而丢弃已完成的登录
          await saveSession(session);
          set({ qrStatus: { kind: "success" }, error: null });
          await new Promise((r) => setTimeout(r, SUCCESS_TRANSITION_MS));
          // 过渡期间被取代（如另一循环已置 loggedIn / 用户已登出）则不覆盖
          if (get().phase === "loggingIn") {
            set({ phase: "loggedIn", session, qrUrl: null, qrStatus: null, error: null });
            recordFeatureDiagnostic({ featureId: "session", stage: "success", action: "login-ui", outcome: "logged-in" });
          }
          return;
        } catch (e) {
          if (abort.signal.aborted) {
            recordFeatureDiagnostic({ featureId: "session", stage: "cancel", action: "login-ui", outcome: "aborted" });
            return;
          }
          const msg = e instanceof Error ? e.message : String(e);
          if (e instanceof UiMessageError && e.messageKey === "login.qrLogin5") {
            // 二维码过期不打断：重新生成（qrLogin 内部会再次 qrGenerate）
            continue;
          }
          // 网络等其他错误：提示并 2s 后重试，避免死循环空转
          recordFeatureDiagnostic({ featureId: "session", stage: "failure", action: "login-ui", outcome: "retryable-failure" });
          set({ error: msg });
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    };
    void loop();
  },

  logout: async () => {
    loginAbort?.abort();
    loginAbort = null;
    recordFeatureDiagnostic({ featureId: "session", stage: "request", action: "logout", outcome: "started" });
    try {
      await clearSession();
      set({ phase: "loggedOut", session: null, qrUrl: null, qrStatus: null, error: null });
      recordFeatureDiagnostic({ featureId: "session", stage: "success", action: "logout", outcome: "logged-out" });
    } catch {
      recordFeatureDiagnostic({ featureId: "session", stage: "failure", action: "logout", outcome: "failed" });
      throw new Error(uiText("session.useSession.logout"));
    }
  },
}));
