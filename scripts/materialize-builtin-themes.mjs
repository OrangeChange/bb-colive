import fs from 'node:fs/promises';
import { materializeCatalogAssets } from './themeResourceBuild.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCatalogThemes, BUILTIN_THEME_CATALOG } from '../src/themes/builtinThemeCatalog.ts';
import { createBuiltinNativeThemes } from '../src/themes/nativeBuiltinThemes.ts';
import { createBuiltinCompatibleTheme } from '../src/themes/builtinThemeDefaults.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const catalog = path.join(root, 'resources/theme-catalog');
const destination = process.env.THEME_OUTPUT_DIRECTORY || path.join(root, 'src-tauri/style-distribution');
const manifest = JSON.parse(await fs.readFile(path.join(catalog, 'assets.json'), 'utf8'));
const origins = JSON.parse(await fs.readFile(path.join(catalog, 'dependency-origins.json'), 'utf8'));
const defaults = ['blivechat', 'blivechat-open', 'laplace'].map(createBuiltinCompatibleTheme);
const documents = [...createBuiltinNativeThemes(), ...defaults];
for (const document of createCatalogThemes()) {
  const entry = BUILTIN_THEME_CATALOG.find(item => item.id === document.themeId);
  const key = entry.file ?? entry.id;
  document.styles.baseCss = await fs.readFile(path.join(catalog, `${key}.css`), 'utf8');
  document.catalogKey = key;
  document.assets = manifest[key] ?? [];
  documents.push(document);
}
const classic = documents.find(document => document.themeId === 'blivechat-open-classic');
documents.push({ ...structuredClone(classic), themeId: 'blivechat-open-yt', metadata: { ...classic.metadata, name: '原版YT风格' } });
const modes = { native: 'native', blivechat: 'blc', 'blivechat-open': 'blc-open', laplace: 'laplace' };
// 原生主题的存储目录固定，改名不改变已有调整文件的位置。
const nativeDirectories = { 'native-card': '卡片', 'native-bubble': '轻量气泡' };
for (const document of documents) {
  const modeRoot = path.join(destination, modes[document.mode]);
  await fs.mkdir(modeRoot, { recursive: true });
  let directory;
  for (const item of await fs.readdir(modeRoot, { withFileTypes: true })) {
    if (!item.isDirectory()) continue;
    const existing = await fs.readFile(path.join(modeRoot, item.name, 'theme.json'), 'utf8').then(JSON.parse).catch(() => undefined);
    if (existing?.themeId !== document.themeId) continue;
    if (existing.origin !== 'builtin') throw new Error(`主题标识已被自定义主题占用：${document.themeId}`);
    directory = path.join(modeRoot, item.name);
    break;
  }
  const namedDirectory = path.join(modeRoot, (nativeDirectories[document.themeId] ?? document.metadata.name).replace(/[<>:"/\\|?*]/g, '_'));
  if (directory && directory !== namedDirectory) await fs.rename(directory, namedDirectory);
  directory = namedDirectory;
  await fs.mkdir(directory, { recursive: true });
  document.directory = directory;
}
await materializeCatalogAssets(documents, catalog, destination, origins);
for (const document of documents) {
  const { directory, catalogKey, settings, styles, permissions, ...metadata } = document;
  await fs.writeFile(path.join(directory, 'theme.json'), JSON.stringify(metadata, null, 2) + '\n');
  await fs.writeFile(path.join(directory, 'settings.json'), JSON.stringify(settings, null, 2) + '\n');
  for (const [key, filename] of [['baseCss', 'base.css'], ['visualCss', 'visual.css'], ['customCss', 'custom.css']]) {
    await fs.writeFile(path.join(directory, filename), styles[key]);
  }

}
for (const [mode, disk] of Object.entries(modes)) {
  await fs.writeFile(path.join(destination, disk, 'index.json'), JSON.stringify({ builtinThemes: documents.filter(item => item.mode === mode).map(item => item.themeId) }, null, 2) + '\n');
}
console.log(`已准备 ${documents.length} 个内置主题：${destination}`);




const aliases = {};
const legacy = JSON.parse(await fs.readFile(path.join(catalog, 'legacy-assets.json'), 'utf8'));
for (const [reference, asset] of Object.entries(legacy)) aliases[reference] = { ...asset, sourceUrl: resolveThemeResourceSource(asset.sourceUrl) };
const uses=new Map();
for (const document of documents) for(const asset of document.assets) uses.set(asset.path,(uses.get(asset.path)??0)+1);
for (const document of documents) for (const asset of document.assets) aliases[asset.path] ??= { themeId: document.themeId, path: asset.path, ...(uses.get(asset.path)>1?{sharedResourceId:path.basename(asset.path)}:{}) };
await fs.writeFile(path.join(destination, 'catalog-assets.json'), JSON.stringify(aliases, null, 2) + '\n');
import { resolveThemeResourceSource } from '../src/themes/themeRemoteCss.ts';
