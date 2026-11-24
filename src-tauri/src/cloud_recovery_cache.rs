use crate::cloud_recovery_transport::RecoveryObject;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
static FILE_SEQUENCE: AtomicU64 = AtomicU64::new(0);
pub(crate) fn hex_hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
pub(crate) fn valid_hash(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
#[derive(Clone)]
pub(crate) struct RecoveryCache {
    root: PathBuf,
    maximum: u64,
    budget: Arc<Mutex<Option<u64>>>,
    fault: Arc<AtomicU64>,
    #[cfg(test)]
    read_calls: Arc<AtomicU64>,
}

// Native request-local immutable snapshot. Retain one fully verified chunk only;
// evict before loading a different chunk, and never reuse it across requests.
struct RequestChunk {
    handle: String,
    index: u32,
    sha256: String,
    size: u64,
    bytes: Vec<u8>,
}
pub(crate) struct VerifiedRequestReader<'a> {
    cache: &'a RecoveryCache,
    last: Option<RequestChunk>,
}
impl VerifiedRequestReader<'_> {
    pub(crate) async fn read_slice_object(
        &mut self,
        handle: &str,
        offset: u64,
        max: usize,
        object: &RecoveryObject,
    ) -> Result<Vec<u8>, String> {
        if max == 0 || max > 65536 {
            return Err("invalid_slice".into());
        }
        object.validate()?;
        let size = object
            .byte_size
            .parse::<u64>()
            .map_err(|_| "invalid_object")?;
        if offset > size {
            return Err("invalid_slice".into());
        }
        let end = offset.saturating_add(max as u64).min(size);
        let mut out = Vec::with_capacity((end - offset) as usize);
        let mut start = 0;
        for chunk in &object.chunks {
            let through = start + chunk.byte_size;
            if through > offset && start < end {
                let hit = self.last.as_ref().is_some_and(|saved| {
                    saved.handle == handle
                        && saved.index == chunk.index
                        && saved.sha256 == chunk.sha256
                        && saved.size == chunk.byte_size
                });
                if !hit {
                    // Do not retain the previous2MiB buffer while the next one is being read.
                    self.last = None;
                    let bytes = self
                        .cache
                        .read_chunk(handle, chunk.index, &chunk.sha256, chunk.byte_size)
                        .await?
                        .ok_or("recovery_cache_integrity")?;
                    self.last = Some(RequestChunk {
                        handle: handle.into(),
                        index: chunk.index,
                        sha256: chunk.sha256.clone(),
                        size: chunk.byte_size,
                        bytes,
                    });
                }
                let bytes = &self.last.as_ref().ok_or("recovery_cache_integrity")?.bytes;
                out.extend_from_slice(
                    &bytes[offset.saturating_sub(start) as usize
                        ..(end.min(through) - start) as usize],
                );
            }
            start = through;
        }
        if out.len() as u64 != end - offset {
            return Err("recovery_cache_integrity".into());
        }
        Ok(out)
    }
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct ChunkMarker {
    file_id: String,
    sha256: String,
    byte_size: u64,
}
fn bounded_file(path: &Path, max: u64) -> Result<Vec<u8>, String> {
    let metadata = std::fs::symlink_metadata(path).map_err(|_| "recovery_cache_missing")?;
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > max {
        return Err("recovery_cache_integrity".into());
    }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    File::open(path)
        .map_err(|_| "recovery_cache_missing")?
        .take(max + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "recovery_cache_io")?;
    if bytes.len() as u64 > max {
        return Err("recovery_cache_integrity".into());
    }
    Ok(bytes)
}
fn disk_usage(path: &Path) -> Result<u64, String> {
    if !path.exists() {
        return Ok(0);
    }
    let metadata = std::fs::symlink_metadata(path).map_err(|_| "recovery_cache_io")?;
    if metadata.file_type().is_symlink() {
        return Err("recovery_cache_integrity".into());
    }
    if metadata.is_file() {
        return Ok(metadata.len());
    }
    let mut total = 0u64;
    for entry in std::fs::read_dir(path).map_err(|_| "recovery_cache_io")? {
        total = total
            .checked_add(disk_usage(&entry.map_err(|_| "recovery_cache_io")?.path())?)
            .ok_or("recovery_cache_capacity")?;
    }
    Ok(total)
}
struct PublishFailure {
    uncertain: bool,
}
struct Reservation<'a> {
    budget: MutexGuard<'a, Option<u64>>,
    amount: u64,
    committed: bool,
    uncertain: bool,
}
impl Reservation<'_> {
    fn commit(mut self, release: u64) {
        if let Some(used) = self.budget.as_mut() {
            *used = used.saturating_sub(release);
        }
        self.committed = true;
    }
    fn uncertain(&mut self) {
        self.uncertain = true;
    }
}
impl Drop for Reservation<'_> {
    fn drop(&mut self) {
        if !self.committed {
            if self.uncertain {
                *self.budget = None
            } else if let Some(used) = self.budget.as_mut() {
                *used = used.saturating_sub(self.amount)
            }
        }
    }
}
fn fail_at(fault: &AtomicU64, stage: u64) -> bool {
    fault
        .compare_exchange(stage, 0, Ordering::SeqCst, Ordering::SeqCst)
        .is_ok()
}
fn publish(path: &Path, bytes: &[u8], fault: &AtomicU64) -> Result<(), PublishFailure> {
    let sequence = FILE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| PublishFailure { uncertain: false })?
        .as_nanos();
    let scratch = path.with_extension(format!("pending-{}-{nonce}-{sequence}", std::process::id()));
    if fail_at(fault, 1) {
        return Err(PublishFailure { uncertain: false });
    }
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&scratch)
        .map_err(|_| PublishFailure { uncertain: false })?;
    let result = (|| {
        if fail_at(fault, 2) {
            return Err(());
        }
        file.write_all(bytes).map_err(|_| ())?;
        if fail_at(fault, 3) {
            return Err(());
        }
        file.sync_all().map_err(|_| ())?;
        drop(file);
        if fail_at(fault, 4) {
            return Err(());
        }
        std::fs::rename(&scratch, path).map_err(|_| ())?;
        Ok(())
    })();
    if result.is_err() {
        let uncertain = std::fs::remove_file(&scratch).is_err() && scratch.exists();
        return Err(PublishFailure { uncertain });
    }
    // Windows may not support flushing a directory handle. Every file is synced
    // before rename; restart rehashes actual bytes and never trusts markers alone.
    #[cfg(not(windows))]
    File::open(path.parent().ok_or("recovery_cache_io")?)
        .and_then(|f| f.sync_all())
        .map_err(|_| PublishFailure { uncertain: true })?;
    Ok(())
}
impl RecoveryCache {
    pub(crate) fn new(root: PathBuf, maximum: u64) -> Self {
        Self {
            root,
            maximum,
            budget: Arc::new(Mutex::new(None)),
            fault: Arc::new(AtomicU64::new(0)),
            #[cfg(test)]
            read_calls: Arc::new(AtomicU64::new(0)),
        }
    }
    #[cfg(test)]
    pub(crate) fn take_read_calls(&self) -> u64 {
        self.read_calls.swap(0, Ordering::Relaxed)
    }
    #[cfg(test)]
    fn fail_next_publish_at(&self, stage: u64) {
        self.fault.store(stage, Ordering::SeqCst);
    }
    #[cfg(test)]
    fn budget_value(&self) -> Option<u64> {
        *self.budget.lock().unwrap()
    }
    pub(crate) fn request_reader(&self) -> VerifiedRequestReader<'_> {
        VerifiedRequestReader {
            cache: self,
            last: None,
        }
    }
    fn directory(&self, handle: &str) -> Result<PathBuf, String> {
        if !valid_hash(handle) {
            return Err("invalid_cache_handle".into());
        }
        Ok(self.root.join(handle))
    }
    pub(crate) fn chunk_marker(&self, handle: &str, index: u32) -> Result<PathBuf, String> {
        if index >= 128 {
            return Err("invalid_chunk".into());
        }
        Ok(self.directory(handle)?.join(format!("chunk-{index}.json")))
    }
    fn read_chunk_sync(
        &self,
        handle: &str,
        index: u32,
        hash: &str,
        size: u64,
    ) -> Result<Option<Vec<u8>>, String> {
        #[cfg(test)]
        self.read_calls.fetch_add(1, Ordering::Relaxed);
        if !valid_hash(hash) || size > 2097152 {
            return Err("invalid_chunk".into());
        }
        let marker = self.chunk_marker(handle, index)?;
        if !marker.exists() {
            return Ok(None);
        }
        let metadata: ChunkMarker = match bounded_file(&marker, 4096)
            .and_then(|b| serde_json::from_slice(&b).map_err(|_| "recovery_cache_integrity".into()))
        {
            Ok(m) => m,
            Err(_) => return Ok(None),
        };
        if !valid_hash(&metadata.file_id) || metadata.sha256 != hash || metadata.byte_size != size {
            return Ok(None);
        }
        let path = self
            .directory(handle)?
            .join(format!("{}.bytes", metadata.file_id));
        let bytes = match bounded_file(&path, size) {
            Ok(b) => b,
            Err(_) => return Ok(None),
        };
        if bytes.len() as u64 != size || hex_hash(&bytes) != hash {
            return Ok(None);
        }
        Ok(Some(bytes))
    }
    pub(crate) async fn read_chunk(
        &self,
        handle: &str,
        index: u32,
        hash: &str,
        size: u64,
    ) -> Result<Option<Vec<u8>>, String> {
        let cache = self.clone();
        let handle = handle.to_owned();
        let hash = hash.to_owned();
        {
            tokio::task::spawn_blocking(move || cache.read_chunk_sync(&handle, index, &hash, size))
                .await
                .map_err(|_| "recovery_cache_io")?
        }
    }
    pub(crate) async fn store_chunk(
        &self,
        handle: &str,
        index: u32,
        hash: &str,
        bytes: &[u8],
    ) -> Result<(), String> {
        let cache = self.clone();
        let handle = handle.to_owned();
        let hash = hash.to_owned();
        let bytes = bytes.to_vec();
        tokio::task::spawn_blocking(move || {
            if bytes.len() > 2097152 || !valid_hash(&hash) || hex_hash(&bytes) != hash {
                return Err("hash_mismatch".into());
            }
            if cache
                .read_chunk_sync(&handle, index, &hash, bytes.len() as u64)?
                .is_some()
            {
                return Ok(());
            }
            let mut budget = cache.budget.lock().map_err(|_| "recovery_cache_io")?;
            if budget.is_none() {
                *budget = Some(disk_usage(&cache.root)?);
            }
            let used = budget.as_mut().unwrap();
            let sequence = FILE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let file_id = hex_hash(
                format!(
                    "{handle}:{index}:{hash}:{sequence}:{}",
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map_err(|_| "recovery_cache_io")?
                        .as_nanos()
                )
                .as_bytes(),
            );
            let marker = serde_json::to_vec(&ChunkMarker {
                file_id: file_id.clone(),
                sha256: hash.clone(),
                byte_size: bytes.len() as u64,
            })
            .map_err(|_| "recovery_cache_io")?;
            let reservation = bytes.len() as u64 + 2 * marker.len() as u64;
            if used
                .checked_add(reservation)
                .is_none_or(|n| n > cache.maximum)
            {
                return Err("recovery_cache_capacity".into());
            }
            *used += reservation;
            let mut reservation_guard = Reservation {
                budget,
                amount: reservation,
                committed: false,
                uncertain: false,
            };
            let directory = cache.directory(&handle)?;
            std::fs::create_dir_all(&directory).map_err(|_| "recovery_cache_io")?;
            let marker_path = cache.chunk_marker(&handle, index)?;
            let old_marker = std::fs::metadata(&marker_path)
                .map(|m| m.len())
                .unwrap_or(0);
            let data_path = directory.join(format!("{file_id}.bytes"));
            if let Err(error) = publish(&data_path, &bytes, &cache.fault) {
                if error.uncertain {
                    reservation_guard.uncertain();
                }
                return Err("recovery_cache_io".into());
            }
            if let Err(error) = publish(&marker_path, &marker, &cache.fault) {
                let cleanup_uncertain =
                    std::fs::remove_file(&data_path).is_err() && data_path.exists();
                if error.uncertain || cleanup_uncertain {
                    reservation_guard.uncertain();
                }
                return Err("recovery_cache_io".into());
            }
            reservation_guard.commit(marker.len() as u64 + old_marker);
            Ok(())
        })
        .await
        .map_err(|_| "recovery_cache_io")?
    }
    pub(crate) async fn publish_object(
        &self,
        handle: &str,
        object: &RecoveryObject,
    ) -> Result<(), String> {
        object.validate()?;
        let mut hash = Sha256::new();
        for chunk in &object.chunks {
            let bytes = self
                .read_chunk(handle, chunk.index, &chunk.sha256, chunk.byte_size)
                .await?
                .ok_or("recovery_cache_missing")?;
            hash.update(&bytes);
        }
        if format!("{:x}", hash.finalize()) != object.sha256 {
            return Err("hash_mismatch".into());
        }
        let cache = self.clone();
        let handle = handle.to_owned();
        let descriptor = serde_json::to_vec(object).map_err(|_| "invalid_object")?;
        tokio::task::spawn_blocking(move || {
            let path = cache.directory(&handle)?.join("object.json");
            let old = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            let mut budget = cache.budget.lock().map_err(|_| "recovery_cache_io")?;
            if budget.is_none() {
                *budget = Some(disk_usage(&cache.root)?);
            }
            let used = budget.as_mut().unwrap();
            let reserve = descriptor.len() as u64 * 2;
            if used.checked_add(reserve).is_none_or(|n| n > cache.maximum) {
                return Err("recovery_cache_capacity".into());
            }
            *used += reserve;
            let mut reservation_guard = Reservation {
                budget,
                amount: reserve,
                committed: false,
                uncertain: false,
            };
            if let Err(error) = publish(&path, &descriptor, &cache.fault) {
                if error.uncertain {
                    reservation_guard.uncertain();
                }
                return Err("recovery_cache_io".into());
            }
            reservation_guard.commit(descriptor.len() as u64 + old);
            Ok(())
        })
        .await
        .map_err(|_| "recovery_cache_io")?
    }
    pub(crate) async fn read_slice(
        &self,
        handle: &str,
        offset: u64,
        max: usize,
    ) -> Result<Vec<u8>, String> {
        if max == 0 || max > 65536 {
            return Err("invalid_slice".into());
        }
        let path = self.directory(handle)?.join("object.json");
        let object: RecoveryObject = serde_json::from_slice(&bounded_file(&path, 65536)?)
            .map_err(|_| "recovery_cache_integrity")?;
        self.read_slice_object(handle, offset, max, &object).await
    }
    /// Native-known immutable descriptor supplies chunk hashes; mutable cache metadata cannot replace it.
    pub(crate) async fn read_slice_object(
        &self,
        handle: &str,
        offset: u64,
        max: usize,
        object: &RecoveryObject,
    ) -> Result<Vec<u8>, String> {
        if max == 0 || max > 65536 {
            return Err("invalid_slice".into());
        }
        object.validate()?;
        let size = object
            .byte_size
            .parse::<u64>()
            .map_err(|_| "invalid_object")?;
        if offset > size {
            return Err("invalid_slice".into());
        }
        let end = offset.saturating_add(max as u64).min(size);
        let mut out = Vec::with_capacity((end - offset) as usize);
        let mut start = 0;
        for chunk in &object.chunks {
            let through = start + chunk.byte_size;
            if through > offset && start < end {
                let bytes = self
                    .read_chunk(handle, chunk.index, &chunk.sha256, chunk.byte_size)
                    .await?
                    .ok_or("recovery_cache_integrity")?;
                out.extend_from_slice(
                    &bytes[(offset.saturating_sub(start)) as usize
                        ..(end.min(through) - start) as usize],
                );
            }
            start = through;
        }
        if out.len() as u64 != end - offset {
            return Err("recovery_cache_integrity".into());
        }
        Ok(out)
    }
    pub(crate) async fn descriptor(&self, handle: &str) -> Result<RecoveryObject, String> {
        let path = self.directory(handle)?.join("object.json");
        tokio::task::spawn_blocking(move || {
            let object: RecoveryObject = serde_json::from_slice(&bounded_file(&path, 65536)?)
                .map_err(|_| "recovery_cache_integrity")?;
            object.validate()?;
            Ok(object)
        })
        .await
        .map_err(|_| "recovery_cache_io")?
    }

    pub(crate) async fn release_handles(&self, handles: &[String]) -> Result<(), String> {
        let cache = self.clone();
        let handles = handles.iter().cloned().collect::<BTreeSet<_>>();
        tokio::task::spawn_blocking(move || {
            let mut directories = Vec::with_capacity(handles.len());
            for handle in handles {
                let directory = cache.directory(&handle)?;
                if !directory.exists() {
                    continue;
                }
                let metadata =
                    std::fs::symlink_metadata(&directory).map_err(|_| "recovery_cache_missing")?;
                if !metadata.is_dir() || metadata.file_type().is_symlink() {
                    return Err("recovery_cache_integrity".into());
                }
                directories.push(directory);
            }

            let mut budget = cache.budget.lock().map_err(|_| "recovery_cache_io")?;
            if budget.is_none() {
                *budget = Some(disk_usage(&cache.root)?);
            }
            let released = directories.iter().try_fold(0u64, |total, directory| {
                total
                    .checked_add(disk_usage(directory)?)
                    .ok_or_else(|| "recovery_cache_capacity".to_owned())
            })?;
            for directory in directories {
                if std::fs::remove_dir_all(directory).is_err() {
                    *budget = None;
                    return Err("recovery_cache_io".into());
                }
            }
            if let Some(used) = budget.as_mut() {
                *used = used.saturating_sub(released);
            }
            Ok(())
        })
        .await
        .map_err(|_| "recovery_cache_io")?
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn pending_count(path: &Path) -> usize {
        if !path.exists() {
            return 0;
        }
        std::fs::read_dir(path)
            .unwrap()
            .map(|e| e.unwrap().path())
            .map(|p| {
                if p.is_dir() {
                    pending_count(&p)
                } else {
                    usize::from(p.to_string_lossy().contains(".pending-"))
                }
            })
            .sum()
    }
    fn one_chunk(bytes: &[u8]) -> RecoveryObject {
        RecoveryObject {
            object_id: "00000000-0000-4000-8000-000000000100".into(),
            kind: "facts".into(),
            stream_id: "facts".into(),
            stream_ordinal: 0,
            media_type: "application/x-ndjson".into(),
            byte_size: bytes.len().to_string(),
            sha256: hex_hash(bytes),
            chunk_count: 1,
            chunks: vec![crate::cloud_recovery_transport::RecoveryChunk {
                index: 0,
                byte_size: bytes.len() as u64,
                sha256: hex_hash(bytes),
            }],
        }
    }
    #[test]
    fn recovery_cache_failed_publish_rolls_back_reservation_and_cleans_scratch() {
        tauri::async_runtime::block_on(async {
            for stage in 1..=4 {
                let path = root();
                let cache = RecoveryCache::new(path.clone(), 4096);
                let bytes = b"reservation\n";
                let handle = "c".repeat(64);
                cache.fail_next_publish_at(stage);
                assert_eq!(
                    cache
                        .store_chunk(&handle, 0, &hex_hash(bytes), bytes)
                        .await
                        .unwrap_err(),
                    "recovery_cache_io"
                );
                assert_eq!(cache.budget_value(), Some(0));
                assert_eq!(pending_count(&path), 0);
                cache
                    .store_chunk(&handle, 0, &hex_hash(bytes), bytes)
                    .await
                    .unwrap();

                let object = one_chunk(bytes);
                let before = cache.budget_value().unwrap();
                cache.fail_next_publish_at(stage);
                assert_eq!(
                    cache.publish_object(&handle, &object).await.unwrap_err(),
                    "recovery_cache_io"
                );
                assert_eq!(cache.budget_value(), Some(before));
                assert_eq!(pending_count(&path), 0);
                cache.publish_object(&handle, &object).await.unwrap();
            }
        });
    }
    #[test]
    fn recovery_cache_native_descriptor_rejects_replaced_chunk_manifest() {
        tauri::async_runtime::block_on(async {
            use super::*;
            use crate::cloud_recovery_transport::{RecoveryChunk, RecoveryObject};
            let cache = RecoveryCache::new(
                std::env::temp_dir().join(format!(
                    "colive-cache-source-proof-{}",
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_nanos()
                )),
                2097152,
            );
            let handle = "a".repeat(64);
            let original = b"original";
            let foreign = b"forged!!";
            let expected = RecoveryObject {
                object_id: "00000000-0000-4000-8000-000000000100".into(),
                kind: "facts".into(),
                stream_id: "facts".into(),
                stream_ordinal: 0,
                media_type: "application/x-ndjson".into(),
                byte_size: original.len().to_string(),
                sha256: hex_hash(original),
                chunk_count: 1,
                chunks: vec![RecoveryChunk {
                    index: 0,
                    byte_size: original.len() as u64,
                    sha256: hex_hash(original),
                }],
            };
            cache
                .store_chunk(&handle, 0, &hex_hash(original), original)
                .await
                .unwrap();
            cache.publish_object(&handle, &expected).await.unwrap();
            assert_eq!(
                cache
                    .read_slice_object(&handle, 0, 65536, &expected)
                    .await
                    .unwrap(),
                original
            );
            let mut replaced = expected.clone();
            replaced.sha256 = hex_hash(foreign);
            replaced.chunks[0].sha256 = hex_hash(foreign);
            cache
                .store_chunk(&handle, 0, &hex_hash(foreign), foreign)
                .await
                .unwrap();
            cache.publish_object(&handle, &replaced).await.unwrap();
            assert_eq!(cache.read_slice(&handle, 0, 65536).await.unwrap(), foreign);
            assert!(cache
                .read_slice_object(&handle, 0, 65536, &expected)
                .await
                .is_err());
        });
    }
    use std::time::{SystemTime, UNIX_EPOCH};
    fn root() -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "colive-recovery-cache-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }
    #[test]
    fn recovery_cache_restart_rehashes_and_preserves_corrupt_old_bytes() {
        tauri::async_runtime::block_on(async {
            let path = root();
            let handle = "a".repeat(64);
            let bytes = b"immutable\n";
            let hash = hex_hash(bytes);
            let cache = RecoveryCache::new(path.clone(), 2048);
            cache.store_chunk(&handle, 0, &hash, bytes).await.unwrap();
            assert_eq!(
                cache
                    .read_chunk(&handle, 0, &hash, bytes.len() as u64)
                    .await
                    .unwrap()
                    .unwrap(),
                bytes
            );
            let marker = cache.chunk_marker(&handle, 0).unwrap();
            let metadata: serde_json::Value =
                serde_json::from_slice(&std::fs::read(marker).unwrap()).unwrap();
            let old = path
                .join(&handle)
                .join(format!("{}.bytes", metadata["file_id"].as_str().unwrap()));
            std::fs::write(&old, b"broken").unwrap();
            let resumed = RecoveryCache::new(path, 2048);
            assert!(resumed
                .read_chunk(&handle, 0, &hash, bytes.len() as u64)
                .await
                .unwrap()
                .is_none());
            resumed.store_chunk(&handle, 0, &hash, bytes).await.unwrap();
            assert!(old.exists());
            assert_eq!(
                resumed
                    .read_chunk(&handle, 0, &hash, bytes.len() as u64)
                    .await
                    .unwrap()
                    .unwrap(),
                bytes
            );
        });
    }
    #[test]
    fn recovery_cache_quota_rejects_without_removing_existing_entries() {
        tauri::async_runtime::block_on(async {
            let path = root();
            let cache = RecoveryCache::new(path, 8);
            assert_eq!(
                cache
                    .store_chunk(&"a".repeat(64), 0, &hex_hash(b"too large"), b"too large")
                    .await
                    .unwrap_err(),
                "recovery_cache_capacity"
            );
        });
    }
    #[test]
    fn recovery_cache_object_hash_and_bounded_slice_gate_unverified_bytes() {
        tauri::async_runtime::block_on(async {
            let cache = RecoveryCache::new(root(), 4096);
            let handle = "b".repeat(64);
            let a = b"hello ";
            let b = b"world\n";
            let descriptor = crate::cloud_recovery_transport::RecoveryObject {
                object_id: "00000000-0000-4000-8000-000000000100".into(),
                kind: "facts".into(),
                stream_id: "facts".into(),
                stream_ordinal: 0,
                media_type: "application/x-ndjson".into(),
                byte_size: "12".into(),
                sha256: hex_hash(b"hello world\n"),
                chunk_count: 2,
                chunks: vec![
                    crate::cloud_recovery_transport::RecoveryChunk {
                        index: 0,
                        byte_size: 6,
                        sha256: hex_hash(a),
                    },
                    crate::cloud_recovery_transport::RecoveryChunk {
                        index: 1,
                        byte_size: 6,
                        sha256: hex_hash(b),
                    },
                ],
            };
            cache
                .store_chunk(&handle, 0, &hex_hash(a), a)
                .await
                .unwrap();
            assert!(cache.publish_object(&handle, &descriptor).await.is_err());
            cache
                .store_chunk(&handle, 1, &hex_hash(b), b)
                .await
                .unwrap();
            cache.publish_object(&handle, &descriptor).await.unwrap();
            assert_eq!(cache.read_slice(&handle, 4, 5).await.unwrap(), b"o wor");
            assert!(cache.read_slice(&handle, 0, 65537).await.is_err());
            let mut false_descriptor = descriptor.clone();
            false_descriptor.sha256 = "0".repeat(64);
            assert_eq!(
                cache
                    .publish_object(&handle, &false_descriptor)
                    .await
                    .unwrap_err(),
                "hash_mismatch"
            );
        });
    }

    #[test]
    fn recovery_cache_release_removes_only_validated_handles_and_restores_budget() {
        tauri::async_runtime::block_on(async {
            let path = root();
            let cache = RecoveryCache::new(path.clone(), 4096);
            let first = b"first object\n";
            let second = b"second object\n";
            let first_handle = "d".repeat(64);
            let second_handle = "e".repeat(64);

            for (handle, bytes) in [
                (&first_handle, first.as_slice()),
                (&second_handle, second.as_slice()),
            ] {
                cache
                    .store_chunk(handle, 0, &hex_hash(bytes), bytes)
                    .await
                    .unwrap();
                cache
                    .publish_object(handle, &one_chunk(bytes))
                    .await
                    .unwrap();
            }
            let used_before = cache.budget_value().unwrap();

            cache
                .release_handles(&[first_handle.clone()])
                .await
                .unwrap();

            assert!(!path.join(&first_handle).exists());
            assert!(path.join(&second_handle).exists());
            assert!(cache.budget_value().unwrap() < used_before);
            cache.descriptor(&second_handle).await.unwrap();
        });
    }

    #[test]
    fn recovery_cache_release_rejects_invalid_handle_without_deleting_entries() {
        tauri::async_runtime::block_on(async {
            let path = root();
            let cache = RecoveryCache::new(path.clone(), 4096);
            let handle = "f".repeat(64);
            let bytes = b"kept object\n";
            cache
                .store_chunk(&handle, 0, &hex_hash(bytes), bytes)
                .await
                .unwrap();
            cache
                .publish_object(&handle, &one_chunk(bytes))
                .await
                .unwrap();

            assert_eq!(
                cache
                    .release_handles(&["../outside".into()])
                    .await
                    .unwrap_err(),
                "invalid_cache_handle"
            );
            assert!(path.join(&handle).exists());
            cache.descriptor(&handle).await.unwrap();
        });
    }
}
