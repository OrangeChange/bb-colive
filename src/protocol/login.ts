/**
 * 登录会话管理：cookie 缓存（tauri-plugin-store，文件 cookies.local.json，已被 .gitignore 排除）
 * + web 扫码登录流程（poll set-cookie -> SESSDATA，crossDomain fallback）
 *
 * 移植自 webview_verify/src/main.js 的 qrLogin，改为可取消、带状态回调的形态供 UI 使用。
 */
import { load, type Store } from '../appData.ts'
import { fetch } from '@tauri-apps/plugin-http'
import {
  getNav, qrGenerate, qrPoll, BILI_HEADERS,
  parseCookiesFromSetCookie, cookieStrFromSetCookie,
} from './api'
import { recordFeatureDiagnostic } from '../diagnostics/featureDiagnostics.ts'

const COOKIE_STORE_FILE = 'cookies.local.json' // .gitignore: *.local.json

export interface Session {
  cookie: string        // 完整 Cookie 串
  refreshToken: string
  mid: string           // uid
  uname: string
  face?: string
  /** cookie 获取时间（ms），用于失效提示 */
  savedAt: number
}

export type SessionRestoreResult =
  | { kind: 'restored'; session: Session; nav: Awaited<ReturnType<typeof getNav>> }
  | { kind: 'missing' }
  | { kind: 'invalid' }
  | { kind: 'unavailable'; session: Session }

export type QrStatus =
  | { kind: 'pending' }                                  // 86101 待扫码
  | { kind: 'scanned' }                                  // 86090 已扫码待确认
  | { kind: 'expired' }                                  // 86038 过期
  | { kind: 'success' }                                  // 0 已成功（UI 过渡反馈用）

// ============ cookie 缓存 ============

async function openCookieStore(): Promise<Store> {
  return load(COOKIE_STORE_FILE, { autoSave: false })
}

/** 读取缓存会话（不存在返回 null） */
export async function loadSession(): Promise<Session | null> {
  try {
    const store = await openCookieStore()
    const session = await store.get<Session>('session')
    return session ?? null
  } catch {
    recordFeatureDiagnostic({
      featureId: 'session',
      stage: 'failure',
      action: 'session-store-read',
      outcome: 'failed',
    })
    return null
  }
}

export async function saveSession(session: Session): Promise<void> {
  const store = await openCookieStore()
  await store.set('session', session)
  await store.save()
}

export async function clearSession(): Promise<void> {
  try {
    const store = await openCookieStore()
    await store.delete('session')
    await store.save()
  } catch {
    // 文件不存在等情况忽略
  }
}

/**
 * 验证 cookie 是否仍有效。有效则返回 nav 数据，否则 null（调用方应引导重新扫码）。
 * 同时会校验 mid 是否与缓存一致（防串号）。
 */
export async function validateSession(session: Session) {
  const nav = await getNav(session.cookie)
  if (nav.isLogin && String(nav.mid) === session.mid) {
    return { nav, session }
  }
  return null
}

export async function resolveCachedSession(
  cached: Session | null,
  validate: (session: Session) => ReturnType<typeof validateSession> = validateSession,
): Promise<SessionRestoreResult> {
  if (!cached) return { kind: 'missing' }
  try {
    const verified = await validate(cached)
    return verified
      ? { kind: 'restored', session: verified.session, nav: verified.nav }
      : { kind: 'invalid' }
  } catch {
    recordFeatureDiagnostic({
      featureId: 'session',
      stage: 'failure',
      action: 'session-validation',
      outcome: 'unavailable',
    })
    return { kind: 'unavailable', session: cached }
  }
}

/** 启动时取会话，并区分缓存缺失、明确失效和暂时无法验证。 */
export async function restoreSession(): Promise<SessionRestoreResult> {
  recordFeatureDiagnostic({ featureId: 'session', stage: 'request', action: 'session-restore', outcome: 'requested' })
  const cached = await loadSession()
  const result = await resolveCachedSession(cached)
  recordFeatureDiagnostic({
    featureId: 'session',
    stage: 'success',
    action: 'session-restore',
    outcome: result.kind,
  })
  return result
}

// ============ 扫码登录 ============

export interface QrLoginOptions {
  /** 二维码内容回调（UI 渲染二维码） */
  onQrUrl: (url: string) => void
  /** 状态回调（待扫码/已扫码/过期） */
  onStatus?: (s: QrStatus) => void
  /** 轮询间隔，默认 2s */
  intervalMs?: number
  /** 取消信号 */
  signal?: AbortSignal
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    // 关键：signal 已中止时 addEventListener('abort') 永远不触发，必须入口即判
    if (signal?.aborted) {
      reject(signal.reason ?? new Error('aborted'))
      return
    }
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason ?? new Error('aborted')) }, { once: true })
  })

/** signal 已中止则抛出（用于异步步骤之间的检查点） */
const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw signal.reason ?? new Error('aborted')
}

/**
 * web 扫码登录全流程。成功后不自动 saveSession，由调用方决定（通常立即保存）。
 * @throws 二维码过期 / 未取到 SESSDATA / 被取消
 */
export async function qrLogin(opts: QrLoginOptions): Promise<Session> {
  const { onQrUrl, onStatus, intervalMs = 2000, signal } = opts
  const requestId = `session-qr-${Date.now()}`
  recordFeatureDiagnostic({ featureId: 'session', stage: 'request', action: 'qr-login', outcome: 'started', requestId })

  let gen: Awaited<ReturnType<typeof qrGenerate>>
  try {
    gen = await qrGenerate()
  } catch {
    recordFeatureDiagnostic({ featureId: 'session', stage: 'failure', action: 'qr-login', outcome: 'generate-failed', requestId })
    throw new Error('无法生成登录二维码，请检查网络后重试')
  }
  throwIfAborted(signal) // 生成二维码期间被取消（StrictMode 双调用）：不再回调，避免覆盖界面
  onQrUrl(gen.url)

  while (true) {
    await sleep(intervalMs, signal)
    const { poll, setCookies } = await qrPoll(gen.qrcode_key)
    const code = poll.code

    if (code === 0) {
      // 1. poll 响应 set-cookie 直接解出 SESSDATA（正常路径）
      let cookies = parseCookiesFromSetCookie(setCookies)
      let cookieStr = cookieStrFromSetCookie(setCookies)

      // 2. webview 下可能拿不到 set-cookie -> crossDomain 回跳 fallback
      if (!cookies.SESSDATA && poll.url) {
        const cdResp = await fetch(poll.url, { headers: BILI_HEADERS, redirect: 'manual' }).catch(() => null)
        if (cdResp) {
          const cdArr = (cdResp as any).headers?.getSetCookie?.()
            ?? (() => {
              const sc = (cdResp as any).headers?.get?.('set-cookie')
              return sc ? sc.split(/,(?=\s*[^ ;,]+=[^;]+)/g) : []
            })()
          const cdCookies = parseCookiesFromSetCookie(cdArr)
          if (cdCookies.SESSDATA) {
            cookies = cdCookies
            cookieStr = cookieStrFromSetCookie(cdArr)
          }
        }
      }

      if (!cookies.SESSDATA) {
        throw new Error('登录成功但未拿到 SESSDATA，请重试')
      }

      let nav: Awaited<ReturnType<typeof getNav>>
      try {
        nav = await getNav(cookieStr)
      } catch {
        recordFeatureDiagnostic({ featureId: 'session', stage: 'failure', action: 'qr-login', outcome: 'nav-failed', requestId })
        throw new Error('登录成功但无法确认登录状态，请重试')
      }
      if (!nav.isLogin) throw new Error('登录态异常：nav 显示未登录')

      recordFeatureDiagnostic({ featureId: 'session', stage: 'success', action: 'qr-login', outcome: 'logged-in', requestId })
      return {
        cookie: cookieStr,
        refreshToken: poll.refresh_token ?? '',
        mid: cookies.DedeUserID ?? String(nav.mid),
        uname: nav.uname,
        face: nav.face,
        savedAt: Date.now(),
      }
    } else if (code === 86090) {
      onStatus?.({ kind: 'scanned' })
    } else if (code === 86038) {
      onStatus?.({ kind: 'expired' })
      recordFeatureDiagnostic({ featureId: 'session', stage: 'request', action: 'qr-login', outcome: 'expired-retry', requestId })
      throw new Error('二维码已过期，请重新生成')
    } else {
      onStatus?.({ kind: 'pending' })
    }
  }
}
