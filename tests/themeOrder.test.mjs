import test from 'node:test';import assert from 'node:assert/strict';
import {mergeThemeIndex} from '../src/themes/themeIndex.ts';
const theme=(themeId,mode,name=themeId)=>({themeId,mode,name,origin:'builtin',author:'',version:'',updatedAt:'',revision:1});
test('主题按样式、默认项和官方目录顺序排列',()=>{
 const items=[theme('laplace-curated-1','laplace'),theme('blivechat-open-yt','blivechat-open'),theme('native-card','native'),theme('laplace-builtin-bubble-next','laplace'),theme('blivechat-open-classic','blivechat-open'),theme('native-default','native'),theme('laplace-builtin-bubble','laplace'),theme('blivechat-open-default','blivechat-open'),theme('laplace-default','laplace')];
 assert.deepEqual(mergeThemeIndex([],items).map(t=>t.themeId),['native-default','native-card','blivechat-open-default','blivechat-open-classic','laplace-default','laplace-builtin-bubble','laplace-builtin-bubble-next','laplace-curated-1']);
});
