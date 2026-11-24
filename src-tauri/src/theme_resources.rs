use std::{fs, path::Path};

pub(crate) fn read_resource_at(root: &Path, kind: &str, id: &str, name: &str) -> Result<Vec<u8>, String> {
    let directory = match kind { "shared" => "shared-assets", "remote" => "remote-cache", "published" => "published-assets", _ => return Err(ui_text!("backend.theme_resources.read_resource_at").into()) };
    for part in [id, name] {
        if part.is_empty() || part == "." || part == ".." || !part.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-'|'_'|'.')) { return Err(ui_text!("backend.theme_resources.read_resource_at2").into()); }
    }
    fs::read(root.join(directory).join(id).join(name)).map_err(|_| ui_text!("backend.theme_resources.read_resource_at3").into())
}
use serde::{Deserialize,Serialize};
use std::sync::atomic::{AtomicU64,Ordering};
#[derive(Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub(crate) struct ResourceEntry {pub id:String,pub name:String,pub media_type:String,pub size:usize,pub final_url:String,#[serde(skip_serializing_if="Option::is_none")]pub text:Option<String>,#[serde(skip_serializing_if="Option::is_none")]pub bytes:Option<Vec<u8>>,#[serde(default)]pub etag:Option<String>,#[serde(default)]pub modified:Option<String>}
static CACHE_INDEX:tokio::sync::Mutex<()>=tokio::sync::Mutex::const_new(());
static NEXT:AtomicU64=AtomicU64::new(0);
fn new_id()->String{format!("{}-{}",std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos(),NEXT.fetch_add(1,Ordering::Relaxed))}
fn resource_type(url:&reqwest::Url,header:&str)->String{
 let ext=url.path().rsplit('.').next().unwrap_or("").to_lowercase();
 match ext.as_str(){"css"=>"text/css","png"|"apng"=>"image/png","jpg"|"jpeg"=>"image/jpeg","gif"=>"image/gif","webp"=>"image/webp","svg"=>"image/svg+xml","woff"=>"font/woff","woff2"=>"font/woff2","ttf"=>"font/ttf","otf"=>"font/otf",_=>header.split(';').next().unwrap_or("application/octet-stream")}.into()
}
fn resource_name(url:&reqwest::Url,mime:&str)->String{
 let name=url.path_segments().and_then(|mut p|p.next_back()).filter(|s|!s.is_empty()).unwrap_or("resource");
 let mut name:String=name.chars().map(|c|if c.is_ascii_alphanumeric()||matches!(c,'-'|'_'|'.'){c}else{'-'}).take(120).collect();
 if !name.contains('.') {name.push_str(match mime {"text/css"=>".css","font/woff2"=>".woff2","font/woff"=>".woff","font/ttf"=>".ttf","font/otf"=>".otf","image/png"=>".png","image/jpeg"=>".jpg","image/gif"=>".gif","image/webp"=>".webp","image/svg+xml"=>".svg",_=>".bin"});}name
}
fn validate_resource_bytes(mime:&str,bytes:&[u8])->Result<(),String>{
 let valid = if mime.contains("font") {
    [b"wOF2".as_slice(),b"wOFF",b"OTTO",b"ttcf",&[0,1,0,0]].iter().any(|magic|bytes.starts_with(magic))
 }else if mime=="image/png"{bytes.starts_with(b"\x89PNG\r\n\x1a\n")}
 else if mime=="image/jpeg"{bytes.starts_with(&[0xff,0xd8,0xff])}
 else if mime=="image/gif"{bytes.starts_with(b"GIF87a")||bytes.starts_with(b"GIF89a")}
 else if mime=="image/webp"{bytes.starts_with(b"RIFF")&&bytes.get(8..12)==Some(b"WEBP")}
 else if mime=="image/svg+xml"{
   let text=std::str::from_utf8(bytes).map_err(|_|ui_text!("backend.theme_resources.validate_resource_bytes3"))?;
   let references=regex::Regex::new(r#"(?:href|url)\s*(?:=|\()\s*["']?([^"'\s)>]+)"#).unwrap();
   for capture in references.captures_iter(text){let url=&capture[1];if !url.starts_with('#')&&!url.starts_with("data:"){return Err(ui_text!("backend.theme_resources.validate_resource_bytes").into());}}
   text.contains("<svg")
 }else{true};
 if valid{Ok(())}else{Err(ui_text!("backend.theme_resources.validate_resource_bytes2").into())}
}
#[tauri::command]
pub(crate) async fn load_theme_resource(url:String,refresh:bool,css:bool)->Result<ResourceEntry,String>{
 load_resource_at(&crate::theme_store::theme_root()?,url,refresh,css).await
}
pub(crate) async fn load_resource_at(theme_root:&Path,url:String,refresh:bool,css:bool)->Result<ResourceEntry,String>{
 let url=reqwest::Url::parse(&url).map_err(|_|ui_text!("backend.theme_resources.load_resource_at7"))?;
 if url.scheme()=="file"{
  let file=url.to_file_path().map_err(|_|ui_text!("backend.theme_resources.load_resource_at8"))?;
  let bytes=std::fs::read(&file).map_err(|_|ui_format!("backend.theme_resources.load_resource_at",file.display()))?;
  let mime=resource_type(&url,if css{"text/css"}else{"application/octet-stream"});
  validate_resource_bytes(&mime,&bytes)?;
  return Ok(ResourceEntry{id:new_id(),name:resource_name(&url,&mime),media_type:mime,size:bytes.len(),final_url:url.to_string(),text:if css{Some(String::from_utf8(bytes.clone()).map_err(|_|ui_text!("backend.theme_resources.load_resource_at9"))?)}else{None},bytes:if css{None}else{Some(bytes)},etag:None,modified:None});
 }
 if !matches!(url.scheme(),"http"|"https"){return Err(ui_text!("backend.theme_resources.load_resource_at2").into());}
 static REQUESTS:std::sync::OnceLock<tokio::sync::Mutex<std::collections::HashMap<String,std::sync::Weak<tokio::sync::Mutex<()>>>>>=std::sync::OnceLock::new();
 static NETWORK:tokio::sync::Semaphore=tokio::sync::Semaphore::const_new(4);
 let root=theme_root.join("remote-cache");
 let key=format!("{}|{}",root.display(),url);
 let request_lock={let mut requests=REQUESTS.get_or_init(Default::default).lock().await;
 requests.retain(|_,value|value.strong_count()>0);
 if let Some(lock)=requests.get(&key).and_then(std::sync::Weak::upgrade){lock}else{let lock=std::sync::Arc::new(tokio::sync::Mutex::new(()));requests.insert(key,std::sync::Arc::downgrade(&lock));lock}};
 let _request_guard=request_lock.lock().await;
 let index_guard=CACHE_INDEX.lock().await;
 std::fs::create_dir_all(&root).map_err(|_|ui_text!("backend.theme_resources.load_resource_at10"))?;
 let index_path=root.join("index.json");
 let mut index:std::collections::HashMap<String,ResourceEntry>=if index_path.exists(){serde_json::from_slice(&std::fs::read(&index_path).map_err(|e|e.to_string())?).map_err(|_|ui_text!("backend.theme_resources.load_resource_at11"))?}else{Default::default()};
 let old=index.get(url.as_str()).cloned().filter(|e|root.join(&e.id).join(&e.name).is_file());
 if !refresh{if let Some(entry)=old.as_ref(){let mut value=entry.clone();if css{value.text=Some(std::fs::read_to_string(root.join(&value.id).join(&value.name)).map_err(|e|e.to_string())?);}return Ok(value);}}
 drop(index_guard);
 let _permit=NETWORK.acquire().await.map_err(|e|e.to_string())?;
 static CLIENT:std::sync::OnceLock<reqwest::Client>=std::sync::OnceLock::new();
 let client=CLIENT.get_or_init(||reqwest::Client::builder().user_agent("Mozilla/5.0").timeout(std::time::Duration::from_secs(45)).build().unwrap());
 let mut request=client.get(url.clone());
 if let Some(old)=&old{if let Some(etag)=&old.etag{request=request.header("If-None-Match",etag);}if let Some(modified)=&old.modified{request=request.header("If-Modified-Since",modified);}}
 let response=request.send().await.map_err(|e|ui_format!("backend.theme_resources.load_resource_at3", url = url, e = e))?;
 if response.status()==reqwest::StatusCode::NOT_MODIFIED{if let Some(mut entry)=old{if css{entry.text=Some(std::fs::read_to_string(root.join(&entry.id).join(&entry.name)).map_err(|e|e.to_string())?);}return Ok(entry);}}
 if !response.status().is_success(){return Err(ui_format!("backend.theme_resources.load_resource_at4",url,response.status()));}
 let final_url=response.url().clone();let headers=response.headers().clone();
 let header=headers.get("content-type").and_then(|v|v.to_str().ok()).unwrap_or("");
 if header.starts_with("text/html"){return Err(ui_format!("backend.theme_resources.load_resource_at5", url = url));}
 let bytes=response.bytes().await.map_err(|e|e.to_string())?.to_vec();
 if bytes.is_empty()||bytes.starts_with(b"<!DOCTYPE html")||bytes.starts_with(b"<html"){return Err(ui_format!("backend.theme_resources.load_resource_at6", url = url));}
 let mime=resource_type(&final_url,if css{"text/css"}else{header});
 validate_resource_bytes(&mime,&bytes)?;
 let text=if css{Some(String::from_utf8(bytes.clone()).map_err(|_|ui_text!("backend.theme_resources.load_resource_at9"))?)}else{None};
 let id=if let Some(old)=&old{if std::fs::read(root.join(&old.id).join(&old.name)).ok().as_deref()==Some(&bytes){old.id.clone()}else{new_id()}}else{new_id()};
 let name=resource_name(&final_url,&mime);let folder=root.join(&id);std::fs::create_dir_all(&folder).map_err(|e|e.to_string())?;
 if !folder.join(&name).exists(){std::fs::write(folder.join(&name),&bytes).map_err(|e|e.to_string())?;}
 let mut entry=ResourceEntry{id,name,media_type:mime,size:bytes.len(),final_url:final_url.to_string(),text:None,bytes:None,etag:headers.get("etag").and_then(|v|v.to_str().ok()).map(str::to_owned),modified:headers.get("last-modified").and_then(|v|v.to_str().ok()).map(str::to_owned)};
 let _index_guard=CACHE_INDEX.lock().await;
 index=if index_path.exists(){serde_json::from_slice(&std::fs::read(&index_path).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?}else{Default::default()};
 index.insert(url.to_string(),entry.clone());
 // 索引只在完整文件写入后替换；既有资源版本不覆盖。
 let temporary=root.join("index.pending.json");std::fs::write(&temporary,serde_json::to_vec_pretty(&index).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
 std::fs::rename(temporary,index_path).map_err(|e|e.to_string())?;
 entry.text=text;Ok(entry)
}
#[tauri::command]
pub(crate) async fn freeze_theme_resources(app:tauri::AppHandle,document:serde_json::Value)->Result<std::collections::HashMap<String,ResourceEntry>,String>{
 tauri::async_runtime::spawn_blocking(move || freeze_resources(app,document)).await.map_err(|e|e.to_string())?
}
fn freeze_resources(app:tauri::AppHandle,document:serde_json::Value)->Result<std::collections::HashMap<String,ResourceEntry>,String>{
 let theme_id=document["themeId"].as_str().ok_or(ui_text!("backend.theme_resources.freeze_resources"))?;
 let root=crate::theme_store::theme_root()?.join("published-assets");
 let mut result=std::collections::HashMap::new();
 for asset in document["assets"].as_array().into_iter().flatten(){
  if asset["sharedResourceId"].is_string()||asset["cacheResourceId"].is_string(){continue;}
  let path=asset["path"].as_str().ok_or(ui_text!("backend.theme_resources.freeze_resources2"))?;
  let bytes=crate::theme_store::read_theme_asset_data(app.clone(),theme_id.into(),path.into())?;
  let name=path.rsplit('/').next().ok_or(ui_text!("backend.theme_resources.freeze_resources3"))?;
  let id=new_id();let folder=root.join(&id);std::fs::create_dir_all(&folder).map_err(|e|e.to_string())?;
  std::fs::write(folder.join(name),&bytes).map_err(|e|e.to_string())?;
  result.insert(path.into(),ResourceEntry{id,name:name.into(),media_type:asset["mediaType"].as_str().unwrap_or("application/octet-stream").into(),size:bytes.len(),final_url:String::new(),text:None,bytes:None,etag:None,modified:None});
 }
 Ok(result)
}

fn update_css_function_stack(text:&str,stack:&mut Vec<String>){
 for (offset,c) in text.char_indices(){
  if c=='('{
   let name=text[..offset].chars().rev().take_while(|c|c.is_ascii_alphanumeric()||matches!(c,'-'|'_')).collect::<String>().chars().rev().collect::<String>().to_ascii_lowercase();
   stack.push(name);
  }else if c==')'{stack.pop();}
 }
}
pub(crate) fn remote_css_response(css:&str,base:&str)->Result<String,String>{
 let base=reqwest::Url::parse(base).map_err(|e|e.to_string())?;
 let tokens=regex::Regex::new(r#"(?is)/\*.*?\*/|@import\s+(?:"[^"]*"|'[^']*')|url\(\s*(?:"[^"]*"|'[^']*'|[^)]*)\s*\)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'"#).unwrap();
 let mut previous=0;let mut functions=Vec::new();
 Ok(tokens.replace_all(css,|capture:&regex::Captures|{
  let matched=capture.get(0).unwrap();
  update_css_function_stack(&css[previous..matched.start()],&mut functions);previous=matched.end();
  let token=&capture[0];
  let lower=token.to_ascii_lowercase();
  let (start,end,is_css)=if lower.starts_with("@import") {
   let start=token.find(['\"','\'']).unwrap();(start+1,token.len()-1,true)
  }else if lower.starts_with("url(") {
   let body=&token[4..token.len()-1];let trimmed=body.trim();
   let offset=4+body.len()-body.trim_start().len();
   let quoted=trimmed.starts_with(['\"','\'']);
   let import=css[..capture.get(0).unwrap().start()].trim_end().to_ascii_lowercase().ends_with("@import");
   (offset+usize::from(quoted),offset+trimmed.len()-usize::from(quoted),import)
  }else if token.starts_with(['\"','\''])&&functions.last().is_some_and(|name|matches!(name.as_str(),"image-set"|"-webkit-image-set")){
   (1,token.len()-1,false)
  }else{return token.to_string()};
  let raw=&token[start..end];
  if raw.starts_with('#')||raw.starts_with("data:")||raw.starts_with("blob:"){return token.to_string()}
  let Ok(url)=base.join(raw)else{return token.to_string()};
  if !matches!(url.scheme(),"http"|"https"){return token.to_string()}
  let encoded=reqwest::Url::parse_with_params("http://localhost/", &[("url",url.as_str())]).unwrap().query().unwrap().strip_prefix("url=").unwrap().to_string();
  let target=format!("/theme-remote?url={encoded}{}",if is_css{"&css=1"}else{""});
  if lower.starts_with("url("){format!("url(\"{target}\")")}else{format!("{}{}{}",&token[..start],target,&token[end..])}
 }).into_owned())
}
#[cfg(test)]
mod remote_css_tests {
 use super::*;
 #[test]
 fn preserves_conditions_and_uses_import_base(){
  let css="/* url(ignore.png) */ @import './nested.css' layer(default) supports(display:grid) screen; @font-face{src:url(../a.woff2);unicode-range:U+4E00-4EFF} .a{content:'url(ignore.png)';background:url(data:image/png;base64,AA==)}";
  let result=remote_css_response(css,"https://example.com/fonts/css/main.css").unwrap();
  assert!(result.contains("url=https%3A%2F%2Fexample.com%2Ffonts%2Fcss%2Fnested.css&css=1"));
  assert!(result.contains("layer(default) supports(display:grid) screen"));
  assert!(result.contains("url=https%3A%2F%2Fexample.com%2Ffonts%2Fa.woff2"));
  assert!(result.contains("unicode-range:U+4E00-4EFF"));
  assert!(result.contains("content:'url(ignore.png)'"));
  assert!(result.contains("url(data:image/png;base64,AA==)"));
 }
}

#[tauri::command]
pub(crate) async fn cache_theme_resource(url:String,contents_base64:String,media_type:String)->Result<ResourceEntry,String>{
 use base64::Engine;
 let url=reqwest::Url::parse(&url).map_err(|_|ui_text!("backend.theme_resources.cache_theme_resource3"))?;
 if !matches!(url.scheme(),"http"|"https"){return Err(ui_text!("backend.theme_resources.cache_theme_resource").into())}
 let bytes=base64::engine::general_purpose::STANDARD.decode(contents_base64).map_err(|_|ui_text!("backend.theme_resources.cache_theme_resource4"))?;
 if bytes.is_empty(){return Err(ui_text!("backend.theme_resources.cache_theme_resource2").into())}
 validate_resource_bytes(&media_type,&bytes)?;
 let root=crate::theme_store::theme_root()?.join("remote-cache");
 fs::create_dir_all(&root).map_err(|e|e.to_string())?;
 let _guard=CACHE_INDEX.lock().await;
 let index_path=root.join("index.json");
 let mut index:std::collections::HashMap<String,ResourceEntry>=if index_path.exists(){serde_json::from_slice(&fs::read(&index_path).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?}else{Default::default()};
 if let Some(old)=index.get(url.as_str()){
  if fs::read(root.join(&old.id).join(&old.name)).ok().as_deref()==Some(bytes.as_slice()){return Ok(old.clone())}
 }
 let entry=ResourceEntry{id:new_id(),name:resource_name(&url,&media_type),media_type,size:bytes.len(),final_url:url.to_string(),text:None,bytes:None,etag:None,modified:None};
 let folder=root.join(&entry.id);fs::create_dir_all(&folder).map_err(|e|e.to_string())?;
 fs::write(folder.join(&entry.name),bytes).map_err(|e|e.to_string())?;
 index.insert(url.to_string(),entry.clone());
 let temporary=root.join("index.pending.json");fs::write(&temporary,serde_json::to_vec_pretty(&index).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
 fs::rename(temporary,index_path).map_err(|e|e.to_string())?;
 Ok(entry)
}
