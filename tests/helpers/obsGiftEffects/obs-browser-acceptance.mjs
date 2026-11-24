import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, evidenceFile } from './config.mjs';
import { startFixture } from './obs-browserfixture.mjs';
const fixture = await startFixture();
const themeMode = process.env.OBS_THEME_MODE || 'native';
const smokeOnly = process.env.OBS_BROWSER_CASE === 'smoke';
const summaryOnly = process.env.OBS_BROWSER_CASE === 'summary';
const visualOnly = smokeOnly || summaryOnly || process.env.OBS_BROWSER_CASE === 'visual';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 960, height: 800 } });
page.setDefaultTimeout(12000);
const results = [], errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  const evidence = window.__obsEvidence = { videos: [], events: [], draws: 0, coloredFrames: 0 };
  const create = Document.prototype.createElement;
  Document.prototype.createElement = function(...args) {
    const element = create.apply(this, args);
    if (String(args[0]).toLowerCase() === 'video') {
      const id = evidence.videos.push(element) - 1;
      for (const type of ['loadeddata', 'playing', 'ended', 'pause', 'error', 'emptied']) element.addEventListener(type, () => evidence.events.push({ id, type, time: element.currentTime, at: performance.now() }));
    }
    return element;
  };
  for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
    const draw = prototype.drawArrays;
    prototype.drawArrays = function(...args) {
      const result = draw.apply(this, args); evidence.draws++;
      if (evidence.draws % 15 === 0) {
        const width = this.drawingBufferWidth, height = this.drawingBufferHeight;
        const pixels = new Uint8Array(width * height * 4);
        this.readPixels(0, 0, width, height, this.RGBA, this.UNSIGNED_BYTE, pixels);
        if (pixels.some((value, index) => index % 4 !== 3 && value > 8)) evidence.coloredFrames++;
      }
      return result;
    };
  }
});
async function sample() {
  return page.evaluate(() => ({
    canvas: document.querySelectorAll('.gift-effect-overlay canvas').length,
    videos: window.__obsEvidence.videos.map(video => ({ connected: video.isConnected, paused: video.paused, time: video.currentTime, src: video.getAttribute('src'), ended: video.ended })),
    events: window.__obsEvidence.events, draws: window.__obsEvidence.draws, coloredFrames: window.__obsEvidence.coloredFrames,
  }));
}
async function quiet(ms = 350) { await page.waitForTimeout(ms); }
async function waitForConnections(count) {
  await assertEventually(() => fixture.connections.length >= count);
}
async function assertEventually(predicate) {
  const deadline = Date.now() + 12000;
  while (!predicate()) { if (Date.now() >= deadline) throw new Error('WebSocket connection timeout'); await new Promise(resolve => setTimeout(resolve, 40)); }
}
async function check(name, run) {
  try { const evidence = await run(); results.push({ name, passed: true, evidence }); console.log('PASS', name); }
  catch (error) { results.push({ name, passed: false, error: String(error), evidence: await sample() }); console.log('FAIL', name, String(error)); throw error; }
}
let state, effectSequence = 5;
function sendState(patch = {}) { state = { ...state, ...patch, sequence: state.sequence + 1 }; fixture.send(state); }
function gift(id, { broken = false, session = state.giftEffectSession, sequence = ++effectSequence, room = state.snapshot.roomId } = {}) {
  return { type: 'gift-effect', session, sequence, notice: {
    event: { id, roomId: room, ts: Date.now(), msgType: 1, user: { uid: 1, uname: '验收用户' }, gift: { id: 34868, name: '礼物', count: 1, priceRmb: 1, totalRmb: 1, coinType: 'gold' } },
    resource: { id: 2071, giftIds: [34868], planPlatforms: [2], webMp4: `${fixture.origin}/upstream/effect.mp4`, webMp4Json: `${fixture.origin}/upstream/${broken ? 'broken' : 'effect'}.json` },
  } };
}
async function active() {
  await page.waitForFunction(() => window.__obsEvidence.videos.some(v => v.isConnected && !v.paused && v.currentTime > .15));
  return sample();
}
async function ended() { await page.locator('.gift-effect-overlay canvas').waitFor({ state: 'detached' }); await quiet(100); }
try {
  await page.goto(`${fixture.origin}/obs.html?config=obs-acceptance&room=2`, { waitUntil: 'networkidle' });
  await waitForConnections(1);
  state = await page.evaluate(async mode => {
    const { createBuiltinNativeTheme } = await import('/src/themes/nativeBuiltinThemes.ts');
    const {createCompatibleThemeModeAdapter}=await import('/src/themes/themeModeAdapters.ts');
    const theme=mode==='native'?createBuiltinNativeTheme('native-default'):createCompatibleThemeModeAdapter(mode).createBuiltinTheme();
    const { createObsSnapshot } = await import('/src/obs/createObsSnapshot.ts');
    const { DEFAULT_EVENT_WINDOW_PREFERENCES: preferences } = await import('/src/windows/eventWindowPreferences.ts');
    return { type: 'state', identity: 'theme-a', sequence: 0, snapshot: createObsSnapshot(theme, 'obs-acceptance', '2', 1, preferences.stickyEvents), events: [{id:'obs-smoke-row',roomId:2,ts:Date.now(),receivedAt:Date.now(),msgType:0,text:'OBS 内容对照',user:{uid:'1',uname:'验收用户',phoneVerified:true}}], sticky: [], preferences: { ...preferences, showGiftEffect: true }, scheme: 'light', palette: 'pine', connection: { status: 'connected', roomId: 2 }, roomUpdates: [], giftEffectSession: 'room-2', giftEffectSequence: 5 };
  },themeMode);
  if (summaryOnly) {
    await check('summary-first-real-model-websocket-vap-once', async () => {
      sendState(); await page.locator('.gift-effect-overlay').waitFor();
      const sent = [];
      await page.exposeFunction('__obsSendEffect', message => { sent.push(message); fixture.send(message); });
      const resource = gift('resource').notice.resource;
      const modelResult = await page.evaluate(async ({ preferences, resource, session }) => {
        const { createObsOutputState } = await import('/src/obs/obsOutputState.ts');
        const { resolveGiftEffect } = await import('/src/protocol/giftEffects.ts');
        const candidates = [], notified = [], deliveries = [];
        const model = createObsOutputState(2, preferences, {}, event => {
          candidates.push(event.id);
          const matched = resolveGiftEffect([resource], event.gift);
          if (!matched) return;
          notified.push(event.id);
          deliveries.push(window.__obsSendEffect({ type: 'gift-effect', session, sequence: 6, notice: { event, resource: matched } }));
        });
        const summary = { id: 'combo-summary', roomId: 2, ts: Date.now(), msgType: 1,
          user: { uid: 1, uname: '验收用户' }, comboId: 'summary-before-gift', isComboUpdate: true,
          gift: { id: 34868, name: '礼物', count: 1, priceRmb: 1, totalRmb: 1, paymentRmb: 1, coinType: 'gold' } };
        const actual = { ...summary, id: 'real-blind-result', isComboUpdate: false,
          gift: { ...summary.gift, effect: 2, effectId: 2071, blindGiftName: 'box' } };
        model.accept(summary, 1000);
        const afterSummary = { candidates: [...candidates], notified: [...notified] };
        model.accept(actual, 1001); model.accept(actual, 1002);
        await Promise.all(deliveries);
        return { afterSummary, candidates, notified };
      }, { preferences: state.preferences, resource, session: state.giftEffectSession });
      assert.deepEqual(modelResult.afterSummary, { candidates: [], notified: [] });
      assert.deepEqual(modelResult.candidates, ['real-blind-result']);
      assert.deepEqual(modelResult.notified, ['real-blind-result']);
      assert.equal(sent.length, 1);
      await active();
      await page.waitForFunction(() => window.__obsEvidence.coloredFrames > 0 && window.__obsEvidence.videos[0].currentTime > 1.6);
      await page.screenshot({ path: evidenceFile('obs-summary-playing.png') });
      await ended();
      const media = await sample();
      assert.equal(media.videos.length, 1);
      assert.equal(media.events.filter(event => event.type === 'ended').length, 1);
      assert.ok(media.videos.every(video => !video.connected && video.paused));
      return { modelResult, sent, media };
    });
  } else {
  await check('initial-baseline', async () => {
    fixture.send(gift('before-baseline', { sequence: 6 })); sendState(); await quiet();
    fixture.send(gift('history', { sequence: 5 })); await quiet();
    const value = await sample(); assert.equal(value.videos.length, 0); assert.equal(fixture.requests.length, 0); return value;
  });
  await check('new-gift-real-vap-and-duplicate', async () => {
    const message = gift('new'); fixture.send(message); await active(); fixture.send(message);
    await page.waitForFunction(() => window.__obsEvidence.coloredFrames > 0);
    await page.waitForFunction(() => window.__obsEvidence.videos.some(v => v.isConnected && v.currentTime > 1.6));
    await page.screenshot({ path: evidenceFile(fixture.frontendDist ? 'obs-dist-playing.png' : 'obs-playing.png') });
    await ended(); const value = await sample(); assert.equal(value.videos.length, 1); assert.ok(value.events.some(e => e.type === 'ended')); assert.ok(value.videos.every(v => !v.connected && v.paused)); return value;
  });
  }
  if (!visualOnly) {
  await check('reconnect-baseline-no-replay', async () => {
    fixture.disconnect(); await waitForConnections(2); sendState({ giftEffectSequence: effectSequence + 1 });
    fixture.send(gift('disconnected-history', { sequence: ++effectSequence })); await quiet(600);
    assert.equal((await sample()).videos.length, 1); fixture.send(gift('after-reconnect')); await active(); await ended(); return sample();
  });
  await check('switch-clears-pending-current-finishes-no-backfill', async () => {
    const before = (await sample()).videos.length;
    fixture.send(gift('switch-current')); await active(); fixture.send(gift('switch-pending')); await quiet(100);
    sendState({ preferences: { ...state.preferences, showGiftEffect: false } }); await quiet(100); fixture.send(gift('while-off')); await ended();
    assert.equal((await sample()).videos.length, before + 1);
    sendState({ preferences: { ...state.preferences, showGiftEffect: true } }); await quiet(); assert.equal((await sample()).videos.length, before + 1);
    fixture.send(gift('after-enable')); await active(); await ended(); return sample();
  });
  await check('theme-change-preserves-active-video', async () => {
    fixture.send(gift('theme-current')); await active(); const before = await sample();
    sendState({ identity: 'theme-b', scheme: 'dark', palette: 'sakura', snapshot: { ...state.snapshot, themeId: 'theme-b', revision: 2 } }); await quiet(400);
    const after = await sample(); assert.equal(after.videos.length, before.videos.length); assert.ok(after.videos.at(-1).connected); assert.ok(after.videos.at(-1).time > before.videos.at(-1).time);
    await ended(); return { before, after, finished: await sample() };
  });
  await check('room-change-cancels-old-and-rejects-old-session', async () => {
    fixture.send(gift('room-current')); await active(); fixture.send(gift('room-pending')); await quiet(100);
    const count = (await sample()).videos.length;
    sendState({ snapshot: { ...state.snapshot, roomId: 3 }, giftEffectSession: 'room-3', giftEffectSequence: 0 }); effectSequence = 0;
    await quiet(500); fixture.send(gift('old-room', { session: 'room-2', sequence: 100, room: 2 })); await quiet();
    const after = await sample(); assert.equal(after.canvas, 0); assert.equal(after.videos.length, count); assert.ok(after.videos.every(v => !v.connected && v.paused));
    fixture.send(gift('new-room')); await active(); await ended(); return { after, finished: await sample() };
  });
  await check('broken-json-queue-continues', async () => {
    const before = (await sample()).videos.length;
    fixture.send(gift('bad-json', { broken: true })); fixture.send(gift('after-bad-json')); await active(); await ended();
    const after = await sample(); assert.equal(after.videos.length, before + 1); assert.ok(fixture.requests.some(req => req.source?.endsWith('broken.json'))); return after;
  });
  }
  if (fixture.frontendDist) {
    assert.ok(fixture.frontendRequests.some(request => request.path === '/obs.html'));
    assert.ok(fixture.frontendRequests.some(request => request.path.startsWith('/assets/') && request.path.endsWith('.js')));
  }
  assert.deepEqual(errors, []);
} finally {
  await fs.writeFile(evidenceFile(summaryOnly ? 'obs-summary-results.json' : smokeOnly ? `obs-${themeMode}-${fixture.frontendDist?'dist-':''}smoke-results.json` : visualOnly ? 'obs-visual-results.json' : 'obs-browser-results.json'), JSON.stringify({ mode:themeMode, at: new Date().toISOString(), browser: browser.version(), assetServer: 'http://127.0.0.1:1442', frontend: { dist: fixture.frontendDist, requests: fixture.frontendRequests }, protocolOrigin: fixture.origin, transport: 'real loopback WebSocket; independent fixture; no Tauri IPC', resourceProxy: process.env.OBS_RUST_PROXY_PORT ? 'production obs_server.rs gift_resource through axum HTTP' : 'independent Node fixture', results, errors, requests: fixture.requests, connections: fixture.connections.map(({ query, received }) => ({ query, received })) }, null, 2));
  await browser.close(); await fixture.close();
}
