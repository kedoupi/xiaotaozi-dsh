#![cfg(target_os = "macos")]

use std::io::Read;
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{atomic::AtomicBool, Mutex};
use std::time::{Duration, Instant};

use tauri::utils::config::{BackgroundThrottlingPolicy, Color};
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    webview::{NewWindowResponse, PageLoadEvent, WebviewWindowBuilder},
    AppHandle, Manager, Url, WebviewUrl, WebviewWindow,
};

mod browse;
mod pack_update;

pub(crate) const OFFICIAL_PORT: u16 = 3080;
pub(crate) const SANDBOX_PORT: u16 = 3081;

/// Debug/`tauri dev` attaches to the repo sandbox. Release never does.
#[cfg(debug_assertions)]
pub(crate) const PORT: u16 = SANDBOX_PORT;
#[cfg(not(debug_assertions))]
pub(crate) const PORT: u16 = OFFICIAL_PORT;

#[cfg(debug_assertions)]
const OPEN_URL: &str = "http://127.0.0.1:3081/";
#[cfg(not(debug_assertions))]
const OPEN_URL: &str = "http://127.0.0.1:3080/";

const IDENTITY_PATH: &str = "/.well-known/xiaotaozi-dsh/identity/v1";
const IDENTITY_PRODUCT: &str = "xiaotaozi-dsh";
const IDENTITY_PROTOCOL: &str = "xiaotaozi-dsh.identity.v1";
const IDENTITY_PROFILE: &str = "web";
const INSTANCE_TOKEN_ENV: &str = "XIAOTAOZI_DSH_INSTANCE_TOKEN";
const MAX_IDENTITY_BYTES: u64 = 4 * 1024;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum EnginePhase {
    Idle,
    Booting,
    Updating,
    Ready,
    Failed,
    Stopping,
}

fn begin_boot(phase: &mut EnginePhase) -> bool {
    if matches!(
        *phase,
        EnginePhase::Booting | EnginePhase::Updating | EnginePhase::Stopping
    ) {
        return false;
    }
    *phase = EnginePhase::Booting;
    true
}

#[cfg(windows)]
struct WindowsJob(windows::Win32::Foundation::HANDLE);

#[cfg(windows)]
unsafe impl Send for WindowsJob {}

#[cfg(windows)]
impl Drop for WindowsJob {
    fn drop(&mut self) {
        unsafe {
            let _ = windows::Win32::Foundation::CloseHandle(self.0);
        }
    }
}

struct Engine {
    /// Serializes child/token/ownership transitions. Code holding this guard
    /// may lock `child`, `started_by_us`, and `instance_token` in any order;
    /// callers that do not hold it must never mutate those three fields.
    lifecycle: Mutex<()>,
    child: Mutex<Option<Child>>,
    started_by_us: Mutex<bool>,
    instance_token: Mutex<Option<String>>,
    phase: Mutex<EnginePhase>,
    update_running: AtomicBool,
    #[cfg(windows)]
    job: Mutex<Option<WindowsJob>>,
}

fn official_dsh_home() -> PathBuf {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".into());
    PathBuf::from(home).join(".dsh")
}

fn sandbox_dsh_home() -> PathBuf {
    let mut root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    root.pop();
    root.pop();
    root.join(".dsh-home")
}

pub(crate) fn dsh_home() -> PathBuf {
    if cfg!(debug_assertions) {
        sandbox_dsh_home()
    } else {
        official_dsh_home()
    }
}

fn port_up_at(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    TcpStream::connect_timeout(&addr, Duration::from_millis(150)).is_ok()
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ServiceProbe {
    Down,
    IdentityReady,
    UnknownListener,
}

#[derive(serde::Deserialize)]
struct ServiceIdentity {
    product: String,
    protocol: String,
    profile: String,
    ready: bool,
    #[serde(rename = "instanceToken")]
    instance_token: Option<String>,
}

fn valid_owned_identity_payload(bytes: &[u8], expected_instance_token: &str) -> bool {
    let Ok(identity) = serde_json::from_slice::<ServiceIdentity>(bytes) else {
        return false;
    };
    identity.product == IDENTITY_PRODUCT
        && identity.protocol == IDENTITY_PROTOCOL
        && identity.profile == IDENTITY_PROFILE
        && identity.ready
        && identity.instance_token.as_deref() == Some(expected_instance_token)
}

fn identity_ready_at(port: u16, expected_instance_token: &str) -> bool {
    let url = format!("http://127.0.0.1:{port}{IDENTITY_PATH}");
    let agent = ureq::AgentBuilder::new()
        .redirects(0)
        .timeout(Duration::from_millis(500))
        .build();
    let Ok(response) = agent.get(&url).call() else {
        return false;
    };
    if response.status() != 200
        || response.header("Content-Type") != Some("application/json; charset=utf-8")
        || response.header("Cache-Control") != Some("no-store")
    {
        return false;
    }
    let mut bytes = Vec::new();
    if response
        .into_reader()
        .take(MAX_IDENTITY_BYTES + 1)
        .read_to_end(&mut bytes)
        .is_err()
        || bytes.len() as u64 > MAX_IDENTITY_BYTES
    {
        return false;
    }
    valid_owned_identity_payload(&bytes, expected_instance_token)
}

fn probe_service_at(port: u16, expected_instance_token: &str) -> ServiceProbe {
    if identity_ready_at(port, expected_instance_token) {
        ServiceProbe::IdentityReady
    } else if port_up_at(port) {
        ServiceProbe::UnknownListener
    } else {
        ServiceProbe::Down
    }
}

fn probe_unowned_port(port: u16) -> ServiceProbe {
    if port_up_at(port) {
        ServiceProbe::UnknownListener
    } else {
        ServiceProbe::Down
    }
}

/// Probe only the exact child instance represented by this process state.
/// A static Xiaotaozi identity, a stale token without a child handle, or a
/// token left behind after ownership was cleared is deliberately unowned.
fn probe_owned_service_locked(state: &Engine, port: u16) -> ServiceProbe {
    let started_by_us = *state.started_by_us.lock().unwrap();
    let has_child = state.child.lock().unwrap().is_some();
    let token = state.instance_token.lock().unwrap().clone();
    if !started_by_us || !has_child {
        return probe_unowned_port(port);
    }
    match token {
        Some(token) => probe_service_at(port, &token),
        None => probe_unowned_port(port),
    }
}

fn probe_owned_service_at(state: &Engine, port: u16) -> ServiceProbe {
    let _lifecycle = state.lifecycle.lock().unwrap();
    probe_owned_service_locked(state, port)
}

fn probe_owned_service(state: &Engine) -> ServiceProbe {
    probe_owned_service_at(state, PORT)
}

pub(crate) fn identity_ready(state: &Engine) -> bool {
    probe_owned_service(state) == ServiceProbe::IdentityReady
}

fn new_instance_token() -> Result<String, String> {
    let mut bytes = [0_u8; 32];
    getrandom::fill(&mut bytes).map_err(|error| format!("无法生成服务实例凭据：{error}"))?;
    Ok(hex::encode(bytes))
}

pub(crate) fn runtime_dir(app: &AppHandle) -> Option<PathBuf> {
    let resource = app.path().resource_dir().ok()?;
    let runtime = resource.join("runtime");
    runtime.is_dir().then_some(runtime)
}

fn node_binary(runtime: &Path) -> PathBuf {
    if cfg!(windows) {
        runtime.join("node").join("node.exe")
    } else {
        runtime.join("node").join("bin").join("node")
    }
}

fn dsh_bin_js(runtime: &Path) -> Option<PathBuf> {
    let unix = runtime
        .join("dsh")
        .join("lib")
        .join("node_modules")
        .join("@deepseek-ai")
        .join("dsh")
        .join("lib")
        .join("bin.js");
    let win = runtime
        .join("dsh")
        .join("node_modules")
        .join("@deepseek-ai")
        .join("dsh")
        .join("lib")
        .join("bin.js");
    if unix.is_file() {
        Some(unix)
    } else if win.is_file() {
        Some(win)
    } else {
        None
    }
}

fn dsh_bin_dir(runtime: &Path) -> PathBuf {
    if cfg!(windows) {
        runtime.join("dsh")
    } else {
        runtime.join("dsh").join("bin")
    }
}

fn python_path_dirs(runtime: &Path) -> Vec<PathBuf> {
    let root = runtime.join("python");
    if cfg!(windows) {
        let exe = root.join("python.exe");
        if !exe.is_file() {
            return Vec::new();
        }
        vec![root.clone(), root.join("Scripts")]
    } else {
        let bin = root.join("bin");
        if !bin.join("python3").is_file() {
            return Vec::new();
        }
        vec![bin]
    }
}

fn system_path() -> String {
    if cfg!(windows) {
        let root = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into());
        format!("{root}\\System32;{root}")
    } else {
        "/usr/bin:/bin:/usr/sbin:/sbin".into()
    }
}

/// Bundled Node + dsh, then a short system PATH. Do not inherit the host
/// PATH (Homebrew, fnm, grok, other agent CLIs).
fn join_path(first: &[PathBuf]) -> String {
    let mut parts: Vec<String> = first
        .iter()
        .map(|p| p.to_string_lossy().into_owned())
        .filter(|s| !s.is_empty())
        .collect();
    parts.push(system_path());
    parts.join(if cfg!(windows) { ";" } else { ":" })
}

enum Launch {
    Bundled {
        node: PathBuf,
        bin_js: PathBuf,
        path: String,
    },
    PathDsh {
        dsh: PathBuf,
        path: String,
    },
}

fn resolve_launch(app: &AppHandle) -> Result<Launch, String> {
    if let Some(runtime) = runtime_dir(app) {
        let node = node_binary(&runtime);
        if let Some(bin_js) = dsh_bin_js(&runtime) {
            if node.is_file() {
                let mut path_dirs = vec![node_binary(&runtime)
                    .parent()
                    .map(Path::to_path_buf)
                    .unwrap_or_else(|| runtime.join("node"))];
                path_dirs.extend(python_path_dirs(&runtime));
                path_dirs.push(dsh_bin_dir(&runtime));
                let path = join_path(&path_dirs);
                return Ok(Launch::Bundled { node, bin_js, path });
            }
        }
        if !cfg!(debug_assertions) {
            return Err("安装包缺少运行时。".into());
        }
    }

    if !cfg!(debug_assertions) {
        return Err("安装包缺少运行时。".into());
    }
    let path = std::env::var("PATH").unwrap_or_default();
    for dir in std::env::split_paths(&path) {
        let candidate = if cfg!(windows) {
            dir.join("dsh.exe")
        } else {
            dir.join("dsh")
        };
        if candidate.is_file() {
            return Ok(Launch::PathDsh {
                dsh: candidate,
                path,
            });
        }
    }
    Err("找不到 dsh。开发时请安装 @deepseek-ai/dsh@0.1.1-rc.2；用户安装包必须内置 Node。".into())
}

fn io_err(err: std::io::Error) -> String {
    format!("拷贝失败：{err}")
}

fn clear_readonly(path: &Path) {
    if let Ok(meta) = std::fs::metadata(path) {
        let mut perms = meta.permissions();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            perms.set_mode(perms.mode() | 0o200);
        }
        #[cfg(windows)]
        perms.set_readonly(false);
        let _ = std::fs::set_permissions(path, perms);
    }
}

fn remove_symlink(path: &Path) {
    if let Ok(meta) = path.symlink_metadata() {
        if meta.file_type().is_symlink() {
            let _ = std::fs::remove_file(path);
            let _ = std::fs::remove_dir_all(path);
        }
    }
}

fn remove_path(path: &Path) -> Result<(), String> {
    let Ok(meta) = path.symlink_metadata() else {
        return Ok(());
    };
    if meta.file_type().is_symlink() || meta.is_file() {
        std::fs::remove_file(path).map_err(io_err)
    } else {
        std::fs::remove_dir_all(path).map_err(io_err)
    }
}

fn copy_tree(src: &Path, dest: &Path) -> Result<(), String> {
    remove_symlink(dest);
    std::fs::create_dir_all(dest).map_err(io_err)?;
    clear_readonly(dest);
    for entry in std::fs::read_dir(src).map_err(io_err)? {
        let entry = entry.map_err(io_err)?;
        let from = entry.path();
        let to = dest.join(entry.file_name());
        remove_symlink(&to);
        let ft = entry.file_type().map_err(io_err)?;
        if ft.is_symlink() {
            let target = std::fs::read_link(&from).map_err(io_err)?;
            let linked = {
                #[cfg(unix)]
                {
                    std::os::unix::fs::symlink(&target, &to).is_ok()
                }
                #[cfg(windows)]
                {
                    let ok = if from.is_dir() {
                        std::os::windows::fs::symlink_dir(&target, &to).is_ok()
                    } else {
                        std::os::windows::fs::symlink_file(&target, &to).is_ok()
                    };
                    ok
                }
                #[cfg(not(any(unix, windows)))]
                {
                    false
                }
            };
            if !linked {
                if from.is_dir() {
                    copy_tree(&from, &to)?;
                } else {
                    std::fs::copy(&from, &to).map_err(io_err)?;
                    clear_readonly(&to);
                }
            }
        } else if ft.is_dir() {
            copy_tree(&from, &to)?;
        } else {
            std::fs::copy(&from, &to).map_err(io_err)?;
            clear_readonly(&to);
        }
    }
    Ok(())
}

pub(crate) fn packed_profile(app: &AppHandle) -> Option<PathBuf> {
    let src = runtime_dir(app)?.join("profile");
    src.join("package.json").is_file().then_some(src)
}

fn seed_profile(app: &AppHandle) -> Result<(), String> {
    let dest = dsh_home().join("profiles").join("web");
    let Some(src) = packed_profile(app) else {
        if dest.exists() || cfg!(debug_assertions) {
            return Ok(());
        }
        return Err("安装包缺少预装配置。".into());
    };
    if !dest.exists() {
        let parent = dest.parent().ok_or_else(|| "家目录无效。".to_string())?;
        std::fs::create_dir_all(parent).map_err(io_err)?;
        let tmp = parent.join(".web-seeding");
        let _ = std::fs::remove_dir_all(&tmp);
        if let Err(err) = copy_tree(&src, &tmp) {
            let _ = std::fs::remove_dir_all(&tmp);
            return Err(err);
        }
        if let Err(err) = std::fs::rename(&tmp, &dest) {
            let _ = std::fs::remove_dir_all(&tmp);
            return Err(io_err(err));
        }
        if let Some(path) = runtime_dir(app).map(|r| r.join("manifest.json")) {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(
                &std::fs::read_to_string(path).unwrap_or_default(),
            ) {
                if let Some(ver) = v.get("packVersion").and_then(|x| x.as_str()) {
                    pack_update::write_stamp(ver, "bundled");
                }
            }
        }
        return Ok(());
    }
    let Some(version) = pack_update::bundled_overlay_version(app) else {
        return Ok(());
    };
    set_splash(app, "正在安装插件…");
    pack_update::apply_profile_overlay_transaction(&dest, &src)?;
    pack_update::write_stamp(&version, "bundled");
    Ok(())
}

pub(crate) fn overlay_plugin_tree(src: &Path, dest: &Path, force: bool) -> Result<(), String> {
    let packed: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(src.join("package.json")).map_err(io_err)?)
            .map_err(|e| format!("预装配置无效：{e}"))?;
    let Some(packed_deps) = packed
        .get("dependencies")
        .and_then(|v| v.as_object())
        .cloned()
    else {
        return Ok(());
    };
    let vendor_src = src.join("vendor");
    let vendor_dest = dest.join("vendor");
    let mut vendor_changed = false;
    if force {
        remove_path(&vendor_dest)?;
        vendor_changed = true;
    }
    if vendor_src.is_dir() {
        if force {
            // vendor/ is a purely managed directory: on a forced overlay it
            // was just wiped above, so the whole packed tree is copied in and
            // is by definition changed — no per-file comparison needed. Any
            // tarball a user dropped in by hand (file:./vendor/dsh-*.tgz) is
            // deliberately cleared by updates; that is the design contract.
            copy_tree(&vendor_src, &vendor_dest)?;
        } else {
            std::fs::create_dir_all(&vendor_dest).map_err(io_err)?;
            for entry in std::fs::read_dir(&vendor_src).map_err(io_err)? {
                let entry = entry.map_err(io_err)?;
                let from = entry.path();
                let to = vendor_dest.join(entry.file_name());
                if !entry.file_type().map_err(io_err)?.is_file() {
                    // fs::read on a directory errors out; packed vendor/ only
                    // ever holds .tgz files, so treat anything else as changed.
                    if from.is_dir() {
                        copy_tree(&from, &to)?;
                        vendor_changed = true;
                    }
                    continue;
                }
                let changed =
                    std::fs::read(&from).map_err(io_err)? != std::fs::read(&to).unwrap_or_default();
                std::fs::copy(&from, &to).map_err(io_err)?;
                vendor_changed |= changed;
            }
        }
    }

    let dest_pkg_path = dest.join("package.json");
    let mut dest_pkg: serde_json::Value = if dest_pkg_path.is_file() {
        serde_json::from_str(&std::fs::read_to_string(&dest_pkg_path).map_err(io_err)?)
            .map_err(|e| format!("现有配置无效：{e}"))?
    } else {
        serde_json::json!({
            "name": "dsh-profile-web",
            "private": true,
            "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"] } },
            "dependencies": {}
        })
    };
    let mut json_changed = false;
    let mut removed_managed = Vec::new();
    {
        let deps = dest_pkg
            .as_object_mut()
            .ok_or_else(|| "现有配置无效。".to_string())?
            .entry("dependencies")
            .or_insert_with(|| serde_json::json!({}));
        let deps = deps
            .as_object_mut()
            .ok_or_else(|| "现有配置无效。".to_string())?;
        for (name, spec) in deps.clone() {
            if name.starts_with("dsh-")
                && spec
                    .as_str()
                    .is_some_and(|value| value.starts_with("file:./vendor/"))
                && !packed_deps.contains_key(&name)
            {
                deps.remove(&name);
                removed_managed.push(name);
                json_changed = true;
            }
        }
        for (name, spec) in &packed_deps {
            if deps.get(name) != Some(spec) {
                deps.insert(name.clone(), spec.clone());
                json_changed = true;
            }
        }
    }
    {
        let bundles = dest_pkg
            .as_object_mut()
            .unwrap()
            .entry("dsh")
            .or_insert_with(|| serde_json::json!({ "profile": { "bundles": [] } }));
        let profile = bundles
            .as_object_mut()
            .unwrap()
            .entry("profile")
            .or_insert_with(|| serde_json::json!({ "bundles": [] }));
        let list = profile
            .as_object_mut()
            .unwrap()
            .entry("bundles")
            .or_insert_with(|| serde_json::json!([]));
        let list = list
            .as_array_mut()
            .ok_or_else(|| "现有配置无效。".to_string())?;
        list.retain(|value| {
            !value
                .as_str()
                .is_some_and(|name| removed_managed.iter().any(|removed| removed == name))
        });
        for name in packed_deps.keys() {
            let already = list.iter().any(|v| v.as_str() == Some(name));
            if !already {
                list.push(serde_json::Value::String(name.clone()));
                json_changed = true;
            }
        }
    }

    if json_changed {
        std::fs::write(
            &dest_pkg_path,
            format!("{}\n", serde_json::to_string_pretty(&dest_pkg).unwrap()),
        )
        .map_err(io_err)?;
    }

    let ws = dest.join("pnpm-workspace.yaml");
    let ws_src = src.join("pnpm-workspace.yaml");
    if ws_src.is_file() {
        let wanted = std::fs::read_to_string(&ws_src).map_err(io_err)?;
        let current = std::fs::read_to_string(&ws).unwrap_or_default();
        if current != wanted {
            std::fs::write(&ws, wanted).map_err(io_err)?;
            json_changed = true;
        }
    }
    let npmrc = dest.join(".npmrc");
    if !npmrc.exists() && src.join(".npmrc").is_file() {
        std::fs::copy(src.join(".npmrc"), &npmrc).map_err(io_err)?;
    }

    let mut needs_overlay = vendor_changed || json_changed;
    for name in packed_deps.keys() {
        let installed = dest.join("node_modules").join(name);
        let meta = installed.symlink_metadata().ok();
        let is_link = meta.as_ref().is_some_and(|m| m.file_type().is_symlink());
        if is_link {
            if installed.is_dir() {
                std::fs::remove_dir_all(&installed).map_err(io_err)?;
            } else {
                std::fs::remove_file(&installed).map_err(io_err)?;
            }
            needs_overlay = true;
        } else if !installed.join("package.json").is_file() {
            needs_overlay = true;
        }
    }
    let packed_noema = src.join("node_modules").join("@zseven-w");
    if packed_noema.is_dir() {
        for entry in std::fs::read_dir(&packed_noema).map_err(io_err)? {
            let entry = entry.map_err(io_err)?;
            let name = entry.file_name();
            if !name.to_string_lossy().starts_with("dsh-noema-") {
                continue;
            }
            let dest_pkg = dest.join("node_modules").join("@zseven-w").join(&name);
            let dest_bin = dest_pkg.join("bin");
            let has_bin =
                dest_bin.join("noema-mcp").is_file() || dest_bin.join("noema-mcp.exe").is_file();
            let is_link = dest_pkg
                .symlink_metadata()
                .ok()
                .is_some_and(|m| m.file_type().is_symlink());
            if is_link || !has_bin {
                needs_overlay = true;
                break;
            }
        }
    }
    if !force && !needs_overlay {
        return Ok(());
    }

    let packed_modules = src.join("node_modules");
    if packed_modules.is_dir() {
        for name in packed_deps.keys().chain(removed_managed.iter()) {
            remove_path(&dest.join("node_modules").join(name))?;
        }
        copy_tree(&packed_modules, &dest.join("node_modules"))?;
    }
    let nested = dest
        .join("node_modules")
        .join("dsh-memory")
        .join("node_modules")
        .join("@zseven-w");
    if let Ok(entries) = std::fs::read_dir(&nested) {
        for entry in entries.flatten() {
            remove_symlink(&entry.path());
        }
    }
    Ok(())
}

fn apply_common_env(cmd: &mut Command, home: &Path, path: &str, instance_token: &str) {
    // Harness skill-filesystem scans $DSH_AGENTS_HOME/skills (default ~/.agents).
    // Point it at the DSH home so Grok/Codex/Claude skills on this machine
    // are not visible inside 小桃子DSH.
    cmd.env("DSH_HOME", home)
        .env("DSH_AGENTS_HOME", home.join("agents"))
        .env(INSTANCE_TOKEN_ENV, instance_token)
        .env("PATH", path)
        .env("PYTHONUTF8", "1")
        .env("PIP_INDEX_URL", "https://pypi.tuna.tsinghua.edu.cn/simple")
        .env("PIP_TRUSTED_HOST", "pypi.tuna.tsinghua.edu.cn");
    if cfg!(debug_assertions) && std::env::var_os("DSH_PLUGIN_TRACE").is_none() {
        cmd.env("DSH_PLUGIN_TRACE", "1");
    }
    cmd.args([
        "web",
        "--port",
        &PORT.to_string(),
        "--no-open",
        "--host",
        "127.0.0.1",
    ])
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
}

#[cfg(windows)]
fn create_kill_job(child: &Child) -> Result<WindowsJob, String> {
    use std::mem::size_of;
    use windows::Win32::{
        Foundation::CloseHandle,
        System::{
            JobObjects::{
                AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
                SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
                JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            },
            Threading::{OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE},
        },
    };

    unsafe {
        let job = WindowsJob(
            CreateJobObjectW(None, windows::core::PCWSTR::null()).map_err(|e| e.to_string())?,
        );
        let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        SetInformationJobObject(
            job.0,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const _,
            size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        )
        .map_err(|e| e.to_string())?;
        let process = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, false, child.id())
            .map_err(|e| e.to_string())?;
        let assigned = AssignProcessToJobObject(job.0, process);
        let _ = CloseHandle(process);
        if let Err(error) = assigned {
            return Err(error.to_string());
        }
        Ok(job)
    }
}

fn spawn_engine(app: &AppHandle, state: &Engine) -> Result<(), String> {
    spawn_engine_inner(app, state, true)
}

fn spawn_engine_without_seed(app: &AppHandle, state: &Engine) -> Result<(), String> {
    spawn_engine_inner(app, state, false)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum SpawnPreflight {
    ExistingOwnedChild,
    PortFree,
}

/// Reconcile a cached child before starting another one. An already-running
/// owned child is reused and checked by `wait_engine_up`; an exited child is
/// reaped and its token is discarded. A live child without the ownership bit
/// is an inconsistent state and is never signalled or replaced.
fn spawn_preflight_locked(state: &Engine) -> Result<SpawnPreflight, String> {
    let owned = *state.started_by_us.lock().unwrap();
    let mut child_slot = state.child.lock().unwrap();
    if let Some(child) = child_slot.as_mut() {
        match child.try_wait() {
            Ok(None) if owned => return Ok(SpawnPreflight::ExistingOwnedChild),
            Ok(None) => {
                return Err("检测到未跟踪的存活子进程，已拒绝重复启动".into());
            }
            Ok(Some(_)) => {
                child_slot.take();
            }
            Err(error) => {
                return Err(format!("无法确认已有子进程状态，已拒绝重复启动：{error}"));
            }
        }
    }
    drop(child_slot);
    *state.started_by_us.lock().unwrap() = false;
    *state.instance_token.lock().unwrap() = None;
    if port_up_at(PORT) {
        Err(format!("端口 {PORT} 被未知服务占用，已拒绝接管"))
    } else {
        Ok(SpawnPreflight::PortFree)
    }
}

fn spawn_engine_inner(app: &AppHandle, state: &Engine, seed: bool) -> Result<(), String> {
    {
        let _lifecycle = state.lifecycle.lock().unwrap();
        if spawn_preflight_locked(state)? == SpawnPreflight::ExistingOwnedChild {
            return Ok(());
        }
    }

    if seed && !cfg!(debug_assertions) {
        set_splash(app, "正在准备…");
        seed_profile(app)?;
    }

    let home = dsh_home();
    std::fs::create_dir_all(&home).map_err(|e| e.to_string())?;
    let launch = resolve_launch(app)?;
    let instance_token = new_instance_token()?;

    let mut cmd = match launch {
        Launch::Bundled { node, bin_js, path } => {
            let mut cmd = Command::new(&node);
            cmd.arg(&bin_js);
            apply_common_env(&mut cmd, &home, &path, &instance_token);
            cmd
        }
        Launch::PathDsh { dsh, path } => {
            let mut cmd = Command::new(&dsh);
            apply_common_env(&mut cmd, &home, &path, &instance_token);
            cmd
        }
    };
    // Recheck under the lifecycle guard immediately before spawn. Profile
    // preparation and launch resolution can take long enough for another
    // listener to win the port in between.
    let _lifecycle = state.lifecycle.lock().unwrap();
    if spawn_preflight_locked(state)? == SpawnPreflight::ExistingOwnedChild {
        return Ok(());
    }
    let child = cmd.spawn().map_err(|e| format!("没能启动：{e}"))?;
    #[cfg(windows)]
    let child = {
        let mut child = child;
        let job = match create_kill_job(&child) {
            Ok(job) => job,
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(error);
            }
        };
        *state.job.lock().unwrap() = Some(job);
        child
    };
    *state.child.lock().unwrap() = Some(child);
    *state.instance_token.lock().unwrap() = Some(instance_token);
    // Publish ownership last. Any direct reader of `started_by_us` therefore
    // observes a fully initialized child handle and instance token.
    *state.started_by_us.lock().unwrap() = true;
    Ok(())
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum WaitVerdict {
    KeepWaiting,
    Up,
    PortTakenByOther,
    EngineExited,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ChildProbe {
    Running,
    Exited,
    MissingOrUnknown,
}

/// One readiness-poll tick. Only the versioned Xiaotaozi identity is ready;
/// any other listener is a conflict. A valid identity that appears after our
/// spawned child exits is external and must never be adopted as our child.
fn classify_wait_tick(probe: ServiceProbe, child: ChildProbe) -> WaitVerdict {
    match (probe, child) {
        (ServiceProbe::IdentityReady, ChildProbe::Running) => WaitVerdict::Up,
        (ServiceProbe::Down, ChildProbe::Running) => WaitVerdict::KeepWaiting,
        (ServiceProbe::Down, ChildProbe::Exited) => WaitVerdict::EngineExited,
        (ServiceProbe::IdentityReady | ServiceProbe::UnknownListener, ChildProbe::Exited)
        | (_, ChildProbe::MissingOrUnknown)
        | (ServiceProbe::UnknownListener, ChildProbe::Running) => WaitVerdict::PortTakenByOther,
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum WaitOutcome {
    Up,
    PortTakenByOther,
    EngineExited,
    TimedOut,
}

/// Wait for the identity endpoint while watching the child we spawned. The
/// service probe is sampled before `try_wait`, so a child that already lost
/// the bind race cannot turn a foreign listener into owned success.
pub(crate) fn wait_engine_up(state: &Engine, timeout: Duration) -> WaitOutcome {
    let start = Instant::now();
    loop {
        let (probe, child) = {
            let _lifecycle = state.lifecycle.lock().unwrap();
            let probe = probe_owned_service_locked(state, PORT);
            let mut guard = state.child.lock().unwrap();
            let child = match guard.as_mut() {
                Some(child) => match child.try_wait() {
                    Ok(Some(_)) => ChildProbe::Exited,
                    Ok(None) => ChildProbe::Running,
                    Err(_) => ChildProbe::MissingOrUnknown,
                },
                None => ChildProbe::MissingOrUnknown,
            };
            (probe, child)
        };
        match classify_wait_tick(probe, child) {
            WaitVerdict::Up => return WaitOutcome::Up,
            WaitVerdict::PortTakenByOther => return WaitOutcome::PortTakenByOther,
            WaitVerdict::EngineExited => return WaitOutcome::EngineExited,
            WaitVerdict::KeepWaiting => {}
        }
        if start.elapsed() >= timeout {
            return WaitOutcome::TimedOut;
        }
        std::thread::sleep(Duration::from_millis(120));
    }
}

/// The spawned engine exited on its own: reap it and drop ownership so a
/// later quit/update never signals a reused pid or a foreign server on 3080.
pub(crate) fn disown_exited_child(state: &Engine) {
    let _lifecycle = state.lifecycle.lock().unwrap();
    let exited = {
        let mut child_slot = state.child.lock().unwrap();
        match child_slot.as_mut() {
            Some(child) => matches!(child.try_wait(), Ok(Some(_))),
            None => true,
        }
    };
    // A stale caller must not drop the only handle to a live process. Keep
    // ownership intact so a later stop can inspect and terminate it safely.
    if !exited {
        return;
    }
    *state.started_by_us.lock().unwrap() = false;
    *state.instance_token.lock().unwrap() = None;
    state.child.lock().unwrap().take();
    #[cfg(windows)]
    {
        state.job.lock().unwrap().take();
    }
}

fn with_main_window(app: &AppHandle, f: impl FnOnce(&WebviewWindow) + Send + 'static) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(win) = handle.get_webview_window("main") {
            f(&win);
        }
    });
}

fn on_dsh(win: &WebviewWindow) -> bool {
    match win.url() {
        Ok(url) => url.host_str() == Some("127.0.0.1") && url.port() == Some(PORT),
        Err(_) => false,
    }
}

fn show_window(win: &WebviewWindow) {
    let _ = win.unminimize();
    let _ = win.show();
    let _ = win.set_focus();
}

fn navigate_to_dsh(win: &WebviewWindow) {
    if let Ok(url) = Url::parse(OPEN_URL) {
        let _ = win.navigate(url);
    }
}

fn open_shell_on_main(win: &WebviewWindow) {
    if !on_dsh(win) {
        navigate_to_dsh(win);
    }
    show_window(win);
}

fn open_shell(app: &AppHandle) {
    with_main_window(app, open_shell_on_main);
}

fn set_splash(app: &AppHandle, text: &str) {
    let encoded = serde_json::to_string(text).unwrap_or_else(|_| "\"\"".into());
    with_main_window(app, move |win| {
        if on_dsh(win) {
            return;
        }
        let _ = win.eval(format!(
            "var n=document.getElementById('status'); if(n) n.textContent={encoded};"
        ));
    });
}

fn reveal_or_boot(app: &AppHandle) {
    let handle = app.clone();
    std::thread::spawn(move || {
        let ready = identity_ready(&handle.state::<Engine>());
        let main_handle = handle.clone();
        let _ = handle.run_on_main_thread(move || {
            if let Some(win) = main_handle.get_webview_window("main") {
                if on_dsh(&win) && ready {
                    show_window(&win);
                    return;
                }
                if ready {
                    open_shell_on_main(&win);
                    return;
                }
            } else if ready {
                open_shell(&main_handle);
                return;
            }
            boot(main_handle);
        });
    });
}

fn boot(app: AppHandle) {
    {
        let state = app.state::<Engine>();
        if !begin_boot(&mut state.phase.lock().unwrap()) {
            return;
        }
    }
    std::thread::spawn(move || {
        let state = app.state::<Engine>();
        match probe_owned_service(&state) {
            ServiceProbe::IdentityReady => {
                *state.phase.lock().unwrap() = EnginePhase::Ready;
                open_shell(&app);
                return;
            }
            ServiceProbe::UnknownListener => {
                *app.state::<Engine>().phase.lock().unwrap() = EnginePhase::Failed;
                set_splash(
                    &app,
                    &format!("端口 {PORT} 被未知服务占用，已拒绝打开或接管。"),
                );
                return;
            }
            ServiceProbe::Down => {}
        }
        if !cfg!(debug_assertions) {
            let profile = dsh_home().join("profiles").join("web");
            if let Err(err) = pack_update::recover_profile_transaction(&profile) {
                *app.state::<Engine>().phase.lock().unwrap() = EnginePhase::Failed;
                set_splash(&app, &err);
                return;
            }
        }
        set_splash(&app, "正在启动…");
        let state = app.state::<Engine>();
        if let Err(err) = spawn_engine(&app, &state) {
            *state.phase.lock().unwrap() = EnginePhase::Failed;
            let err = if cfg!(debug_assertions) {
                format!("{err} 请先在仓库根运行 pnpm dev（沙箱 :3081）。")
            } else {
                err
            };
            set_splash(&app, &err);
            return;
        }
        match wait_engine_up(&state, Duration::from_secs(90)) {
            WaitOutcome::Up => {}
            WaitOutcome::PortTakenByOther => {
                // Only signal the child/process group we spawned. The unknown
                // listener itself is never identified by PID or touched.
                stop_if_ours(&app);
                *state.phase.lock().unwrap() = EnginePhase::Failed;
                set_splash(&app, "端口被占用，没能启动。");
                return;
            }
            WaitOutcome::EngineExited => {
                disown_exited_child(&state);
                *state.phase.lock().unwrap() = EnginePhase::Failed;
                set_splash(&app, "没能启动。");
                return;
            }
            WaitOutcome::TimedOut => {
                stop_if_ours(&app);
                *state.phase.lock().unwrap() = EnginePhase::Failed;
                set_splash(&app, "没能启动。");
                return;
            }
        }
        *state.phase.lock().unwrap() = EnginePhase::Ready;
        open_shell(&app);
        let ours = *state.started_by_us.lock().unwrap();
        if ours {
            pack_update::schedule(app);
        }
    });
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ChildStopOutcome {
    AlreadyExited,
    Signalled,
    InspectionFailed,
}

/// Stop a child only after proving its cached handle still represents a live
/// process. Once TERM is sent we intentionally retain the unreaped leader
/// until after KILL, preventing its PID/PGID from being recycled in between.
fn stop_child_process_group(mut child: Child) -> ChildStopOutcome {
    match child.try_wait() {
        Ok(Some(_)) => ChildStopOutcome::AlreadyExited,
        Err(_) => ChildStopOutcome::InspectionFailed,
        Ok(None) => {
            #[cfg(unix)]
            {
                let pid = child.id() as i32;
                unsafe {
                    libc::killpg(pid, libc::SIGTERM);
                }
                std::thread::sleep(Duration::from_millis(400));
                unsafe {
                    libc::killpg(pid, libc::SIGKILL);
                }
                // `process_group(0)` makes this redundant in the normal case,
                // but it also terminates the tracked child if it unexpectedly
                // moved out of its original group. The unreaped Child keeps
                // its PID from being reused until this signal completes.
                let _ = child.kill();
            }
            #[cfg(not(unix))]
            {
                let _ = child.kill();
            }
            let _ = child.wait();
            ChildStopOutcome::Signalled
        }
    }
}

fn stop_if_ours(app: &AppHandle) {
    let state = app.state::<Engine>();
    {
        let mut phase = state.phase.lock().unwrap();
        if *phase != EnginePhase::Updating {
            *phase = EnginePhase::Stopping;
        }
    }
    let _lifecycle = state.lifecycle.lock().unwrap();
    let ours = std::mem::take(&mut *state.started_by_us.lock().unwrap());
    *state.instance_token.lock().unwrap() = None;
    let child = state.child.lock().unwrap().take();
    if ours {
        if let Some(child) = child {
            let _ = stop_child_process_group(child);
        }
    } else if let Some(mut child) = child {
        // An inconsistent unowned handle is never signalled. `try_wait` still
        // reaps it when it had already exited, avoiding a zombie leak.
        let _ = child.try_wait();
    }
    #[cfg(windows)]
    {
        state.job.lock().unwrap().take();
    }
    // `pack_update::UpdateFinished` takes phase before checking identity
    // (which takes lifecycle). Do not hold the inverse order here.
    drop(_lifecycle);
    let mut phase = state.phase.lock().unwrap();
    if *phase != EnginePhase::Updating {
        *phase = EnginePhase::Idle;
    }
}

fn tray_image() -> Image<'static> {
    // tray-macos.png is padded; macOS tray-icon always scales height to 18pt.
    #[cfg(target_os = "macos")]
    {
        tauri::include_image!("icons/tray-macos.png")
    }
    #[cfg(not(target_os = "macos"))]
    {
        tauri::include_image!("icons/tray-win.png")
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Engine {
            lifecycle: Mutex::new(()),
            child: Mutex::new(None),
            started_by_us: Mutex::new(false),
            instance_token: Mutex::new(None),
            phase: Mutex::new(EnginePhase::Idle),
            update_running: AtomicBool::new(false),
            #[cfg(windows)]
            job: Mutex::new(None),
        })
        .setup(|app| {
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("小桃子DSH")
                .inner_size(1280.0, 840.0)
                .min_inner_size(880.0, 600.0)
                .visible(true)
                .accept_first_mouse(true)
                .background_color(Color(255, 247, 237, 255))
                .background_throttling(BackgroundThrottlingPolicy::Disabled)
                .additional_browser_args("--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows")
                .on_navigation(browse::allow_navigation)
                .on_new_window(|url, _features| {
                    let _ = browse::handle_new_window(&url);
                    NewWindowResponse::Deny
                })
                .on_page_load(|window, payload| {
                    if payload.event() == PageLoadEvent::Finished && browse::stays_in_shell(payload.url()) {
                        let _ = window.eval("window.__XIAOTAOZI_DESKTOP__=true");
                    }
                })
                .build()?;

            let show = MenuItem::with_id(app, "open", "打开", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            let _tray = TrayIconBuilder::with_id("main")
                .icon(tray_image())
                .icon_as_template(false)
                .tooltip("小桃子DSH")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => reveal_or_boot(app),
                    "quit" => {
                        stop_if_ours(app);
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        reveal_or_boot(tray.app_handle());
                    }
                })
                .build(app)?;

            if let Some(win) = app.get_webview_window("main") {
                let handle = app.handle().clone();
                win.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        if let Some(w) = handle.get_webview_window("main") {
                            let _ = w.hide();
                        }
                    }
                });
            }
            boot(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write as _;
    use std::net::TcpListener;
    use tempfile::tempdir;

    #[test]
    fn debug_attaches_to_sandbox_release_stays_official() {
        #[cfg(debug_assertions)]
        {
            assert_eq!(PORT, 3081);
            assert!(dsh_home().ends_with(".dsh-home"));
            assert!(!dsh_home().ends_with(".dsh"));
        }
        #[cfg(not(debug_assertions))]
        {
            assert_eq!(PORT, 3080);
            assert!(dsh_home().ends_with(".dsh"));
        }
    }

    #[test]
    fn boot_guard_allows_only_one_boot() {
        let mut phase = EnginePhase::Idle;
        assert!(begin_boot(&mut phase));
        assert_eq!(phase, EnginePhase::Booting);
        assert!(!begin_boot(&mut phase));
        phase = EnginePhase::Updating;
        assert!(!begin_boot(&mut phase));
        phase = EnginePhase::Stopping;
        assert!(!begin_boot(&mut phase));
        phase = EnginePhase::Failed;
        assert!(begin_boot(&mut phase));
    }

    #[test]
    fn wait_tick_never_adopts_a_foreign_server() {
        assert_eq!(
            classify_wait_tick(ServiceProbe::Down, ChildProbe::Running),
            WaitVerdict::KeepWaiting
        );
        assert_eq!(
            classify_wait_tick(ServiceProbe::IdentityReady, ChildProbe::Running),
            WaitVerdict::Up
        );
        assert_eq!(
            classify_wait_tick(ServiceProbe::UnknownListener, ChildProbe::Running),
            WaitVerdict::PortTakenByOther
        );
        // Our child died but 3080 answers: someone else took the port.
        // This must surface as an error, never as started_by_us success.
        assert_eq!(
            classify_wait_tick(ServiceProbe::IdentityReady, ChildProbe::Exited),
            WaitVerdict::PortTakenByOther
        );
        assert_eq!(
            classify_wait_tick(ServiceProbe::Down, ChildProbe::Exited),
            WaitVerdict::EngineExited
        );
        assert_eq!(
            classify_wait_tick(ServiceProbe::IdentityReady, ChildProbe::MissingOrUnknown),
            WaitVerdict::PortTakenByOther
        );
    }

    #[test]
    fn identity_payload_requires_the_fixed_contract_and_expected_instance() {
        let owned = "ab".repeat(32);
        let foreign = "cd".repeat(32);
        assert!(!valid_owned_identity_payload(
            br#"{"product":"xiaotaozi-dsh","protocol":"xiaotaozi-dsh.identity.v1","profile":"web","ready":true}"#,
            &owned,
        ));
        let owned_body = format!(
            r#"{{"product":"xiaotaozi-dsh","protocol":"xiaotaozi-dsh.identity.v1","profile":"web","ready":true,"instanceToken":"{owned}"}}"#
        );
        let foreign_body = format!(
            r#"{{"product":"xiaotaozi-dsh","protocol":"xiaotaozi-dsh.identity.v1","profile":"web","ready":true,"instanceToken":"{foreign}"}}"#
        );
        assert!(valid_owned_identity_payload(owned_body.as_bytes(), &owned,));
        assert!(!valid_owned_identity_payload(
            foreign_body.as_bytes(),
            &owned,
        ));
        for invalid in [
            br#"{"product":"other","protocol":"xiaotaozi-dsh.identity.v1","profile":"web","ready":true}"#.as_slice(),
            br#"{"product":"xiaotaozi-dsh","protocol":"v2","profile":"web","ready":true}"#.as_slice(),
            br#"{"product":"xiaotaozi-dsh","protocol":"xiaotaozi-dsh.identity.v1","profile":"other","ready":true}"#.as_slice(),
            br#"{"product":"xiaotaozi-dsh","protocol":"xiaotaozi-dsh.identity.v1","profile":"web","ready":false}"#.as_slice(),
            br#"not json"#.as_slice(),
        ] {
            assert!(!valid_owned_identity_payload(invalid, &owned));
        }
    }

    #[test]
    fn generated_instance_tokens_are_random_256_bit_hex() {
        let first = new_instance_token().unwrap();
        let second = new_instance_token().unwrap();
        assert_eq!(first.len(), 64);
        assert!(first.bytes().all(|byte| byte.is_ascii_hexdigit()));
        assert_ne!(first, second);
    }

    #[test]
    fn common_env_passes_the_exact_instance_token() {
        let token = "ab".repeat(32);
        let mut command = Command::new("/usr/bin/true");
        apply_common_env(&mut command, Path::new("/tmp/dsh-home"), "/usr/bin", &token);
        let configured = command
            .get_envs()
            .find(|(name, _)| *name == std::ffi::OsStr::new(INSTANCE_TOKEN_ENV))
            .and_then(|(_, value)| value);
        assert_eq!(configured, Some(std::ffi::OsStr::new(&token)));
    }

    #[test]
    fn identity_probe_uses_the_versioned_get_endpoint() {
        let owned = "ab".repeat(32);
        let server_token = owned.clone();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0_u8; 2048];
            let size = stream.read(&mut request).unwrap();
            let request = String::from_utf8_lossy(&request[..size]);
            assert!(request.starts_with(&format!("GET {IDENTITY_PATH} HTTP/1.1\r\n")));
            let body = format!(
                r#"{{"product":"xiaotaozi-dsh","protocol":"xiaotaozi-dsh.identity.v1","profile":"web","ready":true,"instanceToken":"{server_token}"}}"#
            );
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: application/json; charset=utf-8\r\nCache-Control: no-store\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            )
            .unwrap();
            stream.write_all(body.as_bytes()).unwrap();
        });
        assert!(identity_ready_at(port, &owned));
        server.join().unwrap();
    }

    #[test]
    fn arbitrary_http_listener_is_not_a_dsh_identity() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = std::thread::spawn(move || {
            let (mut request, _) = listener.accept().unwrap();
            let mut bytes = [0_u8; 1024];
            let _ = request.read(&mut bytes);
            let body = b"{}";
            write!(
                request,
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            )
            .unwrap();
            request.write_all(body).unwrap();
            // probe_service_at performs a second, TCP-only occupancy check
            // after the invalid identity response.
            let _ = listener.accept().unwrap();
        });
        assert_eq!(
            probe_service_at(port, &"ab".repeat(32)),
            ServiceProbe::UnknownListener
        );
        server.join().unwrap();
    }

    #[test]
    fn static_identity_without_owned_child_is_only_port_occupancy() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = std::thread::spawn(move || {
            let _ = listener.accept().unwrap();
        });
        let engine = Engine {
            lifecycle: Mutex::new(()),
            child: Mutex::new(None),
            started_by_us: Mutex::new(true),
            instance_token: Mutex::new(Some("ab".repeat(32))),
            phase: Mutex::new(EnginePhase::Ready),
            update_running: AtomicBool::new(false),
            #[cfg(windows)]
            job: Mutex::new(None),
        };
        assert_eq!(
            probe_owned_service_at(&engine, port),
            ServiceProbe::UnknownListener
        );
        server.join().unwrap();
    }

    #[test]
    fn already_exited_child_is_reaped_without_signalling() {
        let mut child = Command::new("true").spawn().unwrap();
        child.wait().unwrap();
        assert_eq!(
            stop_child_process_group(child),
            ChildStopOutcome::AlreadyExited
        );
    }

    #[test]
    fn disown_reaps_child_and_clears_ownership() {
        let engine = Engine {
            lifecycle: Mutex::new(()),
            child: Mutex::new(None),
            started_by_us: Mutex::new(true),
            instance_token: Mutex::new(Some("ab".repeat(32))),
            phase: Mutex::new(EnginePhase::Booting),
            update_running: AtomicBool::new(false),
            #[cfg(windows)]
            job: Mutex::new(None),
        };
        let mut child = if cfg!(windows) {
            Command::new("cmd").args(["/C", "exit 0"]).spawn()
        } else {
            Command::new("true").spawn()
        }
        .unwrap();
        child.wait().unwrap();
        *engine.child.lock().unwrap() = Some(child);
        disown_exited_child(&engine);
        assert!(engine.child.lock().unwrap().is_none());
        assert!(!*engine.started_by_us.lock().unwrap());
        assert!(engine.instance_token.lock().unwrap().is_none());
    }

    #[test]
    fn disown_preserves_a_still_running_child() {
        let engine = Engine {
            lifecycle: Mutex::new(()),
            child: Mutex::new(None),
            started_by_us: Mutex::new(true),
            instance_token: Mutex::new(Some("ab".repeat(32))),
            phase: Mutex::new(EnginePhase::Booting),
            update_running: AtomicBool::new(false),
            #[cfg(windows)]
            job: Mutex::new(None),
        };
        let child = Command::new("sleep").arg("10").spawn().unwrap();
        *engine.child.lock().unwrap() = Some(child);
        disown_exited_child(&engine);
        assert!(engine.child.lock().unwrap().is_some());
        assert!(*engine.started_by_us.lock().unwrap());
        assert!(engine.instance_token.lock().unwrap().is_some());

        let mut child = engine.child.lock().unwrap().take().unwrap();
        child.kill().unwrap();
        child.wait().unwrap();
    }

    #[test]
    fn overlay_replaces_managed_plugins_without_touching_custom_dependencies() {
        let dir = tempdir().unwrap();
        let src = dir.path().join("src");
        let dest = dir.path().join("dest");
        std::fs::create_dir_all(src.join("vendor")).unwrap();
        std::fs::create_dir_all(src.join("node_modules/dsh-new")).unwrap();
        std::fs::create_dir_all(dest.join("vendor")).unwrap();
        std::fs::create_dir_all(dest.join("node_modules/dsh-old")).unwrap();
        std::fs::write(src.join("vendor/dsh-new.tgz"), "new").unwrap();
        std::fs::write(dest.join("vendor/dsh-old.tgz"), "old").unwrap();
        std::fs::write(
            src.join("package.json"),
            r#"{"dependencies":{"dsh-new":"file:./vendor/dsh-new.tgz"}}"#,
        )
        .unwrap();
        std::fs::write(
            dest.join("package.json"),
            r#"{
              "dependencies": {
                "dsh-old": "file:./vendor/dsh-old.tgz",
                "custom-plugin": "github:user/custom"
              },
              "dsh": {"profile":{"bundles":["dsh-old","custom-plugin"]}}
            }"#,
        )
        .unwrap();

        overlay_plugin_tree(&src, &dest, true).unwrap();

        let package: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(dest.join("package.json")).unwrap())
                .unwrap();
        let dependencies = package["dependencies"].as_object().unwrap();
        assert!(!dependencies.contains_key("dsh-old"));
        assert!(dependencies.contains_key("dsh-new"));
        assert!(dependencies.contains_key("custom-plugin"));
        assert!(!dest.join("node_modules/dsh-old").exists());
        assert!(!dest.join("vendor/dsh-old.tgz").exists());
    }
}
