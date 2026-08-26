use std::time::Duration;

use tauri::Url;

use super::PORT;

const DEV_UI_PORT: u16 = 1420;
/// Providers' callback servers always bind explicit unprivileged ports
/// (56121, 1455/1457, or OS-ephemeral); well-known ports are never callbacks.
const MIN_CALLBACK_PORT: u16 = 1024;

/// Navigations that stay in the Tauri shell (splash + DSH Web).
pub fn stays_in_shell(url: &Url) -> bool {
    match url.scheme() {
        "tauri" => true,
        "https" if url.host_str() == Some("tauri.localhost") => true,
        "http" | "https" => match url.host_str() {
            Some("127.0.0.1") if url.port() == Some(PORT) => true,
            Some("localhost") if url.port() == Some(DEV_UI_PORT) => true,
            _ => false,
        },
        _ => false,
    }
}

/// `127.0.0.1` / `localhost` / `::1` are one and the same loopback here.
/// `url::Host` is used instead of `host_str()` because the latter keeps the
/// brackets on IPv6 (`"[::1]"`), which a string match would silently miss.
pub fn is_loopback_http(url: &Url) -> bool {
    if url.scheme() != "http" && url.scheme() != "https" {
        return false;
    }
    match url.host() {
        Some(url::Host::Domain(domain)) => domain.eq_ignore_ascii_case("localhost"),
        Some(url::Host::Ipv4(ip)) => ip.is_loopback(),
        Some(url::Host::Ipv6(ip)) => ip.is_loopback(),
        None => false,
    }
}

/// OAuth loopback callback whitelist. Real shapes from `plugins/providers`:
/// grok `http://127.0.0.1:56121/callback`, codex
/// `http://localhost:1455|1457/auth/callback`, claude
/// `http://localhost:<ephemeral>/callback` (`listen.ports: [0]`), and the
/// flow engine matches `callbackPath` exactly — so the path must be exactly
/// `/callback` or `/auth/callback` (query allowed). `127.0.0.1` / `localhost`
/// / `::1` are treated alike; the port must be explicit, unprivileged, and
/// never a harness port (3080 official, 3081 sandbox, 1420 Vite) on any
/// loopback alias.
pub fn is_oauth_loopback_callback(url: &Url) -> bool {
    if url.scheme() != "http" || !is_loopback_http(url) {
        return false;
    }
    let Some(port) = url.port() else {
        return false;
    };
    if port == super::OFFICIAL_PORT
        || port == super::SANDBOX_PORT
        || port == DEV_UI_PORT
        || port < MIN_CALLBACK_PORT
    {
        return false;
    }
    matches!(url.path(), "/callback" | "/auth/callback")
}

/// OAuth loopback (`127.0.0.1:56121/callback`, Codex 1455/1457, Claude ephemeral).
/// Hit the local callback server without leaving the DSH page or bouncing
/// through Safari. Only whitelisted callback URLs are delivered — an XSS'd
/// DSH page must not be able to GET arbitrary local ports through the shell.
pub fn deliver_loopback(url: &Url) -> bool {
    if stays_in_shell(url) || !is_oauth_loopback_callback(url) {
        return false;
    }
    let href = url.as_str().to_string();
    std::thread::spawn(move || {
        let _ = ureq::get(&href).timeout(Duration::from_secs(8)).call();
    });
    true
}

fn is_oauth_authorize(url: &Url) -> bool {
    let path = url.path();
    path.contains("/oauth2/authorize") || path.contains("/oauth/authorize")
}

fn oauth_authorize_has_code(url: &Url) -> bool {
    url.query_pairs()
        .any(|(key, value)| key == "response_type" && value == "code")
}

/// Authorize pages / docs: system default browser. Loopback callbacks are not this.
/// Incomplete OAuth authorize URLs (missing `response_type=code`) must not be
/// opened — xAI answers those with "仅支持 response_type=code".
pub fn should_open_in_system_browser(url: &Url) -> bool {
    if stays_in_shell(url) || is_loopback_http(url) {
        return false;
    }
    if !matches!(url.scheme(), "http" | "https") {
        return false;
    }
    if is_oauth_authorize(url) && !oauth_authorize_has_code(url) {
        return false;
    }
    true
}

fn try_open_detached(url: &str) -> bool {
    #[cfg(test)]
    {
        let _ = url;
        true
    }
    #[cfg(not(test))]
    {
        open::that_detached(url).is_ok()
    }
}

pub fn open_in_system_browser(url: &Url) -> bool {
    if !should_open_in_system_browser(url) {
        return false;
    }
    try_open_detached(url.as_str())
}

/// Main-window navigations: only splash + DSH stay. Do not open the OS browser
/// here — a subframe or SPA redirect to an authorize host would otherwise pop
/// Chrome on every launch.
pub fn allow_navigation(url: &Url) -> bool {
    stays_in_shell(url)
}

/// `window.open` / `target=_blank`: loopback GET in-process, https to the OS browser.
pub fn handle_new_window(url: &Url) -> bool {
    if stays_in_shell(url) {
        return true;
    }
    if deliver_loopback(url) {
        return false;
    }
    let _ = open_in_system_browser(url);
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(raw: &str) -> Url {
        Url::parse(raw).unwrap()
    }

    #[test]
    fn dsh_and_splash_stay_in_shell() {
        let dsh = format!("http://127.0.0.1:{PORT}/");
        assert!(stays_in_shell(&parse(&dsh)));
        assert!(stays_in_shell(&parse(&format!(
            "http://127.0.0.1:{PORT}/settings"
        ))));
        assert!(stays_in_shell(&parse("http://localhost:1420/")));
        assert!(stays_in_shell(&parse("tauri://localhost/index.html")));
        assert!(stays_in_shell(&parse("https://tauri.localhost/index.html")));
        let other = if cfg!(debug_assertions) { 3080 } else { 3081 };
        assert!(!stays_in_shell(&parse(&format!(
            "http://127.0.0.1:{other}/"
        ))));
    }

    #[test]
    fn oauth_and_docs_leave_the_shell() {
        assert!(!stays_in_shell(&parse("https://accounts.x.ai/authorize")));
        assert!(!stays_in_shell(&parse("https://auth.openai.com/log-in")));
        assert!(!stays_in_shell(&parse(
            "https://github.com/kedoupi/xiaotaozi-dsh"
        )));
        assert!(!stays_in_shell(&parse("http://10.0.0.1:8080/")));
    }

    #[test]
    fn oauth_loopback_is_local_not_safari() {
        assert!(is_loopback_http(&parse(
            "http://127.0.0.1:56121/callback?code=abc"
        )));
        assert!(is_loopback_http(&parse(
            "http://localhost:1455/auth/callback"
        )));
        assert!(is_loopback_http(&parse("http://127.0.0.1:56121/callback")));
        assert!(!is_loopback_http(&parse("https://auth.x.ai/callback")));
        assert!(deliver_loopback(&parse(
            "http://127.0.0.1:56121/callback?code=x&state=y"
        )));
        assert!(!deliver_loopback(&parse(&format!(
            "http://127.0.0.1:{PORT}/"
        ))));
        assert!(!open_in_system_browser(&parse(
            "http://127.0.0.1:56121/callback?code=x"
        )));
        assert!(!handle_new_window(&parse(
            "http://127.0.0.1:56121/callback?code=x"
        )));
        assert!(handle_new_window(&parse(&format!(
            "http://127.0.0.1:{PORT}/"
        ))));
        assert!(!handle_new_window(&parse(
            "https://auth.x.ai/oauth2/authorize?client_id=x"
        )));
        assert!(!allow_navigation(&parse("https://auth.x.ai/authorize")));
        assert!(!allow_navigation(&parse(
            "https://auth.x.ai/oauth2/authorize"
        )));
        assert!(allow_navigation(&parse(&format!(
            "http://127.0.0.1:{PORT}/"
        ))));
    }

    #[test]
    fn callback_whitelist_admits_real_provider_shapes() {
        // grok: fixed port 56121, path /callback.
        assert!(is_oauth_loopback_callback(&parse(
            "http://127.0.0.1:56121/callback?code=x&state=y"
        )));
        // codex: localhost 1455/1457, path /auth/callback.
        assert!(is_oauth_loopback_callback(&parse(
            "http://localhost:1455/auth/callback?code=x&state=y"
        )));
        assert!(is_oauth_loopback_callback(&parse(
            "http://localhost:1457/auth/callback?code=x"
        )));
        // claude: ephemeral port, path /callback; ::1 treated like the others.
        assert!(is_oauth_loopback_callback(&parse(
            "http://localhost:52345/callback?code=x"
        )));
        assert!(is_oauth_loopback_callback(&parse(
            "http://[::1]:52345/callback?code=x"
        )));
        assert!(is_oauth_loopback_callback(&parse(
            "http://127.0.0.1:56121/callback"
        )));
    }

    #[test]
    fn callback_whitelist_blocks_local_ssrf() {
        // Arbitrary local services: path is not a provider callback.
        assert!(!is_oauth_loopback_callback(&parse(
            "http://127.0.0.1:6379/"
        )));
        assert!(!is_oauth_loopback_callback(&parse(
            "http://127.0.0.1:9200/_shutdown"
        )));
        assert!(!is_oauth_loopback_callback(&parse(
            "http://localhost:8080/admin/callback"
        )));
        assert!(!is_oauth_loopback_callback(&parse(
            "http://127.0.0.1:9000/callback/../admin"
        )));
        // Harness ports are excluded on every loopback alias.
        assert!(!is_oauth_loopback_callback(&parse(
            "http://127.0.0.1:3080/callback"
        )));
        assert!(!is_oauth_loopback_callback(&parse(
            "http://localhost:3080/callback"
        )));
        assert!(!is_oauth_loopback_callback(&parse(
            "http://[::1]:3080/callback"
        )));
        assert!(!is_oauth_loopback_callback(&parse(
            "http://127.0.0.1:3081/callback"
        )));
        assert!(!is_oauth_loopback_callback(&parse(
            "http://localhost:3081/callback"
        )));
        assert!(!is_oauth_loopback_callback(&parse(
            "http://[::1]:3081/callback"
        )));
        // Default / privileged ports are never callback servers.
        assert!(!is_oauth_loopback_callback(&parse(
            "http://127.0.0.1/callback"
        )));
        assert!(!is_oauth_loopback_callback(&parse(
            "http://127.0.0.1:631/callback"
        )));
        // Non-http or non-loopback never qualifies.
        assert!(!is_oauth_loopback_callback(&parse(
            "https://127.0.0.1:56121/callback"
        )));
        assert!(!is_oauth_loopback_callback(&parse(
            "http://192.168.1.5:56121/callback"
        )));
        // deliver_loopback drops non-whitelisted loopback URLs without a GET,
        // and handle_new_window neither delivers nor opens a browser for them.
        assert!(!deliver_loopback(&parse("http://127.0.0.1:6379/")));
        assert!(!deliver_loopback(&parse(
            "http://localhost:8080/admin/callback"
        )));
        assert!(!handle_new_window(&parse("http://127.0.0.1:6379/")));
    }

    #[test]
    fn incomplete_oauth_authorize_is_not_opened() {
        let stub = parse("https://auth.x.ai/oauth2/authorize?client_id=x");
        assert!(!should_open_in_system_browser(&stub));
        assert!(!open_in_system_browser(&stub));
        let complete = parse(
            "https://auth.x.ai/oauth2/authorize?response_type=code&client_id=b1a00492-073a-47ea-816f-4c329264a828",
        );
        assert!(should_open_in_system_browser(&complete));
        assert!(should_open_in_system_browser(&parse(
            "https://github.com/kedoupi/xiaotaozi-dsh"
        )));
    }
}
