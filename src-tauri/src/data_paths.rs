use std::{path::PathBuf, sync::OnceLock};
use crate::data_migration;
static ROOT: OnceLock<PathBuf> = OnceLock::new();

pub fn initialize() -> Result<PathBuf, String> {
    let program = std::env::current_exe().map_err(|e| e.to_string())?.parent().ok_or(ui_text!("backend.data_paths.initialize"))?.to_path_buf();
    let roaming = std::env::var_os("APPDATA").map(PathBuf::from).ok_or(ui_text!("backend.data_paths.initialize2"))?;
    let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).ok_or(ui_text!("backend.data_paths.initialize3"))?;
    let root = data_migration::select_root(&program, &roaming, program.join("portable.flag").is_file());
    data_migration::migrate(&root, &roaming.join("cc.orange.danmu-app"), &local.join("cc.orange.danmu-app"))
        .map_err(|e| ui_format!("backend.data_paths.initialize4", e = e))?;
    migrate_program_themes(&program, &root)?;
    ROOT.set(root.clone()).map_err(|_| ui_text!("backend.data_paths.initialize5"))?;
    Ok(root)
}

pub fn root() -> Result<PathBuf, String> {
    ROOT.get().cloned().ok_or_else(|| ui_text!("backend.data_paths.root").into())
}

#[tauri::command]
pub fn get_app_data_directory() -> Result<String, String> {
    root().map(|p| p.to_string_lossy().into_owned())
}

fn read_anchor_list_file(path: &std::path::Path) -> Result<Vec<serde_json::Value>, String> {
    let bytes = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(ui_format!("backend.data_paths.read_anchor_list_file", error = error)),
    };
    let document: serde_json::Value = serde_json::from_slice(&bytes)
        .map_err(|error| ui_format!("backend.data_paths.read_anchor_list_file2", error = error))?;
    document.get("anchors").and_then(serde_json::Value::as_array).cloned()
        .ok_or_else(|| ui_text!("backend.data_paths.read_anchor_list_file3").into())
}

#[tauri::command]
pub fn read_anchor_list() -> Result<Vec<serde_json::Value>, String> {
    read_anchor_list_file(&root()?.join("anchors.local.json"))
}

fn migrate_program_themes(program: &std::path::Path, data: &std::path::Path) -> Result<(), String> {
    let marker = data.join(".brand-theme-migration-complete");
    if marker.exists() { return Ok(()); }
    if let Some(old_program) = legacy_installation() {
        let source = old_program.join("style");
        let destination = program.join("style");
        if source.is_dir() && source != destination {
            copy_missing(&source, &destination).map_err(|e| ui_format!("backend.data_paths.migrate_program_themes", e = e))?;
        }
    }
    std::fs::write(marker, b"1.0.0\n").map_err(|e| e.to_string())
}

fn copy_missing(source: &std::path::Path, destination: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(destination)?;
    for entry in std::fs::read_dir(source)? {
        let entry = entry?;
        let target = destination.join(entry.file_name());
        if entry.file_type()?.is_dir() { copy_missing(&entry.path(), &target)?; }
        else if !target.exists() { std::fs::copy(entry.path(), target)?; }
    }
    Ok(())
}

#[cfg(windows)]
fn legacy_installation() -> Option<PathBuf> {
    use windows_sys::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ};
    let key: Vec<u16> = "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\danmu-app".encode_utf16().chain(Some(0)).collect();
    let value: Vec<u16> = "InstallLocation".encode_utf16().chain(Some(0)).collect();
    for hive in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        let mut buffer = vec![0u16; 32768]; let mut bytes = (buffer.len() * 2) as u32;
        let status = unsafe { RegGetValueW(hive, key.as_ptr(), value.as_ptr(), RRF_RT_REG_SZ, std::ptr::null_mut(), buffer.as_mut_ptr().cast(), &mut bytes) };
        if status == 0 {
            let end = buffer.iter().position(|c| *c == 0).unwrap_or(buffer.len());
            return Some(PathBuf::from(String::from_utf16_lossy(&buffer[..end]).trim_matches('"')));
        }
    }
    None
}
#[cfg(not(windows))]
fn legacy_installation() -> Option<PathBuf> { None }

pub fn migrate_autostart(app: &tauri::AppHandle) -> Result<(), String> {
    #[cfg(windows)] {
        use tauri_plugin_autostart::ManagerExt;
        use windows_sys::Win32::System::Registry::{RegGetValueW, RegOpenKeyExW, RegDeleteValueW, RegCloseKey, HKEY_CURRENT_USER, RRF_RT_REG_SZ, KEY_SET_VALUE};
        if std::env::current_exe().map_err(|e| e.to_string())?.parent().unwrap().join("portable.flag").is_file() { return Ok(()); }
        let marker = root()?.join(".brand-autostart-migration-complete");
        if marker.exists() { return Ok(()); }
        let key: Vec<u16> = "Software\\Microsoft\\Windows\\CurrentVersion\\Run".encode_utf16().chain(Some(0)).collect();
        let value: Vec<u16> = "danmu-app".encode_utf16().chain(Some(0)).collect();
        let mut bytes = 0;
        let status = unsafe { RegGetValueW(HKEY_CURRENT_USER, key.as_ptr(), value.as_ptr(), RRF_RT_REG_SZ, std::ptr::null_mut(), std::ptr::null_mut(), &mut bytes) };
        if status == 0 {
            app.autolaunch().enable().map_err(|e| format!("无法迁移开机启动设置：{e}"))?;
            let mut handle = std::ptr::null_mut();
            let opened = unsafe { RegOpenKeyExW(HKEY_CURRENT_USER, key.as_ptr(), 0, KEY_SET_VALUE, &mut handle) };
            if opened != 0 { return Err("无法迁移旧开机启动项，请检查权限后重试".into()); }
            let result = unsafe { let result = RegDeleteValueW(handle, value.as_ptr()); RegCloseKey(handle); result };
            if result != 0 { return Err("无法移除旧开机启动项，请检查权限后重试".into()); }
        }
        std::fs::write(marker, b"1.0.0\n").map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn create_app_window(app: tauri::AppHandle, options: tauri::utils::config::WindowConfig) -> Result<(), String> {
    if !["display", "gift", "gift-only", "superchat", "guard", "native-style-preview"].contains(&options.label.as_str()) {
        return Err("未知窗口".into());
    }
    tauri::WebviewWindowBuilder::from_config(&app, &options)
        .map_err(|e| e.to_string())?
        .data_directory(root()?.join("WebView"))
        .build().map(|_| ()).map_err(|e| e.to_string())
}

pub fn portable_mode() -> bool {
    std::env::current_exe().ok().and_then(|p| p.parent().map(|p| p.join("portable.flag").is_file())).unwrap_or(false)
}

#[cfg(test)]
mod anchor_list_tests {
    use super::read_anchor_list_file;
    use std::{fs, path::PathBuf};
    fn directory() -> PathBuf {
        let path = std::env::temp_dir().join(format!("bb-colive-anchor-read-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        fs::create_dir_all(&path).unwrap();
        path
    }
    #[test]
    fn only_missing_file_is_an_empty_list() {
        let root = directory();
        assert!(read_anchor_list_file(&root.join("missing.json")).unwrap().is_empty());
        assert!(read_anchor_list_file(&root).is_err());
    }
    #[test]
    fn invalid_content_stays_unchanged_and_returns_an_error() {
        let path = directory().join("anchors.local.json");
        for content in ["{", "{}", r#"{"anchors":null}"#, r#"{"anchors":{}}"#] {
            fs::write(&path, content).unwrap();
            assert!(read_anchor_list_file(&path).is_err());
            assert_eq!(fs::read_to_string(&path).unwrap(), content);
        }
    }
    #[test]
    fn valid_lists_preserve_their_contents() {
        let path = directory().join("anchors.local.json");
        fs::write(&path, r#"{"anchors":[{"realRoomId":123,"uname":"主播"}]}"#).unwrap();
        let list = read_anchor_list_file(&path).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0]["realRoomId"], 123);
        fs::write(&path, r#"{"anchors":[]}"#).unwrap();
        assert!(read_anchor_list_file(&path).unwrap().is_empty());
    }
}
