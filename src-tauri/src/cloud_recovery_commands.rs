use crate::cloud_recovery_binding::load_recovery_access;
use crate::cloud_recovery_cache::RecoveryCache;
use crate::cloud_recovery_transport::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};
use tokio::sync::{Mutex, Semaphore};
use base64::Engine;

fn cover_reference(server_id: &str, resource_id: &str, mime_type: &str) -> Result<String, String> {
    if !valid_uuid(server_id) || !valid_uuid(resource_id) {
        return Err("封面编号无效".into());
    }
    let extension = match mime_type {
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/webp" => "webp",
        _ => return Err("封面格式不受支持".into()),
    };
    Ok(format!("cloud-cover://{server_id}/{resource_id}.{extension}"))
}

fn cover_parts(reference: &str) -> Result<(&str, &str, &str), String> {
    let (server, file) = reference.strip_prefix("cloud-cover://")
        .and_then(|value| value.split_once('/')).ok_or("封面地址无效")?;
    let (resource, extension) = file.rsplit_once('.').ok_or("封面地址无效")?;
    let mime = match extension {
        "jpg" => "image/jpeg", "png" => "image/png", "webp" => "image/webp",
        _ => return Err("封面格式不受支持".into()),
    };
    cover_reference(server, resource, mime)?;
    Ok((server, file, mime))
}

fn local_cover_path(app: &AppHandle, reference: &str) -> Result<PathBuf, String> {
    let (server, file, _) = cover_parts(reference)?;
    Ok(crate::data_paths::root().map_err(|_| "无法读取封面目录")?
        .join("archive-resources").join("covers").join(server).join(file))
}

#[tauri::command]
pub async fn download_cloud_recovery_cover(app: AppHandle, state: State<'_, RecoveryTransportState>,
    server_id: String, resource_id: String, mime_type: String) -> Result<String, String> {
    let reference = cover_reference(&server_id, &resource_id, &mime_type)?;
    let path = local_cover_path(&app, &reference)?;
    if path.is_file() { return Ok(reference); }
    let access = NativeRecoveryAccess { app: app.clone() };
    let stamp = load_recovery_access(&app)?.stamp;
    if stamp.server_id != server_id { return Err("请连接保存此封面的服务器后重试".into()); }
    let reply = request_bound(&access, &stamp, &RecoveryCancellation::default(), &state.slots,
        reqwest::Method::GET, &format!("api/v1/resources/{resource_id}"), None,
        8 * 1024 * 1024, &mime_type, None).await?;
    let directory = path.parent().ok_or("无法读取封面目录")?;
    fs::create_dir_all(directory).map_err(|_| "无法创建封面目录")?;
    let temporary = directory.join(format!("{}.partial", uuid::Uuid::new_v4()));
    fs::write(&temporary, &reply.bytes).map_err(|_| "无法保存封面，请检查磁盘空间")?;
    fs::rename(&temporary, &path).map_err(|_| "无法保存封面，请稍后重试")?;
    Ok(reference)
}

#[tauri::command]
pub fn read_cloud_recovery_cover(app: AppHandle, reference: String) -> Result<String, String> {
    let (_, _, mime) = cover_parts(&reference)?;
    let bytes = fs::read(local_cover_path(&app, &reference)?).map_err(|_| "封面尚未保存，请重试封面")?;
    Ok(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
}

#[tauri::command]
pub async fn list_cloud_recovery_covers(app: AppHandle, state: State<'_, RecoveryTransportState>,
    session_id: String) -> Result<serde_json::Value, String> {
    if !valid_uuid(&session_id) { return Err("场次编号无效".into()); }
    let stamp = load_recovery_access(&app)?.stamp;
    let items = cloud_json_request(&app, &state, reqwest::Method::GET,
        &format!("api/v1/sessions/{session_id}/covers"), None).await?;
    if load_recovery_access(&app)?.stamp.server_id != stamp.server_id {
        return Err("服务器已切换，请重新打开恢复窗口".into());
    }
    Ok(serde_json::json!({"serverId": stamp.server_id, "items": items["items"]}))
}

async fn cloud_json_request(
    app: &AppHandle,
    state: &RecoveryTransportState,
    method: reqwest::Method,
    suffix: &str,
    body: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let access = NativeRecoveryAccess { app: app.clone() };
    let stamp = load_recovery_access(app)?.stamp;
    let body = body
        .map(|value| serde_json::to_vec(&value).map_err(|_| "invalid_request".to_owned()))
        .transpose()?;
    let reply = request_bound(
        &access,
        &stamp,
        &RecoveryCancellation::default(),
        &state.slots,
        method,
        suffix,
        body,
        1024 * 1024,
        "application/json",
        None,
    )
    .await?;
    serde_json::from_slice(&reply.bytes).map_err(|_| "invalid_server_response".into())
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecoveryJobRecord {
    local_job_id: String,
    room_id: String,
    stamp: RecoveryBindingStamp,
    request: CreateRecoveryRequest,
    info: RecoveryInfo,
    created: RecoveryCreated,
    #[serde(default)]
    cache_handles: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartedRecovery {
    local_job_id: String,
    room_id: String,
    created: RecoveryCreated,
}

pub(crate) struct RecoveryTransportState {
    sessions: Mutex<BTreeMap<String, Arc<RecoverySession>>>,
    cache: Mutex<Option<RecoveryCache>>,
    slots: Arc<Semaphore>,
}

impl Default for RecoveryTransportState {
    fn default() -> Self {
        Self {
            sessions: Mutex::new(BTreeMap::new()),
            cache: Mutex::new(None),
            slots: Arc::new(Semaphore::new(2)),
        }
    }
}

struct NativeRecoveryAccess {
    app: AppHandle,
}

impl RecoveryAccessProvider for NativeRecoveryAccess {
    async fn access(&self) -> Result<RecoveryAccess, String> {
        load_recovery_access(&self.app)
    }
}

fn jobs_directory(app: &AppHandle) -> Result<PathBuf, String> {
    crate::data_paths::root()
        .map(|directory| directory.join("cloud-recovery").join("jobs"))
        .map_err(|_| "recovery_storage_io".into())
}

fn job_path(app: &AppHandle, local_job_id: &str) -> Result<PathBuf, String> {
    if !valid_uuid(local_job_id) {
        return Err("invalid_job_id".into());
    }
    Ok(jobs_directory(app)?.join(format!("{local_job_id}.json")))
}

fn save_job(path: &Path, record: &RecoveryJobRecord) -> Result<(), String> {
    let parent = path.parent().ok_or("recovery_storage_io")?;
    fs::create_dir_all(parent).map_err(|_| "recovery_storage_io")?;
    let bytes = serde_json::to_vec(record).map_err(|_| "recovery_storage_io")?;
    fs::write(path, bytes).map_err(|_| "recovery_storage_io".into())
}

fn read_job(path: &Path) -> Result<RecoveryJobRecord, String> {
    let bytes = fs::read(path).map_err(|_| "recovery_job_not_found")?;
    serde_json::from_slice(&bytes).map_err(|_| "recovery_storage_corrupt".into())
}

async fn release_recovery_job_files(
    session: &RecoverySession,
    cache: &RecoveryCache,
    job_path: &Path,
    cache_handles: &[String],
) -> Result<(), String> {
    for handle in cache_handles {
        let descriptor = cache.descriptor(handle).await?;
        if session.cache_handle(&descriptor)? != *handle {
            return Err("invalid_cache_handle".into());
        }
    }
    let metadata = fs::symlink_metadata(job_path).map_err(|_| "recovery_job_not_found")?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err("recovery_storage_corrupt".into());
    }
    cache.release_handles(cache_handles).await?;
    fs::remove_file(job_path).map_err(|_| "recovery_storage_io".to_owned())
}

impl RecoveryTransportState {
    async fn cache(&self, app: &AppHandle) -> Result<RecoveryCache, String> {
        let mut cache = self.cache.lock().await;
        if cache.is_none() {
            let directory = app
                .path()
                .app_cache_dir()
                .map_err(|_| "recovery_cache_io")?
                .join("history-recovery-v02");
            *cache = Some(RecoveryCache::new(directory, 2 * 1024 * 1024 * 1024));
        }
        Ok(cache.as_ref().expect("cache initialized").clone())
    }

    async fn open_session(
        &self,
        app: &AppHandle,
        local_job_id: &str,
    ) -> Result<Arc<RecoverySession>, String> {
        if let Some(session) = self.sessions.lock().await.get(local_job_id).cloned() {
            session.cancel.check()?;
            return Ok(session);
        }
        let record = read_job(&job_path(app, local_job_id)?)?;
        let access = load_recovery_access(app)?;
        if access.stamp != record.stamp {
            return Err("binding_changed".into());
        }
        let session = Arc::new(RecoverySession::restore(
            record.stamp,
            record.room_id,
            record.request,
            record.info,
            record.created,
            RecoveryCancellation::default(),
            self.slots.clone(),
        )?);
        self.sessions
            .lock()
            .await
            .insert(local_job_id.to_owned(), session.clone());
        Ok(session)
    }
}

#[tauri::command]
pub async fn start_cloud_recovery_job(
    app: AppHandle,
    state: State<'_, RecoveryTransportState>,
    room_id: String,
    mode: String,
    from_cut_id: Option<String>,
    selection: RecoverySelection,
) -> Result<StartedRecovery, String> {
    if !valid_decimal(&room_id) || room_id == "0" {
        return Err("invalid_room_id".into());
    }
    if mode != "baseline" && mode != "delta" {
        return Err("invalid_request".into());
    }
    if mode == "baseline" && from_cut_id.is_some()
        || mode == "delta"
            && from_cut_id
                .as_deref()
                .is_none_or(|value| !valid_uuid(value))
        || mode == "delta" && !selection.is_all()
    {
        return Err("invalid_request".into());
    }
    let local_job_id = uuid::Uuid::new_v4().to_string();
    let access = NativeRecoveryAccess { app: app.clone() };
    let stamp = load_recovery_access(&app)?.stamp;
    let request = CreateRecoveryRequest {
        request_id: uuid::Uuid::new_v4().to_string(),
        mode,
        expected_server_id: stamp.server_id.clone(),
        from_cut_id,
        selection,
    };
    let session = Arc::new(
        RecoverySession::start(
            &access,
            &room_id,
            request.clone(),
            RecoveryCancellation::default(),
            state.slots.clone(),
        )
        .await?,
    );
    let record = RecoveryJobRecord {
        local_job_id: local_job_id.clone(),
        room_id: room_id.clone(),
        stamp,
        request,
        info: session.info.clone(),
        created: session.created.clone(),
        cache_handles: Vec::new(),
    };
    save_job(&job_path(&app, &local_job_id)?, &record)?;
    state
        .sessions
        .lock()
        .await
        .insert(local_job_id.clone(), session.clone());
    Ok(StartedRecovery {
        local_job_id,
        room_id,
        created: session.created.clone(),
    })
}

#[tauri::command]
pub async fn list_cloud_recovery_sessions(
    app: AppHandle,
    state: State<'_, RecoveryTransportState>,
    room_id: String,
    cursor: Option<String>,
) -> Result<serde_json::Value, String> {
    if !valid_decimal(&room_id)
        || room_id == "0"
        || cursor.as_ref().is_some_and(|value| {
            value
                .split_once('.')
                .is_none_or(|(time, id)| !valid_decimal(time) || !valid_uuid(id))
        })
    {
        return Err("invalid_request".into());
    }
    let access = NativeRecoveryAccess { app: app.clone() };
    let stamp = load_recovery_access(&app)?.stamp;
    let mut suffix = format!("api/v1/rooms/{room_id}/sessions?limit=50");
    if let Some(cursor) = cursor {
        suffix.push_str("&after=");
        suffix.push_str(&cursor);
    }
    let reply = request_bound(
        &access,
        &stamp,
        &RecoveryCancellation::default(),
        &state.slots,
        reqwest::Method::GET,
        &suffix,
        None,
        1024 * 1024,
        "application/json",
        None,
    )
    .await?;
    let value: serde_json::Value =
        serde_json::from_slice(&reply.bytes).map_err(|_| "invalid_session_page")?;
    if !value.get("items").is_some_and(|items| items.is_array())
        || !value.get("hasMore").is_some_and(|item| item.is_boolean())
        || !value.get("metadataRevision").is_some()
    {
        return Err("invalid_session_page".into());
    }
    Ok(value)
}

#[tauri::command]
pub async fn load_cloud_server_health(
    app: AppHandle,
    state: State<'_, RecoveryTransportState>,
) -> Result<serde_json::Value, String> {
    cloud_json_request(&app, &state, reqwest::Method::GET, "api/v1/health", None).await
}

#[tauri::command]
pub async fn load_cloud_auth_status(
    app: AppHandle,
    state: State<'_, RecoveryTransportState>,
) -> Result<serde_json::Value, String> {
    cloud_json_request(&app, &state, reqwest::Method::GET, "api/v1/auth/status", None).await
}

#[tauri::command]
pub async fn list_cloud_rooms(
    app: AppHandle,
    state: State<'_, RecoveryTransportState>,
) -> Result<serde_json::Value, String> {
    cloud_json_request(&app, &state, reqwest::Method::GET, "api/v1/rooms", None).await
}

#[tauri::command]
pub async fn enable_cloud_room(
    app: AppHandle,
    state: State<'_, RecoveryTransportState>,
    room_id: String,
) -> Result<serde_json::Value, String> {
    if !valid_decimal(&room_id) || room_id == "0" {
        return Err("invalid_room_id".into());
    }
    cloud_json_request(
        &app,
        &state,
        reqwest::Method::POST,
        "api/v1/rooms",
        Some(serde_json::json!({ "room_id": room_id })),
    )
    .await
}

#[tauri::command]
pub async fn stop_cloud_room(
    app: AppHandle,
    state: State<'_, RecoveryTransportState>,
    room_id: String,
) -> Result<serde_json::Value, String> {
    if !valid_decimal(&room_id) || room_id == "0" {
        return Err("invalid_room_id".into());
    }
    cloud_json_request(
        &app,
        &state,
        reqwest::Method::DELETE,
        &format!("api/v1/rooms/{room_id}"),
        None,
    )
    .await
}

#[tauri::command]
pub async fn load_cloud_retention_settings(
    app: AppHandle,
    state: State<'_, RecoveryTransportState>,
) -> Result<serde_json::Value, String> {
    cloud_json_request(&app, &state, reqwest::Method::GET, "api/v1/settings", None).await
}

#[tauri::command]
pub async fn preview_cloud_retention(
    app: AppHandle,
    state: State<'_, RecoveryTransportState>,
    retention_days: Option<u32>,
) -> Result<serde_json::Value, String> {
    if retention_days.is_some_and(|days| days == 0 || days > 365000) {
        return Err("invalid_retention_days".into());
    }
    cloud_json_request(
        &app,
        &state,
        reqwest::Method::POST,
        "api/v1/settings/preview",
        Some(serde_json::json!({ "retentionDays": retention_days })),
    )
    .await
}

#[tauri::command]
pub async fn update_cloud_retention(
    app: AppHandle,
    state: State<'_, RecoveryTransportState>,
    retention_days: Option<u32>,
    confirmation_id: String,
) -> Result<serde_json::Value, String> {
    if retention_days.is_some_and(|days| days == 0 || days > 365000)
        || !valid_uuid(&confirmation_id)
    {
        return Err("invalid_retention_days".into());
    }
    cloud_json_request(
        &app,
        &state,
        reqwest::Method::PATCH,
        "api/v1/settings",
        Some(serde_json::json!({
            "retentionDays": retention_days,
            "confirmationId": confirmation_id,
        })),
    )
    .await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalBilibiliSessionSummary {
    uid: String,
    name: String,
    refresh_capable: bool,
}

fn local_bilibili_session(app: &AppHandle) -> Result<serde_json::Value, String> {
    let path = crate::data_paths::root()
        .map_err(|_| "local_session_unavailable")?
        .join("cookies.local.json");
    let bytes = fs::read(path).map_err(|_| "local_session_missing")?;
    let value: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|_| "local_session_unavailable")?;
    value
        .get("session")
        .cloned()
        .filter(|session| session.is_object())
        .ok_or_else(|| "local_session_missing".into())
}

#[tauri::command]
pub fn load_local_bilibili_session_summary(
    app: AppHandle,
) -> Result<LocalBilibiliSessionSummary, String> {
    let session = local_bilibili_session(&app)?;
    let uid = session
        .get("mid")
        .and_then(|value| value.as_str())
        .filter(|value| valid_decimal(value) && *value != "0")
        .ok_or("local_session_unavailable")?;
    let name = session
        .get("uname")
        .and_then(|value| value.as_str())
        .filter(|value| !value.is_empty() && value.len() <= 256)
        .ok_or("local_session_unavailable")?;
    let refresh_capable = session
        .get("refreshToken")
        .and_then(|value| value.as_str())
        .is_some_and(|value| !value.is_empty());
    Ok(LocalBilibiliSessionSummary {
        uid: uid.to_owned(),
        name: name.to_owned(),
        refresh_capable,
    })
}

#[tauri::command]
pub async fn sync_local_bilibili_session(
    app: AppHandle,
    state: State<'_, RecoveryTransportState>,
    expected_uid: String,
    replace_account: bool,
) -> Result<serde_json::Value, String> {
    let session = local_bilibili_session(&app)?;
    let uid = session
        .get("mid")
        .and_then(|value| value.as_str())
        .filter(|value| valid_decimal(value) && *value != "0")
        .ok_or("local_session_unavailable")?;
    let cookie = session
        .get("cookie")
        .and_then(|value| value.as_str())
        .filter(|value| !value.is_empty() && value.len() <= 16384)
        .ok_or("local_session_unavailable")?;
    let refresh_token = session
        .get("refreshToken")
        .and_then(|value| value.as_str())
        .filter(|value| !value.is_empty() && value.len() <= 4096)
        .ok_or("local_refresh_token_missing")?;
    if expected_uid != uid {
        return Err("local_account_changed".into());
    }
    cloud_json_request(
        &app,
        &state,
        reqwest::Method::PUT,
        "api/v1/auth/session",
        Some(serde_json::json!({
            "cookie": cookie,
            "refreshToken": refresh_token,
            "expectedUid": expected_uid,
            "replaceAccount": replace_account,
        })),
    )
    .await
}

#[tauri::command]
pub async fn create_cloud_bilibili_qr_session(
    app: AppHandle,
    state: State<'_, RecoveryTransportState>,
) -> Result<serde_json::Value, String> {
    cloud_json_request(
        &app,
        &state,
        reqwest::Method::POST,
        "api/v1/auth/qr-session",
        None,
    )
    .await
}

#[tauri::command]
pub async fn get_cloud_recovery_job_status(
    app: AppHandle,
    state: State<'_, RecoveryTransportState>,
    local_job_id: String,
) -> Result<RecoveryStatus, String> {
    let session = state.open_session(&app, &local_job_id).await?;
    let access = NativeRecoveryAccess { app: app.clone() };
    session.status(&access, &state.cache(&app).await?).await
}

#[tauri::command]
pub async fn download_cloud_recovery_object(
    app: AppHandle,
    state: State<'_, RecoveryTransportState>,
    local_job_id: String,
    object: RecoveryObject,
) -> Result<VerifiedObject, String> {
    let session = state.open_session(&app, &local_job_id).await?;
    object.validate()?;
    let cache_handle = session.cache_handle(&object)?;
    let path = job_path(&app, &local_job_id)?;
    let mut record = read_job(&path)?;
    if !record.cache_handles.contains(&cache_handle) {
        record.cache_handles.push(cache_handle);
        save_job(&path, &record)?;
    }
    let access = NativeRecoveryAccess { app: app.clone() };
    let verified = session
        .download(&access, &state.cache(&app).await?, &object)
        .await?;
    Ok(verified)
}

#[tauri::command]
pub async fn read_cloud_recovery_slice(
    app: AppHandle,
    state: State<'_, RecoveryTransportState>,
    local_job_id: String,
    cache_handle: String,
    offset: String,
    maximum: usize,
) -> Result<Vec<u8>, String> {
    let session = state.open_session(&app, &local_job_id).await?;
    let offset = offset
        .parse::<u64>()
        .map_err(|_| "invalid_slice".to_owned())?;
    if maximum == 0 || maximum > 65_536 {
        return Err("invalid_slice".into());
    }
    let cache = state.cache(&app).await?;
    let object = cache.descriptor(&cache_handle).await?;
    if session.cache_handle(&object)? != cache_handle {
        return Err("invalid_cache_handle".into());
    }
    cache
        .read_slice_object(&cache_handle, offset, maximum, &object)
        .await
}

#[tauri::command]
pub async fn cancel_cloud_recovery_job(
    app: AppHandle,
    state: State<'_, RecoveryTransportState>,
    local_job_id: String,
) -> Result<(), String> {
    if !valid_uuid(&local_job_id) {
        return Err("invalid_job_id".into());
    }
    if let Some(session) = state.sessions.lock().await.remove(&local_job_id) {
        session.cancel.cancel();
    }
    let path = job_path(&app, &local_job_id)?;
    if path.exists() {
        let record = read_job(&path)?;
        state
            .cache(&app)
            .await?
            .release_handles(&record.cache_handles)
            .await?;
        fs::remove_file(path).map_err(|_| "recovery_storage_io".to_owned())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn release_cloud_recovery_job(
    app: AppHandle,
    state: State<'_, RecoveryTransportState>,
    local_job_id: String,
) -> Result<(), String> {
    let session = state.open_session(&app, &local_job_id).await?;
    let cache = state.cache(&app).await?;
    let path = job_path(&app, &local_job_id)?;
    let record = read_job(&path)?;
    release_recovery_job_files(&session, &cache, &path, &record.cache_handles).await?;
    state.sessions.lock().await.remove(&local_job_id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cloud_recovery_cache::hex_hash;

    #[test]
    fn persistent_cover_references_are_server_scoped_and_do_not_contain_credentials() {
        let server = "00000000-0000-4000-8000-000000000001";
        let resource = "00000000-0000-4000-8000-000000000002";
        let reference = cover_reference(server, resource, "image/jpeg").unwrap();
        assert_eq!(cover_parts(&reference).unwrap(), (server, "00000000-0000-4000-8000-000000000002.jpg", "image/jpeg"));
        assert!(cover_reference(server, "../other", "image/jpeg").is_err());
        assert!(cover_reference(server, resource, "text/html").is_err());
        assert!(cover_parts("https://server/resource?token=x").is_err());
    }

    fn recovery_session(binding_id: &str) -> RecoverySession {
        let server_id = "00000000-0000-4000-8000-000000000001";
        RecoverySession::restore(
            RecoveryBindingStamp {
                binding_id: binding_id.into(),
                base_url: "https://example.invalid/".into(),
                server_id: server_id.into(),
                credential_ref: "cloud-recovery:test".into(),
            },
            "9007199254740993".into(),
            CreateRecoveryRequest {
                request_id: "00000000-0000-4000-8000-000000000010".into(),
                mode: "baseline".into(),
                expected_server_id: server_id.into(),
                from_cut_id: None,
                selection: RecoverySelection::All {
                    include_danmaku: true,
                    include_interactions: true,
                },
            },
            serde_json::from_value(serde_json::json!({
                "server_id": server_id,
                "service_version": "0.7.0",
                "protocol_version": "0.1.3",
                "recovery_contract_version": "0.3",
                "limits": {
                    "chunk_max_bytes": 2097152, "prefetch_chunks": 2,
                    "catalog_page_max_bytes": 262144, "catalog_fanout": 2,
                    "root_max_bytes": 16384, "object_max_bytes": 268435456,
                    "envelope_decode_max_bytes": 16777216, "snapshot_decode_max_bytes": 16777216,
                    "job_max_bytes": 1073741824u64, "global_max_bytes": 2147483648u64,
                    "job_ttl_seconds": 3600, "build_timeout_seconds": 300,
                    "freeze_timeout_ms": 5000, "active_builds_per_room": 1,
                    "workers": 1, "retained_jobs_max": 64,
                    "cut_ttl_seconds": 2592000, "cut_max_records": 100000
                }
            }))
            .unwrap(),
            RecoveryCreated {
                job_id: "00000000-0000-4000-8000-000000000011".into(),
                state: "building".into(),
                created_at: "2026-10-20T10:00:00.000Z".into(),
                expires_at: "2026-10-20T11:00:00.000Z".into(),
                status_url: "/api/v2/recovery-jobs/00000000-0000-4000-8000-000000000011".into(),
            },
            RecoveryCancellation::default(),
            Arc::new(Semaphore::new(2)),
        )
        .unwrap()
    }

    fn object(bytes: &[u8]) -> RecoveryObject {
        RecoveryObject {
            object_id: "00000000-0000-4000-8000-000000000100".into(),
            kind: "facts".into(),
            stream_id: "facts".into(),
            stream_ordinal: 0,
            media_type: "application/x-ndjson".into(),
            byte_size: bytes.len().to_string(),
            sha256: hex_hash(bytes),
            chunk_count: 1,
            chunks: vec![RecoveryChunk {
                index: 0,
                byte_size: bytes.len() as u64,
                sha256: hex_hash(bytes),
            }],
        }
    }

    #[test]
    fn release_job_files_requires_every_handle_to_belong_to_session() {
        tauri::async_runtime::block_on(async {
            let root =
                std::env::temp_dir().join(format!("colive-release-job-{}", uuid::Uuid::new_v4()));
            let cache = RecoveryCache::new(root.clone(), 4096);
            let owner = recovery_session("00000000-0000-4000-8000-000000000020");
            let other = recovery_session("00000000-0000-4000-8000-000000000021");
            let bytes = b"owned\n";
            let descriptor = object(bytes);
            let handle = owner.cache_handle(&descriptor).unwrap();
            cache
                .store_chunk(&handle, 0, &hex_hash(bytes), bytes)
                .await
                .unwrap();
            cache.publish_object(&handle, &descriptor).await.unwrap();
            let foreign_handle = other.cache_handle(&descriptor).unwrap();
            cache
                .store_chunk(&foreign_handle, 0, &hex_hash(bytes), bytes)
                .await
                .unwrap();
            cache
                .publish_object(&foreign_handle, &descriptor)
                .await
                .unwrap();
            let job_path = root
                .join("jobs")
                .join("00000000-0000-4000-8000-000000000030.json");
            std::fs::create_dir_all(job_path.parent().unwrap()).unwrap();
            std::fs::write(&job_path, b"job").unwrap();

            assert_eq!(
                release_recovery_job_files(
                    &owner,
                    &cache,
                    &job_path,
                    &[handle.clone(), foreign_handle.clone()],
                )
                .await
                .unwrap_err(),
                "invalid_cache_handle"
            );
            assert!(root.join(&handle).exists());
            assert!(root.join(&foreign_handle).exists());
            assert!(job_path.exists());

            release_recovery_job_files(&owner, &cache, &job_path, &[handle.clone()])
                .await
                .unwrap();
            assert!(!root.join(&handle).exists());
            assert!(root.join(&foreign_handle).exists());
            assert!(!job_path.exists());
        });
    }
}
