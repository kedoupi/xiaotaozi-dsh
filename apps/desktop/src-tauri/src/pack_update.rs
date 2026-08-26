//! Signed, silent plugin-pack updates. Failures deliberately remain invisible.

use std::fs::{self, File};
use std::io::{BufReader, Read, Write};
use std::path::{Component, Path, PathBuf};
use std::time::Duration;

use base64::{prelude::*, Engine as _};
use ed25519_dalek::pkcs8::DecodePublicKey;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use flate2::read::GzDecoder;
use semver::Version;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tar::Archive;
use tauri::{AppHandle, Manager};
use url::Url;

use crate::{
    copy_tree, dsh_home, identity_ready, overlay_plugin_tree, packed_profile, remove_path,
    runtime_dir, spawn_engine_without_seed, stop_if_ours, wait_engine_up, Engine, WaitOutcome,
};

const DEFAULT_INDEX: &str = "https://s.xiaotaozi.cc/dsh/packs/latest.json";
const DEFAULT_HOST: &str = "s.xiaotaozi.cc";
const PACK_PATH_PREFIX: &str = "/dsh/packs/";
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
const MAX_PACK_BYTES: u64 = 512 * 1024 * 1024;
const MAX_UNPACKED_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const PUBLIC_KEY_DER: &[u8] = include_bytes!("../keys/pack-signing-key.der");

struct RemoveDirOnDrop(PathBuf);

impl Drop for RemoveDirOnDrop {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[derive(Debug, Deserialize)]
struct SignedEnvelope {
    #[serde(rename = "keyId")]
    key_id: String,
    signed: String,
    signature: String,
}

#[derive(Debug, Deserialize)]
struct PackIndex {
    #[serde(rename = "packVersion")]
    pack_version: String,
    #[serde(rename = "minApp")]
    min_app: Option<String>,
    dsh: Option<String>,
    node: Option<String>,
    targets: std::collections::HashMap<String, PackTarget>,
}

#[derive(Debug, Deserialize)]
struct PackTarget {
    url: String,
    sha256: String,
    #[serde(rename = "sizeBytes")]
    size_bytes: u64,
}

#[derive(Debug, Deserialize)]
struct BundledManifest {
    #[serde(rename = "packVersion")]
    pack_version: Option<String>,
    dsh: Option<String>,
    node: Option<String>,
}

fn index_url() -> String {
    if cfg!(debug_assertions) {
        std::env::var("XIAOTAOZI_PACK_INDEX").unwrap_or_else(|_| DEFAULT_INDEX.into())
    } else {
        DEFAULT_INDEX.into()
    }
}

fn stamp_path() -> PathBuf {
    dsh_home().join("xiaotaozi-desktop.json")
}

fn installed_pack_version(app: &AppHandle) -> String {
    if let Ok(text) = fs::read_to_string(stamp_path()) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
            if let Some(p) = v.get("packVersion").and_then(|x| x.as_str()) {
                if !p.is_empty() {
                    return p.to_string();
                }
            }
        }
    }
    bundled_manifest(app)
        .and_then(|m| m.pack_version)
        .unwrap_or_default()
}

fn bundled_manifest(app: &AppHandle) -> Option<BundledManifest> {
    let path = runtime_dir(app)?.join("manifest.json");
    serde_json::from_str(&fs::read_to_string(path).ok()?).ok()
}

pub(crate) fn bundled_overlay_version(app: &AppHandle) -> Option<String> {
    let bundled = bundled_manifest(app)?.pack_version?;
    let installed = fs::read_to_string(stamp_path())
        .ok()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
        .and_then(|value| {
            value
                .get("packVersion")
                .and_then(|version| version.as_str())
                .map(str::to_owned)
        });
    match installed {
        Some(installed) if installed >= bundled => None,
        _ => Some(bundled),
    }
}

pub(crate) fn write_stamp(pack_version: &str, source: &str) {
    let body = serde_json::json!({ "packVersion": pack_version, "source": source });
    let result =
        fs::create_dir_all(dsh_home()).and_then(|_| fs::write(stamp_path(), format!("{body}\n")));
    // Stamp failures stay silent by design; surface them in debug builds only.
    if let Err(error) = result {
        if cfg!(debug_assertions) {
            eprintln!("write_stamp failed: {error}");
        }
    }
}

fn current_target() -> Option<&'static str> {
    if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        Some("darwin-arm64")
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        Some("darwin-x64")
    } else {
        None
    }
}

fn public_key() -> Result<VerifyingKey, String> {
    VerifyingKey::from_public_key_der(PUBLIC_KEY_DER).map_err(|e| e.to_string())
}

fn verify_envelope(bytes: &[u8]) -> Result<PackIndex, String> {
    let envelope: SignedEnvelope = serde_json::from_slice(bytes).map_err(|e| e.to_string())?;
    let key = public_key()?;
    let key_id = hex::encode(Sha256::digest(PUBLIC_KEY_DER));
    if envelope.key_id != key_id[..16] {
        return Err("unknown signing key".into());
    }
    let signed = BASE64_STANDARD
        .decode(envelope.signed)
        .map_err(|e| e.to_string())?;
    let signature_bytes = BASE64_STANDARD
        .decode(envelope.signature)
        .map_err(|e| e.to_string())?;
    let signature = Signature::try_from(signature_bytes.as_slice()).map_err(|e| e.to_string())?;
    key.verify(&signed, &signature).map_err(|e| e.to_string())?;
    serde_json::from_slice(&signed).map_err(|e| e.to_string())
}

fn version_supported(minimum: Option<&str>) -> bool {
    let Ok(current) = Version::parse(APP_VERSION) else {
        return false;
    };
    minimum
        .map(Version::parse)
        .transpose()
        .is_ok_and(|minimum| minimum.is_none_or(|minimum| current >= minimum))
}

fn allowed_pack_url(pack: &str, index: &str, debug_override: bool) -> bool {
    let (Ok(pack), Ok(index)) = (Url::parse(pack), Url::parse(index)) else {
        return false;
    };
    let debug_loopback = debug_override
        && matches!(index.host_str(), Some("localhost" | "127.0.0.1" | "::1"))
        && index.scheme() == "http";
    if (pack.scheme() != "https" && !(debug_loopback && pack.scheme() == "http"))
        || pack.username() != ""
        || pack.password().is_some()
        || pack.query().is_some()
        || pack.fragment().is_some()
        || !pack.path().starts_with(PACK_PATH_PREFIX)
    {
        return false;
    }
    // Release packs live on the default HTTPS port only; an explicit port
    // (even 8443 on the right host) is refused. Only the debug loopback
    // branch keeps its random mock-server port.
    if pack.port().is_some() && !debug_loopback {
        return false;
    }
    let allowed_host = if debug_override {
        index.host_str()
    } else {
        Some(DEFAULT_HOST)
    };
    pack.host_str() == allowed_host
}

fn safe_archive_path(path: &Path) -> bool {
    !path.as_os_str().is_empty()
        && path
            .components()
            .all(|part| matches!(part, Component::Normal(_) | Component::CurDir))
}

fn unpack_tar_gz(archive: &Path, dest: &Path) -> Result<(), String> {
    let _ = fs::remove_dir_all(dest);
    fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    let gz = GzDecoder::new(BufReader::new(
        File::open(archive).map_err(|e| e.to_string())?,
    ));
    let mut tar = Archive::new(gz);
    let mut total_bytes = 0_u64;
    for entry in tar.entries().map_err(|e| e.to_string())? {
        let mut entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path().map_err(|e| e.to_string())?;
        if !safe_archive_path(&path)
            || !(entry.header().entry_type().is_file() || entry.header().entry_type().is_dir())
        {
            let _ = fs::remove_dir_all(dest);
            return Err("unsafe tar entry".into());
        }
        total_bytes = total_bytes.saturating_add(entry.size());
        if total_bytes > MAX_UNPACKED_BYTES {
            let _ = fs::remove_dir_all(dest);
            return Err("pack too large after decompression".into());
        }
        entry.unpack_in(dest).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn download_pack(
    agent: &ureq::Agent,
    remote: &PackTarget,
    destination: &Path,
) -> Result<(), String> {
    let result = download_pack_inner(agent, remote, destination);
    if result.is_err() {
        let _ = fs::remove_file(destination);
    }
    result
}

fn download_pack_inner(
    agent: &ureq::Agent,
    remote: &PackTarget,
    destination: &Path,
) -> Result<(), String> {
    if remote.size_bytes == 0 || remote.size_bytes > MAX_PACK_BYTES {
        return Err("invalid pack size".into());
    }
    let response = agent.get(&remote.url).call().map_err(|e| e.to_string())?;
    let content_length = response
        .header("Content-Length")
        .ok_or_else(|| "missing Content-Length".to_string())?
        .parse::<u64>()
        .map_err(|_| "invalid Content-Length".to_string())?;
    if content_length != remote.size_bytes || content_length > MAX_PACK_BYTES {
        return Err("pack size mismatch".into());
    }
    write_verified_pack(response.into_reader(), remote, destination)
}

fn write_verified_pack(
    reader: impl Read,
    remote: &PackTarget,
    destination: &Path,
) -> Result<(), String> {
    let result = write_verified_pack_inner(reader, remote, destination);
    if result.is_err() {
        let _ = fs::remove_file(destination);
    }
    result
}

fn write_verified_pack_inner(
    mut reader: impl Read,
    remote: &PackTarget,
    destination: &Path,
) -> Result<(), String> {
    let mut output = File::create(destination).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut total = 0_u64;
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = reader.read(&mut buffer).map_err(|e| e.to_string())?;
        if read == 0 {
            break;
        }
        total += read as u64;
        if total > remote.size_bytes || total > MAX_PACK_BYTES {
            return Err("pack exceeded declared size".into());
        }
        hasher.update(&buffer[..read]);
        output
            .write_all(&buffer[..read])
            .map_err(|e| e.to_string())?;
    }
    if total != remote.size_bytes
        || hex::encode(hasher.finalize()) != remote.sha256.to_ascii_lowercase()
    {
        return Err("pack integrity mismatch".into());
    }
    Ok(())
}

fn validate_profile(profile: &Path) -> Result<(), String> {
    let package: serde_json::Value = serde_json::from_str(
        &fs::read_to_string(profile.join("package.json")).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    let dependencies = package
        .get("dependencies")
        .and_then(|v| v.as_object())
        .ok_or_else(|| "profile dependencies missing".to_string())?;
    if !profile.join("node_modules").is_dir() {
        return Err("profile node_modules missing".into());
    }
    for name in dependencies.keys() {
        if !profile
            .join("node_modules")
            .join(name)
            .join("package.json")
            .is_file()
        {
            return Err(format!("installed plugin missing: {name}"));
        }
    }
    Ok(())
}

pub(crate) fn recover_profile_transaction(profile: &Path) -> Result<(), String> {
    let parent = profile
        .parent()
        .ok_or_else(|| "invalid profile path".to_string())?;
    let staging = parent.join(".web-staging");
    let backup = parent.join(".web-backup");
    let retired = parent.join(".web-retired");
    let _ = fs::remove_dir_all(staging);
    let _ = fs::remove_dir_all(retired);
    if backup.exists() {
        if profile.exists() {
            remove_path(profile)?;
        }
        fs::rename(backup, profile).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn swap_profile(
    profile: &Path,
    overlay: &Path,
    mut stop: impl FnMut() -> Result<(), String>,
    mut start_and_health: impl FnMut() -> Result<(), String>,
) -> Result<(), String> {
    recover_profile_transaction(profile)?;
    let parent = profile
        .parent()
        .ok_or_else(|| "invalid profile path".to_string())?;
    let staging = parent.join(".web-staging");
    let backup = parent.join(".web-backup");
    let retired = parent.join(".web-retired");
    if profile.exists() {
        copy_tree(profile, &staging)?;
    } else {
        fs::create_dir_all(&staging).map_err(|e| e.to_string())?;
    }
    if let Err(error) =
        overlay_plugin_tree(overlay, &staging, true).and_then(|_| validate_profile(&staging))
    {
        let _ = fs::remove_dir_all(&staging);
        return Err(error);
    }
    stop()?;
    let had_profile = profile.exists();
    if had_profile {
        if let Err(error) = fs::rename(profile, &backup) {
            let _ = fs::remove_dir_all(&staging);
            let _ = start_and_health();
            return Err(error.to_string());
        }
    }
    if let Err(error) = fs::rename(&staging, profile) {
        if had_profile {
            let _ = fs::rename(&backup, profile);
            let _ = start_and_health();
        }
        let _ = fs::remove_dir_all(&staging);
        return Err(error.to_string());
    }
    if let Err(error) = start_and_health() {
        let _ = fs::remove_dir_all(profile);
        if had_profile {
            let _ = fs::rename(&backup, profile);
            let _ = start_and_health();
        }
        return Err(error);
    }
    if had_profile {
        if let Err(error) = fs::rename(&backup, &retired) {
            stop()?;
            let _ = remove_path(profile);
            let _ = fs::rename(&backup, profile);
            let _ = start_and_health();
            return Err(error.to_string());
        }
        let _ = fs::remove_dir_all(retired);
    }
    Ok(())
}

pub(crate) fn apply_profile_overlay_transaction(
    profile: &Path,
    overlay: &Path,
) -> Result<(), String> {
    swap_profile(profile, overlay, || Ok(()), || Ok(()))
}

fn run_inner(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<Engine>();
    if !update_activation_allowed(*state.started_by_us.lock().unwrap()) {
        // An identity-valid external engine may be displayed, but this process
        // does not own its lifecycle. Leave the signed pack pending for a
        // future launch that this Desktop instance owns.
        return Ok(());
    }
    if packed_profile(app).is_none() {
        return Ok(());
    }
    let target = current_target().ok_or_else(|| "unsupported target".to_string())?;
    let index_url = index_url();
    let debug_override = cfg!(debug_assertions) && std::env::var("XIAOTAOZI_PACK_INDEX").is_ok();
    let parsed_index = Url::parse(&index_url).map_err(|e| e.to_string())?;
    let debug_loopback = debug_override
        && matches!(
            parsed_index.host_str(),
            Some("localhost" | "127.0.0.1" | "::1")
        )
        && parsed_index.scheme() == "http";
    if (parsed_index.scheme() != "https" && !debug_loopback)
        || (!debug_override
            && (parsed_index.host_str() != Some(DEFAULT_HOST)
                || !parsed_index.path().starts_with(PACK_PATH_PREFIX)))
    {
        return Err("invalid index URL".into());
    }
    let agent = ureq::AgentBuilder::new()
        .redirects(0)
        .timeout_connect(Duration::from_secs(5))
        .timeout(Duration::from_secs(180))
        .user_agent(&format!("XiaotaoziDSH/{APP_VERSION}"))
        .build();
    let response = agent
        .get(&index_url)
        .set("Cache-Control", "no-cache")
        .set("Pragma", "no-cache")
        .call()
        .map_err(|e| e.to_string())?;
    let mut bytes = Vec::new();
    response
        .into_reader()
        .take(1024 * 1024)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    let index = verify_envelope(&bytes)?;
    if index.pack_version.is_empty() || installed_pack_version(app) >= index.pack_version {
        return Ok(());
    }
    if !version_supported(index.min_app.as_deref()) {
        return Err("application version is too old".into());
    }
    if let Some(manifest) = bundled_manifest(app) {
        if index
            .dsh
            .as_deref()
            .zip(manifest.dsh.as_deref())
            .is_some_and(|(a, b)| a != b)
            || index
                .node
                .as_deref()
                .zip(manifest.node.as_deref())
                .is_some_and(|(a, b)| a != b)
        {
            return Err("runtime metadata mismatch".into());
        }
    }
    let remote = index
        .targets
        .get(target)
        .ok_or_else(|| "target missing".to_string())?;
    if !allowed_pack_url(&remote.url, &index_url, debug_override) {
        return Err("pack URL refused".into());
    }
    let profiles = dsh_home().join("profiles");
    let profile = profiles.join("web");
    recover_profile_transaction(&profile)?;
    let tmp = profiles.join(".xiaotaozi-pack");
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
    let _tmp_cleanup = RemoveDirOnDrop(tmp.clone());
    let archive = tmp.join("pack.tar.gz");
    download_pack(&agent, remote, &archive)?;
    let extract = tmp.join("extract");
    unpack_tar_gz(&archive, &extract)?;
    let result = swap_profile(
        &profile,
        &extract,
        || {
            stop_if_ours(app);
            Ok(())
        },
        || {
            spawn_engine_without_seed(app, &state)?;
            if !*state.started_by_us.lock().unwrap() {
                return Err("engine ownership lost during update restart".into());
            }
            match wait_engine_up(&state, Duration::from_secs(90)) {
                WaitOutcome::Up => Ok(()),
                WaitOutcome::PortTakenByOther | WaitOutcome::EngineExited => {
                    // Stop only our tracked child/process group. The listener
                    // that won the port race is never targeted.
                    stop_if_ours(app);
                    Err("engine exited during restart (port taken or crash)".into())
                }
                WaitOutcome::TimedOut => {
                    stop_if_ours(app);
                    Err("updated profile failed health check".into())
                }
            }
        },
    );
    result?;
    write_stamp(&index.pack_version, "cdn");
    Ok(())
}

fn update_activation_allowed(started_by_us: bool) -> bool {
    started_by_us
}

pub(crate) fn run(app: &AppHandle) {
    let _ = run_inner(app);
}

pub(crate) fn schedule(app: AppHandle) {
    if cfg!(debug_assertions) {
        return;
    }
    let state = app.state::<Engine>();
    if !update_activation_allowed(*state.started_by_us.lock().unwrap()) {
        return;
    }
    if state
        .update_running
        .compare_exchange(
            false,
            true,
            std::sync::atomic::Ordering::AcqRel,
            std::sync::atomic::Ordering::Acquire,
        )
        .is_err()
    {
        return;
    }
    {
        let mut phase = state.phase.lock().unwrap();
        if matches!(
            *phase,
            crate::EnginePhase::Booting
                | crate::EnginePhase::Updating
                | crate::EnginePhase::Stopping
        ) {
            state
                .update_running
                .store(false, std::sync::atomic::Ordering::Release);
            return;
        }
        *phase = crate::EnginePhase::Updating;
    }
    std::thread::spawn(move || {
        // Drop guard: even if run_inner panics (poisoned mutex, bug, ...)
        // the phase must leave Updating and update_running must reset,
        // otherwise every future boot() is refused forever.
        struct UpdateFinished(AppHandle);
        impl Drop for UpdateFinished {
            fn drop(&mut self) {
                let state = self.0.state::<Engine>();
                let mut phase = state.phase.lock().unwrap_or_else(|e| e.into_inner());
                *phase = if identity_ready(&state) {
                    crate::EnginePhase::Ready
                } else {
                    crate::EnginePhase::Failed
                };
                drop(phase);
                state
                    .update_running
                    .store(false, std::sync::atomic::Ordering::Release);
            }
        }
        let _finished = UpdateFinished(app.clone());
        run(&app);
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::{write::GzEncoder, Compression};
    use std::net::TcpListener;
    use tempfile::tempdir;

    #[test]
    fn external_engine_cannot_activate_a_profile_update() {
        assert!(update_activation_allowed(true));
        assert!(!update_activation_allowed(false));
    }

    #[test]
    fn rejects_unsigned_and_bad_signature() {
        assert!(verify_envelope(br#"{"packVersion":"x"}"#).is_err());
        let body = serde_json::json!({
            "keyId": hex::encode(Sha256::digest(PUBLIC_KEY_DER))[..16],
            "signed": BASE64_STANDARD.encode(br#"{"packVersion":"x","targets":{}}"#),
            "signature": BASE64_STANDARD.encode([0_u8; 64]),
        });
        assert!(verify_envelope(body.to_string().as_bytes()).is_err());
    }

    #[test]
    fn verifies_node_generated_golden_envelope() {
        let golden = br#"{"keyId":"5f9009592970644b","signed":"eyJwYWNrVmVyc2lvbiI6IjIwMjYwODI1VDAxMDIwMzAwNFoiLCJtaW5BcHAiOiIwLjEuMCIsInRhcmdldHMiOnt9fQ==","signature":"LDyZ0LWzBKEBKnoKZQ+9ghvOHjkV0QkF2wXyOJHW0i2uBCSqALUFPUd9I+2ZYBOp2z0+OD1g3NbC2dLEKH9nCA=="}"#;
        let index = verify_envelope(golden).unwrap();
        assert_eq!(index.pack_version, "20260825T010203004Z");
    }

    #[test]
    fn rejects_envelope_signed_by_unknown_key_id() {
        // Valid structure, valid base64, but a keyId that is not ours:
        // must be refused before any signature math happens.
        let golden = br#"{"keyId":"5f9009592970644b","signed":"eyJwYWNrVmVyc2lvbiI6IjIwMjYwODI1VDAxMDIwMzAwNFoiLCJtaW5BcHAiOiIwLjEuMCIsInRhcmdldHMiOnt9fQ==","signature":"LDyZ0LWzBKEBKnoKZQ+9ghvOHjkV0QkF2wXyOJHW0i2uBCSqALUFPUd9I+2ZYBOp2z0+OD1g3NbC2dLEKH9nCA=="}"#;
        let tampered =
            String::from_utf8_lossy(golden).replace("5f9009592970644b", "deadbeefdeadbeef");
        let error = verify_envelope(tampered.as_bytes()).unwrap_err();
        assert_eq!(error, "unknown signing key");
    }

    #[test]
    fn semver_and_urls_are_strict() {
        assert!(version_supported(Some("0.1.0")));
        assert!(!version_supported(Some("9.0.0")));
        assert!(allowed_pack_url(
            "https://s.xiaotaozi.cc/dsh/packs/a.tar.gz",
            DEFAULT_INDEX,
            false
        ));
        assert!(!allowed_pack_url(
            "http://s.xiaotaozi.cc/dsh/packs/a.tar.gz",
            DEFAULT_INDEX,
            false
        ));
        assert!(!allowed_pack_url(
            "https://evil.example/dsh/packs/a.tar.gz",
            DEFAULT_INDEX,
            false
        ));
    }

    #[test]
    fn pack_url_rejects_query_fragment_userinfo_port_and_escapes() {
        let cases = [
            "https://s.xiaotaozi.cc/dsh/packs/a.tar.gz?x=1",
            "https://s.xiaotaozi.cc/dsh/packs/a.tar.gz#frag",
            "https://user@s.xiaotaozi.cc/dsh/packs/a.tar.gz",
            "https://user:pw@s.xiaotaozi.cc/dsh/packs/a.tar.gz",
            "https://s.xiaotaozi.cc:8443/dsh/packs/a.tar.gz",
            // Url::parse normalizes ../ so the path leaves /dsh/packs/.
            "https://s.xiaotaozi.cc/dsh/packs/../evil.tar.gz",
            "https://s.xiaotaozi.cc/other/a.tar.gz",
        ];
        for url in cases {
            assert!(!allowed_pack_url(url, DEFAULT_INDEX, false), "{url}");
            // debug_override must not weaken checks against the release index.
            assert!(!allowed_pack_url(url, DEFAULT_INDEX, true), "{url} (debug)");
        }
        // The scheme-default port is normalized away and stays allowed.
        assert!(allowed_pack_url(
            "https://s.xiaotaozi.cc:443/dsh/packs/a.tar.gz",
            DEFAULT_INDEX,
            false
        ));
        // Debug override: loopback http index allows a mock-server port,
        // but only on the index host and only under /dsh/packs/.
        let index = "http://127.0.0.1:39999/dsh/packs/latest.json";
        assert!(allowed_pack_url(
            "http://127.0.0.1:39999/dsh/packs/a.tar.gz",
            index,
            true
        ));
        assert!(!allowed_pack_url(
            "http://127.0.0.1:39999/dsh/packs/a.tar.gz",
            index,
            false
        ));
        assert!(!allowed_pack_url(
            "http://127.0.0.2:39999/dsh/packs/a.tar.gz",
            index,
            true
        ));
        assert!(!allowed_pack_url(
            "http://127.0.0.1:39999/dsh/packs/../a.tar.gz",
            index,
            true
        ));
    }

    #[test]
    fn loopback_mock_cdn_streams_a_verified_pack() {
        let body = b"signed pack bytes".to_vec();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server_body = body.clone();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0_u8; 1024];
            let _ = stream.read(&mut request);
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                server_body.len()
            )
            .unwrap();
            stream.write_all(&server_body).unwrap();
        });
        let url = format!("http://{address}/dsh/packs/test.tar.gz");
        let index = format!("http://{address}/dsh/packs/latest.json");
        assert!(allowed_pack_url(&url, &index, true));
        let target = PackTarget {
            url,
            sha256: hex::encode(Sha256::digest(&body)),
            size_bytes: body.len() as u64,
        };
        let dir = tempdir().unwrap();
        let output = dir.path().join("pack.tar.gz");
        let agent = ureq::AgentBuilder::new().redirects(0).build();
        download_pack(&agent, &target, &output).unwrap();
        server.join().unwrap();
        assert_eq!(fs::read(output).unwrap(), body);
    }

    #[test]
    fn rejects_tar_traversal() {
        let dir = tempdir().unwrap();
        let archive = dir.path().join("bad.tar.gz");
        let mut header = [0_u8; 512];
        header[..9].copy_from_slice(b"../escape");
        header[100..108].copy_from_slice(b"0000644\0");
        header[108..116].copy_from_slice(b"0000000\0");
        header[116..124].copy_from_slice(b"0000000\0");
        header[124..136].copy_from_slice(b"00000000001\0");
        header[136..148].copy_from_slice(b"00000000000\0");
        header[148..156].fill(b' ');
        header[156] = b'0';
        header[257..263].copy_from_slice(b"ustar\0");
        header[263..265].copy_from_slice(b"00");
        let checksum: u32 = header.iter().map(|byte| u32::from(*byte)).sum();
        header[148..156].copy_from_slice(format!("{checksum:06o}\0 ").as_bytes());
        let mut gz = GzEncoder::new(File::create(&archive).unwrap(), Compression::default());
        gz.write_all(&header).unwrap();
        gz.write_all(&[1_u8]).unwrap();
        gz.write_all(&[0_u8; 511 + 1024]).unwrap();
        gz.finish().unwrap();
        assert!(unpack_tar_gz(&archive, &dir.path().join("out")).is_err());
    }

    fn profile(path: &Path, marker: &str) {
        fs::create_dir_all(path.join("node_modules/dsh-test")).unwrap();
        fs::write(
            path.join("package.json"),
            r#"{"dependencies":{"dsh-test":"file:./vendor/dsh-test.tgz"}}"#,
        )
        .unwrap();
        fs::write(
            path.join("node_modules/dsh-test/package.json"),
            r#"{"name":"dsh-test"}"#,
        )
        .unwrap();
        fs::write(path.join("marker"), marker).unwrap();
    }

    #[test]
    fn transaction_commits_and_rolls_back() {
        let dir = tempdir().unwrap();
        let web = dir.path().join("web");
        let overlay = dir.path().join("overlay");
        profile(&web, "old");
        profile(&overlay, "new");
        fs::write(
            overlay.join("node_modules/dsh-test/package.json"),
            r#"{"name":"new"}"#,
        )
        .unwrap();
        swap_profile(&web, &overlay, || Ok(()), || Ok(())).unwrap();
        assert_eq!(
            fs::read_to_string(web.join("node_modules/dsh-test/package.json")).unwrap(),
            r#"{"name":"new"}"#
        );

        fs::write(
            overlay.join("node_modules/dsh-test/package.json"),
            r#"{"name":"broken"}"#,
        )
        .unwrap();
        let failed = swap_profile(&web, &overlay, || Ok(()), || Err("health".into()));
        assert!(failed.is_err());
        assert_eq!(
            fs::read_to_string(web.join("node_modules/dsh-test/package.json")).unwrap(),
            r#"{"name":"new"}"#
        );
    }

    #[test]
    fn crash_recovery_always_restores_backup() {
        let dir = tempdir().unwrap();
        let web = dir.path().join("web");
        let backup = dir.path().join(".web-backup");
        let staging = dir.path().join(".web-staging");
        let retired = dir.path().join(".web-retired");
        profile(&web, "uncommitted-new");
        profile(&backup, "known-good");
        profile(&staging, "partial");
        profile(&retired, "already-committed-old");

        recover_profile_transaction(&web).unwrap();

        assert_eq!(
            fs::read_to_string(web.join("marker")).unwrap(),
            "known-good"
        );
        assert!(!backup.exists());
        assert!(!staging.exists());
        assert!(!retired.exists());
    }

    #[test]
    fn rejects_content_length_mismatch() {
        // The mock CDN declares more bytes than the signed index promised.
        let body = b"pack bytes".to_vec();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server_body = body.clone();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0_u8; 1024];
            let _ = stream.read(&mut request);
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                server_body.len() + 7
            )
            .unwrap();
            // The client aborts right after the headers; ignore EPIPE here.
            let _ = stream.write_all(&server_body);
        });
        let target = PackTarget {
            url: format!("http://{address}/dsh/packs/test.tar.gz"),
            sha256: hex::encode(Sha256::digest(&body)),
            size_bytes: body.len() as u64,
        };
        let dir = tempdir().unwrap();
        let output = dir.path().join("pack.tar.gz");
        let agent = ureq::AgentBuilder::new().redirects(0).build();
        let error = download_pack(&agent, &target, &output).unwrap_err();
        server.join().unwrap();
        assert_eq!(error, "pack size mismatch");
        assert!(!output.exists());
    }

    #[test]
    fn rejects_stream_longer_than_declared() {
        let dir = tempdir().unwrap();
        let destination = dir.path().join("pack.tar.gz");
        let remote = PackTarget {
            url: "https://s.xiaotaozi.cc/dsh/packs/test.tar.gz".into(),
            sha256: "00".repeat(32),
            size_bytes: 4,
        };
        let error = write_verified_pack(&b"abcdef"[..], &remote, &destination).unwrap_err();
        assert_eq!(error, "pack exceeded declared size");
        assert!(!destination.exists());
    }

    #[test]
    fn unpack_rejects_oversized_total() {
        // A tar entry declaring more than MAX_UNPACKED_BYTES must be refused
        // before it is written out.
        let dir = tempdir().unwrap();
        let archive = dir.path().join("huge.tar.gz");
        let mut header = tar::Header::new_ustar();
        header.set_path("huge.bin").unwrap();
        header.set_size(MAX_UNPACKED_BYTES + 1);
        header.set_mode(0o644);
        header.set_entry_type(tar::EntryType::Regular);
        header.set_cksum();
        // Only the header is needed: the guard trips on the declared size
        // before any body bytes are read.
        let mut gz = GzEncoder::new(File::create(&archive).unwrap(), Compression::default());
        gz.write_all(header.as_bytes()).unwrap();
        gz.finish().unwrap();
        let error = unpack_tar_gz(&archive, &dir.path().join("out")).unwrap_err();
        assert_eq!(error, "pack too large after decompression");
    }

    #[test]
    fn failed_stream_removes_partial_download() {
        let dir = tempdir().unwrap();
        let destination = dir.path().join("pack.tar.gz");
        let remote = PackTarget {
            url: "https://s.xiaotaozi.cc/dsh/packs/test.tar.gz".into(),
            sha256: "00".repeat(32),
            size_bytes: 4,
        };
        assert!(write_verified_pack(&b"ab"[..], &remote, &destination).is_err());
        assert!(!destination.exists());
    }

    #[test]
    fn temporary_update_directory_cleans_up_on_drop() {
        let dir = tempdir().unwrap();
        let update = dir.path().join("update");
        fs::create_dir_all(&update).unwrap();
        {
            let _cleanup = RemoveDirOnDrop(update.clone());
            fs::write(update.join("partial"), b"x").unwrap();
        }
        assert!(!update.exists());
    }
}
