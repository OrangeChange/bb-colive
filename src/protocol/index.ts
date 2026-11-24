/**
 * 协议层统一出口（只在主窗口 import；弹幕窗/礼物窗走 Tauri event）
 */
export * from './types'
export * from './api'
export * from './giftEffects'
export * from './login'
export { adapt, wireToModelGuard } from './adapter'
export { DanmuConnection } from './connection'
export type { ConnectParams, ConnectionCallbacks, ConnectionRuntimeDiagnostic, AnchorInfo } from './connection'
export * from './laplaceCompatibility'
export * from './anchors'
export * from './guardIdentityIcons'
export { loadGiftConfig, getGiftIcon } from './gifts'
export type { GiftIconInfo } from './gifts'
