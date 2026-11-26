import test from 'node:test';import assert from 'node:assert/strict';
import {placeEventOverlay} from '../src/components/eventOverlayGeometry.ts';
const bounds={left:100,top:120,right:500,bottom:360,width:400,height:240};
test('菜单在内容区内保留8px并优先向上避让',()=>{
 const a={left:470,top:320,right:490,bottom:340,width:20,height:20};
 const p=placeEventOverlay(a,238,180,bounds);assert.equal(p.left,252);assert.equal(p.top,132);assert.equal(p.maxHeight,224);
});
test('过大浮层按内容区尺寸限制，不跨出区域',()=>{
 const a={left:110,top:125,right:130,bottom:145,width:20,height:20};
 const p=placeEventOverlay(a,600,500,bounds);assert.equal(p.left,108);assert.equal(p.top,128);assert.equal(p.maxWidth,384);assert.equal(p.maxHeight,224);
});
