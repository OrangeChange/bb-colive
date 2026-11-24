import test from "node:test";
import assert from "node:assert/strict";
import { addThemeAsset, inlineThemeAssetUrls, readThemeAssetDraft, removeThemeAsset, resolveThemeAssetUrl, applyThemeAssetUrls } from "../src/themes/themeAssets.ts";
import { createCustomThemeDocument } from "../src/themes/themeTypes.ts";

test('图片设置与已生成 CSS 使用相同的跨窗口资源地址',()=>{
 const theme=createCustomThemeDocument({themeId:'images',mode:'native',name:'图片'});
 theme.settings={visualModel:{common:{'all|all|row':{background:{source:'custom',value:'url("assets/a.png") center / cover'}}},light:{},dark:{}},imageDecorations:{'common|all|all|username':[{source:'assets/a.png'}]}};
 const next=applyThemeAssetUrls(theme,new Map([['assets/a.png','data:image/png;base64,AA==']]));
 assert.match(next.settings.visualModel.common['all|all|row'].background.value,/data:image\/png/);
 assert.equal(next.settings.imageDecorations['common|all|all|username'][0].source,'data:image/png;base64,AA==');
 assert.equal(theme.settings.imageDecorations['common|all|all|username'][0].source,'assets/a.png');
});

test("添加资源只保留主题内路径和稳定标识", () => {
  const theme = createCustomThemeDocument({ themeId: "one", mode: "native", name: "一" });
  const next = addThemeAsset(theme, { id: "cover", name: "封面图", fileName: "C:\\Users\\Orange\\cover.webp", mediaType: "image/webp" });
  assert.deepEqual(next.assets, [{ id: "cover", name: "封面图", path: "assets/cover.webp", mediaType: "image/webp" }]);
  assert.equal(JSON.stringify(next).includes("C:\\Users"), false);
  assert.deepEqual(removeThemeAsset(next, "cover").assets, []);
});

test("同名资源使用不同主题内路径", () => {
  const theme = createCustomThemeDocument({ themeId: "one", mode: "native", name: "一" });
  const first = addThemeAsset(theme, { id: "first", name: "封面图", fileName: "cover.webp", mediaType: "image/webp" });
  const second = addThemeAsset(first, { id: "second", name: "另一张", fileName: "cover.webp", mediaType: "image/webp" });
  assert.deepEqual(second.assets.map(asset => asset.path), ["assets/cover.webp", "assets/cover-2.webp"]);
});

test("发布前将主题内资源转换为可跨窗口保存的数据地址", async () => {
  const theme = createCustomThemeDocument({ themeId: "one", mode: "native", name: "一" });
  theme.assets = [{ id: "cover", name: "封面", path: "assets/cover.png", mediaType: "image/png" }];
  theme.styles.customCss = '.event { background-image: url("assets/cover.png"); }';
  const resolved = await inlineThemeAssetUrls(theme, async () => new Uint8Array([1, 2]));
  assert.match(resolved.styles.customCss, /data:image\/png;base64,AQI=/);
  assert.equal(theme.styles.customCss.includes("assets/cover.png"), true);
});

test("同路径资源替换读取当前主题字节，保留已发布快照及其他主题", async () => {
  const themeA = createCustomThemeDocument({ themeId: "a", mode: "native", name: "A" });
  themeA.assets = [{ id: "cover", name: "封面", path: "assets/cover.png", mediaType: "image/png" }];
  themeA.styles.customCss = '.event { background-image: url("assets/cover.png"); }';
  const themeB = { ...structuredClone(themeA), themeId: "b" };
  const bytes = { a: new Uint8Array([1, 2]), b: new Uint8Array([1, 2]) };
  const before = await inlineThemeAssetUrls(themeA, async () => bytes.a);
  bytes.a = new Uint8Array([3, 4]);
  const after = await inlineThemeAssetUrls({ ...themeA, revision: 2 }, async () => bytes.a);
  const other = await inlineThemeAssetUrls(themeB, async () => bytes.b);
  assert.match(before.styles.customCss, /base64,AQI=/);
  assert.match(after.styles.customCss, /base64,AwQ=/);
  assert.equal(other.styles.customCss, before.styles.customCss);
  assert.deepEqual(after.assets, themeA.assets);
  assert.match(themeA.styles.customCss, /assets\/cover\.png/);
});

test("资源字节可解析为临时主题地址", () => {
  const originalBlob = globalThis.Blob;
  const originalUrl = globalThis.URL;
  globalThis.Blob = class { constructor(parts, options) { this.parts = parts; this.type = options.type; } };
  globalThis.URL = { createObjectURL: blob => `blob:${blob.type}:${blob.parts[0].length}` };
  try { assert.equal(resolveThemeAssetUrl(new Uint8Array([1, 2]), "image/png"), "blob:image/png:2"); }
  finally { globalThis.Blob = originalBlob; globalThis.URL = originalUrl; }
});

test("草稿资源优先于磁盘资源且删除草稿不会回退旧文件", async () => {
  let diskReads = 0;
  const readDisk = async () => { diskReads += 1; return new Uint8Array([1]); };

  assert.deepEqual(
    [...await readThemeAssetDraft("assets/cover.png", { "assets/cover.png": new Uint8Array([2]) }, readDisk)],
    [2],
  );
  await assert.rejects(
    () => readThemeAssetDraft("assets/cover.png", { "assets/cover.png": null }, readDisk),
    /已从草稿移除/,
  );
  assert.equal(diskReads, 0);
});

test('资源文件名忽略大小写分配唯一文件',()=>{let d=createCustomThemeDocument({themeId:'case',mode:'native',name:'case'});for(const [i,fileName]of ['Cover.png','cover.png','Font.woff2','font.woff2'].entries())d=addThemeAsset(d,{id:String(i),name:fileName,fileName,mediaType:'application/octet-stream'});assert.equal(new Set(d.assets.map(a=>a.path.toLowerCase())).size,4);});
test('仅替换本地 CSS URL，保留远程地址、字符串与注释',async()=>{const d=createCustomThemeDocument({themeId:'relative',mode:'native',name:'relative'});d.assets=[{id:'a',name:'a',path:'assets/cover.png',mediaType:'image/png'}];d.styles.customCss=`/* assets/cover.png */ .a{background:url('./assets/cover.png');content:"url(assets/cover.png)"}.b{background:url(https://example.com/assets/cover.png)}`;const result=await inlineThemeAssetUrls(d,async()=>new Uint8Array([1,2]));assert.match(result.styles.customCss,/url\("data:image\/png;base64,AQI="\)/);assert.match(result.styles.customCss,/https:\/\/example.com\/assets\/cover.png/);assert.match(result.styles.customCss,/content:"url\(assets\/cover.png\)"/);assert.match(result.styles.customCss,/\/\* assets\/cover.png \*\//);});
