import test from 'node:test';import assert from 'node:assert/strict';
import {formatThemeDate,formatThemeTimestamp} from '../src/themes/themeDate.ts';
import {createCatalogThemes} from '../src/themes/builtinThemeCatalog.ts';
import {createBuiltinNativeTheme} from '../src/themes/nativeBuiltinThemes.ts';

test('主题时间展示统一且正确换算实际来源时区',()=>{
 for(const raw of ['2026-03-21T02:01:40.000Z','Mar 21, 2026, 10:01:40 AM GMT+8','2026-03-21 10:01:40 +08:00'])assert.equal(formatThemeDate(raw,'Asia/Shanghai'),'2026-03-21 10:01');
 assert.equal(formatThemeDate('May 28, 2025, 8:25:56 AM PDT','Asia/Shanghai'),'2025-05-28 23:25');
 assert.equal(formatThemeDate('May 18, 2025, 11:05:00\u202fPM UTC+8','Asia/Shanghai'),'2025-05-18 23:05');
});
test('日期、未注明时区和实际非标准时间不伪造精度',()=>{
 assert.equal(formatThemeDate('2026-10-21','Asia/Shanghai'),'2026-10-21');
 assert.equal(formatThemeDate('Aug 9, 2024, 7:40 PM','Asia/Shanghai'),'2024-08-09 19:40（时区未注明）');
 assert.equal(formatThemeDate('Apr 1, 2026, 0:00:00 PM GMT+8','Asia/Shanghai'),'2026-04-01（时间未明确）');
 assert.equal(formatThemeDate(''),'未标注');assert.equal(formatThemeDate(undefined),'未标注');
});
test('本地记录采用常用格式并保留实际时区',()=>{
 const date=new Date('2026-11-09T06:30:00.123Z');
 assert.equal(formatThemeTimestamp(date,'Asia/Shanghai'),'2026-11-09 14:30:00 +08:00');
 assert.equal(formatThemeTimestamp(date,'UTC'),'2026-11-09 06:30:00 +00:00');
 assert.equal(formatThemeTimestamp(new Date('2025-05-28T15:25:56Z'),'America/Los_Angeles'),'2025-05-28 08:25:56 -07:00');
});
test('BLC缺省作者为default而已署名不变，原生只有可确认日期',()=>{
 const docs=createCatalogThemes().filter(d=>d.mode.startsWith('blivechat'));assert.ok(docs.every(d=>d.metadata.author));
 assert.equal(docs.find(d=>d.themeId==='blivechat-open-bubble').metadata.author,'兔宝的神奇口袋');
 assert.equal(docs.find(d=>d.themeId==='blivechat-classic').metadata.author,'default');
 assert.equal(createBuiltinNativeTheme('native-default').metadata.updatedAt,'2026-11-16');
});
