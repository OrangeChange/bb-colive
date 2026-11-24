import test from 'node:test';
import assert from 'node:assert/strict';
import { isPaidEventVisibleAtThreshold } from '../src/giftThreshold.ts';
import { existsSync } from 'node:fs';
import { createStylePreviewEvents } from '../src/components/stylePreviewEvents.ts';
import { getSystemMessage } from '../src/components/systemReminder.ts';

test('静态采用确认的62项并按类别排列，保留身份与价格梯度', () => {
 const all=createStylePreviewEvents('混合流');
 assert.equal(all.length,62);
 const counts=[['弹幕',17],['互动',7],['礼物',12],['醒目留言',8],['大航海',4],['红包/天选',6],['系统',8]];
 assert.deepEqual(all.map(e=>e.id),counts.flatMap(([kind,count])=>{const rows=createStylePreviewEvents(kind);assert.equal(rows.length,count,kind);return rows.map(e=>e.id)}));
 assert.deepEqual(all.slice(0,6).map(e=>e.user.uname),['极星萤昼','诸仙immortal','傾--城','奥利奥爱吃马里奥','猫耳小月子','东爱璃Lovely']);
 const whale=all.find(e=>e.user?.uname==='鲸落落raku');assert.equal(whale.text,'送我');assert(!whale.danmuDeleted);assert.equal(whale.user.currentRank,undefined);
 assert.equal(all.find(e=>e.user?.uname==='零点上将').user.currentRank,undefined);
 const merged=all.find(e=>e.danmuRepeatCount);assert.equal(merged.danmuRepeatCount,3);assert.equal(merged.text,'晚安');assert.equal(merged.user.currentRank,undefined);
 assert.deepEqual(all.filter(e=>e.user?.currentRank).map(e=>[e.user.uname,e.user.currentRank]),[['奥利奥爱吃马里奥',1],['迟年春',2],['礼-雾响碧潮',3]]);
 const ticket=all.find(e=>e.user?.uname==='86永不落幕');assert.equal(ticket.gift.name,'人气票');assert.equal(ticket.gift.count,1);
 const gift=all.find(e=>e.gift?.count===432);assert.equal(gift.gift.totalRmb,43.2);assert.equal(gift.user.uname,'邪恶的马星瞳_official');
 assert.equal(all.filter(e=>isPaidEventVisibleAtThreshold(e,0.1)).length,60);
 assert.equal(all.filter(e=>e.msgType===5).length,1);assert.equal(all.filter(e=>e.msgType===7).length,1);
 assert(all.every(e=>![16,26].includes(e.msgType)));
 all[0].text='修改';assert.equal(createStylePreviewEvents('混合流')[0].text,'无法下播之人');
});
test('静态所有头像与图片本地可用，包含主播和开奖名单头像',()=>{
 const all=createStylePreviewEvents('混合流');
 for(const e of all){for(const u of [e.user,e.broadcaster,e.replyTo,...(e.lottery?.winners??[])])if(u?.uid){assert(u.avatar,`${e.id} ${u.uid}`);assert(existsSync(new URL('../public'+u.avatar,import.meta.url)),u.avatar)}if(e.msgType===4||e.msgType===9)assert(e.broadcaster?.avatar,e.id)}
 assert(!/https?:|AppData|cc_work/.test(JSON.stringify(all)));
});
test('静态系统文案及总督资料符合确认值',()=>{
 const all=createStylePreviewEvents('混合流');const mute=getSystemMessage(all.find(e=>e.msgType===19));assert.deepEqual(mute,{title:'主播开启了禁言',detail:'范围：荣耀等级低于1级的用户'});
 assert.equal(all.find(e=>e.msgType===18).user.uname,'アイノラパス');
 assert.equal(all.find(e=>e.msgType===24).text,'涉及低俗画面，包括但不限于游戏 / 动漫人物着装暴露或存在低俗表现、桌面壁纸或绘画类素材含低俗形象等');
 assert.equal(all.find(e=>e.msgType===25).text,'游戏中玩家语聊、玩家呢称、玩家信息、聊天框内容、素材内容存在违规信息');
 const guard=all.find(e=>e.guard?.level===3);assert.equal(guard.user.uid,'527868');assert.equal(guard.guard.count,1);assert.match(guard.text,/1430天/);
});

test('静态实录时间使用采集时间，独立活动倒计时不改写发生时间',async()=>{
 const {default:data}=await import('../src/preview/nativeStaticSamples.json',{with:{type:'json'}});
 const all=createStylePreviewEvents('混合流');
 for(const s of data.samples)assert.equal(all.find(e=>e.id===s.event.id).ts,s.originalTimestamp,s.key);
 const {projectNativePreviewActivities}=await import('../src/preview/nativePreviewActivities.ts');const{activityPresentation}=await import('../src/events/activityLifecycle.ts');
 const now=Math.max(...all.map(e=>e.ts))+1;const source=all.find(e=>e.pocket?.rpType===2);const projected=projectNativePreviewActivities(all,now,true).find(e=>e.id===source.id);
 assert.equal(projected.ts,source.ts);assert.equal(activityPresentation(projected.activity,now).remainingSeconds,source.lottery.waitTime);
});
