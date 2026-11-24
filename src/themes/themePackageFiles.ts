import { invoke } from '@tauri-apps/api/core';

export async function readThemePackageFile(path: string): Promise<Uint8Array> {
  return new Uint8Array(await invoke<ArrayBuffer>('read_theme_package_raw', {path}));
}

export function writeThemePackageFile(path: string, bytes: Uint8Array): Promise<void> {
  const encodedPath = btoa(Array.from(new TextEncoder().encode(path), byte => String.fromCharCode(byte)).join(''));
  return invoke('write_theme_package_raw', bytes, {headers: {'x-theme-path': encodedPath}});
}
