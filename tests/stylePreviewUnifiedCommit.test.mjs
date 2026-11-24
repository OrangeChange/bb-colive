import test from 'node:test';
import assert from 'node:assert/strict';
import {BlivechatRuntime} from '../src/compat/blivechat/runtime/core.mjs';
import {observePreviewRuntime,applyPreviewPresentation} from '../public/previewCapture.mjs';
test('动态来源投影保留新消息，策略提交前右侧不显示',async()=>{
 const renderer={messages:[],paidMessages:[],resetSmoothScroll(){}};
 const runtime=new BlivechatRuntime({sink:{addMessage(message){renderer.messages.push(message);}}});
 let frame;
 observePreviewRuntime(runtime,value=>{frame={...value,presentation:runtime.snapshot()};})(true);
 runtime.sink={};
 runtime.receive({method:'onAddText',payload:{id:'preview:commit:1',authorName:'用户',content:'新消息',isMobileVerified:true},receivedAt:Date.now()});
 await runtime.drain();await new Promise(queueMicrotask);
 assert.equal(renderer.messages.length,0);
 assert.equal(frame.presentation.messages[0].id,'preview:commit:1');
 applyPreviewPresentation(renderer,frame.presentation);
 assert.equal(renderer.messages[0].id,'preview:commit:1');
});
test('动态异步文本在投影完成后只捕获一次，不等待下条消息',async()=>{
 let resolve;const parts=new Promise(done=>{resolve=done;});
 const runtime=new BlivechatRuntime({resolveParts:()=>parts});
 const frames=[];
 const observe=observePreviewRuntime(runtime,frame=>frames.push({...frame,presentation:runtime.snapshot()}),publish=>{void runtime.drain().then(publish);});
 observe(true);await new Promise(queueMicrotask);await new Promise(queueMicrotask);frames.length=0;
 runtime.receive({method:'onAddText',payload:{id:'preview:async:1',content:'文本',authorName:'用户'},receivedAt:Date.now()});
 await new Promise(queueMicrotask);assert.equal(frames.length,0);
 resolve([{type:0,text:'文本'}]);await runtime.drain();await new Promise(queueMicrotask);await new Promise(queueMicrotask);
 assert.equal(frames.length,1);assert.equal(frames[0].presentation.messages[0].id,'preview:async:1');
});
