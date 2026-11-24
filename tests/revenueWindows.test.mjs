import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../src/windows/giftWindowModel.ts';
import * as layout from '../src/windows/eventWindowLayout.ts';
import { MsgType } from '../src/protocol/types.ts';

test('总关与最后子窗关闭保留最近非空组合，模式切换保留选择和锁定', () => {
  let state = model.createRevenueWindowSelection();
  assert.equal(state.mode, 'combined');
  state = model.changeRevenueWindowSelection(state, { type: 'mode', mode: 'split' });
  state = model.changeRevenueWindowSelection(state, { type: 'toggle' });
  assert.deepEqual(state.selected, ['gift', 'superchat', 'guard']);
  state = model.changeRevenueWindowSelection(state, { type: 'child', kind: 'superchat' });
  state = model.changeRevenueWindowSelection(state, { type: 'toggle' });
  assert.deepEqual(state.remembered, ['gift', 'guard']);
  state = model.changeRevenueWindowSelection(state, { type: 'toggle' });
  assert.deepEqual(state.selected, ['gift', 'guard']);
  state = model.changeRevenueWindowSelection(state, { type: 'child', kind: 'gift' });
  state = model.changeRevenueWindowSelection(state, { type: 'child', kind: 'guard' });
  assert.equal(state.open, false);
  assert.deepEqual(state.remembered, ['guard']);
  state = model.changeRevenueWindowSelection(state, { type: 'toggle' });
  assert.deepEqual(state.selected, ['guard']);
  state = model.changeRevenueWindowSelection(state, { type: 'mode', mode: 'combined' });
  assert.equal(state.open, true);
  assert.deepEqual(state.remembered, ['guard']);
});

test('收益分类包含活动和荣誉，撤回仅路由醒目留言', () => {
  for (const type of model.GIFT_WINDOW_EVENT_TYPES) {
    const event = { msgType: type };
    const expected = type === MsgType.SuperChat ? 'superchat'
      : [MsgType.GuardBuy, MsgType.GuardHonor].includes(type) ? 'guard' : 'gift';
    assert.equal(model.revenueEventKind(event), expected);
  }
  assert.equal(model.revenueEventKind({ msgType: MsgType.ScDeleted }), 'superchat');
  assert.equal(model.revenueEventKind({ msgType: MsgType.Danmu }), null);
});

test('收益列预留右侧弹幕窗，负坐标和DPI只转换一次', () => {
  const tall = layout.createRevenueWindowLayout({ x: -2400, y: -100, width: 2400, height: 1800, scaleFactor: 1.5 });
  assert.deepEqual(Object.values(tall).map(p => [p.width, p.height, p.x, p.y]), [
    [300,240,-678,-57], [300,200,-678,191], [300,160,-678,399],
  ]);
  const area = { x: -1920, y: 0, width: 1920, height: 1040, scaleFactor: 1.5 };
  const short = layout.createRevenueWindowLayout(area);
  assert.deepEqual(Object.values(short).map(p => [p.width,p.height]), [[300,240],[300,200],[300,160]]);
  for (const p of Object.values(short)) {
    assert.ok(p.x >= -1280 + 10 && p.x + p.width <= -10);
    assert.ok(p.y >= 10 && p.y + p.height <= 1040 / 1.5 - 10);
  }
  const placements = Object.values(short);
  for (let i=0; i<placements.length; i++) for(let j=i+1;j<placements.length;j++) {
    const a=placements[i], b=placements[j];
    assert.ok(a.x+a.width<=b.x || b.x+b.width<=a.x || a.y+a.height<=b.y || b.y+b.height<=a.y);
  }
});

test('短工作区按各窗最小高度收缩，仍保留边距与间距', () => {
  const windows = Object.values(layout.createRevenueWindowLayout({x:0,y:0,width:1000,height:500}));
  assert.deepEqual(windows.map(p => [p.width,p.height,p.x,p.y]), [
    [300,172,322,10], [300,166,322,190], [300,126,322,364],
  ]);
});

test('收益各类最小尺寸可用于原生创建和几何恢复', () => {
  assert.equal(typeof layout.getEventWindowMinSize, 'function');
  for (const [kind, size] of [['display',{width:320,height:320}],['gift',{width:320,height:320}],['gift-only',{width:240,height:160}],['superchat',{width:240,height:160}],['guard',{width:240,height:120}]]) {
    assert.deepEqual(layout.getEventWindowMinSize(kind), size);
  }
});

test('宽度不足两列时收益窗收敛于当前屏，仍保留最小尺寸', () => {
  const windows = Object.values(layout.createRevenueWindowLayout({x:-500,y:30,width:500,height:900}));
  assert.deepEqual(windows.map(p => [p.width,p.x]), [[240,-490],[240,-490],[240,-490]]);
  for (const p of windows) assert.ok(p.x >= -490 && p.x+p.width <= -10);
});

test('最小可容纳工作区保持两列不重叠，弹幕默认尺寸不变', () => {
  const area = {x:0,y:0,width:628,height:476};
  const revenue = Object.values(layout.createRevenueWindowLayout(area));
  const display = layout.createDefaultWindowPair(area).display;
  assert.deepEqual(display, {x:258,y:10,width:360,height:360,center:false});
  assert.deepEqual(revenue.map(p => [p.x,p.y,p.width,p.height]), [[10,10,240,160],[10,178,240,160],[10,346,240,120]]);
  for (const p of revenue) assert.ok(p.x+p.width+8 <= display.x);
});

test('高度不足三窗最小值时保留最小尺寸并收敛在当前工作区', () => {
  const area = {x:-1000,y:-400,width:1000,height:400};
  const revenue = Object.values(layout.createRevenueWindowLayout(area));
  assert.deepEqual(revenue.map(p => [p.height,p.y]), [[160,-390],[160,-222],[120,-130]]);
  for (const p of revenue) assert.ok(p.y >= -390 && p.y+p.height <= -10);
});

test('缺少工作区时使用同一默认屏预留弹幕列', () => {
  assert.deepEqual(Object.values(layout.createRevenueWindowLayout(null)).map(p => [p.x,p.y,p.width,p.height]), [
    [1242,10,300,240],[1242,258,300,200],[1242,466,300,160],
  ]);
});

test('收益列避让弹幕窗的实际物理位置和宽度，而非假定默认位置', () => {
  const area = { x: 0, y: 0, width: 2560, height: 1400, scaleFactor: 1.25 };
  const display = { x: 1500, y: 200, width: 600, height: 500 };
  const windows = layout.createRevenueWindowLayout(area, display);
  assert.deepEqual(Object.values(windows).map(p => [p.x,p.y,p.width,p.height]), [
    [892,10,300,240],[892,258,300,200],[892,466,300,160],
  ]);
  for (const p of Object.values(windows)) assert.ok((p.x+p.width+8)*1.25 <= display.x);
});

test('弹幕窗靠左时收益列放右侧，仍在工作区内', () => {
  const windows = layout.createRevenueWindowLayout({x:0,y:0,width:1920,height:1080}, {x:10,y:10,width:500,height:700});
  assert.equal(windows.gift.x, 518);
});

test('实际弹幕窗两侧有最小收益宽度时先收缩避让，不回退重叠', () => {
  const windows=layout.createRevenueWindowLayout({x:0,y:0,width:1000,height:1000},{x:280,y:10,width:440,height:600});
  assert.deepEqual([windows.gift.x,windows.gift.width],[10,262]);
});

test('所有窗口恢复有效的旧几何，不依赖custom标记', () => {
  const geometry = { x:-500,y:10,width:320,height:400 };
  for (const kind of ['display','gift','gift-only','superchat','guard']) {
    for (const saved of [geometry, {...geometry,custom:false}, {...geometry,custom:true}]) {
      assert.equal(layout.shouldRestoreWindowGeometry(kind, saved), true);
    }
    assert.equal(layout.shouldRestoreWindowGeometry(kind, null), false);
  }
});
