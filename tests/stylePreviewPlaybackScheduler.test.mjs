import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../src/preview/stylePreviewPlayback.ts').catch(()=>({}));
test('单一调度变速只改下一周期，停止和旧回调不生成',()=>{
  assert.equal(typeof api.createStylePreviewPlayback,'function');
  let id=0;const timers=new Map(),seen=[];
  const clock={now:()=>0,setTimeout(fn,ms){const key=++id;timers.set(key,{fn,ms});return key;},clearTimeout(key){timers.delete(key);}};
  const p=api.createStylePreviewPlayback(n=>seen.push(n),clock);
  p.start(1);assert.equal(timers.size,1);
  const old=[...timers.values()][0];p.setSpeed(2);
  assert.equal([...timers.values()][0].ms,500);
  old.fn();assert.deepEqual(seen,[]);
  const tick=[...timers.values()][0];timers.clear();tick.fn();assert.deepEqual(seen,[1]);assert.equal(timers.size,1);
  const stale=[...timers.values()][0];p.stop();stale.fn();assert.deepEqual(seen,[1]);assert.equal(timers.size,0);
});

function createClock() {
  let now=0,id=0;
  const timers=new Map();
  const next=()=>[...timers.entries()].sort((a,b)=>a[1].at-b[1].at)[0];
  return {
    now:()=>now,
    setTimeout(fn,ms){const key=++id;timers.set(key,{fn,at:now+ms});return key;},
    clearTimeout(key){timers.delete(key);},
    consume(ms){now+=ms;},
    jumpTo(value){now=value;},
    runNext(){const [key,timer]=next();timers.delete(key);now=Math.max(now,timer.at);timer.fn();},
    runUntil(value){while(next()&&next()[1].at<=value)this.runNext();now=Math.max(now,value);},
  };
}

test('3倍速30秒的生成次数不累积每次回调耗时',()=>{
  const clock=createClock(),seen=[];
  const playback=api.createStylePreviewPlayback(n=>{seen.push({n,at:clock.now()});clock.consume(25);},clock);
  playback.start(3);clock.runUntil(30000.001);
  assert.equal(seen.length,90);
  assert.equal(seen[0].n,1);assert.equal(seen.at(-1).n,90);
  assert.ok(Math.abs(seen.at(-1).at-30000)<0.001);
});

test('挂起恢复只生成一条并跳过过期周期',()=>{
  const clock=createClock(),seen=[];
  const playback=api.createStylePreviewPlayback(n=>seen.push({n,at:clock.now()}),clock);
  playback.start(1);clock.jumpTo(5000);clock.runNext();clock.runUntil(5999);
  assert.deepEqual(seen,[{n:1,at:5000}]);
  clock.runUntil(6000);
  assert.deepEqual(seen,[{n:1,at:5000},{n:2,at:6000}]);
});

test('回调跨过多个周期时等待下一个计划时刻而不集中补发',()=>{
  const clock=createClock(),seen=[];
  const playback=api.createStylePreviewPlayback(n=>{seen.push({n,at:clock.now()});if(n===1)clock.consume(2600);},clock);
  playback.start(1);clock.runUntil(3999);
  assert.deepEqual(seen,[{n:1,at:1000}]);
  clock.runUntil(4000);
  assert.deepEqual(seen,[{n:1,at:1000},{n:2,at:4000}]);
});

test('变速从当前时刻安排下一周期并保持事件序号',()=>{
  const clock=createClock(),seen=[];
  const playback=api.createStylePreviewPlayback(n=>seen.push({n,at:clock.now()}),clock);
  playback.start(1);clock.runUntil(1250);playback.setSpeed(2);clock.runUntil(1749);
  assert.deepEqual(seen,[{n:1,at:1000}]);
  clock.runUntil(1750);
  assert.deepEqual(seen,[{n:1,at:1000},{n:2,at:1750}]);
});
