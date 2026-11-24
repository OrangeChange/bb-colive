use crate::cloud_credentials::{CredentialStore, SystemCredentials};
use crate::cloud_recovery_transport::{RecoveryAccess, RecoveryBindingStamp};
use reqwest::{redirect::Policy, Client, Url};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const PROTOCOL_VERSION: &str = "0.1.3";
const RECOVERY_CONTRACT_VERSION: &str = "0.3";
const SERIALIZATION_VERSION: &str = "bb-json-utf8-v1";

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct RecoveryInfo {
    server_id: String,
    service_version: String,
    protocol_version: String,
    recovery_contract_version: String,
    limits: Value,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredBinding {
    binding_id: String,
    base_url: String,
    server_id: String,
    credential_ref: String,
    service_version: String,
    api_version: u8,
    protocol_version: String,
    recovery_contract_version: String,
    serialization_version: String,
    verified_at: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudRecoveryBinding {
    binding_id: String,
    base_url: String,
    server_id: String,
    service_version: String,
    api_version: u8,
    protocol_version: String,
    recovery_contract_version: String,
    serialization_version: String,
    verified_at: u64,
}

impl From<&StoredBinding> for CloudRecoveryBinding {
    fn from(value: &StoredBinding) -> Self {
        Self {
            binding_id: value.binding_id.clone(),
            base_url: value.base_url.clone(),
            server_id: value.server_id.clone(),
            service_version: value.service_version.clone(),
            api_version: value.api_version,
            protocol_version: value.protocol_version.clone(),
            recovery_contract_version: value.recovery_contract_version.clone(),
            serialization_version: value.serialization_version.clone(),
            verified_at: value.verified_at,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudRecoveryBindingState {
    status: &'static str,
    binding: Option<CloudRecoveryBinding>,
}

fn valid_uuid(value: &str) -> bool {
    value.len() == 36
        && value.bytes().enumerate().all(|(index, byte)| {
            if [8, 13, 18, 23].contains(&index) {
                byte == b'-'
            } else {
                byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte)
            }
        })
}

fn parse_recovery_info(bytes: &[u8]) -> Result<RecoveryInfo, String> {
    if bytes.len() > 16 * 1024 {
        return Err(ui_text!("backend.cloud_recovery_binding.parse_recovery_info").into());
    }
    let info: RecoveryInfo =
        serde_json::from_slice(bytes).map_err(|_| ui_text!("backend.cloud_recovery_binding.parse_recovery_info5"))?;
    if !valid_uuid(&info.server_id) || info.service_version.is_empty() || !info.limits.is_object() {
        return Err(ui_text!("backend.cloud_recovery_binding.parse_recovery_info2").into());
    }
    if info.protocol_version != PROTOCOL_VERSION {
        return Err(ui_text!("backend.cloud_recovery_binding.parse_recovery_info3").into());
    }
    if info.recovery_contract_version != RECOVERY_CONTRACT_VERSION {
        return Err(ui_text!("backend.cloud_recovery_binding.parse_recovery_info4").into());
    }
    Ok(info)
}

fn normalize_base_url(value: &str) -> Result<String, String> {
    if value.contains('\\') || value.split('/').any(|part| part == "." || part == "..") {
        return Err(ui_text!("backend.cloud_recovery_binding.normalize_base_url").into());
    }
    let url = Url::parse(value).map_err(|_| ui_text!("backend.cloud_recovery_binding.normalize_base_url"))?;
    let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "::1"));
    if !(url.scheme() == "https" || url.scheme() == "http" && local)
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(ui_text!("backend.cloud_recovery_binding.normalize_base_url2").into());
    }
    Ok(url.as_str().trim_end_matches('/').to_owned())
}

fn info_url(base_url: &str) -> Result<Url, String> {
    let base = Url::parse(&format!("{}/", base_url.trim_end_matches('/')))
        .map_err(|_| ui_text!("backend.cloud_recovery_binding.info_url"))?;
    base.join("api/v2/info")
        .map_err(|_| ui_text!("backend.cloud_recovery_binding.info_url").into())
}

async fn request_recovery_info(base_url: &str, token: &str) -> Result<RecoveryInfo, String> {
    if token.is_empty() {
        return Err(ui_text!("backend.cloud_recovery_binding.request_recovery_info").into());
    }
    let client = Client::builder()
        .redirect(Policy::none())
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|_| ui_text!("backend.cloud_recovery_binding.request_recovery_info6"))?;
    let response = client
        .get(info_url(base_url)?)
        .bearer_auth(token)
        .header("Accept-Encoding", "identity")
        .send()
        .await
        .map_err(|_| ui_text!("backend.cloud_recovery_binding.request_recovery_info7"))?;
    match response.status().as_u16() {
        200..=299 => {}
        401 | 403 => return Err(ui_text!("backend.cloud_recovery_binding.request_recovery_info2").into()),
        300..=399 => return Err(ui_text!("backend.cloud_recovery_binding.request_recovery_info3").into()),
        _ => return Err(ui_text!("backend.cloud_recovery_binding.request_recovery_info4").into()),
    }
    if response
        .content_length()
        .is_some_and(|length| length > 16 * 1024)
    {
        return Err(ui_text!("backend.cloud_recovery_binding.request_recovery_info5").into());
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|_| ui_text!("backend.cloud_recovery_binding.request_recovery_info8"))?;
    parse_recovery_info(&bytes)
}

fn binding_path(app: &AppHandle) -> Result<PathBuf, String> {
    crate::data_paths::root()
        .map(|directory| directory.join("cloud-recovery").join("binding.json"))
        .map_err(|_| ui_text!("backend.cloud_recovery_binding.binding_path").into())
}

fn read_binding(path: &Path) -> Result<Option<StoredBinding>, String> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(ui_text!("backend.cloud_recovery_binding.read_binding").into()),
    };
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|_| ui_text!("backend.cloud_recovery_binding.read_binding2").into())
}

pub(crate) fn load_recovery_access(app: &AppHandle) -> Result<RecoveryAccess, String> {
    let binding = read_binding(&binding_path(app)?)?.ok_or("recovery_binding_missing")?;
    let token = SystemCredentials
        .read(&binding.credential_ref)?
        .filter(|value| !value.is_empty())
        .ok_or("credential_required")?;
    let client = Client::builder()
        .redirect(Policy::none())
        .build()
        .map_err(|_| "recovery_network")?;
    Ok(RecoveryAccess {
        stamp: RecoveryBindingStamp {
            binding_id: binding.binding_id,
            base_url: binding.base_url,
            server_id: binding.server_id,
            credential_ref: binding.credential_ref,
        },
        token,
        client,
    })
}

fn write_binding(path: &Path, binding: &StoredBinding) -> Result<(), String> {
    let parent = path.parent().ok_or(ui_text!("backend.cloud_recovery_binding.write_binding"))?;
    fs::create_dir_all(parent).map_err(|_| ui_text!("backend.cloud_recovery_binding.write_binding2"))?;
    let bytes = serde_json::to_vec(binding).map_err(|_| ui_text!("backend.cloud_recovery_binding.write_binding"))?;
    fs::write(path, bytes).map_err(|_| ui_text!("backend.cloud_recovery_binding.write_binding").into())
}

fn current_millis() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .map_err(|_| ui_text!("backend.cloud_recovery_binding.current_millis").into())
}

fn binding_state(
    path: &Path,
    credentials: &impl CredentialStore,
) -> Result<CloudRecoveryBindingState, String> {
    let Some(binding) = read_binding(path)? else {
        return Ok(CloudRecoveryBindingState {
            status: "unbound",
            binding: None,
        });
    };
    let ready = credentials
        .read(&binding.credential_ref)
        .ok()
        .flatten()
        .is_some_and(|token| !token.is_empty());
    Ok(CloudRecoveryBindingState {
        status: if ready {
            "ready"
        } else {
            "credential-required"
        },
        binding: Some(CloudRecoveryBinding::from(&binding)),
    })
}

#[tauri::command]
pub async fn save_cloud_recovery_binding(
    app: AppHandle,
    base_url: String,
    token: String,
) -> Result<CloudRecoveryBindingState, String> {
    let base_url = normalize_base_url(&base_url)?;
    let info = request_recovery_info(&base_url, &token).await?;
    let path = binding_path(&app)?;
    let previous = read_binding(&path)?;
    let credential_ref = format!("BB.EventFetcher/{}", info.server_id);
    let binding = StoredBinding {
        binding_id: info.server_id.clone(),
        base_url,
        server_id: info.server_id,
        credential_ref: credential_ref.clone(),
        service_version: info.service_version,
        api_version: 2,
        protocol_version: PROTOCOL_VERSION.into(),
        recovery_contract_version: RECOVERY_CONTRACT_VERSION.into(),
        serialization_version: SERIALIZATION_VERSION.into(),
        verified_at: current_millis()?,
    };
    let credentials = SystemCredentials;
    credentials.write(&credential_ref, &token)?;
    if let Err(error) = write_binding(&path, &binding) {
        let _ = credentials.delete(&credential_ref);
        return Err(error);
    }
    if let Some(previous) = previous {
        if previous.credential_ref != credential_ref {
            let _ = credentials.delete(&previous.credential_ref);
        }
    }
    binding_state(&path, &credentials)
}

#[tauri::command]
pub fn load_cloud_recovery_binding(app: AppHandle) -> Result<CloudRecoveryBindingState, String> {
    binding_state(&binding_path(&app)?, &SystemCredentials)
}

#[tauri::command]
pub fn remove_cloud_recovery_binding(app: AppHandle) -> Result<(), String> {
    let path = binding_path(&app)?;
    if let Some(binding) = read_binding(&path)? {
        SystemCredentials.delete(&binding.credential_ref)?;
    }
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err(ui_text!("backend.cloud_recovery_binding.remove_cloud_recovery_binding").into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn info(protocol: &str, contract: &str, service: &str) -> Vec<u8> {
        format!(
            r#"{{"server_id":"12345678-1234-1234-1234-123456789abc","service_version":"{service}","protocol_version":"{protocol}","recovery_contract_version":"{contract}","limits":{{}}}}"#,
        )
        .into_bytes()
    }

    #[test]
    fn server_address_requires_https_except_loopback_and_removes_trailing_slash() {
        assert_eq!(
            normalize_base_url("https://fetcher.example/base/").unwrap(),
            "https://fetcher.example/base"
        );
        assert_eq!(
            normalize_base_url("http://127.0.0.1:8080/").unwrap(),
            "http://127.0.0.1:8080"
        );
        assert!(normalize_base_url("http://fetcher.example").is_err());
        assert!(normalize_base_url("https://user:pass@fetcher.example").is_err());
        assert!(normalize_base_url("https://fetcher.example/?token=secret").is_err());
    }

    #[test]
    fn compatibility_uses_protocol_contract_and_service_presence() {
        let parsed = parse_recovery_info(&info("0.1.3", "0.3", "0.7.0")).unwrap();
        assert_eq!(parsed.service_version, "0.7.0");
        assert!(parse_recovery_info(&info("0.1.2", "0.3", "0.7.0")).is_err());
        assert!(parse_recovery_info(&info("0.1.3", "0.1", "0.6.1")).is_err());
        assert!(parse_recovery_info(&info("0.1.3", "0.3", "")).is_err());
        assert_eq!(
            parse_recovery_info(&info("0.1.3", "0.3", "0.7.1"))
                .unwrap()
                .service_version,
            "0.7.1"
        );
    }
}
