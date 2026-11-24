import { invoke } from '@tauri-apps/api/core';
import { load as loadStore, type Store } from '@tauri-apps/plugin-store';
export type { Store } from '@tauri-apps/plugin-store';
let directory: Promise<string> | undefined;
export async function appDataFile(name: string): Promise<string> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return name;
  directory ??= invoke<string>('get_app_data_directory');
  return `${await directory}/${name}`;
}
export async function load(path: string, options?: Parameters<typeof loadStore>[1]): Promise<Store> {
  return loadStore(await appDataFile(path), options);
}

export async function createAppWindow(label: string, options: ConstructorParameters<typeof import('@tauri-apps/api/webviewWindow').WebviewWindow>[1]) {
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  await invoke('create_app_window', { options: { ...options, label } });
  const window = await WebviewWindow.getByLabel(label);
  if (!window) throw new Error('窗口创建失败，请重试');
  return window;
}
