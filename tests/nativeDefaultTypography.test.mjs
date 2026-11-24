import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{nativeVisualCodeDefault}from'../src/themes/nativeThemeDefaults.ts';import{createBuiltinNativeTheme}from'../src/themes/nativeBuiltinThemes.ts';import{resolveNativeLength}from'../src/themes/nativeComponentAppearance.ts';const base=readFileSync('src/eventStyle.css','utf8'),settings=createBuiltinNativeTheme('native-default').settings;
const value=(part,property,event='all',css=base)=>nativeVisualCodeDefault({event,identity:'all',part},property,settings,css);
test('默认主题的价格和活动主要内容继承主要字号',()=>{for(const part of['price','priceUnit','priceValue','giftCount','lotteryCount','redpocketAwards','winnerCount','honorHeading','honorSummary'])assert.equal(resolveNativeLength(value(part,'fontSize'),16),16,part)});
test('整组价格数量与开播下播时间的继承字重一致',()=>{for(const part of['lotteryName','redpocketName','price','priceUnit','priceValue','quantityPrefix','quantityNumber','quantityUnit','guardDurationUnit'])assert.equal(value(part,'fontWeight'),700,part);assert.equal(value('timestamp','fontWeight','liveStart'),700);assert.equal(value('timestamp','fontWeight','liveEnd'),700)});
test('默认紧凑提示与辅助说明保持次要字号',()=>{for(const[part,event]of[['message','system'],['username','interaction'],['systemTitle','system'],['giftSourcePrice','blind'],['blindGiftCount','blind'],['giftProfit','blind'],['giftProfitPositive','blind'],['giftProfitNegative','blind'],['guardDays','guard']])assert.equal(resolveNativeLength(value(part,'fontSize',event),16),14,part)});
test('卡片与气泡保留各自的字号并显示整组继承字重',()=>{for(const[id,size,weight]of[['native-card',20,700],['native-bubble',14,700]]){const css=createBuiltinNativeTheme(id).styles.baseCss;assert.equal(resolveNativeLength(value('priceUnit','fontSize','all',css),16),size);assert.equal(value('priceUnit','fontWeight','all',css),weight);for(const part of['quantityPrefix','quantityNumber','quantityUnit'])assert.equal(value(part,'fontWeight','gift',css),700);assert.equal(value('price','fontWeight','superchat',css),weight)}});

test('默认主题空基础CSS沿用共享价格字号；卡片图片沿用卡片尺寸',()=>{
 const builtin=createBuiltinNativeTheme('native-default');
 assert.equal(resolveNativeLength(value('giftPrice','fontSize','gift',builtin.styles.baseCss),24),24);
 const card=createBuiltinNativeTheme('native-card');
 assert.equal(resolveNativeLength(value('giftImage','width','gift',card.styles.baseCss),24),48);
});
