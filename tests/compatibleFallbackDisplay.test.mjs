import test from 'node:test';
import assert from 'node:assert/strict';
import {compatibleFallbackDisplay} from '../src/themes/compatThemeSettings.ts';
import {buildBlivechatObsSnapshot} from '../src/compat/blivechat/obs.ts';
import {renderManagedNativeCss} from '../src/themes/nativeManagedCss.ts';

test('BLC OBS 回退与原生投影共用主题元素偏好',()=>{
  const settings={showAvatar:false,showUsername:false,showGuardBadge:false,showModBadge:false,showTimestamp:true,maskUsername:true};
  const display=compatibleFallbackDisplay('blivechat',settings);
  const snapshot=buildBlivechatObsSnapshot({settings,mode:'blivechat'},{target:'obs',targetId:'obs',roomId:'1',displayScale:1});
  for(const key of ['showAvatar','showGuardIdentity','showAdminIdentity','showTimestamp','maskUsername'])assert.equal(snapshot.display[key],display[key]);
  assert.match(renderManagedNativeCss(snapshot.settings),/\.username[^}]*display:\s*none/s);
  assert.equal(snapshot.document.settings.showUsername,false);
});
