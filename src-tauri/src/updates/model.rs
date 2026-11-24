use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum UpdateRoute {
    #[default]
    Auto,
    Domestic,
    Foreign,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum UpdateSource {
    #[default]
    Domestic,
    Foreign,
}

impl UpdateSource {
    pub fn other(self) -> Self {
        match self {
            Self::Domestic => Self::Foreign,
            Self::Foreign => Self::Domestic,
        }
    }
    pub fn release_page(self, tag: Option<&str>) -> String {
        let root = match self {
            Self::Domestic => "https://gitee.com/orange-chan/bb-colive/releases",
            Self::Foreign => "https://github.com/OrangeChange/bb-colive/releases",
        };
        match tag {
            Some(tag) => format!("{root}/tag/{tag}"),
            None => root.to_string(),
        }
    }
    pub fn releases_api(self) -> &'static str {
        match self {
            Self::Domestic => {
                "https://gitee.com/api/v5/repos/orange-chan/bb-colive/releases?per_page=10"
            }
            Self::Foreign => {
                "https://api.github.com/repos/OrangeChange/bb-colive/releases?per_page=10"
            }
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PackageKind {
    Installer,
    Portable,
}

impl PackageKind {
    pub fn target(self) -> String {
        format!(
            "windows-{}-{}",
            std::env::consts::ARCH,
            match self {
                Self::Installer => "installer",
                Self::Portable => "portable",
            }
        )
    }
    pub fn file_name(self) -> &'static str {
        match self {
            Self::Installer => "update-setup.exe",
            Self::Portable => "update-portable.zip",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePackage {
    pub source: UpdateSource,
    pub url: String,
    pub signature: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateOffer {
    pub version: String,
    pub tag: String,
    pub notes: String,
    pub kind: PackageKind,
    pub source: UpdateSource,
    pub release_url: String,
    pub packages: Vec<UpdatePackage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegionCache {
    pub country_code: String,
    pub checked_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckResult {
    pub source: UpdateSource,
    pub region: Option<RegionCache>,
    pub offer: Option<UpdateOffer>,
    pub manual_version: Option<String>,
    pub release_url: String,
}

pub fn preferred_source(route: UpdateRoute, country_code: Option<&str>) -> UpdateSource {
    match route {
        UpdateRoute::Domestic => UpdateSource::Domestic,
        UpdateRoute::Foreign => UpdateSource::Foreign,
        UpdateRoute::Auto if country_code.is_none_or(|value| value == "CN") => {
            UpdateSource::Domestic
        }
        UpdateRoute::Auto => UpdateSource::Foreign,
    }
}

pub fn newer_stable(remote: &str, current: &str) -> bool {
    match (
        semver::Version::parse(remote.trim_start_matches('v')),
        semver::Version::parse(current.trim_start_matches('v')),
    ) {
        (Ok(remote), Ok(current)) => remote.pre.is_empty() && remote > current,
        _ => false,
    }
}

pub fn package_from_manifest(
    value: &Value,
    kind: PackageKind,
    source: UpdateSource,
    version: &str,
) -> Result<UpdatePackage, String> {
    let actual = value["version"].as_str().ok_or("更新清单缺少版本号")?;
    if actual.trim_start_matches('v') != version.trim_start_matches('v') {
        return Err("更新清单与发布版本不一致".into());
    }
    let platform = &value["platforms"][kind.target()];
    let url = platform["url"]
        .as_str()
        .filter(|value| value.starts_with("https://"))
        .ok_or("此版本尚未提供对应的更新包")?;
    let signature = platform["signature"]
        .as_str()
        .filter(|value| !value.trim().is_empty())
        .ok_or("更新包缺少签名")?;
    let size = platform["size"]
        .as_u64()
        .filter(|value| *value > 0)
        .ok_or("更新包缺少文件大小")?;
    Ok(UpdatePackage {
        source,
        url: url.into(),
        signature: signature.into(),
        size,
    })
}
