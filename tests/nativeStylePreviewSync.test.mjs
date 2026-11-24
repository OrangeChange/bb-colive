import test from "node:test";
import assert from "node:assert/strict";
import { createNativeStylePreviewSync } from "../src/windows/nativeStylePreviewBridge.ts";

test("默认在当前事件循环合并发送，不增加固定等待",async()=>{
  let callback,delay;
  const published=[];
  const sync=createNativeStylePreviewSync(async value=>{published.push(value)},undefined,(next,ms)=>{callback=next;delay=ms;return 1},()=>{});
  sync.schedule('first');sync.schedule('last');
  assert.equal(delay,0);
  assert.deepEqual(published,[]);
  await callback();
  assert.deepEqual(published,['last']);
});
test("默认合并在微任务发送，显式刷新后不重复发送",async()=>{
  const published=[];
  const sync=createNativeStylePreviewSync(async value=>{published.push(value)});
  sync.schedule('first');sync.schedule('last');
  await Promise.resolve();
  assert.deepEqual(published,['last']);
  sync.schedule('flush');await sync.flush();await Promise.resolve();
  assert.deepEqual(published,['last','flush']);
  sync.dispose();
});

test("连续预览更新只发布最后一份载荷", async () => {
  let scheduled;
  const published = [];
  const sync = createNativeStylePreviewSync(
    async payload => { published.push(payload); },
    50,
    callback => { scheduled = callback; return 1; },
    () => {},
  );
  sync.schedule({ previewCss: "a" });
  sync.schedule({ previewCss: "b" });
  assert.deepEqual(published, []);
  await scheduled();
  assert.deepEqual(published, [{ previewCss: "b" }]);
});

test("显式刷新立即发布最新载荷并取消待发送任务", async () => {
  let cleared = 0;
  const published = [];
  const sync = createNativeStylePreviewSync(
    async payload => { published.push(payload); },
    50,
    () => 1,
    () => { cleared += 1; },
  );
  sync.schedule({ previewCss: "latest" });
  await sync.flush();
  assert.equal(cleared, 1);
  assert.deepEqual(published, [{ previewCss: "latest" }]);
});

test("连续更新不会不断推迟发送时刻", () => {
  let timers=0;
  const sync=createNativeStylePreviewSync(async()=>{},50,()=>++timers,()=>{});
  sync.schedule(1);sync.schedule(2);sync.schedule(3);
  assert.equal(timers,1);
  sync.dispose();
});
