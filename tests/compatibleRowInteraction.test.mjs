import test from 'node:test';import assert from 'node:assert/strict';import{createRequire}from'node:module';const{JSDOM}=createRequire(import.meta.url)('../vendor/blivechat/node_modules/jsdom');
test('兼容来源行悬浮使用稳定身份，回退行不重复入口，移除目标后清空',async()=>{
 const{observeCompatibleRows}=await import('../src/compat/compatibleRowInteraction.ts');
 const dom=new JSDOM('<iframe></iframe>',{pretendToBeVisual:true});try{
 const frame=dom.window.document.querySelector('iframe'),doc=frame.contentDocument;doc.body.innerHTML='<div data-compatible-event-id="source">来源</div><div data-compatible-event-id="fallback" data-compatible-fallback-id="fallback"></div>';
 const row=doc.body.firstElementChild;row.getBoundingClientRect=()=>({left:0,top:10,right:100,bottom:40,width:100,height:30});frame.getBoundingClientRect=()=>({left:20,top:30,right:220,bottom:230,width:200,height:200});Object.defineProperty(frame,'clientWidth',{value:200});Object.defineProperty(frame.contentWindow,'innerHeight',{value:200});
 const states=[],stop=observeCompatibleRows(frame,state=>states.push(state));
 row.dispatchEvent(new frame.contentWindow.MouseEvent('pointermove',{bubbles:true,clientX:30,clientY:20}));await new Promise(r=>setTimeout(r,30));
 assert.equal(states.at(-1)?.eventId,'source');assert.equal(states.at(-1)?.top,40);
 doc.body.lastElementChild.dispatchEvent(new frame.contentWindow.MouseEvent('pointermove',{bubbles:true}));assert.equal(states.at(-1),null);
 row.dispatchEvent(new frame.contentWindow.MouseEvent('pointermove',{bubbles:true,clientX:30,clientY:20}));row.remove();await new Promise(r=>setTimeout(r,40));assert.equal(states.at(-1),null);stop();
 }finally{dom.window.close();}
});

test('静止指针遇到滚轮或入流移位后重新命中当前来源行',async()=>{
 const{observeCompatibleRows}=await import('../src/compat/compatibleRowInteraction.ts');const dom=new JSDOM('<iframe></iframe>',{pretendToBeVisual:true});try{
 const frame=dom.window.document.querySelector('iframe'),doc=frame.contentDocument;doc.body.innerHTML='<div data-event-id="A"></div><div data-event-id="B"></div>';const[a,b]=doc.body.children;let under=a;doc.elementFromPoint=()=>under;for(const r of[a,b])r.getBoundingClientRect=()=>({left:0,top:0,right:100,bottom:30,width:100,height:30});frame.getBoundingClientRect=()=>({left:0,top:0,right:200,bottom:200,width:200,height:200});Object.defineProperty(frame,'clientWidth',{value:200});const states=[],stop=observeCompatibleRows(frame,s=>states.push(s));a.dispatchEvent(new frame.contentWindow.MouseEvent('pointermove',{bubbles:true,clientX:10,clientY:10}));await new Promise(r=>setTimeout(r,25));assert.equal(states.at(-1)?.eventId,'A');under=b;doc.dispatchEvent(new frame.contentWindow.Event('scroll'));await new Promise(r=>setTimeout(r,35));assert.equal(states.at(-1)?.eventId,'B');stop();
 }finally{dom.window.close();}
});
