import { spawnSync } from 'node:child_process';
import { readFile,writeFile,mkdir,stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function prepareUpdateRelease({version,installer,portable,output,keyPath,password=''}) {
  if(!/^\d+\.\d+\.\d+$/.test(version))throw new Error('更新版本必须是正式版本号');
  if(!keyPath)throw new Error('请通过 TAURI_SIGNING_PRIVATE_KEY_PATH 提供签名私钥');
  const packages=[];
  for(const [kind,file] of [['installer',installer],['portable',portable]]){
    const absolute=path.resolve(file);const info=await stat(absolute);
    const cli=path.join(root,'node_modules/@tauri-apps/cli/tauri.js');
    const signed=spawnSync(process.execPath,[cli,'signer','sign','--private-key-path',keyPath,'--password',password,absolute],{cwd:root,encoding:'utf8',timeout:120000});
    if(signed.status!==0)throw new Error(`无法签名${kind}更新包：${signed.stderr||signed.error?.message||'签名未完成'}`);
    const signature=(await readFile(absolute+'.sig','utf8')).trim();
    packages.push({kind,name:path.basename(file),size:info.size,signature});
  }
  await mkdir(output,{recursive:true});
  for(const [source,base] of [['domestic','https://gitee.com/orange-chan/bb-colive/releases/download'],['foreign','https://github.com/OrangeChange/bb-colive/releases/download']]){
    const platforms=Object.fromEntries(packages.map(p=>[`windows-x86_64-${p.kind}`,{url:`${base}/v${version}/${encodeURIComponent(p.name)}`,signature:p.signature,size:p.size}]));
    const dir=path.join(output,source);await mkdir(dir,{recursive:true});
    await writeFile(path.join(dir,'update.json'),JSON.stringify({version,platforms},null,2)+'\n');
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [version,installer,portable,output]=process.argv.slice(2);
 if(!version||!installer||!portable||!output)throw new Error('用法：node scripts/prepare-update-release.mjs <版本> <安装包> <便携包> <输出目录>');
 await prepareUpdateRelease({version,installer,portable,output,keyPath:process.env.TAURI_SIGNING_PRIVATE_KEY_PATH,password:process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD||''});
 console.log('更新包已签名，国内/国外更新清单已生成。');
}
