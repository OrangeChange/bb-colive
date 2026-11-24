import test from 'node:test';
import assert from 'node:assert/strict';
import { MsgType } from '../src/protocol/types.ts';
import { normalizePriceGradient, priceBandForEvent, priceGradientClass, renderPriceGradientCss, priceBandColor, setPriceBandColor } from '../src/themes/nativePriceGradient.ts';
import { themeAdjustments, applyThemeAdjustments, restoreThemeAdjustments } from '../src/themes/themeAdjustments.ts';
import { reverseSyncPriceGradientCss } from '../src/themes/nativePriceGradientCss.ts';
import { patchManagedNativeCss, renderManagedNativeCss } from '../src/themes/nativeManagedCss.ts';
import { createBuiltinNativeTheme } from '../src/themes/nativeBuiltinThemes.ts';
const event=(value,blind=false)=>({msgType:MsgType.Gift,gift:{totalRmb:value,priceRmb:value,count:1,...(blind?{blindGiftName:'盲盒',blindHitPriceRmb:value,paymentRmb:9}:{})}});

test('价格档位颜色与用户背景填充分离，旧档位声明仍可回填',()=>{
 const model=normalizePriceGradient();
 const css=renderPriceGradientCss(model,true);
 assert.match(css,/--price-tier-background-color:/);
 assert.match(css,/background: var\(--event-background, var\(--price-gradient-background, var\(--price-tier-background-color\)\)\)/);
 const legacy=css.replaceAll('--price-tier-background-color:','--event-background:').replace('--event-background: rgba(152, 219, 255, 0.3);','--event-background: #123456;');
 const result=reverseSyncPriceGradientCss(legacy,model,true);
 assert.equal(priceBandColor(result.model,'common','band-1','light','background'),'#123456');
});
test('档位按价值左闭右开，包含低于30元的基础档',()=>{
 const model=normalizePriceGradient();
 assert.deepEqual(model.bands.map(b=>b.min),[0,30,50,100,500,1000,2000]);
 for(const amount of [0,29.99,30,49.99,50,99.99,100,2000])assert.equal(priceBandForEvent(event(amount),model)?.min,[...model.bands].reverse().find(b=>b.min<=amount).min);
 assert.equal(priceBandForEvent(event(100,true),model).min,100);
 assert.equal(priceBandForEvent({msgType:MsgType.SuperChat,sc:{price:500}},model).min,500);
});
test('总开关与分类开关共同控制，固定配色配置保留',()=>{
 const model=normalizePriceGradient();assert(!priceGradientClass(event(100),model,false).includes('price-gradient-active'));
 assert(priceGradientClass(event(100),model,true).includes('price-gradient-active'));
 model.types.normal=false;assert(!priceGradientClass(event(100),model,true).includes('price-gradient-active'));
 assert(priceGradientClass(event(100,true),model,true).includes('price-gradient-active'));
 assert.equal(renderPriceGradientCss(model,false),'');
});
test('共用颜色、分类覆盖和明暗继承独立，恢复后沿用共用值',()=>{
 let model=normalizePriceGradient();const id=model.bands[3].id;
 model=setPriceBandColor(model,'common',id,'common','color','#123456');
 model=setPriceBandColor(model,'superchat',id,'dark','color','#abcdef');
 assert.equal(priceBandColor(model,'normal',id,'dark','color'),'#123456');
 assert.equal(priceBandColor(model,'superchat',id,'dark','color'),'#abcdef');
 model=setPriceBandColor(model,'superchat',id,'dark','color',undefined);
 assert.equal(priceBandColor(model,'superchat',id,'dark','color'),'#123456');
 const css=renderPriceGradientCss(model,true);assert(css.includes('.price-tier-'+id));assert(!css.includes('['));assert(!css.includes('.username'));assert(!css.includes('.blind-profit'));
});
test('自定义起始金额排序去重，保存往返保留颜色和开关',()=>{
 const model=normalizePriceGradient({bands:[{id:'high',min:100},{id:'base',min:0},{id:'duplicate',min:100}],types:{normal:false}});
 assert.deepEqual(model.bands.map(b=>b.min),[0,100]);assert.equal(model.types.normal,false);
 assert.deepEqual(normalizePriceGradient(JSON.parse(JSON.stringify(model))),model);
});
test('分类浅色覆盖不会渗入深色模式',()=>{
 let model=normalizePriceGradient();const id=model.bands[3].id;
 model=setPriceBandColor(model,'normal',id,'light','color','#123456');
 const css=renderPriceGradientCss(model,true);
 assert(css.includes(`.dark .event.gift-normal.price-gradient-active.price-tier-${id} {\n  --price-color: ${priceBandColor(model,'normal',id,'dark','color')};`));
});
test('保存删除的档位覆盖不复活，恢复基础保留梯度、恢复可视化清除梯度',()=>{
 const base={settings:{display:{usePriceGradient:false},priceGradient:{colors:{normal:{a:{light:{color:'#123456'}}}}}},styles:{baseCss:'',visualCss:'',customCss:''}};
 const edited=structuredClone(base);edited.settings.priceGradient.colors={};edited.settings.display.usePriceGradient=true;
 const saved=applyThemeAdjustments(base,themeAdjustments(base,edited));assert.deepEqual(saved.settings.priceGradient.colors,{});
 assert.deepEqual(restoreThemeAdjustments(base,edited,'basic').settings.priceGradient,edited.settings.priceGradient);
 assert.deepEqual(restoreThemeAdjustments(base,edited,'visual').settings.priceGradient,base.settings.priceGradient);
});
test('高级编辑改色回写档位，可视化改色同步到代码且不重复生成规则',()=>{
 const settings=createBuiltinNativeTheme('native-default').settings;settings.display.usePriceGradient=true;settings.priceGradient=normalizePriceGradient();
 const original=renderManagedNativeCss(settings);const edited=original.replace('--price-color: rgb(156, 128, 17);','--price-color: #123456;');
 const result=reverseSyncPriceGradientCss(edited,settings.priceGradient,true);
 assert.equal(priceBandColor(result.model,'common','band-3','light','color'),'#123456');
 assert(!result.css.includes('.price-gradient-active'));
 const next={...settings,priceGradient:setPriceBandColor(settings.priceGradient,'common','band-3','light','color','#abcdef')};
 const patched=patchManagedNativeCss(original,settings,next);
 assert(patched.includes('--price-color: #abcdef;'));
 assert.equal((patched.match(/\.event\.price-gradient-active\.price-tier-band-3 \{/g)||[]).length,2);
});
test('高级CSS档位内的额外声明及消费规则修改原样保留',()=>{
 const model=normalizePriceGradient();const css=renderPriceGradientCss(model,true).replace('--price-color: rgb(156, 128, 17);','--price-color: #123456;\n  border-radius: 12px;').replace('background: var(--event-background, var(--price-gradient-background, var(--price-tier-background-color)));','background: #123456;\n  border: 1px solid red;');
 const result=reverseSyncPriceGradientCss(css,model,true);
 assert(result.css.includes('border-radius: 12px;'));assert(result.css.includes('background: #123456;'));assert(result.css.includes('border: 1px solid red;'));
 const extra='@media (max-width: 500px) { .event.price-gradient-active.price-tier-band-3 { --price-color: red; } }';
 assert(reverseSyncPriceGradientCss(css+extra,model,true).css.includes(extra));
});
test('主题底色分别适配透明默认与实体卡片，用户仍可设为透明',()=>{
 const model=normalizePriceGradient(undefined,'bubble');assert(priceBandColor(model,'common','band-3','dark','background').startsWith('rgb('));
 const edited=setPriceBandColor(model,'common','band-3','dark','background','transparent');assert.equal(priceBandColor(edited,'common','band-3','dark','background'),'transparent');
 assert(priceBandColor(normalizePriceGradient(),'common','band-3','dark','background').startsWith('rgba('));
});

test('价格梯度保留主题背景透明度：默认30%，卡片与气泡不透明',()=>{
 for(const preset of ['default','card','bubble']){
  const model=normalizePriceGradient(undefined,preset);
  for(const band of model.bands)for(const scheme of ['light','dark']){
   const background=priceBandColor(model,'common',band.id,scheme,'background');
   if(preset==='default')assert.match(background,/, 0\.3\)$/);
   else assert.match(background,/^rgb\(/);
  }
 }
});

test('新建原生主题默认开启价格梯度',()=>{
 assert.equal(createBuiltinNativeTheme('native-default').settings.display.usePriceGradient,true);
});

test('自定义档位删除与恢复后不复用标识，修改金额保留配色绑定',async()=>{
 const {addPriceBand}=await import('../src/themes/nativePriceGradient.ts');
 assert.equal(typeof addPriceBand,'function');
 let model=addPriceBand(normalizePriceGradient());
 const added=model.bands.at(-1);model=setPriceBandColor(model,'common',added.id,'light','color','#123456');
 model=normalizePriceGradient({...model,bands:model.bands.map(b=>b.id===added.id?{...b,min:40}:b)});
 assert.equal(priceBandColor(model,'common',added.id,'light','color'),'#123456');
 model=normalizePriceGradient({...model,bands:model.bands.filter(b=>b.id!==added.id)});
 assert.notEqual(addPriceBand(model).bands.at(-1).id,added.id);
 const restored=normalizePriceGradient({nextCustomId:model.nextCustomId});
 assert.notEqual(addPriceBand(restored).bands.at(-1).id,added.id);
});

test('修改门槛跨越原价格范围也保持档位的默认配色',async()=>{
 const {setPriceBandMin}=await import('../src/themes/nativePriceGradient.ts');
 assert.equal(typeof setPriceBandMin,'function');
 const before=normalizePriceGradient();const after=setPriceBandMin(before,'band-1',80);
 for(const scheme of ['light','dark'])for(const prop of ['color','background'])assert.equal(priceBandColor(after,'common','band-1',scheme,prop),priceBandColor(before,'common','band-1',scheme,prop));
});

 test('三个主题内置档位沿用已确认的明暗配色',()=>{
const expected={"default":{"light":[["rgb(61, 83, 114)","rgba(156, 176, 218, 0.3)"],["rgb(29, 91, 171)","rgba(152, 219, 255, 0.3)"],["rgb(33, 115, 126)","rgba(146, 241, 241, 0.3)"],["rgb(156, 128, 17)","rgba(249, 221, 128, 0.3)"],["rgb(176, 89, 8)","rgba(240, 187, 101, 0.3)"],["rgb(193, 61, 41)","rgba(255, 170, 146, 0.3)"],["rgb(159, 19, 85)","rgba(251, 98, 98, 0.3)"]],"dark":[["rgb(160, 185, 221)","rgba(82, 99, 134, 0.3)"],["rgb(170, 205, 255)","rgba(70, 124, 152, 0.3)"],["rgb(140, 217, 229)","rgba(51, 130, 131, 0.3)"],["rgb(230, 201, 105)","rgba(137, 115, 35, 0.3)"],["rgb(254, 185, 140)","rgba(149, 108, 34, 0.3)"],["rgb(255, 182, 167)","rgba(194, 125, 106, 0.3)"],["rgb(255, 177, 200)","rgba(176, 85, 82, 0.3)"]]},"card":{"light":[["rgb(65, 83, 108)","rgb(255, 254, 250)"],["rgb(45, 93, 157)","rgb(255, 254, 250)"],["rgb(53, 113, 122)","rgb(255, 254, 250)"],["rgb(125, 103, 21)","rgb(255, 254, 250)"],["rgb(154, 84, 31)","rgb(255, 254, 250)"],["rgb(177, 67, 50)","rgb(255, 254, 250)"],["rgb(148, 43, 86)","rgb(255, 254, 250)"]],"dark":[["rgb(158, 178, 208)","rgb(27, 33, 30)"],["rgb(170, 198, 239)","rgb(27, 33, 30)"],["rgb(147, 208, 218)","rgb(27, 33, 30)"],["rgb(219, 195, 120)","rgb(27, 33, 30)"],["rgb(239, 182, 146)","rgb(27, 33, 30)"],["rgb(252, 176, 159)","rgb(27, 33, 30)"],["rgb(240, 176, 194)","rgb(27, 33, 30)"]]},"bubble":{"light":[["rgb(62, 83, 112)","rgb(234, 239, 248)"],["rgb(34, 92, 167)","rgb(227, 241, 249)"],["rgb(40, 114, 125)","rgb(224, 243, 243)"],["rgb(126, 102, 3)","rgb(244, 239, 220)"],["rgb(160, 80, 6)","rgb(249, 237, 219)"],["rgb(188, 55, 35)","rgb(255, 232, 225)"],["rgb(156, 28, 85)","rgb(244, 200, 200)"]],"dark":[["rgb(158, 182, 216)","rgb(56, 64, 80)"],["rgb(169, 202, 249)","rgb(47, 70, 83)"],["rgb(141, 213, 224)","rgb(41, 73, 73)"],["rgb(225, 198, 108)","rgb(75, 66, 34)"],["rgb(248, 183, 140)","rgb(81, 63, 33)"],["rgb(245, 164, 148)","rgb(102, 66, 55)"],["rgb(249, 175, 197)","rgb(94, 53, 51)"]]}};
for(const [preset,modes]of Object.entries(expected))for(const[scheme,rows]of Object.entries(modes))for(const[ i,[color,background]]of rows.entries()){const model=normalizePriceGradient(undefined,preset);assert.equal(priceBandColor(model,'common','band-'+i,scheme,'color'),color);assert.equal(priceBandColor(model,'common','band-'+i,scheme,'background'),background);}
});
