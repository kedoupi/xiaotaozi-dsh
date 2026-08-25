use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{atomic::AtomicBool, Mutex};
use std::time::{Duration, Instant};

use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    webview::{NewWindowResponse, PageLoadEvent, WebviewWindowBuilder},
    AppHandle, Manager, Url, WebviewUrl, WebviewWindow,
};
use tauri::utils::config::{BackgroundThrottlingPolicy, Color};

mod browse;
mod pack_update;

const PORT: u16 = 3080;
const OPEN_URL: &str = "http://127.0.0.1:3080/";

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
    child: Mutex<Option<Child>>,
    started_by_us: Mutex<bool>,
    phase: Mutex<EnginePhase>,
    update_running: AtomicBool,
    #[cfg(windows)]
    job: Mutex<Option<WindowsJob>>,
}

pub(crate) fn dsh_home() -> PathBuf {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".into());
    PathBuf::from(home).join(".dsh")
}

fn port_up() -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], PORT));
    TcpStream::connect_timeout(&addr, Duration::from_millis(150)).is_ok()
}

fn http_request_up(method: &str) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], PORT));
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(200)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(200)));
    let request = format!("{method} / HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n");
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    // A single read may legally return fewer than the 5 bytes of "HTTP/";
    // keep reading until we have enough, hit EOF, or time out.
    let mut buf = [0u8; 16];
    let mut filled = 0;
    while filled < 5 {
        match stream.read(&mut buf[filled..]) {
            Ok(0) => break,
            Ok(n) => filled += n,
            Err(_) => return false,
        }
    }
    buf[..filled].starts_with(b"HTTP/")
}

fn http_up() -> bool {
    http_request_up("HEAD") || http_request_up("GET")
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
    Err("找不到 dsh。开发时请安装 @deepseek-ai/dsh@0.1.1-rc.2；小白安装包必须内置 Node。".into())
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

fn apply_common_env(cmd: &mut Command, home: &Path, path: &str) {
    // Harness skill-filesystem scans $DSH_AGENTS_HOME/skills (default ~/.agents).
    // Point it at the DSH home so Grok/Codex/Claude skills on this machine
    // are not visible inside 小桃子DSH.
    cmd.env("DSH_HOME", home)
        .env("DSH_AGENTS_HOME", home.join("agents"))
        .env("PATH", path)
        .env("PYTHONUTF8", "1")
        .env("PIP_INDEX_URL", "https://pypi.tuna.tsinghua.edu.cn/simple")
        .env("PIP_TRUSTED_HOST", "pypi.tuna.tsinghua.edu.cn")
        .args([
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

fn spawn_engine_inner(app: &AppHandle, state: &Engine, seed: bool) -> Result<(), String> {
    if http_up() {
        *state.started_by_us.lock().unwrap() = false;
        return Ok(());
    }
    if port_up() {
        return Err("端口被占用".into());
    }

    if seed {
        set_splash(app, "正在准备…");
        seed_profile(app)?;
    }

    let home = dsh_home();
    std::fs::create_dir_all(&home).map_err(|e| e.to_string())?;
    let launch = resolve_launch(app)?;

    let mut cmd = match launch {
        Launch::Bundled { node, bin_js, path } => {
            let mut cmd = Command::new(&node);
            cmd.arg(&bin_js);
            apply_common_env(&mut cmd, &home, &path);
            cmd
        }
        Launch::PathDsh { dsh, path } => {
            let mut cmd = Command::new(&dsh);
            apply_common_env(&mut cmd, &home, &path);
            cmd
        }
    };
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
    *state.started_by_us.lock().unwrap() = true;
    Ok(())
}

fn wait_until_up(timeout: Duration) -> bool {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if http_up() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(120));
    }
    false
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
    let _ = app.run_on_main_thread(move || {
        if let Some(win) = handle.get_webview_window("main") {
            if on_dsh(&win) && port_up() {
                show_window(&win);
                return;
            }
            if http_up() {
                open_shell_on_main(&win);
                return;
            }
        } else if http_up() {
            open_shell(&handle);
            return;
        }
        boot(handle);
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
        let profile = dsh_home().join("profiles").join("web");
        if let Err(err) = pack_update::recover_profile_transaction(&profile) {
            *app.state::<Engine>().phase.lock().unwrap() = EnginePhase::Failed;
            set_splash(&app, &err);
            return;
        }
        if http_up() {
            *app.state::<Engine>().phase.lock().unwrap() = EnginePhase::Ready;
            open_shell(&app);
            pack_update::schedule(app);
            return;
        }
        set_splash(&app, "正在启动…");
        let state = app.state::<Engine>();
        if let Err(err) = spawn_engine(&app, &state) {
            *state.phase.lock().unwrap() = EnginePhase::Failed;
            set_splash(&app, &err);
            return;
        }
        if !wait_until_up(Duration::from_secs(90)) {
            stop_if_ours(&app);
            *state.phase.lock().unwrap() = EnginePhase::Failed;
            set_splash(&app, "没能启动。");
            return;
        }
        *state.phase.lock().unwrap() = EnginePhase::Ready;
        open_shell(&app);
        pack_update::schedule(app);
    });
}

fn stop_if_ours(app: &AppHandle) {
    let state = app.state::<Engine>();
    {
        let mut phase = state.phase.lock().unwrap();
        if *phase != EnginePhase::Updating {
            *phase = EnginePhase::Stopping;
        }
    }
    let ours = std::mem::take(&mut *state.started_by_us.lock().unwrap());
    let child = state.child.lock().unwrap().take();
    if ours {
        if let Some(mut child) = child {
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
            }
            let _ = child.kill();
            let _ = child.wait();
        }
    }
    #[cfg(windows)]
    {
        state.job.lock().unwrap().take();
    }
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
            child: Mutex::new(None),
            started_by_us: Mutex::new(false),
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
                .on_navigation(|url| browse::handle_external(url))
                .on_new_window(|url, _features| {
                    let _ = browse::handle_external(&url);
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
    use tempfile::tempdir;

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
