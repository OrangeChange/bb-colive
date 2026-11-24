import test from 'node:test';
import assert from 'node:assert/strict';
import {sourcePreviewCandidates} from '../src/preview/sourcePreviewGeneration.ts';
import {DEFAULT_STYLE_PREVIEW_POLICY,projectSourcePreviewFact} from '../src/preview/stylePreviewPolicy.ts';
test('两版已审核候选复用金额和类别准入',()=>{
 for(const source of ['blivechat','blivechat-open']){
  const records=sourcePreviewCandidates(source,{policy:{...DEFAULT_STYLE_PREVIEW_POLICY,giftThreshold:500},target:'obs',displayAll:false,eventType:'gift'});
  assert(records.length>0);assert(records.every(r=>r.method==='onAddGift'&&projectSourcePreviewFact(r,source).gift.priceRmb>=500));
  assert.equal(sourcePreviewCandidates(source,{policy:DEFAULT_STYLE_PREVIEW_POLICY,target:'obs',displayAll:false,visibility:{categories:{danmaku:false,interaction:false,gift:false,superchat:false,guard:false,system:false}}}).length,0);
 }
});

test('开放版银瓜子按免费金额准入，保留原始瓜子字段',()=>{
  const record={method:'onAddGift',payload:{coinType:'silver',totalCoin:9900,price:0,num:1,giftName:'B坷垃'}};
  const event=projectSourcePreviewFact(record,'blivechat-open');
  assert.equal(event.gift.priceRmb,0);
  assert.equal(event.gift.paymentRmb,0);
  assert.equal(record.payload.totalCoin,9900);
});
