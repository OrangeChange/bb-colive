import fs from 'node:fs/promises';
import path from 'node:path';
export async function materializeCatalogAssets(documents, source, root, origins = {themes:{}}) {
 const uses=new Map();
 for(const document of documents)for(const asset of document.assets)uses.set(asset.path,(uses.get(asset.path)??0)+1);
 const index=await fs.readFile(path.join(root,'shared-assets/index.json'),'utf8').then(JSON.parse).catch(error=>{if(error.code==='ENOENT')return {};throw error});
 for(const document of documents){
  document.assets=await Promise.all(document.assets.map(async original=>{
   const asset={...original};
   const origin=origins.themes[document.catalogKey]?.[asset.path];
   if(origin?.kind==='remote'){
    delete asset.sharedResourceId;delete asset.cacheResourceId;delete asset.resourceFileName;
    return {...asset,sourceUrl:origin.sourceUrl,mediaType:origin.mediaType};
   }
   const name=path.basename(asset.path);
   const bytes=await fs.readFile(path.join(source,asset.path));
   asset.size=bytes.length;
   if(uses.get(asset.path)>1){
    const id=name.replace(/[^a-zA-Z0-9._-]/g,'-');
    asset.sharedResourceId=id;
    const target=path.join(root,'shared-assets',id,name);
    await fs.mkdir(path.dirname(target),{recursive:true});
    const existing=await fs.readFile(target).catch(()=>null);
    if(existing&&!existing.equals(bytes))throw new Error(`公共素材已存在不同内容：${id}`);
    if(!existing)await fs.writeFile(target,bytes);
    index[id]={name,mediaType:asset.mediaType,size:bytes.length};
   }else{
    const target=path.join(document.directory,asset.path);
    await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);
   }
   return asset;
  }));
 }
 await fs.mkdir(path.join(root,'shared-assets'),{recursive:true});
 await fs.writeFile(path.join(root,'shared-assets/index.json'),JSON.stringify(Object.fromEntries(Object.entries(index).sort(([a],[b])=>a<b?-1:a>b?1:0)),null,2)+'\n');
}
