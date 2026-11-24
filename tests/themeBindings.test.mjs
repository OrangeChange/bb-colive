import test from "node:test";
import assert from "node:assert/strict";
import { createThemeBindingRegistry } from "../src/themes/themeBindings.ts";

function memoryPort(initial = []) {
  let value = structuredClone(initial);
  return {
    async read() { return structuredClone(value); },
    async write(next) { value = structuredClone(next); },
  };
}

test("配置标识转换同步已加载的绑定缓存并保留缩放", async () => {
  const port=memoryPort([{targetId:'old',targetKind:'obs',themeId:'native-default',revision:3,displayScale:1.2}]);
  const registry=createThemeBindingRegistry(port);
  await registry.load();
  await registry.remapTargetIds({old:'k7m3x9ra'});
  await registry.bind({targetId:'live',targetKind:'live',themeId:'native-default',revision:1});
  const saved=await port.read();
  assert.equal(saved.some(item=>item.targetId==='old'),false);
  assert.equal(saved.find(item=>item.targetId==='k7m3x9ra').displayScale,1.2);
});

test("主题目标绑定可持久化并区分现场、副窗口和多个 OBS 配置", async () => {
  const port = memoryPort();
  const first = createThemeBindingRegistry(port);
  await first.bind({ targetId: "live", targetKind: "live", themeId: "theme-a", revision: 2 });
  await first.bind({ targetId: "windows", targetKind: "windows", themeId: "theme-b", revision: 3 });
  await first.bind({ targetId: "obs-one", targetKind: "obs", themeId: "theme-c", revision: 4 });
  await first.bind({ targetId: "obs-two", targetKind: "obs", themeId: "theme-d", revision: 5 });

  const reopened = createThemeBindingRegistry(port);
  assert.deepEqual(await reopened.load(), [
    { targetId: "live", targetKind: "live", themeId: "theme-a", revision: 2, displayScale: 1 },
    { targetId: "windows", targetKind: "windows", themeId: "theme-b", revision: 3, displayScale: 1 },
    { targetId: "obs-one", targetKind: "obs", themeId: "theme-c", revision: 4, displayScale: 1 },
    { targetId: "obs-two", targetKind: "obs", themeId: "theme-d", revision: 5, displayScale: 1 },
  ]);
});

test("绑定只在持久化成功后通知已打开的消费者", async () => {
  const port = memoryPort();
  const registry = createThemeBindingRegistry(port);
  const received = [];
  const unsubscribe = registry.subscribe(binding => received.push(binding));
  await registry.bind({ targetId: "windows", targetKind: "windows", themeId: "theme-a", revision: 7 });
  unsubscribe();
  await registry.bind({ targetId: "windows", targetKind: "windows", themeId: "theme-a", revision: 8 });
  assert.deepEqual(received, [{ targetId: "windows", targetKind: "windows", themeId: "theme-a", revision: 7, displayScale: 1 }]);
});

test("并行绑定现场和副窗口不会互相覆盖", async () => {
  const port = memoryPort();
  const registry = createThemeBindingRegistry(port);
  await Promise.all([
    registry.bind({ targetId: "live", targetKind: "live", themeId: "theme-a", revision: 1 }),
    registry.bind({ targetId: "windows", targetKind: "windows", themeId: "theme-a", revision: 1 }),
  ]);
  assert.deepEqual((await registry.load()).map(binding => binding.targetId).sort(), ["live", "windows"]);
});

test("旧绑定默认使用 100% 显示缩放并在重新打开后持久化各目标缩放", async () => {
  const port = memoryPort([
    { targetId: "live", targetKind: "live", themeId: "theme-a", revision: 1 },
  ]);
  const registry = createThemeBindingRegistry(port);
  assert.equal((await registry.load())[0].displayScale, 1);

  await registry.setDisplayScale("live", 1.25);
  await registry.bind({ targetId: "live", targetKind: "live", themeId: "theme-b", revision: 2 });
  await registry.bind({ targetId: "obs-one", targetKind: "obs", themeId: "theme-b", revision: 2, displayScale: 1.5 });
  await registry.bind({ targetId: "obs-two", targetKind: "obs", themeId: "theme-b", revision: 2 });

  const reopened = createThemeBindingRegistry(port);
  const bindings = await reopened.load();
  assert.equal(bindings.find(item => item.targetId === "live").displayScale, 1.25);
  assert.equal(bindings.find(item => item.targetId === "obs-one").displayScale, 1.5);
  assert.equal(bindings.find(item => item.targetId === "obs-two").displayScale, 1);
});

