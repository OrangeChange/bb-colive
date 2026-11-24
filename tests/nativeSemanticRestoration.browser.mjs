import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
import {NATIVE_PART_SELECTORS} from '../src/themes/nativeSemanticSelectors.ts';

const {chromium} = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.NATIVE_SEMANTIC_ACCEPTANCE_DIR || 'design/native-semantic-restoration-20261121';
await mkdir(output, {recursive:true});
const server = await createServer({server:{host:'127.0.0.1',port:0,strictPort:false,hmr:false},logLevel:'error'});
const browser = await chromium.launch({channel:'chrome',headless:true});
const page = await browser.newPage({viewport:{width:820,height:920},deviceScaleFactor:1});
const results = [];
try {
  await server.listen();
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:|localhost:)/,route=>route.abort());
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/nativeLayoutRepair.html');
  await page.waitForFunction(()=>typeof window.setNativeLayoutCase==='function');
  const longNames = ['长昵称用户在头像之后开始并自然折行验证筛选操作','BilibiliCollector2026'];
  const filterCases = [];
  await page.evaluate(() => {
    window.addEventListener('fixture-user-filter',event => window.filterActivations.push(event.detail));
  });
  for (const theme of ['default','card','bubble']) for (const width of [260,220]) for (const filterName of longNames) {
    const state = {semantic:true,theme,width,baseSize:24,avatar:true,icons:true,target:'live',filterName};
    await page.evaluate(state => window.setNativeLayoutCase(state), state);
    await page.locator('.type-interaction .username', {hasText:filterName}).first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    for (const kind of ['chat','interaction']) {
      const row = page.locator('.type-'+kind).filter({has:page.locator('.username',{hasText:filterName})}).first();
      const username = row.getByRole('button',{name:'筛选用户：'+filterName,exact:true});
      const layout = await username.evaluate(el => {
        const row = el.closest('.event-layout');
        const avatar = row.querySelector('.avatar-wrap').getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(el.querySelector('.username-text'));
        const lines = [...range.getClientRects()];
        return {role:el.getAttribute('role'),tabIndex:el.tabIndex,lines:lines.length,
          avatarTop:avatar.top,avatarBottom:avatar.bottom,firstLineCenter:lines[0].y+lines[0].height/2,
          left:row.getBoundingClientRect().left,secondLine:lines[1]?.left};
      });
      assert.ok(layout.firstLineCenter>=layout.avatarTop-1 && layout.firstLineCenter <= layout.avatarBottom+1,
        theme + ' '+width+' '+kind+' 头像独占行 '+JSON.stringify(layout));
      assert.ok(layout.lines>1 && Math.abs(layout.left-layout.secondLine)<=1, theme+' 长昵称续行应回到内容左边界');
      assert.equal(layout.tabIndex, 0);
      filterCases.push({theme,width,kind,filterName,...layout});
      await username.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      assert.ok(await username.evaluate(el => el===document.activeElement));
      await page.evaluate(() => {window.filterActivations=[];});
      await page.keyboard.press('Enter');
      assert.deepEqual(await page.evaluate(()=>window.filterActivations),[filterName]);
      await page.evaluate(() => {
        window.addEventListener('keydown', event => window.filterSpacePrevented=event.defaultPrevented, {once:true});
      });
      await page.keyboard.press('Space');
      assert.ok(await page.evaluate(()=>window.filterSpacePrevented),'空格防滚动');
      const point = await username.evaluate(el => {
        const range = document.createRange();
        range.selectNodeContents(el.querySelector('.username-text'));
        const first = range.getClientRects()[0];
        return {x:first.left+first.width/2,y:first.top+first.height/2};
      });
      await page.mouse.click(point.x,point.y);
      assert.deepEqual(await page.evaluate(()=>window.filterActivations),[filterName,filterName,filterName]);
    }
  }
  await writeFile(output+'/filter-user.json',JSON.stringify(filterCases,null,2));
  for (const theme of ['default','card','bubble']) for (const [width,baseSize] of [[480,16],[260,24]]) for (const dark of [false,true]) {
    const state={semantic:true,theme,width,baseSize,dark,avatar:true,icons:true,target:'live',gradient:true};
    await page.evaluate(state=>window.setNativeLayoutCase(state),state);
    const area = page.locator('.fixture-surface');
    await area.locator('.type-guard-honor').waitFor();
    await page.evaluate(async()=>{
      await document.fonts.ready;
      const images=[...document.querySelectorAll('.fixture-surface img')];
      images.forEach(img=>img.loading='eager');
      await Promise.allSettled(images.filter(img=>!img.closest('details:not([open])')).map(img=>img.decode()));
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    });
    const geometry=await area.evaluate((area,selectors)=>{
      const issues=[];
      const rect=e=>e.getBoundingClientRect();
      const overlap=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>Math.min(a.height,b.height)*0.35;
      const textRects=e=>{
        const walk=document.createTreeWalker(e,NodeFilter.SHOW_TEXT), range=document.createRange(), rects=[];
        while(walk.nextNode()) if(walk.currentNode.textContent.trim()){range.selectNodeContents(walk.currentNode);rects.push(...range.getClientRects());}
        return rects.filter(r=>r.width>0);
      };
      for(const event of area.querySelectorAll('.event-normal')){
        const bounds=rect(event), content=event.querySelector('.content');
        const type=event.className.match(/type-[\w-]+/)[0];
        for(const r of textRects(content))if(r.right>bounds.right+1||r.left<bounds.left-1) issues.push(type+' 正文超出边界');
        if(event.scrollWidth>event.clientWidth+1) issues.push(type+' 事件横向溢出');
        for(const [a,b] of [['.user','.content'],['.honor-icon','.honor-message'],['.activity-status','.redpocket'],['.activity-status','.activity-title'],['.sc-price','.user']]){
          const first=event.querySelector(a),second=event.querySelector(b);
          if(!first||!second||first.contains(second)||second.contains(first))continue;
          const firstRects=first.matches('.honor-icon,.activity-status,.sc-price')?[rect(first)]:textRects(first);
          if(firstRects.some(r=>textRects(second).some(t=>overlap(r,t))))issues.push(type+' '+a+' 覆盖 '+b);
        }
        for(const count of event.querySelectorAll('.gift-count,.blind-gift-count,.guard-duration,.lottery-count,.redpocket-count')){
          const previous=count.previousElementSibling;
          if(!previous)continue;
          const texts=textRects(previous), digits=textRects(count);
          if(!texts.length||!digits.length)continue;
          const left=texts.at(-1),right=digits[0];
          if(Math.abs(left.y-right.y)<5&&right.left-left.right>1)issues.push(type+' 数量前留白 '+(right.left-left.right));
        }
      }
      for(const state of area.querySelectorAll('.activity-status')){
        if(!state.textContent.trim())issues.push('活动状态缺少时间或结果');
      }
      const gift=area.querySelector('.gift-normal'),content=gift.querySelector('.content');
      const nodes=Object.fromEntries(['giftImage','giftGroup','giftPrice','giftName','giftCount'].map(id=>[id,gift.querySelector(selectors[id])]));
      for(const id of ['giftImage','giftGroup','giftPrice'])if(nodes[id]?.parentElement!==content)issues.push('编辑器部件父级 '+id);
      for(const id of ['blindGiftGroup','blindGiftImage','giftSourcePrice','honorHeading','honorSummary','honorMilestone','guardContent','guardDays'])if(!area.querySelector(selectors[id]))issues.push('编辑器未命中 '+id);
      const chat=area.querySelector('.type-chat .message').closest('.type-chat');
      const interaction=area.querySelector('.type-interaction');
      const honorImage=area.querySelector('.honor-icon'); if(rect(honorImage).width<1||rect(honorImage).height<1)issues.push('荣誉图标无尺寸 '+getComputedStyle(honorImage.parentElement).gridTemplateColumns+' '+JSON.stringify(rect(honorImage).toJSON()));
      if(honorImage.matches('button')&&getComputedStyle(honorImage).pointerEvents==='none')issues.push('荣誉特效不可点击');
      const honorContent=area.querySelector('.type-guard-honor .content');
      if(rect(area).width<=320 && rect(honorContent).width<rect(area).width*0.55)issues.push('成就正文过窄 '+rect(honorContent).width);
      if(rect(area).width===480){
        const event=area.querySelector('.lottery-result'), summary=event.querySelector('summary');
        if(!textRects(event.querySelector('.result-description')).some(line=>overlap({...line.toJSON(),left:0,right:1000},rect(summary))))issues.push('宽幅摘要与名单分行');
      }
      const flows=[chat,interaction].map(row=>{
        const el=row.querySelector('.message,.action');
        const old=el.textContent;
        el.append(document.createTextNode('让这条消息跨过多行，观察后续行文字是否回到内容左边界。'.repeat(5)));
        const lines=textRects(el);el.lastChild.remove();
        const layout=row.querySelector('.event-layout'), avatar=row.querySelector('.avatar-wrap');
        const usernameRows=textRects(row.querySelector('.username')), ar=rect(avatar);
        if(!usernameRows.some(r=>r.y+r.height/2>=ar.top-1 && r.y+r.height/2<=ar.bottom+1))issues.push('头像未与用户名同排');
        return {text:old.slice(0,12),left:rect(layout).left,avatarRight:rect(avatar).right,
          secondLine:lines.find(r=>r.top>lines[0].top+3)?.left};
      });
      return {issues:[...new Set(issues)],flows,chatBackground:getComputedStyle(chat.querySelector('.event-card')).backgroundColor,
        eventCount:area.querySelectorAll('.event-normal').length, sample:gift.textContent};
    },NATIVE_PART_SELECTORS);
    await page.mouse.move(810,0);
    await page.evaluate(()=>document.activeElement?.blur());
    await area.screenshot({path:output+'/'+theme+'-'+(dark?'dark':'light')+'-'+width+'-'+baseSize+'.png',animations:'disabled'});
    if(theme==='default'&&!dark)await area.locator('.type-guard-honor').screenshot({path:output+'/default-honor-'+width+'.png'});
    for(const flow of geometry.flows) if(Math.abs(flow.left-flow.secondLine)>1 || flow.secondLine===undefined) geometry.issues.push('续行缩进 '+JSON.stringify(flow));
    if(theme==='default'&&geometry.chatBackground!=='rgba(0, 0, 0, 0)')geometry.issues.push('默认弹幕底色 '+geometry.chatBackground);
    const winners=area.locator('.winner-list').first();
    await winners.locator('summary').click();
    assert.equal(await winners.getAttribute('open'),'');
    await winners.locator('summary').click();
    if(width===480&&!dark){
      for(const order of [['gift-price','gift-icon','gift'],['gift','gift-price','gift-icon']]){
        const custom=await page.addStyleTag({content:'@layer custom {.event.gift-normal .content{display:flex;flex-wrap:wrap}'+order.map((c,i)=>'.event.gift-normal .content > .'+c+'{order:'+i+';margin-inline:0}').join('')+'}'});
        const positions=await area.locator('.gift-normal .content').first().evaluate((body,order)=>order.map(s=>{const r=body.querySelector(':scope > .'+s).getBoundingClientRect();return [r.x,r.y,r.width,r.height]}),order);
        if(!positions.every(([x,y,w,h],i)=>w>0&&h>0&&(!i||x>=positions[i-1][0]+positions[i-1][2]-1||y>=positions[i-1][1]+positions[i-1][3]-1)))geometry.issues.push('价格与图片换序 '+order.join(','));
        await custom.evaluate(node=>node.remove());
      }
    }
    results.push({state,...geometry});
    console.log(theme,width,dark,geometry.issues);
  }
  const {createBuiltinNativeTheme}=await server.ssrLoadModule('/src/themes/nativeBuiltinThemes.ts');
  const {renderManagedNativeCss}=await server.ssrLoadModule('/src/themes/nativeManagedCss.ts');
  for(const theme of ['default','card','bubble']){
    const state={theme,width:260,baseSize:24,avatar:false,icons:false,semantic:true,target:'live'};
    await page.evaluate(state=>window.setNativeLayoutCase(state),state);
    await page.waitForFunction(()=>!document.querySelector('.type-guard-honor .honor-icon'));
    const area=page.locator('.fixture-surface');
    assert.equal(await area.locator('.type-chat .avatar-wrap,.type-guard .guard-purchase-icon').count(),0);
    const model=createBuiltinNativeTheme('native-'+theme).settings;
    model.visualModel.common['gift|all|giftPrice']={color:{source:'custom',value:'#123456'}};
    const dimensions = {width:{source:'custom',value:36},height:{source:'custom',value:27}};
    model.visualModel.common['gift|all|giftImage']={...dimensions,borderRadius:{source:'custom',value:12}};
    model.visualModel.common['gift|all|blindGiftImage']=dimensions;
    const managed=await page.addStyleTag({content:'@layer config {'+renderManagedNativeCss(model)+'}'});
    const price=area.locator('.gift-normal .gift-price').first(), icon=area.locator('.gift-normal .gift-icon').first();
    assert.equal(await price.evaluate(e=>getComputedStyle(e).color),'rgb(18, 52, 86)');
    assert.equal(await icon.evaluate(e=>getComputedStyle(e).width),'36px');
    const replacement = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="24"><rect width="48" height="24" fill="#12ab56"/></svg>');
    const pictureStyle = await page.addStyleTag({content: `@layer custom {
      .event .gift-icon { object-fit: cover; object-position: 25% 75%; }
      .event :is(img.gift-icon, .gift-icon > img) { content: url("${replacement}"); }
    }`});
    for (const clickable of [true, false]) {
      await page.evaluate(state => window.setNativeLayoutCase(state), {...state, clickable});
      const host = area.locator(`.gift-normal ${clickable ? 'button' : 'img'}.gift-icon`).first();
      const picture = clickable ? host.locator('img') : host;
      await picture.waitFor();
      const metrics = await picture.evaluate(img => {
        const box = img.getBoundingClientRect();
        const hostBox = img.closest('.gift-icon').getBoundingClientRect();
        const style = getComputedStyle(img);
        return [box.width, box.height, hostBox.width, hostBox.height, style.objectFit, style.objectPosition];
      });
      assert.deepEqual(metrics, [36, 27, 36, 27, 'cover', '25% 75%']);
      const bitmap = await host.screenshot({animations: 'disabled'});
      const center = await page.evaluate(async data => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + data;
        await img.decode();
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.drawImage(img, 0, 0);
        const pixel = (x,y) => Array.from(ctx.getImageData(x,y,1,1).data);
        return {middle:pixel(img.width >> 1,img.height >> 1),corner:pixel(1,1)};
      }, bitmap.toString('base64'));
      assert.deepEqual(center.middle, [18, 171, 86, 255], theme + ' 礼物图资源替换');
      assert.notDeepEqual(center.corner, center.middle, theme + ' 礼物图圆角裁切');
      assert.equal(await picture.evaluate(img => getComputedStyle(img).borderRadius), '12px');
      if (clickable) {
        const border = await page.addStyleTag({content:'@layer custom {.event button.gift-icon {border: 2px solid #123456;}}'});
        await host.evaluate(button => button.addEventListener('click', () => button.dataset.borderClicked='yes', {once:true}));
        const frame = await host.boundingBox();
        await page.mouse.click(frame.x + 1, frame.y + frame.height / 2);
        assert.equal(await host.getAttribute('data-border-clicked'), 'yes');
        await border.evaluate(style => style.remove());
      }
      await page.evaluate(state => window.setNativeLayoutCase(state), {...state, dark:true, clickable});
      for (const [override, expected] of [
        [{width:{source:'custom',value:42}}, [42,27]],
        [{width:{source:'custom',value:42},height:{source:'custom',value:42}}, [42,42]],
        [{}, [36,27]],
      ]) {
        model.visualModel.dark['gift|all|giftImage'] = override;
        model.visualModel.dark['gift|all|blindGiftImage'] = override;
        const sheet = await page.addStyleTag({content:'@layer config {'+renderManagedNativeCss(model)+'}'});
        for (const image of [picture,area.locator('img.blind-gift-icon').first()]) {
          const size = await image.evaluate(el => [el.getBoundingClientRect().width,el.getBoundingClientRect().height]);
          assert.deepEqual(size,expected,theme + ' 礼物和盲盒的明暗尺寸继承');
        }
        await sheet.evaluate(style => style.remove());
      }
    }
    await pictureStyle.evaluate(node => node.remove());
    await managed.evaluate(node=>node.remove());
    const square = await page.addStyleTag({content:'@layer custom {.event.type-gift {--gift-icon-size:33px;--blind-gift-icon-size:31px;}}'});
    for (const [selector,dimension] of [['.gift-icon',33],['.blind-gift-icon',31]]) {
      const size = await area.locator(selector).first().evaluate(el => [el.getBoundingClientRect().width,el.getBoundingClientRect().height]);
      assert.deepEqual(size,[dimension,dimension],theme + ' 公共方形尺寸变量');
    }
    await square.evaluate(style => style.remove());
  }
  await page.evaluate(()=>window.setNativeLayoutCase({theme:'default',semantic:true,width:480,baseSize:16,avatar:true,target:'review'}));
  const archive=page.locator('.fixture-surface.review');
  await archive.locator('.event-surface-archive').first().waitFor();
  assert.equal(await archive.locator('.event-card').count(),0);
  assert.equal(await archive.locator('.gift-normal .content > .gift').count(),2);
  const awards = archive.locator('.redpocket-start .redpocket > .redpocket-awards .redpocket-award');
  assert.equal(await awards.count(),2);
  for (const count of await awards.locator('.redpocket-count').allTextContents()) assert.ok(Number(count.slice(1))>1);
  await archive.locator('.winner-list summary').first().click();
  assert.equal(await archive.locator('.winner-list').first().getAttribute('open'),'');
  await page.mouse.move(810,0);
  await archive.screenshot({path:output+'/review.png'});
  await writeFile(output+'/layout.json',JSON.stringify(results,null,2));
  const failures=results.filter(r=>r.issues.length).map(r=>[r.state.theme,r.state.width,r.state.dark,r.issues]);
  console.log(JSON.stringify(failures,null,2)); assert.equal(failures.length,0);
} finally {await browser.close();await server.close();}
