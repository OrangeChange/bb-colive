use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Manager};

const MODES: [&str; 4] = ["native", "blivechat", "blivechat-open", "laplace"];
const LEGACY_MIGRATION_MARKER: &str = ".legacy-migration-complete";
static THEME_FILE_INDEX: OnceLock<Mutex<HashMap<(PathBuf, String), PathBuf>>> = OnceLock::new();
static PREPARED_THEME_ROOT: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();

fn program_style_write_error(error: impl std::fmt::Display) -> String {
    format!("theme-directory-unwritable:{error}")
}

pub(crate) fn theme_root() -> Result<PathBuf, String> {
    std::env::current_exe()
        .map_err(|error| ui_format!("backend.theme_store.theme_root", error = error))?
        .parent()
        .map(|path| path.join("style"))
        .ok_or_else(|| ui_text!("backend.theme_store.theme_root2").to_string())
}

fn copy_theme_directory(source: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir_all(target).map_err(|error| error.to_string())?;
    for entry in fs::read_dir(source)
        .map_err(|error| error.to_string())?
        .flatten()
    {
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        if entry
            .file_type()
            .map_err(|error| error.to_string())?
            .is_dir()
        {
            copy_theme_directory(&source_path, &target_path)?;
        } else {
            fs::copy(source_path, target_path).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn migrate_legacy_themes(legacy: &Path, root: &Path) -> Result<(), String> {
    if !legacy.exists() || legacy == root || root.join(LEGACY_MIGRATION_MARKER).exists() {
        return Ok(());
    }
    fs::create_dir_all(root).map_err(|error| error.to_string())?;
    let mut failures = Vec::new();
    for legacy_mode in MODES {
        let legacy_directory = legacy.join(legacy_mode);
        if !legacy_directory.exists() {
            continue;
        }
        let entries = fs::read_dir(&legacy_directory).map_err(|error| {
            ui_format!("backend.theme_store.migrate_legacy_themes", legacy_directory.display(), error = error)
        })?;
        for entry in entries {
            let entry = match entry {
                Ok(entry) => entry,
                Err(error) => {
                    failures.push(error.to_string());
                    continue;
                }
            };
            let source = entry.path();
            let is_directory = match entry.file_type() {
                Ok(file_type) => file_type.is_dir(),
                Err(error) => {
                    failures.push(ui_format!("backend.theme_store.migrate_legacy_themes2", source.display(), error = error));
                    continue;
                }
            };
            if !is_directory {
                continue;
            }
            let manifest = source.join("theme.json");
            let content = match fs::read_to_string(&manifest) {
                Ok(content) => content,
                Err(error) => {
                    failures.push(ui_format!("backend.theme_store.migrate_legacy_themes3", manifest.display(), error = error));
                    continue;
                }
            };
            let document = match serde_json::from_str::<Value>(&content) {
                Ok(document) => document,
                Err(error) => {
                    failures.push(ui_format!("backend.theme_store.migrate_legacy_themes4", manifest.display(), error = error));
                    continue;
                }
            };
            if document.get("origin").and_then(Value::as_str) != Some("custom") {
                continue;
            }
            let Some(theme_id) = document.get("themeId").and_then(Value::as_str) else {
                failures.push(ui_format!("backend.theme_store.migrate_legacy_themes5", manifest.display()));
                continue;
            };
            let existing = match find_theme_file(root, theme_id) {
                Ok(existing) => existing,
                Err(error) => {
                    failures.push(error);
                    continue;
                }
            };
            if existing.is_some() {
                continue;
            }
            let mode = document
                .get("mode")
                .and_then(Value::as_str)
                .unwrap_or(legacy_mode);
            let name = document
                .pointer("/metadata/name")
                .and_then(Value::as_str)
                .unwrap_or(ui_text!("backend.theme_store.migrate_legacy_themes9"));
            let target = match theme_file_for_write(root, mode, theme_id, name) {
                Ok(file) => file.parent().unwrap_or(root).to_path_buf(),
                Err(error) => {
                    failures.push(error);
                    continue;
                }
            };
            let name = target.file_name().ok_or(ui_text!("backend.theme_store.migrate_legacy_themes6"))?.to_string_lossy();
            let staging = target.with_file_name(format!(".{name}.migrating"));
            if staging.exists() {
                fs::remove_dir_all(&staging).map_err(|error| error.to_string())?;
            }
            if let Err(error) = copy_theme_directory(&source, &staging) {
                let _ = fs::remove_dir_all(&staging);
                failures.push(ui_format!("backend.theme_store.migrate_legacy_themes7", theme_id = theme_id, error = error));
                continue;
            }
            if let Err(error) = fs::rename(&staging, &target) {
                let _ = fs::remove_dir_all(&staging);
                failures.push(ui_format!("backend.theme_store.migrate_legacy_themes7", theme_id = theme_id, error = error));
            }
        }
    }
    if !failures.is_empty() {
        return Err(failures.join("；"));
    }
    fs::write(root.join(LEGACY_MIGRATION_MARKER), b"complete")
        .map_err(|error| ui_format!("backend.theme_store.migrate_legacy_themes8", error = error))?;
    Ok(())
}

fn prepare_theme_root(app: &AppHandle, require_writable: bool) -> Result<PathBuf, String> {
    let prepared = PREPARED_THEME_ROOT.get_or_init(|| Mutex::new(None));
    let mut prepared = prepared
        .lock()
        .map_err(|_| ui_text!("backend.theme_store.prepare_theme_root2").to_string())?;
    if let Some(root) = prepared.as_ref() {
        return Ok(root.clone());
    }
    let root = theme_root()?;
    let legacy = crate::data_paths::root()
        .map_err(|error| error.to_string())?
        .join("style");
    migrate_legacy_themes(&legacy, &root).map_err(|error| {
        if require_writable {
            program_style_write_error(error)
        } else {
            ui_format!("backend.theme_store.prepare_theme_root", error = error)
        }
    })?;
    *prepared = Some(root.clone());
    Ok(root)
}

fn safe_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 96
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
}

fn mode_directory(mode: &str) -> Result<&'static str, String> {
    match mode {
        "native" => Ok("native"),
        "blivechat" => Ok("blc"),
        "blivechat-open" => Ok("blc-open"),
        "laplace" => Ok("laplace"),
        _ => Err(ui_text!("backend.theme_store.mode_directory").to_string()),
    }
}

fn theme_directory_name(name: &str, theme_id: &str) -> Result<String, String> {
    if !safe_id(theme_id) {
        return Err(ui_text!("backend.theme_store.theme_directory_name").to_string());
    }
    let clean = name
        .chars()
        .map(|character| {
            if character.is_control()
                || matches!(
                    character,
                    '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
                )
            {
                ' '
            } else {
                character
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let clean = clean.trim_matches([' ', '.']);
    let clean = if clean.is_empty() {
        "未命名主题"
    } else {
        clean
    };
    let clean = clean.chars().take(64).collect::<String>();
    let clean = clean.trim_end_matches([' ', '.']);
    let stem = clean.split('.').next().unwrap_or(clean).to_ascii_uppercase();
    let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ["COM", "LPT"].iter().any(|prefix| {
            stem.strip_prefix(prefix).is_some_and(|number| matches!(number, "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"))
        });
    Ok(if reserved { format!("{clean}_") } else { clean.to_string() })
}

fn cache_theme_file(root: &Path, theme_id: &str, file: &Path) {
    if let Ok(mut index) = THEME_FILE_INDEX.get_or_init(|| Mutex::new(HashMap::new())).lock() {
        index.insert((root.to_path_buf(), theme_id.to_string()), file.to_path_buf());
    }
}

fn find_theme_file(root: &Path, theme_id: &str) -> Result<Option<PathBuf>, String> {
    if !safe_id(theme_id) {
        return Err("主题标识无效".to_string());
    }
    let cached = THEME_FILE_INDEX.get_or_init(|| Mutex::new(HashMap::new())).lock()
        .ok().and_then(|index| index.get(&(root.to_path_buf(), theme_id.to_string())).cloned());
    if let Some(file) = cached {
        let matches = fs::read_to_string(&file).ok()
            .and_then(|text| serde_json::from_str::<Value>(&text).ok())
            .is_some_and(|document| document.get("themeId").and_then(Value::as_str) == Some(theme_id));
        if matches { return Ok(Some(file)); }
        if let Ok(mut index) = THEME_FILE_INDEX.get().unwrap().lock() {
            index.remove(&(root.to_path_buf(), theme_id.to_string()));
        }
    }
    for (file, document) in theme_files(root)? {
        if document.get("themeId").and_then(Value::as_str) == Some(theme_id) {
            cache_theme_file(root, theme_id, &file);
            return Ok(Some(file));
        }
    }
    Ok(None)
}

fn theme_files(root: &Path) -> Result<Vec<(PathBuf, Value)>, String> {
    let mut files = Vec::new();
    for mode in MODES {
        let directory = root.join(mode_directory(mode)?);
        let Ok(entries) = fs::read_dir(directory) else {
            continue;
        };
        for entry in entries.flatten() {
            let file_type = match entry.file_type() {
                Ok(file_type) => file_type,
                Err(_) => continue,
            };
            let directory_name = entry.file_name();
            if !file_type.is_dir() || directory_name.to_string_lossy().starts_with('.') {
                continue;
            }
            let file = entry.path().join("theme.json");
            let Ok(content) = fs::read_to_string(&file) else {
                continue;
            };
            let Ok(document) = serde_json::from_str::<Value>(&content) else {
                continue;
            };
            files.push((file, document));
        }
    }
    files.sort_by_key(|(file, document)| {
        let name = document.pointer("/metadata/name").and_then(Value::as_str).unwrap_or("");
        let id = document.get("themeId").and_then(Value::as_str).unwrap_or("");
        let canonical = theme_directory_name(name, id).ok();
        let directory = file.parent().and_then(Path::file_name).and_then(|name| name.to_str());
        (canonical.as_deref() != directory, file.clone())
    });
    Ok(files)
}

fn decode_asset_changes(
    asset_changes: Option<HashMap<String, Option<String>>>,
) -> Result<HashMap<String, Option<Vec<u8>>>, String> {
    use base64::Engine;
    asset_changes
        .unwrap_or_default()
        .into_iter()
        .map(|(path, contents)| {
            let name = asset_name(&path)?;
            let relative = format!("assets/{name}");
            let bytes = contents
                .map(|value| {
                    base64::engine::general_purpose::STANDARD
                        .decode(value)
                        .map_err(|error| error.to_string())
                })
                .transpose()?;
            Ok((relative, bytes))
        })
        .collect()
}

fn theme_file_for_write(
    root: &Path,
    mode: &str,
    theme_id: &str,
    name: &str,
) -> Result<PathBuf, String> {
    if let Some(file) = find_theme_file(root, theme_id)? {
        return Ok(file);
    }
    let mode_root = root.join(mode_directory(mode)?);
    let name = theme_directory_name(name, theme_id)?;
    let mut number = 1;
    loop {
        let directory = if number == 1 { name.clone() } else { format!("{name} ({number})") };
        let candidate = mode_root.join(directory).join("theme.json");
        if !candidate.parent().is_some_and(Path::exists) {
            return Ok(candidate);
        }
        number += 1;
    }
}

fn asset_name(relative_path: &str) -> Result<&str, String> {
    let mut parts = relative_path.split('/');
    if parts.next() != Some("assets") {
        return Err("主题资源位置无效".to_string());
    }
    let Some(name) = parts.next() else {
        return Err("主题资源位置无效".to_string());
    };
    if parts.next().is_some()
        || name.is_empty()
        || name.len() > 160
        || !name.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        })
    {
        return Err("主题资源位置无效".to_string());
    }
    Ok(name)
}

fn theme_asset_file(
    root: &Path,
    mode: &str,
    theme_id: &str,
    relative_path: &str,
) -> Result<PathBuf, String> {
    let file = find_theme_file(root, theme_id)?.ok_or("主题不存在")?;
    let stored_mode = fs::read_to_string(&file)
        .ok()
        .and_then(|content| serde_json::from_str::<Value>(&content).ok())
        .and_then(|document| {
            document
                .get("mode")
                .and_then(Value::as_str)
                .map(str::to_owned)
        });
    if stored_mode.as_deref() != Some(mode) {
        return Err("主题模式不匹配".to_string());
    }
    let name = asset_name(relative_path)?;
    Ok(file
        .parent()
        .ok_or("主题目录无效")?
        .join("assets")
        .join(name))
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let temporary = path.with_extension(format!(
        "{}.tmp",
        path.extension()
            .and_then(|value| value.to_str())
            .unwrap_or("file")
    ));
    fs::write(&temporary, bytes).map_err(|error| error.to_string())?;
    if path.exists() {
        fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    fs::rename(temporary, path).map_err(|error| error.to_string())
}

fn copy_theme_assets(source: &Path, target: &Path) -> Result<(), String> {
    let source = source.join("assets");
    if !source.exists() {
        return Ok(());
    }
    let target = target.join("assets");
    fs::create_dir_all(&target).map_err(|error| error.to_string())?;
    for entry in fs::read_dir(source)
        .map_err(|error| error.to_string())?
        .flatten()
    {
        if entry
            .file_type()
            .map_err(|error| error.to_string())?
            .is_file()
        {
            fs::copy(entry.path(), target.join(entry.file_name()))
                .map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn write_theme_directory_atomically(
    directory: &Path,
    document: &Value,
    source_directory: Option<&Path>,
    asset_changes: &HashMap<String, Option<Vec<u8>>>,
    personal_document: Option<&Value>,
) -> Result<(), String> {
    let parent = directory.parent().ok_or("主题目录无效")?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let name = directory
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or("主题目录无效")?;
    let staging = parent.join(format!(".{name}.staging"));
    let backup = parent.join(format!(".{name}.backup"));
    if staging.exists() {
        fs::remove_dir_all(&staging).map_err(|error| error.to_string())?;
    }
    if backup.exists() {
        fs::remove_dir_all(&backup).map_err(|error| error.to_string())?;
    }
    fs::create_dir_all(&staging).map_err(|error| error.to_string())?;
    if let Some(source) = source_directory.filter(|source| source.exists()) {
        copy_theme_assets(source, &staging)?;
        let source_document = read_theme_document_file(&source.join("theme.json"))?;
        for path in source_document["assetOverrides"].as_array().into_iter().flatten().filter_map(Value::as_str) {
            let name = asset_name(path)?;
            fs::create_dir_all(staging.join("assets")).map_err(|e|e.to_string())?;
            fs::copy(source.join("edits/assets").join(name), staging.join("assets").join(name)).map_err(|e|e.to_string())?;
        }
    } else if directory.exists() {
        copy_theme_assets(directory, &staging)?;
    }
    let staging_assets = staging.join("assets");
    for (path, bytes) in asset_changes {
        if personal_document.is_some() { continue; }
        let name = Path::new(path).file_name().ok_or("主题资源位置无效")?;
        let target = staging_assets.join(name);
        if let Some(bytes) = bytes {
            fs::create_dir_all(&staging_assets).map_err(|error| error.to_string())?;
            fs::write(target, bytes).map_err(|error| error.to_string())?;
        } else if target.exists() {
            fs::remove_file(target).map_err(|error| error.to_string())?;
        }
    }
    let referenced = document
        .get("assets")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|asset| asset.get("path").and_then(Value::as_str))
        .filter_map(|path| Path::new(path).file_name().map(|name| name.to_owned()))
        .collect::<HashSet<_>>();
    if staging_assets.exists() {
        for entry in fs::read_dir(&staging_assets)
            .map_err(|error| error.to_string())?
            .flatten()
        {
            if entry
                .file_type()
                .map_err(|error| error.to_string())?
                .is_file()
                && !referenced.contains(&entry.file_name())
            {
                fs::remove_file(entry.path()).map_err(|error| error.to_string())?;
            }
        }
    }
    let settings = document.get("settings").ok_or("主题设置缺失")?;
    let styles = document.get("styles").ok_or("主题样式缺失")?;
    let manifest = json!({
        "themeId": document.get("themeId"), "mode": document.get("mode"), "origin": document.get("origin"),
        "metadata": document.get("metadata"), "assets": document.get("assets"), "revision": document.get("revision"),
    });
    fs::write(
        staging.join("theme.json"),
        serde_json::to_vec_pretty(&manifest).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    fs::write(
        staging.join("settings.json"),
        serde_json::to_vec_pretty(settings).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    for (file_name, key) in [
        ("base.css", "baseCss"),
        ("visual.css", "visualCss"),
        ("custom.css", "customCss"),
    ] {
        fs::write(
            staging.join(file_name),
            styles.get(key).and_then(Value::as_str).unwrap_or_default(),
        )
        .map_err(|error| error.to_string())?;
    }
    if let Some(personal) = personal_document {
        if directory.join("edits").exists() { copy_theme_directory(&directory.join("edits"), &staging.join("edits"))?; }
        write_theme_adjustments(&staging.join("theme.json"), personal, asset_changes)?;
    }
    if directory.exists() {
        fs::rename(directory, &backup).map_err(|error| error.to_string())?;
    }
    if let Err(error) = fs::rename(&staging, directory) {
        if backup.exists() {
            let _ = fs::rename(&backup, directory);
        }
        return Err(error.to_string());
    }
    if backup.exists() {
        let _ = fs::remove_dir_all(backup);
    }
    Ok(())
}

fn summary(document: &Value) -> Option<Value> {
    let metadata = document.get("metadata")?;
    let mut value = json!({
        "themeId": document.get("themeId")?, "mode": document.get("mode")?,
        "origin": document.get("origin")?, "name": metadata.get("name")?,
        "author": metadata.get("author")?, "version": metadata.get("version")?,
        "updatedAt": metadata.get("updatedAt")?, "revision": document.get("revision")?,
    });
    if let Some(url) = metadata.get("sourceUrl").and_then(Value::as_str) {
        value["sourceUrl"] = json!(url);
    }
    if metadata.pointer("/externalHtml/verified").and_then(Value::as_bool) == Some(true) {
        value["externalHtml"] = json!(true);
    }
    Some(value)
}

fn read_theme_default_file(file: &Path) -> Result<Value, String> {
    let directory = file.parent().ok_or("主题目录无效")?;
    let content = fs::read_to_string(file)
        .map_err(|error| format!("无法读取 {}：{error}", file.display()))?;
    let mut document = serde_json::from_str::<Value>(&content)
        .map_err(|error| format!("主题清单无效 {}：{error}", file.display()))?;
    let object = document.as_object_mut().ok_or("主题清单无效")?;
    object.insert("assetOverrides".into(), json!([]));
    let settings_file = directory.join("settings.json");
    let settings = fs::read_to_string(&settings_file)
        .map_err(|error| format!("无法读取 {}：{error}", settings_file.display()))?;
    object.insert(
        "settings".to_string(),
        serde_json::from_str(&settings)
            .map_err(|error| format!("主题设置无效 {}：{error}", settings_file.display()))?,
    );
    let read_css = |name: &str| {
        let path = directory.join(name);
        fs::read_to_string(&path).map_err(|error| format!("无法读取 {}：{error}", path.display()))
    };
    object.insert(
        "styles".to_string(),
        json!({
            "baseCss": read_css("base.css")?,
            "visualCss": read_css("visual.css")?,
            "customCss": read_css("custom.css")?,
        }),
    );
    Ok(document)
}

fn setting_difference(defaults: &Value, edited: &Value) -> Option<Value> {
    if defaults == edited || (defaults.is_null() && edited.as_object().is_some_and(|value| value.is_empty())) { return None; }
    if let (Some(defaults), Some(edited)) = (defaults.as_object(), edited.as_object()) {
        let changes = edited.iter().filter_map(|(key,value)| setting_difference(defaults.get(key).unwrap_or(&Value::Null),value).map(|change|(key.clone(),change))).collect::<serde_json::Map<_,_>>();
        return (!changes.is_empty()).then_some(Value::Object(changes));
    }
    Some(edited.clone())
}

fn merge_setting(defaults: &Value, edited: &Value) -> Value {
    if let (Some(defaults), Some(edited)) = (defaults.as_object(), edited.as_object()) {
        let mut merged=defaults.clone();
        for (key,value) in edited { merged.insert(key.clone(),merge_setting(defaults.get(key).unwrap_or(&Value::Null),value)); }
        Value::Object(merged)
    } else { edited.clone() }
}

fn apply_theme_metadata_adjustment(document: &mut Value, edits: &Value) {
    if document["origin"] == "builtin" {
        if let Some(value) = edits["metadata"].get("localModifiedAt") {
            document["metadata"]["localModifiedAt"] = value.clone();
        }
    } else if let Some(metadata) = edits.get("metadata") {
        document["metadata"] = metadata.clone();
    }
}

fn read_theme_document_file(file: &Path) -> Result<Value, String> {
    let mut document = read_theme_default_file(file)?;
    let edits = file.parent().ok_or("主题目录无效")?.join("edits").join("adjustments.json");
    if edits.exists() {
        let value: Value = serde_json::from_slice(&fs::read(edits).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        if let Some(settings) = value["settings"].as_object() {
            let target = document["settings"].as_object_mut().ok_or("主题设置无效")?;
            for (key,value) in settings {
                let merged=if matches!(key.as_str(),"visualModel"|"visualAuthored") {value.clone()} else {merge_setting(target.get(key).unwrap_or(&Value::Null),value)};
                target.insert(key.clone(),merged);
            }
        }
        for key in ["visualCss", "customCss"] {
            if let Some(css) = value[key].as_str() { document["styles"][key] = json!(css); }
        }
        apply_theme_metadata_adjustment(&mut document, &value);
        for key in ["assets", "revision"] {
            if let Some(item) = value.get(key) { document[key] = item.clone(); }
        }
        document["assetOverrides"] = value.get("assetOverrides").cloned().unwrap_or_else(|| json!([]));
    }
    Ok(document)
}

fn write_theme_adjustments(file: &Path, document: &Value, changes: &HashMap<String, Option<Vec<u8>>>) -> Result<(), String> {
    let defaults = read_theme_default_file(file)?;
    let directory = file.parent().ok_or("主题目录无效")?;
    let mut settings = serde_json::Map::new();
    for (key, value) in document["settings"].as_object().ok_or("主题设置无效")? {
        let default=defaults["settings"].get(key).unwrap_or(&Value::Null);
        let change=if matches!(key.as_str(),"visualModel"|"visualAuthored") {(default!=value).then(||value.clone())} else {setting_difference(default,value)};
        if let Some(change)=change { settings.insert(key.clone(),change); }
    }
    let mut edits = json!({"settings": settings, "assets": document["assets"], "revision": document["revision"], "assetOverrides":document.get("assetOverrides").cloned().unwrap_or_else(||json!([]))});
    let mut active = document["assetOverrides"].as_array().cloned().unwrap_or_default();
    for (path,bytes) in changes {
        if bytes.is_some() && !active.iter().any(|item|item.as_str()==Some(path)) { active.push(json!(path)); }
    }
    active.retain(|item| document["assets"].as_array().is_some_and(|assets|assets.iter().any(|asset|asset["path"]==*item)));
    edits["assetOverrides"]=json!(active);
    edits["metadata"] = if defaults["origin"].as_str() == Some("builtin") {
        let mut metadata = defaults["metadata"].clone();
        if let Some(value) = document["metadata"].get("localModifiedAt") { metadata["localModifiedAt"] = value.clone(); }
        metadata
    } else { document["metadata"].clone() };
    for key in ["visualCss", "customCss"] {
        if document["styles"][key] != defaults["styles"][key] { edits[key] = document["styles"][key].clone(); }
    }
    for (path, bytes) in changes {
        if let Some(bytes) = bytes {
            let target = directory.join("edits/assets").join(asset_name(path)?);
            fs::create_dir_all(target.parent().ok_or("主题资源位置无效")?).map_err(|e| e.to_string())?;
            fs::write(target, bytes).map_err(|e| e.to_string())?;
        }
    }
    let target = directory.join("edits");
    fs::create_dir_all(&target).map_err(|e| e.to_string())?;
    write_atomic(&target.join("adjustments.json"), &serde_json::to_vec_pretty(&edits).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub fn list_theme_summaries(app: AppHandle) -> Result<Vec<Value>, String> {
    let root = prepare_theme_root(&app, false)?;
    list_theme_summaries_at(&root)
}

fn list_theme_summaries_at(root: &Path) -> Result<Vec<Value>, String> {
    let mut result = Vec::new();
    let mut seen = HashSet::new();
    for (file, mut document) in theme_files(root)? {
        let edits = file.parent().ok_or("主题目录无效")?.join("edits/adjustments.json");
        let mut adjusted = false;
        if let Ok(bytes) = fs::read(edits) {
            if let Ok(value) = serde_json::from_slice::<Value>(&bytes) {
                adjusted = value["settings"].as_object().is_some_and(|settings| !settings.is_empty())
                    || value.get("visualCss").is_some() || value.get("customCss").is_some();
                apply_theme_metadata_adjustment(&mut document, &value);
                if let Some(revision) = value.get("revision") { document["revision"] = revision.clone(); }
            }
        }
        if let (Some(mut item), Some(id)) = (summary(&document), document.get("themeId").and_then(Value::as_str)) {
            item["adjusted"] = json!(adjusted);
            if !seen.insert(id.to_string()) { continue; }
            cache_theme_file(root, id, &file);
            result.push(item);
        }
    }
    Ok(result)
}

#[tauri::command]
pub fn read_theme_document(app: AppHandle, theme_id: String) -> Result<Option<Value>, String> {
    let root = prepare_theme_root(&app, false)?;
    if let Some(file) = find_theme_file(&root, &theme_id)? {
        return read_theme_document_file(&file).map(Some);
    }
    Ok(None)
}

#[tauri::command]
pub fn read_theme_defaults(app: AppHandle, theme_id: String) -> Result<Option<Value>, String> {
    let root = prepare_theme_root(&app, false)?;
    find_theme_file(&root, &theme_id)?.map(|file| read_theme_default_file(&file)).transpose()
}

#[tauri::command]
pub fn write_theme_document(
    app: AppHandle,
    document: Value,
    source_theme_id: Option<String>,
    asset_changes: Option<HashMap<String, Option<String>>>,
    replace_defaults: Option<bool>,
    update_source: Option<bool>,
) -> Result<(), String> {
    let theme_id = document
        .get("themeId")
        .and_then(Value::as_str)
        .ok_or("主题标识缺失")?;
    let mode = document
        .get("mode")
        .and_then(Value::as_str)
        .ok_or("主题模式缺失")?;
    let root = prepare_theme_root(&app, true)?;
    let name = document
        .pointer("/metadata/name")
        .and_then(Value::as_str)
        .ok_or("主题名称缺失")?;
    let file = theme_file_for_write(&root, mode, theme_id, name)?;
    let directory = file.parent().ok_or("主题目录无效")?;
    let incoming_revision = document
        .get("revision")
        .and_then(Value::as_u64)
        .ok_or("主题修订缺失")?;
    if file.exists() {
        let stored = read_theme_document_file(&file)?;
        if replace_defaults == Some(true) && stored["origin"] == "builtin" {
            return Err("内置主题不能覆盖，请导入为副本".into());
        }
        let stored_revision = stored.get("revision").and_then(Value::as_u64).unwrap_or(0);
        if incoming_revision != stored_revision + 1 {
            return Err("theme-file-conflict".to_string());
        }
    }
    let source_directory = source_theme_id
        .as_deref()
        .map(|source_id| find_theme_file(&root, source_id))
        .transpose()?
        .flatten()
        .and_then(|file| file.parent().map(Path::to_path_buf));
    let decoded_changes = decode_asset_changes(asset_changes)?;
    if file.exists() && update_source == Some(true) {
        let mut defaults = read_theme_default_file(&file)?;
        if defaults["origin"] == "builtin" { return Err("内置主题不能更新来源，请另存后更新".into()); }
        defaults["styles"]["baseCss"] = document["styles"]["baseCss"].clone();
        defaults["metadata"] = document["metadata"].clone();
        defaults["revision"] = document["revision"].clone();
        let old_assets = defaults["assets"].as_array().cloned().unwrap_or_default();
        defaults["assets"] = json!(document["assets"].as_array().into_iter().flatten().filter(|asset|old_assets.iter().any(|old|old["id"]==asset["id"]) || asset.get("sourceUrl").is_some()).cloned().collect::<Vec<_>>());
        return write_theme_directory_atomically(directory, &defaults, None, &decoded_changes, Some(&document)).map_err(program_style_write_error);
    }
    if file.exists() && replace_defaults != Some(true) {
        return write_theme_adjustments(&file, &document, &decoded_changes).map_err(program_style_write_error);
    }
    write_theme_directory_atomically(directory, &document, source_directory.as_deref(), &decoded_changes, None)
        .map_err(program_style_write_error)
}

#[tauri::command]
pub fn delete_theme_document(app: AppHandle, theme_id: String) -> Result<(), String> {
    let root = prepare_theme_root(&app, true)?;
    if let Some(file) = find_theme_file(&root, &theme_id)? {
        return fs::remove_dir_all(file.parent().ok_or("主题目录无效")?)
            .map_err(program_style_write_error);
    }
    Ok(())
}

#[tauri::command]
pub fn read_theme_package_raw(path: String) -> Result<tauri::ipc::Response, String> {
    fs::read(path).map(tauri::ipc::Response::new).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn write_theme_package_raw(request: tauri::ipc::Request<'_>) -> Result<(), String> {
    use base64::Engine;
    let encoded = request.headers().get("x-theme-path").and_then(|value| value.to_str().ok()).ok_or("未选择保存位置，请重新选择")?;
    let path = base64::engine::general_purpose::STANDARD.decode(encoded).map_err(|_| "保存位置无效，请重新选择")?;
    let path = String::from_utf8(path).map_err(|_| "保存位置无效，请重新选择")?;
    match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => fs::write(path, bytes).map_err(|error| error.to_string()),
        _ => Err("主题文件内容无效，请重新导出".into()),
    }
}

#[tauri::command]
pub fn read_theme_package_bytes(path: String) -> Result<String, String> {
    use base64::Engine;
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

#[tauri::command]
pub fn read_theme_asset_bytes(
    app: AppHandle,
    theme_id: String,
    path: String,
) -> Result<String, String> {
    use base64::Engine;
    read_theme_asset_data(app, theme_id, path)
        .map(|bytes| base64::engine::general_purpose::STANDARD.encode(bytes))
}

pub fn read_theme_asset_data(app: AppHandle, theme_id: String, path: String) -> Result<Vec<u8>, String> {
    let root = prepare_theme_root(&app, false)?;
    let manifest = find_theme_file(&root, &theme_id)?.ok_or("主题不存在")?;
    let stored = read_theme_document_file(&manifest)?;
    if stored["assetOverrides"].as_array().is_some_and(|paths| paths.iter().any(|item|item.as_str()==Some(&path))) {
        let edited = manifest.parent().ok_or("主题目录无效")?.join("edits/assets").join(asset_name(&path)?);
        return fs::read(edited).map_err(|e|format!("无法读取已调整的主题素材：{e}"));
    }
    let asset = stored["assets"].as_array().and_then(|assets| assets.iter().find(|a| a["path"].as_str() == Some(&path)));
    if let Some(asset) = asset {
        for (key, kind) in [("sharedResourceId", "shared"), ("cacheResourceId", "remote")] {
            if let Some(id) = asset[key].as_str() {
                return crate::theme_resources::read_resource_at(&root, kind, id, asset["resourceFileName"].as_str().unwrap_or(asset_name(&path)?));
            }
        }
    }
    let file = manifest.parent().ok_or("主题目录无效")?.join("assets").join(asset_name(&path)?);
    if file.exists() {
        return fs::read(file).map_err(|error| error.to_string());
    }
    if let Ok(bytes)=fs::read(root.join("catalog-assets.json")) {
        if let Ok(aliases)=serde_json::from_slice::<Value>(&bytes) {
            if let Some(id)=aliases[&path]["sharedResourceId"].as_str() {
                return crate::theme_resources::read_resource_at(&root,"shared",id,asset_name(&path)?);
            }
        }
    }
    Err("主题资源不存在".to_string())
}

pub(crate) fn theme_asset_media_type(app: &AppHandle, theme_id: &str, path: &str) -> Option<String> {
    let root=prepare_theme_root(app,false).ok()?;
    let file=find_theme_file(&root,theme_id).ok()??;
    let value=read_theme_document_file(&file).ok()?;
    value["assets"].as_array()?.iter().find(|a|a["path"].as_str()==Some(path))?["mediaType"].as_str().map(str::to_owned)
}

pub(crate) fn theme_asset_source_url(app: &AppHandle, theme_id: &str, path: &str) -> Option<String> {
    let root = prepare_theme_root(app, false).ok()?;
    if let Some(file) = find_theme_file(&root, theme_id).ok().flatten() {
        let value = read_theme_document_file(&file).ok()?;
        if let Some(url) = value["assets"].as_array().and_then(|items| items.iter().find(|item| item["path"].as_str() == Some(path))).and_then(|item| item["sourceUrl"].as_str()) {
            return Some(url.to_owned());
        }
    }
    let aliases: Value = serde_json::from_slice(&fs::read(root.join("catalog-assets.json")).ok()?).ok()?;
    aliases[path]["sourceUrl"].as_str().map(str::to_owned)
}

pub fn legacy_catalog_asset(app: AppHandle, name: &str) -> Result<String, String> {
    let root = prepare_theme_root(&app, false)?;
    legacy_catalog_asset_at(&root, name)
}

fn legacy_catalog_asset_at(root: &Path, name: &str) -> Result<String, String> {
    let relative_path = format!("assets/{name}");
    asset_name(&relative_path)?;
    let bytes = fs::read(root.join("catalog-assets.json")).map_err(|error| error.to_string())?;
    let aliases: Value = serde_json::from_slice(&bytes).map_err(|error| error.to_string())?;
    aliases.get(&relative_path).and_then(|entry| entry["themeId"].as_str())
        .map(str::to_owned).ok_or_else(|| "主题资源不存在".into())
}

#[tauri::command]
pub fn write_theme_asset_bytes(
    app: AppHandle,
    theme_id: String,
    mode: String,
    path: String,
    contents_base64: String,
) -> Result<(), String> {
    use base64::Engine;
    let file = theme_asset_file(&prepare_theme_root(&app, true)?, &mode, &theme_id, &path)?;
    fs::create_dir_all(file.parent().ok_or("主题资源目录无效")?)
        .map_err(|error| error.to_string())?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(contents_base64)
        .map_err(|error| error.to_string())?;
    write_atomic(&file, &bytes).map_err(program_style_write_error)
}

#[tauri::command]
pub fn delete_theme_asset(
    app: AppHandle,
    theme_id: String,
    mode: String,
    path: String,
) -> Result<(), String> {
    let file = theme_asset_file(&prepare_theme_root(&app, true)?, &mode, &theme_id, &path)?;
    if file.exists() {
        fs::remove_file(file).map_err(program_style_write_error)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        asset_name, decode_asset_changes, find_theme_file, migrate_legacy_themes,
        read_theme_document_file, safe_id, summary, theme_directory_name, theme_file_for_write,
        write_theme_directory_atomically,
    };
    use base64::Engine;
    use serde_json::json;
    use std::collections::HashMap;
    use std::fs;

    #[test]
    fn legacy_catalog_request_uses_asset_relative_path() {
        let root = temporary_directory("catalog-alias");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("catalog-assets.json"), r#"{"assets/catalog-1.ttf":{"themeId":"laplace-builtin-bubble","path":"assets/catalog-1.ttf"}}"#).unwrap();
        assert_eq!(super::legacy_catalog_asset_at(&root, "catalog-1.ttf").unwrap(), "laplace-builtin-bubble");
        assert!(super::legacy_catalog_asset_at(&root, "missing.ttf").is_err());
        assert!(super::legacy_catalog_asset_at(&root, "../catalog-1.ttf").is_err());
    }

    fn temporary_directory(label: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "danmu-theme-{label}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn adjustments_keep_default_files_and_empty_layers() {
        let root = temporary_directory("personal-adjustments");
        let document = json!({"themeId":"builtin-test","mode":"native","origin":"builtin","revision":1,"metadata":{"name":"Default"},"settings":{"avatar":true,"scale":1},"styles":{"baseCss":"base","visualCss":"visual","customCss":"custom"},"assets":[]});
        write_theme_directory_atomically(&root, &document, None, &HashMap::new(), None).unwrap();
        let manifest = root.join("theme.json");
        let before = fs::read(&manifest).unwrap();
        let mut edited = document.clone();
        edited["settings"]["avatar"] = json!(false);
        edited["styles"]["customCss"] = json!("");
        edited["revision"] = json!(2);
        super::write_theme_adjustments(&manifest, &edited, &HashMap::new()).unwrap();
        assert_eq!(fs::read(&manifest).unwrap(), before);
        assert_eq!(super::read_theme_default_file(&manifest).unwrap()["settings"]["avatar"], true);
        let loaded = read_theme_document_file(&manifest).unwrap();
        assert_eq!(loaded["settings"]["avatar"], false);
        assert_eq!(loaded["styles"]["customCss"], "");
        assert_eq!(loaded["styles"]["visualCss"], "visual");
        super::write_theme_adjustments(&manifest, &document, &HashMap::new()).unwrap();
        assert_eq!(read_theme_document_file(&manifest).unwrap(), super::read_theme_default_file(&manifest).unwrap());
    }

    #[test]
    fn builtin_rename_keeps_personal_adjustments() {
        let store = temporary_directory("builtin-rename");
        let root = store.join("native/卡片");
        let document = json!({"themeId":"native-card","mode":"native","origin":"builtin","revision":1,"metadata":{"name":"卡片","author":"橙橙子君","version":"1.0.0","updatedAt":"2026-11-16"},"settings":{"avatar":true},"styles":{"baseCss":"base","visualCss":"","customCss":""},"assets":[]});
        write_theme_directory_atomically(&root, &document, None, &HashMap::new(), None).unwrap();
        let manifest = root.join("theme.json");
        let mut edited = document.clone();
        edited["settings"]["avatar"] = json!(false);
        edited["metadata"]["localModifiedAt"] = json!("2026-11-17");
        super::write_theme_adjustments(&manifest, &edited, &HashMap::new()).unwrap();
        let mut renamed = document;
        renamed["metadata"]["name"] = json!("浅映卡片");
        fs::write(&manifest, serde_json::to_vec(&renamed).unwrap()).unwrap();
        let loaded = read_theme_document_file(&manifest).unwrap();
        assert_eq!(loaded["metadata"]["name"], "浅映卡片");
        assert_eq!(loaded["metadata"]["localModifiedAt"], "2026-11-17");
        assert_eq!(loaded["settings"]["avatar"], false);
        assert_eq!(super::list_theme_summaries_at(&store).unwrap()[0]["name"], "浅映卡片");
    }

    fn write_legacy_theme(directory: &std::path::Path, theme_id: &str, name: &str) {
        fs::create_dir_all(directory).unwrap();
        fs::write(
            directory.join("theme.json"),
            format!(
                r#"{{"themeId":"{theme_id}","mode":"native","origin":"custom","metadata":{{"name":"{name}"}}}}"#
            ),
        )
        .unwrap();
        fs::write(directory.join("settings.json"), "{}").unwrap();
    }

    #[test]
    fn ids_are_single_safe_segments() {
        assert!(safe_id("native-theme_1"));
        assert!(!safe_id("../theme"));
        assert!(!safe_id(""));
        assert_eq!(
            theme_directory_name("新建/主题", "a13f62c8-1234").unwrap(),
            "新建 主题"
        );
        assert_eq!(theme_directory_name("CON", "safe-id").unwrap(), "CON_");
    }

    #[test]
    fn readable_directories_number_same_names_and_keep_existing_ids() {
        let root = temporary_directory("readable-names");
        let first = theme_file_for_write(&root, "native", "first-id", "我的主题").unwrap();
        assert_eq!(first, root.join("native/我的主题/theme.json"));
        write_legacy_theme(first.parent().unwrap(), "first-id", "我的主题");
        let second = theme_file_for_write(&root, "native", "second-id", "我的主题").unwrap();
        assert_eq!(second, root.join("native/我的主题 (2)/theme.json"));
        write_legacy_theme(second.parent().unwrap(), "second-id", "我的主题");
        let third = theme_file_for_write(&root, "native", "third-id", "我的主题").unwrap();
        assert_eq!(third, root.join("native/我的主题 (3)/theme.json"));
        assert_eq!(theme_file_for_write(&root, "native", "first-id", "更名").unwrap(), first);
        let old = root.join("native/旧主题-abcdefgh");
        write_legacy_theme(&old, "old-id", "旧主题");
        assert_eq!(theme_file_for_write(&root, "native", "old-id", "旧主题").unwrap(), old.join("theme.json"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn overlay_keeps_one_builtin_and_reads_the_readable_directory() {
        let root = temporary_directory("builtin-overlay");
        let legacy = root.join("laplace/Laplace 默认-laplaced");
        let current = root.join("laplace/LAPLACE 默认");
        for (directory, name, revision) in [(&legacy, "Laplace 默认", 1), (&current, "LAPLACE 默认", 2)] {
            fs::create_dir_all(directory).unwrap();
            fs::write(directory.join("theme.json"), json!({
                "themeId":"laplace-default", "mode":"laplace", "origin":"builtin", "revision":revision,
                "metadata":{"name":name,"author":"LAPLACE Chat","version":"2.0.7","updatedAt":"2026-03-21"}
            }).to_string()).unwrap();
        }
        let items = super::list_theme_summaries_at(&root).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["name"], "LAPLACE 默认");
        assert_eq!(find_theme_file(&root, "laplace-default").unwrap(), Some(current.join("theme.json")));
        assert!(legacy.join("theme.json").exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn theme_summary_preserves_remote_source_without_adding_it_to_local_themes() {
        let mut document = json!({
            "themeId":"remote", "mode":"laplace", "origin":"custom", "revision":1,
            "metadata":{"name":"远程主题", "author":"", "version":"", "updatedAt":""}
        });
        assert!(summary(&document).unwrap().get("sourceUrl").is_none());
        document["metadata"]["sourceUrl"] = json!("https://example.com/style.css");
        assert_eq!(summary(&document).unwrap()["sourceUrl"], document["metadata"]["sourceUrl"]);
        assert!(summary(&document).unwrap().get("externalHtml").is_none());
        document["metadata"]["externalHtml"] = json!({"verified":true});
        assert_eq!(summary(&document).unwrap()["externalHtml"], json!(true));
    }

    #[test]
    fn colliding_short_ids_use_different_theme_directories() {
        let root = temporary_directory("short-id-collision");
        let first = theme_file_for_write(&root, "native", "abcdefgh-1111", ui_text!("backend.theme_store.colliding_short_ids_use_different_theme_directories")).unwrap();
        fs::create_dir_all(first.parent().unwrap()).unwrap();
        fs::write(&first, r#"{"themeId":"abcdefgh-1111","mode":"native"}"#).unwrap();
        let second = theme_file_for_write(&root, "native", "abcdefgh-2222", ui_text!("backend.theme_store.colliding_short_ids_use_different_theme_directories")).unwrap();
        assert_ne!(first.parent(), second.parent());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn punctuation_only_id_difference_still_uses_a_distinct_directory() {
        let root = temporary_directory("punctuation-id-collision");
        let first = theme_file_for_write(&root, "native", "same-id", ui_text!("backend.theme_store.punctuation_only_id_difference_still_uses_a_distinct_directory")).unwrap();
        fs::create_dir_all(first.parent().unwrap()).unwrap();
        fs::write(&first, r#"{"themeId":"same-id","mode":"native"}"#).unwrap();
        let second = theme_file_for_write(&root, "native", "same_id", ui_text!("backend.theme_store.punctuation_only_id_difference_still_uses_a_distinct_directory")).unwrap();
        assert_ne!(first.parent(), second.parent());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn summary_omits_theme_content() {
        let result = summary(&json!({
            "themeId":"one", "mode":"native", "origin":"custom", "revision":1,
            "metadata":{"name":ui_text!("backend.theme_store.summary_omits_theme_content"),"author":"","version":"1.0.0","updatedAt":"now"},
            "settings":{"large":"content"}, "assets":[{"path":"large.png"}]
        }))
        .unwrap();
        assert!(result.get("settings").is_none());
        assert!(result.get("assets").is_none());
    }

    #[test]
    fn assets_stay_in_the_theme_asset_directory() {
        assert_eq!(asset_name("assets/frame.webp").unwrap(), "frame.webp");
        assert!(asset_name("../frame.webp").is_err());
        assert!(asset_name("assets/nested/frame.webp").is_err());
    }

    #[test]
    fn new_theme_asset_changes_validate_without_an_existing_theme() {
        let encoded = base64::engine::general_purpose::STANDARD.encode(b"new asset");
        let decoded = decode_asset_changes(Some(HashMap::from([(
            "assets/frame.webp".to_string(),
            Some(encoded),
        )])))
        .unwrap();

        assert_eq!(
            decoded.get("assets/frame.webp"),
            Some(&Some(b"new asset".to_vec()))
        );
    }

    #[test]
    fn save_as_copies_declared_assets_into_an_independent_theme_directory() {
        let root = temporary_directory("save-as-assets");
        let source = root.join("source");
        let target = root.join("target");
        fs::create_dir_all(source.join("assets")).unwrap();
        fs::write(source.join("assets/frame.webp"), b"source asset").unwrap();
        let document = json!({
            "themeId":"copy", "mode":"blivechat", "origin":"custom", "revision":1,
            "metadata":{"name":ui_text!("backend.theme_store.save_as_copies_declared_assets_into_an_independent_theme_directory")},
            "settings":{},
            "styles":{"baseCss":"","visualCss":"","customCss":""},
            "assets":[{"id":"frame","name":"图片","path":"assets/frame.webp","mediaType":"image/webp"}]
        });

        write_theme_directory_atomically(&source, &document, None, &HashMap::new(), None).unwrap();
        write_theme_directory_atomically(&target, &document, Some(&source), &HashMap::new(), None).unwrap();
        assert_eq!(fs::read(target.join("assets/frame.webp")).unwrap(), b"source asset");
        fs::write(target.join("assets/frame.webp"), b"copy asset").unwrap();
        assert_eq!(fs::read(source.join("assets/frame.webp")).unwrap(), b"source asset");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn temporary_theme_directories_are_not_discoverable() {
        let root = temporary_directory("temporary-directories");
        for suffix in ["staging", "backup", "migrating"] {
            write_legacy_theme(
                &root.join(format!("native/.draft.{suffix}")),
                "hidden-id",
                "隐藏主题",
            );
        }

        assert!(find_theme_file(&root, "hidden-id").unwrap().is_none());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn legacy_themes_copy_once_without_deleting_source() {
        let base = temporary_directory("migration");
        let legacy_theme = base.join("legacy/style/native/old-id");
        let target = base.join("program/style");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&legacy_theme).unwrap();
        fs::write(legacy_theme.join("theme.json"), r#"{"themeId":"old-id","mode":"native","origin":"custom","metadata":{"name":"旧主题"}}"#).unwrap();
        fs::write(legacy_theme.join("settings.json"), "{}").unwrap();

        migrate_legacy_themes(&base.join("legacy/style"), &target).unwrap();
        migrate_legacy_themes(&base.join("legacy/style"), &target).unwrap();

        assert!(legacy_theme.join("theme.json").exists());
        assert!(target.join("native/旧主题/theme.json").exists());
        assert_eq!(fs::read_dir(target.join("native")).unwrap().count(), 1);
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn migration_does_not_collide_with_dotted_theme_names() {
        let base = temporary_directory("migration-dotted-names");
        let legacy = base.join("legacy/style");
        let target = base.join("program/style");
        let existing = target.join(ui_text!("backend.theme_store.migration_does_not_collide_with_dotted_theme_names"));
        write_legacy_theme(&existing, "existing-theme", "主题.migrating");
        fs::create_dir_all(existing.join("assets")).unwrap();
        fs::write(existing.join("assets/keep.svg"), b"existing material").unwrap();
        write_legacy_theme(&legacy.join("native/incoming"), "incoming-theme", "主题.v2");
        migrate_legacy_themes(&legacy, &target).unwrap();
        assert_eq!(fs::read(existing.join("assets/keep.svg")).unwrap(), b"existing material");
        assert_eq!(find_theme_file(&target, "existing-theme").unwrap(), Some(existing.join("theme.json")));
        assert_eq!(find_theme_file(&target, "incoming-theme").unwrap(), Some(target.join("native/主题.v2/theme.json")));
        assert!(legacy.join("native/incoming/theme.json").exists());
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn completed_migration_does_not_restore_a_theme_deleted_by_the_user() {
        let base = temporary_directory("migration-deletion");
        let legacy_theme = base.join("legacy/style/native/old-id");
        let target = base.join("program/style");
        write_legacy_theme(&legacy_theme, "old-id", "旧主题");

        migrate_legacy_themes(&base.join("legacy/style"), &target).unwrap();
        fs::remove_dir_all(target.join("native/旧主题")).unwrap();
        migrate_legacy_themes(&base.join("legacy/style"), &target).unwrap();

        assert!(find_theme_file(&target, "old-id").unwrap().is_none());
        assert!(legacy_theme.join("theme.json").exists());
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn failed_migration_remains_retryable_and_only_retries_missing_themes() {
        let base = temporary_directory("migration-retry");
        let legacy = base.join("legacy/style");
        let target = base.join("program/style");
        write_legacy_theme(&legacy.join("native/good-id"), "good-id", "可迁移");
        fs::create_dir_all(legacy.join("native/bad-id")).unwrap();
        fs::write(legacy.join("native/bad-id/theme.json"), "{broken").unwrap();

        assert!(migrate_legacy_themes(&legacy, &target).is_err());
        assert!(find_theme_file(&target, "good-id").unwrap().is_some());
        write_legacy_theme(&legacy.join("native/bad-id"), "bad-id", "已修复");
        migrate_legacy_themes(&legacy, &target).unwrap();

        assert!(find_theme_file(&target, "good-id").unwrap().is_some());
        assert!(find_theme_file(&target, "bad-id").unwrap().is_some());
        assert_eq!(fs::read_dir(target.join("native")).unwrap().count(), 2);
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn missing_css_file_is_a_read_error_not_an_empty_stylesheet() {
        let base = temporary_directory("missing-css");
        let directory = base.join("native/theme");
        fs::create_dir_all(&directory).unwrap();
        fs::write(
            directory.join("theme.json"),
            r#"{"themeId":"theme","mode":"native","origin":"custom","metadata":{"name":"主题"},"assets":[],"revision":1}"#,
        )
        .unwrap();
        fs::write(directory.join("settings.json"), "{}").unwrap();
        fs::write(directory.join("base.css"), "").unwrap();
        fs::write(directory.join("visual.css"), "").unwrap();

        let error = read_theme_document_file(&directory.join("theme.json")).unwrap_err();

        assert!(error.contains("custom.css"));
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn summaries_exclude_staging_and_backup_directories() {
        let root = temporary_directory("formal-list");
        write_legacy_theme(&root.join("native").join("formal"), "visible", "正式");
        write_legacy_theme(&root.join("native").join(".staging-hidden"), "visible", "暂存");
        write_legacy_theme(&root.join("native").join(".backup-hidden"), "hidden", "备份");
        for name in ["formal", ".staging-hidden", ".backup-hidden"] {
            let file = root.join("native").join(name).join("theme.json");
            let mut document: serde_json::Value = serde_json::from_str(&fs::read_to_string(&file).unwrap()).unwrap();
            document["revision"] = json!(1);
            document["metadata"]["author"] = json!("");
            document["metadata"]["version"] = json!("1.0.0");
            document["metadata"]["updatedAt"] = json!("now");
            fs::write(file, document.to_string()).unwrap();
        }
        let items = super::list_theme_summaries_at(&root).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["themeId"], "visible");
        let file = find_theme_file(&root, "visible").unwrap().unwrap();
        let renamed = root.join("native").join("renamed");
        fs::rename(file.parent().unwrap(), &renamed).unwrap();
        assert_eq!(find_theme_file(&root, "visible").unwrap().unwrap(), renamed.join("theme.json"));
    }

}
