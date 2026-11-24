import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, evidenceFile } from './config.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { startFixture } from './obs-browserfixture.mjs';
const execute = promisify(execFile);
const fixture = await startFixture();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 960, height: 800 } });
const errors = [], resourceRequests = [], frames = [];
let before, after, delta, failure;
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (/\/gift-effects\/|\/upstream\//.test(request.url())) resourceRequests.push(request.url()); });
page.on('websocket', socket => socket.on('framereceived', frame => {
  const value = JSON.parse(String(frame.payload)); frames.push({ type: value.type, sequence: value.sequence });
}));
await page.addInitScript(() => {
  const counts = window.__obsIdle = { canvasCreated: 0, videoCreated: 0 };
  const create = Document.prototype.createElement;
  Document.prototype.createElement = function(...args) {
    const element = create.apply(this, args);
    if (String(args[0]).toLowerCase() === 'canvas') counts.canvasCreated++;
    if (String(args[0]).toLowerCase() === 'video') counts.videoCreated++;
    return element;
  };
});
const cdp = await page.context().newCDPSession(page);
const browserCdp = await browser.newBrowserCDPSession();
await cdp.send('Performance.enable');
await cdp.send('Profiler.enable');
await cdp.send('Profiler.startPreciseCoverage', { callCount: true, detailed: false });
async function snapshot() {
  const processInfo = await browserCdp.send('SystemInfo.getProcessInfo');
  const ids = processInfo.processInfo.map(item => item.id).filter(id => id > 0);
  const command = `$ErrorActionPreference='Stop'; @(Get-Process -Id ${ids.join(',')} | Select-Object Id,ProcessName,CPU,WorkingSet64,PrivateMemorySize64) | ConvertTo-Json -Compress`;
  const { stdout } = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true });
  const processes = JSON.parse(stdout.trim());
  const coverage = await cdp.send('Profiler.takePreciseCoverage');
  const factoryCalls = coverage.result.filter(script => /\/src\/windows\/giftEffectPlayer\.ts(?:\?|$)/.test(script.url))
    .flatMap(script => script.functions).filter(fn => fn.functionName === 'createGiftEffectPlayer')
    .reduce((sum, fn) => sum + fn.ranges[0].count, 0);
  const perf = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item => [item.name, item.value]));
  const dom = await page.evaluate(() => ({ ...window.__obsIdle, canvasPresent: document.querySelectorAll('canvas').length,
    videoPresent: document.querySelectorAll('video').length, playerHosts: document.querySelectorAll('.gift-effect-player-host').length,
    overlayPresent: document.querySelectorAll('.gift-effect-overlay').length }));
  return { at: new Date().toISOString(), monotonicMs: performance.now(), factoryCallsSinceLastSnapshot: factoryCalls, dom,
    websocketConnections: fixture.connections.length, websocketFrames: frames.length, effectNotifications: frames.filter(frame => frame.type === 'gift-effect').length,
    resourceRequests: resourceRequests.length, fixtureResourceRequests: fixture.requests.length,
    performance: perf, processInfo: processInfo.processInfo, processes,
    processTotals: processes.reduce((sum, item) => ({ cpuSeconds: sum.cpuSeconds + item.CPU, workingSetBytes: sum.workingSetBytes + item.WorkingSet64, privateBytes: sum.privateBytes + item.PrivateMemorySize64 }), { cpuSeconds: 0, workingSetBytes: 0, privateBytes: 0 }),
    fixtureProcess: { cpu: process.cpuUsage(), memory: process.memoryUsage() } };
}
try {
  await page.goto(`${fixture.origin}/obs.html?config=obs-idle&room=2`, { waitUntil: 'networkidle' });
  const deadline = Date.now() + 12000;
  while (fixture.connections.length === 0) { if (Date.now() > deadline) throw new Error('WebSocket connection timeout'); await new Promise(resolve => setTimeout(resolve, 40)); }
  const state = await page.evaluate(async () => {
    const { createBuiltinNativeTheme } = await import('/src/themes/nativeBuiltinThemes.ts');
    const { createObsSnapshot } = await import('/src/obs/createObsSnapshot.ts');
    const { DEFAULT_EVENT_WINDOW_PREFERENCES: preferences } = await import('/src/windows/eventWindowPreferences.ts');
    return { type: 'state', identity: 'idle-theme', sequence: 1, snapshot: createObsSnapshot(createBuiltinNativeTheme('native-default'), 'obs-idle', '2', 1, preferences.stickyEvents), events: [], sticky: [], preferences: { ...preferences, showGiftEffect: true }, scheme: 'light', palette: 'pine', connection: { status: 'connected', roomId: 2 }, roomUpdates: [], giftEffectSession: 'idle-room-2', giftEffectSequence: 0 };
  });
  fixture.send(state);
  await page.locator('.gift-effect-overlay').waitFor();
  await page.waitForTimeout(3000);
  before = await snapshot();
  console.log('STABLE baseline recorded; starting 60-second idle interval');
  await new Promise(resolve => setTimeout(resolve, 30000));
  console.log('IDLE 30 seconds elapsed; no test messages injected');
  await new Promise(resolve => setTimeout(resolve, 30000));
  after = await snapshot();
  const elapsedSeconds = (after.monotonicMs - before.monotonicMs) / 1000;
  const cpuSeconds = after.processTotals.cpuSeconds - before.processTotals.cpuSeconds;
  delta = { elapsedSeconds, effectNotifications: after.effectNotifications - before.effectNotifications,
    resourceRequests: after.resourceRequests - before.resourceRequests, fixtureResourceRequests: after.fixtureResourceRequests - before.fixtureResourceRequests,
    websocketConnections: after.websocketConnections - before.websocketConnections,
    playerFactoryCalls: after.factoryCallsSinceLastSnapshot,
    canvasCreated: after.dom.canvasCreated - before.dom.canvasCreated, videoCreated: after.dom.videoCreated - before.dom.videoCreated,
    chromeCpuSeconds: cpuSeconds, chromeCpuPercentOneLogicalCore: cpuSeconds / elapsedSeconds * 100,
    chromeWorkingSetBytes: after.processTotals.workingSetBytes - before.processTotals.workingSetBytes,
    chromePrivateBytes: after.processTotals.privateBytes - before.processTotals.privateBytes,
    rendererTaskSeconds: after.performance.TaskDuration - before.performance.TaskDuration,
    rendererJsHeapUsedBytes: after.performance.JSHeapUsedSize - before.performance.JSHeapUsedSize,
    fixtureCpuMicroseconds: after.fixtureProcess.cpu.user + after.fixtureProcess.cpu.system - before.fixtureProcess.cpu.user - before.fixtureProcess.cpu.system,
    fixtureRssBytes: after.fixtureProcess.memory.rss - before.fixtureProcess.memory.rss };
  assert.ok(elapsedSeconds >= 60);
  for (const name of ['effectNotifications', 'resourceRequests', 'fixtureResourceRequests', 'websocketConnections', 'playerFactoryCalls', 'canvasCreated', 'videoCreated']) assert.equal(delta[name], 0, name);
  assert.deepEqual(after.processes.map(item => item.Id).sort(), before.processes.map(item => item.Id).sort());
  assert.equal(after.dom.overlayPresent, 1); assert.equal(after.dom.playerHosts, 0);
  assert.equal(after.dom.videoPresent, 0); assert.equal(after.dom.canvasPresent, 0);
  assert.deepEqual(errors, []);
  console.log('PASS S6 BrowserOutput idle', JSON.stringify(delta));
} catch (error) { failure = String(error); throw error; }
finally {
  await fs.writeFile(evidenceFile('obs-idle-results.json'), JSON.stringify({ at: new Date().toISOString(), passed: !failure, failure, browser: browser.version(), assetServer: 'http://127.0.0.1:1442', protocolOrigin: fixture.origin,
    transport: 'independent real loopback WebSocket; no gift-effect notifications injected; no Tauri IPC',
    measurement: 'CDP function call coverage observes the actual createGiftEffectPlayer; native createElement is observed without replacement behavior; Chrome task processes sampled with Get-Process; no periodic page sampling',
    before, after, delta, errors, frames, resourceRequests }, null, 2));
  await browser.close(); await fixture.close();
}
