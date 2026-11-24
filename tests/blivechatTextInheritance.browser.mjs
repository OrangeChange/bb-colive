import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 0, watch: null }, optimizeDeps: { noDiscovery: true }, logLevel: 'error' });
await server.listen();
let browser;
try {
  const { DEFAULT_BLIVECHAT_THEME_SETTINGS } = await server.ssrLoadModule('/src/compat/blivechat/theme.ts');
  const { BLIVECHAT_SOURCE_CSS } = await server.ssrLoadModule('/src/compat/blivechat/source.ts');
  const { composeBlivechatThemeCss } = await server.ssrLoadModule('/src/compat/blivechat/css.ts');
  const { createStylePreviewEvents } = await server.ssrLoadModule('/src/components/stylePreviewEvents.ts');
  const { projectBlivechatCallback } = await server.ssrLoadModule('/src/compat/blivechat/projection.ts');
  const doc = { mode: 'blivechat', settings: { ...DEFAULT_BLIVECHAT_THEME_SETTINGS }, styles: { baseCss: BLIVECHAT_SOURCE_CSS, visualCss: '', customCss: '' } };
  const records = createStylePreviewEvents('混合流').map((event, i) => projectBlivechatCallback(event, i)).filter(Boolean);
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  console.log('Chrome', browser.version());
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/blivechat/renderer.html`);
  await page.waitForFunction(() => document.querySelector('yt-live-chat-renderer')?.__vue__);
  await page.evaluate(records => {
    window.postMessage({ type: 'bb-blivechat', command: 'host', data: { managed: true, direction: 'bottom', scale: 1, tickerEnabled: false } }, location.origin);
    const presentation = { layout: records.map(r => ({ kind: 'source', eventId: r.payload.id })), stickyRecords: [], direction: 'bottom', animation: { preset: 'none', durationMs: 0 } };
    window.postMessage({ type: 'bb-blivechat', command: 'hydrate', data: { records: records.map(r => ({ ...r, receivedAt: Date.now() })), presentation } }, location.origin);
    const style = document.createElement('style'); style.id = 'inheritance-theme'; document.head.append(style);
  }, records);
  await page.waitForSelector('yt-live-chat-text-message-renderer #message');
  await page.waitForSelector('yt-live-chat-paid-message-renderer #message', { state: 'attached' });
  const render = async () => {
    await page.evaluate(css => { document.querySelector('#inheritance-theme').textContent = css; }, composeBlivechatThemeCss(doc));
    return page.evaluate(() => {
      const text = document.querySelector('yt-live-chat-text-message-renderer');
      const size = (root, selector) => getComputedStyle(root.querySelector(selector)).fontSize;
      return { content: size(text, '#content'), textLine: getComputedStyle(text.querySelector('#message')).lineHeight, textTime: size(text,'#timestamp'), paidTime: size(document.querySelector('yt-live-chat-paid-message-renderer'),'#timestamp'), guardTime: size(document.querySelector('yt-live-chat-membership-item-renderer'),'#timestamp'), name: size(text, '#author-name'), message: size(text, '#message'), paid: size(document.querySelector('yt-live-chat-paid-message-renderer'), '#message'), amount: size(document.querySelector('yt-live-chat-paid-message-renderer'), '#purchase-amount'), paidName: size(document.querySelector('yt-live-chat-paid-message-renderer'), '#author-name'), paidLine: getComputedStyle(document.querySelector('yt-live-chat-paid-message-renderer #message')).lineHeight, guardName: size(document.querySelector('yt-live-chat-membership-item-renderer'), '#author-name'), guardTitle: size(document.querySelector('yt-live-chat-membership-item-renderer'), '#header-subtext'), emotes: [...document.querySelectorAll('yt-live-chat-text-message-renderer #message .emoji')].map(el => [el.classList.contains('blc-large-emoji'), getComputedStyle(el).width, getComputedStyle(el).height]) };
    });
  };
  for (const [g, f, textSize, paidSize, small, large] of [[1, 1, '13px', '15px', '24px', '24px'], [2, 1, '26px', '30px', '48px', '48px'], [1, 1.5, '19.5px', '22.5px', '36px', '36px'], [1.5, 2, '39px', '45px', '72px', '72px']]) {
    Object.assign(doc.settings, { globalScale: g, fontScale: f });
    const result = await render();
    console.log('default', g, f, JSON.stringify(result));
    assert.equal(result.message, textSize);
    assert.equal(result.name, textSize);
    assert.equal(result.paid, paidSize);
    assert.equal(result.textLine,`${16*g*f}px`);
    assert.equal(result.paidLine,'normal');
    assert.equal(result.amount,paidSize);
    assert.equal(result.paidName,`${14*g*f}px`);
    assert.equal(result.guardName,`${14*g*f}px`);
    assert.equal(result.guardTitle,paidSize);
    for(const key of ['textTime','paidTime','guardTime'])assert.equal(result[key],`${11*g*f}px`);
    assert.ok(result.emotes.some(([big]) => !big) && result.emotes.some(([big]) => big), '真实素材包含大小表情');
    for (const [big, width, height] of result.emotes) { assert.equal(height, big ? large : small); assert.ok(Number.parseFloat(width) > 0); }
  }
  Object.assign(doc.settings, { globalScale: 1, fontScale: 1 });
  doc.styles.customCss = 'yt-live-chat-text-message-renderer #content { font-size: 60px; }';
  const contentOnly = await render();
  console.log('content only', JSON.stringify(contentOnly));
  assert.equal(contentOnly.message, '60px');
  assert(Number.parseFloat(contentOnly.textLine)>60,'默认行高随正文字号保持来源比例');
  assert.equal(contentOnly.name, '60px', '用户名按来源继承内容容器，显式编辑仍可独立设置');
  doc.styles.customCss = 'yt-live-chat-text-message-renderer #content { font-size: 60px; } yt-live-chat-text-message-renderer #author-name { font-size: 50px; }';
  const inherited = await render();
  console.log('OBS selectors', JSON.stringify(inherited));
  assert.equal(inherited.content, '60px');
  assert.equal(inherited.name, '50px');
  assert.equal(inherited.message, '60px', '正文继承用户在 #content 设置的字号');
  assert.equal(inherited.paid, '15px');
  for (const [, width, height] of inherited.emotes) { assert.equal(height, '24px'); assert.ok(Number.parseFloat(width) > 0); }
  doc.styles.customCss='yt-live-chat-paid-message-renderer #content{font-size:60px;line-height:1.2}yt-live-chat-paid-message-renderer #header-content-primary-column{font-size:50px}yt-live-chat-membership-item-renderer #card{font-size:45px}yt-live-chat-membership-item-renderer #header-subtext{font-size:35px}';
  const cards=await render();console.log('paid and guard inheritance',JSON.stringify(cards));assert.equal(cards.paid,'60px');assert.equal(cards.amount,'50px');assert.equal(cards.paidName,'14px');assert.equal(cards.paidLine,'72px');assert.equal(cards.guardName,'45px');assert.equal(cards.guardTitle,'35px');
  doc.styles.customCss='yt-live-chat-text-message-renderer #content{font-size:60px}yt-live-chat-text-message-renderer #author-name{font-size:50px}';
  doc.settings.visualModel = { common: { 'danmaku|all|main|message': { fontSize: { source: 'custom', value: 42 } } }, light: {}, dark: {} };
  const edited = await render();
  console.log('visual message', JSON.stringify(edited));
  assert.equal(edited.message, '42px');
  assert.equal(edited.name, '50px');
  assert.equal(edited.content, '60px');
  doc.styles.customCss='yt-live-chat-paid-message-renderer #content{font-size:60px}yt-live-chat-paid-message-renderer #header-content-primary-column{font-size:50px}yt-live-chat-membership-item-renderer #card{font-size:45px}';
  const control=(value)=>({fontSize:{source:'custom',value}});
  doc.settings.visualModel={common:{'superchat|all|main|message':control(42),'superchat|all|main|username':control(38),'superchat|all|main|amount':control(36),'superchat|all|main|timestamp':control(19),'guard|all|main|username':control(33),'guard|all|main|membershipSubtext':control(32)},light:{},dark:{}};
  await render();
  const selected=await page.evaluate(()=>{const sc=document.querySelector('yt-live-chat-paid-message-renderer[data-blc-kind="superchat"][data-blc-placement="main"]'),guard=document.querySelector('yt-live-chat-membership-item-renderer[data-blc-placement="main"]');const size=(n,s)=>getComputedStyle(n.querySelector(s)).fontSize;return{message:size(sc,'#message'),name:size(sc,'#author-name'),amount:size(sc,'#purchase-amount'),time:size(sc,'#timestamp'),guardName:size(guard,'#author-name'),guardTitle:size(guard,'#header-subtext')}});
  assert.deepEqual(selected,{message:'42px',name:'38px',amount:'36px',time:'19px',guardName:'33px',guardTitle:'32px'});console.log('visual components',JSON.stringify(selected));
  doc.settings.visualModel={common:{},light:{},dark:{}};
  Object.assign(doc.settings,{globalScale:2,fontScale:2});doc.styles.customCss='#message{font-size:17px;line-height:18px}';const fixed=await render();assert.equal(fixed.message,'17px');assert.equal(fixed.paid,'17px');assert.equal(fixed.textLine,'18px');assert.equal(fixed.paidLine,'18px');
  Object.assign(doc.settings,{globalScale:1,fontScale:1});
  doc.styles.customCss='';
  await render();
  await page.evaluate(records=>{const now=Date.now();window.postMessage({type:'bb-blivechat',command:'host',data:{managed:true,direction:'bottom',scale:1,tickerEnabled:true}},location.origin);window.postMessage({type:'bb-blivechat',command:'presentation',data:{layout:[],stickyRecords:records.filter(r=>r.method!=='onAddText').map(record=>({record,startedAt:now,expiresAt:now+60000})),direction:'bottom',position:'top',animation:{preset:'none',durationMs:0}}},location.origin)},records);
  const ticker=page.locator('yt-live-chat-ticker-paid-message-item-renderer #text').first();await ticker.waitFor({state:'attached'});
  for(const [g,f]of[[1,1],[2,1],[1,1.5]]){Object.assign(doc.settings,{globalScale:g,fontScale:f});await page.evaluate(css=>document.querySelector('#inheritance-theme').textContent=css,composeBlivechatThemeCss(doc));assert.equal(await ticker.evaluate(n=>getComputedStyle(n).fontSize),String(14*g*f)+'px');}
  Object.assign(doc.settings,{globalScale:1,fontScale:1});doc.styles.customCss='yt-live-chat-ticker-paid-message-item-renderer #content{font-size:40px}';await page.evaluate(css=>document.querySelector('#inheritance-theme').textContent=css,composeBlivechatThemeCss(doc));assert.equal(await ticker.evaluate(n=>getComputedStyle(n).fontSize),'40px');
  doc.styles.customCss='yt-live-chat-paid-message-renderer #content{font-size:60px;line-height:1.2}yt-live-chat-paid-message-renderer #header-content-primary-column{font-size:50px}yt-live-chat-membership-item-renderer #card{font-size:45px}yt-live-chat-membership-item-renderer #header-subtext{font-size:35px}';
  await page.evaluate(css=>document.querySelector('#inheritance-theme').textContent=css,composeBlivechatThemeCss(doc));
  for(const kind of ['superchat','membership']){
    const item=page.locator('yt-live-chat-ticker-paid-message-item-renderer[data-blc-kind="'+kind+'"]').first();await item.waitFor({state:'attached'});await item.evaluate(n=>n.click());
    const selector=kind==='superchat'?'yt-live-chat-ticker-renderer > yt-live-chat-paid-message-renderer':'yt-live-chat-ticker-renderer > yt-live-chat-membership-item-renderer';await page.locator(selector).waitFor({state:'attached'});
    const detail=await page.locator(selector).evaluate((n,kind)=>({name:getComputedStyle(n.querySelector('#author-name')).fontSize,message:getComputedStyle(n.querySelector(kind==='superchat'?'#message':'#header-subtext')).fontSize,time:getComputedStyle(n.querySelector('#timestamp')).fontSize}),kind);
    assert.equal(detail.message,kind==='superchat'?'60px':'35px');assert.equal(detail.name,kind==='superchat'?'14px':'45px');assert.equal(detail.time,'11px');console.log('detail',kind,JSON.stringify(detail));
  }
  console.log('ticker text inheritance passed');
  const { createBlivechatAuxiliaryDisplayCss } = await server.ssrLoadModule('/src/compat/blivechat/runtime.tsx');
  await page.evaluate(records => window.postMessage({ type: 'bb-blivechat', command: 'hydrate', data: { records, presentation: { layout: records.map(r => ({ kind: 'source', eventId: r.payload.id })), stickyRecords: [], direction: 'bottom', animation: { preset: 'none', durationMs: 0 } } } }, location.origin), records);
  await page.waitForSelector('yt-live-chat-text-message-renderer #message', { state: 'attached' });
  for (const [theme, time, name] of [['classic', 20, 20], ['wechat', 18, 18]]) {
    doc.styles.baseCss = readFileSync(`resources/theme-catalog/blivechat-${theme}.css`, 'utf8');
    doc.styles.customCss = '';
    doc.settings.visualModel = { common: {}, light: {}, dark: {} };
    for (const [g, f] of [[1, 1], [2, 1], [1, 1.5]]) {
      Object.assign(doc.settings, { globalScale: g, fontScale: f });
      await page.evaluate(css => document.querySelector('#inheritance-theme').textContent = css, composeBlivechatThemeCss(doc) + createBlivechatAuxiliaryDisplayCss({ showTimestamp: true, maskUsername: true, showAvatar: true, showUsername: true }));
      const auxiliary = await page.evaluate(() => {
        const row = document.querySelector('yt-live-chat-text-message-renderer');
        return { time: getComputedStyle(row.querySelector('#timestamp')).fontSize, mask: getComputedStyle(row.querySelector('#author-name'), '::before').fontSize };
      });
      assert.deepEqual(auxiliary, { time: `${time * g * f}px`, mask: `${name * g * f}px` }, `${theme} G${g}/F${f} 时间和打码`);
    }
    doc.settings.visualModel = { common: {
      'danmaku|all|main|message': { fontSize: { source: 'custom', value: 'calc(24px * var(--blc-g, 1) * var(--blc-f, 1))' } },
      'danmaku|all|main|avatar': { marginX: { source: 'custom', value: 'calc(8px * var(--blc-g, 1))' } },
    }, light: {}, dark: {} };
    for (const [g, f, expected] of [[1, 1, '24px'], [2, 1, '48px'], [1, 1.5, '36px']]) {
      Object.assign(doc.settings, { globalScale: g, fontScale: f });
      assert.equal((await render()).message, expected, `${theme} 可视化字号 G${g}/F${f}`);
      assert.equal(await page.locator('yt-live-chat-text-message-renderer #author-photo img#img').first().evaluate(n => getComputedStyle(n).marginLeft), `${8 * g}px`, `${theme} 可视化头像间距只随G变化`);
    }
    doc.styles.customCss = '#message { font-size: 17px; }';
    doc.settings.visualModel = { common: {}, light: {}, dark: {} };
    assert.equal((await render()).message, '17px', `${theme} 固定字号`);
    doc.styles.customCss += '#timestamp { font-size: 17px; }';
    await page.evaluate(css => document.querySelector('#inheritance-theme').textContent = css, composeBlivechatThemeCss(doc) + createBlivechatAuxiliaryDisplayCss({ showTimestamp: true, maskUsername: false, showAvatar: true, showUsername: true }));
    assert.equal(await page.locator('yt-live-chat-text-message-renderer #timestamp').first().evaluate(n => getComputedStyle(n).fontSize), '17px', `${theme} 自定义时间字号`);
    console.log(`${theme} G/F、时间、打码与固定 CSS 通过`);
  }
  console.log('BLC 正文继承、独立用户名、G/F 比例、可视化正文编辑及付费/表情尺寸通过');
} finally {
  await browser?.close();
  await server.close();
}
