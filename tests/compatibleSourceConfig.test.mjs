import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync('src/compat/blivechat/BlivechatSourceSurface.tsx','utf8');
const body=source.match(/function stableValue\(value: unknown\): string \{[\s\S]*?\n\}/)[0];
const stableValue=Function(`${stripTypeScriptTypes(body)};return stableValue`)();
test('来源配置的可选字段按 JSON 规则省略，数组空值保持位置',()=>{
 const config={showGiftName:undefined,enabled:true,nested:{b:2,a:undefined},values:[undefined,3]};
 assert.deepEqual(JSON.parse(stableValue(config)),{enabled:true,nested:{b:2},values:[null,3]});
 assert.equal(stableValue({b:2,a:1}),stableValue({a:1,b:2}));
});
