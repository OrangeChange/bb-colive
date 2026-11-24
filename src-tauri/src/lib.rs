mod data_paths;
mod data_migration;
// Tauri 后端：薄壳，只做窗口管理 + 插件注册
// 协议层/存储逻辑全在前端 TS

use std::collections::{HashMap, HashSet};
use std::io::Cursor;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use rodio::cpal::traits::{DeviceTrait, HostTrait};
use rodio::Source;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tokio::sync::Notify;
use tokio::task::AbortHandle;
mod theme_store;
mod theme_resources;
mod obs_server;
mod edge_gec;
#[cfg(target_os = "windows")]
mod liquid_glass;
const FLOATING_WINDOW_LABELS: [&str; 5] = ["display", "gift", "gift-only", "superchat", "guard"];

#[derive(Default)]
struct AudioOutputState {
    tts: AudioPlaybackChannel,
    personal: AudioPlaybackChannel,
    personal_preview: AudioPlaybackChannel,
}

#[derive(Default)]
struct TrayWindowState {
    display_open: Mutex<bool>,
    gift_open: Mutex<bool>,
}

#[derive(Default)]
struct ExternalSynthesisState {
    active: Mutex<HashMap<String, ActiveExternalSynthesis>>,
}

struct ActiveExternalSynthesis {
    abort: AbortHandle,
    completion: Arc<ExternalSynthesisCompletion>,
}

struct ExternalSynthesisCompletion {
    done: AtomicBool,
    notify: Notify,
}

impl ExternalSynthesisCompletion {
    fn new() -> Self {
        Self {
            done: AtomicBool::new(false),
            notify: Notify::new(),
        }
    }

    fn complete(&self) {
        self.done.store(true, Ordering::Release);
        self.notify.notify_waiters();
    }

    async fn wait(&self) {
        loop {
            if self.done.load(Ordering::Acquire) {
                return;
            }
            let notified = self.notify.notified();
            if self.done.load(Ordering::Acquire) {
                return;
            }
            notified.await;
        }
    }
}

#[derive(Default)]
struct AudioPlaybackChannel {
    active: Arc<Mutex<Option<ActiveAudioPlayback>>>,
    generation: AtomicU64,
}

struct ActiveAudioPlayback {
    id: u64,
    _streams: Vec<rodio::MixerDeviceSink>,
    players: Vec<rodio::Player>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AudioOutputDevice {
    id: String,
    name: String,
    is_default: bool,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioOutputTarget {
    pub scope: String,
    pub monitor_device_id: Option<String>,
    pub stream_device_id: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct WindowsVoice {
    name: String,
    label: String,
    language: String,
}

#[derive(serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct FishAudioConfig {
    api_key: String,
    base_url: String,
    model: String,
    reference_id: String,
    format: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct FishAudioModelInfo {
    id: String,
    name: String,
    author: Option<String>,
    languages: Vec<String>,
}

#[derive(serde::Deserialize)]
struct FishAudioModelResponse {
    #[serde(rename = "_id")]
    id: String,
    title: String,
    #[serde(default)]
    languages: Vec<String>,
    author: Option<FishAudioModelAuthor>,
}

#[derive(serde::Deserialize)]
struct FishAudioModelAuthor {
    nickname: Option<String>,
}

#[derive(serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CustomHttpConfig {
    endpoint: String,
    method: String,
    auth_type: String,
    api_key: String,
    api_key_header: String,
    text_field: String,
    voice_field: String,
    model_field: String,
    model: String,
    rate_field: String,
    pitch_field: String,
    volume_field: String,
    audio_field: String,
    response_format: String,
    fixed_body: serde_json::Value,
    extra_headers: HashMap<String, String>,
}

fn fish_volume(volume: f64) -> f64 {
    if volume <= 0.0 {
        return -96.0;
    }
    (20.0 * volume.min(1.0).log10() * 10.0).round() / 10.0
}

const FISH_AUDIO_DIRECT_BASE_URL: &str = "https://api.fish.audio";
const FISH_AUDIO_GATEWAY_TTS_ENDPOINT: &str =
    "https://danmu-fish-audio-gateway-pages.pages.dev/laplace/tts-fishaudio";
static FISH_AUDIO_GATEWAY_REQUEST_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ExternalRequestRoute {
    Direct,
    SystemProxy,
}

fn external_request_route(url: &reqwest::Url) -> ExternalRequestRoute {
    if url
        .as_str()
        .eq_ignore_ascii_case(FISH_AUDIO_GATEWAY_TTS_ENDPOINT)
    {
        ExternalRequestRoute::Direct
    } else {
        ExternalRequestRoute::SystemProxy
    }
}

fn direct_external_client() -> Result<&'static reqwest::Client, String> {
    static CLIENT: OnceLock<Result<reqwest::Client, String>> = OnceLock::new();
    CLIENT
        .get_or_init(|| {
            reqwest::Client::builder()
                .no_proxy()
                .timeout(Duration::from_secs(45))
                .build()
                .map_err(|error| format!("创建直连外部语音请求客户端失败: {error}"))
        })
        .as_ref()
        .map_err(Clone::clone)
}

fn format_external_error(error: &dyn std::error::Error) -> String {
    let mut details = Vec::new();
    let mut current = Some(error);
    while let Some(error) = current {
        let detail = error.to_string();
        if !detail.is_empty() && details.last() != Some(&detail) {
            details.push(detail);
        }
        current = error.source();
    }
    details.join(": ")
}

fn uses_fish_audio_gateway(base_url: &str) -> bool {
    base_url
        .trim()
        .trim_end_matches('/')
        .eq_ignore_ascii_case(FISH_AUDIO_DIRECT_BASE_URL)
}

fn build_fish_audio_gateway_request(
    text: &str,
    voice_name: &str,
    rate: f64,
    volume: f64,
    config: &FishAudioConfig,
) -> (&'static str, serde_json::Value) {
    let reference_id = if config.reference_id.trim().is_empty() {
        voice_name.trim()
    } else {
        config.reference_id.trim()
    };
    let mut payload = serde_json::json!({
        "token": config.api_key.trim(),
        "text": text,
        "model": config.model.trim(),
        "format": config.format,
        "prosody": {
            "speed": rate,
            "volume": fish_volume(volume),
            "normalize_loudness": true,
        },
        "normalize": true,
        "latency": "normal",
        "chunk_length": 300,
    });
    if !reference_id.is_empty() {
        payload["voice"] = serde_json::Value::String(reference_id.to_string());
    }
    (FISH_AUDIO_GATEWAY_TTS_ENDPOINT, payload)
}

fn next_fish_audio_gateway_request_id() -> String {
    let sequence = FISH_AUDIO_GATEWAY_REQUEST_COUNTER.fetch_add(1, Ordering::Relaxed);
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("danmu-tts-{timestamp:x}-{sequence:x}")
}

fn build_fish_audio_gateway_headers(request_id: &str) -> HashMap<String, String> {
    let mut headers = HashMap::new();
    headers.insert("Content-Type".to_string(), "application/json".to_string());
    headers.insert("X-Danmu-Request-Id".to_string(), request_id.to_string());
    headers
}

fn build_fish_audio_payload(
    text: &str,
    voice_name: &str,
    rate: f64,
    volume: f64,
    config: &FishAudioConfig,
) -> serde_json::Value {
    let reference_id = if config.reference_id.trim().is_empty() {
        voice_name.trim()
    } else {
        config.reference_id.trim()
    };
    let mut body = serde_json::json!({
        "text": text,
        "prosody": {
            "speed": rate,
            "volume": fish_volume(volume),
            "normalize_loudness": true,
        },
        "format": config.format,
    });
    if !reference_id.is_empty() {
        body["reference_id"] = serde_json::Value::String(reference_id.to_string());
    }
    body
}

fn external_endpoint(value: &str) -> Result<reqwest::Url, String> {
    let url =
        reqwest::Url::parse(value.trim()).map_err(|error| format!("外部语音地址无效: {error}"))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("外部语音地址只支持 HTTP 或 HTTPS".to_string());
    }
    Ok(url)
}

fn set_custom_body_field(
    body: &mut serde_json::Map<String, serde_json::Value>,
    field: &str,
    value: serde_json::Value,
) {
    let path = field
        .trim()
        .split('.')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    if path.is_empty() {
        return;
    }

    let mut target = body;
    for (index, key) in path.iter().enumerate() {
        if index == path.len() - 1 {
            target.insert((*key).to_string(), value);
            return;
        }

        let entry = target
            .entry((*key).to_string())
            .or_insert_with(|| serde_json::Value::Object(serde_json::Map::new()));
        if !entry.is_object() {
            *entry = serde_json::Value::Object(serde_json::Map::new());
        }
        target = entry
            .as_object_mut()
            .expect("nested custom request path must remain an object");
    }
}

fn build_custom_http_payload(
    text: &str,
    voice_name: &str,
    rate: f64,
    pitch: f64,
    volume: f64,
    config: &CustomHttpConfig,
) -> Result<serde_json::Value, String> {
    let mut body = match config.fixed_body.clone() {
        serde_json::Value::Object(body) => body,
        serde_json::Value::Null => serde_json::Map::new(),
        _ => return Err("自定义 API 固定请求字段必须是 JSON 对象".to_string()),
    };
    set_custom_body_field(
        &mut body,
        &config.text_field,
        serde_json::Value::String(text.to_string()),
    );
    set_custom_body_field(
        &mut body,
        &config.voice_field,
        serde_json::Value::String(voice_name.to_string()),
    );
    set_custom_body_field(
        &mut body,
        &config.model_field,
        serde_json::Value::String(config.model.clone()),
    );
    set_custom_body_field(&mut body, &config.rate_field, serde_json::json!(rate));
    set_custom_body_field(&mut body, &config.pitch_field, serde_json::json!(pitch));
    set_custom_body_field(&mut body, &config.volume_field, serde_json::json!(volume));
    Ok(serde_json::Value::Object(body))
}

fn decode_external_audio(
    response_format: &str,
    response_body: &str,
    audio_field: &str,
) -> Result<Vec<u8>, String> {
    if response_format == "audio" {
        return Err("原始音频响应不能按 JSON 文本解码".to_string());
    }
    if response_format != "json-base64" {
        return Err(format!("不支持的外部语音响应格式: {response_format}"));
    }
    let value: serde_json::Value = serde_json::from_str(response_body)
        .map_err(|error| format!("自定义 API 返回的 JSON 无效: {error}"))?;
    let field = audio_field.trim();
    let encoded = field
        .split('.')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .try_fold(&value, |current, key| current.get(key))
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| format!("自定义 API 响应中没有 Base64 音频字段: {field}"))?;
    base64::Engine::decode(&base64::engine::general_purpose::STANDARD, encoded)
        .map_err(|error| format!("自定义 API Base64 音频无效: {error}"))
}

fn compact_external_error(body: &[u8]) -> String {
    String::from_utf8_lossy(body)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(240)
        .collect()
}

async fn run_cancelable_external_synthesis<F>(
    request_id: Option<String>,
    state: tauri::State<'_, ExternalSynthesisState>,
    work: F,
) -> Result<Vec<u8>, String>
where
    F: std::future::Future<Output = Result<Vec<u8>, String>> + Send + 'static,
{
    let handle = tauri::async_runtime::spawn(work);
    let request_id = request_id.unwrap_or_default().trim().to_string();
    let completion = Arc::new(ExternalSynthesisCompletion::new());
    if !request_id.is_empty() {
        let abort_handle = handle.inner().abort_handle();
        if let Err(error) = state.active.lock().map(|mut active| {
            active.insert(
                request_id.clone(),
                ActiveExternalSynthesis {
                    abort: abort_handle,
                    completion: Arc::clone(&completion),
                },
            )
        }) {
            handle.abort();
            return Err(format!("外部语音合成状态锁定失败: {error}"));
        }
    }

    let result = match handle.await {
        Ok(result) => result,
        Err(error) => Err(format!("外部语音合成任务失败: {error}")),
    };
    completion.complete();
    if !request_id.is_empty() {
        let _ = state
            .active
            .lock()
            .map(|mut active| active.remove(&request_id));
    }
    result
}

async fn send_external_json_request(
    url: reqwest::Url,
    headers: HashMap<String, String>,
    body: serde_json::Value,
    response_format: &str,
    audio_field: &str,
) -> Result<Vec<u8>, String> {
    let client = match external_request_route(&url) {
        ExternalRequestRoute::Direct => direct_external_client()?.clone(),
        ExternalRequestRoute::SystemProxy => reqwest::Client::builder()
            .timeout(Duration::from_secs(45))
            .build()
            .map_err(|error| format!("创建外部语音请求客户端失败: {error}"))?,
    };
    let mut request = client.post(url).json(&body);
    for (name, value) in headers {
        request = request.header(name, value);
    }
    let response = request
        .send()
        .await
        .map_err(|error| format!("外部语音请求失败: {}", format_external_error(&error)))?;
    let status = response.status();
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("读取外部语音响应失败: {}", format_external_error(&error)))?;
    if !status.is_success() {
        let detail = compact_external_error(&bytes);
        return Err(if detail.is_empty() {
            format!("外部语音请求失败（HTTP {}）", status.as_u16())
        } else {
            format!("外部语音请求失败（HTTP {}）：{detail}", status.as_u16())
        });
    }
    if response_format == "audio" {
        if bytes.is_empty() {
            return Err("外部语音返回了空音频".to_string());
        }
        return Ok(bytes.to_vec());
    }
    decode_external_audio(
        response_format,
        &String::from_utf8_lossy(&bytes),
        audio_field,
    )
}

fn parse_fish_audio_model_response(response_body: &[u8]) -> Result<FishAudioModelInfo, String> {
    let model: FishAudioModelResponse = serde_json::from_slice(response_body)
        .map_err(|error| format!("Fish Audio 模型信息无效: {error}"))?;
    let id = model.id.trim();
    let title = model.title.trim();
    if id.is_empty() || title.is_empty() {
        return Err("Fish Audio 模型信息缺少 ID 或名称".to_string());
    }
    Ok(FishAudioModelInfo {
        id: id.to_string(),
        name: title.to_string(),
        author: model
            .author
            .and_then(|author| author.nickname)
            .filter(|name| !name.trim().is_empty()),
        languages: model
            .languages
            .into_iter()
            .map(|language| language.trim().to_string())
            .filter(|language| !language.is_empty())
            .collect(),
    })
}

#[tauri::command]
async fn lookup_fish_audio_model(
    base_url: String,
    api_key: String,
    model_id: String,
) -> Result<FishAudioModelInfo, String> {
    if api_key.trim().is_empty() {
        return Err("请先填写 Fish Audio API Key".to_string());
    }
    let model_id = model_id.trim();
    if model_id.is_empty() {
        return Err("请先填写参考音色 ID".to_string());
    }
    let base_url = base_url.trim().trim_end_matches('/');
    let endpoint = external_endpoint(&format!("{base_url}/model/{model_id}"))?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|error| format!("创建 Fish Audio 查询客户端失败: {error}"))?;
    let response = client
        .get(endpoint)
        .bearer_auth(api_key.trim())
        .send()
        .await
        .map_err(|error| format!("Fish Audio 模型查询失败: {error}"))?;
    let status = response.status();
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("读取 Fish Audio 模型信息失败: {error}"))?;
    if !status.is_success() {
        let detail = compact_external_error(&bytes);
        return Err(if detail.is_empty() {
            format!("Fish Audio 模型查询失败（HTTP {}）", status.as_u16())
        } else {
            format!(
                "Fish Audio 模型查询失败（HTTP {}）：{detail}",
                status.as_u16()
            )
        });
    }
    parse_fish_audio_model_response(&bytes)
}

#[tauri::command]
async fn synthesize_fish_audio(
    text: String,
    voice_name: String,
    rate: f64,
    pitch: f64,
    volume: f64,
    config: FishAudioConfig,
    request_id: Option<String>,
    state: tauri::State<'_, ExternalSynthesisState>,
) -> Result<Vec<u8>, String> {
    let _ = pitch;
    if config.api_key.trim().is_empty() {
        return Err("请先填写 Fish Audio API Key".to_string());
    }
    if config.model.trim().is_empty() {
        return Err("请先填写 Fish Audio 模型".to_string());
    }
    let request_id_for_gateway = request_id.clone();
    let work = async move {
        if uses_fish_audio_gateway(&config.base_url) {
            let (endpoint, body) =
                build_fish_audio_gateway_request(&text, &voice_name, rate, volume, &config);
            let gateway_request_id = request_id_for_gateway
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(next_fish_audio_gateway_request_id);
            let headers = build_fish_audio_gateway_headers(&gateway_request_id);
            return send_external_json_request(
                external_endpoint(endpoint)?,
                headers,
                body,
                "audio",
                "audio",
            )
            .await;
        }
        let base_url = config.base_url.trim().trim_end_matches('/');
        let endpoint = if base_url.ends_with("/v1/tts") {
            base_url.to_string()
        } else {
            format!("{base_url}/v1/tts")
        };
        let body = build_fish_audio_payload(&text, &voice_name, rate, volume, &config);
        let mut headers = HashMap::new();
        headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", config.api_key),
        );
        headers.insert("Content-Type".to_string(), "application/json".to_string());
        headers.insert("model".to_string(), config.model.clone());
        send_external_json_request(
            external_endpoint(&endpoint)?,
            headers,
            body,
            "audio",
            "audio",
        )
        .await
    };
    run_cancelable_external_synthesis(request_id, state, work).await
}

#[tauri::command]
async fn synthesize_custom_http(
    text: String,
    voice_name: String,
    rate: f64,
    pitch: f64,
    volume: f64,
    config: CustomHttpConfig,
    request_id: Option<String>,
    state: tauri::State<'_, ExternalSynthesisState>,
) -> Result<Vec<u8>, String> {
    if !config.method.eq_ignore_ascii_case("POST") {
        return Err("自定义 API 第一版只支持 POST".to_string());
    }
    let body = build_custom_http_payload(&text, &voice_name, rate, pitch, volume, &config)?;
    let mut headers = config.extra_headers;
    headers
        .entry("Content-Type".to_string())
        .or_insert_with(|| "application/json".to_string());
    if config.auth_type == "bearer" && !config.api_key.trim().is_empty() {
        headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", config.api_key),
        );
    } else if config.auth_type == "api-key" && !config.api_key.trim().is_empty() {
        headers.insert(
            if config.api_key_header.trim().is_empty() {
                "X-API-Key".to_string()
            } else {
                config.api_key_header
            },
            config.api_key,
        );
    }
    let response_format = config.response_format.clone();
    let audio_field = config.audio_field.clone();
    let endpoint = config.endpoint.clone();
    let work = async move {
        send_external_json_request(
            external_endpoint(&endpoint)?,
            headers,
            body,
            &response_format,
            &audio_field,
        )
        .await
    };
    run_cancelable_external_synthesis(request_id, state, work).await
}

#[tauri::command]
async fn cancel_voice_synthesis(
    request_id: String,
    state: tauri::State<'_, ExternalSynthesisState>,
) -> Result<(), String> {
    let request_id = request_id.trim();
    if request_id.is_empty() {
        return Ok(());
    }
    let active = state
        .active
        .lock()
        .map_err(|error| format!("外部语音合成状态锁定失败: {error}"))?
        .remove(request_id);
    if let Some(active) = active {
        active.abort.abort();
        active.completion.wait().await;
    }
    Ok(())
}

const EDGE_TRUSTED_CLIENT_TOKEN: &str = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const EDGE_SOCKET_ENDPOINT: &str =
    "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
const EDGE_OUTPUT_FORMAT: &str = "audio-24khz-48kbitrate-mono-mp3";
const EDGE_ORIGIN: &str = "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold";
const EDGE_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0";
static EDGE_CONNECTION_COUNTER: AtomicU64 = AtomicU64::new(0);

fn edge_connection_id() -> String {
    let ticks = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let counter = EDGE_CONNECTION_COUNTER.fetch_add(1, Ordering::Relaxed) as u128;
    let value = ticks ^ ((std::process::id() as u128) << 64) ^ counter;
    format!("{value:032x}")
}

fn edge_unix_seconds(clock_skew_seconds: i64) -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
        + clock_skew_seconds
}

fn edge_date_string(clock_skew_seconds: i64) -> String {
    let unix_seconds = edge_unix_seconds(clock_skew_seconds);
    let days = unix_seconds.div_euclid(86_400);
    let seconds = unix_seconds.rem_euclid(86_400) as u64;
    let (year, month, day) = edge_civil_from_days(days);
    const WEEKDAYS: [&str; 7] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const MONTHS: [&str; 12] = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    let weekday = (days + 4).rem_euclid(7) as usize;
    format!(
        "{} {} {day:02} {year:04} {:02}:{:02}:{:02} GMT+0000 (Coordinated Universal Time)",
        WEEKDAYS[weekday],
        MONTHS[(month - 1) as usize],
        seconds / 3_600,
        (seconds % 3_600) / 60,
        seconds % 60,
    )
}

// 将 Unix 天数转换为 UTC 公历日期，避免为 Edge 协议额外引入日期依赖。
fn edge_civil_from_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let month_part = (5 * doy + 2) / 153;
    let day = doy - (153 * month_part + 2) / 5 + 1;
    let month = month_part + if month_part < 10 { 3 } else { -9 };
    let year = year + if month <= 2 { 1 } else { 0 };
    (year, month, day)
}

fn edge_days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let adjusted_year = year - if month <= 2 { 1 } else { 0 };
    let era = if adjusted_year >= 0 {
        adjusted_year
    } else {
        adjusted_year - 399
    } / 400;
    let year_of_era = adjusted_year - era * 400;
    let month_prime = month + if month > 2 { -3 } else { 9 };
    let day_of_year = (153 * month_prime + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

fn edge_parse_server_date(value: &str) -> Option<i64> {
    let parts = value.split_whitespace().collect::<Vec<_>>();
    if parts.len() < 6 {
        return None;
    }
    let day = parts[1].parse::<i64>().ok()?;
    let month = match parts[2] {
        "Jan" => 1,
        "Feb" => 2,
        "Mar" => 3,
        "Apr" => 4,
        "May" => 5,
        "Jun" => 6,
        "Jul" => 7,
        "Aug" => 8,
        "Sep" => 9,
        "Oct" => 10,
        "Nov" => 11,
        "Dec" => 12,
        _ => return None,
    };
    let year = parts[3].parse::<i64>().ok()?;
    let time = parts[4].split(':').collect::<Vec<_>>();
    if time.len() != 3 {
        return None;
    }
    let hour = time[0].parse::<i64>().ok()?;
    let minute = time[1].parse::<i64>().ok()?;
    let second = time[2].parse::<i64>().ok()?;
    if parts[5] != "GMT" || hour > 23 || minute > 59 || second > 59 {
        return None;
    }
    Some(edge_days_from_civil(year, month, day) * 86_400 + hour * 3_600 + minute * 60 + second)
}

fn edge_sec_ms_gec(clock_skew_seconds: i64) -> String {
    edge_gec::token_at(edge_unix_seconds(clock_skew_seconds), EDGE_TRUSTED_CLIENT_TOKEN)
}

fn edge_escape_xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn edge_signed(value: f64, unit: &str) -> String {
    let rounded = value.round();
    format!(
        "{}{rounded:.0}{unit}",
        if rounded >= 0.0 { "+" } else { "" }
    )
}

fn edge_voice_locale(voice_name: &str) -> &str {
    [
        "zh-CN-liaoning",
        "zh-CN-shaanxi",
        "zh-HK",
        "zh-TW",
        "zh-CN",
        "en-US",
        "en-GB",
        "ja-JP",
    ]
    .into_iter()
    .find(|locale| voice_name.starts_with(&format!("{locale}-")))
    .unwrap_or("zh-CN")
}

fn edge_speech_config(clock_skew_seconds: i64) -> String {
    let payload = serde_json::json!({
        "context": {
            "synthesis": {
                "audio": {
                    "metadataoptions": {
                        "sentenceBoundaryEnabled": "true",
                        "wordBoundaryEnabled": "false",
                    },
                    "outputFormat": EDGE_OUTPUT_FORMAT,
                },
                "language": { "autoDetection": false },
            },
        },
    });
    format!(
        "X-Timestamp:{}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{}\r\n",
        edge_date_string(clock_skew_seconds),
        payload
    )
}

fn edge_ssml(
    text: &str,
    voice_name: &str,
    rate: f64,
    pitch: f64,
    volume: f64,
    request_id: &str,
    clock_skew_seconds: i64,
) -> String {
    let locale = edge_voice_locale(voice_name);
    format!(
        "X-RequestId:{request_id}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:{}Z\r\nPath:ssml\r\n\r\n<speak version=\"1.0\" xmlns=\"http://www.w3.org/2001/10/synthesis\" xml:lang=\"{locale}\"><voice name=\"{}\"><prosody rate=\"{}\" pitch=\"{}\" volume=\"{:.0}%\">{}</prosody></voice></speak>",
        edge_date_string(clock_skew_seconds),
        edge_escape_xml(voice_name),
        edge_signed((rate - 1.0) * 100.0, "%"),
        edge_signed(pitch, "Hz"),
        volume.clamp(0.0, 1.0) * 100.0,
        edge_escape_xml(text),
    )
}

enum EdgeSpeechAttemptError {
    Handshake(tungstenite::Error),
    Operation(String),
}

fn edge_text_message_detail(message: &str) -> Option<(&str, &str)> {
    let (headers, body) = message.split_once("\r\n\r\n")?;
    let path = headers
        .lines()
        .find_map(|line| line.strip_prefix("Path:"))?
        .trim();
    Some((path, body.trim()))
}

fn edge_compact_detail(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(240)
        .collect()
}

fn edge_clock_skew_seconds(error: &EdgeSpeechAttemptError, local_unix_seconds: i64) -> Option<i64> {
    let EdgeSpeechAttemptError::Handshake(tungstenite::Error::Http(response)) = error else {
        return None;
    };
    if response.status().as_u16() != 403 {
        return None;
    }
    let server_date = response.headers().get("Date")?.to_str().ok()?;
    Some(edge_parse_server_date(server_date)? - local_unix_seconds)
}

fn edge_format_attempt_error(error: &EdgeSpeechAttemptError) -> String {
    match error {
        EdgeSpeechAttemptError::Operation(message) => message.clone(),
        EdgeSpeechAttemptError::Handshake(tungstenite::Error::Http(response)) => {
            let status = response.status().as_u16();
            let detail = response
                .body()
                .as_ref()
                .map(|body| edge_compact_detail(&String::from_utf8_lossy(body)))
                .unwrap_or_default();
            if detail.is_empty() {
                format!("Edge 在线语音请求被拒绝（HTTP {status}）")
            } else {
                format!("Edge 在线语音请求被拒绝（HTTP {status}）：{detail}")
            }
        }
        EdgeSpeechAttemptError::Handshake(error) => format!("Edge 在线语音连接失败：{error}"),
    }
}

fn edge_audio_payload(data: &[u8]) -> Option<&[u8]> {
    if data.len() < 2 {
        return Some(data);
    }
    let header_length = usize::from(u16::from_be_bytes([data[0], data[1]]));
    let payload_start = header_length + 2;
    if header_length == 0 || payload_start > data.len() {
        return Some(data);
    }
    let header = String::from_utf8_lossy(&data[2..payload_start]);
    if header.to_ascii_lowercase().contains("path:audio") {
        Some(&data[payload_start..])
    } else {
        None
    }
}

#[cfg(test)]
mod edge_speech_tests {
    use super::*;

    #[test]
    #[ignore = "requests the live Edge service; decodes a fixed public sentence without playback"]
    fn edge_live_synthesis_decodes_mp3_without_playback() {
        let audio = synthesize_edge_speech_impl(
            "语音连接测试。".into(),
            "zh-CN-XiaoxiaoNeural".into(),
            1.0,
            0.0,
            1.0,
        ).expect("Edge synthesis returns audio");
        let bytes = audio.len();
        let decoder = rodio::Decoder::try_from(Cursor::new(audio)).expect("valid MP3");
        assert_eq!(decoder.sample_rate().get(), 24_000);
        assert_eq!(decoder.channels().get(), 1);
        let samples: Vec<f32> = decoder.collect();
        assert!(!samples.is_empty(), "MP3 must contain decodable audio samples");
        assert!(samples.iter().any(|sample| sample.abs() > 0.0001), "audio must not be silent");
        eprintln!("Edge MP3 decoded: {bytes} bytes, {} samples, 24000 Hz, mono", samples.len());
    }

    #[test]
    fn edge_403_uses_server_date_for_one_retry() {
        let response = tungstenite::http::Response::builder()
            .status(403)
            .header("Date", "Tue, 08 Sep 2026 17:44:42 GMT")
            .body(Some(b"<html>blocked</html>".to_vec()))
            .expect("valid response");
        let error = EdgeSpeechAttemptError::Handshake(tungstenite::Error::Http(Box::new(response)));

        assert_eq!(edge_clock_skew_seconds(&error, 1_788_889_482), Some(0));
        assert!(edge_format_attempt_error(&error).contains("HTTP 403"));
        assert!(edge_format_attempt_error(&error).contains("blocked"));
    }

    #[test]
    fn edge_server_response_is_preserved_when_audio_is_empty() {
        assert_eq!(
            edge_text_message_detail("Path:response\r\n\r\n{\"statusCode\":403}"),
            Some(("response", "{\"statusCode\":403}")),
        );
    }

    #[test]
    fn audio_device_name_prefers_full_interface_name_without_duplicate_prefix() {
        assert_eq!(
            format_audio_device_name("扬声器", Some("扬声器 (Realtek(R) Audio)")),
            "扬声器 (Realtek(R) Audio)"
        );
        assert_eq!(
            format_audio_device_name("扬声器", Some("Realtek(R) Audio")),
            "扬声器 (Realtek(R) Audio)"
        );
        assert_eq!(format_audio_device_name("Yeti Nano", None), "Yeti Nano");
    }
}

#[cfg(test)]
mod archive_export_tests {
    use super::*;

    #[test]
    fn binary_archive_export_writer_round_trips_bytes() {
        let path = std::env::temp_dir().join(format!("danmu-archive-export-{}.bin", std::process::id()));
        let bytes = vec![0_u8, 1, 127, 128, 255];
        let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
        write_archive_export_bytes(path.to_string_lossy().into_owned(), encoded).expect("write bytes");
        assert_eq!(std::fs::read(&path).expect("read bytes"), bytes);
        std::fs::remove_file(path).expect("remove test file");
    }
}

#[cfg(test)]
mod external_tts_tests {
    use super::*;
    use std::num::NonZero;

    #[test]
    fn fish_audio_gateway_payload_uses_local_token_and_reference_voice() {
        let config = FishAudioConfig {
            api_key: "secret".to_string(),
            base_url: "https://api.fish.audio".to_string(),
            model: "s2.1-pro-free".to_string(),
            reference_id: "voice-id".to_string(),
            format: "mp3".to_string(),
        };

        let (endpoint, payload) =
            build_fish_audio_gateway_request("欢迎", "voice-id", 1.2, 0.8, &config);

        assert_eq!(endpoint, FISH_AUDIO_GATEWAY_TTS_ENDPOINT);
        assert_eq!(payload["token"], "secret");
        assert_eq!(payload["text"], "欢迎");
        assert_eq!(payload["voice"], "voice-id");
        assert_eq!(payload["model"], "s2.1-pro-free");
        assert_eq!(payload["format"], "mp3");
        assert_eq!(payload["prosody"]["speed"], 1.2);
        assert_eq!(payload["prosody"]["volume"], -1.9);
        assert_eq!(payload["prosody"]["normalize_loudness"], true);
        assert_eq!(payload["normalize"], true);
        assert_eq!(payload["latency"], "normal");
        assert_eq!(payload["chunk_length"], 300);
    }

    #[test]
    fn fish_audio_uses_gateway_for_the_default_direct_api_address_only() {
        assert!(uses_fish_audio_gateway(FISH_AUDIO_DIRECT_BASE_URL));
        assert!(uses_fish_audio_gateway("https://api.fish.audio/"));
        assert!(!uses_fish_audio_gateway("https://api.example.com"));
    }

    #[test]
    fn fish_audio_gateway_uses_the_directly_reachable_pages_endpoint() {
        assert_eq!(
            FISH_AUDIO_GATEWAY_TTS_ENDPOINT,
            "https://danmu-fish-audio-gateway-pages.pages.dev/laplace/tts-fishaudio"
        );
    }

    #[test]
    fn built_in_fish_audio_gateway_uses_direct_request_route() {
        let endpoint = external_endpoint(FISH_AUDIO_GATEWAY_TTS_ENDPOINT).unwrap();

        assert_eq!(
            external_request_route(&endpoint),
            ExternalRequestRoute::Direct
        );
    }

    #[test]
    fn non_gateway_external_request_keeps_system_proxy_route() {
        let endpoint = external_endpoint("https://api.example.com/v1/tts").unwrap();

        assert_eq!(
            external_request_route(&endpoint),
            ExternalRequestRoute::SystemProxy
        );
    }

    #[test]
    fn external_error_detail_includes_the_underlying_network_cause() {
        let error = std::io::Error::new(std::io::ErrorKind::ConnectionReset, "连接被对端重置");

        assert_eq!(format_external_error(&error), "连接被对端重置");
    }

    #[test]
    fn fish_audio_gateway_headers_include_request_id_without_auth_token() {
        let headers = build_fish_audio_gateway_headers("tts-test-1");

        assert_eq!(
            headers.get("Content-Type"),
            Some(&"application/json".to_string())
        );
        assert_eq!(
            headers.get("X-Danmu-Request-Id"),
            Some(&"tts-test-1".to_string())
        );
        assert!(!headers.contains_key("Authorization"));
    }

    #[test]
    fn fish_audio_payload_maps_text_voice_speed_and_volume() {
        let config = FishAudioConfig {
            api_key: "secret".to_string(),
            base_url: "https://api.fish.audio".to_string(),
            model: "s2.1-pro-free".to_string(),
            reference_id: "voice-id".to_string(),
            format: "mp3".to_string(),
        };
        let payload = build_fish_audio_payload("欢迎", "voice-id", 1.2, 0.8, &config);

        assert_eq!(payload["text"], "欢迎");
        assert_eq!(payload["reference_id"], "voice-id");
        assert_eq!(payload["prosody"]["speed"], 1.2);
        assert_eq!(payload["prosody"]["volume"], -1.9);
        assert_eq!(payload["format"], "mp3");
    }

    #[test]
    fn custom_json_payload_supports_nested_fields_and_preserves_fixed_body() {
        let config = CustomHttpConfig {
            endpoint: "http://127.0.0.1:9880/tts".to_string(),
            method: "POST".to_string(),
            auth_type: "none".to_string(),
            api_key: String::new(),
            api_key_header: "X-API-Key".to_string(),
            text_field: "input.text".to_string(),
            voice_field: "voice.name".to_string(),
            model_field: "model".to_string(),
            model: "tts-1".to_string(),
            rate_field: "audioConfig.speakingRate".to_string(),
            pitch_field: String::new(),
            volume_field: String::new(),
            audio_field: "data.audio".to_string(),
            response_format: "json-base64".to_string(),
            fixed_body: serde_json::json!({ "input": { "language": "zh" }, "audioConfig": { "format": "wav" } }),
            extra_headers: HashMap::new(),
        };

        let payload = build_custom_http_payload("欢迎", "小明", 1.1, 0.0, 1.0, &config).unwrap();

        assert_eq!(payload["input"]["text"], "欢迎");
        assert_eq!(payload["input"]["language"], "zh");
        assert_eq!(payload["voice"]["name"], "小明");
        assert_eq!(payload["audioConfig"]["speakingRate"], 1.1);
        assert_eq!(payload["audioConfig"]["format"], "wav");
        assert!(payload.get("pitch").is_none());
    }

    #[test]
    fn custom_json_base64_response_is_decoded_without_logging_contents() {
        let response = serde_json::json!({ "audio": "AQID" });

        assert_eq!(
            decode_external_audio("json-base64", &response.to_string(), "audio").unwrap(),
            vec![1, 2, 3]
        );
    }

    #[test]
    fn custom_json_base64_response_supports_nested_audio_field() {
        let response = serde_json::json!({ "result": { "audioContent": "AQID" } });

        assert_eq!(
            decode_external_audio("json-base64", &response.to_string(), "result.audioContent")
                .unwrap(),
            vec![1, 2, 3]
        );
    }

    #[test]
    fn fish_audio_model_response_maps_id_title_author_and_languages() {
        let response = serde_json::json!({
            "_id": "voice-id",
            "title": "中文女声",
            "author": { "nickname": "作者" },
            "languages": ["zh", "en"]
        });
        let model = parse_fish_audio_model_response(response.to_string().as_bytes()).unwrap();
        assert_eq!(model.id, "voice-id");
        assert_eq!(model.name, "中文女声");
        assert_eq!(model.author.as_deref(), Some("作者"));
        assert_eq!(model.languages, vec!["zh", "en"]);
    }

    #[test]
    fn playback_gain_changes_decoded_samples_without_changing_duration() {
        fn render(samples: &[f32], gain: f32) -> Vec<f32> {
            let source = rodio::buffer::SamplesBuffer::new(
                NonZero::new(1).unwrap(),
                NonZero::new(48_000).unwrap(),
                samples.to_vec(),
            );
            if gain > 1.0 {
                let channels = source.channels();
                let sample_rate = source.sample_rate();
                let samples = source
                    .amplify(gain)
                    .limit(rodio::source::LimitSettings::broadcast())
                    .collect::<Vec<_>>()
                    .into_iter()
                    .map(|sample| sample.clamp(-1.0, 1.0))
                    .collect::<Vec<_>>();
                rodio::buffer::SamplesBuffer::new(channels, sample_rate, samples).collect()
            } else {
                source.collect()
            }
        }

        let source: Vec<f32> = (0..4_800)
            .map(|index| ((index as f32 * 440.0 * std::f32::consts::TAU) / 48_000.0).sin() * 0.4)
            .collect();
        let original = render(&source, 1.0);
        let boosted = render(&source, 1.5);
        let hot_source: Vec<f32> = (0..4_800)
            .map(|index| ((index as f32 * 440.0 * std::f32::consts::TAU) / 48_000.0).sin() * 0.95)
            .collect();
        let hot_original = render(&hot_source, 1.0);
        let hot_boosted = render(&hot_source, 1.5);
        let rms = |samples: &[f32]| {
            (samples.iter().map(|sample| sample * sample).sum::<f32>() / samples.len() as f32)
                .sqrt()
        };

        assert_eq!(original.len(), source.len());
        assert_eq!(boosted.len(), source.len());
        assert!(original
            .iter()
            .zip(&source)
            .all(|(actual, expected)| (actual - expected).abs() < 0.000001));
        assert!(boosted
            .iter()
            .zip(&source)
            .all(|(actual, expected)| (actual - expected * 1.5).abs() < 0.000001));
        assert!(original
            .iter()
            .zip(&boosted)
            .any(|(left, right)| (left - right).abs() > 0.000001));
        assert!((rms(&boosted) / rms(&original) - 1.5).abs() < 0.0001);
        assert_eq!(hot_original.len(), hot_source.len());
        assert_eq!(hot_boosted.len(), hot_source.len());
        assert!(hot_original
            .iter()
            .zip(&hot_boosted)
            .any(|(left, right)| (left - right).abs() > 0.000001));
    }
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn is_background_start() -> bool {
    std::env::args().any(|arg| arg == "--background")
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct WindowDiagnosticCloseState {
    window_label: String,
    instance_id: String,
    complete: bool,
    dropped_records: u64,
}

#[derive(Default)]
struct WindowDiagnosticCloseStates(Mutex<HashMap<String, WindowDiagnosticCloseState>>);

impl WindowDiagnosticCloseStates {
    fn mark_preparing(&self, label: &str) {
        let instance_id = format!("close-preparation-{label}");
        self.0.lock().unwrap().insert(instance_id.clone(), WindowDiagnosticCloseState {
            window_label: label.into(), instance_id, complete: false, dropped_records: 0,
        });
    }

    fn set(&self, state: WindowDiagnosticCloseState) {
        let mut entries = self.0.lock().unwrap();
        if let Some(preparing) = entries.get_mut(&format!("close-preparation-{}", state.window_label)) {
            preparing.complete = state.complete;
        }
        entries.insert(state.instance_id.clone(), state);
    }

    fn read(&self) -> Vec<WindowDiagnosticCloseState> {
        self.0.lock().unwrap().values().cloned().collect()
    }
}

#[tauri::command]
fn set_window_diagnostic_close_state(state: WindowDiagnosticCloseState, storage: tauri::State<WindowDiagnosticCloseStates>) {
    storage.set(state);
}

#[tauri::command]
fn read_window_diagnostic_close_states(storage: tauri::State<WindowDiagnosticCloseStates>) -> Vec<WindowDiagnosticCloseState> {
    storage.read()
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct FloatingWindowsCloseResult {
    complete: bool,
    incomplete_windows: Vec<String>,
}

async fn wait_for_floating_windows_close(
    labels: &[String], is_closed: impl Fn(&str) -> bool, changed: &Notify, timeout: Duration,
) -> FloatingWindowsCloseResult {
    let _ = tokio::time::timeout(timeout, async {
        loop {
            let notified = changed.notified();
            if labels.iter().all(|label| is_closed(label)) { break; }
            notified.await;
        }
    }).await;
    let incomplete_windows: Vec<_> = labels.iter().filter(|label| !is_closed(label)).cloned().collect();
    FloatingWindowsCloseResult { complete: incomplete_windows.is_empty(), incomplete_windows }
}

#[tauri::command]
async fn prepare_floating_windows_close(app: tauri::AppHandle) -> FloatingWindowsCloseResult {
    let windows: Vec<_> = FLOATING_WINDOW_LABELS.iter().filter_map(|label| app.get_webview_window(label)).collect();
    let labels: Vec<_> = windows.iter().map(|window| window.label().to_string()).collect();
    let destroyed = Arc::new(Mutex::new(HashSet::<String>::new()));
    let changed = Arc::new(Notify::new());
    for window in &windows {
        app.state::<WindowDiagnosticCloseStates>().mark_preparing(window.label());
        let destroyed = destroyed.clone();
        let changed = changed.clone();
        let label = window.label().to_string();
        window.on_window_event(move |event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                destroyed.lock().unwrap().insert(label.clone());
                changed.notify_one();
            }
        });
        let _ = window.close();
    }
    wait_for_floating_windows_close(&labels,
        |label| destroyed.lock().unwrap().contains(label) || app.get_webview_window(label).is_none(),
        &changed, Duration::from_secs(3)).await
}

#[derive(Default)]
struct AppQuitState {
    requested: AtomicBool,
    preparing: AtomicBool,
    finished: AtomicBool,
    accepted: Notify,
}

impl AppQuitState {
    fn request(&self) -> bool {
        !self.requested.swap(true, Ordering::AcqRel)
    }

    fn begin(&self) {
        self.preparing.store(true, Ordering::Release);
        self.accepted.notify_one();
    }

    fn can_finish(&self) -> bool {
        self.preparing.load(Ordering::Acquire)
    }

    async fn wait_for_frontend(&self, timeout: Duration) -> bool {
        tokio::time::timeout(timeout, async {
            let accepted = self.accepted.notified();
            if !self.can_finish() { accepted.await; }
        }).await.is_ok()
    }
}

fn finish_app_quit_with(state: &AppQuitState, stop_audio: impl FnOnce(), close_windows: impl FnOnce(), exit: impl FnOnce()) {
    if state.finished.swap(true, Ordering::AcqRel) { return; }
    stop_audio();
    close_windows();
    exit();
}

fn close_floating_windows_with(mut close: impl FnMut(&'static str)) {
    for label in FLOATING_WINDOW_LABELS { close(label); }
}

#[tauri::command]
fn begin_app_quit(state: tauri::State<AppQuitState>) {
    state.begin();
}

fn finish_app_quit(app: &tauri::AppHandle) {
    let state = app.state::<AppQuitState>();
    finish_app_quit_with(&state, || {
        let audio = app.state::<AudioOutputState>();
        stop_audio(app, &audio.tts, "tts-audio-finished");
        stop_audio(app, &audio.personal, "personal-audio-finished");
        stop_audio(app, &audio.personal_preview, "personal-preview-audio-finished");
    }, || close_floating_windows(app), || app.exit(0));
}

fn request_app_quit(app: &tauri::AppHandle) {
    if !app.state::<AppQuitState>().request() { return; }
    let _ = app.emit_to("main", "app:prepare-quit", ());
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if !app.state::<AppQuitState>().wait_for_frontend(Duration::from_secs(3)).await {
            let t = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis();
            let record = serde_json::json!({ "t": t, "kind": "app", "subsystem": "app", "action": "shutdown", "outcome": "frontend-unavailable" });
            let _ = diagnostics::append_log_sync(&app, "app-quit.ndjson", &format!("{record}\n"));
            finish_app_quit(&app);
        }
    });
}

#[cfg(test)]
mod application_quit_tests {
    use super::*;
    use std::cell::RefCell;

    #[test]
    fn independent_close_state_retains_failures_across_closed_and_reopened_windows() {
        let states = WindowDiagnosticCloseStates::default();
        states.set(WindowDiagnosticCloseState { window_label: "display".into(), instance_id: "display-old".into(), complete: false, dropped_records: 1 });
        states.set(WindowDiagnosticCloseState { window_label: "display".into(), instance_id: "display-new".into(), complete: true, dropped_records: 0 });
        let saved = states.read();
        assert_eq!(saved.len(), 2);
        let failed = saved.iter().find(|state| state.instance_id == "display-old").unwrap();
        assert!(!failed.complete); assert_eq!(failed.dropped_records, 1);
        assert_eq!(serde_json::to_value(failed).unwrap()["windowLabel"], "display");
        states.set(WindowDiagnosticCloseState { window_label: "gift".into(), instance_id: "gift-pending".into(), complete: false, dropped_records: 0 });
        assert!(states.read().iter().any(|state| state.instance_id == "gift-pending" && !state.complete));
    }

    #[test]
    fn requested_close_without_frontend_confirmation_retains_incomplete_state() {
        let states = WindowDiagnosticCloseStates::default();
        states.mark_preparing("display"); states.mark_preparing("gift");
        assert_eq!(states.read().iter().filter(|state| !state.complete).count(), 2);
        states.set(WindowDiagnosticCloseState { window_label: "display".into(), instance_id: "display-instance".into(), complete: true, dropped_records: 0 });
        assert!(states.read().iter().filter(|state| state.window_label == "display").all(|state| state.complete));
        assert!(states.read().iter().any(|state| state.window_label == "gift" && !state.complete));
    }

    #[test]
    fn close_preparation_waits_for_actual_destruction_before_final_flush_and_exit() {
        let runtime = tokio::runtime::Builder::new_current_thread().enable_time().build().unwrap();
        runtime.block_on(async {
            let labels = vec!["display".to_string(), "gift".to_string()];
            let closed = RefCell::new(HashSet::<String>::new());
            let calls = RefCell::new(Vec::new());
            let notify = Notify::new();
            let preparing = wait_for_floating_windows_close(&labels, |label| closed.borrow().contains(label), &notify, Duration::from_secs(3));
            let callbacks = async {
                tokio::task::yield_now().await;
                for label in &labels {
                    calls.borrow_mut().push(format!("save:{label}"));
                    calls.borrow_mut().push(format!("confirmed:{label}"));
                    closed.borrow_mut().insert(label.clone());
                    notify.notify_one();
                }
            };
            let (result, _) = tokio::join!(preparing, callbacks);
            assert!(result.complete); assert!(result.incomplete_windows.is_empty());
            calls.borrow_mut().push("flush".into());
            let state = AppQuitState::default(); state.begin();
            finish_app_quit_with(&state, || calls.borrow_mut().push("audio".into()),
                || calls.borrow_mut().push("destroy-remaining".into()), || calls.borrow_mut().push("exit".into()));
            assert_eq!(*calls.borrow(), vec!["save:display", "confirmed:display", "save:gift", "confirmed:gift", "flush", "audio", "destroy-remaining", "exit"]);
        });
    }

    #[test]
    fn close_preparation_unopened_windows_never_wait_and_timeout_is_incomplete() {
        let runtime = tokio::runtime::Builder::new_current_thread().enable_time().build().unwrap();
        runtime.block_on(async {
            let notify = Notify::new();
            let unopened = wait_for_floating_windows_close(&[], |_| false, &notify, Duration::ZERO).await;
            assert!(unopened.complete);
            let labels = vec!["display".into(), "gift".into()];
            let timed_out = wait_for_floating_windows_close(&labels, |label| label == "display", &notify, Duration::ZERO).await;
            assert!(!timed_out.complete); assert_eq!(timed_out.incomplete_windows, vec!["gift"]);
        });
    }

    #[test]
    fn final_exit_requires_preparation_and_runs_once_after_audio_and_windows() {
        let state = AppQuitState::default();
        let calls = RefCell::new(Vec::new());
        assert!(!state.can_finish());
        state.begin();
        assert!(state.can_finish());
        let complete = || finish_app_quit_with(&state,
            || calls.borrow_mut().push("audio"),
            || close_floating_windows_with(|label| calls.borrow_mut().push(label)),
            || calls.borrow_mut().push("exit"));
        complete(); complete();
        assert_eq!(*calls.borrow(), vec!["audio", "display", "gift", "gift-only", "superchat", "guard", "exit"]);
    }

    #[test]
    fn tray_request_is_deduplicated_and_waits_for_frontend_acceptance() {
        let state = AppQuitState::default();
        assert!(state.request());
        assert!(!state.request());
        assert!(!state.can_finish());
        let runtime = tokio::runtime::Builder::new_current_thread().enable_time().build().unwrap();
        runtime.block_on(async {
            let preparing = state.wait_for_frontend(Duration::from_secs(3));
            let accepted = async { tokio::task::yield_now().await; state.begin(); };
            let (result, _) = tokio::join!(preparing, accepted);
            assert!(result);
        });
    }

    #[test]
    fn unavailable_frontend_times_out_without_claiming_preparation() {
        let state = AppQuitState::default();
        assert!(state.request());
        let runtime = tokio::runtime::Builder::new_current_thread().enable_time().build().unwrap();
        assert!(!runtime.block_on(state.wait_for_frontend(Duration::ZERO)));
        assert!(!state.can_finish());
        let calls = RefCell::new(Vec::new());
        finish_app_quit_with(&state, || calls.borrow_mut().push("audio"),
            || calls.borrow_mut().push("windows"), || calls.borrow_mut().push("exit"));
        assert_eq!(*calls.borrow(), vec!["audio", "windows", "exit"]);
    }
}

fn close_floating_windows(app: &tauri::AppHandle) {
    close_floating_windows_with(|label| {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.destroy();
        }
    });
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle, state: tauri::State<AppQuitState>) -> Result<(), String> {
    if !state.can_finish() { return Err("应用尚未准备退出".to_string()); }
    finish_app_quit(&app);
    Ok(())
}

#[tauri::command]
fn read_archive_transfer(path: String) -> Result<String, String> {
    let path = path.trim();
    if path.is_empty() {
        return Err("archive transfer path is empty".to_string());
    }
    std::fs::read_to_string(path).map_err(|error| format!("read archive transfer: {error}"))
}

#[tauri::command]
fn write_archive_transfer(path: String, contents: String) -> Result<(), String> {
    let path = path.trim();
    if path.is_empty() {
        return Err("archive transfer path is empty".to_string());
    }
    std::fs::write(path, contents.as_bytes())
        .map_err(|error| format!("write archive transfer: {error}"))
}

#[tauri::command]
fn write_archive_export_bytes(path: String, contents_base64: String) -> Result<(), String> {
    let path = path.trim();
    if path.is_empty() {
        return Err("archive export path is empty".to_string());
    }
    let bytes = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        contents_base64.as_bytes(),
    ).map_err(|error| format!("decode archive export: {error}"))?;
    std::fs::write(path, bytes).map_err(|error| format!("write archive export: {error}"))
}

fn stop_audio(app: &tauri::AppHandle, channel: &AudioPlaybackChannel, finished_event: &str) {
    if let Ok(mut active) = channel.active.lock() {
        if active.take().is_some() {
            let _ = app.emit(finished_event, ());
        }
    }
}

pub fn resolve_audio_device_ids(target: &AudioOutputTarget) -> Vec<Option<String>> {
    let candidates = match target.scope.as_str() {
        "host" => vec![target.monitor_device_id.clone()],
        "audience" => vec![target.stream_device_id.clone()],
        "both" => vec![
            target.monitor_device_id.clone(),
            target.stream_device_id.clone(),
        ],
        _ => vec![target.monitor_device_id.clone()],
    };
    let mut seen = HashSet::new();
    candidates
        .into_iter()
        .filter(|id| seen.insert(id.clone().unwrap_or_else(|| "__default__".to_string())))
        .collect()
}

fn selected_device_ids(target: &AudioOutputTarget) -> Vec<Option<String>> {
    resolve_audio_device_ids(target)
}

fn output_device(id: Option<&str>) -> Result<rodio::Device, String> {
    let host = rodio::cpal::default_host();
    if let Some(expected) = id {
        let parsed = expected
            .parse::<rodio::cpal::DeviceId>()
            .map_err(|error| format!("音频设备 ID 无效: {error}"))?;
        return host
            .device_by_id(&parsed)
            .ok_or_else(|| format!("找不到音频设备: {expected}"));
    }
    host.default_output_device()
        .ok_or_else(|| "没有可用的默认音频输出设备".to_string())
}

fn format_audio_device_name(name: &str, interface_name: Option<&str>) -> String {
    let name = name.trim();
    let Some(interface_name) = interface_name
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return name.to_string();
    };

    if interface_name == name || interface_name.starts_with(&format!("{name} (")) {
        interface_name.to_string()
    } else {
        format!("{name} ({interface_name})")
    }
}

#[tauri::command]
fn list_audio_output_devices() -> Result<Vec<AudioOutputDevice>, String> {
    let host = rodio::cpal::default_host();
    let default_id = host
        .default_output_device()
        .and_then(|device| device.id().ok())
        .map(|id| id.to_string());
    let devices = host
        .output_devices()
        .map_err(|error| format!("读取音频设备失败: {error}"))?
        .filter_map(|device| {
            let id = device.id().ok()?.to_string();
            let description = device.description().ok()?;
            let name = format_audio_device_name(description.name(), description.driver());
            Some(AudioOutputDevice {
                is_default: default_id.as_deref() == Some(id.as_str()),
                id,
                name,
            })
        })
        .collect::<Vec<_>>();
    Ok(devices)
}

#[tauri::command]
fn play_tts_audio(
    app: tauri::AppHandle,
    audio: Vec<u8>,
    target: AudioOutputTarget,
    playback_gain: f64,
    state: tauri::State<AudioOutputState>,
) -> Result<(), String> {
    if audio.is_empty() {
        return Err("没有可播放的语音数据".to_string());
    }
    start_audio_playback(
        app,
        audio,
        target,
        playback_gain,
        &state.tts,
        "tts-audio-finished",
        "解析语音音频失败",
    )
}

fn append_decoded_audio(
    player: &rodio::Player,
    audio: Vec<u8>,
    playback_gain: f32,
    decode_error: &str,
) -> Result<(), String> {
    let source = rodio::Decoder::try_from(Cursor::new(audio))
        .map_err(|error| format!("{decode_error}: {error}"))?;
    if playback_gain > 1.0 {
        let channels = source.channels();
        let sample_rate = source.sample_rate();
        let samples = source
            .amplify(playback_gain)
            .limit(rodio::source::LimitSettings::broadcast())
            .collect::<Vec<_>>()
            .into_iter()
            .map(|sample| sample.clamp(-1.0, 1.0))
            .collect::<Vec<_>>();
        player.append(rodio::buffer::SamplesBuffer::new(
            channels,
            sample_rate,
            samples,
        ));
    } else {
        player.append(source);
    }
    Ok(())
}

fn start_audio_playback(
    app: tauri::AppHandle,
    audio: Vec<u8>,
    target: AudioOutputTarget,
    playback_gain: f64,
    channel: &AudioPlaybackChannel,
    finished_event: &'static str,
    decode_error: &str,
) -> Result<(), String> {
    let playback_gain = playback_gain.clamp(1.0, 2.0) as f32;
    let mut streams = Vec::new();
    let mut players = Vec::new();
    for device_id in selected_device_ids(&target) {
        let device = output_device(device_id.as_deref())?;
        let mut stream = rodio::DeviceSinkBuilder::from_device(device)
            .map_err(|error| format!("打开音频设备失败: {error}"))?
            .open_stream()
            .map_err(|error| format!("创建音频输出失败: {error}"))?;
        stream.log_on_drop(false);
        let player = rodio::Player::connect_new(stream.mixer());
        append_decoded_audio(&player, audio.clone(), playback_gain, decode_error)?;
        streams.push(stream);
        players.push(player);
    }
    let playback_id = channel.generation.fetch_add(1, Ordering::Relaxed) + 1;
    let active = Arc::clone(&channel.active);
    {
        let mut current = active.lock().map_err(|_| "音频状态锁定失败".to_string())?;
        *current = Some(ActiveAudioPlayback {
            id: playback_id,
            _streams: streams,
            players,
        });
    }
    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(40));
        let finished = match active.lock() {
            Ok(current) => match current.as_ref() {
                Some(playback) if playback.id == playback_id => {
                    playback.players.iter().all(rodio::Player::empty)
                }
                _ => true,
            },
            Err(_) => true,
        };
        if !finished {
            continue;
        }
        let should_emit = match active.lock() {
            Ok(mut current) => {
                current
                    .as_ref()
                    .is_some_and(|playback| playback.id == playback_id)
                    && current.take().is_some()
            }
            Err(_) => false,
        };
        if should_emit {
            let _ = app.emit(finished_event, ());
        }
        break;
    });
    Ok(())
}

fn load_personal_audio(path: &str) -> Result<Vec<u8>, String> {
    if path.is_empty() {
        return Err("本地音频文件路径不能为空".to_string());
    }
    let audio = std::fs::read(path).map_err(|error| format!("读取本地音频文件失败: {error}"))?;
    if audio.is_empty() {
        return Err("本地音频文件为空".to_string());
    }
    Ok(audio)
}

fn validate_personal_audio(audio: &[u8]) -> Result<(), String> {
    rodio::Decoder::try_from(Cursor::new(audio.to_vec()))
        .map(|_| ())
        .map_err(|error| format!("解析本地音频文件失败: {error}"))
}

#[tauri::command]
fn prepare_personal_audio(path: String) -> Result<Vec<u8>, String> {
    let audio = load_personal_audio(path.trim())?;
    validate_personal_audio(&audio)?;
    Ok(audio)
}

#[tauri::command]
fn play_personal_audio(
    app: tauri::AppHandle,
    path: String,
    target: AudioOutputTarget,
    playback_gain: f64,
    prepared_audio: Option<Vec<u8>>,
    state: tauri::State<AudioOutputState>,
) -> Result<(), String> {
    let path = path.trim();
    if path.is_empty() {
        return Err("本地音频文件路径不能为空".to_string());
    }
    let audio = match prepared_audio {
        Some(audio) if !audio.is_empty() => audio,
        Some(_) => return Err("本地音频文件为空".to_string()),
        None => load_personal_audio(path)?,
    };
    start_audio_playback(
        app,
        audio,
        target,
        playback_gain,
        &state.personal,
        "personal-audio-finished",
        "解析本地音频文件失败",
    )
}

#[tauri::command]
fn play_personal_preview_audio(
    app: tauri::AppHandle,
    path: String,
    target: AudioOutputTarget,
    playback_gain: f64,
    prepared_audio: Option<Vec<u8>>,
    state: tauri::State<AudioOutputState>,
) -> Result<(), String> {
    let path = path.trim();
    if path.is_empty() {
        return Err("本地音频文件路径不能为空".to_string());
    }
    let audio = match prepared_audio {
        Some(audio) if !audio.is_empty() => audio,
        Some(_) => return Err("本地音频文件为空".to_string()),
        None => load_personal_audio(path)?,
    };
    start_audio_playback(
        app,
        audio,
        target,
        playback_gain,
        &state.personal_preview,
        "personal-preview-audio-finished",
        "解析本地音频文件失败",
    )
}

fn pause_audio(channel: &AudioPlaybackChannel) -> Result<(), String> {
    let active = channel
        .active
        .lock()
        .map_err(|_| "音频状态锁定失败".to_string())?;
    if let Some(playback) = active.as_ref() {
        for player in &playback.players {
            player.pause();
        }
    }
    Ok(())
}

#[tauri::command]
fn pause_tts_audio(state: tauri::State<AudioOutputState>) -> Result<(), String> {
    pause_audio(&state.tts)
}

#[tauri::command]
fn resume_tts_audio(state: tauri::State<AudioOutputState>) -> Result<(), String> {
    resume_audio(&state.tts)
}

fn resume_audio(channel: &AudioPlaybackChannel) -> Result<(), String> {
    let active = channel
        .active
        .lock()
        .map_err(|_| "音频状态锁定失败".to_string())?;
    if let Some(playback) = active.as_ref() {
        for player in &playback.players {
            player.play();
        }
    }
    Ok(())
}

#[tauri::command]
fn skip_tts_audio(
    app: tauri::AppHandle,
    state: tauri::State<AudioOutputState>,
) -> Result<(), String> {
    stop_audio(&app, &state.tts, "tts-audio-finished");
    Ok(())
}

#[tauri::command]
fn stop_tts_audio(
    app: tauri::AppHandle,
    state: tauri::State<AudioOutputState>,
) -> Result<(), String> {
    stop_audio(&app, &state.tts, "tts-audio-finished");
    Ok(())
}

#[tauri::command]
fn pause_personal_audio(state: tauri::State<AudioOutputState>) -> Result<(), String> {
    pause_audio(&state.personal)?;
    pause_audio(&state.personal_preview)
}

#[tauri::command]
fn resume_personal_audio(state: tauri::State<AudioOutputState>) -> Result<(), String> {
    resume_audio(&state.personal)?;
    resume_audio(&state.personal_preview)
}

#[tauri::command]
fn skip_personal_audio(
    app: tauri::AppHandle,
    state: tauri::State<AudioOutputState>,
) -> Result<(), String> {
    stop_audio(&app, &state.personal, "personal-audio-finished");
    Ok(())
}

#[tauri::command]
fn stop_personal_audio(
    app: tauri::AppHandle,
    state: tauri::State<AudioOutputState>,
) -> Result<(), String> {
    stop_audio(&app, &state.personal, "personal-audio-finished");
    stop_audio(
        &app,
        &state.personal_preview,
        "personal-preview-audio-finished",
    );
    Ok(())
}

#[tauri::command]
fn skip_personal_preview_audio(
    app: tauri::AppHandle,
    state: tauri::State<AudioOutputState>,
) -> Result<(), String> {
    stop_audio(
        &app,
        &state.personal_preview,
        "personal-preview-audio-finished",
    );
    Ok(())
}

fn synthesize_edge_speech_once(
    text: &str,
    voice_name: &str,
    rate: f64,
    pitch: f64,
    volume: f64,
    clock_skew_seconds: i64,
) -> Result<Vec<u8>, EdgeSpeechAttemptError> {
    use tungstenite::Message;

    let request_id = edge_connection_id();
    let sec_ms_gec = edge_sec_ms_gec(clock_skew_seconds);
    let socket_url = format!(
        "{EDGE_SOCKET_ENDPOINT}?TrustedClientToken={EDGE_TRUSTED_CLIENT_TOKEN}&ConnectionId={request_id}&Sec-MS-GEC={sec_ms_gec}&Sec-MS-GEC-Version=2-143.0.3650.75"
    );
    let uri = socket_url
        .parse::<tungstenite::http::Uri>()
        .map_err(|error| {
            EdgeSpeechAttemptError::Operation(format!("创建 Edge 在线语音请求失败: {error}"))
        })?;
    let muid = edge_connection_id().to_uppercase();
    let request = tungstenite::http::Request::builder()
        .method("GET")
        .uri(uri)
        .header("Host", "speech.platform.bing.com")
        .header("Connection", "Upgrade")
        .header("Upgrade", "websocket")
        .header("Sec-WebSocket-Version", "13")
        .header(
            "Sec-WebSocket-Key",
            tungstenite::handshake::client::generate_key(),
        )
        .header("Pragma", "no-cache")
        .header("Cache-Control", "no-cache")
        .header("Origin", EDGE_ORIGIN)
        .header("User-Agent", EDGE_USER_AGENT)
        .header("Accept-Language", "en-US,en;q=0.9")
        .header("Accept-Encoding", "gzip, deflate, br, zstd")
        .header("Cookie", format!("muid={muid};"))
        .body(())
        .map_err(|error| {
            EdgeSpeechAttemptError::Operation(format!("创建 Edge 在线语音请求失败: {error}"))
        })?;

    let (mut socket, _) =
        tungstenite::connect(request).map_err(EdgeSpeechAttemptError::Handshake)?;
    socket
        .send(Message::text(edge_speech_config(clock_skew_seconds)))
        .map_err(|error| {
            EdgeSpeechAttemptError::Operation(format!("发送 Edge 语音配置失败: {error}"))
        })?;
    socket
        .send(Message::text(edge_ssml(
            text,
            voice_name,
            rate,
            pitch,
            volume,
            &request_id,
            clock_skew_seconds,
        )))
        .map_err(|error| {
            EdgeSpeechAttemptError::Operation(format!("发送 Edge 语音内容失败: {error}"))
        })?;

    let mut audio = Vec::new();
    let mut response_details = Vec::new();
    loop {
        match socket.read().map_err(|error| {
            EdgeSpeechAttemptError::Operation(format!("读取 Edge 在线语音失败: {error}"))
        })? {
            Message::Text(message) => {
                if let Some((path, body)) = edge_text_message_detail(message.as_str()) {
                    match path {
                        "turn.end" => break,
                        "turn.start" | "audio.metadata" => {}
                        _ if !body.is_empty() => {
                            response_details.push(format!("Path:{path} {body}"));
                        }
                        _ => response_details.push(format!("Path:{path}")),
                    }
                } else {
                    response_details.push(edge_compact_detail(message.as_str()));
                }
            }
            Message::Binary(data) => {
                if let Some(payload) = edge_audio_payload(data.as_ref()) {
                    audio.extend_from_slice(payload);
                }
            }
            Message::Ping(payload) => {
                socket.send(Message::Pong(payload)).map_err(|error| {
                    EdgeSpeechAttemptError::Operation(format!(
                        "回应 Edge 在线语音心跳失败: {error}"
                    ))
                })?;
            }
            Message::Close(_) => break,
            Message::Pong(_) | Message::Frame(_) => {}
        }
    }
    let _ = socket.close(None);
    if audio.is_empty() {
        let detail = response_details
            .first()
            .map(|value| format!("：{}", edge_compact_detail(value)))
            .unwrap_or_default();
        return Err(EdgeSpeechAttemptError::Operation(format!(
            "Edge 在线语音未收到音频{detail}"
        )));
    }
    Ok(audio)
}

fn synthesize_edge_speech_impl(
    text: String,
    voice_name: String,
    rate: f64,
    pitch: f64,
    volume: f64,
) -> Result<Vec<u8>, String> {
    let first = synthesize_edge_speech_once(&text, &voice_name, rate, pitch, volume, 0);
    match first {
        Ok(audio) => Ok(audio),
        Err(error) => {
            let local_unix_seconds = edge_unix_seconds(0);
            let Some(clock_skew_seconds) = edge_clock_skew_seconds(&error, local_unix_seconds)
            else {
                return Err(edge_format_attempt_error(&error));
            };
            synthesize_edge_speech_once(&text, &voice_name, rate, pitch, volume, clock_skew_seconds)
                .map_err(|retry_error| {
                    format!(
                        "{}；已按服务端时间重试一次",
                        edge_format_attempt_error(&retry_error)
                    )
                })
        }
    }
}

#[tauri::command]
async fn synthesize_edge_speech(
    text: String,
    voice_name: String,
    rate: f64,
    pitch: f64,
    volume: f64,
) -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        synthesize_edge_speech_impl(text, voice_name, rate, pitch, volume)
    })
    .await
    .map_err(|error| format!("Edge 在线语音任务失败: {error}"))?
}

#[cfg(target_os = "windows")]
fn list_windows_voices_impl() -> Result<Vec<WindowsVoice>, String> {
    use windows::Media::SpeechSynthesis::SpeechSynthesizer;

    let voices = SpeechSynthesizer::AllVoices()
        .map_err(|error| format!("读取系统语音失败: {error}"))?
        .into_iter()
        .filter_map(|voice| {
            let name = voice.Id().ok()?.to_string();
            let label = voice.DisplayName().ok()?.to_string();
            let language = voice.Language().ok()?.to_string();
            Some(WindowsVoice {
                name,
                label,
                language,
            })
        });
    Ok(voices.collect())
}

#[tauri::command]
fn list_windows_voices() -> Result<Vec<WindowsVoice>, String> {
    #[cfg(target_os = "windows")]
    {
        return list_windows_voices_impl();
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Windows 系统语音只支持 Windows".to_string())
    }
}

#[cfg(target_os = "windows")]
fn synthesize_windows_speech_impl(
    text: String,
    voice_name: String,
    rate: f64,
    pitch: f64,
    volume: f64,
) -> Result<Vec<u8>, String> {
    use windows::core::HSTRING;
    use windows::Media::SpeechSynthesis::SpeechSynthesizer;
    use windows::Storage::Streams::DataReader;

    let synthesizer =
        SpeechSynthesizer::new().map_err(|error| format!("创建系统语音失败: {error}"))?;
    let voices =
        SpeechSynthesizer::AllVoices().map_err(|error| format!("读取系统语音失败: {error}"))?;
    let voice = voices
        .into_iter()
        .find(|voice| {
            voice
                .Id()
                .map(|id| id.to_string() == voice_name)
                .unwrap_or(false)
        })
        .ok_or_else(|| format!("找不到系统语音: {voice_name}"))?;
    synthesizer
        .SetVoice(&voice)
        .map_err(|error| format!("设置系统语音失败: {error}"))?;
    let options = synthesizer
        .Options()
        .map_err(|error| format!("读取系统语音选项失败: {error}"))?;
    options
        .SetSpeakingRate(rate)
        .map_err(|error| format!("设置语速失败: {error}"))?;
    options
        .SetAudioPitch(pitch)
        .map_err(|error| format!("设置音调失败: {error}"))?;
    options
        .SetAudioVolume(volume.clamp(0.0, 1.0))
        .map_err(|error| format!("设置音量失败: {error}"))?;
    let stream = synthesizer
        .SynthesizeTextToStreamAsync(&HSTRING::from(text))
        .map_err(|error| format!("开始系统语音合成失败: {error}"))?
        .get()
        .map_err(|error| format!("系统语音合成失败: {error}"))?;
    let size = stream
        .Size()
        .map_err(|error| format!("读取语音长度失败: {error}"))?;
    let reader = DataReader::CreateDataReader(&stream)
        .map_err(|error| format!("创建语音读取器失败: {error}"))?;
    reader
        .LoadAsync(size as u32)
        .map_err(|error| format!("加载语音数据失败: {error}"))?
        .get()
        .map_err(|error| format!("读取语音数据失败: {error}"))?;
    let mut bytes = vec![0u8; size as usize];
    reader
        .ReadBytes(&mut bytes)
        .map_err(|error| format!("复制语音数据失败: {error}"))?;
    Ok(bytes)
}

#[tauri::command]
fn synthesize_windows_speech(
    text: String,
    voice_name: String,
    rate: f64,
    pitch: f64,
    volume: f64,
) -> Result<Vec<u8>, String> {
    #[cfg(target_os = "windows")]
    {
        return synthesize_windows_speech_impl(text, voice_name, rate, pitch, volume);
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (text, voice_name, rate, pitch, volume);
        Err("Windows 系统语音只支持 Windows".to_string())
    }
}

pub mod archive_database;
mod cloud_credentials;
mod cloud_recovery_cache;
mod cloud_recovery_binding;
mod cloud_recovery_commands;
mod cloud_recovery_schema;
mod cloud_recovery_transport;
pub mod diagnostics;
pub mod window_snap;

/// 临时诊断日志：前端把 NDJSON 行批量追加到 AppData/logs/ 下。
/// 文件名白名单校验（仅 [A-Za-z0-9_.-]，防路径穿越），写入在阻塞线程池执行。
#[tauri::command]
async fn append_log(app: tauri::AppHandle, file: String, lines: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        diagnostics::append_log_sync(&app, &file, &lines)
        /*
        let valid = !file.is_empty()
            && file.ends_with(".ndjson")
            && file
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'));
        if !valid {
            return Err(format!("非法日志文件名: {file}"));
        }
        let dir = crate::data_paths::root()
            .map_err(|e| e.to_string())?
            .join("logs");
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let mut f = OpenOptions::new()
            .create(true)
            .append(true)
            .open(dir.join(&file))
            .map_err(|e| e.to_string())?;
        f.write_all(lines.as_bytes()).map_err(|e| e.to_string())?;
        Ok(())*/
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 启动时清理超过 max_age_days 天的日志文件（临时诊断功能，防磁盘无限堆积）。
/// 返回删除的文件数；目录不存在或读取失败均静默返回 0。
#[tauri::command]
async fn cleanup_old_logs(app: tauri::AppHandle, max_age_days: u64) -> Result<usize, String> {
    // 仅保留旧命令的兼容参数；实际转发统一的安全清理策略，不恢复按参数删除的旧行为。
    let _ = max_age_days;
    diagnostics::cleanup_diagnostic_logs(app).map(|result| result.removed_files)
}

#[cfg(target_os = "windows")]
fn read_directwrite_font_name(
    names: &windows::Win32::Graphics::DirectWrite::IDWriteLocalizedStrings,
) -> Option<String> {
    use windows::core::{BOOL, PCWSTR};

    let locales = ["zh-cn", "en-us"];
    for locale in locales {
        let wide: Vec<u16> = locale.encode_utf16().chain(std::iter::once(0)).collect();
        let mut index = 0;
        let mut exists = BOOL(0);
        let found = unsafe { names.FindLocaleName(PCWSTR(wide.as_ptr()), &mut index, &mut exists) };
        if found.is_ok() && exists.0 != 0 {
            let length = unsafe { names.GetStringLength(index).ok()? } as usize;
            let mut buffer = vec![0u16; length + 1];
            unsafe { names.GetString(index, &mut buffer).ok()? };
            return Some(String::from_utf16_lossy(&buffer[..length]));
        }
    }

    let length = unsafe { names.GetStringLength(0).ok()? } as usize;
    let mut buffer = vec![0u16; length + 1];
    unsafe { names.GetString(0, &mut buffer).ok()? };
    Some(String::from_utf16_lossy(&buffer[..length]))
}

#[cfg(target_os = "windows")]
fn list_installed_fonts_windows() -> Result<Vec<String>, String> {
    use windows::Win32::Graphics::DirectWrite::{
        DWriteCreateFactory, IDWriteFactory, DWRITE_FACTORY_TYPE_SHARED,
    };

    let factory: IDWriteFactory = unsafe { DWriteCreateFactory(DWRITE_FACTORY_TYPE_SHARED) }
        .map_err(|error| format!("创建 DirectWrite 工厂失败: {error}"))?;
    let mut collection = None;
    unsafe { factory.GetSystemFontCollection(&mut collection, false) }
        .map_err(|error| format!("读取系统字体集合失败: {error}"))?;
    let collection = collection.ok_or_else(|| "系统字体集合为空".to_string())?;
    let mut fonts = Vec::new();
    for index in 0..unsafe { collection.GetFontFamilyCount() } {
        let family = unsafe { collection.GetFontFamily(index) }
            .map_err(|error| format!("读取字体族失败: {error}"))?;
        let names = unsafe { family.GetFamilyNames() }
            .map_err(|error| format!("读取字体名称失败: {error}"))?;
        if let Some(name) = read_directwrite_font_name(&names) {
            if !name.trim().is_empty() {
                fonts.push(name);
            }
        }
    }
    fonts.sort_unstable_by_key(|name| name.to_lowercase());
    fonts.dedup();
    Ok(fonts)
}

#[tauri::command]
fn list_installed_fonts() -> Result<Vec<String>, String> {
    #[cfg(target_os = "windows")]
    {
        return list_installed_fonts_windows();
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(vec!["MiSans".to_string()])
    }
}

#[tauri::command]
fn install_floating_window_snap(window: tauri::WebviewWindow) -> Result<(), String> {
    if !FLOATING_WINDOW_LABELS.contains(&window.label()) {
        return Err("仅实时副窗口支持几何吸附".to_string());
    }
    #[cfg(target_os = "windows")]
    {
        let hwnd = window.hwnd().map_err(|error| error.to_string())?;
        return window_snap::install_native(hwnd.0);
    }
    #[cfg(not(target_os = "windows"))]
    Ok(())
}

#[tauri::command]
fn set_floating_window_material(window: tauri::WebviewWindow, material: String, radius: f64, scheme: String, glass_tint: f32, surface_color: Option<[f32; 4]>) -> Result<(), String> {
    if !FLOATING_WINDOW_LABELS.contains(&window.label()) {
        return Err("仅副窗口支持材质设置".to_string());
    }
    if !["glass", "solid", "transparent"].contains(&material.as_str()) {
        return Err("窗口材质无效".to_string());
    }
    #[cfg(target_os = "windows")]
    {
        let physical = if material == "transparent" { None } else { Some((radius.clamp(0.0, 32.0) * window.scale_factor().unwrap_or(1.0)).round() as i32) };
        let hwnd = window.hwnd().map_err(|error| error.to_string())?.0;
        liquid_glass::set(hwnd, material == "glass", scheme == "dark", physical.unwrap_or(0) as f32, glass_tint.clamp(0.0, 1.0), surface_color)?;
        return window_snap::set_material(hwnd, false, scheme == "dark", if material == "glass" { None } else { physical });
    }
    #[cfg(not(target_os = "windows"))]
    Ok(())
}

fn build_tray_menu(
    app: &tauri::AppHandle,
    display_open: bool,
    gift_open: bool,
) -> tauri::Result<Menu<tauri::Wry>> {
    let show = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
    let display = MenuItem::with_id(
        app,
        "toggle-display",
        if display_open { "隐藏弹幕窗" } else { "显示弹幕窗" },
        true,
        None::<&str>,
    )?;
    let gift = MenuItem::with_id(
        app,
        "toggle-gift",
        if gift_open { "隐藏收益窗" } else { "显示收益窗" },
        true,
        None::<&str>,
    )?;
    let settings = MenuItem::with_id(app, "open-settings", "打开设置", true, None::<&str>)?;
    let mark_issue = MenuItem::with_id(app, "mark-issue", "标记当前问题", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    Menu::with_items(
        app,
        &[&show, &display, &gift, &settings, &mark_issue, &separator, &quit],
    )
}

#[tauri::command]
fn set_tray_window_state(
    app: tauri::AppHandle,
    state: tauri::State<TrayWindowState>,
    window: String,
    open: bool,
) -> Result<(), String> {
    let (display_open, gift_open) = {
        let mut display_state = state
            .display_open
            .lock()
            .map_err(|_| "托盘弹幕窗状态已损坏".to_string())?;
        let mut gift_state = state
            .gift_open
            .lock()
            .map_err(|_| "托盘礼物窗状态已损坏".to_string())?;
        match window.as_str() {
            "display" => *display_state = open,
            "gift" => *gift_state = open,
            _ => return Err(format!("未知的托盘副窗口：{window}")),
        }
        (*display_state, *gift_state)
    };

    let tray = app
        .tray_by_id("main-tray")
        .ok_or_else(|| "找不到应用托盘图标".to_string())?;
    let menu = build_tray_menu(&app, display_open, gift_open).map_err(|error| error.to_string())?;
    tray.set_menu(Some(menu)).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _root = match data_paths::initialize() {
        Ok(root) => root,
        Err(error) => {
            #[cfg(windows)] unsafe {
                use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_OK, MB_ICONERROR};
                let message: Vec<u16> = error.encode_utf16().chain(Some(0)).collect();
                let title: Vec<u16> = "BB CoLive".encode_utf16().chain(Some(0)).collect();
                MessageBoxW(std::ptr::null_mut(), message.as_ptr(), title.as_ptr(), MB_OK | MB_ICONERROR);
            }
            eprintln!("{error}");
            return;
        }
    };
    let mut context = tauri::generate_context!();
    for window in &mut context.config_mut().app.windows {
        window.create = false;
    }
    tauri::Builder::default()
        .manage(obs_server::ObsServerState::default())
        .manage(AudioOutputState::default())
        .manage(TrayWindowState::default())
        .manage(AppQuitState::default())
        .manage(WindowDiagnosticCloseStates::default())
        .manage(ExternalSynthesisState::default())
        .manage(archive_database::ArchiveWriteDatabase::default())
        .manage(cloud_recovery_commands::RecoveryTransportState::default())
        .setup(|app| {
            let window_config = app.config().app.windows[0].clone();
            tauri::WebviewWindowBuilder::from_config(app, &window_config)?
                .data_directory(data_paths::root()?.join("WebView"))
                .build()?;
            data_paths::migrate_autostart(app.handle())?;
            let menu = build_tray_menu(&app.handle(), false, false)?;
            let mut tray = TrayIconBuilder::with_id("main-tray")
                .tooltip("BB CoLive")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "toggle-display" => {
                        let _ = app.emit("tray:toggle-display-window", ());
                    }
                    "toggle-gift" => {
                        let _ = app.emit("tray:toggle-gift-window", ());
                    }
                    "open-settings" => {
                        show_main_window(app);
                        let _ = app.emit("tray:open-settings", ());
                    }
                    "mark-issue" => {
                        show_main_window(app);
                        let _ = app.emit("tray:mark-issue", ());
                    }
                    "quit" => {
                        request_app_quit(app);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            if !is_background_start() {
                show_main_window(&app.handle());
            }
            Ok(())
        })
        // 同一台机器只允许一个主程序连接直播间，避免 master/功能分支并行导致重复事件。
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::Builder::new()
            .app_name(if data_paths::portable_mode() { "BB CoLive Portable" } else { "BB CoLive" })
            .args(["--background"])
            .build())
        // http 必须开 unsafe-headers（验证坑 1：否则 sec-fetch-* 被剥离 -> -352 风控）
        .plugin(tauri_plugin_http::init())
        // SQLite：弹幕历史
        .plugin(tauri_plugin_sql::Builder::new().build())
        // JSON 配置：登录 cookie / 窗口布局 / 样式参数
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            data_paths::get_app_data_directory,
            data_paths::read_anchor_list,
            data_paths::create_app_window,
            cloud_recovery_commands::start_cloud_recovery_job,
            cloud_recovery_commands::list_cloud_recovery_sessions,
            cloud_recovery_commands::download_cloud_recovery_cover,
            cloud_recovery_commands::read_cloud_recovery_cover,
            cloud_recovery_commands::list_cloud_recovery_covers,
            cloud_recovery_commands::load_cloud_server_health,
            cloud_recovery_commands::load_cloud_auth_status,
            cloud_recovery_commands::list_cloud_rooms,
            cloud_recovery_commands::enable_cloud_room,
            cloud_recovery_commands::stop_cloud_room,
            cloud_recovery_commands::load_cloud_retention_settings,
            cloud_recovery_commands::preview_cloud_retention,
            cloud_recovery_commands::update_cloud_retention,
            cloud_recovery_commands::load_local_bilibili_session_summary,
            cloud_recovery_commands::sync_local_bilibili_session,
            cloud_recovery_commands::create_cloud_bilibili_qr_session,
            cloud_recovery_commands::get_cloud_recovery_job_status,
            cloud_recovery_commands::download_cloud_recovery_object,
            cloud_recovery_commands::read_cloud_recovery_slice,
            cloud_recovery_commands::cancel_cloud_recovery_job,
            cloud_recovery_commands::release_cloud_recovery_job,
            cloud_recovery_binding::save_cloud_recovery_binding,
            cloud_recovery_binding::load_cloud_recovery_binding,
            cloud_recovery_binding::remove_cloud_recovery_binding,
            obs_server::obs_start_service, obs_server::obs_service_status, obs_server::obs_set_service_port, obs_server::obs_send,
            append_log,
            cleanup_old_logs,
            archive_database::execute_archive_transaction,
            diagnostics::get_diagnostic_status,
            diagnostics::get_diagnostic_environment,
            diagnostics::export_diagnostic_bundle,
            diagnostics::cleanup_diagnostic_logs,
            diagnostics::open_diagnostic_log_directory,
            list_installed_fonts,
            install_floating_window_snap,
            set_floating_window_material,
            quit_app,
            begin_app_quit,
            prepare_floating_windows_close,
            set_window_diagnostic_close_state,
            read_window_diagnostic_close_states,
            read_archive_transfer,
            write_archive_transfer,
            write_archive_export_bytes,
            set_tray_window_state,
            synthesize_edge_speech,
            synthesize_fish_audio,
            lookup_fish_audio_model,
            synthesize_custom_http,
            cancel_voice_synthesis,
            list_windows_voices,
            synthesize_windows_speech,
            list_audio_output_devices,
            play_tts_audio,
            pause_tts_audio,
            resume_tts_audio,
            skip_tts_audio,
            stop_tts_audio,
            prepare_personal_audio,
            play_personal_audio,
            play_personal_preview_audio,
            pause_personal_audio,
            resume_personal_audio,
            skip_personal_audio,
            stop_personal_audio,
            skip_personal_preview_audio,
            theme_store::list_theme_summaries,
            theme_store::read_theme_document,
            theme_store::read_theme_defaults,
            theme_store::write_theme_document,
            theme_store::delete_theme_document,
            theme_store::read_theme_package_raw,
            theme_store::write_theme_package_raw,
            theme_store::read_theme_package_bytes,
            theme_store::read_theme_asset_bytes,
            theme_resources::load_theme_resource,
            theme_resources::cache_theme_resource,
            theme_resources::freeze_theme_resources,
            theme_store::write_theme_asset_bytes,
            theme_store::delete_theme_asset
        ])
        .run(context)
        .expect("error while running tauri application");
}
