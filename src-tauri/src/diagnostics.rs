use serde::Serialize;
use serde_json::Value;
use std::{
    fs::{self, File, OpenOptions},
    io::{BufReader, Read, Write},
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager};
const DAY: u64 = 86400;
const LOG_LIMIT: u64 = 64 * 1024 * 1024;
const DETAIL_LIMIT: u64 = 512 * 1024 * 1024;
const NORMAL_RETENTION_DAYS: u64 = 7;
const DETAIL_RETENTION_DAYS: u64 = 3;
const EXPORT_PROGRESS_CHUNK_BYTES: usize = 1024 * 1024;
const EXPORT_PROGRESS_MIN_INTERVAL_MS: u64 = 80;
static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
static FAIL: OnceLock<Mutex<u64>> = OnceLock::new();
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BundleMode {
    Diagnostic24h,
    Full,
}
#[derive(Clone, Debug)]
pub struct DiagnosticFileEntry {
    pub name: String,
    pub size: u64,
    pub modified: SystemTime,
}
#[derive(Serialize, Clone, Default)]
pub struct DiagnosticStatusDto {
    pub status: String,
    pub total_bytes: u64,
    pub normal_bytes: u64,
    pub detailed_bytes: u64,
    pub write_failures: u64,
    pub discarded: u64,
    pub truncated: u64,
}
#[derive(Serialize, Clone)]
pub struct DiagnosticEnvironmentDto {
    pub app_version: String,
    pub build: String,
    pub os: String,
    pub arch: String,
    pub webview: String,
    #[serde(rename = "webviewRuntimeVersion")]
    pub webview_runtime_version: Option<String>,
    #[serde(rename = "webviewVersionSource")]
    pub webview_version_source: String,
    pub workspace: Option<String>,
    pub scale: Option<f64>,
    pub window: Option<String>,
    pub audio_devices: Vec<String>,
}
#[derive(Serialize, Clone)]
pub struct DiagnosticExportResult {
    pub output_path: String,
    pub files: Vec<String>,
    pub mode: String,
    pub bytes: u64,
    pub missing_snapshots: Vec<String>,
}
#[derive(Serialize, Clone)]
struct DiagnosticExportProgress {
    mode: String,
    #[serde(rename = "processedBytes")]
    processed_bytes: u64,
    #[serde(rename = "totalBytes")]
    total_bytes: u64,
    complete: bool,
}
#[derive(Serialize, Clone, Default)]
pub struct CleanupResult {
    pub removed_files: usize,
    pub removed_bytes: u64,
}
#[derive(Default)]
struct Filtered {
    content: String,
    line_count: u64,
    parse_failures: u64,
    discarded: u64,
}
impl DiagnosticFileEntry {
    #[cfg(test)]
    fn test_entry(n: &str, s: u64, m: SystemTime) -> Self {
        Self {
            name: n.into(),
            size: s,
            modified: m,
        }
    }
}
pub fn is_safe_log_file_name(n: &str) -> bool {
    !n.is_empty()
        && n.ends_with(".ndjson")
        && n.chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'))
}
fn dir(a: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::data_paths::root()
        .map_err(|e| e.to_string())?
        .join("logs"))
}
pub fn append_log_sync(a: &AppHandle, n: &str, lines: &str) -> Result<(), String> {
    if !is_safe_log_file_name(n) {
        return Err(format!("非法日志文件名: {n}"));
    }
    let _g = LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|e| e.to_string())?;
    let d = dir(a)?;
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(d.join(n))
        .and_then(|mut f| f.write_all(lines.as_bytes()))
        .map_err(|e| {
            *FAIL.get_or_init(|| Mutex::new(0)).lock().unwrap() += 1;
            e.to_string()
        })
}
fn entries(d: &Path) -> Vec<DiagnosticFileEntry> {
    fs::read_dir(d)
        .into_iter()
        .flatten()
        .filter_map(|x| x.ok())
        .filter_map(|x| {
            let m = x.metadata().ok()?;
            Some(DiagnosticFileEntry {
                name: x.file_name().to_string_lossy().into(),
                size: m.len(),
                modified: m.modified().unwrap_or(UNIX_EPOCH),
            })
        })
        .collect()
}
fn allowed(n: &str) -> bool {
    ["app-", "tts-", "markers-", "environment-", "sanitized-"]
        .iter()
        .any(|p| n.starts_with(p))
        && [".json", ".ndjson"].iter().any(|s| n.ends_with(s))
}
fn is_detailed_log(n: &str) -> bool {
    (n.starts_with("source-") || n.starts_with("render-")) && n.ends_with(".ndjson")
}
fn allowed_recent(n: &str) -> bool {
    allowed(n) || is_detailed_log(n)
}
fn allowed_full(n: &str) -> bool {
    allowed_recent(n)
}
pub fn select_bundle_files(mode: BundleMode, es: &[DiagnosticFileEntry]) -> Vec<String> {
    es.iter()
        .filter(|e| {
            if mode == BundleMode::Full {
                allowed_full(&e.name)
            } else {
                allowed_recent(&e.name)
            }
        })
        .map(|e| e.name.clone())
        .collect()
}
pub fn is_timestamp_in_bundle(m: BundleMode, t: u64, n: u64) -> bool {
    m == BundleMode::Full || (t <= n && n - t <= 86400000)
}
fn secret(k: &str) -> bool {
    let l = k
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect::<String>()
        .to_ascii_lowercase();
    [
        "cookie",
        "cookies",
        "token",
        "refreshtoken",
        "csrftoken",
        "idtoken",
        "bearertoken",
        "clientsecret",
        "sessionid",
        "accesstoken",
        "authorization",
        "authorizationheader",
        "apikey",
        "privatekey",
        "accesskey",
        "secret",
        "password",
        "credential",
        "credentials",
        "auth",
        "buvid",
    ]
    .contains(&l.as_str())
}
fn excluded(s: &str) -> bool {
    let l = s.to_ascii_lowercase().replace('/', "\\");
    (l.len() >= 3 && l.as_bytes()[1] == b':' && l.as_bytes()[2] == b'\\')
        || l.starts_with("\\\\")
        || s.starts_with('/')
        || s.to_ascii_lowercase().starts_with("file://")
        || [".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac"]
            .iter()
            .any(|x| l.ends_with(x))
}
pub fn sanitize_export_value(mut v: Value) -> Option<Value> {
    match &mut v {
        Value::Object(o) => {
            for k in o.keys().cloned().collect::<Vec<_>>() {
                if secret(&k) {
                    o.remove(&k);
                    continue;
                }
                if let Some(x) = o.get_mut(&k) {
                    if matches!(x,Value::String(s) if excluded(s)) {
                        o.remove(&k);
                    } else if let Some(y) = sanitize_export_value(x.take()) {
                        *x = y
                    } else {
                        o.remove(&k);
                    }
                }
            }
            Some(v)
        }
        Value::Array(a) => {
            let mut out = Vec::new();
            for x in std::mem::take(a) {
                if let Some(y) = sanitize_export_value(x) {
                    out.push(y)
                }
            }
            *a = out;
            Some(v)
        }
        Value::String(s) if excluded(s) => None,
        _ => Some(v),
    }
}
fn timestamp(v: &Value) -> Option<u64> {
    let n = ["timestamp", "t"].into_iter().find_map(|key| {
        let value = v.get(key)?;
        value
            .as_u64()
            .or_else(|| value.as_str()?.parse::<u64>().ok())
    })?;
    Some(if n < 100_000_000_000 {
        n.saturating_mul(1000)
    } else {
        n
    })
}
fn normalize_marker_export_status(v: &mut Value, now: u64, abnormal_exit: bool) {
    let Some(object) = v.as_object_mut() else {
        return;
    };
    if object.get("kind").and_then(Value::as_str) != Some("marker") {
        return;
    }
    let complete = !abnormal_exit
        && object
            .get("end")
            .and_then(|value| value.as_u64().or_else(|| value.as_str()?.parse::<u64>().ok()))
            .is_some_and(|end| now >= end);
    object.insert(
        "status".into(),
        Value::String(if complete { "complete" } else { "incomplete" }.into()),
    );
}

fn read_export_log<F>(path: &Path, mut on_progress: F) -> std::io::Result<String>
where
    F: FnMut(u64),
{
    let file = File::open(path)?;
    let mut reader = BufReader::with_capacity(EXPORT_PROGRESS_CHUNK_BYTES, file);
    let mut bytes = Vec::new();
    let mut buffer = vec![0u8; EXPORT_PROGRESS_CHUNK_BYTES];
    let mut processed_bytes = 0u64;

    loop {
        let read = reader.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        bytes.extend_from_slice(&buffer[..read]);
        processed_bytes = processed_bytes.saturating_add(read as u64);
        on_progress(processed_bytes);
    }

    String::from_utf8(bytes)
        .map_err(|error| std::io::Error::new(std::io::ErrorKind::InvalidData, error))
}

fn filter_ndjson_with_context(
    input: &str,
    mode: BundleMode,
    now: u64,
    abnormal_exit: bool,
) -> Filtered {
    let mut r = Filtered::default();
    for line in input.lines().filter(|x| !x.trim().is_empty()) {
        match serde_json::from_str::<Value>(line) {
            Ok(mut v) => {
                let Some(t) = timestamp(&v) else {
                    r.parse_failures += 1;
                    continue;
                };
                if mode == BundleMode::Full || is_timestamp_in_bundle(mode, t, now) {
                    normalize_marker_export_status(&mut v, now, abnormal_exit);
                    let session = v.get("sessionId").and_then(Value::as_str)
                        .filter(|id| id.starts_with("launch-") && id[7..].chars().all(|c| c.is_ascii_alphanumeric() || c == '-'))
                        .filter(|_| matches!(v.get("kind").and_then(Value::as_str), Some("app" | "source" | "render" | "marker" | "tts")))
                        .filter(|_| v.get("seq").and_then(Value::as_u64).is_some()
                            || (v.get("kind").and_then(Value::as_str) == Some("tts")
                                && v.get("requestId").and_then(Value::as_str).is_some()
                                && v.get("provider").and_then(Value::as_str).is_some()
                                && v.get("stage").and_then(Value::as_str).is_some()))
                        .map(str::to_owned);
                    if let Some(v) = sanitize_export_value(v) {
                        let mut v = v;
                        if let (Some(object), Some(session)) = (v.as_object_mut(), session) {
                            object.insert("sessionId".into(), Value::String(session));
                        }
                        r.content += &serde_json::to_string(&v).unwrap();
                        r.content.push('\n');
                        r.line_count += 1
                    } else {
                        r.discarded += 1
                    }
                } else {
                    r.discarded += 1
                }
            }
            Err(_) => r.parse_failures += 1,
        }
    }
    r
}
fn value_at_path<'a>(value: &'a Value, path: &str) -> Option<&'a Value> {
    path.split('.').try_fold(value, |current, key| current.get(key))
}
fn feature_manifest_missing_snapshot_keys(snapshot: &Value) -> Vec<String> {
    let Some(feature_manifest) = snapshot.get("featureManifest") else {
        return Vec::new();
    };
    let Some(features) = feature_manifest.get("features").and_then(Value::as_array) else {
        return Vec::new();
    };
    let snapshots = feature_manifest.get("snapshots").and_then(Value::as_object);
    let mut missing = Vec::new();
    for feature in features {
        let Some(feature_id) = feature.get("id").and_then(Value::as_str) else {
            continue;
        };
        let feature_snapshot = snapshots.and_then(|all| all.get(feature_id));
        let Some(keys) = feature
            .get("snapshotSchema")
            .and_then(|schema| schema.get("keys"))
            .and_then(Value::as_array)
        else {
            continue;
        };
        for key in keys.iter().filter_map(Value::as_str) {
            let present = feature_snapshot
                .and_then(|value| value_at_path(value, key))
                .is_some();
            if !present {
                missing.push(format!("{feature_id}:{key}"));
            }
        }
    }
    missing
}
fn append_feature_manifest_missing_items(feature_manifest: &mut Value, missing: &[String]) {
    let Some(object) = feature_manifest.as_object_mut() else {
        return;
    };
    let entries = object
        .entry("missingSnapshots")
        .or_insert_with(|| Value::Array(Vec::new()));
    if !entries.is_array() {
        *entries = Value::Array(Vec::new());
    }
    let Some(entries) = entries.as_array_mut() else {
        return;
    };
    for item in missing {
        let Some((feature_id, key)) = item.split_once(':') else {
            continue;
        };
        let already_present = entries.iter().any(|entry| {
            entry.get("featureId").and_then(Value::as_str) == Some(feature_id)
                && entry.get("key").and_then(Value::as_str) == Some(key)
        });
        if !already_present {
            entries.push(serde_json::json!({"featureId": feature_id, "key": key}));
        }
    }
}
fn manifest(
    mode: &str,
    build: &str,
    build_id: &str,
    files: Vec<String>,
    missing_snapshots: Vec<String>,
    lines: u64,
    parse: u64,
    read: u64,
    write: u64,
    discarded: u64,
    truncated: u64,
    abnormal: bool,
    started_at: u64,
    now: u64,
) -> Value {
    let range_start = if mode == "24h" {
        Some(started_at.saturating_sub(86400000))
    } else {
        None
    };
    let file_count = files.len();
    serde_json::json!({
        "version":"1",
        "build":build,
        "buildId":build_id,
        "mode":mode,
        "bundleScope":if mode=="24h"{"diagnostics-24h"}else{"full-retained"},
        "timeRange":if let Some(start)=range_start{format!("{}-{}",start,started_at)}else{"all retained".to_string()},
        "timeRangeStart":range_start,
        "timeRangeEnd":started_at,
        "includedStreams":["app","source","render","tts","markers"],
        "sourceRenderBoundary":if mode=="24h"{"recent-24h"}else{"all-retained"},
        "files":files,
        "missingSnapshots":missing_snapshots,
        "lineCount":lines,
        "parseFailures":parse,
        "readFailures":read,
        "writeFailures":write,
        "discarded":discarded,
        "truncated":truncated,
        "abnormalExit":abnormal,
        "export":{
            "phase":"complete",
            "startedAt":started_at,
            "endedAt":now,
            "fileCount":file_count,
            "lineCount":lines,
            "failureCount":parse.saturating_add(read).saturating_add(write),
        }
    })
}
fn cleanup_candidates(es: &[DiagnosticFileEntry], now: SystemTime) -> Vec<DiagnosticFileEntry> {
    let mut total: u64 = es.iter().filter(|e| allowed(&e.name)).map(|e| e.size).sum();
    let mut v = es
        .iter()
        .filter(|e| allowed(&e.name))
        .filter(|e| now.duration_since(e.modified).unwrap_or_default() >= Duration::from_secs(DAY))
        .cloned()
        .collect::<Vec<_>>();
    v.sort_by_key(|e| e.modified);
    let mut out = Vec::new();
    while total > LOG_LIMIT && !v.is_empty() {
        let e = v.remove(0);
        total -= e.size;
        out.push(e)
    }
    out.extend(v.into_iter().filter(|e| {
        now.duration_since(e.modified).unwrap_or_default() >= Duration::from_secs(NORMAL_RETENTION_DAYS * DAY)
    }));
    out
}
fn select_old_detailed_files(
    es: &[DiagnosticFileEntry],
    limit: u64,
    now: SystemTime,
) -> Vec<DiagnosticFileEntry> {
    let mut all = es
        .iter()
        .filter(|e| is_detailed_log(&e.name))
        .cloned()
        .collect::<Vec<_>>();
    all.sort_by_key(|e| e.modified);
    let mut candidates = all
        .iter()
        .filter(|e| now.duration_since(e.modified).unwrap_or_default() >= Duration::from_secs(DAY))
        .cloned()
        .collect::<Vec<_>>();
    candidates.sort_by_key(|e| e.modified);

    // 先清理超过保留期的非活动日文件；若仍超过容量，再从最旧的非活动文件继续清理。
    let mut total = all.iter().map(|e| e.size).sum::<u64>();
    let mut selected = Vec::new();
    for entry in candidates.iter().filter(|e| {
        now.duration_since(e.modified).unwrap_or_default()
            >= Duration::from_secs(DETAIL_RETENTION_DAYS * DAY)
    }) {
        total = total.saturating_sub(entry.size);
        selected.push(entry.clone());
    }
    for entry in candidates {
        if total <= limit || selected.iter().any(|item| item.name == entry.name) {
            continue;
        }
        total = total.saturating_sub(entry.size);
        selected.push(entry);
    }
    selected
}
fn diagnostic_status(normal_bytes: u64, detailed_bytes: u64, write_failures: u64) -> &'static str {
    if normal_bytes >= LOG_LIMIT || detailed_bytes >= DETAIL_LIMIT {
        "full"
    } else if write_failures > 0 {
        "degraded"
    } else {
        "healthy"
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct WebviewRuntimeInfo {
    version: Option<String>,
    source: String,
}

fn webview_runtime_info() -> WebviewRuntimeInfo {
    #[cfg(windows)]
    let version = read_webview2_runtime_version();
    #[cfg(not(windows))]
    let version = None;

    WebviewRuntimeInfo {
        source: if version.is_some() {
            "windows-registry".into()
        } else {
            "unavailable".into()
        },
        version,
    }
}

#[cfg(windows)]
fn read_webview2_runtime_version() -> Option<String> {
    use windows_sys::Win32::System::Registry::{
        RegGetValueW, HKEY_LOCAL_MACHINE, REG_SZ, RRF_RT_REG_SZ, RRF_SUBKEY_WOW6432KEY,
        RRF_SUBKEY_WOW6464KEY,
    };

    const RUNTIME_SUBKEY: windows_sys::core::PCWSTR = windows_sys::core::w!(
        "SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
    );
    const VERSION_VALUE: windows_sys::core::PCWSTR = windows_sys::core::w!("pv");

    for view in [RRF_SUBKEY_WOW6432KEY, RRF_SUBKEY_WOW6464KEY, 0] {
        let mut value_type: u32 = 0;
        let mut buffer = [0u16; 128];
        let mut size = (buffer.len() * std::mem::size_of::<u16>()) as u32;
        let status = unsafe {
            RegGetValueW(
                HKEY_LOCAL_MACHINE,
                RUNTIME_SUBKEY,
                VERSION_VALUE,
                RRF_RT_REG_SZ | view,
                &mut value_type,
                buffer.as_mut_ptr().cast(),
                &mut size,
            )
        };
        if status != 0 || value_type != REG_SZ {
            continue;
        }

        let units = (size as usize / std::mem::size_of::<u16>()).min(buffer.len());
        let length = buffer[..units]
            .iter()
            .position(|value| *value == 0)
            .unwrap_or(units);
        let version = String::from_utf16_lossy(&buffer[..length])
            .trim()
            .to_owned();
        if !version.is_empty() {
            return Some(version);
        }
    }

    None
}

#[tauri::command]
pub fn get_diagnostic_status(a: AppHandle) -> DiagnosticStatusDto {
    let es = dir(&a).map(|d| entries(&d)).unwrap_or_default();
    let f = *FAIL.get_or_init(|| Mutex::new(0)).lock().unwrap();
    let normal_bytes = es
        .iter()
        .filter(|e| allowed(&e.name))
        .map(|e| e.size)
        .sum::<u64>();
    let detailed_bytes = es
        .iter()
        .filter(|e| is_detailed_log(&e.name))
        .map(|e| e.size)
        .sum::<u64>();
    DiagnosticStatusDto {
        status: diagnostic_status(normal_bytes, detailed_bytes, f).into(),
        total_bytes: normal_bytes + detailed_bytes,
        normal_bytes,
        detailed_bytes,
        write_failures: f,
        ..Default::default()
    }
}
#[tauri::command]
pub fn get_diagnostic_environment(a: AppHandle) -> DiagnosticEnvironmentDto {
    let webview_runtime = webview_runtime_info();
    DiagnosticEnvironmentDto {
        app_version: a.package_info().version.to_string(),
        build: "unknown".into(),
        os: std::env::consts::OS.into(),
        arch: std::env::consts::ARCH.into(),
        webview: if cfg!(windows) {
            "WebView2"
        } else {
            "platform-webview"
        }
        .into(),
        webview_runtime_version: webview_runtime.version,
        webview_version_source: webview_runtime.source,
        workspace: None,
        scale: None,
        window: None,
        audio_devices: vec![],
    }
}
#[tauri::command]
pub fn cleanup_diagnostic_logs(a: AppHandle) -> Result<CleanupResult, String> {
    let d = dir(&a)?;
    let now = SystemTime::now();
    let es = entries(&d);
    let mut r = CleanupResult::default();
    for e in cleanup_candidates(&es, now) {
        if fs::remove_file(d.join(&e.name)).is_ok() {
            r.removed_files += 1;
            r.removed_bytes += e.size
        }
    }
    for e in select_old_detailed_files(&es, DETAIL_LIMIT, now) {
        if fs::remove_file(d.join(&e.name)).is_ok() {
            r.removed_files += 1;
            r.removed_bytes += e.size
        }
    }
    Ok(r)
}
#[tauri::command]
pub fn open_diagnostic_log_directory(a: AppHandle) -> Result<String, String> {
    let d = dir(&a)?;
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    tauri_plugin_opener::open_path(&d, None::<&str>).map_err(|e| e.to_string())?;
    Ok(d.to_string_lossy().into())
}
fn export_write_error(stage: &str, error: impl std::fmt::Display) -> String {
    format!("diagnostic export writeFailures=1 stage={stage}: {error}")
}
fn write_snapshot_entries<W: Write + std::io::Seek>(
    z: &mut zip::ZipWriter<W>,
    snapshot: &Value,
    options: zip::write::SimpleFileOptions,
    files: &mut Vec<String>,
) -> Result<Vec<String>, String> {
    let mut missing = Vec::new();
    for (name, key) in [
        ("environment.json", "environment"),
        ("settings.json", "settings"),
        ("diagnostics.json", "diagnostics"),
        ("feature-manifest.json", "featureManifest"),
    ] {
        let Some(mut value) = snapshot.get(key).filter(|value| value.is_object()).cloned().and_then(sanitize_export_value) else {
            missing.push(name.into());
            continue;
        };
        if key == "featureManifest" {
            let feature_missing = feature_manifest_missing_snapshot_keys(snapshot);
            append_feature_manifest_missing_items(&mut value, &feature_missing);
        }
        let content = serde_json::to_string(&value)
            .map_err(|e| export_write_error("serialize_snapshot", e))?;
        z.start_file(name, options)
            .map_err(|e| export_write_error("start_snapshot", e))?;
        z.write_all(format!("{content}\n").as_bytes())
            .map_err(|e| export_write_error("write_snapshot", e))?;
        files.push(name.into());
    }
    Ok(missing)
}
fn next_available_export_path(output_path: &Path) -> PathBuf {
    if !output_path.exists() && !PathBuf::from(format!("{}.tmp", output_path.display())).exists() {
        return output_path.to_path_buf();
    }
    let stem = output_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("diagnostic");
    let extension = output_path.extension().and_then(|value| value.to_str());
    for index in 1u64.. {
        let name = match extension {
            Some(extension) => format!("{stem} ({index}).{extension}"),
            None => format!("{stem} ({index})"),
        };
        let candidate = output_path.with_file_name(name);
        if !candidate.exists() && !PathBuf::from(format!("{}.tmp", candidate.display())).exists() {
            return candidate;
        }
    }
    unreachable!("u64 export suffix space exhausted")
}
fn emit_export_progress(
    a: &AppHandle,
    mode: &str,
    processed_bytes: u64,
    total_bytes: u64,
    complete: bool,
) {
    let _ = a.emit(
        "diagnostic:export-progress",
        DiagnosticExportProgress {
            mode: mode.into(),
            processed_bytes,
            total_bytes,
            complete,
        },
    );
}

struct ExportProgressReporter<'a> {
    app: Option<&'a AppHandle>,
    mode: &'a str,
    total_bytes: u64,
    last_emitted_at: Option<Instant>,
}

impl<'a> ExportProgressReporter<'a> {
    fn new(app: Option<&'a AppHandle>, mode: &'a str, total_bytes: u64) -> Self {
        Self {
            app,
            mode,
            total_bytes,
            last_emitted_at: None,
        }
    }

    fn emit(&mut self, processed_bytes: u64, complete: bool, force: bool) {
        let now = Instant::now();
        let ready = self
            .last_emitted_at
            .map(|last| now.duration_since(last) >= Duration::from_millis(EXPORT_PROGRESS_MIN_INTERVAL_MS))
            .unwrap_or(true);
        if !force && !complete && !ready {
            return;
        }
        if let Some(app) = self.app { emit_export_progress(
            app,
            self.mode,
            processed_bytes.min(self.total_bytes),
            self.total_bytes,
            complete,
        ); }
        self.last_emitted_at = Some(now);
    }
}

#[tauri::command]
pub async fn export_diagnostic_bundle(
    a: AppHandle,
    output_path: String,
    mode: String,
    snapshot: Option<Value>,
) -> Result<DiagnosticExportResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        export_diagnostic_bundle_sync(a, output_path, mode, snapshot)
    })
    .await
    .map_err(|error| format!("生成诊断包失败：{error}"))?
}

fn export_diagnostic_bundle_sync(
    a: AppHandle,
    output_path: String,
    mode: String,
    snapshot: Option<Value>,
) -> Result<DiagnosticExportResult, String> {
    export_bundle_from_directory(&dir(&a)?, output_path, mode, snapshot, Some(&a))
}

fn export_bundle_from_directory(
    d: &Path,
    output_path: String,
    mode: String,
    snapshot: Option<Value>,
    app: Option<&AppHandle>,
) -> Result<DiagnosticExportResult, String> {
    let bm = match mode.as_str() {
        "24h" => BundleMode::Diagnostic24h,
        "full" => BundleMode::Full,
        _ => return Err("mode 只能是 24h 或 full".into()),
    };
    let es = entries(&d);
    let names = select_bundle_files(bm, &es);
    let total_bytes = names
        .iter()
        .filter_map(|name| es.iter().find(|entry| entry.name == *name))
        .map(|entry| entry.size)
        .sum::<u64>();
    let mut progress = ExportProgressReporter::new(app, &mode, total_bytes);
    progress.emit(0, false, true);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let snapshot = snapshot.and_then(sanitize_export_value).unwrap_or_else(|| serde_json::json!({}));
    let build = snapshot
        .get("build")
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let build_id = snapshot
        .get("buildId")
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let abnormal = snapshot
        .get("abnormalExit")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let final_output = next_available_export_path(Path::new(&output_path));
    let temp = PathBuf::from(format!("{}.tmp", final_output.display()));
    let result = (|| -> Result<(Vec<String>, Vec<String>), String> {
        let mut z =
            zip::ZipWriter::new(File::create(&temp).map_err(|e| export_write_error("create", e))?);
        let o = zip::write::SimpleFileOptions::default();
        let (mut lines, mut parse, mut read_failures, mut discarded, write_failures) =
            (0, 0, 0, 0, 0);
        let mut files = Vec::new();
        let mut processed_bytes = 0u64;
        for n in &names {
            let source_size = es
                .iter()
                .find(|entry| entry.name == *n)
                .map(|entry| entry.size)
                .unwrap_or(0);
            let file_base_bytes = processed_bytes;
            let raw = match read_export_log(&d.join(n), |file_processed_bytes| {
                let current = file_base_bytes
                    .saturating_add(file_processed_bytes)
                    .min(total_bytes);
                progress.emit(current, false, false);
            }) {
                Ok(raw) => {
                    processed_bytes = processed_bytes.saturating_add(source_size);
                    progress.emit(processed_bytes, false, true);
                    raw
                }
                Err(_) => {
                    read_failures += 1;
                    processed_bytes = processed_bytes.saturating_add(source_size);
                    progress.emit(processed_bytes, false, true);
                    continue;
                }
            };
            let r = if n.ends_with(".json") {
                match serde_json::from_str::<Value>(&raw)
                    .ok()
                    .and_then(sanitize_export_value)
                {
                    Some(v) => Filtered {
                        content: serde_json::to_string(&v).unwrap() + "\n",
                        line_count: 1,
                        ..Default::default()
                    },
                    None => Filtered {
                        parse_failures: 1,
                        ..Default::default()
                    },
                }
            } else {
                filter_ndjson_with_context(&raw, bm, now, abnormal)
            };
            if r.content.is_empty() {
                parse += r.parse_failures;
                discarded += r.discarded;
                continue;
            }
            z.start_file(n, o)
                .map_err(|e| export_write_error("start_file", e))?;
            z.write_all(r.content.as_bytes())
                .map_err(|e| export_write_error("write_all", e))?;
            files.push(n.clone());
            lines += r.line_count;
            parse += r.parse_failures;
            discarded += r.discarded;
        }
        let mut missing_snapshots = write_snapshot_entries(&mut z, &snapshot, o, &mut files)?;
        for missing in feature_manifest_missing_snapshot_keys(&snapshot) {
            if !missing_snapshots.contains(&missing) {
                missing_snapshots.push(missing);
            }
        }
        z.start_file("manifest.json", o)
            .map_err(|e| export_write_error("start_file", e))?;
        z.write_all(
            manifest(
                &mode,
                build,
                build_id,
                files.clone(),
                missing_snapshots.clone(),
                lines,
                parse,
                read_failures,
                write_failures,
                discarded,
                0,
                abnormal,
                now,
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64,
            )
            .to_string()
            .as_bytes(),
        )
        .map_err(|e| export_write_error("write_all", e))?;
        z.start_file("README.txt", o)
            .map_err(|e| export_write_error("start_file", e))?;
        z.write_all("manifest.json 记录本次导出的 mode、24h/full 数据范围、起止时间、流范围、文件/行/失败计数和完成阶段；README 与 manifest 的范围一致。24h 按导出开始时间逐行保留最近24小时，普通诊断流、source/render 详细流、tts 和 marker 诊断上下文都按记录时间筛选；full 保留本机仍在保留期内的全部新诊断流，并递归脱敏。普通流保留7天或64 MB，source/render流保留3天或512 MB，并定期清理非活动文件。缺失或非法 timestamp 计入 parseFailures，读取源文件失败计入 readFailures，ZIP 创建/写入/完成失败计入 writeFailures；files 只列成功写入有效内容，missingSnapshots 列出本次未能生成的运行快照。feature-manifest.json 记录当前功能的 catalog、snapshotSchema、failureHooks、快照和缺失项，新增功能必须先登记覆盖契约；review-archive 的 archive transfer bundle 另行保留 raw/source/render 内容边界、资源 URL 和计数，不包含 markers、诊断、设置、凭证、本地路径或图片二进制。导出路径只返回给当前 UI，包内不写完整本地路径。旧 conn-* raw/ui 格式已废弃，生产路径不再写入、读取、导出或统计。marker 的事件关联窗口只用于诊断上下文。".as_bytes()).map_err(|e| export_write_error("write_all", e))?;
        z.finish().map_err(|e| export_write_error("finish", e))?;
        progress.emit(total_bytes, true, true);
        Ok((files, missing_snapshots))
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    };
    let (files, missing_snapshots) = result?;
    if let Err(e) = fs::rename(&temp, &final_output) {
        let _ = fs::remove_file(&temp);
        return Err(export_write_error("rename", e));
    }
    Ok(DiagnosticExportResult {
        bytes: fs::metadata(&final_output).map(|m| m.len()).unwrap_or(0),
        output_path: final_output.to_string_lossy().into(),
        files,
        mode,
        missing_snapshots,
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::io::{Cursor, Read};
    fn e(n: &str, s: u64, t: u64) -> DiagnosticFileEntry {
        DiagnosticFileEntry::test_entry(n, s, UNIX_EPOCH + Duration::from_secs(t))
    }
    #[test]
    fn nested_redaction() {
        let v=sanitize_export_value(json!({"o":{"refreshToken":"r","csrfToken":"c","idToken":"i","bearerToken":"b","clientSecret":"s","sessionId":"x","accessToken":"y","authorizationHeader":"z","privateKey":"p","apiKey":"a","accessKey":"b","businessKey":7,"authState":"ok","arr":[{"accessKey":"y","ok":1}]},"a":"D:\\x\\a.ogg","u":"\\\\server\\x.wav","p":"/tmp/x"})).unwrap();
        for k in [
            "refreshToken",
            "csrfToken",
            "idToken",
            "bearerToken",
            "clientSecret",
            "sessionId",
            "accessToken",
            "authorizationHeader",
            "privateKey",
            "apiKey",
            "accessKey",
        ] {
            assert!(v["o"].get(k).is_none(), "{k} should be removed")
        }
        assert_eq!(v["o"]["businessKey"], 7);
        assert_eq!(v["o"]["authState"], "ok");
        assert!(v["o"]["arr"][0].get("accessKey").is_none());
        assert!(v.get("a").is_none() && v.get("u").is_none() && v.get("p").is_none())
    }
    #[test]
    fn envelope_session_and_array_exclusions() {
        let input = json!({"t":2000000000000u64,"seq":1,"kind":"source","sessionId":"launch-test",
            "data":{"sessionId":"credential", "arr":["C:\\private\\log", "/tmp/log", "file:///tmp/log", "voice.wav", {"sessionId":"credential", "ok":1}, "safe"]}});
        let filtered = filter_ndjson_with_context(&input.to_string(), BundleMode::Full, 2000000000000, false);
        let value: Value = serde_json::from_str(filtered.content.trim()).unwrap();
        assert_eq!(value["sessionId"], "launch-test");
        assert!(value["data"].get("sessionId").is_none());
        assert_eq!(value["data"]["arr"], json!([{"ok":1}, "safe"]));
        assert!(sanitize_export_value(json!({"sessionId":"launch-test"})).unwrap().get("sessionId").is_none());
    }
    #[test]
    fn export_contract_evidence() {
        let root = std::env::var_os("DIAGNOSTIC_EXPORT_EVIDENCE").map(PathBuf::from).unwrap_or_else(|| {
            std::env::temp_dir().join(format!("danmu-diagnostic-evidence-{}-{}", std::process::id(), SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()))
        });
        let logs = root.join("logs");
        fs::create_dir_all(&logs).unwrap();
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as u64;
        fs::write(logs.join("source-test.ndjson"), format!("{}\n", json!({
            "t":now,"seq":1,"kind":"source","sessionId":"launch-evidence",
            "data":{"sessionId":"credential", "cookie":"private", "paths":["C:\\private\\log", "/tmp/log", "file:///tmp/log", "voice.wav", "safe"]}
        }))).unwrap();
        let mut snapshot = json!({
            "build":"test", "buildId":"test-build",
            "environment":{"os":"test", "paths":["/tmp/log", "safe"]},
            "diagnostics":{"flush":{"failed":0,"flushed":2,"pending":0,"writeFailures":0,"droppedRecords":0}},
            "featureManifest":{"features":[{"id":"startup-behavior", "snapshotSchema":{"version":1,"keys":["settings.general.startOnBoot"]}}],
                "snapshots":{"startup-behavior":{"settings":{"general":{}}}},"missingSnapshots":[]}
        });
        if let Ok(diagnostics) = std::env::var("DIAGNOSTIC_EXPORT_DIAGNOSTICS") {
            snapshot["diagnostics"] = serde_json::from_str(&diagnostics).unwrap();
        }
        let expected_flush = snapshot["diagnostics"]["flush"].clone();
        let output = root.join("diagnostic.zip");
        let first = export_bundle_from_directory(&logs, output.to_string_lossy().into(), "24h".into(), Some(snapshot.clone()), None).unwrap();
        let second = export_bundle_from_directory(&logs, output.to_string_lossy().into(), "full".into(), Some(snapshot), None).unwrap();
        assert_eq!(first.output_path, output.to_string_lossy());
        assert_eq!(second.output_path, root.join("diagnostic (1).zip").to_string_lossy());
        let dto = serde_json::to_value(&second).unwrap();
        fs::write(root.join("result.json"), serde_json::to_vec_pretty(&dto).unwrap()).unwrap();
        for result in [&first, &second] {
            let mut archive = zip::ZipArchive::new(File::open(&result.output_path).unwrap()).unwrap();
            let mut read = |name: &str| {
                let mut content = String::new();
                archive.by_name(name).unwrap().read_to_string(&mut content).unwrap();
                serde_json::from_str::<Value>(&content).unwrap()
            };
            let manifest = read("manifest.json");
            assert_eq!(manifest["mode"], result.mode);
            assert_eq!(manifest["files"], json!(result.files));
            assert_eq!(manifest["missingSnapshots"], json!(["settings.json", "startup-behavior:settings.general.startOnBoot"]));
            let record = read("source-test.ndjson");
            assert_eq!(record["sessionId"], "launch-evidence");
            assert!(record["data"].get("sessionId").is_none());
            assert!(record["data"].get("cookie").is_none());
            assert_eq!(record["data"]["paths"], json!(["safe"]));
            assert_eq!(read("diagnostics.json")["flush"], expected_flush);
            assert_eq!(read("environment.json")["paths"], json!(["safe"]));
            assert_eq!(read("feature-manifest.json")["missingSnapshots"], json!([{"featureId":"startup-behavior","key":"settings.general.startOnBoot"}]));
            drop(read);
            assert!(archive.by_name("settings.json").is_err());
            for name in &result.files { assert!(archive.by_name(name).is_ok()); }
            println!("ZIP evidence: {} mode={} bytes={} files={} missing={}", result.output_path, result.mode, result.bytes, manifest["files"], manifest["missingSnapshots"]);
        }
        println!("Rust DTO: {}", dto);
        assert_eq!(dto["missing_snapshots"], json!(["settings.json", "startup-behavior:settings.general.startOnBoot"]));
    }
    #[test]
    fn exported_snapshot_gaps_include_fields_removed_by_redaction() {
        let root = std::env::temp_dir().join(format!("danmu-snapshot-gaps-{}-{}", std::process::id(), SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()));
        fs::create_dir_all(&root).unwrap();
        let snapshot = json!({"environment":null, "settings":{}, "diagnostics":{},
            "featureManifest":{"features":[{"id":"voice", "snapshotSchema":{"keys":["runtime.path"]}}],
                "snapshots":{"voice":{"runtime":{"path":"C:\\private\\audio.wav"}}}, "missingSnapshots":[]}});
        let result = export_bundle_from_directory(&root, root.join("bundle.zip").to_string_lossy().into(), "full".into(), Some(snapshot), None).unwrap();
        let dto = serde_json::to_value(result).unwrap();
        assert_eq!(dto["missing_snapshots"], json!(["environment.json", "voice:runtime.path"]));
    }
    #[test]
    fn tts_envelope_preserves_launch_session_without_sequence() {
        let record = json!({"t":2000000000000u64, "kind":"tts", "requestId":"request-1", "provider":"fish", "stage":"complete", "sessionId":"launch-tts"});
        let filtered = filter_ndjson_with_context(&record.to_string(), BundleMode::Full, 2000000000000, false);
        assert_eq!(serde_json::from_str::<Value>(filtered.content.trim()).unwrap()["sessionId"], "launch-tts");
    }
    #[test]
    fn timestamp_counts() {
        let r=filter_ndjson_with_context("{\"timestamp\":2000000000000}\n{\"x\":1}\n{\"timestamp\":2100000000000}\n{\"timestamp\":1900000000000}",BundleMode::Diagnostic24h,2000000000000, false);
        assert_eq!((r.line_count, r.parse_failures, r.discarded), (1, 1, 2))
    }
    #[test]
    fn t_field_and_second_precision_are_supported() {
        let r=filter_ndjson_with_context(
            "{\"t\":1999999999000}\n{\"t\":\"1999999998\"}\n{\"t\":\"not-a-time\"}",
            BundleMode::Diagnostic24h,
            2000000000000,
            false,
        );
        assert_eq!((r.line_count, r.parse_failures, r.discarded), (2, 1, 0))
    }
    #[test]
    fn status_reflects_capacity_and_write_failures() {
        assert_eq!(diagnostic_status(LOG_LIMIT - 1, 0, 0), "healthy");
        assert_eq!(diagnostic_status(LOG_LIMIT, 0, 0), "full");
        assert_eq!(diagnostic_status(0, 0, 1), "degraded");
    }
    #[test]
    fn status_separates_normal_and_detailed_log_limits() {
        assert_eq!(diagnostic_status(0, DETAIL_LIMIT - 1, 0), "healthy");
        assert_eq!(diagnostic_status(0, DETAIL_LIMIT, 0), "full");
        assert_eq!(diagnostic_status(0, 0, 1), "degraded");
    }
    #[test]
    fn webview_runtime_info_has_an_explicit_source() {
        let info = webview_runtime_info();
        assert_eq!(
            info.source,
            if info.version.is_some() {
                "windows-registry"
            } else {
                "unavailable"
            }
        );
        #[cfg(windows)]
        if let Some(version) = info.version {
            assert!(version
                .chars()
                .next()
                .is_some_and(|value| value.is_ascii_digit()));
        }
    }
    #[test]
    fn feature_manifest_reports_nested_missing_snapshot_keys() {
        let snapshot = json!({
            "featureManifest": {
                "features": [{
                    "id": "startup-behavior",
                    "snapshotSchema": {"version": 1, "keys": [
                        "settings.general.startOnBoot",
                        "settings.general.autoConnectOnStartup"
                    ]}
                }],
                "snapshots": {
                    "startup-behavior": {
                        "settings": {
                            "general": {
                                "autoConnectOnStartup": false
                            }
                        }
                    }
                },
                "missingSnapshots": []
            }
        });
        assert_eq!(
            feature_manifest_missing_snapshot_keys(&snapshot),
            vec!["startup-behavior:settings.general.startOnBoot"]
        );
    }
    #[test]
    fn manifest_includes_build_id_and_feature_snapshot_gaps() {
        let snapshot = json!({
            "build": "development",
            "buildId": "abc123-dirty",
            "featureManifest": {
                "features": [{
                    "id": "startup-behavior",
                    "snapshotSchema": {"version": 1, "keys": ["settings.general.startOnBoot"]}
                }],
                "snapshots": {"startup-behavior": {}},
                "missingSnapshots": []
            }
        });
        let missing = feature_manifest_missing_snapshot_keys(&snapshot);
        let value = manifest(
            "24h",
            "development",
            "abc123-dirty",
            vec![],
            missing,
            0,
            0,
            0,
            0,
            0,
            0,
            false,
            0,
            1,
        );
        assert_eq!(value["buildId"], "abc123-dirty");
        assert_eq!(value["missingSnapshots"], json!(["startup-behavior:settings.general.startOnBoot"]));
    }
    #[test]
    fn cleanup_selects_expired_normal_logs_only() {
        let now = UNIX_EPOCH + Duration::from_secs(10 * DAY);
        let x = vec![
            e("app-a.ndjson", LOG_LIMIT, 9 * DAY),
            e("app-b.ndjson", 1, 9 * DAY + 1),
            e("conn-a.ndjson", 300, 4 * DAY),
        ];
        let removed = cleanup_candidates(&x, now);
        assert!(removed.iter().any(|entry| entry.name == "app-a.ndjson"));
        assert!(!removed.iter().any(|entry| entry.name == "conn-a.ndjson"));
    }
    #[test]
    fn normal_cleanup_keeps_active_logs_even_when_they_exceed_the_limit() {
        let now = UNIX_EPOCH + Duration::from_secs(10 * DAY);
        let active = e("app-active.ndjson", LOG_LIMIT + 1, 10 * DAY - 60);
        assert!(cleanup_candidates(&[active.clone()], now).is_empty());
        let removed = cleanup_candidates(&[e("app-old.ndjson", 1, 8 * DAY), active], now);
        assert_eq!(removed.len(), 1);
        assert_eq!(removed[0].name, "app-old.ndjson");
    }
    #[test]
    fn detailed_cleanup_keeps_recent_files_and_removes_expired_or_over_limit_files() {
        let now = UNIX_EPOCH + Duration::from_secs(10 * DAY);
        let x = vec![
            e("source-old.ndjson", DETAIL_LIMIT / 2, 6 * DAY),
            e("render-old.ndjson", DETAIL_LIMIT / 2, 6 * DAY + 1),
            e("source-recent.ndjson", 1, 9 * DAY),
        ];
        let removed = select_old_detailed_files(&x, DETAIL_LIMIT, now);
        assert_eq!(removed.len(), 2);
        assert!(removed.iter().any(|entry| entry.name == "source-old.ndjson"));
        assert!(removed.iter().any(|entry| entry.name == "render-old.ndjson"));
        assert!(!removed.iter().any(|entry| entry.name == "source-recent.ndjson"));
    }
    #[test]
    fn recent_export_includes_source_and_render_streams() {
        let files = select_bundle_files(
            BundleMode::Diagnostic24h,
            &[
                e("app-20260914.ndjson", 1, 10 * DAY),
                e("source-20260914.ndjson", 1, 10 * DAY),
                e("render-20260914.ndjson", 1, 10 * DAY),
            ],
        );
        assert!(files.iter().any(|name| name == "source-20260914.ndjson"));
        assert!(files.iter().any(|name| name == "render-20260914.ndjson"));
    }
    #[test]
    fn manifest_fields() {
        let m = manifest("24h", "test-build", "test-build-id", vec![], vec!["settings.json".into()], 1, 2, 3, 4, 5, 6, true, 8, 9);
        assert_eq!(m["build"], "test-build");
        assert_eq!(m["buildId"], "test-build-id");
        assert_eq!(m["missingSnapshots"], json!(["settings.json"]));
        assert_eq!(m["mode"], "24h");
        assert_eq!(m["bundleScope"], "diagnostics-24h");
        assert_eq!(m["sourceRenderBoundary"], "recent-24h");
        assert_eq!(m["timeRangeStart"], 8u64.saturating_sub(86400000));
        assert_eq!(m["timeRangeEnd"], 8);
        assert_eq!(m["export"]["phase"], "complete");
        assert_eq!(m["export"]["startedAt"], 8);
        assert_eq!(m["export"]["endedAt"], 9);
        for k in [
            "version",
            "build",
            "buildId",
            "mode",
            "bundleScope",
            "timeRange",
            "timeRangeStart",
            "timeRangeEnd",
            "includedStreams",
            "sourceRenderBoundary",
            "files",
            "missingSnapshots",
            "lineCount",
            "parseFailures",
            "readFailures",
            "writeFailures",
            "discarded",
            "truncated",
            "abnormalExit",
            "export",
        ] {
            assert!(m.get(k).is_some())
        }
    }
    #[test]
    fn manifest_uses_export_failures_and_successful_files() {
        let m = manifest(
            "full",
            "production",
            "production-build-id",
            vec!["app-ok.ndjson".into()],
            vec![],
            2,
            1,
            2,
            4,
            3,
            0,
            false,
            8,
            9,
        );
        assert_eq!(m["files"], json!(["app-ok.ndjson"]));
        assert_eq!(m["readFailures"], 2);
        assert_eq!(m["writeFailures"], 4)
    }
    #[test]
    fn snapshot_entries_are_written_to_zip_and_redacted() {
        let snapshot = json!({
            "environment": {"appVersion": "0.1.1", "audioPath": "D:\\secret\\voice.wav", "apiKey": "secret"},
            "settings": {"engine": "fish-audio", "endpoint": "https://example.test/tts"},
            "diagnostics": {"healthBeforeFlush": {"pending": 1, "accessToken": "secret"}, "flush": {"flushed": 3}},
            "featureManifest": {"version": 1, "features": [], "snapshots": {"voice": {"apiKey": "secret", "enabled": true}}, "missingSnapshots": []}
        });
        let mut zip = zip::ZipWriter::new(Cursor::new(Vec::<u8>::new()));
        let mut files = Vec::new();
        write_snapshot_entries(&mut zip, &snapshot, zip::write::SimpleFileOptions::default(), &mut files).unwrap();
        let bytes = zip.finish().unwrap().into_inner();
        assert_eq!(files, vec!["environment.json", "settings.json", "diagnostics.json", "feature-manifest.json"]);

        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        let mut environment = String::new();
        archive.by_name("environment.json").unwrap().read_to_string(&mut environment).unwrap();
        let environment: Value = serde_json::from_str(&environment).unwrap();
        assert_eq!(environment["appVersion"], "0.1.1");
        assert!(environment.get("audioPath").is_none());
        assert!(environment.get("apiKey").is_none());

        let mut diagnostics = String::new();
        archive.by_name("diagnostics.json").unwrap().read_to_string(&mut diagnostics).unwrap();
        let diagnostics: Value = serde_json::from_str(&diagnostics).unwrap();
        assert_eq!(diagnostics["flush"]["flushed"], 3);
        assert!(diagnostics["healthBeforeFlush"].get("accessToken").is_none());

        let mut feature_manifest = String::new();
        archive.by_name("feature-manifest.json").unwrap().read_to_string(&mut feature_manifest).unwrap();
        let feature_manifest: Value = serde_json::from_str(&feature_manifest).unwrap();
        assert_eq!(feature_manifest["version"], 1);
        assert!(feature_manifest["snapshots"]["voice"].get("apiKey").is_none());
    }
    #[test]
    fn feature_manifest_snapshot_file_is_repaired_at_export_boundary() {
        let snapshot = json!({
            "featureManifest": {
                "version": 1,
                "features": [{
                    "id": "startup-behavior",
                    "snapshotSchema": {"version": 1, "keys": ["settings.general.startOnBoot"]}
                }],
                "snapshots": {"startup-behavior": {}},
                "missingSnapshots": []
            }
        });
        let mut zip = zip::ZipWriter::new(Cursor::new(Vec::<u8>::new()));
        let mut files = Vec::new();
        write_snapshot_entries(&mut zip, &snapshot, zip::write::SimpleFileOptions::default(), &mut files).unwrap();
        let bytes = zip.finish().unwrap().into_inner();
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        let mut content = String::new();
        archive.by_name("feature-manifest.json").unwrap().read_to_string(&mut content).unwrap();
        let manifest: Value = serde_json::from_str(&content).unwrap();
        assert_eq!(
            manifest["missingSnapshots"],
            json!([{"featureId": "startup-behavior", "key": "settings.general.startOnBoot"}])
        );
    }
    #[test]
    fn marker_export_status_distinguishes_complete_and_incomplete_collection() {
        let marker = "{\"timestamp\":500000000000,\"kind\":\"marker\",\"markedAt\":500000000000,\"start\":499999880000,\"end\":500000180000,\"status\":\"collecting\"}";
        let complete = filter_ndjson_with_context(marker, BundleMode::Diagnostic24h, 500000180000, false);
        let incomplete = filter_ndjson_with_context(marker, BundleMode::Diagnostic24h, 500000100000, false);
        let abnormal = filter_ndjson_with_context(marker, BundleMode::Diagnostic24h, 500000200000, true);
        assert_eq!(serde_json::from_str::<Value>(complete.content.trim()).unwrap()["status"], "complete");
        assert_eq!(serde_json::from_str::<Value>(incomplete.content.trim()).unwrap()["status"], "incomplete");
        assert_eq!(serde_json::from_str::<Value>(abnormal.content.trim()).unwrap()["status"], "incomplete");
    }
    #[test]
    fn export_write_errors_name_stage_and_per_export_counter() {
        let error = export_write_error("rename", "destination exists");
        assert!(error.contains("writeFailures=1"));
        assert!(error.contains("stage=rename"));
    }

    #[test]
    fn existing_output_gets_numeric_suffix_without_overwrite() {
        let root = std::env::temp_dir().join(format!("danmu-export-test-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let output = root.join("diagnostic.zip");
        File::create(&output).unwrap();
        let first = next_available_export_path(&output);
        assert_eq!(first, root.join("diagnostic (1).zip"));
        File::create(&first).unwrap();
        let second = next_available_export_path(&output);
        assert_eq!(second, root.join("diagnostic (2).zip"));
        let _ = fs::remove_dir_all(root);
    }
}
