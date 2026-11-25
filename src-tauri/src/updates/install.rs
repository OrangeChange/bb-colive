use super::model::PackageKind;
use serde::{Deserialize, Serialize};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAppearance {
    pub palette: String,
    pub scheme: String,
    pub custom_color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallPlan {
    pub parent_pid: u32,
    #[serde(default)]
    pub ui_language: Option<String>,
    #[serde(default)]
    pub appearance: Option<UpdateAppearance>,
    pub target: PathBuf,
    pub executable: String,
    pub package: PathBuf,
    pub kind: PackageKind,
    pub version: String,
    pub release_url: String,
}

fn protected(path: &Path, target: &Path) -> bool {
    let parts: Vec<_> = path
        .iter()
        .map(|v| v.to_string_lossy().to_lowercase())
        .collect();
    if parts
        .first()
        .is_some_and(|s| matches!(s.as_str(), "data" | "webview" | "logs"))
    {
        return true;
    }
    if parts.first().is_some_and(|s| s == "style") {
        if parts
            .get(1)
            .is_some_and(|s| matches!(s.as_str(), "cache" | "published-assets" | "edits"))
        {
            return true;
        }
        if let Some(theme) = parts.get(1) {
            let meta = if parts.len() > 3 {
                target
                    .join("style")
                    .join(theme)
                    .join(&parts[2])
                    .join("theme.json")
            } else {
                target.join("style").join(theme).join("theme.json")
            };
            if let Ok(bytes) = fs::read(meta) {
                if serde_json::from_slice::<serde_json::Value>(&bytes)
                    .ok()
                    .is_some_and(|v| v["origin"] == "custom")
                {
                    return true;
                }
            }
        }
        if parts.iter().any(|s| s == "edits") {
            return true;
        }
    }
    false
}
pub fn apply_portable(
    plan: &InstallPlan,
    mut progress: impl FnMut(usize, usize),
) -> Result<(), String> {
    let staging = plan.package.parent().ok_or(ui_text!("backend.install.apply_portable"))?;
    let unpacked = staging.join("unpacked");
    fs::create_dir_all(&unpacked).map_err(|e| e.to_string())?;
    let file = fs::File::open(&plan.package).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    archive.extract(&unpacked).map_err(|e| e.to_string())?;
    let root = if unpacked.join(&plan.executable).is_file() {
        unpacked.clone()
    } else {
        fs::read_dir(&unpacked)
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
            .map(|e| e.path())
            .find(|p| p.join(&plan.executable).is_file())
            .ok_or(ui_text!("backend.install.apply_portable2"))?
    };
    let mut files = Vec::new();
    fn collect(root: &Path, here: &Path, output: &mut Vec<PathBuf>) -> io::Result<()> {
        for entry in fs::read_dir(here)? {
            let entry = entry?;
            if entry.file_type()?.is_dir() {
                collect(root, &entry.path(), output)?;
            } else {
                output.push(entry.path().strip_prefix(root).unwrap().to_path_buf());
            }
        }
        Ok(())
    }
    collect(&root, &root, &mut files).map_err(|e| e.to_string())?;
    files.retain(|p| !protected(p, &plan.target));
    let backup = staging.join("previous");
    fs::create_dir_all(&backup).map_err(|e| e.to_string())?;
    let mut applied: Vec<(PathBuf, bool)> = Vec::new();
    let result = (|| -> io::Result<()> {
        for (index, path) in files.iter().enumerate() {
            let target = plan.target.join(path);
            let existed = target.is_file();
            if existed {
                let old = backup.join(path);
                fs::create_dir_all(old.parent().unwrap())?;
                fs::copy(&target, old)?;
            }
            fs::create_dir_all(target.parent().unwrap())?;
            applied.push((path.clone(), existed));
            fs::copy(root.join(path), target)?;
            progress(index + 1, files.len());
        }
        Ok(())
    })();
    if let Err(error) = result {
        let mut restore_error = None;
        for (path, existed) in applied.into_iter().rev() {
            let restored = if existed {
                fs::copy(backup.join(&path), plan.target.join(&path)).map(|_| ())
            } else {
                fs::remove_file(plan.target.join(&path))
            };
            if let Err(e) = restored {
                restore_error = Some(e);
            }
        }
        return Err(match restore_error {
            Some(e) => ui_format!("backend.install.collect",
                backup.display(), error = error, e = e),
            None => ui_format!("backend.install.collect2", error = error),
        });
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn portable_preserves_user_data_and_theme_adjustments() {
        let target = Path::new("C:/example");
        for p in [
            "data/archive.sqlite",
            "style/native/edits/adjustments.json",
            "style/edits/assets/image.png",
            "WebView/cache",
            "logs/app.log",
        ] {
            assert!(protected(Path::new(p), target), "{p}");
        }
        assert!(!protected(Path::new("bb-colive.exe"), target));
        assert!(!protected(Path::new("style/native/theme.json"), target));
    }
    #[test]
    fn portable_replaces_program_and_preserves_real_files() {
        use std::io::Write;
        let root =
            std::env::temp_dir().join(format!("bb-colive-update-test-{}", uuid::Uuid::new_v4()));
        let target = root.join("Program With Spaces");
        fs::create_dir_all(target.join("data")).unwrap();
        fs::create_dir_all(target.join("style/native/theme/edits")).unwrap();
        fs::write(target.join("data/archive.sqlite"), b"archive").unwrap();
        fs::write(target.join("bb-colive.exe"), b"old").unwrap();
        fs::write(
            target.join("style/native/theme/edits/adjustments.json"),
            b"edits",
        )
        .unwrap();
        let package = root.join("update.zip");
        let mut zip = zip::ZipWriter::new(fs::File::create(&package).unwrap());
        for (name, bytes) in [
            ("bb-colive.exe", b"new".as_slice()),
            ("data/archive.sqlite", b"overwrite"),
            ("style/native/theme/edits/adjustments.json", b"overwrite"),
        ] {
            zip.start_file(name, zip::write::SimpleFileOptions::default())
                .unwrap();
            zip.write_all(bytes).unwrap();
        }
        zip.finish().unwrap();
        let plan = InstallPlan {
            ui_language: None,
            parent_pid: 0,
            appearance: None,
            target: target.clone(),
            executable: "bb-colive.exe".into(),
            package,
            kind: PackageKind::Portable,
            version: "1.1.0".into(),
            release_url: String::new(),
        };
        apply_portable(&plan, |_, _| {}).unwrap();
        assert_eq!(fs::read(target.join("bb-colive.exe")).unwrap(), b"new");
        assert_eq!(
            fs::read(target.join("data/archive.sqlite")).unwrap(),
            b"archive"
        );
        assert_eq!(
            fs::read(target.join("style/native/theme/edits/adjustments.json")).unwrap(),
            b"edits"
        );
        assert_eq!(
            fs::read(root.join("previous/bb-colive.exe")).unwrap(),
            b"old"
        );
    }

    #[cfg(windows)]
    #[test]
    fn portable_restores_replaced_program_when_another_file_is_locked() {
        use std::{io::Write, os::windows::fs::OpenOptionsExt};
        let root =
            std::env::temp_dir().join(format!("bb-colive-rollback-{}", uuid::Uuid::new_v4()));
        let target = root.join("program");
        fs::create_dir_all(&target).unwrap();
        fs::write(target.join("bb-colive.exe"), b"old-program").unwrap();
        fs::write(target.join("zz-locked.dll"), b"old-library").unwrap();
        let _locked = fs::OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(target.join("zz-locked.dll"))
            .unwrap();
        let package = root.join("update.zip");
        let mut zip = zip::ZipWriter::new(fs::File::create(&package).unwrap());
        for name in ["bb-colive.exe", "zz-locked.dll"] {
            zip.start_file(name, zip::write::SimpleFileOptions::default())
                .unwrap();
            zip.write_all(b"updated").unwrap();
        }
        zip.finish().unwrap();
        let plan = InstallPlan {
            ui_language: None,
            parent_pid: 0,
            appearance: None,
            target: target.clone(),
            executable: "bb-colive.exe".into(),
            package,
            kind: PackageKind::Portable,
            version: "1.1.0".into(),
            release_url: String::new(),
        };
        assert!(apply_portable(&plan, |_, _| {})
            .unwrap_err()
            .contains("已恢复"));
        assert_eq!(
            fs::read(target.join("bb-colive.exe")).unwrap(),
            b"old-program"
        );
    }
}
