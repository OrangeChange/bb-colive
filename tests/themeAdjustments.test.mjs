import { test } from 'node:test';
import assert from 'node:assert/strict';
import { themeAdjustments, applyThemeAdjustments, restoreThemeAdjustments } from '../src/themes/themeAdjustments.ts';

test('缺省空设置组不作为个人调整', () => {
  const defaults={settings:{},styles:{baseCss:'',visualCss:'',customCss:''}};
  assert.deepEqual(themeAdjustments(defaults,{...defaults,settings:{display:{}}}),{settings:{}});
});

test('personal changes preserve defaults and distinguish an empty CSS layer', () => {
  const defaults = { settings: { avatar: true, scale: 1 }, styles: { baseCss: 'base', visualCss: 'visual', customCss: 'custom' } };
  const edited = structuredClone(defaults);
  edited.settings.avatar = false;
  edited.styles.customCss = '';
  const changes = themeAdjustments(defaults, edited);
  assert.deepEqual(changes, { settings: { avatar: false }, customCss: '' });
  assert.deepEqual(applyThemeAdjustments(defaults, changes), edited);
  assert.deepEqual(applyThemeAdjustments(defaults, { settings: {} }), defaults);
  assert.equal(defaults.settings.avatar, true);
  assert.equal(defaults.styles.customCss, 'custom');
});

test('unmodified fields follow an updated default while explicit changes remain', () => {
  const defaults = { settings: { avatar: true, scale: 1 }, styles: { baseCss: 'base', visualCss: '', customCss: '' } };
  const edited = structuredClone(defaults);
  edited.settings.avatar = false;
  const changes = themeAdjustments(defaults, edited);
  defaults.settings.scale = 1.2;
  assert.deepEqual(applyThemeAdjustments(defaults, changes).settings, { avatar: false, scale: 1.2 });
});

test('unchanged controls in the same settings group follow updated defaults', () => {
  const defaults={settings:{display:{avatar:true,username:true},visualModel:{common:{defaultPart:{size:1}}}},styles:{baseCss:'',visualCss:'',customCss:''}};
  const edited=structuredClone(defaults);edited.settings.display.avatar=false;edited.settings.visualModel={common:{}};
  const changes=themeAdjustments(defaults,edited);
  assert.deepEqual(changes.settings.display,{avatar:false});
  defaults.settings.display.username=false;
  const loaded=applyThemeAdjustments(defaults,changes);
  assert.deepEqual(loaded.settings.display,{avatar:false,username:false});
  assert.deepEqual(loaded.settings.visualModel,{common:{}});
});

test('restoring a visual layer restores its model without resetting basic or custom changes', () => {
  const defaults={settings:{scale:1,visualModel:{parts:{}},visualAuthored:false},styles:{baseCss:'base',visualCss:'',customCss:''},assets:[]};
  const edited=structuredClone(defaults);
  edited.settings={scale:2,visualModel:{parts:{message:{fontSize:30}}},visualAuthored:true};
  edited.styles.visualCss='.message{font-size:30px}';edited.styles.customCss='custom';
  const restored=restoreThemeAdjustments(defaults,edited,'visual');
  assert.deepEqual(restored.settings,{...defaults.settings,scale:2});
  assert.equal(restored.styles.visualCss,'');assert.equal(restored.styles.customCss,'custom');
  assert.deepEqual(restoreThemeAdjustments(defaults,edited,'basic').settings,{...edited.settings,scale:1});
  assert.deepEqual(restoreThemeAdjustments(defaults,{...edited,assetOverrides:['assets/a.png']},'all').assetOverrides,[]);
});
