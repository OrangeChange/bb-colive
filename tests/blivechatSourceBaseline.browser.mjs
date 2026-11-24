import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 0, watch: null }, optimizeDeps: { noDiscovery: true }, logLevel: 'error' });
await server.listen();
let browser;
try {
  const { DEFAULT_BLIVECHAT_THEME_SETTINGS } = await server.ssrLoadModule('/src/compat/blivechat/theme.ts');
  const { composeBlivechatThemeCss } = await server.ssrLoadModule('/src/compat/blivechat/css.ts');
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 400, height: 800 } });
  await page.setContent(`<style>body{margin:0}</style><style id="source-baseline"></style><yt-live-chat-renderer><yt-live-chat-item-list-renderer><div id="items" class="yt-live-chat-item-list-renderer">
    <yt-live-chat-text-message-renderer><div id="author-photo" class="yt-live-chat-text-message-renderer"><img width="24" height="24"></div><div id="content" class="yt-live-chat-text-message-renderer"><span id="author-name" class="yt-live-chat-author-chip">用户名</span><span id="message" class="yt-live-chat-text-message-renderer">正文<img class="emoji yt-live-chat-text-message-renderer" width="159" height="60"><img class="emoji blc-large-emoji yt-live-chat-text-message-renderer" width="60" height="60"></span></div></yt-live-chat-text-message-renderer>
    <yt-live-chat-paid-message-renderer><div id="author-name" class="yt-live-chat-paid-message-renderer">用户名</div><div id="content" class="yt-live-chat-paid-message-renderer">正文</div></yt-live-chat-paid-message-renderer>
    <yt-live-chat-membership-item-renderer><div id="header-subtext" class="yt-live-chat-membership-item-renderer">新会员</div></yt-live-chat-membership-item-renderer>
  </div></yt-live-chat-item-list-renderer></yt-live-chat-renderer>`);
  const measure = async css => {
    await page.evaluate(css => { document.querySelector('#source-baseline').textContent = css; }, css);
    return page.evaluate(() => {
      const out = {};
      for (const selector of ['yt-live-chat-text-message-renderer', 'yt-live-chat-text-message-renderer #author-photo', 'yt-live-chat-text-message-renderer #author-photo img', 'yt-live-chat-text-message-renderer .emoji', 'yt-live-chat-text-message-renderer .blc-large-emoji', 'yt-live-chat-paid-message-renderer #author-name', 'yt-live-chat-paid-message-renderer #content', 'yt-live-chat-membership-item-renderer #header-subtext']) {
        const node = document.querySelector(selector); if (!node) continue;
        const s = getComputedStyle(node);
        out[selector] = Object.fromEntries(['fontSize', 'lineHeight', 'padding', 'marginRight', 'width', 'height'].map(key => [key, s[key]]));
      }
      return out;
    });
  };
  for (const name of ['BLC 原版默认', '经典', '仿微信']) {
    const baseCss = fs.readFileSync(`src-tauri/style-distribution/blc/${name}/base.css`, 'utf8');
    const doc = { mode: 'blivechat', settings: { ...DEFAULT_BLIVECHAT_THEME_SETTINGS }, styles: { baseCss, visualCss: '', customCss: '' } };
    const expected = await measure(baseCss);
    const actual = await measure(composeBlivechatThemeCss(doc));
    assert.deepEqual(actual, expected, `${name} 默认尺寸与来源一致`);
    if (name !== 'BLC 原版默认') {
      for (const [g, f] of [[2, 1], [1, 1.5]]) {
        Object.assign(doc.settings, { globalScale: g, fontScale: f });
        const expected = await measure(baseCss + `\nyt-live-chat-renderer{--base-size:${g}px;--font-base-size:calc(${f} * var(--base-size));}`);
        assert.deepEqual(await measure(composeBlivechatThemeCss(doc)), expected, `${name} G=${g} F=${f}`);
      }
    }
    doc.styles.customCss = '#message{font-size:17px;line-height:18px}';
    await measure(composeBlivechatThemeCss(doc));
    assert.equal(await page.locator('yt-live-chat-text-message-renderer #message').first().evaluate(n => getComputedStyle(n).fontSize), '17px');
    doc.styles.customCss = '';
    await measure(composeBlivechatThemeCss(doc));
    await page.locator('#items.yt-live-chat-item-list-renderer > *').first().evaluate(n => n.dataset.eventMotion = 'none');
    assert.equal(await page.locator('#items.yt-live-chat-item-list-renderer > *').first().evaluate(n => getComputedStyle(n).animationName), 'none', `${name} 整条动画由宿主控制`);
    doc.styles.customCss = '@keyframes decorate{to{opacity:.5}} #message .emoji{animation:decorate 1s infinite}';
    await measure(composeBlivechatThemeCss(doc));
    assert.equal(await page.locator('#message .emoji').first().evaluate(n => getComputedStyle(n).animationName), 'decorate', '内部装饰动画保留');
    doc.styles.customCss += ' #items.yt-live-chat-item-list-renderer > *{animation:decorate 2s infinite}';
    await measure(composeBlivechatThemeCss(doc));
    assert.equal(await page.locator('#items.yt-live-chat-item-list-renderer > *').first().evaluate(n => getComputedStyle(n).animationName), 'decorate', '手写 custom 层仍可覆盖');
    console.log(name, '来源尺寸、比例、自定义字号与整条动画通过');
  }
} finally {
  await browser?.close();
  await server.close();
}
