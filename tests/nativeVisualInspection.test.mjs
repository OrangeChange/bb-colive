import test from 'node:test';import assert from 'node:assert/strict';
import {inspectNativeVisualPart} from '../src/themes/nativeVisualInspection.ts';
const inspect=(styles,target={event:'all',identity:'all',part:'activityStatus'})=>{const nodes=styles.map(style=>({style,closest:()=>({matches:()=>true})}));return inspectNativeVisualPart({querySelector:()=>({contentDocument:{defaultView:{getComputedStyle:n=>n.style},querySelectorAll:()=>nodes}})},target)};
const base={display:'inline-flex',fontFamily:'MiSans, sans-serif',fontSize:'12px',lineHeight:'20px',color:'rgb(50, 60, 70)',backgroundColor:'transparent',borderTopColor:'transparent',paddingLeft:'6px',paddingTop:'0px',marginLeft:'0px',marginTop:'0px',columnGap:'4px',borderTopWidth:'0px',borderTopLeftRadius:'6px',width:'60px',height:'20px'};
test('活动状态读回真实字号行高和颜色，不使用白色占位',()=>{const r=inspect([base]);assert.equal(r.fontSize.value,12);assert.equal(r.fontSize.mixed,false);assert.equal(r.lineHeight.value,1.6667);assert.equal(r.color.value,base.color)});
test('已开奖与进行中配色不同显示混合值，字号仍可统一编辑',()=>{const r=inspect([base,{...base,color:'rgb(100, 110, 120)'}]);assert.equal(r.color.mixed,true);assert.equal(r.fontSize.mixed,false)});
test('隐藏部件仍可从导航读回并恢复',()=>assert.equal(inspect([{...base,display:'none'}]).visible.value,false));
