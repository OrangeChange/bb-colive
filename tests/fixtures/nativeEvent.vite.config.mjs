import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vite';
import productionConfig from '../../vite.config.ts';

const ports = fileURLToPath(new URL('../helpers/nativeEventBrowserPorts.ts', import.meta.url));
export default defineConfig(async env => mergeConfig(await productionConfig(env), {
  cacheDir: 'node_modules/.vite-native-events',
  optimizeDeps: { entries: ['tests/fixtures/nativeEvent*.html'] },
  resolve: { alias: Object.fromEntries(['@tauri-apps/api/core', '@tauri-apps/api/event', '@tauri-apps/api/window', '@tauri-apps/plugin-store'].map(name => [name, ports])) },
}));
