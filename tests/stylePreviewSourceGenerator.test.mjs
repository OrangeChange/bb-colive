import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpenLiveSimulation} from '../public/openlive/simulation.mjs';
import {createBlivechatSimulation} from '../public/blivechatSimulation.mjs';
import {bindSimulationIdentity} from '../public/previewSimulationIdentity.mjs';
import {createBlivechatFixedPreviewRecords} from '../src/compat/blivechat/previewRecords.mjs';
test('来源已有不同ID的同名用户不合并，默认头像本地化',()=>{
  for(const uid of ['first','second']) {
    const event=bindSimulationIdentity({payload:{uid,authorName:'同名',avatarUrl:'//static.hdslb.com/images/member/noface.gif'}},'s',1);
    assert.equal(event.payload.uid,uid);
    assert.equal(event.payload.avatarUrl,'/media/noface.gif');
  }
});
for(const [name,create] of [['原版',createBlivechatSimulation],['开放版',createOpenLiveSimulation]]) {
  test(`${name}空类别无输出，礼物金额与购买档位配套`,()=>{
    const generator=create({random:()=>0,now:()=>1000});
    assert.equal(generator.next({types:{}}),null);
    for(const level of [1,2,3]) {
      const record=generator.next({types:{member:true},guards:[level]});
      assert.equal(record.method,'onAddMember');
      assert.equal(record.payload.privilegeType,level);
      assert.equal(record.payload.totalCoin??record.payload.price*1000,[0,19998000,1998000,198000][level]);
    }
    assert.equal(generator.next({types:{gift:true},gifts:[]}),null);
    const gifts=generator.gifts??createBlivechatFixedPreviewRecords('blivechat-open').filter(r=>r.method==='onAddGift').map(r=>r.payload??r.data);
    const gift=gifts.find(g=>g.totalCoin>0&&g.coinType!=='silver');
    assert.equal(generator.next({types:{gift:true},gifts:[gift]}).payload.giftName,gift.giftName);
    assert.equal(generator.next({types:{superChat:true},prices:[500]}).payload.price,500);
  });
}
