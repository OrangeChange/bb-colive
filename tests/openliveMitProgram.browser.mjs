import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const directory = '.superpowers/sdd/openlive-mit-source/program-output';
mkdirSync(directory, { recursive: true });
const app = await chromium.connectOverCDP(process.env.PROGRAM_CDP || 'http://127.0.0.1:9389');
const context = app.contexts()[0];
const page = context.pages().find(page => page.url().startsWith('http://127.0.0.1:1439/'));
page.setDefaultTimeout(8000);
const result = {};
const save = () => writeFileSync(`${directory}/results.json`, JSON.stringify(result, null, 2));
async function home() {
  await page.keyboard.press('Escape');
  const back = page.getByRole('button', { name: '返回样式', exact: true });
  if (await back.isVisible()) await back.click();
  const discard = page.getByRole('button', { name: '放弃修改', exact: true });
  if (await discard.isVisible()) await discard.click();
  if (!await page.locator('.theme-library-card').first().isVisible()) await page.getByRole('button', { name: '样式', exact: true }).click();
}
async function source(owner) {
  for (let count = 0; count < 60; count++) {
    for (const frame of owner.frames().slice(1)) {
      if (!frame.url().includes('/openlive/renderer.html')) continue;
      const element = await frame.frameElement();
      if (await element.isVisible()) return frame;
    }
    await owner.waitForTimeout(100);
  }
  throw Error('开放版输出未出现');
}
try {
  await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:app|identifier')), 'cc.orange.danmu-app.shared-preview-openlive-mit');
  await page.evaluate(async () => {
    const { useSession } = await import('/src/stores/session.ts');
    useSession.setState({ phase: 'loggedIn', session: { cookie: '', refreshToken: '', mid: '0', uname: '本地验收', savedAt: Date.now() }, error: null });
  });
  await home();
  const card = () => page.locator('.theme-library-card').filter({ has: page.locator('strong', { hasText: /^BLC 开放版默认$/ }) });
  await card().getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByRole('tab', { name: '可视化编辑', exact: true }).click();
  await page.locator('nav[aria-label="语义部件"] details').evaluateAll(nodes => nodes.forEach(node => node.open = true));
  await page.locator('[data-navigation-id="username"]').click();
  await page.locator('.native-event-scope-primary').getByRole('button', { name: '弹幕', exact: true }).click();
  const input = page.getByRole('spinbutton', { name: '字号精确值', exact: true });
  await input.fill('24');
  await input.press('Tab');
  const preview = await source(page);
  await preview.waitForFunction(() => [...document.querySelectorAll('yt-live-chat-text-message-renderer #author-name')].some(node => getComputedStyle(node).fontSize === '24px'));
  await page.getByRole('button', { name: '另存为', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '主题信息', exact: true });
  const name = `开放版来源验收-${Date.now()}`;
  await dialog.getByRole('textbox', { name: '主题名称', exact: true }).fill(name);
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  result.saved = await page.evaluate(async name => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    const item = (await invoke('list_theme_summaries')).find(item => item.name === name);
    const document = await invoke('read_theme_document', { themeId: item.themeId });
    window.__mitSavedTheme = document;
    const { exportThemeDocumentBytes, importThemePackageBytes } = await import('/src/themes/themeTransfer.ts');
    const { tauriThemeStoragePort } = await import('/src/themes/themeRepository.ts');
    const bytes = exportThemeDocumentBytes(document);
    const imported = importThemePackageBytes(bytes).document;
    imported.themeId = crypto.randomUUID();
    imported.metadata.name = name + '-导入';
    await tauriThemeStoragePort.write(imported);
    const actual = await invoke('read_theme_document', { themeId: imported.themeId });
    return { themeId: document.themeId, visualCss: document.styles.visualCss, importedCss: actual.styles.visualCss, importedSettings: JSON.stringify(actual.settings) === JSON.stringify(document.settings), packageBase64: btoa(String.fromCharCode(...bytes)) };
  }, name);
  assert.equal(result.saved.importedCss, result.saved.visualCss);
  assert.equal(result.saved.importedSettings, true);
  writeFileSync(`${directory}/theme.zip`, Buffer.from(result.saved.packageBase64, 'base64'));
  delete result.saved.packageBase64;
  save();
  await home();
  const custom = () => page.locator('.theme-library-card').filter({ has: page.locator('strong', { hasText: name, exact: true }) });
  for (const target of ['用于现场', '用于副窗口']) {
    await custom().getByRole('button', { name: '使用', exact: true }).click();
    await page.getByRole('menuitem', { name: target, exact: true }).click();
    await custom().getByText(target==='用于现场'?'现场使用中':'副窗口使用中',{exact:true}).waitFor();
    await page.waitForFunction(async ({kind,themeId}) => {const invoke=window.__TAURI_INTERNALS__.invoke;const rid=await invoke('plugin:store|get_store',{path:'native-theme-bindings.local.json'});if(!rid)return false;const [bindings]=await invoke('plugin:store|get',{rid,key:'bindings'});return bindings.some(binding=>binding.targetKind===kind&&binding.themeId===themeId);}, {kind:target==='用于现场'?'live':'windows',themeId:result.saved.themeId}, {timeout:15000});
  }
  result.binding = await page.evaluate(async () => {const invoke=window.__TAURI_INTERNALS__.invoke;const rid=await invoke('plugin:store|get_store',{path:'native-theme-bindings.local.json'});const [bindings]=await invoke('plugin:store|get',{rid,key:'bindings'});return bindings;});
  assert.equal(result.binding.filter(binding => ['live', 'windows'].includes(binding.targetKind) && binding.themeId === result.saved.themeId).length, 2);
  await page.evaluate(async () => {
    const { useConnection } = await import('/src/stores/connection.ts');
    const { createStylePreviewEvents } = await import('/src/components/stylePreviewEvents.ts');
    const events = createStylePreviewEvents('混合流').map((event, index) => ({ ...event, id: `mit-actual-${index}`, roomId: 24125, ts: Date.now(), firstOccurredAt: Date.now() }));
    window.__mitEvents = events;
    useConnection.setState({ events, state: { status: 'closed', roomId: events[0].roomId }, listCount: events.length });
  });
  await page.getByTitle('现场（当前页）', { exact: true }).click();
  const live = await source(page);
  await live.waitForSelector('yt-live-chat-text-message-renderer #author-name');
  await live.waitForFunction(() => [...document.querySelectorAll('yt-live-chat-text-message-renderer #author-name')].some(node => getComputedStyle(node).fontSize === '24px'));
  result.live = { rows: await live.locator('#chat-items > [data-compatible-event-id]').count(), fontSize: '24px' };
  let floating = context.pages().find(page => page.url().includes('window=display'));
  if (!floating) await page.getByRole('button', { name: '打开弹幕窗', exact: true }).click();
  for (let count = 0; count < 60 && !floating; count++) { floating = context.pages().find(page => page.url().includes('window=display')); if (!floating) await page.waitForTimeout(100); }
  assert.ok(floating);
  await source(floating);
  await page.evaluate(async () => {
    const { emitTo } = await import('/node_modules/@tauri-apps/api/event.js');
    const events = window.__mitEvents;
    await emitTo('display', 'display:room-changed', { roomId: events[0].roomId, generation: Date.now() });
    await new Promise(resolve => setTimeout(resolve, 150));
    for (const event of events) await emitTo('display', 'display:danmu', event);
  });
  const windowSource = await source(floating);
  await windowSource.waitForFunction(() => [...document.querySelectorAll('yt-live-chat-text-message-renderer #author-name')].some(node => getComputedStyle(node).fontSize === '24px'));
  result.window = { rows: await windowSource.locator('#chat-items > [data-compatible-event-id]').count(), fontSize: '24px' };
  save();
  result.obsSetup = await page.evaluate(async () => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    const { createObsConfigurationId } = await import('/src/obs/obsConfigurationIdentity.ts');
    const { nativeObsConfigurationStore } = await import('/src/obs/nativeObsConfigurations.ts');
    const { createObsSnapshot } = await import('/src/obs/createObsSnapshot.ts');
    const { persistObsThemeSnapshot } = await import('/src/obs/nativeObsTheme.ts');
    const { DEFAULT_STICKY_EVENT_SETTINGS } = await import('/src/windows/stickyEventModel.ts');
    const document = window.__mitSavedTheme, id = createObsConfigurationId();
    await nativeObsConfigurationStore.save({ id, name: '开放版来源验收', roomId: '24125', themeId: document.themeId, themeName: document.metadata.name, themeRevision: document.revision });
    await persistObsThemeSnapshot(createObsSnapshot(document, id, '24125', 1, { ...DEFAULT_STICKY_EVENT_SETTINGS, enabled: true, obsEnabled: true }));
    await invoke('obs_set_service_port', { port: 17939 });
    const status = await invoke('obs_start_service');
    return { id, port: status.port };
  });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const obs = await browser.newPage({ viewport: { width: 450, height: 800 } });
    await obs.goto(`http://127.0.0.1:${result.obsSetup.port}/obs?config=${result.obsSetup.id}&preview=sample`);
    const obsSource = await source(obs);
    await obsSource.waitForFunction(() => [...document.querySelectorAll('yt-live-chat-text-message-renderer #author-name')].some(node => getComputedStyle(node).fontSize === '24px'));
    result.obs = { rows: await obsSource.locator('#chat-items > [data-compatible-event-id]').count(), fontSize: '24px' };
    await obs.screenshot({ path: `${directory}/obs.png` });
    await home();
    await custom().getByRole('button', { name: '编辑', exact: true }).click();
    await page.getByRole('button', { name: '动态', exact: true }).click();
    const external = await browser.newPage({ viewport: { width: 450, height: 800 } });
    await external.goto(`http://127.0.0.1:${result.obsSetup.port}/preview`);
    const externalSource = await source(external);
    await externalSource.waitForSelector('#chat-items > [data-compatible-event-id]');
    result.external = { rows: await externalSource.locator('#chat-items > [data-compatible-event-id]').count() };
    await external.screenshot({ path: `${directory}/external.png` });
  } finally { await browser.close(); }
  save();
  console.log(JSON.stringify(result));
} catch (error) {
  result.error = error.stack;
  save();
  await page.screenshot({ path: `${directory}/failure.png` }).catch(() => {});
  throw error;
} finally { await app.close(); }
