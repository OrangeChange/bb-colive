import test from 'node:test';
import assert from 'node:assert/strict';
import * as bridge from '../src/compat/laplace/renderer/bridge.ts';
const css = { cloud: '正文{color:red}', remote: '', custom: '' };
const full = { channel: 'bb-laplace', version: 1, type: 'render', generation: 1, sequence: 1, events: [], stickyEvents: [], settings: {}, css, preview: false, scrollable: true, rate: 0 };
test('增量事件可复用已接收CSS，首帧和公开完整消息仍要求CSS', () => {
 const { css: omitted, ...delta } = full;
 assert.equal(bridge.isLaplaceRenderMessage(delta), false);
 assert.equal(bridge.isLaplaceRenderEnvelope(delta), false);
 assert.equal(bridge.isLaplaceRenderEnvelope(delta, css), true);
 assert.equal(bridge.isLaplaceRenderEnvelope(full), true);
 assert.equal(bridge.isLaplaceRenderEnvelope({ ...delta, css: { cloud: '' } }, css), false);
});
test('CSS值变化必须发送，缓存按字符串值判断而非对象身份', () => {
 assert.equal(bridge.sameLaplaceCss(css, { ...css }), true);
 assert.equal(bridge.sameLaplaceCss(css, { ...css, custom: 'a{}' }), false);
 assert.equal(bridge.sameLaplaceCss(undefined, css), false);
});
test('不变CSS只计量一次，增量消息仍计入完整CSS字节', () => {
 const Encoder = globalThis.TextEncoder; const lengths=[];
 globalThis.TextEncoder = class extends Encoder { encode(value) { lengths.push(value.length); return super.encode(value); } };
 try {
  const bigCss={cloud:'中文'.repeat(300000),remote:'',custom:''};
  assert.equal(bridge.isLaplaceRenderMessage({...full,css:bigCss}),true);
  const {css:omitted,...delta}=full;
  assert.equal(bridge.isLaplaceRenderEnvelope(delta,bigCss),true);
  assert.equal(lengths.filter(n=>n>500000).length,1);
 } finally {globalThis.TextEncoder=Encoder;}
});
test('部件显隐CSS变化不重复计量不变的云端CSS', () => {
 const Encoder=globalThis.TextEncoder;const lengths=[];
 globalThis.TextEncoder=class extends Encoder{encode(value){lengths.push(value.length);return super.encode(value)}};
 try {
  const base={cloud:'新'.repeat(600000),remote:'',custom:'a{}'};
  assert.equal(bridge.isLaplaceRenderMessage({...full,css:base}),true);
  assert.equal(bridge.isLaplaceRenderMessage({...full,css:{...base,custom:'b{}'}}),true);
  assert.equal(lengths.filter(n=>n>500000).length,1);
 }finally{globalThis.TextEncoder=Encoder;}
});
