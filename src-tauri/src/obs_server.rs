use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use axum::{extract::Path, http::{HeaderMap, Method}};
use axum::{extract::{State, OriginalUri, Query, ws::{WebSocketUpgrade, WebSocket, Message}}, http::StatusCode, response::{IntoResponse, Response}, routing::get, Router};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::HashMap, sync::{Arc, Mutex, atomic::{AtomicU64, Ordering}}};
use tauri::{Emitter, Manager};
use tokio::{net::TcpListener, sync::mpsc};

pub struct StaticAsset { pub content: Vec<u8>, pub mime_type: String }
type AssetReader = Arc<dyn Fn(&str) -> Option<StaticAsset> + Send + Sync>;
#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ServiceStatus { pub port: u16, pub running: bool, pub error: Option<String>, pub clients: usize }
#[derive(Default)]
pub struct ObsServerState { inner: Mutex<ServerInner> }
#[derive(Default)]
struct ServerInner { status: ServiceStatus, task: Option<tauri::async_runtime::JoinHandle<()>>, clients: HashMap<String, mpsc::UnboundedSender<String>> }
#[derive(Clone)]
struct ServerContext { app: tauri::AppHandle, assets: AssetReader }
#[derive(Clone, Deserialize, Serialize)]
pub struct Subscription { pub room: Option<String>, pub theme: Option<String>, pub config: Option<String>, pub preview: Option<String>, pub draft: Option<String>, pub kind: Option<String>, pub mode: Option<String> }
static NEXT_CLIENT: AtomicU64 = AtomicU64::new(1);

pub async fn bind_listener(port: u16) -> std::io::Result<TcpListener> { TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port)).await }
fn configured_port(app: &tauri::AppHandle) -> u16 {
    crate::data_paths::root().ok().and_then(|dir| std::fs::read(dir.join("obs-service.json")).ok())
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok()).and_then(|v| v["port"].as_u64()).and_then(|p| u16::try_from(p).ok()).filter(|p| *p > 0).unwrap_or(17920)
}
#[tauri::command]
pub fn obs_service_status(app: tauri::AppHandle, state: tauri::State<ObsServerState>) -> ServiceStatus {
    let inner = state.inner.lock().unwrap(); let mut status = inner.status.clone();
    if status.port == 0 { status.port = configured_port(&app); } status.clients = inner.clients.len(); status
}
#[tauri::command]
pub async fn obs_start_service(app: tauri::AppHandle) -> Result<ServiceStatus, String> {
    let port = configured_port(&app);
    { let state = app.state::<ObsServerState>(); let inner = state.inner.lock().unwrap(); if inner.status.running { return Ok(inner.status.clone()); } }
    let listener = match bind_listener(port).await {
        Ok(listener) => listener,
        Err(error) => { let message = ui_format!("backend.obs_server.obs_start_service", port = port, error = error); app.state::<ObsServerState>().inner.lock().unwrap().status = ServiceStatus { port, running:false, error:Some(message.clone()), clients:0 }; return Err(message); }
    };
    let reader_app = app.clone();
    let assets: AssetReader = Arc::new(move |path| {
        reader_app.asset_resolver().get(path.to_string()).and_then(|asset| {
            static_asset_mime(path, &asset.bytes, &asset.mime_type)
                .map(|mime_type| StaticAsset { content: asset.bytes, mime_type })
        })
    });
    let context = ServerContext { app: app.clone(), assets };
    let router = Router::new().route("/health", get(|| async { "ok" })).route("/ws", get(upgrade)).route("/theme-remote", get(remote_theme_resource)).route("/theme-resources/{kind}/{id}/{name}", get(stored_theme_resource)).route("/theme-assets/{theme_id}/{name}", get(theme_resource)).route("/theme-catalog/assets/{name}", get(legacy_theme_resource)).route("/gift-effects/{token}/{name}", get(gift_resource)).fallback(get(asset_response)).with_state(context);
    let task_app = app.clone();
    let task = tauri::async_runtime::spawn(async move {
        if let Err(error) = axum::serve(listener, router).await { let state = task_app.state::<ObsServerState>(); let mut inner = state.inner.lock().unwrap(); inner.status.running = false; inner.status.error = Some(error.to_string()); inner.clients.clear(); }
    });
    let state = app.state::<ObsServerState>(); let mut inner = state.inner.lock().unwrap();
    inner.task = Some(task); inner.status = ServiceStatus { port, running:true, error:None, clients:0 }; Ok(inner.status.clone())
}
#[tauri::command]
pub async fn obs_set_service_port(app: tauri::AppHandle, port: u16) -> Result<ServiceStatus, String> {
    if port == 0 { return Err(ui_text!("backend.obs_server.obs_set_service_port").into()); }
    if port == configured_port(&app) {
        let status = obs_service_status(app.clone(), app.state::<ObsServerState>());
        return if status.running { Ok(status) } else { obs_start_service(app).await };
    }
    let probe = bind_listener(port).await.map_err(|_| ui_text!("backend.obs_server.obs_set_service_port2"))?; drop(probe);
    let directory = crate::data_paths::root().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    std::fs::write(directory.join("obs-service.json"), serde_json::to_vec(&serde_json::json!({"port":port})).unwrap()).map_err(|e| e.to_string())?;
    { let state = app.state::<ObsServerState>(); let mut inner = state.inner.lock().unwrap(); if let Some(task) = inner.task.take() { task.abort(); } inner.clients.clear(); inner.status.running = false; }
    obs_start_service(app).await
}
#[tauri::command]
pub fn obs_send(state: tauri::State<ObsServerState>, client_id: String, payload: Value) -> Result<(), String> {
    let inner = state.inner.lock().unwrap(); if let Some(sender) = inner.clients.get(&client_id) { let _ = sender.send(payload.to_string()); } Ok(())
}
async fn upgrade(State(context): State<ServerContext>, Query(query): Query<Subscription>, ws: WebSocketUpgrade) -> Response { ws.on_upgrade(move |socket| client(socket, context, query)) }
async fn client(mut socket: WebSocket, context: ServerContext, query: Subscription) {
    let id = NEXT_CLIENT.fetch_add(1, Ordering::Relaxed).to_string(); let (tx, mut rx) = mpsc::unbounded_channel();
    context.app.state::<ObsServerState>().inner.lock().unwrap().clients.insert(id.clone(), tx);
    let _ = context.app.emit_to("main", "obs:subscribe", serde_json::json!({"clientId":id,"query":query}));
    loop { tokio::select! {
        outgoing = rx.recv() => match outgoing { Some(text) => if socket.send(Message::Text(text.into())).await.is_err() { break; }, None => break },
        incoming = socket.recv() => match incoming {
            Some(Ok(Message::Text(text))) => { if let Ok(value) = serde_json::from_str::<Value>(&text) { let _ = context.app.emit_to("main", "obs:client-message", serde_json::json!({"clientId":id,"message":value})); } },
            Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
            _ => {}
        }
    }}
    context.app.state::<ObsServerState>().inner.lock().unwrap().clients.remove(&id);
    let _ = context.app.emit_to("main", "obs:unsubscribe", &id);
}
fn gift_resource_path(url: &str, name: &str) -> String {
    format!("/gift-effects/{}/{}", URL_SAFE_NO_PAD.encode(url.as_bytes()), name)
}
fn gift_resource_url(token: &str) -> Result<reqwest::Url, StatusCode> {
    let bytes = URL_SAFE_NO_PAD.decode(token).map_err(|_| StatusCode::BAD_REQUEST)?;
    let url = reqwest::Url::parse(std::str::from_utf8(&bytes).map_err(|_| StatusCode::BAD_REQUEST)?)
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    if !matches!(url.scheme(), "http" | "https") { return Err(StatusCode::BAD_REQUEST); }
    Ok(url)
}
fn rewrite_gift_config(value: &mut Value, base: &reqwest::Url, origin: &str) {
    match value {
        Value::Object(object) => for (key, value) in object {
            if matches!(key.as_str(), "url" | "imgUrl" | "src") && value.is_string() {
                let source = value.as_str().unwrap();
                if !source.starts_with('[') && !source.starts_with("data:") {
                    if let Ok(url) = base.join(source) {
                        let name = url.path_segments().and_then(|mut parts| parts.next_back()).filter(|name| !name.is_empty()).unwrap_or("asset");
                        *value = Value::String(format!("{}{}", origin, gift_resource_path(url.as_str(), name)));
                    }
                }
            } else { rewrite_gift_config(value, base, origin); }
        },
        Value::Array(array) => for value in array { rewrite_gift_config(value, base, origin); },
        _ => {}
    }
}
fn gift_resource_response(status: StatusCode, headers: &HeaderMap, body: Vec<u8>, name: &str) -> Response {
    let mut response = (status, body).into_response();
    for key in ["content-type", "content-range", "accept-ranges", "etag", "last-modified"] {
        if let Some(value) = headers.get(key) { response.headers_mut().insert(key, value.clone()); }
    }
    if name.ends_with(".mp4") { response.headers_mut().insert("content-type", "video/mp4".parse().unwrap()); }
    if name.ends_with(".json") { response.headers_mut().insert("content-type", "application/json".parse().unwrap()); }
    response.headers_mut().insert("cache-control", (if status.is_success() { "public, max-age=86400" } else { "no-store" }).parse().unwrap());
    response.headers_mut().insert("access-control-allow-origin", "*".parse().unwrap());
    response
}
async fn gift_resource(Path((token, name)): Path<(String, String)>, headers: HeaderMap, method: Method) -> Response {
    let url = match gift_resource_url(&token) { Ok(url) => url, Err(status) => return status.into_response() };
    static CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();
    let client = CLIENT.get_or_init(reqwest::Client::new);
    let mut request = client.request(method.clone(), url.clone());
    for key in ["range", "if-range"] {
        if let Some(value) = headers.get(key) { request = request.header(key, value); }
    }
    let upstream = match request.send().await { Ok(response) => response, Err(_) => return StatusCode::BAD_GATEWAY.into_response() };
    let status = upstream.status();
    let response_headers = upstream.headers().clone();
    let mut body = match upstream.bytes().await { Ok(bytes) => bytes.to_vec(), Err(_) => return StatusCode::BAD_GATEWAY.into_response() };
    if name.ends_with(".json") && status == StatusCode::OK && method != Method::HEAD {
        let mut config: Value = match serde_json::from_slice(&body) { Ok(value) => value, Err(_) => return StatusCode::BAD_GATEWAY.into_response() };
        let origin = format!("http://{}", headers.get("host").and_then(|value| value.to_str().ok()).unwrap_or("localhost:17920"));
        rewrite_gift_config(&mut config, &url, &origin);
        body = serde_json::to_vec(&config).unwrap();
    }
    let mut response = gift_resource_response(status, &response_headers, body, &name);
    if method == Method::HEAD {
        if let Some(length) = response_headers.get("content-length") { response.headers_mut().insert("content-length", length.clone()); }
    }
    response
}
fn static_asset_mime(path: &str, bytes: &[u8], inferred: &str) -> Option<String> {
    if path.ends_with(".woff2") && bytes.starts_with(b"wOF2") {
        Some("font/woff2".into())
    } else if inferred.starts_with("text/html") && !path.ends_with(".html") {
        None
    } else {
        Some(inferred.into())
    }
}
fn static_asset_path(path: &str) -> &str {
    if path.starts_with("media/") { path.split('@').next().unwrap_or(path) } else { path }
}
async fn asset_response(State(context): State<ServerContext>, OriginalUri(uri): OriginalUri) -> Response {
    let path = match uri.path() { "/obs" | "/preview" => "obs.html", path => path.trim_start_matches('/') };
    match (context.assets)(static_asset_path(path)) {
        Some(asset) => ([("content-type", asset.mime_type), ("cache-control", "no-cache".to_string()), ("access-control-allow-origin", "*".to_string())], asset.content).into_response(),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn theme_resource(State(context): State<ServerContext>, Path((theme_id, name)): Path<(String, String)>) -> Response {
    match crate::theme_store::read_theme_asset_data(context.app.clone(), theme_id.clone(), format!("assets/{name}")) {
        Ok(bytes) => {
            let mime = match name.rsplit('.').next().unwrap_or("") {
                "woff2" => "font/woff2", "woff" => "font/woff", "ttf" => "font/ttf", "otf" => "font/otf",
                "png" | "apng" => "image/png", "jpg" | "jpeg" => "image/jpeg", "webp" => "image/webp", "gif" => "image/gif", "svg" => "image/svg+xml", _ => "application/octet-stream",
            };
            let mime=crate::theme_store::theme_asset_media_type(&context.app,&theme_id,&format!("assets/{name}")).unwrap_or_else(||mime.into());
            ([("content-type", mime), ("access-control-allow-origin", "*".into()), ("cache-control", "no-cache".into())], bytes).into_response()
        }
        Err(_) => {
            if let Some(source) = crate::theme_store::theme_asset_source_url(&context.app, &theme_id, &format!("assets/{name}")) {
                if source.starts_with("http://") || source.starts_with("https://") {
                    return remote_theme_resource(Query(RemoteThemeQuery { url: source, css: None })).await;
                }
                if let Some(data) = source.strip_prefix("data:") {
                    if let Some((mime, encoded)) = data.split_once(";base64,") {
                        use base64::Engine;
                        if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(encoded) {
                            return ([("content-type", mime.to_owned()), ("access-control-allow-origin", "*".into())], bytes).into_response();
                        }
                    }
                }
            }
            StatusCode::NOT_FOUND.into_response()
        },
    }
}

async fn legacy_theme_resource(State(context): State<ServerContext>, Path(name): Path<String>) -> Response {
    match crate::theme_store::legacy_catalog_asset(context.app.clone(), &name) {
        Ok(theme_id) => theme_resource(State(context), Path((theme_id, name))).await,
        Err(error) => (StatusCode::NOT_FOUND, error).into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore = "requires Chrome headless, Playwright and the Vite asset server on 1442"]
    async fn chrome_browser_uses_real_gift_proxy() {
        let listener = bind_listener(0).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = tokio::spawn(async move {
            axum::serve(listener, Router::new().route("/gift-effects/{token}/{name}", get(gift_resource))).await.unwrap();
        });
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_path_buf();
        let output = tokio::task::spawn_blocking(move || {
            std::process::Command::new("node")
                .current_dir(root)
                .arg("tests/obsGiftEffects.browser.mjs")
                .arg(format!("--group={}", std::env::var("OBS_BROWSER_CASE").unwrap_or_else(|_| "smoke".into())))
                .env("OBS_RUST_PROXY_PORT", port.to_string())
                .output().unwrap()
        }).await.unwrap();
        server.abort();
        println!("{}", String::from_utf8_lossy(&output.stdout));
        assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    }

    #[test]
    fn gift_resource_address_roundtrips_and_preserves_extension() {
        let url = "https://example.com/gift/video.mp4?version=2";
        let path = gift_resource_path(url, "video.mp4");
        assert!(path.ends_with("/video.mp4"));
        let token = path.split('/').nth(2).unwrap();
        assert_eq!(gift_resource_url(token).unwrap().as_str(), url);
        assert!(gift_resource_url("invalid").is_err());
    }

    #[test]
    fn gift_resource_response_preserves_browser_range_headers() {
        let mut headers = axum::http::HeaderMap::new();
        headers.insert("content-range", "bytes 10-19/100".parse().unwrap());
        headers.insert("accept-ranges", "bytes".parse().unwrap());
        let response = gift_resource_response(StatusCode::PARTIAL_CONTENT, &headers, vec![1; 10], "video.mp4");
        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(response.headers()["content-range"], "bytes 10-19/100");
        assert_eq!(response.headers()["content-type"], "video/mp4");
        assert_eq!(response.headers()["access-control-allow-origin"], "*");
    }

    #[tokio::test]
    async fn gift_proxy_forwards_video_range_to_upstream() {
        use std::io::{Read, Write};
        let upstream = std::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).unwrap();
        let address = upstream.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut socket, _) = upstream.accept().unwrap();
            let mut bytes = [0; 4096];
            let mut request = String::new();
            while !request.contains("\r\n\r\n") {
                let count = socket.read(&mut bytes).unwrap();
                if count == 0 { break; }
                request.push_str(std::str::from_utf8(&bytes[..count]).unwrap());
            }
            assert!(request.to_ascii_lowercase().contains("range: bytes=2-4"));
            socket.write_all(b"HTTP/1.1 206 Partial Content\r\nContent-Length: 3\r\nContent-Range: bytes 2-4/10\r\nAccept-Ranges: bytes\r\nConnection: close\r\n\r\n234").unwrap();
        });
        let token = URL_SAFE_NO_PAD.encode(format!("http://{address}/video.mp4"));
        let mut headers = HeaderMap::new();
        headers.insert("range", "bytes=2-4".parse().unwrap());
        let response = gift_resource(Path((token, "video.mp4".into())), headers, Method::GET).await;
        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(response.headers()["content-range"], "bytes 2-4/10");
        let bytes = axum::body::to_bytes(response.into_body(), 1024).await.unwrap();
        assert_eq!(&bytes[..], b"234");
        server.join().unwrap();
    }

    #[test]
    fn config_references_use_same_service_and_keep_placeholders() {
        let mut value = serde_json::json!({"url":"images/frame.png", "src":[{"srcTag":"[avatar]"}]});
        rewrite_gift_config(&mut value, &reqwest::Url::parse("https://example.com/gift/config.json").unwrap(), "http://localhost:17920");
        assert!(value["url"].as_str().unwrap().starts_with("http://localhost:17920/gift-effects/"));
        assert_eq!(value["src"][0]["srcTag"], "[avatar]");
    }

    #[tokio::test]
    async fn occupied_port_is_reported_without_selecting_another_port() {
        let occupied = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).await.unwrap();
        let port = occupied.local_addr().unwrap().port();
        assert!(bind_listener(port).await.is_err());
    }

    #[test]
    fn local_image_resize_suffix_resolves_original_resource() {
        assert_eq!(static_asset_path("media/avatar.jpg@320w_320h"), "media/avatar.jpg");
        assert_eq!(static_asset_path("laplace/files/photo.webp"), "laplace/files/photo.webp");
    }

    #[test]
    fn woff2_font_uses_font_mime_without_accepting_html_fallback() {
        assert_eq!(static_asset_mime("assets/font.woff2", b"wOF2font", "text/html"), Some("font/woff2".into()));
        assert_eq!(static_asset_mime("assets/missing.woff2", b"<!doctype html>", "text/html"), None);
        assert_eq!(static_asset_mime("obs.html", b"<!doctype html>", "text/html"), Some("text/html".into()));
    }

    #[tokio::test]
    async fn listener_only_binds_loopback() {
        let listener = bind_listener(0).await.unwrap();
        assert!(listener.local_addr().unwrap().ip().is_loopback());
    }
}

async fn stored_theme_resource(State(context): State<ServerContext>, Path((kind, id, name)): Path<(String, String, String)>) -> Response {
    let bytes = match crate::theme_store::theme_root().and_then(|root| crate::theme_resources::read_resource_at(&root, &kind, &id, &name)) {
        Ok(bytes) => bytes,
        Err(_) if kind == "shared" && id == name && name.starts_with("catalog-") => return legacy_theme_resource(State(context), Path(name)).await,
        Err(_) => return StatusCode::NOT_FOUND.into_response(),
    };
    let mime = match name.rsplit('.').next().unwrap_or("") {
        "woff2" => "font/woff2", "woff" => "font/woff", "ttf" => "font/ttf", "otf" => "font/otf",
        "png"|"apng" => "image/png", "jpg"|"jpeg" => "image/jpeg", "webp" => "image/webp", "gif" => "image/gif", "svg" => "image/svg+xml", "css" => "text/css", _ => "application/octet-stream",
    };
    let mime = if mime == "application/octet-stream" && kind == "shared" {
        crate::theme_store::theme_root().ok().and_then(|root| std::fs::read(root.join("shared-assets/index.json")).ok())
            .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok()).and_then(|index| index[&id]["mediaType"].as_str().map(str::to_owned)).unwrap_or_else(|| mime.into())
    } else { mime.into() };
    ([("content-type", mime), ("access-control-allow-origin", "*".into()), ("cache-control", "public, max-age=31536000, immutable".into())], bytes).into_response()
}

#[derive(Deserialize)]
struct RemoteThemeQuery { url:String, css:Option<u8> }
async fn remote_theme_resource(Query(query):Query<RemoteThemeQuery>)->Response {
 let css=query.css==Some(1);
 let root=match crate::theme_store::theme_root(){Ok(root)=>root,Err(error)=>return (StatusCode::INTERNAL_SERVER_ERROR,error).into_response()};
 if !reqwest::Url::parse(&query.url).is_ok_and(|url|matches!(url.scheme(),"http"|"https")){return StatusCode::BAD_REQUEST.into_response()}
 let entry=match crate::theme_resources::load_resource_at(&root,query.url,false,css).await {Ok(entry)=>entry,Err(error)=>return (StatusCode::BAD_GATEWAY,error).into_response()};
 if css {
  let text=match crate::theme_resources::remote_css_response(entry.text.as_deref().unwrap_or(""),&entry.final_url){Ok(text)=>text,Err(error)=>return (StatusCode::BAD_GATEWAY,error).into_response()};
  ([("content-type","text/css; charset=utf-8"),("access-control-allow-origin","*"),("cache-control","no-cache")],text).into_response()
 }else {
  ([("access-control-allow-origin", "*")], axum::response::Redirect::temporary(&format!("/theme-resources/remote/{}/{}",entry.id,entry.name))).into_response()
 }
}
