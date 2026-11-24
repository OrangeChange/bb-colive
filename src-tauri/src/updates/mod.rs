mod model;

#[cfg(test)]
mod tests {
    use super::model::*;

    #[test]
    fn geography_and_manual_route_choose_expected_source() {
        assert_eq!(
            preferred_source(UpdateRoute::Auto, Some("CN")),
            UpdateSource::Domestic
        );
        assert_eq!(
            preferred_source(UpdateRoute::Auto, Some("US")),
            UpdateSource::Foreign
        );
        assert_eq!(
            preferred_source(UpdateRoute::Auto, Some("HK")),
            UpdateSource::Foreign
        );
        assert_eq!(
            preferred_source(UpdateRoute::Auto, None),
            UpdateSource::Domestic
        );
        assert_eq!(
            preferred_source(UpdateRoute::Foreign, Some("CN")),
            UpdateSource::Foreign
        );
        assert_eq!(
            preferred_source(UpdateRoute::Domestic, Some("US")),
            UpdateSource::Domestic
        );
    }

    #[test]
    fn version_order_is_semantic_and_excludes_preview_releases() {
        assert!(newer_stable("v1.10.0", "1.9.0"));
        assert!(!newer_stable("1.1.0-beta.1", "1.0.0"));
        assert!(!newer_stable("1.0.0", "1.0.0"));
        assert!(!newer_stable("0.9.0", "1.0.0"));
        assert!(!newer_stable("latest", "1.0.0"));
    }

    #[test]
    fn manifest_keeps_installer_and_portable_channels_separate() {
        let manifest = serde_json::json!({"version":"1.1.0", "platforms":{
            "windows-x86_64-installer":{"url":"https://example.com/setup.exe","signature":"signed-installer","size":100},
            "windows-x86_64-portable":{"url":"https://example.com/portable.zip","signature":"signed-portable","size":200}
        }});
        let installer = package_from_manifest(
            &manifest,
            PackageKind::Installer,
            UpdateSource::Domestic,
            "1.1.0",
        )
        .unwrap();
        let portable = package_from_manifest(
            &manifest,
            PackageKind::Portable,
            UpdateSource::Domestic,
            "1.1.0",
        )
        .unwrap();
        assert_eq!(installer.signature, "signed-installer");
        assert_eq!(portable.signature, "signed-portable");
        assert!(package_from_manifest(
            &manifest,
            PackageKind::Installer,
            UpdateSource::Domestic,
            "1.2.0"
        )
        .is_err());
        assert!(package_from_manifest(
            &serde_json::json!({"version":"1.1.0","platforms":{}}),
            PackageKind::Portable,
            UpdateSource::Domestic,
            "1.1.0"
        )
        .is_err());
    }

    #[test]
    fn manual_release_links_use_the_selected_route() {
        assert_eq!(
            UpdateSource::Domestic.release_page(None),
            "https://gitee.com/orange-chan/bb-colive/releases"
        );
        assert_eq!(
            UpdateSource::Foreign.release_page(Some("v1.1.0")),
            "https://github.com/OrangeChange/bb-colive/releases/tag/v1.1.0"
        );
    }
}
pub mod commands;
pub mod helper;
mod install;
mod transport;
