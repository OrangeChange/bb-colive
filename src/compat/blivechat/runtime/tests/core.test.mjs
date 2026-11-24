import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NATIVE_TEXT_DEFAULTS } from '../nativeText.mjs';
import { BlivechatRuntime, DEFAULT_CONFIG, DEFAULT_HOST_POLICY, RETENTION, pinDurationMs } from '../core.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const text = (id, fields = {}) => ({ method: 'onAddText', payload: { id, content: id, authorName: 'A', authorType: 0, authorLevel: 10, medalLevel: 5, isMobileVerified: true, emoticon: null, ...fields } });
const gift = (id, fields = {}) => ({ method: 'onAddGift', payload: { id, authorName: 'A', giftName: 'Rose', totalCoin: 10000, num: 1, ...fields } });
const sc = id => ({ method: 'onAddSuperChat', payload: { id, content: 'SC', authorName: 'A', price: 700 } });
const ids = runtime => runtime.snapshot().messages.map(m => m.id);

test('exact 16 retained renderer defaults plus private paid/category/native settings; invalid knobs reject', () => {
  assert.equal(Object.keys(DEFAULT_CONFIG).length, 16);
  assert.deepEqual(new BlivechatRuntime().config, {...DEFAULT_CONFIG,...DEFAULT_HOST_POLICY,...NATIVE_TEXT_DEFAULTS});
  assert.deepEqual(Object.keys(DEFAULT_HOST_POLICY), ['hostPaidFilter', 'hostPaidThreshold', 'hostPaidMode', 'hostEventFilter', 'hostShowSuperChat', 'hostShowGuard', 'hostShowFreeGift', 'hostShowNormalGift']);
  for (const key of ['blockKeywords','blockUsers','relayMessagesByServer','autoTranslate','giftUsernamePronunciation','emoticons']) assert.throws(() => new BlivechatRuntime({ config: { [key]: false } }));
  for (const patch of [{maxNumber:0},{blockLevel:61},{blockMedalLevel:121},{minGiftPrice:Infinity},{maxNumber:1.1},{templateUrl:'javascript:alert(1)'},{templateUrl:'https://user:pass@invalid.test/'}]) assert.throws(() => new BlivechatRuntime({config:patch}));
});

test('every retained text filter immediately removes/restores old and filters new inputs', () => {
  const cases = [ ['showDanmaku',false,{}],['blockGiftDanmaku',true,{isGiftDanmaku:true}],['blockMirrorMessages',true,{isMirror:true}],['blockLevel',11,{}],['blockNewbie',true,{isNewbie:true}],['blockNotMobileVerified',true,{isMobileVerified:false}],['blockMedalLevel',6,{}] ];
  for (const [key,value,fields] of cases) {
    const neutral = { showDanmaku:true, blockGiftDanmaku:false,blockMirrorMessages:false,blockLevel:0,blockNewbie:false,blockNotMobileVerified:false,blockMedalLevel:0 };
    const runtime = new BlivechatRuntime({config:neutral}); runtime.receive(text('old',fields));
    runtime.setConfig({[key]:value}); assert.deepEqual(ids(runtime),[],key);
    runtime.receive(text('new',fields)); assert.deepEqual(ids(runtime),[],key);
    runtime.setConfig({[key]:neutral[key]}); assert.deepEqual(ids(runtime),['old','new'],key);
  }
});

test('showGift/minimum/mergeGift/maxNumber reproject retained records in both directions', () => {
  const runtime = new BlivechatRuntime({config:{mergeGift:false}});
  runtime.receive(gift('a')); runtime.receive(gift('b',{totalCoin:1000}));
  runtime.setConfig({mergeGift:true}); assert.equal(runtime.snapshot().messages[0].price,11); assert.deepEqual(ids(runtime),['a']);
  runtime.setConfig({mergeGift:false,minGiftPrice:5}); assert.deepEqual(ids(runtime),['a']);
  runtime.setConfig({minGiftPrice:0,maxNumber:1}); assert.deepEqual(ids(runtime),['b']);
  runtime.setConfig({maxNumber:60}); assert.deepEqual(ids(runtime),['a','b']);
  runtime.setConfig({showGift:false}); assert.deepEqual(ids(runtime),[]);
  runtime.receive(gift('c')); runtime.setConfig({showGift:true}); assert.deepEqual(ids(runtime),['a','b','c']);
});

test('original gift merge-before-minimum, case-sensitive identity, five-add lookback', () => {
  const runtime = new BlivechatRuntime({config:{minGiftPrice:5}});
  runtime.receive(gift('a')); runtime.receive(gift('b',{totalCoin:1}));
  assert.equal(runtime.snapshot().messages[0].price,10.001);
  runtime.receive(gift('c',{authorName:'a',totalCoin:1})); assert.deepEqual(ids(runtime),['a']);
  for(let i=0;i<5;i++) runtime.receive(text('t'+i));
  runtime.receive(gift('d')); assert.equal(ids(runtime).at(-1),'d');
});

test('text merge can be disabled and reconstructs independent stable message identities', () => {
  const runtime = new BlivechatRuntime(); runtime.receive(text('a',{content:'hello'})); runtime.receive(text('b',{content:'Hello!'}));
  runtime.setConfig({mergeSimilarDanmaku:true}); assert.deepEqual(ids(runtime),['a']); assert.equal(runtime.snapshot().messages[0].repeated,2);
  runtime.setConfig({mergeSimilarDanmaku:false}); assert.deepEqual(ids(runtime),['a','b']);
});

test('existing translations remain, including updates while text hidden and after remerge', () => {
  const runtime = new BlivechatRuntime({config:{showDanmaku:false}});
  runtime.receive(text('a',{translation:'first'})); runtime.receive({method:'onUpdateTranslation',payload:{id:'a',translation:'later'}});
  runtime.setConfig({showDanmaku:true}); assert.equal(runtime.snapshot().messages[0].translation,'later');
  assert.equal(runtime.journal[0].payload.translation,'first','raw journal is not mutated by updates');
});

test('deleted SC cannot resurrect through settings, duplicate input, or late translation', () => {
  const runtime = new BlivechatRuntime(); runtime.receive(sc('a'));
  runtime.receive({method:'onDelSuperChat',payload:{ids:['a','before-add']}});
  for(const event of [sc('a'),sc('before-add'),{method:'onUpdateTranslation',payload:{id:'a',translation:'late'}}]) runtime.receive(event);
  runtime.setConfig({showGift:false}); runtime.setConfig({showGift:true,minGiftPrice:0}); assert.deepEqual(ids(runtime),[]);
  assert.equal(runtime.tombstones.size,2);
});

test('bounded tombstones fail closed on overflow rather than forget deletions', () => {
  const runtime = new BlivechatRuntime({retention:{maxTombstones:1}}); runtime.receive(sc('kept'));
  runtime.receive({method:'onDelSuperChat',payload:{ids:['a','b']}}); runtime.receive(sc('b')); runtime.setConfig({maxNumber:1});
  assert.equal(runtime.stats().tombstones,1); assert.equal(runtime.stats().tombstoneOverflow,true); assert.deepEqual(ids(runtime),[]);
});

test('first renderer acceptance clock survives rebuild; never restart expired ticker', () => {
  let now=1000000; const runtime=new BlivechatRuntime({now:()=>now}); runtime.receive(sc('a')); runtime.markPresented('a',now+1000); now+=20000;
  runtime.setConfig({showGiftName:true}); assert.equal(+runtime.snapshot().messages[0].addTime,1001000);
  now+=3600001; runtime.setConfig({showGift:false}); runtime.setConfig({showGift:true});
  assert.equal(runtime.snapshot().paidMessages.length,0); assert.deepEqual(ids(runtime),['a'],'ticker expiry does not delete history row');
  assert.equal(pinDurationMs({type:2}),120000); assert.equal(pinDurationMs({type:3,price:30}),0); assert.equal(pinDurationMs({type:3,price:35}),120000);
});

test('debug identities remain stable on toggles and still follow original text filters', () => {
  const runtime=new BlivechatRuntime();runtime.receive({method:'onDebugMsg',payload:{content:'debug'}});assert.deepEqual(ids(runtime),[]);
  runtime.setConfig({showDebugMessages:true});const id=ids(runtime)[0];assert.equal(runtime.snapshot().messages[0].authorName,'blivechat');
  runtime.setConfig({showDebugMessages:false});runtime.setConfig({showDebugMessages:true});assert.equal(ids(runtime)[0],id);
  runtime.setConfig({blockMedalLevel:1});assert.deepEqual(ids(runtime),[]);
});

test('raw callback and raw record count/byte/TTL budgets are independent and bounded', () => {
  let now=100000; const runtime=new BlivechatRuntime({now:()=>now,retention:{maxCallbacks:3,maxRecords:2,maxBytes:2000,ttlMs:10}});
  for(let i=0;i<5;i++)runtime.receive(text('t'+i));assert.ok(runtime.stats().callbacks<=3);assert.equal(runtime.stats().records,2);
  for(let i=0;i<6;i++)runtime.receive(text('large'+i,{content:'x'.repeat(1200)}));
  assert.ok(runtime.stats().rawBytes<=2000);assert.ok(runtime.stats().recordBytes<=2000);assert.ok(runtime.stats().records<2);
  now+=11;runtime.rebuild();assert.deepEqual(ids(runtime),[]);assert.equal(runtime.stats().callbacks,0);
  assert.equal(RETENTION.ttlMs,7200000);
});

test('async text parsing precedes enqueue; rebuild excludes pending and resolution cannot duplicate', async () => {
  let resolve;const parts=new Promise(r=>{resolve=r});const order=[];
  const runtime=new BlivechatRuntime({resolveParts:()=>parts,sink:{addMessage:m=>order.push(m.id)}});
  runtime.receive(text('async',{emoticon:'image.png'}));runtime.receive(gift('gift'));assert.deepEqual(order,['gift']);
  runtime.setConfig({maxNumber:10});assert.deepEqual(ids(runtime),['gift']);resolve([{type:1,text:'async',url:'image.png',width:100,height:100}]);await runtime.drain();
  assert.equal(ids(runtime).filter(id=>id==='async').length,1);assert.equal(runtime.snapshot().messages.find(m=>m.id==='async').contentParts[0].width,100);
});

test('live merger uses original sink search, never invisible historical rows', () => {
  const emitted=[];const runtime=new BlivechatRuntime({config:{maxNumber:1,mergeSimilarDanmaku:true},sink:{mergeSimilarText:()=>null,addMessage:m=>emitted.push(m.id)}});
  runtime.receive(text('a',{content:'same'}));runtime.receive(text('b',{content:'other'}));runtime.receive(text('c',{content:'same'}));
  assert.deepEqual(emitted,['a','b','c']);assert.deepEqual(ids(runtime),['c']);
});

test('all 8294 ORIGINAL captured callbacks feed the bounded runtime, no reconstructed generator', () => {
  const candidates=[path.join(root,'tests/fixtures/compat/blc-original/original-fixed-batch.json'),path.resolve(root,'../blivechat-v033-mapping/test-harness/original-fixed-batch.json')];
  const file=candidates.find(fs.existsSync);assert.ok(file,'original fixed fixture available');const batch=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.equal(batch.sourceSha,'848409df78d2cca65d3cc8ffe938eb6b6f261b76');assert.equal(batch.events.length,8294);
  let now=batch.startEpochMs;const runtime=new BlivechatRuntime({now:()=>now,config:{minGiftPrice:0,mergeGift:false,maxNumber:5000}});
  for(const event of batch.events){now=batch.startEpochMs+event.offsetMs;runtime.receive({method:event.method,payload:event.data,receivedAt:now});}
  assert.equal(runtime.stats().callbacks,8294);assert.equal(runtime.stats().records,5000);assert.ok(runtime.stats().tombstones>0);
  const idsBefore=ids(runtime);runtime.setConfig({showGiftName:true});assert.deepEqual(ids(runtime),idsBefore);
  for(const id of runtime.tombstones)assert.ok(!idsBefore.includes(id));
});

test('newer translation during async part completion wins over an older deferred update',async()=>{
 let finish;const parts=new Promise(resolve=>{finish=resolve;});const updates=[];
 const runtime=new BlivechatRuntime({resolveParts:()=>parts,sink:{addMessage(){},updateMessage:(id,value)=>updates.push(value.translation)}});
 runtime.receive(text('async-translation',{translation:'initial'}));
 runtime.receive({method:'onUpdateTranslation',payload:{id:'async-translation',translation:'older'}});
 finish([{type:0,text:'async-translation'}]);
 await Promise.resolve();
 runtime.receive({method:'onUpdateTranslation',payload:{id:'async-translation',translation:'newest'}});
 await runtime.drain();
 assert.equal(runtime.snapshot().messages[0].translation,'newest');
 assert.equal(updates.at(-1),'newest');
 runtime.setConfig({showGiftName:true});
 assert.equal(runtime.snapshot().messages[0].translation,'newest');
});

for(const last of ['same',''])test(`latest translation revision wins even with equal or cleared text: ${JSON.stringify(last)}`,async()=>{
 let finish;const parts=new Promise(resolve=>{finish=resolve;});const updates=[];
 const runtime=new BlivechatRuntime({resolveParts:()=>parts,sink:{addMessage(){},updateMessage:(id,value)=>updates.push(value.translation)}});
 runtime.receive(text('revision',{translation:'initial'}));
 runtime.receive({method:'onUpdateTranslation',payload:{id:'revision',translation:'same'}});
 finish([{type:0,text:'revision'}]);await Promise.resolve();
 runtime.receive({method:'onUpdateTranslation',payload:{id:'revision',translation:last}});
 await runtime.drain();
 assert.deepEqual(updates,[last],'superseded deferred revision must not emit, even for the same text');
 assert.equal(runtime.snapshot().messages[0].translation,last);
});

test('deferred translation still delivers when no newer revision exists',async()=>{
 let finish;const updates=[];const parts=new Promise(resolve=>{finish=resolve;});
 const runtime=new BlivechatRuntime({resolveParts:()=>parts,sink:{addMessage(){},updateMessage:(id,value)=>updates.push(value.translation)}});
 runtime.receive(text('pending'));runtime.receive({method:'onUpdateTranslation',payload:{id:'pending',translation:'final'}});
 assert.deepEqual(updates,[]);finish([{type:0,text:'pending'}]);await runtime.drain();
 assert.deepEqual(updates,['final']);assert.equal(runtime.snapshot().messages[0].translation,'final');
});

test('reset with same-ID replacement blocks the previous session deferred translation',async()=>{
 let finish;const updates=[];const parts=new Promise(resolve=>{finish=resolve;});let calls=0;
 const runtime=new BlivechatRuntime({resolveParts:()=>++calls===1?parts:Promise.resolve([{type:0,text:'replacement'}]),sink:{addMessage(){},updateMessage:(id,value)=>updates.push(value.translation)}});
 runtime.receive(text('reused'));runtime.receive({method:'onUpdateTranslation',payload:{id:'reused',translation:'old'}});
 runtime.reset();runtime.receive(text('reused',{translation:'replacement'}));
 finish([{type:0,text:'old'}]);await runtime.drain();await Promise.resolve();await Promise.resolve();
 assert.equal(runtime.snapshot().messages[0].translation,'replacement');assert.deepEqual(updates,[]);
});

test('deleted pending member is not restored by deferred translation completion',async()=>{
 let finish;const parts=new Promise(resolve=>{finish=resolve;});const updates=[];
 const runtime=new BlivechatRuntime({resolveParts:()=>parts,sink:{addMessage(){},updateMessage:(id,value)=>updates.push(value.translation)}});
 runtime.receive(text('deleted'));runtime.receive({method:'onUpdateTranslation',payload:{id:'deleted',translation:'old'}});
 finish([{type:0,text:'deleted'}]);await Promise.resolve();
 runtime.receive({method:'onDelSuperChat',payload:{ids:['deleted']}});await runtime.drain();
 assert.deepEqual(updates,[]);assert.deepEqual(runtime.snapshot().messages,[]);
});
