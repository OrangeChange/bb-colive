import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

test('应用诊断快照保留三个状态维度、新停止原因与质量集合及旧原因', async () => {
  const archive = { archiveId: 'archive', sessionId: 'session', status: 'unclean', recordingStatus: 'reconnecting', quality: 'incomplete', stopReason: 'connection-error', qualityReasons: ['connection-error', 'app-exit'], qualityReason: 'previous-runtime', nextOrdinal: 3 };
  globalThis.__archiveSnapshotPorts = { archive };
  const portSources = {
    '@tauri-apps/api/core': 'export const invoke = async () => ({ webview: "fixture" });',
    '@tauri-apps/api/window': 'export const getCurrentWindow = () => ({ outerPosition: async () => null, innerSize: async () => null, scaleFactor: async () => 1, isMaximized: async () => false }); export const currentMonitor = async () => null; export const availableMonitors = async () => [];',
    '@tauri-apps/api/app': 'export const getVersion = async () => "fixture";',
    '../voice/voiceRuntime.ts': 'export const listAudioDevices = async () => [];',
    '../voice/voiceSettings': 'export const useVoiceSettings = { getState: () => ({ personalBroadcast: { rules: {} }, customHttp: {}, fishAudio: { referenceId: "", referenceVoices: [] } }) };',
    '../generalSettings.ts': 'export const useGeneralSettings = { getState: () => ({}) };',
    '../stores/connection': 'export const useConnection = { getState: () => ({ state: { status: "reconnecting", roomId: 101 }, sessions: {} }) };',
    '../stores/liveSession': 'export const getLiveSession = () => ({ archive: globalThis.__archiveSnapshotPorts.archive });',
    '../archive/archiveRuntime.ts': 'export const getArchiveWriterStatus = () => ({ pending: 0, failed: 0 });',
  };
  const server = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-archiveApplicationSnapshot.test.mjs", root: fileURLToPath(new URL('../', import.meta.url)), configFile: false, server: {watch:null, middlewareMode: true, hmr: false }, optimizeDeps: {include:[], noDiscovery: true, entries: [] }, ssr: { noExternal: ['@tauri-apps/api'] }, define: { __DANMU_BUILD_ID__: '"fixture"' }, plugins: [{
    name: 'archive-snapshot-ports', enforce: 'pre',
    resolveId(id, importer) { if (importer?.endsWith('/diagnostics/applicationSnapshot.ts') && id in portSources) return `\0snapshot:${id}`; },
    load(id) { if (id.startsWith('\0snapshot:')) return portSources[id.slice(10)]; },
  }] });
  try {
    const { collectApplicationDiagnosticSnapshot } = await server.ssrLoadModule('/src/diagnostics/applicationSnapshot.ts');
    const snapshot = await collectApplicationDiagnosticSnapshot({ archiveRepository: null, sceneSettings: {}, abnormalExit: false, windows: {} });
    assert.deepEqual(snapshot.archive.session, { archiveId: 'archive', sessionId: 'session', status: 'unclean', recordingStatus: 'reconnecting', quality: 'incomplete', stopReason: 'connection-error', qualityReasons: ['connection-error', 'app-exit'], qualityReason: 'previous-runtime', eventCount: 3 });
  } finally { await server.close(); delete globalThis.__archiveSnapshotPorts; }
});
