import test from "node:test";
import assert from "node:assert/strict";
import {
  createVoiceGiftThresholdRuntime,
  reuseVoiceGiftThresholdRuntime,
} from "../src/voice/giftThresholdRuntime.ts";

test("热更新后复用同一个礼物阈值运行时和原有订阅", () => {
  const firstRuntime = createVoiceGiftThresholdRuntime();
  firstRuntime.set(1.5, "unit");
  const changes = [];
  firstRuntime.subscribe((value) => changes.push(value));

  // 模拟热重载：新模块必须继续使用旧对象，不能只复制数值后丢掉控制器订阅。
  const nextRuntime = reuseVoiceGiftThresholdRuntime(firstRuntime);
  assert.equal(nextRuntime, firstRuntime);
  assert.deepEqual(nextRuntime.get(), { threshold: 1.5, mode: "unit" });

  nextRuntime.set(2.5, "cumulative");
  assert.deepEqual(nextRuntime.get(), { threshold: 2.5, mode: "cumulative" });
  assert.deepEqual(changes, [{ threshold: 2.5, mode: "cumulative" }]);
});

test("礼物阈值变化会通知语音运行时立即重新检查队列", () => {
  const runtime = createVoiceGiftThresholdRuntime();
  const changes = [];
  const unsubscribe = runtime.subscribe((value) => changes.push(value));

  runtime.set(1, "unit");
  runtime.set(2, "cumulative");
  unsubscribe();
  runtime.set(3, "unit");

  assert.deepEqual(changes, [
    { threshold: 1, mode: "unit" },
    { threshold: 2, mode: "cumulative" },
  ]);
});
