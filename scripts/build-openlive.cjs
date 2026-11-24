/* Standalone MIT-based OpenLive renderer. */
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..'), source = path.join(root, 'src/compat/openlive/runtime');
const vendor = path.join(root, 'vendor/openlive'), deps = path.join(root, 'vendor/blivechat/node_modules');
const out = process.env.OPENLIVE_QA === '1' && process.env.OPENLIVE_QA_OUTPUT ? path.resolve(process.env.OPENLIVE_QA_OUTPUT) : path.join(root, 'public/openlive');
const dependency = name => require(path.join(deps, name));
const webpack = dependency('webpack'), VueLoaderPlugin = dependency('@vue/vue-loader-v15/lib/plugin');
dependency('@vue/vue-loader-v15/lib/compiler').resolveCompiler(path.dirname(deps));
const MiniCssExtractPlugin = dependency('mini-css-extract-plugin');
const CssMinimizerPlugin = dependency('css-minimizer-webpack-plugin');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
fs.mkdirSync(out, {recursive:true});
require('esbuild').buildSync({entryPoints:[path.join(source,'simulation.mjs')],bundle:true,platform:'browser',format:'esm',outfile:path.join(out,'simulation.mjs')});
require('esbuild').buildSync({stdin:{contents:'export { composeCompatibleCssLayers } from "./src/themes/compatibleThemeCascade.ts";',resolveDir:root},bundle:true,platform:'browser',format:'esm',outfile:path.join(out,'css-layer.mjs')});
const config = {
 mode:'production', context:vendor, entry:path.join(vendor,'host/renderer.js'), devtool:false,
 output:{path:out,filename:'renderer.js',publicPath:'./',clean:false},
 optimization:{minimizer:['...',new CssMinimizerPlugin({minimizerOptions:{preset:['default',{mergeLonghand:false,cssDeclarationSorter:false,colormin:false,minifyFontValues:false}]}})]},
 resolve:{extensions:['.js','.mjs','.vue','.json'],modules:[deps,'node_modules'],alias:{
   '@/api/chat$':path.join(vendor,'host/chat.js'), '@/api/chatConfig$':path.join(vendor,'host/config.js'), '@':path.join(vendor,'frontend/src'), 'vue$':path.join(deps,'vue/dist/vue.runtime.esm.js')
 }}, resolveLoader:{modules:[deps,'node_modules']},
 module:{rules:[
   {test:/\.m?js$/,resolve:{fullySpecified:false}},
   {test:/\.vue$/,loader:path.join(deps,'@vue/vue-loader-v15/lib/index.js'),options:{compilerOptions:{whitespace:'condense'}}},
   {test:/\.css$/,use:[{loader:MiniCssExtractPlugin.loader,options:{esModule:false}},{loader:path.join(deps,'css-loader/dist/cjs.js'),options:{esModule:false,url:false}}]}
 ]},
 plugins:[new VueLoaderPlugin(),new MiniCssExtractPlugin({filename:'renderer.css'})],
 performance:{hints:false},stats:'errors-warnings'
};
webpack(config,(error,stats)=>{
 if(error || stats.hasErrors()){console.error(error || stats.toString());process.exitCode=1;return;}
 if(stats.hasWarnings())console.warn(stats.toString({all:false,warnings:true}));
 for(const file of ['core.mjs','textReconcile.mjs','bridge.mjs','entry.mjs','provenance.json']) fs.copyFileSync(path.join(source,file),path.join(out,file));
 fs.copyFileSync(path.join(vendor,'LICENSE'),path.join(out,'LICENSE'));
 function originalUrls(css,origin){return css.replace(/url\((['"]?)([^)'"\s]+)\1\)/g,(all,q,url)=>url.startsWith('data:')?all:'url('+q+new URL(url,origin).href+q+')');}
 fs.writeFileSync(path.join(out,'named-default.css'),originalUrls(fs.readFileSync(path.join(source,'frozen/named-default.css'),'utf8'),'https://i1.xuehusang.cn/openlivechat-css/default.css'));
 fs.copyFileSync(path.join(root,'src/compat/editorPropertyInspection.mjs'),path.join(out,'editorPropertyInspection.mjs'));
// Source and deployed directory depths differ; ship the shared predicate once.
fs.writeFileSync(path.join(out,'entry.mjs'),fs.readFileSync(path.join(source,'entry.mjs'),'utf8')
  .replace('../../editorPropertyInspection.mjs','./editorPropertyInspection.mjs')
  .replace('../../../../public/openlive/simulation.mjs','./simulation.mjs')
  .replace('../../../../public/previewSimulationIdentity.mjs','../previewSimulationIdentity.mjs'));
fs.copyFileSync(path.join(root,'src/compat/paidFilter.mjs'),path.join(out,'../compat-paid-filter.mjs'));
fs.copyFileSync(path.join(root,'src/nativeTextFilterFacts.mjs'),path.join(out,'../native-text-filter-facts.mjs'));
fs.writeFileSync(path.join(out,'core.mjs'),fs.readFileSync(path.join(source,'core.mjs'),'utf8').replace("../../paidFilter.mjs","../compat-paid-filter.mjs").replace("../../../nativeTextFilterFacts.mjs","../native-text-filter-facts.mjs"));

 fs.writeFileSync(path.join(out,'renderer.html'),'<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>OpenLive renderer</title><style>@layer default, config, custom; @import url("./renderer.css") layer(default);</style></head><body><div id="app"></div><script src="./renderer.js"></script><script type="module" src="./entry.mjs"></script></body></html>\n');
 fs.writeFileSync(path.join(root,'src/compat/openlive/sourceCss.generated.ts'),'export const OPENLIVE_SOURCE_CSS = '+JSON.stringify(fs.readFileSync(path.join(out,'renderer.css'),'utf8')+'\n'+fs.readFileSync(path.join(out,'named-default.css'),'utf8'))+';\n');
 const packages=new Map();
 function collectPackages(modules,parentIncluded=false){for(const module of modules){
   const included=parentIncluded||stats.compilation.chunkGraph.getNumberOfModuleChunks(module)>0;
   if(included&&module.type.startsWith('javascript')&&module.resource?.includes('node_modules')){
     let directory=path.dirname(module.resource.split('?')[0]);
     while(!fs.existsSync(path.join(directory,'package.json'))&&directory!==path.dirname(directory))directory=path.dirname(directory);
     const manifest=JSON.parse(fs.readFileSync(path.join(directory,'package.json'),'utf8'));
     const license=['LICENSE','LICENSE.txt','LICENSE.md','license','license.txt'].find(file=>fs.existsSync(path.join(directory,file)));
     if(license)packages.set(manifest.name,'=== '+manifest.name+' '+manifest.version+' ===\n'+fs.readFileSync(path.join(directory,license),'utf8'));
   }
   if(module.modules)collectPackages(module.modules,included);
 }}
 collectPackages(stats.compilation.modules);
 const notices=[...packages].sort(([a],[b])=>a.localeCompare(b)).map(([,notice])=>notice).join('\n\n');
 fs.writeFileSync(path.join(out,'THIRD_PARTY_NOTICES.txt'),notices);
 fs.writeFileSync(path.join(out,'build-info.json'),JSON.stringify({sourceCommit:'0da8c94d40a8791bb212985f6ac0ae55765c3a03',sharedNativeTextFilterHash:hash(fs.readFileSync(path.join(root,'src/nativeTextFilterFacts.mjs'))),sharedPaidFilterHash:hash(fs.readFileSync(path.join(root,'src/compat/paidFilter.mjs'))),qaBuild:process.env.OPENLIVE_QA==='1'},null,2)+'\n');
 console.log('Built MIT OpenLive renderer: '+path.join(out,'renderer.html'));
});
