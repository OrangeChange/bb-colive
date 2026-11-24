import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { nativeEventSamples } from './fixtures/nativeEventSamples.ts';
import { scopeThemeCss } from '../src/themes/themeCssScope.ts';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null }, logLevel: 'silent' });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 660, height: 1000 } });
const destination = 'docs/superpowers/acceptance/2026-11-13-native-bubble';
await mkdir(destination, { recursive: true });
try {
  const { EventRow } = await server.ssrLoadModule('/src/components/EventRow.tsx');
  const rows = nativeEventSamples.filter(item => item.handling === 'row').map(item => renderToStaticMarkup(React.createElement(EventRow, { ev: item.event, liveLayout: true })) ).join('');
  const foundation = await readFile('src/themes/nativeDefaultStyle.generated.css', 'utf8');
  const theme = scopeThemeCss(await readFile('src/themes/nativeBubbleTheme.css', 'utf8'), '.theme-surface');
  const results = [];
  for (const dark of [false, true]) {
    for (const [size, width] of [[16, 480], [16, 320], [20, 320], [24, 260]]) {
      await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;padding:16px;background:${dark ? '#171820' : '#eef0f4'}}${foundation}${theme}</style><div class="${dark ? 'dark' : ''}"><div class="event-area theme-surface live" style="width:${width}px;--event-base-size:${size}px;--event-config-avatar-size:24px;--font-ui:MiSans,sans-serif"><div class="event-list">${rows}</div></div></div>`);
      const metrics = await page.locator('.event-area').evaluate(area => ({
        rows: area.querySelectorAll('.event-normal').length,
        overflow: [...area.querySelectorAll('.event-normal')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.className),
        canvas: getComputedStyle(area).backgroundColor,
        gift: getComputedStyle(area.querySelector('.type-gift .event-card')).backgroundColor,
        fonts: ['.type-gift .price', '.type-gift .quantity', '.type-guard .guard-duration', '.activity-status', '.honor-milestone'].map(selector => getComputedStyle(area.querySelector(selector)).fontFamily),
      }));
      results.push({ dark, size, width, ...metrics });
      await page.screenshot({ path: `${destination}/${dark ? '深色' : '浅色'}-${size}-${width}.png`, fullPage: true });
      assert.deepEqual(metrics.overflow, [], JSON.stringify({ dark, size, width, overflow: metrics.overflow }));
      assert.equal(metrics.canvas, 'rgba(0, 0, 0, 0)');
      assert.ok(metrics.fonts.every(font => font.includes('MiSans') && !/monospace|Georgia/.test(font)), '所有数值及成就文字均沿用MiSans');
    }
  }
  await writeFile(`${destination}/组件检查.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
  await server.close();
}
