import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {build} from 'vite';
import postcss from 'postcss';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
let browser;
try{
 const bundled=await build({configFile:false,define:{'process.env.NODE_ENV':JSON.stringify('production')},esbuild:{jsx:'automatic'},build:{write:false,minify:false,lib:{entry:'tests/fixtures/reviewAppearance.tsx',formats:['iife'],name:'ReviewAppearance'},rollupOptions:{output:{inlineDynamicImports:true}}},logLevel:'silent'});
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:900,height:750}});
 page.on('pageerror',error=>console.error(error.message));page.setDefaultTimeout(10000);
 await page.setContent('<div id="root"></div>');
 await page.addScriptTag({content:(Array.isArray(bundled)?bundled[0]:bundled).output.find(x=>x.type==='chunk').code});
 const assets=await readdir('dist/assets');const utilities=postcss.parse(await readFile('dist/assets/'+assets.find(x=>/^register-.*\.css$/.test(x)),'utf8'));
 for(const node of [...utilities.nodes])if(node.type!=='atrule'||node.name!=='layer'||!['theme','base','utilities'].includes(node.params))node.remove();
 await page.addStyleTag({content:utilities.toString()+await readFile('src/components/settingsExperience.css','utf8')+await readFile('src/archiveEventStyle.css','utf8')+(await readFile('src/App.css','utf8')).replace(/^@import[^;]+;|^@source[^;]+;/gm,'')});
 await page.getByRole('button',{name:'样式设置',exact:true}).click();
 assert.equal(await page.locator('input[type=range]').count(),0);
 assert.equal(await page.getByRole('spinbutton',{name:'基准字号',exact:true}).count(),1);
 await page.getByRole('radiogroup',{name:'身份标记形式'}).getByText('文字',{exact:true}).click();
 const prefs=await page.evaluate(()=>window.reviewSettings.getState().reviewStyleSettings);
 assert.equal(prefs.identityDisplayMode,'text');
 for(const selector of ['span.guard-badge','.streamer-badge:not(.identity-icon)','.mod-badge:not(.identity-icon)','span.wealth-medal'])assert.equal(await page.locator('.event '+selector).count(),1,selector);
 assert.equal(await page.locator('.fan-medal').evaluate(e=>getComputedStyle(e).fontWeight),'400');
 await page.getByRole('button',{name:'完成',exact:true}).click();await page.getByRole('button',{name:'样式设置',exact:true}).click();
 assert.equal(await page.getByRole('radiogroup',{name:'身份标记形式'}).getByLabel('文字',{exact:true}).isChecked(),true);
 await page.getByRole('radiogroup',{name:'身份标记形式'}).getByText('图标',{exact:true}).click();
 assert.equal(await page.locator('.event .identity-icon').count(),2);
 assert.equal(await page.locator('.event img.guard-badge').count(),1);
 for(const scale of [1,1.25,1.5]){await page.setViewportSize({width:Math.round(900/scale),height:Math.round(750/scale)});const r=await page.locator('dialog').boundingBox();assert(r.x>=0&&r.x+r.width<=Math.round(900/scale)+1&&r.y>=0&&r.y+r.height<=Math.round(750/scale)+1,'缩放后弹窗完整可见');}
 await page.screenshot({path:'C:/Users/Orange/AppData/Local/Temp/review-settings-final.png'});
 console.log('回看实际设置控件、统一身份形式、粉丝牌字重及缩放布局通过');
}finally{await browser?.close();}

