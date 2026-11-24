import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const css = readFileSync(new URL("../src/App.css", import.meta.url), "utf8");

test("副窗口颜色混合按实际底色和透明度呈现，透明材质清除表面", async () => {
  const browser = await chromium.launch({channel:"msedge",headless:true});
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="surface"></div>');
    await page.addStyleTag({content:css});
    const results = await page.evaluate(() => {
      const surface = document.getElementById('surface');
      const canvas = document.createElement('canvas');canvas.width=canvas.height=1;
      const context = canvas.getContext('2d');
      const results = [];
      for (const className of ['display-window','gift-window']) {
        surface.className=className;
        surface.removeAttribute('style');surface.removeAttribute('data-material');
        const defaults=getComputedStyle(surface);
        results.push({kind:'default',className,opacity:defaults.getPropertyValue('--display-window-opacity').trim(),color:defaults.getPropertyValue('--display-window-surface').trim()});
        for (const color of ['#ffffff','#101010']) for (const opacity of [0,18,65,100]) for (const material of ['solid','glass','transparent']) {
          surface.dataset.material=material;
          surface.style.setProperty('--display-window-surface',color);
          surface.style.setProperty('--display-window-opacity',`${opacity}%`);
          const computed=getComputedStyle(surface);
          context.clearRect(0,0,1,1);context.fillStyle=computed.backgroundColor;context.fillRect(0,0,1,1);
          results.push({kind:'surface',className,color,opacity,material,rgba:[...context.getImageData(0,0,1,1).data],image:computed.backgroundImage,shadow:computed.boxShadow,radius:computed.borderRadius,backdrop:computed.backdropFilter});
        }
      }
      return results;
    });
    for (const result of results) {
      if (result.kind==='default') {
        assert.equal(result.opacity,'18%');assert.equal(result.color,'#fff');continue;
      }
      const label=`${result.className} ${result.material} ${result.color} ${result.opacity}%`;
      const alpha=result.material==='transparent'||result.material==='glass'?0:Math.round(255*result.opacity/100);
      assert.equal(result.rgba[3],alpha,label);
      if (alpha>0) for (const channel of result.rgba.slice(0,3)) assert.ok(Math.abs(channel-(result.color==='#ffffff'?255:16))<=1,label);
      if (result.material==='glass') assert.equal(result.image,'none',label);
      if (result.material==='transparent') {
        assert.equal(result.image,'none',label);assert.equal(result.shadow,'none',label);
        assert.equal(result.radius,'0px',label);assert.equal(result.backdrop,'none',label);
      }
    }
  } finally { await browser.close(); }
});
