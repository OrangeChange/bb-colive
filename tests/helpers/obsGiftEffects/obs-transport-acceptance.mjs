import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, effectAsset, evidenceFile } from './config.mjs';
import { startFixture } from './obs-browserfixture.mjs';
const rustProxy = Boolean(process.env.OBS_RUST_PROXY_PORT);
const fixture = await startFixture();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const pages = [], errors = [], checks = [];
let failure;
async function connections(count) {
  const deadline = Date.now() + 12000;
  while (fixture.connections.length < count) { if (Date.now() > deadline) throw new Error('WebSocket connection timeout'); await new Promise(resolve => setTimeout(resolve, 40)); }
}
async function check(name, fn) { const evidence = await fn(); checks.push({ name, passed: true, evidence }); console.log('PASS', name); }
const proxy = (file, name) => `${fixture.origin}/gift-effects/${Buffer.from(`${fixture.origin}/upstream/${file}`).toString('base64url')}/${name}`;
try {
  for (let i = 0; i < 2; i++) {
    const page = await browser.newPage(); pages.push(page); page.setDefaultTimeout(12000);
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.__obsTransport = { videos: 0, notifications: [] };
      const create = Document.prototype.createElement;
      Document.prototype.createElement = function(...args) {
        const element = create.apply(this, args);
        if (String(args[0]).toLowerCase() === 'video') window.__obsTransport.videos++;
        return element;
      };
    });
    page.on('websocket', socket => {
      if (new URL(socket.url()).pathname !== '/ws') return;
      socket.on('framereceived', async frame => {
        const message = JSON.parse(String(frame.payload));
        if (message.type === 'gift-effect') await page.evaluate(message => window.__obsTransport.notifications.push({ session: message.session, sequence: message.sequence }), message).catch(() => {});
      });
    });
    await page.goto(`${fixture.origin}/obs.html?config=transport&room=2`, { waitUntil: 'networkidle' });
  }
  await connections(2);
  const state = await pages[0].evaluate(async () => {
    const { createBuiltinNativeTheme } = await import('/src/themes/nativeBuiltinThemes.ts');
    const { createObsSnapshot } = await import('/src/obs/createObsSnapshot.ts');
    const { DEFAULT_EVENT_WINDOW_PREFERENCES: preferences } = await import('/src/windows/eventWindowPreferences.ts');
    return { type: 'state', identity: 'transport', sequence: 1, snapshot: createObsSnapshot(createBuiltinNativeTheme('native-default'), 'transport', '2', 1, preferences.stickyEvents), events: [], sticky: [], preferences: { ...preferences, showGiftEffect: true }, scheme: 'light', connection: { status: 'connected', roomId: 2 }, roomUpdates: [], giftEffectSession: 'transport-room', giftEffectSequence: 5 };
  });
  const gift = sequence => ({ type: 'gift-effect', session: 'transport-room', sequence, notice: {
    event: { id: `transport-${sequence}`, roomId: 2, ts: Date.now(), msgType: 1, user: { uid: 1, uname: '验收用户' }, gift: { id: 34868, name: '礼物', count: 1, priceRmb: 1, totalRmb: 1, coinType: 'gold' } },
    resource: { id: 2071, giftIds: [34868], planPlatforms: [2], webMp4: `${fixture.origin}/upstream/effect.mp4`, webMp4Json: `${fixture.origin}/upstream/effect.json` },
  } });
  await check('two-independent-browser-outputs-receive-once', async () => {
    fixture.send(state);
    for (const page of pages) await page.locator('.gift-effect-overlay').waitFor();
    fixture.send(gift(6)); fixture.send(gift(6));
    for (const page of pages) await page.waitForFunction(() => window.__obsTransport.videos === 1 && document.querySelector('canvas'));
    return Promise.all(pages.map(page => page.evaluate(() => window.__obsTransport)));
  });
  await check('two-browser-websocket-reconnect-baselines', async () => {
    fixture.disconnect(); await connections(4);
    fixture.send({ ...state, sequence: 2, giftEffectSequence: 7 }); fixture.send(gift(7));
    await pages[0].waitForTimeout(500);
    for (const page of pages) assert.equal(await page.evaluate(() => window.__obsTransport.videos), 1);
    fixture.send(gift(8));
    for (const page of pages) await page.waitForFunction(() => window.__obsTransport.videos === 2);
    return { connections: fixture.connections.map(({ query }) => query), clients: await Promise.all(pages.map(page => page.evaluate(() => window.__obsTransport))) };
  });
  await check('websocket-theme-state-keeps-current-notice', async () => {
    const before = await Promise.all(pages.map(page => page.evaluate(() => ({ ...window.__obsTransport, video: document.querySelector('video')?.currentTime }))));
    fixture.send({ ...state, sequence: 3, identity: 'transport-theme-b', scheme: 'dark', palette: 'sakura', giftEffectSequence: 8 });
    await pages[0].waitForTimeout(250);
    const after = await Promise.all(pages.map(page => page.evaluate(() => ({ ...window.__obsTransport, video: document.querySelector('video')?.currentTime, dark: document.querySelector('.obs-output-root.dark') !== null }))));
    after.forEach((item, index) => { assert.equal(item.videos, before[index].videos); assert.equal(item.dark, true); });
    return { before, after };
  });
  if (rustProxy) {
  await check('chrome-head-and-explicit-range-through-rust', async () => {
    const url = proxy('effect.mp4', 'video.mp4');
    const responses = await pages[0].evaluate(async url => {
      const head = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      const range = await fetch(url, { headers: { Range: 'bytes=10-19', 'If-Range': '"fixture-video"' }, cache: 'no-store' });
      return { head: { status: head.status, headers: Object.fromEntries(head.headers), bytes: (await head.arrayBuffer()).byteLength },
        range: { status: range.status, headers: Object.fromEntries(range.headers), bytes: [...new Uint8Array(await range.arrayBuffer())] } };
    }, url);
    const original = await fs.readFile(effectAsset('effect.mp4'));
    assert.equal(responses.head.status, 200); assert.equal(responses.head.bytes, 0);
    assert.equal(Number(responses.head.headers['content-length']), original.length);
    assert.equal(responses.head.headers['content-type'], 'video/mp4');
    assert.equal(responses.range.status, 206); assert.equal(responses.range.headers['content-range'], `bytes 10-19/${original.length}`);
    assert.deepEqual(responses.range.bytes, [...original.subarray(10, 20)]);
    assert.ok(fixture.requests.some(item => item.upstream === '/upstream/effect.mp4' && item.method === 'HEAD'));
    assert.ok(fixture.requests.some(item => item.upstream === '/upstream/effect.mp4' && item.range === 'bytes=10-19' && item.ifRange === '"fixture-video"'));
    return responses;
  });
  await check('rust-config-relative-image-rewrite-and-browser-decode', async () => {
    const result = await pages[0].evaluate(async url => {
      const response = await fetch(url, { cache: 'no-store' }); const config = await response.json();
      const image = new Image(); image.src = config.src[0].imgUrl; await image.decode();
      return { status: response.status, config, image: { width: image.naturalWidth, height: image.naturalHeight } };
    }, proxy('references.json', 'config.json'));
    assert.equal(result.status, 200);
    assert.equal(new URL(result.config.src[0].imgUrl).origin, fixture.origin);
    assert.ok(new URL(result.config.src[0].imgUrl).pathname.startsWith('/gift-effects/'));
    assert.equal(result.config.src[0].imgUrl, result.config.nested.url);
    assert.equal(result.config.src[0].srcTag, '[avatar]'); assert.equal(result.config.nested.src, 'data:image/png;base64,AA==');
    assert.ok(result.image.width > 0 && result.image.height > 0);
    return result;
  });
  }
  assert.deepEqual(errors, []);
} catch (error) { failure = String(error); throw error; }
finally {
  await fs.writeFile(evidenceFile(rustProxy ? 'obs-transport-results.json' : 'obs-websocket-results.json'), JSON.stringify({ at: new Date().toISOString(), browser: browser.version(), passed: !failure, failure,
    transport: 'real independent loopback WebSocket; two isolated BrowserOutput pages; no Tauri IPC', resourceProxy: rustProxy ? 'production Rust gift_resource through axum HTTP' : 'independent Node fixture; Rust-specific checks not run', checks, errors, requests: fixture.requests }, null, 2));
  await browser.close(); await fixture.close();
}
