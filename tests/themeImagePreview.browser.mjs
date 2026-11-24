import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1500,height:1000}});
 await page.goto((process.env.THEME_IMAGE_TEST_URL||'http://127.0.0.1:1420')+'/tests/fixtures/themeImageMatrix.html?mode=native&theme=native-default');
 await page.getByRole('tab',{name:'可视化编辑',exact:true}).click();
 assert.equal(await page.locator('.native-scope-panel>summary').count(),0);
 for(const width of [1500,900,600]){
  await page.setViewportSize({width,height:1000});
  await page.locator('body > #root > div > aside').evaluateAll((ns,width)=>ns.forEach(n=>n.style.display=width<800?'none':''),width);
  const grids=await page.locator('.native-property-grid:visible').evaluateAll(ns=>ns.map(n=>({width:n.clientWidth,scroll:n.scrollWidth,columns:getComputedStyle(n).gridTemplateColumns.split(' ').length})));
  assert.ok(grids.length);
  assert.ok(grids.every(n=>n.scroll<=n.width+1));
  if(width===600)assert.ok(grids.every(n=>n.columns===1));
 }
 console.log('编辑范围常显，宽窄窗口属性网格无横向溢出');
}finally{await browser.close()}
