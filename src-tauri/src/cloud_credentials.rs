pub(crate) trait CredentialStore {
    fn read(&self, target: &str) -> Result<Option<String>, String>;
    fn write(&self, target: &str, token: &str) -> Result<(), String>;
    fn delete(&self, target: &str) -> Result<(), String>;
}

pub(crate) struct SystemCredentials;

#[cfg(target_os = "windows")]
mod platform {
    use super::*;
    use windows_sys::Win32::Foundation::{GetLastError, ERROR_NOT_FOUND};
    use windows_sys::Win32::Security::Credentials::*;

    fn target_name(target: &str) -> Result<Vec<u16>, String> {
        if !target.starts_with("BB.EventFetcher/") || target.contains('\0') {
            return Err(ui_text!("backend.cloud_credentials.target_name").into());
        }
        Ok(target.encode_utf16().chain(std::iter::once(0)).collect())
    }

    impl CredentialStore for SystemCredentials {
        fn read(&self, target: &str) -> Result<Option<String>, String> {
            let name = target_name(target)?;
            let mut credential = std::ptr::null_mut();
            unsafe {
                if CredReadW(name.as_ptr(), CRED_TYPE_GENERIC, 0, &mut credential) == 0 {
                    if GetLastError() == ERROR_NOT_FOUND {
                        return Ok(None);
                    }
                    return Err(ui_text!("backend.cloud_credentials.read").into());
                }
                let value = &*credential;
                let bytes = if value.CredentialBlobSize == 0 {
                    Vec::new()
                } else {
                    std::slice::from_raw_parts(
                        value.CredentialBlob,
                        value.CredentialBlobSize as usize,
                    )
                    .to_vec()
                };
                CredFree(credential.cast());
                String::from_utf8(bytes)
                    .map(Some)
                    .map_err(|_| ui_text!("backend.cloud_credentials.read3").into())
            }
        }

        fn write(&self, target: &str, token: &str) -> Result<(), String> {
            let mut name = target_name(target)?;
            let mut bytes = token.as_bytes().to_vec();
            if bytes.is_empty() || bytes.len() > CRED_MAX_CREDENTIAL_BLOB_SIZE as usize {
                return Err(ui_text!("backend.cloud_credentials.write").into());
            }
            let credential = CREDENTIALW {
                Type: CRED_TYPE_GENERIC,
                TargetName: name.as_mut_ptr(),
                CredentialBlobSize: bytes.len() as u32,
                CredentialBlob: bytes.as_mut_ptr(),
                Persist: CRED_PERSIST_LOCAL_MACHINE,
                ..Default::default()
            };
            let result = unsafe { CredWriteW(&credential, 0) };
            bytes.fill(0);
            if result == 0 {
                return Err(ui_text!("backend.cloud_credentials.write2").into());
            }
            Ok(())
        }

        fn delete(&self, target: &str) -> Result<(), String> {
            let name = target_name(target)?;
            unsafe {
                if CredDeleteW(name.as_ptr(), CRED_TYPE_GENERIC, 0) != 0
                    || GetLastError() == ERROR_NOT_FOUND
                {
                    return Ok(());
                }
            }
            Err(ui_text!("backend.cloud_credentials.delete").into())
        }
    }
}

#[cfg(not(target_os = "windows"))]
impl CredentialStore for SystemCredentials {
    fn read(&self, _: &str) -> Result<Option<String>, String> {
        Err(ui_text!("backend.cloud_credentials.read2").into())
    }
    fn write(&self, _: &str, _: &str) -> Result<(), String> {
        Err(ui_text!("backend.cloud_credentials.write3").into())
    }
    fn delete(&self, _: &str) -> Result<(), String> {
        Err(ui_text!("backend.cloud_credentials.delete2").into())
    }
}
