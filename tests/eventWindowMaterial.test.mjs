import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEventWindowMaterial } from '../src/windows/eventWindowMaterial.ts';

test('玻璃启用原生效果，其他材质清除效果', async () => {
  const calls = [];
  const apply = async (material,radius,scheme) => calls.push([material,radius,scheme]);
  assert.equal((await applyEventWindowMaterial(apply, 'glass', 12, 'light')).backgroundBlur, 'active');
  assert.equal((await applyEventWindowMaterial(apply, 'transparent', 0, 'light')).backgroundBlur, 'off');
  assert.equal((await applyEventWindowMaterial(apply, 'solid', 12, 'dark')).backgroundBlur, 'off');
  assert.deepEqual(calls, [['glass',12,'light'], ['transparent',0,'light'], ['solid',12,'dark']]);
});
test('原生效果启用或清除失败不会报告成功', async () => {
  const fail = async () => { throw Error('native'); };
  for (const material of ['glass','solid','transparent']) {
    assert.equal((await applyEventWindowMaterial(fail, material, 12, 'light')).backgroundBlur, 'failed');
  }
});

test('玻璃着色与自定义颜色完整传给原生层', async () => {
  let received;
  const color = {r:124,g:58,b:237,a:0.7};
  await applyEventWindowMaterial(async (...args) => {received=args;}, 'glass', 16, 'dark', 0.35, color);
  assert.deepEqual(received, ['glass',16,'dark',0.35,color]);
});
