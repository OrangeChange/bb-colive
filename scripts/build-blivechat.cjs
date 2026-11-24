/* Standalone Vue 2 build; BB itself remains React-only. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const vendor = path.join(root, 'vendor/blivechat');
const candidates = [process.env.ORIGINAL_NODE_MODULES, path.join(vendor, 'node_modules'), path.resolve(root, '../blivechat-research/frontend/node_modules')].filter(Boolean);
const deps = candidates.find(dir => fs.existsSync(path.join(dir, '@vue/vue-loader-v15/lib/plugin.js')));
if (!deps) throw new Error('Install vendor/blivechat dependencies with npm ci, or set ORIGINAL_NODE_MODULES to the original frontend node_modules.');
const dependency = name => require(path.join(deps, name));
const webpack = dependency('webpack');
const VueLoaderPlugin = dependency('@vue/vue-loader-v15/lib/plugin');
// Pre-resolve Vue2.7 compiler from the chosen dependency directory; context below
// intentionally matches upstream for its scoped TextMessage data-v hash.
dependency('@vue/vue-loader-v15/lib/compiler').resolveCompiler(path.dirname(deps));
const MiniCssExtractPlugin = dependency('mini-css-extract-plugin');
const CssMinimizerPlugin = dependency('css-minimizer-webpack-plugin');
const src = path.join(vendor, 'upstream/frontend/src');
const qaBuild = process.env.BLIVECHAT_QA === '1';
const isolatedQa = qaBuild && !!process.env.BLIVECHAT_QA_OUTPUT;
const output = isolatedQa ? path.resolve(process.env.BLIVECHAT_QA_OUTPUT) : path.join(root, 'public/blivechat');
fs.mkdirSync(output, { recursive: true });
require('esbuild').buildSync({ stdin: { contents: 'export { composeCompatibleCssLayers } from "./src/themes/compatibleThemeCascade.ts";', resolveDir: root }, bundle: true, platform: 'browser', format: 'esm', outfile: path.join(output, 'css-layer.mjs') });
const manifest = [];
function visit(dir) { for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
 const p = path.join(dir, item.name); if (item.isDirectory()) visit(p);
 else manifest.push({ path: path.relative(vendor, p).split(path.sep).join('/'), sha256: crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') });
} }
visit(path.join(vendor, 'upstream'));
fs.writeFileSync(path.join(isolatedQa ? output : vendor, 'source-manifest.json'), JSON.stringify({ repository: 'https://github.com/xfgryujk/blivechat', commit: '848409df78d2cca65d3cc8ffe938eb6b6f261b76', version: '1.10.4', files: manifest }, null, 2)+'\n');
const config = {
 mode: 'production', context: path.join(vendor, 'upstream/frontend'), entry: path.join(vendor, 'host/entry.js'), devtool: false,
 output: { path: output, filename: 'renderer.js', publicPath: './', clean: false },
 optimization: { minimizer: ['...', new CssMinimizerPlugin({ minimizerOptions: {
  preset: ['default', { mergeLonghand: false, cssDeclarationSorter: false }],
 } })] },
 resolve: { extensions: ['.mjs','.js','.vue','.json'], modules: [deps, 'node_modules'], alias: {
  'bb-css-layer$': path.join(output, 'css-layer.mjs'),
  '@/api/chat$': path.join(vendor, 'host/chat.js'), '@/i18n$': path.join(vendor, 'host/i18n.js'),
  '@': src, 'vue$': path.join(deps, 'vue/dist/vue.runtime.esm.js'),
 } },
 resolveLoader: { modules: [deps, 'node_modules'] },
 module: { rules: [
  { test: /\.m?js$/, resolve: { fullySpecified: false } },
  { test: /\.vue$/, loader: path.join(deps, '@vue/vue-loader-v15/lib/index.js'), options: {
    // Match Vue CLI's upstream production build. Without condensing, the
    // standalone renderer preserves whitespace text nodes between flex
    // children and changes ordinary chat-row heights.
    compilerOptions: { whitespace: 'condense' },
  } },
  { test: /\.css$/, use: [{ loader: MiniCssExtractPlugin.loader, options: { esModule: true, defaultExport: true } }, { loader: path.join(deps, 'css-loader/dist/cjs.js'), options: { esModule: false } }] },
  { test: /\.(woff2?|ttf|eot|svg|png|gif)$/, type: 'asset/resource', generator: { filename: 'assets/[name][ext]' } },
 ] },
 plugins: [new webpack.NormalModuleReplacementPlugin(/^\.$/, resource => { if (resource.context === path.join(src, 'api/chat')) resource.request = path.join(vendor, 'host/chat.js'); }), new VueLoaderPlugin(), new MiniCssExtractPlugin({ filename: 'renderer.css' }), new webpack.DefinePlugin({ 'process.env.LIB_USE_CDN': 'false', 'process.env.BB_BLIVECHAT_QA': JSON.stringify(qaBuild) })],
 performance: { hints: false }, stats: 'errors-warnings',
};
webpack(config, async (err, stats) => {
 if (err || stats.hasErrors()) { console.error(err || stats.toString()); process.exitCode = 1; return; }
 const { composeCompatibleCssLayers } = await import(require('node:url').pathToFileURL(path.join(output, 'css-layer.mjs')).href);
 fs.writeFileSync(path.join(output, 'renderer-layered.css'), '@layer yt;\n'+composeCompatibleCssLayers([[fs.readFileSync(path.join(output, 'renderer.css'), 'utf8'), 'default']]));
 fs.writeFileSync(path.join(output, 'renderer.html'), '<!doctype html>\n<html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>blivechat original isolated renderer</title><link rel="stylesheet" href="./renderer-layered.css"></head><body><div id="app"></div><script src="./renderer.js"></script></body></html>\n');
 fs.copyFileSync(path.join(src, 'blcsdk.js'), path.join(output, 'blcsdk.js'));
 fs.cpSync(path.join(vendor, 'upstream/frontend/public/static'), path.join(output, 'static'), { recursive: true });
 // AuthorBadge.vue keeps the upstream absolute /static/img/icons URL. The
 // vendored upstream frontend does not ship these three original guard icons,
 // while the preserved reference build does. Copy the byte-identical local
 // reference assets into the candidate's root public path; this fixes the
 // isolated renderer's URL scope without editing the read-only upstream Vue.
 const referenceIcons = path.resolve(root, '../blivechat-research/frontend/public/static/img/icons');
 const rootIcons = isolatedQa ? path.join(output, 'static/img/icons') : path.join(root, 'public/static/img/icons');
 if (fs.existsSync(referenceIcons)) fs.cpSync(referenceIcons, rootIcons, { recursive: true });
 const notices = ['vue','vue-i18n','element-ui','lodash'].map(name => {
  const licenseName = ['LICENSE','LICENSE.txt','LICENSE.md'].find(file => fs.existsSync(path.join(deps, name, file)));
  return `=== ${name} ===\n${licenseName ? fs.readFileSync(path.join(deps, name, licenseName), 'utf8') : 'See distributed package license.'}`;
 }).join('\n\n');
 fs.writeFileSync(path.join(output, 'THIRD_PARTY_NOTICES.txt'), notices); 
 fs.copyFileSync(path.join(vendor, 'LICENSE'), path.join(output, 'LICENSE'));
 const versions = {}; for (const name of ['vue','vue-i18n','element-ui','lodash','webpack','@vue/vue-loader-v15','css-loader','mini-css-extract-plugin']) versions[name] = dependency(name+'/package.json').version;
 const buildSources = ['src/nativeTextFilterFacts.mjs', 'src/compat/blivechat/runtime/nativeText.mjs', 'src/compat/paidFilter.mjs', 'src/compat/blivechat/runtime/core.mjs', 'src/themes/compatibleThemeCascade.ts', 'src/themes/nativeThemeCascade.ts', 'scripts/build-blivechat.cjs', ...fs.readdirSync(path.join(vendor, 'host')).map(name => `vendor/blivechat/host/${name}`)];
 const sourceHashes = Object.fromEntries(buildSources.map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex')]));
 const artifactHashes = Object.fromEntries(['renderer.js','renderer.css','renderer-layered.css','renderer.html','css-layer.mjs','blcsdk.js'].map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(path.join(output, name))).digest('hex')]));
 fs.writeFileSync(path.join(output, 'build-info.json'), JSON.stringify({ upstream: '848409df78d2cca65d3cc8ffe938eb6b6f261b76', qaBuild, versions, sourceHashes, artifactHashes }, null, 2)+'\n');
 if(process.env.BB_PROVENANCE_OUTPUT_PREFIX)require('./frontend-provenance.cjs').writeAudit('blivechat-webpack',stats.toJson({all:false,assets:true,chunks:true,modules:true,nestedModules:true,reasons:true}));
 console.log(stats.toString()); console.log('Built standalone original renderer: '+path.join(output, 'renderer.html'));
});
