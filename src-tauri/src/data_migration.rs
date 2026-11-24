use std::{fs, io, path::{Path, PathBuf}};

pub fn select_root(program: &Path, roaming: &Path, portable: bool) -> PathBuf {
    if portable { program.join("data") } else { roaming.join("BB CoLive") }
}

/// 复制到独立暂存目录，只有全部复制成功后才启用；原目录始终保留。
pub fn migrate(root: &Path, legacy: &Path, legacy_webview: &Path) -> io::Result<()> {
    if root.exists() { return Ok(()); }
    let staging = root.with_extension(format!("migration-{}", std::process::id()));
    fs::create_dir_all(&staging)?;
    if legacy.is_dir() {
        ensure_database_closed(&legacy.join("archive.sqlite"))?;
        copy_tree(legacy, &staging)?;
    }
    if legacy_webview.is_dir() { copy_tree(legacy_webview, &staging.join("WebView"))?; }
    fs::write(staging.join(".brand-migration-complete"), b"1.0.0\n")?;
    fs::rename(staging, root)
}

fn ensure_database_closed(path: &Path) -> io::Result<()> {
    if !path.exists() { return Ok(()); }
    let mut options = fs::OpenOptions::new();
    options.read(true);
    #[cfg(windows)] {
        use std::os::windows::fs::OpenOptionsExt;
        options.share_mode(0);
    }
    options.open(path).map(|_| ())
}

fn copy_tree(source: &Path, destination: &Path) -> io::Result<()> {
    fs::create_dir_all(destination)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let to = destination.join(entry.file_name());
        if entry.file_type()?.is_dir() { copy_tree(&entry.path(), &to)?; }
        else { fs::copy(entry.path(), to)?; }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn workspace(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("bb-colive-migration-{}-{}-{}", std::process::id(), name, std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        fs::create_dir_all(&dir).unwrap(); dir
    }
    #[test]
    fn roots_are_separate() {
        assert_eq!(select_root(Path::new("program"), Path::new("roaming"), true), PathBuf::from("program/data"));
        assert_eq!(select_root(Path::new("program"), Path::new("roaming"), false), PathBuf::from("roaming/BB CoLive"));
    }
    #[test]
    fn migration_preserves_originals_and_existing_target() {
        let dir = workspace("copy"); let old = dir.join("old"); let web = dir.join("old-web"); let root = dir.join("BB CoLive");
        fs::create_dir_all(old.join("logs")).unwrap(); fs::create_dir_all(web.join("EBWebView/Default")).unwrap();
        fs::write(old.join("cookies.local.json"), b"original").unwrap();
        fs::write(old.join("logs/event.ndjson"), b"event").unwrap();
        fs::write(web.join("EBWebView/Default/Preferences"), b"preferences").unwrap();
        migrate(&root, &old, &web).unwrap();
        assert_eq!(fs::read(root.join("cookies.local.json")).unwrap(), b"original");
        assert_eq!(fs::read(root.join("WebView/EBWebView/Default/Preferences")).unwrap(), b"preferences");
        assert_eq!(fs::read(old.join("cookies.local.json")).unwrap(), b"original");
        fs::write(root.join("cookies.local.json"), b"changed").unwrap();
        migrate(&root, &old, &web).unwrap();
        assert_eq!(fs::read(root.join("cookies.local.json")).unwrap(), b"changed");
    }
    #[test]
    fn interrupted_copy_does_not_activate_partial_target() {
        let dir = workspace("failure"); let old = dir.join("old"); let root = dir.join("BB CoLive");
        fs::create_dir_all(&old).unwrap(); fs::write(old.join("cookies.local.json"), b"original").unwrap();
        let stage = root.with_extension(format!("migration-{}", std::process::id())); fs::create_dir_all(stage.join("cookies.local.json")).unwrap();
        assert!(migrate(&root, &old, &dir.join("no-web")).is_err());
        assert!(!root.exists()); assert_eq!(fs::read(old.join("cookies.local.json")).unwrap(), b"original");
    }
    #[test]
    fn fresh_install_creates_root() {
        let dir = workspace("fresh"); let root = dir.join("BB CoLive");
        migrate(&root, &dir.join("absent"), &dir.join("no-web")).unwrap();
        assert!(root.join(".brand-migration-complete").is_file());
    }
}
