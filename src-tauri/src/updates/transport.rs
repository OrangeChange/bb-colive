use super::model::*;
use base64::{engine::general_purpose::STANDARD, Engine};
use minisign_verify::{PublicKey, Signature};
use serde_json::Value;
use std::{
    io::Write,
    path::Path,
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("BB-CoLive-Updater")
        .connect_timeout(Duration::from_secs(12))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())
}
async fn json(client: &reqwest::Client, url: &str) -> Result<Value, String> {
    client
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())
}
async fn source_offer(
    client: &reqwest::Client,
    source: UpdateSource,
    current: &str,
    kind: PackageKind,
) -> Result<(Option<UpdateOffer>, Option<String>), String> {
    let releases = json(client, source.releases_api()).await?;
    let mut releases: Vec<&Value> = releases
        .as_array()
        .ok_or(ui_text!("backend.transport.source_offer"))?
        .iter()
        .filter(|r| {
            !r["draft"].as_bool().unwrap_or(false)
                && !r["prerelease"].as_bool().unwrap_or(false)
                && newer_stable(r["tag_name"].as_str().unwrap_or(""), current)
        })
        .collect();
    releases.sort_by_key(|r| {
        std::cmp::Reverse(
            semver::Version::parse(r["tag_name"].as_str().unwrap_or("").trim_start_matches('v'))
                .ok(),
        )
    });
    let manual = releases
        .first()
        .and_then(|r| r["tag_name"].as_str())
        .map(str::to_owned);
    for release in releases {
        let tag = release["tag_name"].as_str().unwrap();
        let assets = release["assets"].clone();
        let Some(asset) = assets.as_array().and_then(|items| {
            items
                .iter()
                .find(|a| a["name"].as_str() == Some("update.json"))
        }) else {
            continue;
        };
        let Some(url) = asset["browser_download_url"]
            .as_str()
            .or_else(|| asset["download_url"].as_str())
        else {
            continue;
        };
        let manifest = json(client, url).await?;
        let package = package_from_manifest(&manifest, kind, source, tag)?;
        return Ok((
            Some(UpdateOffer {
                version: tag.trim_start_matches('v').into(),
                tag: tag.into(),
                notes: release["body"].as_str().unwrap_or("").into(),
                kind,
                source,
                release_url: source.release_page(Some(tag)),
                packages: vec![package],
            }),
            manual,
        ));
    }
    Ok((None, manual))
}
pub async fn check(
    route: UpdateRoute,
    cache: Option<RegionCache>,
    current: &str,
    kind: PackageKind,
) -> Result<CheckResult, String> {
    let client = client()?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let region = if route != UpdateRoute::Auto {
        cache
    } else if cache
        .as_ref()
        .is_some_and(|c| now.saturating_sub(c.checked_at) < 86400)
    {
        cache
    } else {
        json(&client, "https://ipwho.is/?fields=success,country_code")
            .await
            .ok()
            .filter(|v| v["success"].as_bool() == Some(true))
            .and_then(|v| {
                v["country_code"].as_str().map(|s| RegionCache {
                    country_code: s.into(),
                    checked_at: now,
                })
            })
    };
    let source = preferred_source(route, region.as_ref().map(|r| r.country_code.as_str()));
    let first = source_offer(&client, source, current, kind).await;
    let second = if route == UpdateRoute::Auto {
        Some((
            source.other(),
            source_offer(&client, source.other(), current, kind).await,
        ))
    } else {
        None
    };
    let mut successes = Vec::new();
    let mut errors = Vec::new();
    for (result_source, result) in std::iter::once((source, first)).chain(second) {
        match result {
            Ok(v) => successes.push((result_source, v)),
            Err(e) => errors.push(e),
        }
    }
    if successes.is_empty() {
        return Err(ui_format!("backend.transport.check",
            errors.join("；")));
    }
    let mut offers: Vec<UpdateOffer> = successes
        .iter()
        .filter_map(|(_, (o, _))| o.clone())
        .collect();
    offers.sort_by_key(|o| std::cmp::Reverse(semver::Version::parse(&o.version).ok()));
    let mut offer = offers.first().cloned();
    if let Some(chosen) = offer.as_mut() {
        for alternate in offers
            .iter()
            .skip(1)
            .filter(|o| o.version == chosen.version)
        {
            chosen.packages.extend(alternate.packages.clone());
        }
    }
    let resolved = offer.as_ref().map_or(successes[0].0, |o| o.source);
    let release_url = offer
        .as_ref()
        .map_or_else(|| resolved.release_page(None), |o| o.release_url.clone());
    Ok(CheckResult {
        source: resolved,
        region,
        offer,
        manual_version: successes
            .into_iter()
            .filter_map(|(_, (_, v))| v)
            .max_by_key(|v| semver::Version::parse(v.trim_start_matches('v')).ok()),
        release_url,
    })
}
fn decode(value: &str) -> Result<String, String> {
    String::from_utf8(STANDARD.decode(value.trim()).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}
pub fn verify_bytes(bytes: &[u8], public: &str, signature: &str) -> Result<(), String> {
    PublicKey::decode(&decode(public)?)
        .map_err(|e| e.to_string())?
        .verify(
            bytes,
            &Signature::decode(&decode(signature)?).map_err(|e| e.to_string())?,
            true,
        )
        .map_err(|e| e.to_string())
}
pub async fn download(
    package: &UpdatePackage,
    destination: &Path,
    public: &str,
    cancel: &AtomicBool,
    signal: &tokio::sync::Notify,
    mut progress: impl FnMut(u64, u64),
) -> Result<(), String> {
    let key = PublicKey::decode(&decode(public)?).map_err(|e| e.to_string())?;
    let signature = Signature::decode(&decode(&package.signature)?).map_err(|e| e.to_string())?;
    let mut verifier = key.verify_stream(&signature).map_err(|e| e.to_string())?;
    let client = reqwest::Client::builder()
        .user_agent("BB-CoLive-Updater")
        .connect_timeout(Duration::from_secs(15))
        .read_timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let response = tokio::select! {
        _ = cancelled(cancel,signal) => return Err(ui_text!("backend.transport.download").into()),
        response = client.get(&package.url).send() => response,
    };
    let mut response = response
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;
    let mut file = std::fs::File::create(destination).map_err(|e| e.to_string())?;
    let mut received = 0;
    loop {
        let chunk = tokio::select! {
            _ = cancelled(cancel,signal) => return Err(ui_text!("backend.transport.download").into()),
            chunk = response.chunk() => chunk.map_err(|e|e.to_string())?,
        };
        let Some(chunk) = chunk else { break };
        if cancel.load(Ordering::Relaxed) {
            return Err(ui_text!("backend.transport.download").into());
        }
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        verifier.update(&chunk);
        received += chunk.len() as u64;
        progress(received, package.size);
    }
    if cancel.load(Ordering::Relaxed) {
        return Err(ui_text!("backend.transport.download").into());
    }
    if received != package.size {
        return Err(ui_text!("backend.transport.download2").into());
    }
    verifier
        .finalize()
        .map_err(|_| ui_text!("backend.transport.download3").to_string())?;
    file.sync_all().map_err(|e| e.to_string())
}
async fn cancelled(cancel: &AtomicBool, signal: &tokio::sync::Notify) {
    let notified = signal.notified();
    tokio::pin!(notified);
    notified.as_mut().enable();
    if !cancel.load(Ordering::Relaxed) {
        notified.await;
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn signed_fixture_accepts_original_and_rejects_modified_content() {
        let public = include_str!("../../update-public.key");
        let signature = include_str!("../../../tests/fixtures/software-update/payload.txt.sig");
        let payload = include_bytes!("../../../tests/fixtures/software-update/payload.txt");
        assert!(verify_bytes(payload, public, signature).is_ok());
        assert!(verify_bytes(b"changed", public, signature).is_err());
    }
    #[test]
    fn download_checks_signature_size_and_cancellation() {
        use std::io::{Read, Write};
        use std::net::TcpListener;
        let payload = include_bytes!("../../../tests/fixtures/software-update/payload.txt");
        for mode in ["valid", "size"] {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            let server = std::thread::spawn(move || {
                let (mut stream, _) = listener.accept().unwrap();
                let mut request = [0; 4096];
                let _ = stream.read(&mut request);
                let header = format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    payload.len()
                );
                let _ = stream.write_all(header.as_bytes());
                let _ = stream.write_all(payload);
            });
            let package = UpdatePackage {
                source: UpdateSource::Domestic,
                url: format!("http://{address}/update"),
                signature: if mode == "signature" {
                    "invalid".into()
                } else {
                    include_str!("../../../tests/fixtures/software-update/payload.txt.sig")
                        .trim()
                        .into()
                },
                size: payload.len() as u64 + if mode == "size" { 1 } else { 0 },
            };
            let path =
                std::env::temp_dir().join(format!("bb-colive-download-{}", uuid::Uuid::new_v4()));
            let runtime = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .unwrap();
            let result = runtime.block_on(download(
                &package,
                &path,
                include_str!("../../update-public.key"),
                &AtomicBool::new(false),
                &tokio::sync::Notify::new(),
                |_, _| {},
            ));
            assert_eq!(result.is_ok(), mode == "valid", "{mode}: {result:?}");
            server.join().unwrap();
        }
    }
    #[test]
    fn cancellation_interrupts_a_stalled_download() {
        use std::{
            io::{Read, Write},
            net::TcpListener,
            sync::{mpsc, Arc},
            time::Instant,
        };
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let (started_tx, started_rx) = mpsc::channel();
        let (done_tx, done_rx) = mpsc::channel();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0; 4096];
            let _ = stream.read(&mut request);
            stream
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 40\r\n\r\n")
                .unwrap();
            started_tx.send(()).unwrap();
            let _ = done_rx.recv_timeout(Duration::from_secs(5));
        });
        let cancel = Arc::new(AtomicBool::new(false));
        let signal = Arc::new(tokio::sync::Notify::new());
        let cancelled = cancel.clone();
        let notified = signal.clone();
        let trigger = std::thread::spawn(move || {
            started_rx.recv().unwrap();
            cancelled.store(true, Ordering::Relaxed);
            notified.notify_waiters();
        });
        let package = UpdatePackage {
            source: UpdateSource::Domestic,
            url: format!("http://{address}/update"),
            signature: include_str!("../../../tests/fixtures/software-update/payload.txt.sig")
                .trim()
                .into(),
            size: 40,
        };
        let path = std::env::temp_dir().join(format!("bb-colive-cancel-{}", uuid::Uuid::new_v4()));
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let started = Instant::now();
        let result = runtime.block_on(download(
            &package,
            &path,
            include_str!("../../update-public.key"),
            &cancel,
            &signal,
            |_, _| {},
        ));
        let elapsed = started.elapsed();
        done_tx.send(()).unwrap();
        trigger.join().unwrap();
        server.join().unwrap();
        assert_eq!(result.unwrap_err(), "下载已取消");
        assert!(elapsed < Duration::from_secs(2), "取消不应等待读取超时");
    }
}
