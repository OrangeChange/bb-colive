import test from "node:test";
import assert from "node:assert/strict";
test("迟到订阅接收完整帧，后续仅追加实际记录且不重发配置", async () => {
  const { previewMessage, applyPreviewMessage } =
    await import("../src/preview/stylePreviewProtocol.ts");
  const a = {
    kind: "compatible",
    ownerId: "a",
    revision: 1,
    content: { document: { styles: { customCss: "x" } } },
    frame: { epoch: 1, records: [{ sequence: 1 }] },
  };
  const first = previewMessage(null, a);
  assert.equal(first.type, "preview:replace");
  const b = {
    ...a,
    revision: 2,
    frame: { epoch: 1, records: [{ sequence: 1 }, { sequence: 2 }] },
  };
  const next = previewMessage(a, b);
  assert.equal(next.type, "preview:frame");
  assert.deepEqual(next.frame.records, [{ sequence: 2 }]);
  assert.equal(next.state, undefined);
  assert.deepEqual(applyPreviewMessage(a, next), b);
  assert.equal(applyPreviewMessage(b, next), b);
  assert.equal(applyPreviewMessage(b, { type: "preview:clear" }), null);
});

test("兼容样式仅改配置时复用当前帧，迟到连接和不同帧仍传完整状态", async () => {
  const { previewMessage, applyPreviewMessage } =
    await import("../src/preview/stylePreviewProtocol.ts");
  const a = {
    kind: "compatible",
    ownerId: "a",
    revision: 1,
    content: { css: "red" },
    frame: {
      epoch: 1,
      records: [{ sequence: 1 }],
      presentation: { messages: [{ id: "a" }], paidMessages: [] },
    },
  };
  const b = { ...a, revision: 2, content: { css: "blue" } };
  const delta = previewMessage(a, b);
  assert.equal(delta.type, "preview:configure");
  assert.equal(delta.state.frame, undefined);
  const applied = applyPreviewMessage(a, delta);
  assert.deepEqual(applied, b);
  assert.notEqual(applied.frame, a.frame);
  assert.equal(
    applyPreviewMessage({ ...a, ownerId: "other" }, delta).ownerId,
    "other",
  );
  assert.equal(previewMessage(null, b).type, "preview:replace");
  assert.equal(
    previewMessage(a, { ...b, frame: { ...b.frame, epoch: 2 } }).type,
    "preview:replace",
  );
});

test('OBS 管理预览背景改变必须传给独立预览',async()=>{const{previewMessage,applyPreviewMessage}=await import('../src/preview/stylePreviewProtocol.ts');const a={kind:'obs',ownerId:'obs',revision:1,content:{events:[]},previewBackground:'transparent',frame:{epoch:0},width:400,height:600,scheme:'dark',palette:'pine'};const b={...a,revision:2,previewBackground:'#234567'};const message=previewMessage(a,b);assert.notEqual(message.type,'preview:frame');assert.equal(applyPreviewMessage(a,message).previewBackground,'#234567');});

test('新的预览会话完整状态不受旧会话版本号影响', async () => {
  const { applyPreviewMessage } = await import('../src/preview/stylePreviewProtocol.ts');
  const old = { kind: 'native', ownerId: 'old', revision: 20, content: {}, frame: { epoch: 0 } };
  const next = { ...old, ownerId: 'new', revision: 1 };
  assert.equal(applyPreviewMessage(old, { type: 'preview:replace', state: next }), next);
});

test("预览显示缩放改变时发送配置并保留当前帧", async () => {
  const { previewMessage, applyPreviewMessage } = await import("../src/preview/stylePreviewProtocol.ts");
  const before = { kind: "compatible", ownerId: "sample", revision: 1, content: {}, displayScale: 1, frame: { epoch: 1, records: [{ sequence: 1 }] } };
  const after = { ...before, revision: 2, displayScale: 1.25 };
  const message = previewMessage(before, after);
  assert.equal(message.type, "preview:configure");
  assert.equal(applyPreviewMessage(before, message).displayScale, 1.25);
  assert.deepEqual(applyPreviewMessage(before, message).frame, before.frame);
});

test('自定义主色改变会发送完整预览配置',async()=>{
 const {previewMessage,applyPreviewMessage}=await import('../src/preview/stylePreviewProtocol.ts');
 const a={kind:'native',ownerId:'native',revision:1,content:{events:[]},frame:{epoch:0},palette:'custom',customColor:'#e04e7e',scheme:'light'};
 const b={...a,revision:2,customColor:'#7c3aed'};
 const message=previewMessage(a,b);assert.notEqual(message.type,'preview:frame');assert.equal(applyPreviewMessage(a,message).customColor,'#7c3aed');
});
