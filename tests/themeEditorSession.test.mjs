import test from "node:test";
import assert from "node:assert/strict";
import { createThemeSessionHost } from "../src/themes/themeEditorSession.ts";
import { createBuiltinNativeTheme } from "../src/themes/nativeBuiltinThemes.ts";

function repository() {
  const builtin = createBuiltinNativeTheme("native-default");
  const stored = new Map();
  let loads = 0;
  return {
    stored, get loads() { return loads; },
    async loadThemeDocument(id) { loads += 1; if (id === builtin.themeId) return structuredClone(builtin); return structuredClone(stored.get(id)); },
    writes: [],
    async saveThemeDocument(document, options) {
      this.writes.push({ document: structuredClone(document), options: structuredClone(options) });
      stored.set(document.themeId, structuredClone(document));
    },
  };
}

test('保留草稿应用以磁盘最新修订保存，保留 CSS 和素材，失败后仍可重试', async () => {
  let disk = createBuiltinNativeTheme('native-default');
  let fail = false;
  const repo = {
    async loadThemeDocument() { return structuredClone(disk); },
    async saveThemeDocument(document) {
      assert.equal(document.revision, disk.revision + 1);
      if (fail) throw new Error('无法写入');
      disk = structuredClone(document);
    },
  };
  const host = createThemeSessionHost(repo);
  const session = await host.openThemeSession('native-default');
  session.saved.revision = session.document.revision = 4;
  host.updateThemeCustomCssDraft(session, '.event-area { --text-name: #080808; }', () => null);
  host.updateThemeAsset(session, d => d, 'assets/icon.png', new Uint8Array([1, 2, 3]));
  const draft = structuredClone(session.document);
  assert.equal(await host.checkThemeSessionForExternalChange(session), 'changed');
  fail = true;
  await assert.rejects(host.saveThemeSession(session, true), /无法写入/);
  assert.deepEqual(session.document, draft);
  assert.equal(session.saved.revision, 4);
  assert.equal(session.dirty, true);
  assert.deepEqual(session.assetChanges['assets/icon.png'], new Uint8Array([1, 2, 3]));
  fail = false;
  await host.saveThemeSession(session, true);
  assert.equal(disk.revision, 2);
  assert.equal(disk.styles.customCss, draft.styles.customCss);
  assert.equal(session.saved.revision, 2);
  assert.equal(session.dirty, false);
  assert.equal(session.externalDocument, undefined);
});

test('草稿恢复保留无效代码和素材，不写正式主题', async () => {
  const repo = repository(), first = createThemeSessionHost(repo);
  const session = await first.openThemeSession('native-default');
  first.updateThemeCustomCssDraft(session, '.event {', () => 'Unclosed block');
  first.updateThemeAsset(session, d => d, 'assets/icon.png', new Uint8Array([1, 2, 3]));
  const next = createThemeSessionHost(repo);
  next.restoreThemeDrafts([structuredClone(session)]);
  const restored = await next.openThemeSession('native-default');
  assert.equal(restored.customCssDraft, '.event {');
  assert.equal(restored.customCssError, 'Unclosed block');
  assert.deepEqual(restored.assetChanges['assets/icon.png'], new Uint8Array([1, 2, 3]));
  assert.equal(restored.dirty, true);
  assert.equal(repo.writes.length, 0);
});

test('恢复默认只修改草稿，正式主题保持不变', async () => {
  const repo = repository(), host = createThemeSessionHost(repo);
  const session = await host.openThemeSession('native-default');
  host.updateThemeDraft(session, d => ({...d, settings:{...d.settings,baseFontSize:24}}));
  host.restoreThemeDraft(session, session.saved, 'all');
  assert.deepEqual(session.document.settings, session.saved.settings);
  assert.equal(repo.writes.length, 0);
});

test('属性切回已保存内容后清除未保存状态，明暗字段顺序不影响结果', async () => {
  const host = createThemeSessionHost(repository());
  const session = await host.openThemeSession('native-default');
  session.saved.settings.visualModel = {common:{},dark:{},light:{}};
  session.document = structuredClone(session.saved);
  host.updateThemeDraft(session, d => ({...d, settings:{...d.settings, visualModel:{common:{'all|all|event':{visible:{source:'custom',value:false}}},light:{},dark:{}}}}));
  host.updateThemeVisualCssFromControls(session, session.saved.styles.visualCss);
  assert.equal(session.dirty, true);
  host.updateThemeDraft(session, d => ({...d, settings:{...d.settings, visualModel:{common:{},light:{},dark:{}}}}));
  host.updateThemeVisualCssFromControls(session, session.saved.styles.visualCss);
  assert.equal(session.dirty, false);
});

test('清除全部可视化覆盖后，空模型与未设置模型不产生未保存状态', async () => {
  const host = createThemeSessionHost(repository());
  const session = await host.openThemeSession('native-default');
  delete session.saved.settings.visualModel;
  session.document = structuredClone(session.saved);
  host.updateThemeDraft(session, d => ({...d, settings:{...d.settings, visualModel:{common:{},light:{},dark:{}},visualAuthored:{common:{},light:{},dark:{}}}}));
  host.updateThemeVisualCssFromControls(session, session.saved.styles.visualCss);
  assert.equal(session.dirty, false);
});

test('分项恢复立即保存该范围，保留其他未保存草稿，写入失败不改会话', async () => {
  const repo=repository(),host=createThemeSessionHost(repo);
  const session=await host.openThemeSession('native-default'),defaults=structuredClone(session.saved);
  host.updateThemeDraft(session,d=>({...d,settings:{...d.settings,baseFontSize:24},styles:{...d.styles,customCss:'.saved{}'}}));
  await host.saveThemeSession(session);
  const savedName=session.saved.metadata.name;
  host.updateThemeDraft(session,d=>({...d,metadata:{...d.metadata,name:'未保存名称',author:'未保存作者'}}));
  host.updateThemeCustomCssDraft(session,'.draft{}',()=>null);
  await host.restoreThemeSession(session,defaults,'basic');
  assert.deepEqual(session.saved.settings,defaults.settings);
  assert.equal(session.saved.styles.customCss,'.saved{}');
  assert.equal(session.customCssDraft,'.draft{}');assert.equal(session.dirty,true);
  assert.equal(session.document.metadata.name,'未保存名称');
  assert.equal(session.document.metadata.author,'未保存作者');
  assert.equal(session.saved.metadata.name,savedName);
  const previous=structuredClone(session.saved);
  repo.saveThemeDocument=async()=>{throw Error('不可写')};
  await assert.rejects(host.restoreThemeSession(session,defaults,'all'),/不可写/);
  assert.deepEqual(session.saved,previous);assert.equal(session.customCssDraft,'.draft{}');
});

test("并发保存同一草稿只写一次并保留保存期间的新编辑", async () => {
  const repo = repository();
  const host = createThemeSessionHost(repo, {createId: () => "concurrent"});
  const session = await host.saveThemeSessionAs(await host.openThemeSession("native-default"), {name:"副本",author:"Orange"});
  host.updateThemeDraft(session, document => ({...document, styles:{...document.styles, customCss:".first{}"}}));
  let release;
  const gate = new Promise(resolve => {release = resolve;});
  const write = repo.saveThemeDocument.bind(repo);
  repo.saveThemeDocument = async (...args) => { await gate; await write(...args); };
  const first = host.saveThemeSession(session), second = host.saveThemeSession(session);
  host.updateThemeDraft(session, document => ({...document, styles:{...document.styles, customCss:".second{}"}}));
  release();
  await Promise.all([first, second]);
  assert.equal(repo.writes.length, 2);
  assert.equal(session.saved.styles.customCss, ".first{}");
  assert.equal(session.document.styles.customCss, ".second{}");
  assert.equal(session.dirty, true);
});

test("保存期间的新草稿按顺序保存并获得新版本", async () => {
  const repo = repository(), host = createThemeSessionHost(repo, {createId:()=>"queued"});
  const session = await host.saveThemeSessionAs(await host.openThemeSession("native-default"), {name:"副本",author:"Orange"});
  host.updateThemeDraft(session, document => ({...document, styles:{...document.styles,customCss:".first{}"}}));
  let release; const gate = new Promise(resolve => {release = resolve;}); const write = repo.saveThemeDocument.bind(repo);
  repo.saveThemeDocument = async (...args) => {await gate; await write(...args);};
  const first = host.saveThemeSession(session);
  host.updateThemeDraft(session, document => ({...document, styles:{...document.styles,customCss:".second{}"}}));
  const second = host.saveThemeSession(session); release(); await Promise.all([first,second]);
  assert.deepEqual(repo.writes.slice(1).map(x=>x.document.revision),[2,3]);
  assert.equal(session.saved.styles.customCss,'.second{}'); assert.equal(session.dirty,false);
});

test("内置和自定义主题使用同一种编辑会话并复用缓存", async () => {
  const repo = repository();
  const host = createThemeSessionHost(repo, { createId: () => "saved-one", now: () => "2026-10-21T01:00:00.000Z" });
  const builtin = await host.openThemeSession("native-default");
  host.updateThemeDraft(builtin, document => ({ ...document, metadata: { ...document.metadata, name: "修改" } }));
  const saved = await host.saveThemeSessionAs(builtin, { name: "保存主题", author: "Orange" });
  assert.equal(saved.document.origin, "custom");
  assert.equal(saved.document.themeId, "saved-one");
  assert.equal(saved.document.metadata.name, "保存主题");
  const reopened = await host.openThemeSession("saved-one");
  assert.equal(reopened, saved);
  assert.equal(repo.loads, 1);
});

test("草稿更新支持撤销重做且不在编辑时写入仓库", async () => {
  const repo = repository();
  const host = createThemeSessionHost(repo);
  const session = await host.openThemeSession("native-default");
  host.updateThemeDraft(session, document => ({ ...document, styles: { ...document.styles, customCss: ".event{}" } }));
  assert.equal(session.dirty, true);
  assert.equal(repo.stored.size, 0);
  host.undoThemeEdit(session);
  assert.equal(session.document.styles.customCss, "");
  host.redoThemeEdit(session);
  assert.equal(session.document.styles.customCss, ".event{}");
});

test("丢弃会话后不会从缓存重新打开已删除主题", async () => {
  const builtin = createBuiltinNativeTheme("native-default");
  let available = true;
  const host = createThemeSessionHost({
    async loadThemeDocument() {
      if (!available) throw new Error("主题不存在");
      return structuredClone(builtin);
    },
    async saveThemeDocument() {},
  });
  await host.openThemeSession("native-default");
  host.discardThemeSession("native-default");
  available = false;
  await assert.rejects(() => host.openThemeSession("native-default"), /主题不存在/);
});

test("多个主题分别保留未保存草稿", async () => {
  const first = createBuiltinNativeTheme("native-default");
  const second = { ...structuredClone(first), themeId: "custom-two", origin: "custom" };
  const host = createThemeSessionHost({
    async loadThemeDocument(id) { return structuredClone(id === first.themeId ? first : second); },
    async saveThemeDocument() {},
  });
  const firstSession = await host.openThemeSession(first.themeId);
  host.updateThemeDraft(firstSession, document => ({ ...document, styles: { ...document.styles, customCss: ".first{}" } }));
  const secondSession = await host.openThemeSession(second.themeId);
  host.updateThemeDraft(secondSession, document => ({ ...document, styles: { ...document.styles, customCss: ".second{}" } }));
  assert.equal((await host.openThemeSession(first.themeId)).document.styles.customCss, ".first{}");
  assert.equal((await host.openThemeSession(second.themeId)).document.styles.customCss, ".second{}");
});

test("保存只更新本地修改时间，不覆盖作者更新时间", async () => {
  const repo = repository();
  const host = createThemeSessionHost(repo, { now: () => "2026-10-22T01:00:00.000Z" });
  const builtin = await host.openThemeSession("native-default");
  const custom = await host.saveThemeSessionAs(builtin, { name: "副本", author: "Orange" });
  const authorUpdatedAt = custom.document.metadata.updatedAt;
  host.updateThemeDraft(custom, document => ({ ...document, styles: { ...document.styles, customCss: ".changed{}" } }));
  await host.saveThemeSession(custom);
  assert.equal(custom.document.metadata.updatedAt, authorUpdatedAt);
  assert.equal(custom.document.metadata.localModifiedAt, "2026-10-22T01:00:00.000Z");
});

test("资源改动属于草稿并随撤销重做恢复", async () => {
  const repo = repository();
  const host = createThemeSessionHost(repo);
  const session = await host.openThemeSession("native-default");
  const reference = { id: "cover", name: "封面", path: "assets/cover.png", mediaType: "image/png" };
  host.updateThemeAsset(session, document => ({ ...document, assets: [reference] }), reference.path, new Uint8Array([1, 2]));
  assert.deepEqual(session.document.assets, [reference]);
  assert.deepEqual([...session.assetChanges[reference.path]], [1, 2]);
  host.undoThemeEdit(session);
  assert.deepEqual(session.document.assets, []);
  assert.equal(session.assetChanges[reference.path], undefined);
  host.redoThemeEdit(session);
  assert.deepEqual(session.document.assets, [reference]);
  assert.deepEqual([...session.assetChanges[reference.path]], [1, 2]);
});

test("删除资源只在保存时写入磁盘并可撤销", async () => {
  const repo = repository();
  const source = createBuiltinNativeTheme("native-default");
  source.assets = [{ id: "cover", name: "封面", path: "assets/cover.png", mediaType: "image/png" }];
  repo.stored.set("custom", { ...source, themeId: "custom", origin: "custom" });
  const host = createThemeSessionHost(repo);
  const session = await host.openThemeSession("custom");
  host.updateThemeAsset(session, document => ({ ...document, assets: [] }), "assets/cover.png", null);
  assert.deepEqual(session.document.assets, []);
  assert.equal(session.assetChanges["assets/cover.png"], null);
  host.undoThemeEdit(session);
  assert.equal(session.document.assets.length, 1);
  assert.equal(session.assetChanges["assets/cover.png"], undefined);
  await host.saveThemeSession(session);
  assert.equal(repo.writes.at(-1).options.assetChanges, undefined);
});

test("保存和另存把资源变化交给同一次仓库写入", async () => {
  const repo = repository();
  const host = createThemeSessionHost(repo, { createId: () => "copy" });
  const source = await host.openThemeSession("native-default");
  host.updateThemeAsset(source, document => ({
    ...document,
    assets: [{ id: "font", name: "字体", path: "assets/font.woff2", mediaType: "font/woff2" }],
  }), "assets/font.woff2", new Uint8Array([3, 4]));
  await host.saveThemeSessionAs(source, { name: "副本", author: "Orange" });
  assert.equal(repo.writes.at(-1).options.sourceThemeId, "native-default");
  assert.deepEqual([...repo.writes.at(-1).options.assetChanges["assets/font.woff2"]], [3, 4]);
});

test("连续编辑只保留最近一百步撤销历史", async () => {
  const repo = repository();
  const host = createThemeSessionHost(repo);
  const session = await host.openThemeSession("native-default");
  for (let index = 0; index < 140; index += 1) {
    host.updateThemeDraft(session, document => ({
      ...document,
      metadata: { ...document.metadata, name: `修改 ${index}` },
    }));
  }
  assert.equal(session.undo.length, 100);
  for (let index = 0; index < 110; index += 1) host.undoThemeEdit(session);
  assert.equal(session.redo.length, 100);
  assert.equal(session.document.metadata.name, "修改 39");
});

test("无效可视化 CSS 草稿与最近有效结果分离并可继续修复", async () => {
  const repo = repository();
  const host = createThemeSessionHost(repo);
  const session = await host.openThemeSession("native-default");
  host.initializeThemeVisualCss(session, ".event .message { color: red; }");

  const invalid = host.updateThemeVisualCssDraft(session, ".event .message { color:", () => ({
    error: "第 1 行第 25 列缺少属性值",
  }));
  assert.equal(invalid.error, "第 1 行第 25 列缺少属性值");
  assert.equal(session.visualCssDraft, ".event .message { color:");
  assert.equal(session.visualCssValid, ".event .message { color: red; }");
  assert.equal(session.document.styles.visualCss, "");
  assert.equal(session.undo.length, 0);

  host.updateThemeVisualCssDraft(session, ".event .message { color: blue; }", document => ({
    document: { ...document, styles: { ...document.styles, visualCss: ".event .message { color: blue; }" } },
    diagnostics: [],
  }));
  assert.equal(session.visualCssDraft, ".event .message { color: blue; }");
  assert.equal(session.visualCssValid, ".event .message { color: blue; }");
  assert.equal(session.visualCssError, "");
  assert.equal(session.document.styles.visualCss, ".event .message { color: blue; }");
});

test("连续可视化 CSS 输入合并为一个主题历史步骤", async () => {
  const repo = repository();
  const host = createThemeSessionHost(repo);
  const session = await host.openThemeSession("native-default");
  host.initializeThemeVisualCss(session, "");
  for (const color of ["r", "re", "red"]) {
    const css = `.event .message { color: ${color}; }`;
    host.updateThemeVisualCssDraft(session, css, document => ({
      document: { ...document, styles: { ...document.styles, visualCss: css } },
      diagnostics: [],
    }));
  }
  assert.equal(session.undo.length, 1);
  host.undoThemeEdit(session);
  assert.equal(session.document.styles.visualCss, "");
  assert.equal(session.visualCssDraft, "");
  assert.equal(session.visualCssValid, "");
});

test("控件更新有效 CSS 时保留尚未修复的输入草稿", async () => {
  const repo = repository();
  const host = createThemeSessionHost(repo);
  const session = await host.openThemeSession("native-default");
  host.initializeThemeVisualCss(session, ".event .message { color: red; }");
  host.updateThemeVisualCssDraft(session, ".event .message { color:", () => ({ error: "缺少属性值" }));
  host.updateThemeVisualCssFromControls(session, ".event .message { color: blue; }");
  assert.equal(session.visualCssDraft, ".event .message { color:");
  assert.equal(session.visualCssValid, ".event .message { color: blue; }");
  assert.equal(session.visualCssError, "缺少属性值");
});

test("无效自定义 CSS 保留输入但预览与保存继续使用最近有效值", async () => {
  const repo = repository();
  const host = createThemeSessionHost(repo);
  const session = await host.openThemeSession("native-default");
  host.updateThemeCustomCssDraft(session, ".event { color: red; }", () => null);

  const error = host.updateThemeCustomCssDraft(
    session,
    ".event { color:",
    () => "第 1 行缺少属性值",
  );

  assert.equal(error, "第 1 行缺少属性值");
  assert.equal(session.customCssDraft, ".event { color:");
  assert.equal(session.customCssValid, ".event { color: red; }");
  assert.equal(session.document.styles.customCss, ".event { color: red; }");
  await assert.rejects(() => host.saveThemeSession(session), /自定义 CSS 错误/);
});

test("外部内容变化不依赖修订号且不会覆盖未保存草稿", async () => {
  const repo = repository();
  const stored = { ...createBuiltinNativeTheme("native-default"), themeId: "custom-external-dirty" };
  stored.origin = "custom";
  repo.stored.set(stored.themeId, stored);
  const host = createThemeSessionHost(repo);
  const session = await host.openThemeSession(stored.themeId);
  host.updateThemeDraft(session, document => ({
    ...document,
    metadata: { ...document.metadata, name: "本地草稿" },
  }));
  repo.stored.set(stored.themeId, {
    ...stored,
    styles: { ...stored.styles, customCss: ".external{}" },
  });

  const state = await host.checkThemeSessionForExternalChange(session);

  assert.equal(state, "changed");
  assert.equal(session.document.metadata.name, "本地草稿");
  assert.equal(session.externalDocument.styles.customCss, ".external{}");
  assert.equal(session.saved.styles.customCss, "");
});

test("无草稿时外部内容变化会就地重载会话", async () => {
  const repo = repository();
  const stored = { ...createBuiltinNativeTheme("native-default"), themeId: "custom-external-clean" };
  stored.origin = "custom";
  repo.stored.set(stored.themeId, stored);
  const host = createThemeSessionHost(repo);
  const session = await host.openThemeSession(stored.themeId);
  repo.stored.set(stored.themeId, {
    ...stored,
    styles: { ...stored.styles, customCss: ".external{}" },
  });

  const state = await host.checkThemeSessionForExternalChange(session);

  assert.equal(state, "reloaded");
  assert.equal(session.document.styles.customCss, ".external{}");
  assert.equal(session.saved.styles.customCss, ".external{}");
});

for (const layer of ['custom', 'visual']) test(`${layer} CSS 语法错误草稿遇到外部更新保留`, async () => {
  const repo = repository(), host = createThemeSessionHost(repo, {createId:()=>`invalid-${layer}`});
  const session = await host.saveThemeSessionAs(await host.openThemeSession('native-default'), {name:'副本',author:'Orange'});
  if (layer === 'custom') host.updateThemeCustomCssDraft(session, '.event {', ()=>'Unclosed block');
  else host.updateThemeVisualCssDraft(session, '.event {', ()=>({error:'Unclosed block'}));
  const disk = repo.stored.get(session.themeId);
  disk.metadata.name = '外部修改';
  assert.equal(await host.checkThemeSessionForExternalChange(session), 'changed');
  assert.equal(session[`${layer}CssDraft`], '.event {');
  assert.equal(session.dirty, true);
});

test('语法错误修复为原内容后不保留虚假未保存状态', async () => {
 const repo=repository(),host=createThemeSessionHost(repo,{createId:()=> 'return-to-saved'});
 const session=await host.saveThemeSessionAs(await host.openThemeSession('native-default'),{name:'A',author:'Orange'});
 host.updateThemeCustomCssDraft(session,'.event {',()=> 'Unclosed block');
 host.updateThemeCustomCssDraft(session,session.saved.styles.customCss,()=>null);
 assert.equal(session.dirty,false);
});
test("主题库草稿资源按主题读取且互不覆盖", () => {
 const host=createThemeSessionHost(repository());
 for(const[id,byte]of [["draft-a",1],["draft-b",2]]){const doc=createBuiltinNativeTheme("native-default");doc.themeId=id;const session=host.createNewThemeSession(doc);host.updateThemeAsset(session,d=>d,"assets/font.woff2",new Uint8Array([byte]));}
 assert.deepEqual(host.getDraftThemeAssetChanges("draft-a")["assets/font.woff2"],new Uint8Array([1]));
 assert.deepEqual(host.getDraftThemeAssetChanges("draft-b")["assets/font.woff2"],new Uint8Array([2]));
});
