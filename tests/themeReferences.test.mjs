import test from "node:test";
import assert from "node:assert/strict";
import { createCustomThemeDocument } from "../src/themes/themeTypes.ts";
import { listThemeReferences, saveThemeDocument, saveAndUpdateThemeReferences } from "../src/themes/themeReferences.ts";

const bindings = [
  { targetId: "live", targetKind: "live", themeId: "theme-a", revision: 1 },
  { targetId: "windows", targetKind: "windows", themeId: "theme-b", revision: 1 },
  { targetId: "obs-one", targetKind: "obs", themeId: "theme-a", revision: 1 },
];

test("主题引用列出准确的用户目标名称", () => {
  assert.deepEqual(listThemeReferences("theme-a", bindings).map(item => item.label), ["现场", "OBS 配置 obs-one"]);
  assert.deepEqual(listThemeReferences("unused", bindings), []);
});

test("保存主题不发布任何运行目标", async () => {
  const document = createCustomThemeDocument({ themeId: "theme-a", mode: "native", name: "主题 A" });
  document.revision = 2;
  const order = [];
  const result = await saveThemeDocument(document, async () => { order.push("save"); });
  assert.deepEqual(order, ["save"]);
  assert.equal(result, document);
});

test("保存失败时不发布任何运行目标", async () => {
  const document = createCustomThemeDocument({ themeId: "theme-a", mode: "native", name: "主题 A" });
  let publishes = 0;
  await assert.rejects(() => saveThemeDocument(document, async () => { throw new Error("disk"); }), /disk/);
  assert.equal(publishes, 0);
});

test("保存并更新只发布引用本主题的目标，并使用保存后的修订", async () => {
  const document = createCustomThemeDocument({ themeId: "theme-a", mode: "native", name: "主题 A" });
  const actions = [];
  const saved = { ...document, revision: 2 };
  assert.equal(await saveAndUpdateThemeReferences(document, {
    save: async () => { actions.push("save"); return saved; },
    bindings: async () => bindings,
    publish: async (value, binding) => { actions.push(`${binding.targetId}:${value.revision}`); },
  }), saved);
  assert.deepEqual(actions, ["save", "live:2", "obs-one:2"]);
});

test("一个目标更新失败不阻止其他引用更新，并明确主题已保存", async () => {
  const document = createCustomThemeDocument({ themeId: "theme-a", mode: "native", name: "主题 A" });
  const updated = [];
  await assert.rejects(() => saveAndUpdateThemeReferences(document, {
    save: async () => document,
    bindings: async () => bindings,
    publish: async (_, binding) => { if(binding.targetId === "live") throw new Error("准备失败"); updated.push(binding.targetId); },
  }), /主题已保存.*现场.*准备失败/);
  assert.deepEqual(updated, ["obs-one"]);
});


test('部分更新失败的重试仅使用保存快照和失败目标', async () => {
  const {ThemeReferenceUpdateError,retryThemeReferences}=await import('../src/themes/themeReferences.ts');
  const document=createCustomThemeDocument({themeId:'theme-a',mode:'native',name:'A'});
  let failure, saves=0;const sent=[];
  try {await saveAndUpdateThemeReferences(document,{save:async()=>{saves++;return document;},bindings:async()=>bindings,publish:async(_,b)=>{if(b.targetId==='live')throw Error('暂不可用');}});}catch(e){failure=e;}
  assert.ok(failure instanceof ThemeReferenceUpdateError);
  document.metadata.name='后续草稿';
  await retryThemeReferences(failure,{bindings:async()=>bindings,publish:async(d,b)=>sent.push([d.metadata.name,b.targetId])});
  assert.equal(saves,1);assert.deepEqual(sent,[['A','live']]);
  const skipped=await retryThemeReferences(failure,{bindings:async()=>bindings.map(b=>({...b,themeId:'other'})),publish:async()=>assert.fail('已改绑目标不应更新')});
  assert.deepEqual(skipped,['现场']);
});

test('恢复旧主题后重试仍更新原失败窗口，跳过之后已更新的窗口', async () => {
  const {ThemeReferenceUpdateError,retryThemeReferences}=await import('../src/themes/themeReferences.ts');
  const document=createCustomThemeDocument({themeId:'theme-a',mode:'native',name:'A'});
  document.revision=2;
  const binding={targetId:'windows',targetKind:'windows',themeId:'theme-a',revision:4};
  const failure=new ThemeReferenceUpdateError(document,[{binding,message:'暂不可用'}]);
  let sent=0;
  assert.deepEqual(await retryThemeReferences(failure,{bindings:async()=>[binding],publish:async()=>{sent++;}}),[]);
  assert.equal(sent,1);
  assert.deepEqual(await retryThemeReferences(failure,{bindings:async()=>[{...binding,revision:5}],publish:async()=>assert.fail('已更新的窗口不应覆盖')}),['副窗口']);
});
