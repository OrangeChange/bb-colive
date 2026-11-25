use super::install::{apply_portable, InstallPlan};
use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use tauri::{Emitter, Manager};
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    appearance: Option<super::install::UpdateAppearance>,
    phase: String,
    version: String,
    completed: usize,
    total: usize,
    error: Option<String>,
    release_url: String,
}
struct Helper {
    plan: InstallPlan,
    busy: AtomicBool,
    installed: AtomicBool,
    status: Mutex<Progress>,
}
fn publish(
    app: &tauri::AppHandle,
    state: &Helper,
    phase: &str,
    completed: usize,
    total: usize,
    error: Option<String>,
) {
    let p = Progress {
        appearance: state.plan.appearance.clone(),
        phase: phase.into(),
        version: state.plan.version.clone(),
        completed,
        total,
        error,
        release_url: state.plan.release_url.clone(),
    };
    *state.status.lock().unwrap() = p.clone();
    let _ = app.emit("update-install-progress", p);
}
#[tauri::command]
fn update_helper_status(state: tauri::State<'_, Helper>) -> Progress {
    state.status.lock().unwrap().clone()
}
#[tauri::command]
async fn run_update_helper(app: tauri::AppHandle) -> Result<(), String> {
    if app.state::<Helper>().busy.swap(true, Ordering::SeqCst) {
        return Ok(());
    }
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = handle.state::<Helper>();
        publish(&handle, &state, "installing", 0, 0, None);
        let result = install(&handle, &state);
        if let Err(error) = result {
            publish(
                &handle,
                &state,
                if state.installed.load(Ordering::Relaxed) {
                    "launchFailed"
                } else {
                    "failed"
                },
                0,
                0,
                Some(error),
            );
            state.busy.store(false, Ordering::SeqCst);
        } else {
            publish(&handle, &state, "complete", 1, 1, None);
            std::thread::sleep(std::time::Duration::from_millis(800));
            handle.exit(0);
        }
    });
    Ok(())
}
fn install(app: &tauri::AppHandle, state: &Helper) -> Result<(), String> {
    let plan = &state.plan;
    if !state.installed.load(Ordering::Relaxed) {
        #[cfg(windows)]
        unsafe {
            use windows_sys::Win32::{
                Foundation::{CloseHandle, WAIT_TIMEOUT},
                System::Threading::{OpenProcess, WaitForSingleObject, PROCESS_SYNCHRONIZE},
            };
            let process = OpenProcess(PROCESS_SYNCHRONIZE, 0, plan.parent_pid);
            if !process.is_null() {
                let result = WaitForSingleObject(process, 60000);
                CloseHandle(process);
                if result == WAIT_TIMEOUT {
                    return Err(ui_text!("backend.helper.install").into());
                }
            }
        }
        install_package(plan, |done, total| {
            publish(app, state, "installing", done, total, None)
        })?;
        state.installed.store(true, Ordering::Relaxed);
    }
    publish(app, state, "launching", 0, 0, None);
    std::process::Command::new(plan.target.join(&plan.executable))
        .current_dir(&plan.target)
        .spawn()
        .map_err(|e| ui_format!("backend.helper.install4", e = e))?;
    Ok(())
}
fn install_package(plan: &InstallPlan, progress: impl FnMut(usize, usize)) -> Result<(), String> {
    plan.verify_package()?;
    match plan.kind {
        super::model::PackageKind::Portable => apply_portable(plan, progress)?,
        super::model::PackageKind::Installer => {
            let mut command=std::process::Command::new(&plan.package);
            command.args(["/S","/UPDATE","/NS"]);
            #[cfg(windows)] {
                use std::os::windows::process::CommandExt;
                command.raw_arg(format!("/D={}",plan.target.display()));
            }
            #[cfg(not(windows))]
            command.arg(format!("/D={}",plan.target.display()));
            let status=command.status().map_err(|e|ui_format!("backend.helper.install2", e = e))?;
            if !status.success() {
                return Err(ui_format!("backend.helper.install3",
                    status.code().unwrap_or(-1)));
            }
        }
    }
    Ok(())
}

pub fn run_if_requested() -> bool {
    let mut args = std::env::args_os();
    if !args.any(|v| v == "--apply-update") {
        return false;
    }
    let Some(path) = args.next() else {
        return true;
    };
    let Ok(bytes) = std::fs::read(path) else {
        return true;
    };
    let Ok(plan) = serde_json::from_slice::<InstallPlan>(&bytes) else {
        return true;
    };
    crate::ui_messages::set_language(plan.ui_language.as_deref().unwrap_or("zh-CN"));
    let status = Progress {
        appearance: plan.appearance.clone(),
        phase: "waiting".into(),
        version: plan.version.clone(),
        completed: 0,
        total: 0,
        error: None,
        release_url: plan.release_url.clone(),
    };
    let mut context = crate::application_context();
    for window in &mut context.config_mut().app.windows {
        window.create = false;
    }
    let _ = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Helper {
            plan,
            busy: AtomicBool::new(false),
            installed: AtomicBool::new(false),
            status: Mutex::new(status),
        })
        .setup(|app| {
            tauri::WebviewWindowBuilder::new(
                app,
                "app-update",
                tauri::WebviewUrl::App("index.html?window=app-update".into()),
            )
            .title(ui_text!("backend.helper.run_if_requested"))
            .inner_size(494., 200.)
            .min_inner_size(400., 160.)
            .resizable(false)
            .decorations(false)
            .data_directory(std::env::temp_dir().join("BB CoLive Update WebView"))
            .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            crate::get_ui_language,
            update_helper_status,
            run_update_helper
        ])
        .run(context);
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejected_packages_do_not_install_or_extract() {
        for kind in ["installer", "portable"] {
            let root = std::env::temp_dir().join(format!("bb-colive-install-gate-{}", uuid::Uuid::new_v4()));
            let target = root.join("program");
            std::fs::create_dir_all(&target).unwrap();
            std::fs::write(target.join("bb-colive.exe"), b"original").unwrap();
            let package = root.join("package");
            let bytes = include_bytes!("../../../tests/fixtures/software-update/payload.txt");
            std::fs::write(&package, bytes).unwrap();
            let mut plan: InstallPlan = serde_json::from_value(serde_json::json!({
                "parentPid": 0, "target": target, "executable": "bb-colive.exe",
                "package": package, "kind": kind, "version": "1.1.1", "releaseUrl": "",
                "signature": include_str!("../../../tests/fixtures/software-update/payload.txt.sig"),
                "size": bytes.len()
            })).unwrap();
            plan.size = Some(bytes.len() as u64 + 1);
            let error = install_package(&plan, |_, _| panic!("must not install")).unwrap_err();
            assert!(error.contains("不完整"), "{error}");
            plan.size = Some(bytes.len() as u64);
            let mut changed = bytes.to_vec();
            changed[0] ^= 1;
            std::fs::write(&package, changed).unwrap();
            let mut progress = false;
            let error = install_package(&plan, |_, _| progress = true).unwrap_err();
            assert!(error.contains("签名"), "{error}");
            assert!(!progress);
            assert!(!root.join("unpacked").exists());
            assert!(!root.join("previous").exists());
            assert_eq!(std::fs::read(target.join("bb-colive.exe")).unwrap(), b"original");
            plan.signature = None;
            plan.size = None;
            assert!(install_package(&plan, |_, _| {}).is_err());
        }
    }
}
