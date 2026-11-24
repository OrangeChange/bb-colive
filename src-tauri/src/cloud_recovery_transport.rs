use crate::cloud_recovery_cache::valid_hash;
use crate::cloud_recovery_cache::{hex_hash, RecoveryCache};
use reqwest::{Client, Method, Url};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::watch;
use tokio::sync::Semaphore;
use tokio::time::Instant;
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct RecoveryLimits {
    pub chunk_max_bytes: u64,
    pub prefetch_chunks: u64,
    pub catalog_page_max_bytes: u64,
    pub catalog_fanout: u64,
    pub root_max_bytes: u64,
    pub object_max_bytes: u64,
    pub envelope_decode_max_bytes: u64,
    pub snapshot_decode_max_bytes: u64,
    pub job_max_bytes: u64,
    pub global_max_bytes: u64,
    pub job_ttl_seconds: u64,
    pub build_timeout_seconds: u64,
    pub freeze_timeout_ms: u64,
    pub active_builds_per_room: u64,
    pub workers: u64,
    pub retained_jobs_max: u64,
    pub cut_ttl_seconds: u64,
    pub cut_max_records: u64,
}
impl RecoveryLimits {
    pub(crate) fn validate(&self) -> Result<(), String> {
        let values = serde_json::to_value(self).map_err(|_| "invalid_info")?;
        if values
            .as_object()
            .unwrap()
            .values()
            .any(|n| n.as_u64().is_none_or(|v| v == 0 || v > 9007199254740991))
            || self.chunk_max_bytes > 2097152
            || self.prefetch_chunks != 2
            || self.catalog_page_max_bytes > 262144
            || !(2..=64).contains(&self.catalog_fanout)
            || self.root_max_bytes > 16384
            || self.object_max_bytes > 268435456
            || self.object_max_bytes > 128 * self.chunk_max_bytes
            || self.envelope_decode_max_bytes > 16777216
            || self.snapshot_decode_max_bytes > 16777216
            || self.snapshot_decode_max_bytes > self.object_max_bytes
            || self.job_max_bytes > self.global_max_bytes
            || self.active_builds_per_room != 1
            || self.workers != 1
            || self.freeze_timeout_ms > 5000
            || self.build_timeout_seconds > 300
        {
            return Err("invalid_info".into());
        }
        Ok(())
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct RecoveryInfo {
    pub server_id: String,
    pub service_version: String,
    pub protocol_version: String,
    pub recovery_contract_version: String,
    pub limits: RecoveryLimits,
}
pub(crate) fn valid_uuid(value: &str) -> bool {
    value.len() == 36
        && value.bytes().enumerate().all(|(i, b)| {
            if [8, 13, 18, 23].contains(&i) {
                b == b'-'
            } else {
                b.is_ascii_digit() || (b'a'..=b'f').contains(&b)
            }
        })
}
pub(crate) fn valid_decimal(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 19
        && (value == "0" || !value.starts_with('0'))
        && value.bytes().all(|b| b.is_ascii_digit())
        && value.parse::<i64>().is_ok()
}
pub(crate) fn validate_info_bytes(bytes: &[u8], expected: &str) -> Result<RecoveryInfo, String> {
    if bytes.len() > 16384 {
        return Err("invalid_info".into());
    }
    let info: RecoveryInfo = serde_json::from_slice(bytes).map_err(|_| "invalid_info")?;
    if !valid_uuid(&info.server_id)
        || info.protocol_version != "0.1.3"
        || info.recovery_contract_version != "0.3"
        || info.service_version.is_empty()
    {
        return Err("invalid_info".into());
    }
    if info.server_id != expected {
        return Err("server_identity_changed".into());
    }
    info.limits.validate()?;
    Ok(info)
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct RecoveryChunk {
    pub index: u32,
    pub byte_size: u64,
    pub sha256: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct RecoveryObject {
    pub object_id: String,
    pub kind: String,
    pub stream_id: String,
    pub stream_ordinal: u64,
    pub media_type: String,
    pub byte_size: String,
    pub sha256: String,
    pub chunk_count: u32,
    pub chunks: Vec<RecoveryChunk>,
}
impl RecoveryObject {
    pub(crate) fn validate(&self) -> Result<(), String> {
        if !valid_uuid(&self.object_id)
            || !valid_hash(&self.sha256)
            || !valid_decimal(&self.byte_size)
            || self.byte_size.parse::<u64>().unwrap() > 268435456
            || !matches!(
                self.kind.as_str(),
                "facts"
                    | "baseline"
                    | "effects"
                    | "snapshot"
                    | "catalog_index"
                    | "catalog_leaf"
                    | "root"
            )
            || self.chunk_count == 0
            || self.chunk_count > 128
            || self.chunks.len() != self.chunk_count as usize
            || self.stream_ordinal > 9007199254740991
        {
            return Err("invalid_object".into());
        }
        match self.kind.as_str() {
            "snapshot" => {
                if self.media_type != "application/json"
                    || !valid_uuid(&self.stream_id)
                    || self.byte_size.parse::<u64>().unwrap() > 16777216
                {
                    return Err("invalid_object".into());
                }
            }
            "catalog_index" | "catalog_leaf" | "root" => {
                if self.media_type != "application/json"
                    || self.chunk_count != 1
                    || self.byte_size.parse::<u64>().unwrap()
                        > if self.kind == "root" { 16384 } else { 262144 }
                {
                    return Err("invalid_object".into());
                }
            }
            _ => {
                if self.media_type != "application/x-ndjson" || self.stream_id != self.kind {
                    return Err("invalid_object".into());
                }
            }
        }
        let mut size = 0u64;
        for (i, c) in self.chunks.iter().enumerate() {
            if c.index as usize != i || c.byte_size > 2097152 || !valid_hash(&c.sha256) {
                return Err("invalid_object".into());
            }
            size += c.byte_size;
        }
        if size != self.byte_size.parse::<u64>().unwrap() {
            return Err("invalid_object".into());
        }
        Ok(())
    }
}
#[derive(Debug, Clone)]
pub(crate) struct RecoveryCancellation {
    sender: watch::Sender<bool>,
}
impl Default for RecoveryCancellation {
    fn default() -> Self {
        let (sender, _) = watch::channel(false);
        Self { sender }
    }
}
impl RecoveryCancellation {
    pub(crate) fn cancel(&self) {
        self.sender.send_replace(true);
    }
    pub(crate) fn check(&self) -> Result<(), String> {
        if *self.sender.borrow() {
            Err("recovery_cancelled".into())
        } else {
            Ok(())
        }
    }
    pub(crate) async fn cancelled(&self) {
        let mut receiver = self.sender.subscribe();
        while !*receiver.borrow_and_update() {
            if receiver.changed().await.is_err() {
                return;
            }
        }
    }
    pub(crate) async fn wait_for(&self, duration: Duration) -> Result<(), String> {
        tokio::select! {_=self.cancelled()=>Err("recovery_cancelled".into()),_=tokio::time::sleep(duration)=>Ok(())}
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct RecoveryBindingStamp {
    pub binding_id: String,
    pub base_url: String,
    pub server_id: String,
    pub credential_ref: String,
}
pub(crate) struct RecoveryAccess {
    pub stamp: RecoveryBindingStamp,
    pub token: String,
    pub client: Client,
}
pub(crate) fn expires_at_millis(value: &str) -> Result<i64, String> {
    if !crate::cloud_recovery_schema::timestamp(value) {
        return Err("invalid_job_response".into());
    }
    let n = |from: usize, to: usize| {
        value[from..to]
            .parse::<i64>()
            .map_err(|_| "invalid_job_response")
    };
    let mut year = n(0, 4)?;
    let month = n(5, 7)?;
    let day = n(8, 10)?;
    if month <= 2 {
        year -= 1;
    }
    let era = year.div_euclid(400);
    let y = year - era * 400;
    let shifted = month + if month > 2 { -3 } else { 9 };
    let doy = (153 * shifted + 2) / 5 + day - 1;
    let days = era * 146097 + y * 365 + y / 4 - y / 100 + doy - 719468;
    Ok(
        days * 86400000
            + n(11, 13)? * 3600000
            + n(14, 16)? * 60000
            + n(17, 19)? * 1000
            + n(20, 23)?,
    )
}
pub(crate) trait RecoveryAccessProvider {
    fn clock_millis(&self) -> Result<i64, String> {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_millis() as i64)
            .map_err(|_| "invalid_system_time".into())
    }
    async fn access(&self) -> Result<RecoveryAccess, String>;
    async fn binding_stamp(&self) -> Result<RecoveryBindingStamp, String> {
        Ok(self.access().await?.stamp)
    }
    async fn preserve_chunk(
        &self,
        _stamp: &RecoveryBindingStamp,
        _object: &RecoveryObject,
        _chunk: &RecoveryChunk,
        _bytes: &[u8],
        _validated: bool,
    ) -> Result<(), String> {
        Ok(())
    }
    async fn preserve_failed_response(
        &self,
        _stamp: &RecoveryBindingStamp,
        _suffix: &str,
        _bytes: &[u8],
    ) -> Result<(), String> {
        Ok(())
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[serde(tag = "scope", rename_all = "snake_case")]
pub(crate) enum RecoverySelection {
    All {
        include_danmaku: bool,
        include_interactions: bool,
    },
    Sessions {
        session_ids: Vec<String>,
        include_danmaku: bool,
        include_interactions: bool,
    },
    Time {
        started_at: String,
        ended_at: String,
        include_danmaku: bool,
        include_interactions: bool,
    },
}
impl RecoverySelection {
    pub(crate) fn is_all(&self) -> bool {
        matches!(self, Self::All { .. })
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct CreateRecoveryRequest {
    pub request_id: String,
    pub mode: String,
    pub expected_server_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from_cut_id: Option<String>,
    pub selection: RecoverySelection,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct RecoveryCreated {
    pub job_id: String,
    pub state: String,
    pub created_at: String,
    pub expires_at: String,
    pub status_url: String,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VerifiedObject {
    pub object_id: String,
    pub sha256: String,
    pub byte_size: String,
    pub cache_handle: String,
    pub kind: String,
    pub stream_id: String,
    pub stream_ordinal: u64,
    pub verified: bool,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RecoveryStatus {
    pub state: String,
    pub job_id: String,
    pub failure_code: Option<String>,
    pub root_bytes: Option<Vec<u8>>,
    pub root_sha256: Option<String>,
    pub cache_handle: Option<String>,
}
pub(crate) struct RecoverySession {
    pub stamp: RecoveryBindingStamp,
    pub room_id: String,
    pub request: CreateRecoveryRequest,
    pub info: RecoveryInfo,
    pub created: RecoveryCreated,
    pub cancel: RecoveryCancellation,
    slots: Arc<Semaphore>,
    network_verified: tokio::sync::Mutex<bool>,
}
pub(crate) struct WireResponse {
    pub(crate) bytes: Vec<u8>,
    sha256: Option<String>,
    declared: Option<u64>,
}
pub(crate) fn known_remote_error(code: &str) -> bool {
    matches!(
        code,
        "invalid_request"
            | "invalid_cut"
            | "cursor_ahead"
            | "unsupported_contract"
            | "unauthorized"
            | "room_not_found"
            | "job_not_found"
            | "object_not_found"
            | "chunk_not_found"
            | "cut_not_found"
            | "request_conflict"
            | "job_not_ready"
            | "server_identity_changed"
            | "snapshot_version_conflict"
            | "job_expired"
            | "delta_base_expired"
            | "recovery_too_large"
            | "envelope_too_large"
            | "snapshot_too_large"
            | "recovery_capacity"
            | "cut_capacity"
            | "recovery_unavailable"
            | "freeze_timeout"
            | "build_timeout"
            | "artifact_incomplete"
            | "build_interrupted"
            | "recovery_build_failed"
            | "pinned_source_missing"
            | "invalid_room_id"
            | "invalid_job_id"
            | "invalid_chunk"
            | "invalid_query"
            | "request_too_large"
            | "unsupported_media_type"
            | "login_required"
            | "login_not_verified"
            | "room_limit_reached"
            | "stop_pending"
            | "collector_unavailable"
            | "settings_unavailable"
            | "invalid_retention_days"
            | "preview_required"
            | "preview_expired"
            | "preview_changed"
            | "cleanup_running"
            | "account_replacement_required"
            | "account_mismatch"
            | "invalid_login"
            | "login_verification_unavailable"
            | "credential_unavailable"
            | "storage_unavailable"
            | "session_changed"
            | "service_stopped"
            | "qr_unavailable"
            | "public_base_url_unavailable"
    )
}
fn recovery_url(base: &str, suffix: &str) -> Result<Url, String> {
    let base =
        Url::parse(&format!("{}/", base.trim_end_matches('/'))).map_err(|_| "invalid_base_url")?;
    if !matches!(base.scheme(), "http" | "https")
        || !base.username().is_empty()
        || base.password().is_some()
        || base.query().is_some()
        || base.fragment().is_some()
        || suffix.starts_with('/')
        || suffix.contains('#')
    {
        return Err("invalid_base_url".into());
    }
    let url = base.join(suffix).map_err(|_| "invalid_base_url")?;
    if url.origin() != base.origin() || !url.path().starts_with(base.path()) {
        return Err("invalid_base_url".into());
    }
    Ok(url)
}
fn header(response: &reqwest::Response, name: &str) -> Result<Option<String>, String> {
    let values = response.headers().get_all(name);
    if values.iter().count() > 1 {
        return Err("invalid_response_headers".into());
    }
    values
        .iter()
        .next()
        .map(|v| {
            v.to_str()
                .map(str::to_owned)
                .map_err(|_| "invalid_response_headers".into())
        })
        .transpose()
}
#[derive(Clone, Copy)]
pub(crate) struct RecoveryDeadline {
    at: Instant,
    error: &'static str,
}
impl RecoveryDeadline {
    fn for_job(
        provider: &impl RecoveryAccessProvider,
        info: &RecoveryInfo,
        expires_at: &str,
    ) -> Result<Self, String> {
        let remaining_ms = expires_at_millis(expires_at)?.saturating_sub(provider.clock_millis()?);
        if remaining_ms <= 0 {
            return Err("job_expired".into());
        }
        let build_ms = info.limits.build_timeout_seconds.saturating_mul(1000);
        let (millis, error) = if (remaining_ms as u64) <= build_ms {
            (remaining_ms as u64, "job_expired")
        } else {
            (build_ms, "build_timeout")
        };
        Ok(Self {
            at: Instant::now() + Duration::from_millis(millis),
            error,
        })
    }
    async fn wait<T>(
        &self,
        cancel: &RecoveryCancellation,
        future: impl std::future::Future<Output = T>,
    ) -> Result<T, String> {
        tokio::select! {
            biased;
            _=cancel.cancelled()=>Err("recovery_cancelled".into()),
            _=tokio::time::sleep_until(self.at)=>Err(self.error.into()),
            value=future=>Ok(value),
        }
    }
}
pub(crate) async fn request_bound(
    provider: &impl RecoveryAccessProvider,
    stamp: &RecoveryBindingStamp,
    cancel: &RecoveryCancellation,
    slots: &Arc<Semaphore>,
    method: Method,
    suffix: &str,
    body: Option<Vec<u8>>,
    maximum: usize,
    content_type: &str,
    deadline: Option<&RecoveryDeadline>,
) -> Result<WireResponse, String> {
    for retry in 0..=3 {
        cancel.check()?;
        let access = match deadline {
            Some(d) => d.wait(cancel, provider.access()).await??,
            None => provider.access().await?,
        };
        if access.stamp != *stamp {
            return Err("binding_changed".into());
        }
        let slot_result = match deadline {
            Some(d) => d.wait(cancel, slots.acquire()).await?,
            None => {
                tokio::select! { _=cancel.cancelled()=>return Err("recovery_cancelled".into()), slot=slots.acquire()=>slot }
            }
        };
        let slot = slot_result.map_err(|_| "recovery_cancelled")?;
        let mut request = access
            .client
            .request(method.clone(), recovery_url(&stamp.base_url, suffix)?)
            .bearer_auth(&access.token)
            .header("Accept-Encoding", "identity")
            .header("Cache-Control", "no-store");
        if let Some(body) = body.clone() {
            request = request
                .header("Content-Type", "application/json")
                .body(body);
        }
        let response_result = match deadline {
            Some(d) => d.wait(cancel, request.send()).await?,
            None => {
                tokio::select! { _=cancel.cancelled()=>return Err("recovery_cancelled".into()), response=request.send()=>response }
            }
        };
        let mut response = response_result.map_err(|_| "recovery_network")?;
        let status = response.status().as_u16();
        if (300..400).contains(&status) {
            return Err("recovery_redirect".into());
        }
        if header(&response, "Content-Encoding")?
            .is_some_and(|s| !s.eq_ignore_ascii_case("identity"))
        {
            return Err("unexpected_content_encoding".into());
        }
        let retry_after = header(&response, "Retry-After")?;
        let sha256 = header(&response, "X-BB-Content-Sha256")?;
        if sha256.as_ref().is_some_and(|s| !valid_hash(s)) {
            return Err("hash_mismatch".into());
        }
        let declared = header(&response, "X-BB-Uncompressed-Bytes")?
            .map(|s| s.parse::<u64>().map_err(|_| "byte_length_mismatch"))
            .transpose()?;
        let limit = if (200..300).contains(&status) {
            maximum
        } else {
            4096
        };
        if response.content_length().is_some_and(|n| n > limit as u64)
            || declared.is_some_and(|n| n > limit as u64)
        {
            return Err("byte_length_mismatch".into());
        }
        if (200..300).contains(&status)
            && !header(&response, "Content-Type")?.is_some_and(|s| {
                s.split(';')
                    .next()
                    .is_some_and(|v| v.trim().eq_ignore_ascii_case(content_type))
            })
        {
            return Err("invalid_content_type".into());
        }
        let mut bytes = Vec::new();
        loop {
            let part = match deadline {
                Some(d) => d.wait(cancel, response.chunk()).await?,
                None => {
                    tokio::select! { _=cancel.cancelled()=>return Err("recovery_cancelled".into()), part=response.chunk()=>part }
                }
            };
            let part = match part {
                Ok(part) => part,
                Err(_) => {
                    match deadline {
                        Some(d) => {
                            d.wait(
                                cancel,
                                provider.preserve_failed_response(stamp, suffix, &bytes),
                            )
                            .await??
                        }
                        None => {
                            provider
                                .preserve_failed_response(stamp, suffix, &bytes)
                                .await?
                        }
                    };
                    return Err("recovery_network".into());
                }
            };
            let Some(part) = part else { break };
            if bytes.len() + part.len() > limit {
                bytes.extend_from_slice(&part[..limit.saturating_sub(bytes.len())]);
                match deadline {
                    Some(d) => {
                        d.wait(
                            cancel,
                            provider.preserve_failed_response(stamp, suffix, &bytes),
                        )
                        .await??
                    }
                    None => {
                        provider
                            .preserve_failed_response(stamp, suffix, &bytes)
                            .await?
                    }
                };
                return Err("byte_length_mismatch".into());
            }
            bytes.extend_from_slice(&part);
        }
        drop(slot);
        if status == 429 && retry < 3 {
            let seconds = retry_after
                .as_deref()
                .unwrap_or("10")
                .parse::<u64>()
                .map_err(|_| "invalid_retry_after")?;
            if seconds > 3600 {
                return Err("invalid_retry_after".into());
            }
            if let Some(d) = deadline {
                d.wait(cancel, cancel.wait_for(Duration::from_secs(seconds)))
                    .await??;
            } else {
                cancel.wait_for(Duration::from_secs(seconds)).await?;
            }
            continue;
        }
        if !(200..300).contains(&status) {
            let remote: serde_json::Value =
                serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null);
            let fallback = match status {
                401 => "unauthorized",
                404 => "artifact_incomplete",
                410 => "job_expired",
                429 => "recovery_capacity",
                _ => "recovery_unavailable",
            };
            if status == 404 && suffix.contains("/objects/") {
                return Err("artifact_incomplete".into());
            }
            let code = remote["status"]
                .as_str()
                .filter(|s| known_remote_error(s))
                .unwrap_or(fallback);
            if code == "delta_base_expired" {
                if let Some(reason) = remote["reason"]
                    .as_str()
                    .filter(|s| matches!(*s, "cut_expired" | "change_history_expired"))
                {
                    return Err(format!("{code}:{reason}"));
                }
            }
            return Err(code.to_owned());
        }
        if declared.is_some_and(|n| n != bytes.len() as u64) {
            match deadline {
                Some(d) => {
                    d.wait(
                        cancel,
                        provider.preserve_failed_response(stamp, suffix, &bytes),
                    )
                    .await??
                }
                None => {
                    provider
                        .preserve_failed_response(stamp, suffix, &bytes)
                        .await?
                }
            };
            return Err("byte_length_mismatch".into());
        }
        if sha256.as_ref().is_some_and(|h| hex_hash(&bytes) != *h) {
            match deadline {
                Some(d) => {
                    d.wait(
                        cancel,
                        provider.preserve_failed_response(stamp, suffix, &bytes),
                    )
                    .await??
                }
                None => {
                    provider
                        .preserve_failed_response(stamp, suffix, &bytes)
                        .await?
                }
            };
            return Err("hash_mismatch".into());
        }
        return Ok(WireResponse {
            bytes,
            sha256,
            declared,
        });
    }
    Err("recovery_capacity".into())
}
impl RecoverySession {
    pub(crate) async fn start(
        provider: &impl RecoveryAccessProvider,
        room: &str,
        request: CreateRecoveryRequest,
        cancel: RecoveryCancellation,
        slots: Arc<Semaphore>,
    ) -> Result<Self, String> {
        let invalid_mode = match request.mode.as_str() {
            "baseline" => request.from_cut_id.is_some(),
            "delta" => request
                .from_cut_id
                .as_deref()
                .is_none_or(|s| !valid_uuid(s)),
            _ => true,
        };
        if !valid_decimal(room)
            || room == "0"
            || !valid_uuid(&request.request_id)
            || !valid_uuid(&request.expected_server_id)
            || invalid_mode
        {
            return Err("invalid_request".into());
        }
        crate::cloud_recovery_schema::validate(
            "CreateJob",
            &serde_json::to_value(&request).map_err(|_| "invalid_request")?,
        )?;
        let stamp = provider.access().await?.stamp;
        if stamp.server_id != request.expected_server_id {
            return Err("server_identity_changed".into());
        }
        let info = request_bound(
            provider,
            &stamp,
            &cancel,
            &slots,
            Method::GET,
            "api/v2/info",
            None,
            16384,
            "application/json",
            None,
        )
        .await?;
        let info = validate_info_bytes(&info.bytes, &stamp.server_id)?;
        let response = request_bound(
            provider,
            &stamp,
            &cancel,
            &slots,
            Method::POST,
            &format!("api/v2/rooms/{room}/recovery-jobs"),
            Some(serde_json::to_vec(&request).map_err(|_| "invalid_request")?),
            4096,
            "application/json",
            None,
        )
        .await?;
        let created: RecoveryCreated =
            serde_json::from_slice(&response.bytes).map_err(|_| "invalid_job_response")?;
        if !valid_uuid(&created.job_id)
            || created.state != "building"
            || created.status_url != format!("/api/v2/recovery-jobs/{}", created.job_id)
            || created.created_at >= created.expires_at
        {
            return Err("invalid_job_response".into());
        }
        Ok(Self {
            stamp,
            room_id: room.to_owned(),
            request,
            info,
            created,
            cancel,
            slots,
            network_verified: tokio::sync::Mutex::new(true),
        })
    }
    pub(crate) fn restore(
        stamp: RecoveryBindingStamp,
        room_id: String,
        request: CreateRecoveryRequest,
        info: RecoveryInfo,
        created: RecoveryCreated,
        cancel: RecoveryCancellation,
        slots: Arc<Semaphore>,
    ) -> Result<Self, String> {
        validate_info_bytes(
            &serde_json::to_vec(&info).map_err(|_| "invalid_info")?,
            &stamp.server_id,
        )?;
        let request_value = serde_json::to_value(&request).map_err(|_| "invalid_request")?;
        crate::cloud_recovery_schema::validate("CreateJob", &request_value)?;
        if !valid_decimal(&room_id)
            || room_id == "0"
            || request.expected_server_id != stamp.server_id
            || !valid_uuid(&created.job_id)
            || created.state != "building"
            || created.status_url != format!("/api/v2/recovery-jobs/{}", created.job_id)
            || !crate::cloud_recovery_schema::timestamp(&created.created_at)
            || !crate::cloud_recovery_schema::timestamp(&created.expires_at)
            || created.created_at >= created.expires_at
        {
            return Err("invalid_job_response".into());
        }
        Ok(Self {
            stamp,
            room_id,
            request,
            info,
            created,
            cancel,
            slots,
            network_verified: tokio::sync::Mutex::new(false),
        })
    }
    async fn ensure_network(
        &self,
        provider: &impl RecoveryAccessProvider,
        deadline: &RecoveryDeadline,
    ) -> Result<(), String> {
        let mut verified = tokio::select! {_=self.cancel.cancelled()=>return Err("recovery_cancelled".into()),v=self.network_verified.lock()=>v};
        if !*verified {
            let reply = request_bound(
                provider,
                &self.stamp,
                &self.cancel,
                &self.slots,
                Method::GET,
                "api/v2/info",
                None,
                16384,
                "application/json",
                Some(deadline),
            )
            .await?;
            validate_info_bytes(&reply.bytes, &self.stamp.server_id)?;
            *verified = true;
        }
        Ok(())
    }
    pub(crate) fn cache_handle(&self, object: &RecoveryObject) -> Result<String, String> {
        Ok(hex_hash(
            &serde_json::to_vec(&(
                &self.stamp,
                &self.room_id,
                "bb-json-utf8-v1",
                &object.sha256,
                &object.chunks,
            ))
            .map_err(|_| "invalid_object")?,
        ))
    }
    async fn download_chunk(
        &self,
        provider: &impl RecoveryAccessProvider,
        cache: &RecoveryCache,
        object: &RecoveryObject,
        handle: &str,
        chunk: &RecoveryChunk,
        deadline: &tokio::sync::OnceCell<RecoveryDeadline>,
    ) -> Result<(), String> {
        self.cancel.check()?;
        if provider.binding_stamp().await? != self.stamp {
            return Err("binding_changed".into());
        }
        if let Some(bytes) = cache
            .read_chunk(handle, chunk.index, &chunk.sha256, chunk.byte_size)
            .await?
        {
            provider
                .preserve_chunk(&self.stamp, object, chunk, &bytes, true)
                .await?;
            return Ok(());
        }
        let deadline = *deadline
            .get_or_try_init(|| async {
                RecoveryDeadline::for_job(provider, &self.info, &self.created.expires_at)
            })
            .await?;
        let maximum = if object.kind.starts_with("catalog_") {
            self.info.limits.catalog_page_max_bytes
        } else {
            self.info.limits.chunk_max_bytes
        };
        if chunk.byte_size > maximum {
            return Err("decode_limit_exceeded".into());
        }
        if provider.clock_millis()? >= expires_at_millis(&self.created.expires_at)? {
            return Err("job_expired".into());
        }
        self.ensure_network(provider, &deadline).await?;
        let response = request_bound(
            provider,
            &self.stamp,
            &self.cancel,
            &self.slots,
            Method::GET,
            &format!(
                "api/v2/recovery-jobs/{}/objects/{}/chunks/{}",
                self.created.job_id, object.object_id, chunk.index
            ),
            None,
            maximum as usize,
            "application/octet-stream",
            Some(&deadline),
        )
        .await?;
        let validated = response.sha256.as_deref() == Some(&chunk.sha256)
            && response.declared == Some(chunk.byte_size)
            && response.bytes.len() as u64 == chunk.byte_size
            && hex_hash(&response.bytes) == chunk.sha256;
        deadline
            .wait(
                &self.cancel,
                provider.preserve_chunk(&self.stamp, object, chunk, &response.bytes, validated),
            )
            .await??;
        if response.sha256.as_deref() != Some(&chunk.sha256)
            || response.declared != Some(chunk.byte_size)
            || response.bytes.len() as u64 != chunk.byte_size
        {
            return Err("hash_mismatch".into());
        }
        tokio::select! { _=self.cancel.cancelled()=>Err("recovery_cancelled".into()), result=cache.store_chunk(handle,chunk.index,&chunk.sha256,&response.bytes)=>result }
    }
    pub(crate) async fn download(
        &self,
        provider: &impl RecoveryAccessProvider,
        cache: &RecoveryCache,
        object: &RecoveryObject,
    ) -> Result<VerifiedObject, String> {
        object.validate()?;
        if object.byte_size.parse::<u64>().unwrap() > self.info.limits.job_max_bytes
            || object.byte_size.parse::<u64>().unwrap() > self.info.limits.object_max_bytes
        {
            return Err("recovery_too_large".into());
        }
        let handle = self.cache_handle(object)?;
        let deadline = tokio::sync::OnceCell::new();
        for pair in object.chunks.chunks(2) {
            if pair.len() == 2 {
                tokio::try_join!(
                    self.download_chunk(provider, cache, object, &handle, &pair[0], &deadline),
                    self.download_chunk(provider, cache, object, &handle, &pair[1], &deadline)
                )?;
            } else {
                self.download_chunk(provider, cache, object, &handle, &pair[0], &deadline)
                    .await?;
            }
        }
        self.cancel.check()?;
        cache.publish_object(&handle, object).await?;
        self.cancel.check()?;
        if provider.binding_stamp().await? != self.stamp {
            return Err("binding_changed".into());
        }
        Ok(VerifiedObject {
            object_id: object.object_id.clone(),
            sha256: object.sha256.clone(),
            byte_size: object.byte_size.clone(),
            cache_handle: handle,
            kind: object.kind.clone(),
            stream_id: object.stream_id.clone(),
            stream_ordinal: object.stream_ordinal,
            verified: true,
        })
    }
    pub(crate) async fn status(
        &self,
        provider: &impl RecoveryAccessProvider,
        cache: &RecoveryCache,
    ) -> Result<RecoveryStatus, String> {
        let deadline = RecoveryDeadline::for_job(provider, &self.info, &self.created.expires_at)?;
        self.ensure_network(provider, &deadline).await?;
        let response = request_bound(
            provider,
            &self.stamp,
            &self.cancel,
            &self.slots,
            Method::GET,
            &format!("api/v2/recovery-jobs/{}", self.created.job_id),
            None,
            self.info.limits.root_max_bytes as usize,
            "application/json",
            Some(&deadline),
        )
        .await?;
        let value: serde_json::Value =
            serde_json::from_slice(&response.bytes).map_err(|_| "invalid_job_response")?;
        if value["job_id"] != self.created.job_id {
            return Err("invalid_job_response".into());
        }
        let state = value["state"].as_str().ok_or("invalid_job_response")?;
        if state == "ready" {
            let hash = response.sha256.ok_or("hash_mismatch")?;
            if response.declared != Some(response.bytes.len() as u64)
                || value["server_id"] != self.stamp.server_id
                || value["room_id"] != self.room_id
                || value["mode"] != self.request.mode
                || value["contract_version"] != "0.3"
                || value["serialization_version"] != "bb-json-utf8-v1"
                || value["cut"]["server_id"] != self.stamp.server_id
                || value["cut"]["room_id"] != self.room_id
                || value["selection"]
                    != serde_json::to_value(&self.request.selection).map_err(|_| "invalid_root")?
                || value["cut"]["selection"] != value["selection"]
            {
                return Err("invalid_root".into());
            }
            let object = RecoveryObject {
                object_id: self.created.job_id.clone(),
                kind: "root".into(),
                stream_id: "root".into(),
                stream_ordinal: 0,
                media_type: "application/json".into(),
                byte_size: response.bytes.len().to_string(),
                sha256: hash.clone(),
                chunk_count: 1,
                chunks: vec![RecoveryChunk {
                    index: 0,
                    byte_size: response.bytes.len() as u64,
                    sha256: hash.clone(),
                }],
            };
            let handle = self.cache_handle(&object)?;
            cache
                .store_chunk(&handle, 0, &hash, &response.bytes)
                .await?;
            cache.publish_object(&handle, &object).await?;
            self.cancel.check()?;
            if provider.binding_stamp().await? != self.stamp {
                return Err("binding_changed".into());
            }
            return Ok(RecoveryStatus {
                state: state.into(),
                job_id: self.created.job_id.clone(),
                failure_code: None,
                root_bytes: Some(response.bytes),
                root_sha256: Some(hash),
                cache_handle: Some(handle),
            });
        }
        if !matches!(state, "building" | "failed")
            || value
                .as_object()
                .is_none_or(|v| v.len() != if state == "building" { 4 } else { 3 })
        {
            return Err("invalid_job_response".into());
        }
        Ok(RecoveryStatus {
            state: state.into(),
            job_id: self.created.job_id.clone(),
            failure_code: if state == "failed" {
                Some(
                    value["failure_code"]
                        .as_str()
                        .filter(|s| known_remote_error(s))
                        .unwrap_or("recovery_build_failed")
                        .to_owned(),
                )
            } else {
                None
            },
            root_bytes: None,
            root_sha256: None,
            cache_handle: None,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn recovery_transport_info_is_exact_v2_and_identity_bound() {
        let root: serde_json::Value = serde_json::from_slice(include_bytes!(
            "../../tests/fixtures/cloudRecovery/v02/baseline/root.json"
        ))
        .unwrap();
        let value = serde_json::json!({"server_id":root["server_id"],"service_version":"0.7.0","protocol_version":"0.1.3","recovery_contract_version":"0.3","limits":root["limits"]});
        assert!(validate_info_bytes(
            &serde_json::to_vec(&value).unwrap(),
            root["server_id"].as_str().unwrap()
        )
        .is_ok());
        assert_eq!(
            validate_info_bytes(
                &serde_json::to_vec(&value).unwrap(),
                "00000000-0000-4000-8000-000000000099"
            )
            .unwrap_err(),
            "server_identity_changed"
        );
        let mut wrong = value;
        wrong["api_version"] = serde_json::json!(1);
        assert_eq!(
            validate_info_bytes(
                &serde_json::to_vec(&wrong).unwrap(),
                root["server_id"].as_str().unwrap()
            )
            .unwrap_err(),
            "invalid_info"
        );
    }
    #[test]
    fn recovery_transport_cancellation_wakes_existing_and_future_waits() {
        tauri::async_runtime::block_on(async {
            let cancel = RecoveryCancellation::default();
            let waiting = cancel.wait_for(std::time::Duration::from_secs(60));
            let (result, ()) = tokio::join!(waiting, async {
                tokio::time::sleep(std::time::Duration::from_millis(10)).await;
                cancel.cancel();
            });
            assert_eq!(result.unwrap_err(), "recovery_cancelled");
            assert_eq!(
                cancel
                    .wait_for(std::time::Duration::from_secs(60))
                    .await
                    .unwrap_err(),
                "recovery_cancelled"
            );
        });
    }
    #[test]
    fn recovery_transport_descriptor_rejects_oversize_and_chunk_mismatch() {
        let mut object = RecoveryObject {
            object_id: "00000000-0000-4000-8000-000000000100".into(),
            kind: "facts".into(),
            stream_id: "facts".into(),
            stream_ordinal: 0,
            media_type: "application/x-ndjson".into(),
            byte_size: "1".into(),
            sha256: "a".repeat(64),
            chunk_count: 1,
            chunks: vec![RecoveryChunk {
                index: 0,
                byte_size: 1,
                sha256: "b".repeat(64),
            }],
        };
        assert!(object.validate().is_ok());
        object.chunks[0].byte_size = 2097153;
        assert_eq!(object.validate().unwrap_err(), "invalid_object");
    }
}
