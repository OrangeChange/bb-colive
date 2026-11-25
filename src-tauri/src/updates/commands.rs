use super::{
    install::{InstallPlan, UpdateAppearance},
    model::*,
    transport,
};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use tauri::{Emitter, Manager};
#[derive(Default)]
pub struct UpdateManager {
    pub offer: Mutex<Option<UpdateOffer>>,
    pub ready: Mutex<Option<InstallPlan>>,
    pub cancel: Arc<AtomicBool>,
    pub cancel_signal: tokio::sync::Notify,
    pub downloading: AtomicBool,
}
#[tauri::command]
pub async fn check_software_update(
    app: tauri::AppHandle,
    state: tauri::State<'_, UpdateManager>,
    route: UpdateRoute,
    region: Option<RegionCache>,
) -> Result<CheckResult, String> {
    if state.downloading.load(Ordering::Relaxed) {
        return Err(ui_text!("backend.commands.check_software_update").into());
    }
    let program = std::env::current_exe().map_err(|e| e.to_string())?;
    let kind = if program.parent().unwrap().join("portable.flag").is_file() {
        PackageKind::Portable
    } else {
        PackageKind::Installer
    };
    *state.offer.lock().map_err(|e| e.to_string())? = None;
    let result =
        transport::check(route, region, &app.package_info().version.to_string(), kind).await?;
    *state.offer.lock().map_err(|e| e.to_string())? = result.offer.clone();
    Ok(result)
}
#[tauri::command]
pub fn cancel_software_update(state: tauri::State<'_, UpdateManager>) {
    state.cancel.store(true, Ordering::Relaxed);
    state.cancel_signal.notify_waiters();
}
#[tauri::command]
pub async fn download_software_update(
    app: tauri::AppHandle,
    state: tauri::State<'_, UpdateManager>,
) -> Result<(), String> {
    if state.downloading.swap(true, Ordering::SeqCst) {
        return Err(ui_text!("backend.commands.download_software_update").into());
    }
    let result = download_inner(&app, &state).await;
    state.downloading.store(false, Ordering::SeqCst);
    result
}
async fn download_inner(app: &tauri::AppHandle, state: &UpdateManager) -> Result<(), String> {
    state.cancel.store(false, Ordering::Relaxed);
    let offer = state
        .offer
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or(ui_text!("backend.commands.download_inner"))?;
    let staging = app
        .path()
        .temp_dir()
        .map_err(|e| e.to_string())?
        .join("BB CoLive Updates")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&staging).map_err(|e| e.to_string())?;
    let package = staging.join(offer.kind.file_name());
    let mut error = ui_text!("backend.commands.download_inner2").to_string();
    for source in &offer.packages {
        let mut last_progress = std::time::Instant::now() - std::time::Duration::from_secs(1);
        let result=transport::download(source,&package,include_str!("../../update-public.key"),&state.cancel,&state.cancel_signal,|received,total|{if last_progress.elapsed()>=std::time::Duration::from_millis(100)||received==total {let _=app.emit("software-update-progress",serde_json::json!({"received":received,"total":total,"source":source.source}));last_progress=std::time::Instant::now();}}).await;
        match result {
            Ok(()) => {
                let target = std::env::current_exe()
                    .map_err(|e| e.to_string())?
                    .parent()
                    .unwrap()
                    .to_path_buf();
                let plan = InstallPlan {
                    signature: Some(source.signature.clone()),
                    size: Some(source.size),
                    parent_pid: std::process::id(),
                    appearance: None,
                    ui_language: None,
                    executable: std::env::current_exe()
                        .map_err(|e| e.to_string())?
                        .file_name()
                        .unwrap()
                        .to_string_lossy()
                        .into_owned(),
                    target,
                    package,
                    kind: offer.kind,
                    version: offer.version.clone(),
                    release_url: offer.release_url.clone(),
                };
                std::fs::write(
                    crate::data_paths::root()?.join("update-ready.json"),
                    serde_json::to_vec(&serde_json::json!({"plan":plan,"offer":offer}))
                        .map_err(|e| e.to_string())?,
                )
                .map_err(|e| e.to_string())?;
                *state.ready.lock().map_err(|e| e.to_string())? = Some(plan);
                return Ok(());
            }
            Err(e) => error = e,
        }
        if state.cancel.load(Ordering::Relaxed) {
            break;
        }
    }
    Err(error)
}
#[tauri::command]
pub fn install_software_update(
    appearance: Option<UpdateAppearance>,
    app: tauri::AppHandle,
    state: tauri::State<'_, UpdateManager>,
) -> Result<(), String> {
    let mut plan = state
        .ready
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or(ui_text!("backend.commands.install_software_update"))?;
    plan.parent_pid = std::process::id();
    plan.appearance = appearance;
    plan.ui_language = Some(crate::ui_messages::language().to_string());
    let directory = plan.package.parent().unwrap();
    let helper = directory.join("bb-colive-update.exe");
    std::fs::copy(std::env::current_exe().map_err(|e| e.to_string())?, &helper)
        .map_err(|e| e.to_string())?;
    let path: PathBuf = directory.join("install.json");
    std::fs::write(&path, serde_json::to_vec(&plan).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    std::process::Command::new(helper)
        .arg("--apply-update")
        .arg(path)
        .spawn()
        .map_err(|e| e.to_string())?;
    app.emit_to("main", "app:prepare-quit", ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn restore_software_update(
    app: tauri::AppHandle,
    state: tauri::State<'_, UpdateManager>,
) -> Result<Option<UpdateOffer>, String> {
    *state.ready.lock().map_err(|e| e.to_string())? = None;
    *state.offer.lock().map_err(|e| e.to_string())? = None;
    let path = crate::data_paths::root()?.join("update-ready.json");
    if !path.is_file() {
        return Ok(None);
    }
    let value: serde_json::Value =
        serde_json::from_slice(&std::fs::read(path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    let mut plan: InstallPlan =
        serde_json::from_value(value["plan"].clone()).map_err(|e| e.to_string())?;
    let offer: UpdateOffer =
        serde_json::from_value(value["offer"].clone()).map_err(|e| e.to_string())?;
    if !newer_stable(&offer.version, &app.package_info().version.to_string())
        || !plan.package.is_file()
    {
        return Ok(None);
    }
    let target = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .parent()
        .unwrap()
        .to_path_buf();
    if plan.target != target {
        return Ok(None);
    }
    plan.restore_verification(&offer.packages)?;
    *state.offer.lock().map_err(|e| e.to_string())? = Some(offer.clone());
    *state.ready.lock().map_err(|e| e.to_string())? = Some(plan);
    Ok(Some(offer))
}
