import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
let server, createActivityLifecycle, activityPresentation, activityFactFromMessage;
test.before(async () => {
 server = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-activityLifecycle.test.mjs",configFile:false, logLevel:'silent', optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,watch:null}});
 ({createActivityLifecycle,activityPresentation,activityFactFromMessage}=await server.ssrLoadModule('/src/events/activityLifecycle.ts'));
});
test.after(()=>server?.close());
const start=(roomId=1,id=2)=>({roomId,id:`anchor-start:${id}`,msgType:4,ts:1000,lottery:{id,awardName:'奖品',awardNum:1,timing:{endsAt:65000,serverNow:0,observedAt:1000,source:'remaining'}}});
test('开始、重复时间、结束和结果分别处理，不因迟到开始复活',()=>{
 const state=createActivityLifecycle(); const event=start();
 state.accept(event);
 const original=state.get('1:anchor:2');
 state.accept({...event,lottery:{...event.lottery,timing:{...event.lottery.timing,observedAt:9000}}});
 assert.equal(state.get('1:anchor:2'),original);
 assert.equal(activityPresentation(original,2000).remainingSeconds,64);
 state.acceptFact({roomId:1,kind:'anchor',activityId:2,observedAt:10000,endedAt:10000});
 assert.equal(activityPresentation(state.get('1:anchor:2'),10001).state,'awaiting-result');
 state.accept({...event,id:'award',msgType:5,ts:11000});
 state.accept(event);
 assert.equal(activityPresentation(state.get('1:anchor:2'),12000).state,'drawn');
 assert.equal(state.get('9:anchor:2'),undefined);
});
test('未来开始、截止等待和无可靠时间',()=>{
 const state=createActivityLifecycle(); const event=start();
 event.lottery.timing={startsAt:5000,endsAt:15000,observedAt:1000,source:'end-time'};
 const fact=state.accept(event);
 assert.equal(activityPresentation(fact,2000).state,'scheduled');
 assert.equal(activityPresentation(fact,16000).state,'awaiting-result');
 assert.equal(activityPresentation(undefined,16000).state,'unknown');
});
test('官方END结束参与；CHECKSTATUS是用户资格，不伪装开奖或结束',()=>{
 assert.equal(activityFactFromMessage({cmd:'ANCHOR_LOT_END',data:{id:2}},1,100).endedAt,100);
 assert.equal(activityFactFromMessage({cmd:'ANCHOR_LOT_CHECKSTATUS',data:{lottery_id:2,uid:3,status:1}},1,100),undefined);
});

test('无服务端时间的相同剩余时长不会因重收而续期',()=>{
 const state=createActivityLifecycle(),event=start();
 event.lottery.timing={endsAt:65000,observedAt:1000,source:'remaining'};
 state.accept(event);const original=state.get('1:anchor:2');
 state.accept({...event,lottery:{...event.lottery,timing:{endsAt:73000,observedAt:9000,source:'remaining'}}});
 assert.equal(state.get('1:anchor:2'),original);
});

test('明确截止时间不被后到的推导时间覆盖',()=>{
 const state=createActivityLifecycle(),event=start();
 event.lottery.timing={endsAt:65000,serverNow:1000,observedAt:1000,source:'end-time'};state.accept(event);
 state.accept({...event,lottery:{...event.lottery,timing:{endsAt:75000,serverNow:2000,observedAt:2000,source:'start-duration'}}});
 assert.equal(state.get('1:anchor:2').timing.endsAt,65000);
});
