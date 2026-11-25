use std::sync::atomic::{AtomicUsize, Ordering};

static LANGUAGE: AtomicUsize = AtomicUsize::new(0);
const LANGUAGES: [&str; 4] = ["zh-CN", "zh-Hant", "en", "ja"];

pub fn language_index() -> usize { LANGUAGE.load(Ordering::Relaxed) }
pub fn language() -> &'static str { LANGUAGES[language_index()] }
pub fn set_language(value: &str) {
    LANGUAGE.store(LANGUAGES.iter().position(|language| *language == value).unwrap_or(0), Ordering::Relaxed);
}

pub fn initialize(root: &std::path::Path) {
    if let Ok(value) = std::fs::read_to_string(root.join("ui-language.json")) {
        if let Ok(language) = serde_json::from_str::<String>(&value) { set_language(&language); }
    }
}

include!(concat!(env!("OUT_DIR"), "/ui_messages.rs"));
