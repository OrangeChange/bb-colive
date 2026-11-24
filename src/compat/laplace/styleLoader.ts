import {invoke} from "@tauri-apps/api/core";
import {parseThemeCssMetadata} from "../../themes/themeCssMetadata.ts";
import { MAX_CSS_LENGTH, prependRemoteHistory, type RemoteTemplateHistoryEntry, type RemoteTemplateMetadata } from './styles.ts';
import { isTauri } from '@tauri-apps/api/core';
import { fetch as nativeFetch } from '@tauri-apps/plugin-http';
export const REMOTE_CSS_PREPROCESS_ENDPOINT = 'https://edge-workers.laplace.cn/laplace/css-preprocess-v2';
export const LAPLACE_TEMPLATE_HASHES: Readonly<Record<string, string>> = {
  "blank": "2efca64ee13fe93c7772eab9c5d566d1252e0b726311f63c1bf735bf12e45c42",
  "bubble-next": "4f0a6c221c759448dff4bddbb314e50b71d5a8362c1e5c6f7b1ff54fe14ce1a6",
  "bubble-rhea": "e08a63bf433466c9f2c119c7d001693dad626078c81a6c479990d7f322887fe0",
  "bubble-snow": "3be573186a911c80189318bc45e2d78b133b9eabacdd6fc6198b7c878e4fbf22",
  "bubble": "41e8ae15c59ff3cf27c9139ba168299d1fe7366a90bf6d21fff6bf9d01126f97",
  "collab": "7d87f80f1e352f51ea0f21f3ed4540f2d429aac3e324421dae48380d862cee16",
  "modern": "5e6027e38567907f17dcda74ae3d2e1e672fe9b40a9e6d851e1efe0cab0d4865",
  "orange-block": "de7dfda6847c7faeb70dcc31b8caa93e57dbb2769f06567be04d7cfad18002dc",
  "orange": "182caa251167fd4f2abb4e54f6370b056220562394930fc5eecd6eb5f9132c4d",
  "outline": "d1bb2be2fcc3fc26d7e3200b8358e6f31ded5b15ace969c49486bbb0534d6a66",
  "rotated": "e2bfe567ac854a142ff23c853fd88ca448a78d21ff52b4ec64d5ba5f0d6c151a",
  "shed-bubble": "5b42a1276ef4dec77206e86edff1aeb438aa41d42ee2c99601f0e2a0b3de0326",
  "shed": "0fe02cb2bc2ade2ab3e2594c5eeae398d547eb8d8de401f30e5195aab426edb4",
  "simple": "fe9c22b3a626d960324fb9bedaf4a87300c8fa0d735a248f7ac7b30bafa85403",
  "zelda": "23385098d7765fac2fdb16f540f35eac527cd999cd8c55b47a8543b25ae721c7"
};
export const LAPLACE_TEMPLATE_OPTIONS = [
  { value: '', label: '不使用内置模板', group: '内置模板' },
  { value: 'bubble', label: 'LAPLACE 气泡 × 明前奶绿', group: '内置模板' },
  { value: 'bubble-next', label: 'LAPLACE 气泡 Next × 明前奶绿', group: '内置模板' },
  { value: 'bubble-rhea', label: '紫色气泡 × 瑞娅 Rhea', group: '内置模板' },
  { value: 'outline', label: '极简描边 × 岁己 SUI', group: '内置模板' },
  { value: 'zelda', label: '奇幻', group: '内置模板' },
  { value: 'simple', label: '简约气泡（复刻）', group: '内置模板' },
  { value: 'modern', label: '摩登样式（复刻）', group: '内置模板' },
  { value: 'collab', label: '联动气泡', group: '内置模板' },
  { value: 'rotated', label: '反转了！', group: '内置模板' },
  { value: 'orange', label: '橙子气泡', group: '第三方模板' },
  { value: 'shed', label: 'SHED 气泡', group: '第三方模板' },
  { value: 'shed-bubble', label: 'SHED 透明波动', group: '第三方模板' },
  { value: 'orange-block', label: '橙子色块', group: '第三方模板' },
] as const;
export const CURATED_REMOTE_TEMPLATES = [
  { url: 'https://pub-d4d706263dfc409fb4c0991a6f6ba4f1.r2.dev/gradient_chat/normal.css', title: '渐变弹幕' },
  { url: 'https://rsrc.laplace.cn/assets/bubble-snow.css', title: '雪色气泡' },
  { url: 'https://rsrc.laplace.cn/assets/subspace-glitch.css', title: '子空间故障' },
  { url: 'https://rsrc.laplace.cn/assets/wechat-bubbles.css', title: '微信气泡' },
] as const;
export type CssFetch = (input: string, init?: RequestInit) => Promise<Response>;
export function remoteCssRequestUrl(url: string): string { return `${REMOTE_CSS_PREPROCESS_ENDPOINT}?url=${encodeURIComponent(url)}`; }
function validateCss(css: unknown): asserts css is string {
  if (typeof css !== 'string') throw new Error('模板服务未返回 CSS 文本');
  if (css.length > MAX_CSS_LENGTH) throw new Error('CSS 超过隔离预览的安全大小限制');
  if (/^\s*(?:<!doctype\s+html|<html\b)/i.test(css)) throw new Error('收到网页而不是 CSS，请检查模板地址');
}
/** Inspect remote response trivia only; leave browser-tolerated CSS and returned bytes intact. */
function rejectRemoteHtmlPage(css: string): void {
  let offset = 0;
  // validateCss has already bounded the input. Advance monotonically, never skip an open comment.
  while (offset < css.length) {
    if (/\s/.test(css[offset])) { offset++; continue; }
    if (!css.startsWith('/*', offset)) break;
    const end = css.indexOf('*/', offset + 2);
    if (end === -1) break;
    offset = end + 2;
  }
  if (/^(?:<!doctype\s+html|<html\b)/i.test(css.slice(offset))) throw new Error('收到网页而不是 CSS，请检查模板地址');
}
export async function loadBuiltinCss(name: string, fetcher: CssFetch = fetch, signal?: AbortSignal): Promise<string> {
  if (!name.trim()) return '';
  // Deliberately look up the original input, not its trimmed version (upstream contract).
  if (!Object.prototype.hasOwnProperty.call(LAPLACE_TEMPLATE_HASHES, name)) throw new Error(`未知内置模板：${name}`);
  const response = await fetcher(`/laplace/templates/${name}.css`, { signal });
  if (!response.ok) throw new Error(`内置模板载入失败（HTTP ${response.status}）`);
  const css = await response.text(); validateCss(css);
  if (globalThis.crypto?.subtle) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(css));
    const hash = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
    if (hash !== LAPLACE_TEMPLATE_HASHES[name]) throw new Error('内置模板字节校验失败，请重新构建 LAPLACE 资源');
  }
  return css;
}
export interface RemoteCssResult { css: string; metadata: RemoteTemplateMetadata | null; requestUrl: string; finalUrl?: string }
export async function loadRemoteCss(url: string, fetcher?: CssFetch, signal?: AbortSignal, refresh=false): Promise<RemoteCssResult> {
  const requestUrl = remoteCssRequestUrl(url);
  if (!fetcher && isTauri()) {
    const result = await invoke<{text:string;finalUrl:string}>("load_theme_resource", {url,refresh,css:true});
    if (signal?.aborted) throw new Error("网址主题载入已取消");
    validateCss(result.text); rejectRemoteHtmlPage(result.text);
    return {css:result.text,metadata:{...parseThemeCssMetadata(result.text)},requestUrl:url,finalUrl:result.finalUrl};
  }
  const response = fetcher ? await fetcher(requestUrl, { signal })
    : isTauri() ? await nativeFetch(requestUrl, { signal, maxRedirections: 0 })
    : await fetch(requestUrl, { signal });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`远程模板预处理失败（HTTP ${response.status}）`);
  }
  const value: unknown = await response.json();
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('模板服务返回格式无效');
  const result = value as Record<string, unknown>;
  if (!result.success) throw new Error(typeof result.error === 'string' ? result.error : '远程模板预处理失败');
  validateCss(result.css);
  rejectRemoteHtmlPage(result.css);
  const metadata = result.metadata && typeof result.metadata === 'object' && !Array.isArray(result.metadata) ? result.metadata as RemoteTemplateMetadata : null;
  return { css: result.css, metadata, requestUrl };
}
export interface StyleLoaderSnapshot {
  cloud: string; remote: string; cloudName: string; remoteUrl: string;
  cloudLoading: boolean; remoteLoading: boolean; cloudError: string; remoteError: string;
  remoteRequestUrl: string; history: RemoteTemplateHistoryEntry[];
}
/** Per-source generations prevent stale success/failure/clear races. Failures keep last successful CSS. */
export class LaplaceStyleLoader {
  private snapshot: StyleLoaderSnapshot;
  private listeners = new Set<() => void>();
  private cloudGeneration = 0;
  private remoteGeneration = 0;
  private cloudAbort?: AbortController;
  private remoteAbort?: AbortController;
  private fetcher?: CssFetch;
  constructor(fetcher?: CssFetch, history: RemoteTemplateHistoryEntry[] = []) {
    this.fetcher = fetcher;
    this.snapshot = { cloud: '', remote: '', cloudName: '', remoteUrl: '', cloudLoading: false, remoteLoading: false, cloudError: '', remoteError: '', remoteRequestUrl: '', history };
  }
  getSnapshot = (): StyleLoaderSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  private update(patch: Partial<StyleLoaderSnapshot>): void { this.snapshot = { ...this.snapshot, ...patch }; this.listeners.forEach(listener => listener()); }
  async loadCloud(name: string): Promise<string | null> {
    const generation = ++this.cloudGeneration; this.cloudAbort?.abort();
    const controller = this.cloudAbort = new AbortController();
    this.update({ cloudLoading: Boolean(name.trim()), cloudError: '' });
    try {
      const css = await loadBuiltinCss(name, this.fetcher, controller.signal);
      if (generation !== this.cloudGeneration) return null;
      this.update({ cloud: css, cloudName: name.trim() ? name : '', cloudLoading: false }); return css;
    } catch (error) {
      if (generation === this.cloudGeneration) this.update({ cloudLoading: false, cloudError: `${error instanceof Error ? error.message : '内置模板载入失败'}。已保留最后成功的内置样式，请重试。` });
      return null;
    }
  }
  async loadRemote(url: string | undefined): Promise<RemoteCssResult | null> {
    const generation = ++this.remoteGeneration; this.remoteAbort?.abort();
    const controller = this.remoteAbort = new AbortController();
    if (!url) { this.update({ remote: '', remoteUrl: '', remoteLoading: false, remoteError: '', remoteRequestUrl: '' }); return { css: '', metadata: null, requestUrl: '' }; }
    this.update({ remoteLoading: true, remoteError: '', remoteRequestUrl: remoteCssRequestUrl(url) });
    try {
      const result = await loadRemoteCss(url, this.fetcher, controller.signal);
      if (generation !== this.remoteGeneration) return null;
      this.update({ remote: result.css, remoteUrl: url, remoteLoading: false, history: prependRemoteHistory(this.snapshot.history, { url, metadata: result.metadata }) }); return result;
    } catch (error) {
      if (generation === this.remoteGeneration) this.update({ remoteLoading: false, remoteError: `${error instanceof Error ? error.message : '远程模板载入失败'}。已保留最后成功的远程样式，请检查地址或重试。` });
      return null;
    } finally {
      if (this.remoteAbort === controller) this.remoteAbort = undefined;
    }
  }
  cancelPendingRemote(): void { this.remoteGeneration++; this.remoteAbort?.abort(); this.update({ remoteLoading: false }); }
  removeHistory(url: string): void { this.update({ history: this.snapshot.history.filter(item => item.url !== url) }); }
  dispose(): void { this.cloudGeneration++; this.remoteGeneration++; this.cloudAbort?.abort(); this.remoteAbort?.abort(); this.listeners.clear(); }
}
