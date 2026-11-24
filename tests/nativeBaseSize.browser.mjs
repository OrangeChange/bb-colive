import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createServer} from 'vite';

const {chromium} = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = await createServer({server:{host:'127.0.0.1', port:0, hmr:false}, logLevel:'error'});
const browser = await chromium.launch({channel:'chrome', headless:true});
const page = await browser.newPage({viewport:{width:1000,height:900}, deviceScaleFactor:1});
const theme = process.env.NATIVE_BASE_THEME || 'default';
const avatarRatio = theme === 'card' ? 2 : 1.5;
const normalLine = theme === 'card' ? 1.5 : 1.25;
const bodyLine = theme === 'card' ? 1.4 : normalLine;
let caseId = 0;
const failures = [];
const relative = ratio => ({mode:'base-relative', ratio});
const fixed = value => ({mode:'fixed', value});
function visual(entries) {
  return {common:Object.fromEntries(entries.map(([part, properties]) => [
    'all|all|' + part, Object.fromEntries(Object.entries(properties).map(([key,value]) => [key,{source:'custom',value}]))
  ])), light:{}, dark:{}};
}
async function render(state = {}) {
  const id = ++caseId;
  await page.evaluate(state => window.setNativeLayoutCase(state), {
    theme, target:'live', baseSizeCase:true, baseSize:16, width:800, avatar:true,
    sampleKeys:['normal-gift','sc','guard','text'], ...state, caseId:id
  });
  await page.locator('[data-fixture-case="'+id+'"]').waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  });
}
async function measure(selector,property) {
  return page.locator(selector).first().evaluate((el,p)=>parseFloat(getComputedStyle(el)[p]),property);
}
function near(actual, expected, label) {
  if (Math.abs(actual-expected)>.51 || !Number.isFinite(actual)) failures.push(label+' 预期 '+expected+' 实际 '+actual);
}
async function sizes() {
  for (const baseSize of [12,16,24,32]) {
    for (const [size,expected] of [[null,avatarRatio*baseSize],[fixed(36),36],[relative(2),2*baseSize]]) {
      await render({baseSize, visualModel:size ? visual([['avatar',{width:size,height:size}]]) : undefined});
      near(await measure('.gift-normal .avatar-wrap','width'), expected, '头像 '+baseSize);
      const avatarColumn=await page.locator('.gift-normal .event-layout').evaluate(layout=>
        layout.querySelector('.event-header').getBoundingClientRect().left-layout.getBoundingClientRect().left-parseFloat(getComputedStyle(layout).columnGap));
      near(avatarColumn,expected,'头像列 '+baseSize);
      near(await measure('.event-row-slot-content[data-event-spacing]','paddingBottom'),baseSize*.25,'事件间距 '+baseSize);
    }
  }
  for (const part of ['card','header']) {
    await render({customCss:'.event .event-'+part+' { --event-font-size: 24px; }'});
    near(await measure('.type-superchat .username','fontSize'),24,'直接设置'+part+'字号参数');
    near(await measure('.type-superchat .message','fontSize'),part==='card'?24:16,'公开字号参数的正文作用域');
    if (theme!=='default') near(await measure('.type-superchat .sc-price .price-value','fontSize'),24*(theme==='card'?1.25:.875),'表头价格继承局部字号');
  }
  for (const baseSize of [16,24]) {
    for (const [part,username,message] of [['card',1.5,1.5],['header',1.5,1]]) {
      await render({baseSize, visualModel:visual([[part,{fontSize:relative(1.5)}]])});
      near(await measure('.type-superchat .username','fontSize'),baseSize*username,part+' 用户名');
      near(await measure('.type-superchat .message','fontSize'),baseSize*message,part+' 正文');
    }
    await render({baseSize, visualModel:visual([['message',{fontSize:relative(1.5)}],['price',{fontSize:fixed(28)}],['guardDuration',{fontSize:relative(1.5)}]])});
    for (const [sel,size] of [['.type-superchat .message',baseSize*1.5],['.type-chat .message',baseSize*1.5],['.gift-normal .price-unit',28],['.gift-normal .price-value',28],['.guard-duration .quantity-number',baseSize*1.5],['.guard-duration .quantity-unit',baseSize*1.5]]) {
      near(await measure(sel,'fontSize'),size,sel+' 字号');
      near(await measure(sel,'lineHeight'),Math.max(baseSize,size)*(sel.endsWith('.message') ? bodyLine : normalLine),sel+' 行高');
    }
    await render({baseSize,visualModel:visual([['message',{fontSize:relative(1.5),lineHeight:1.75}]])});
    near(await measure('.type-superchat .message','lineHeight'),baseSize*1.5*1.75,'正文显式行高');
  }
}
async function purchaseOrder() {
  await render({width:800,sampleKeys:['normal-gift'],customCss:'.event.type-gift .content > .price { order: -2; margin-inline-start: 0; } .event.type-gift .content > .gift-icon { order: 2; }'});
  const ordered=await page.locator('.gift-normal .event-content').evaluate(content=>{
    const price=content.querySelector('.price'), image=content.querySelector('.gift-icon');
    const before=price.getBoundingClientRect(),after=image.getBoundingClientRect();
    return price.parentElement===image.parentElement && (before.bottom<=after.top+1 || before.right<=after.left+1);
  });
  assert(ordered,'金额和主图可通过公开部件换序');
}
async function flow() {
  const user = {uid:'member',uname:'小明',guardLevel:1,isAdmin:true,wealthLevel:5,currentRank:1,medal:{level:12,name:'同好'}};
  for (const baseSize of [12,16,32]) {
    await render({width:theme==='bubble'?1100:800,baseSize,rank:true,designKeys:['body-big-emote','body-banner-emote','body-inline-emote'], timestamp:true,
      eventChanges:{danmuDeleted:true,danmuRepeatCount:8,user}});
    for (const kind of ['big','banner','inline']) {
      const image = page.locator('.'+kind+'-emote').first();
      await image.scrollIntoViewIfNeeded();
      await image.evaluate(img=>img.decode());
      const data = await image.evaluate(img=>{
        const row=img.closest('.event'), rect=e=>e.getBoundingClientRect(), center=e=>rect(e).top+rect(e).height/2;
        const repeat=row.querySelector('.repeat-count'), name=row.querySelector('.username');
        return {w:rect(img).width,h:rect(img).height,ratio:img.naturalWidth/img.naturalHeight,
          usernameSameLine:rect(name).top < rect(img).bottom && rect(name).bottom > rect(img).top,
          repeatSameLine:rect(repeat).top < rect(img).bottom && rect(repeat).bottom > rect(img).top,
          badgeCenters:['.rank-badge','.mod-badge','.wealth-medal','.guard-badge'].map(sel=>[sel,center(row.querySelector(sel))-center(row.querySelector('.fan-medal'))]),
          margin:parseFloat(getComputedStyle(img).marginLeft), repeat:rect(repeat).height};
      });
      if (kind==='banner') {near(data.h,1.25*baseSize,'横幅高度');near(data.w,data.h*data.ratio,'横幅宽高比');}
      if (kind==='big') near(Math.max(data.w,data.h),2.5*baseSize,'大表情上限');
      if (kind==='inline') near(data.margin,.125*baseSize,'小表情间距');
      if (kind!=='inline' && (!data.usernameSameLine || !data.repeatSameLine)) failures.push(kind+' 宽幅应同行 '+baseSize);
      for(const [selector,delta] of data.badgeCenters) near(delta,0,'同排粉丝牌与'+selector+'中心');
      near(data.repeat,1.25*baseSize,'连击标记高度');
      near(await measure('.rank-badge','minHeight'),baseSize,'排名标记高度');
    }
    await render({baseSize,rank:true,sampleKeys:['block','normal-gift','entry'],eventChanges:{user}});
    const centers=await page.locator('.system-message-title').evaluate(title=>{
      const rect=el=>el.getBoundingClientRect(),center=box=>box.top+box.height/2;
      const range=document.createRange();
      range.selectNodeContents(title.querySelector('.username-text'));
      return {avatar:center(rect(title.querySelector('.avatar-wrap'))),text:center(range.getBoundingClientRect()),
        icon:center(rect(title.closest('.system-message').querySelector('.system-message-icon')))};
    });
    if(Math.abs(centers.avatar-centers.text)>Math.max(1,baseSize*.125) || Math.abs(centers.icon-centers.text)>Math.max(1,baseSize*.125)) failures.push('系统首行中心 '+baseSize+' '+JSON.stringify(centers));
    const interaction=page.locator('.type-interaction:visible');
    if(await interaction.count()){
      const centers=await interaction.evaluate(row=>['.rank-badge','.mod-badge','.wealth-medal','.guard-badge','.fan-medal'].map(sel=>{
        const r=row.querySelector(sel).getBoundingClientRect();return r.top+r.height/2;
      }));
      near(Math.max(...centers)-Math.min(...centers),0,'互动同排徽章中心');
    }
    await render({baseSize,sampleKeys:['blind-gift','guard','honor'],timestamp:true});
    for(const selector of ['.gift-source','.guard-companion-days','.event-layout > .time'])
      near(await measure(selector,'marginTop'),0,selector+' 避免重复行距');
    near(await measure('.type-guard-honor .event-card','paddingTop'),.75*baseSize,'成就内边距');
    near(await measure('.honor-summary','marginTop'),.25*baseSize,'成就两行间距');
    near(await measure('.honor-milestone','marginLeft'),.25*baseSize,'成就数字前间距');
  }
}
async function layout() {
  const sampleKeys=['text','entry','normal-gift','guard','sc','honor','pocket-start','lottery-start','lottery-result','block','live-start','warning'];
  for (const baseSize of [16,24]) for(const contentScale of [1,1.25,1.5]) {
    for(const logicalWidth of [20*baseSize,20*baseSize+2]) {
      await render({baseSize,contentScale,width:logicalWidth*contentScale+16,sampleKeys});
      const geometry = await page.locator('.gift-normal').first().evaluate(el=>{
        const rect=sel=>el.querySelector(sel).getBoundingClientRect();
        const slot=el.closest('.event-row-slot-content');
        return {avatar:rect('.avatar-wrap').width,narrow:getComputedStyle(el.querySelector('.event-content')).gridColumnStart==='1',width:slot.clientWidth};
      });
      near(geometry.avatar,avatarRatio*baseSize*contentScale,'头像缩放一次');
      near(geometry.width,logicalWidth,'缩放后的可用宽度');
      if(geometry.narrow!==(logicalWidth<=20*baseSize)) failures.push('窄版切换 '+JSON.stringify({baseSize,contentScale,logicalWidth,geometry}));
    }
  }
  for(const [width,expected] of [[460,true],[500,false]]){
    await render({width,baseSize:24,noSlots:true,sampleKeys:['normal-gift']});
    const column=await page.locator('.gift-normal .event-content').evaluate(e=>getComputedStyle(e).gridColumnStart);
    assert.equal(column==='1',expected,'无槽位预览按画布宽度切换');
  }
  for(const [width,baseSize,avatar,icons] of [[800,8,true,true],[480,15.5,true,true],[800,20,false,false],[800,24,true,true],[260,32,true,true],[260,48,false,false],[160,72,true,true],[160,72,false,false]]) {
    const user={uid:'viewer',uname:'长昵称的观众来到了直播间',guardLevel:1,currentRank:2,medal:{level:29,name:'月光下的粉丝团'}};
    await render({width,baseSize,avatar,icons,sampleKeys,timestamp:true,eventChanges:{user,sc:{price:987654321.12,message:'付费留言完整保留'},guard:{level:1,count:1234567,unit:'月',priceRmb:12345678.99}}});
    await page.locator('.lottery-result .winner-list-toggle').click();
    const issues=await page.locator('.fixture-surface').evaluate((area,{baseSize,width,avatar,theme})=>{
      const issues=[];
      const rect=e=>e.getBoundingClientRect();
      for(const row of area.querySelectorAll('.event-normal')){
        if(!row.getClientRects().length) continue;
        const layout=row.querySelector('.event-layout'),av=layout.querySelector(':scope > .avatar-wrap'),bounds=rect(row);
        const outsideTime=theme==='bubble' && row.querySelector('.event-layout > .time') && getComputedStyle(row.querySelector('.event-layout > .time')).position==='absolute';
        if(!outsideTime && row.scrollWidth>row.clientWidth+1)issues.push('横向溢出 '+row.className.match(/type-[\w-]+/)[0]+' '+row.scrollWidth+'/'+row.clientWidth);
        if(width>20*baseSize && row.matches('.type-guard,.type-gift,.type-superchat,.type-lottery,.type-redpocket,.type-guard-honor')){
          const content=layout.querySelector('.event-header,:scope > .content');
          if(av && Math.abs(rect(content).left-rect(av).right-baseSize*.5)>1)issues.push('头像文字列 '+row.className.match(/type-[\w-]+/)[0]+' '+(rect(content).left-rect(av).right));
          if(!av && !avatar && Math.abs(rect(content).left-rect(layout).left)>1)issues.push('隐藏头像占位');
        }
        if(av && getComputedStyle(layout).display==='grid' && row.matches('.gift-normal,.type-guard,.type-superchat') && Math.abs(rect(av).top-rect(layout.querySelector('.event-header')).top)>1)issues.push('多行表头头像未对齐首行');
        for(const el of layout.querySelectorAll('.username,.medal-name,.medal-level,.price,.quantity,.event-content,.honor-message,.activity-status,.lottery-required-gift,.time,.system-message-copy,.rank-badge,.status.deleted')){
          if(!el.getClientRects().length)continue;
          if(rect(el).width<=0)issues.push('文字宽度为零 '+el.className);
          const allowed=outsideTime && el.matches('.time') ? rect(row.closest('.event-row-slot-content')) : bounds;
          const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
          const range=document.createRange();let node;
          while(node=walker.nextNode()){
            if(!node.textContent.trim())continue;
            range.selectNodeContents(node);
            for(const r of range.getClientRects())if(r.width>0 && (r.left<allowed.left-1 || r.right>allowed.right+1))issues.push('文字越界 '+el.className+' '+node.textContent);
          }
        }
      }
      return [...new Set(issues)];
    },{width,baseSize,avatar,theme});
    failures.push(...issues.map(error=>width+'/'+baseSize+' '+error));
  }
}
async function captures(output) {
  await mkdir(output,{recursive:true});
  for (const [name,state] of [
    ['light-480-16',{width:480,baseSize:16,designKeys:['body-big-emote','gift-band-0','guard-1-开通','honor-1000','redpocket-1']}],
    ['dark-260-24',{dark:true,width:260,baseSize:24,designKeys:['body-big-emote','gift-band-0','guard-1-开通','honor-1000','redpocket-1']}],
    ['identity',{width:800,baseSize:24,rank:true,sampleKeys:['text','entry','block'],eventChanges:{user:{uid:'viewer',uname:'海上月',guardLevel:1,isAdmin:true,wealthLevel:5,currentRank:1,medal:{level:19,name:'海上月'}}}}],
    ['wide',{width:800,baseSize:16,designKeys:['body-banner-emote','body-big-emote','gift-band-0','redpocket-1','honor-1000']}],
    ['narrow',{width:260,baseSize:24,designKeys:['body-banner-emote','guard-1-开通','honor-1000']}],
    ['zoom',{width:480,baseSize:24,contentScale:1.5,designKeys:['gift-band-0','redpocket-1']}]
  ]) {
    await render({...state,timestamp:true});
    assert(await page.evaluate(()=>[...document.fonts].some(face=>face.family==='MiSans' && face.status==='loaded')));
    await page.mouse.move(999,0);
    await page.locator('.fixture-surface').screenshot({path:join(output,name+'.png'),animations:'disabled'});
  }
}
async function themeOverrides() {
  const output=process.env.NATIVE_BASE_DETAIL_SCREENSHOTS;
  if(output) await mkdir(output,{recursive:true});
  if(theme==='card') {
    for (const [value,model] of [[1.4,undefined],[2,visual([['card',{lineHeight:2}]])]]) {
      await render({width:480,sampleKeys:['translated-sc','live-start'],visualModel:model});
      near(await measure('.bili-translation','fontSize'),14,'译文默认字号');
      near(await measure('.bili-translation','lineHeight'),14*value,'译文随卡片行高');
      near(await measure('.lifecycle-time','lineHeight'),12*value,'开播时间随卡片行高');
    }
    if(output) await page.locator('.fixture-surface').screenshot({path:join(output,'card-translation.png')});
    return;
  }
  if(theme!=='bubble') return;
  const user={uid:'long',uname:'这是一个比较长而且没有空格的中文昵称',guardLevel:1,medal:{level:29,name:'月光下的粉丝团'}};
  for(const width of [480,360,200]){
    for(const timestampSize of [12,40]){
      await render({width,timestamp:true,sampleKeys:['normal-gift','guard'],eventChanges:{user},
        visualModel:visual([['timestamp',{fontSize:fixed(timestampSize)}]])});
      const geometry=await page.locator('.event-normal').evaluateAll(rows=>rows.map(row=>{
        const bounds=row.closest('.event-row-slot-content').getBoundingClientRect();
        const header=row.querySelector('.event-header').getBoundingClientRect(),content=row.querySelector('.event-content').getBoundingClientRect();
        const price=row.querySelector('.event-content .price').getBoundingClientRect(),time=row.querySelector('.time').getBoundingClientRect();
        return {width:content.width,wrapped:content.top>=header.bottom-1,inside:time.left>=bounds.left-1 && time.right<=bounds.right+1,
          overlap:time.left<price.right-1 && time.right>price.left+1 && time.top<price.bottom-1 && time.bottom>price.top+1};
      }));
      for(const g of geometry) assert(g.width>=16 && g.wrapped && g.inside && !g.overlap,width+'/'+timestampSize+' '+JSON.stringify(g));
      if(output && width===480 && timestampSize===40) {
        await render({width,timestamp:true,designKeys:['gift-band-0','guard-1-开通'],eventChanges:{user},
          visualModel:visual([['timestamp',{fontSize:fixed(timestampSize)}]])});
        await page.locator('.fixture-surface').screenshot({path:join(output,'bubble-long-purchase-time.png')});
      }
    }
  }
  await render({width:480,timestamp:true,sampleKeys:['normal-gift'],eventChanges:{user:{uid:'short',uname:'小明',guardLevel:0}}});
  const compact=await page.locator('.gift-normal').evaluate(row=>{
    const header=row.querySelector('.event-header').getBoundingClientRect(),content=row.querySelector('.event-content').getBoundingClientRect();
    return content.top<header.bottom && row.clientWidth<row.closest('.event-row-slot-content').clientWidth-50;
  });
  assert(compact,'短购买信息同行且气泡随内容收缩');
  await purchaseOrder();
  await render({width:160,baseSize:24,timestamp:true,sampleKeys:['normal-gift']});
  const staticPosition=await page.locator('.gift-normal .event-layout > .time').evaluate(time=>{
    time.removeAttribute('data-time-wrapped');
    time.closest('.event-normal').style.removeProperty('--bubble-time-width');
    return getComputedStyle(time).position;
  });
  assert.equal(staticPosition,'static','静态主题的窄幅时间由 CSS 放回气泡');
}
async function inlineTime() {
  if (theme==='bubble') {
    for(const [width,baseSize,external] of [[480,16,true],[160,32,false]]) {
      await render({width,baseSize,timestamp:true,sampleKeys:['sc']});
      const geometry=await page.locator('.type-superchat').evaluate(row=>{
        const box=row.getBoundingClientRect(),time=row.querySelector('.time').getBoundingClientRect();
        return {outside:time.left>=box.right, inside:time.left>=box.left && time.right<=box.right+1};
      });
      assert(external ? geometry.outside : geometry.inside,'气泡时间按可用空间排列');
    }
    return;
  }
  const model=visual([['row',{gap:fixed(28)}]]);
  let seenInline=false,seenWrapped=false;
  for(const width of [220,240,260,280,300,320]){
    await render({width,avatar:false,timestamp:true,sampleKeys:['sc'],visualModel:model});
    const time=await page.locator('.type-superchat').evaluate(row=>{
      const label=row.querySelector('.event-layout > .time'),content=row.querySelector('.event-content');
      const range=document.createRange();
      range.selectNodeContents(content.querySelector('.event-user-content'));
      const right=[...range.getClientRects()].at(-1).right;
      return {gap:parseFloat(getComputedStyle(label.parentElement).columnGap),
        room:content.getBoundingClientRect().right-right-label.getBoundingClientRect().width,
        inline:label.classList.contains('time-inline')};
    });
    near(time.gap,28,'实际列间距');
    assert.equal(time.inline,time.room>=time.gap,'独立时间行使用实际间距 '+JSON.stringify(time));
    seenInline ||= time.inline; seenWrapped ||= !time.inline;
  }
  assert(seenInline && seenWrapped,'时间覆盖同排与独立行');
}
async function localText() {
  const samples=['normal-gift','guard','block'];
  const fields=[['giftName','.gift-normal .gift-name'],['guardName','.type-guard .guard-name'],
    ['systemTitle','.system-message-title'],['priceValue','.gift-normal .price-value'],['quantityNumber','.gift-normal .quantity-number']];
  for(const [part,selector] of fields){
    await render({sampleKeys:samples,visualModel:visual([[part,{fontSize:relative(1.5)}]])});
    near(await measure(selector,'fontSize'),24,part+' 单独字号');
    near(await measure(selector,'lineHeight'),24*(part==='systemTitle' ? bodyLine : normalLine),part+' 单独行高');
  }
  const detailFields=[
    ['guardDaysNumber','.guard-companion-days .number'],['lotteryRequirementText','.lottery-requirement .text'],
    ['lotteryCommandPrefix','.lottery-command .prefix'],['redpocketAwardsPrefix','.redpocket-awards > .prefix'],
    ['honorHeading','.honor-heading > :not(.honor-highlight)'],['honorMilestone','.honor-milestone'],
    ['winnerCount','.winner-count'],['lotteryPrize','.lottery-name']
  ];
  await render({sampleKeys:['guard','lottery-start','lottery-result','pocket-start','honor'],visualModel:visual(detailFields.map(([part])=>[part,{fontSize:relative(1.5)}]))});
  for(const [part,selector] of detailFields){
    near(await measure(selector,'fontSize'),24,part+' 正文字号');
    near(await measure(selector,'lineHeight'),24*(theme==='card' && part==='honorMilestone' ? 1 : normalLine),part+' 正文行高');
  }
  await render({sampleKeys:samples,visualModel:visual([['price',{fontSize:relative(1.5),lineHeight:1.75}],['giftCount',{fontSize:relative(1.5),lineHeight:1.75}]])});
  for(const selector of ['.gift-normal .price-unit','.gift-normal .price-value','.gift-normal .quantity-prefix','.gift-normal .quantity-number'])
    near(await measure(selector,'lineHeight'),42,selector+' 继承整组显式行高');
  await render({sampleKeys:samples,visualModel:visual([['price',{lineHeight:1.75}],['priceValue',{fontSize:relative(1.5),lineHeight:1.5}]])});
  near(await measure('.gift-normal .price-value','lineHeight'),36,'叶部件显式行高优先');
}
async function narrowText() {
  const output=process.env.NATIVE_BASE_DETAIL_SCREENSHOTS;
  if(output) await mkdir(output,{recursive:true});
  await render({width:160,baseSize:72,designKeys:['body-big-emote','sc-recalled'],eventChanges:{danmuRepeatCount:128,danmuDeleted:true,scDeleted:true}});
  const markers=page.locator('.type-chat .repeat-count,.type-chat .status.deleted,.type-superchat .status.deleted');
  assert.equal(await markers.count(),3);
  const geometry=await markers.evaluateAll(nodes=>nodes.map(el=>{
    const row=el.closest('.event-normal'),bounds=el.getBoundingClientRect();
    const range=document.createRange();range.selectNodeContents(el);
    return {label:el.textContent,overflow:row.scrollWidth-row.clientWidth,rects:[...range.getClientRects()].map(r=>[
      r.left-bounds.left,bounds.right-r.right,r.top-bounds.top,bounds.bottom-r.bottom])};
  }));
  for(const {label,overflow,rects} of geometry){
    if(overflow>1 || rects.some(r=>Math.min(...r)<-1)) failures.push(label+' 标记边界 '+JSON.stringify({overflow,rects}));
  }
  if(output) await page.locator('.type-chat .event-content').screenshot({path:join(output,'markers.png')});
  for(const [width,baseSize] of [[320,16],[380,16],[480,24]]){
    await render({width,baseSize,sampleKeys:['live-start','live-end']});
    const pairs=await page.locator('.lifecycle-time').evaluateAll(times=>times.map(time=>{
      const title=time.previousElementSibling.getBoundingClientRect(),box=time.getBoundingClientRect();
      return {sameLine:box.top<title.bottom && box.bottom>title.top,gap:box.left-title.right};
    }));
    assert.equal(pairs.length,2);
    for(const pair of pairs){
      if(!pair.sameLine) failures.push(width+' 开播或下播时间应与标题同行');
      near(pair.gap,baseSize*.5,width+' 开播与下播时间同行间隔');
    }
  }
  for(const [width,baseSize] of [[170,24],[220,32]]){
    await render({width,baseSize,sampleKeys:['lottery-start','live-start']});
    const bounds=await page.locator('.fixture-surface').evaluate(area=>{
      const name=area.querySelector('.lottery-required-gift .gift-name'),time=area.querySelector('.lifecycle-time');
      return [name,time].map(el=>{
        const parent=el.closest('.lottery-required-gift,.system-message-copy').getBoundingClientRect();
        const range=document.createRange();range.selectNodeContents(el);
        return {label:el.textContent,width:el.getBoundingClientRect().width,outside:[...range.getClientRects()].some(r=>r.width>0 && (r.left<parent.left-1||r.right>parent.right+1))};
      });
    });
    for(const part of bounds) if(part.width<=0 || part.outside) failures.push(width+' 窄版文字列 '+JSON.stringify(part));
    if(output && width===170) await page.locator('.fixture-surface').screenshot({path:join(output,'lottery-time.png')});
  }
}
try {
  await server.listen();
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:|localhost:)/, route=>route.abort());
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/nativeLayoutRepair.html');
  await page.waitForFunction(()=>typeof window.setNativeLayoutCase==='function');
  if (!process.argv[2] || process.argv[2]==='sizes') { await sizes(); await purchaseOrder(); }
  if (!process.argv[2] || process.argv[2]==='flow') await flow();
  if (!process.argv[2] || process.argv[2]==='layout') await layout();
  if (!process.argv[2] || process.argv[2]==='time') await inlineTime();
  if (!process.argv[2] || process.argv[2]==='overrides') await themeOverrides();
  if (!process.argv[2] || process.argv[2]==='parts') { await localText(); await narrowText(); }
  assert.deepEqual(failures,[]);
  if (process.env.NATIVE_BASE_SCREENSHOTS) await captures(process.env.NATIVE_BASE_SCREENSHOTS);
  console.log(theme+' 实际组件通过 '+caseId+' 组设置。');
} finally {
  await browser.close();
  await server.close();
}
