fn main() {
    build_ui_messages();
    #[cfg(target_os = "windows")]
    build_glass();
    tauri_build::build();
    println!("cargo:rerun-if-changed=style-distribution");
    let out = std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap());
    let target = out.ancestors().nth(3).unwrap().join("style");
    deploy_themes(std::path::Path::new("style-distribution"), &target).expect("无法准备程序目录中的主题");
}

fn build_ui_messages() {
    let source = "../src/i18n/zh-CN.json";
    println!("cargo:rerun-if-changed={source}");
    let messages: std::collections::BTreeMap<String, String> =
        serde_json::from_slice(&std::fs::read(source).expect("无法读取界面文案"))
            .expect("界面文案格式无效");
    let mut text = String::from("macro_rules! ui_text {\n");
    let mut formatted = String::from("macro_rules! ui_format {\n");
    for (key, value) in messages.iter().filter(|(key, _)| key.starts_with("backend.")) {
        let key = serde_json::to_string(key).unwrap();
        let value = serde_json::to_string(value).unwrap();
        text.push_str(&format!("    ({key}) => {{ {value} }};\n"));
        formatted.push_str(&format!("    ({key}) => {{ format!({value}) }};\n"));
        formatted.push_str(&format!("    ({key}, $($args:tt)*) => {{ format!({value}, $($args)*) }};\n"));
    }
    text.push_str("}\n");
    formatted.push_str("}\n");
    let out = std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap());
    std::fs::write(out.join("ui_messages.rs"), text + &formatted).expect("无法准备界面文案");
}

fn deploy_themes(source: &std::path::Path, target: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(target)?;
    for entry in std::fs::read_dir(source)? {
        let entry = entry?;
        let destination = target.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            let manifest = destination.join("theme.json");
            if manifest.exists() {
                let existing: serde_json::Value = serde_json::from_slice(&std::fs::read(&manifest)?)?;
                if existing["origin"] != "builtin" {
                    return Err(std::io::Error::other(format!("内置主题目录已被自定义主题占用：{}", destination.display())));
                }
            }
            deploy_themes(&entry.path(), &destination)?;
        } else {
            let bytes = std::fs::read(entry.path())?;
            if std::fs::read(&destination).ok().as_deref() != Some(&bytes) {
                std::fs::write(destination, bytes)?;
            }
        }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn build_glass() {
    let mut shaders = String::new();
    for (file, name) in [("glass.hlsl", "glassShader"), ("activity.hlsl", "activityShaderSource")] {
        let path = format!("native/{file}");
        println!("cargo:rerun-if-changed={path}");
        let source = std::fs::read_to_string(path).expect("无法读取窗口着色器");
        shaders.push_str(&format!("static const char {name}[] = R\"SHADER({source})SHADER\";\n"));
    }
    let out = std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap());
    std::fs::write(out.join("glass_shaders.h"), shaders).expect("无法准备窗口着色器");
    println!("cargo:rerun-if-changed=native/liquid_glass.cpp");
    cc::Build::new().cpp(true).static_crt(true).std("c++17").flag("/EHsc").flag("/utf-8")
        .include(out).file("native/liquid_glass.cpp").compile("danmu_liquid_glass");
    for library in ["d3d11", "dxgi", "dcomp", "d3dcompiler", "comctl32"] {
        println!("cargo:rustc-link-lib={library}");
    }
}
