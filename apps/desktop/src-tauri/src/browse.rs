use std::time::Duration;

use tauri::Url;

use super::PORT;

const DEV_UI_PORT: u16 = 1420;

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

pub fn is_loopback_http(url: &Url) -> bool {
    if url.scheme() != "http" && url.scheme() != "https" {
        return false;
    }
    matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "::1"))
}

/// OAuth loopback (`127.0.0.1:56121/callback`, Codex 1455/1457, Claude ephemeral).
/// Hit the local callback server without leaving the DSH page or bouncing through Safari.
pub fn deliver_loopback(url: &Url) -> bool {
    if stays_in_shell(url) || !is_loopback_http(url) {
        return false;
    }
    let href = url.as_str().to_string();
    std::thread::spawn(move || {
        let _ = ureq::get(&href).timeout(Duration::from_secs(8)).call();
    });
    true
}

/// Authorize pages / docs: system default browser. Loopback callbacks are not this.
pub fn open_in_system_browser(url: &Url) -> bool {
    if stays_in_shell(url) || is_loopback_http(url) {
        return false;
    }
    if !matches!(url.scheme(), "http" | "https") {
        return false;
    }
    open::that_detached(url.as_str()).is_ok()
}

/// Handle a webview navigation or `window.open`. Returns whether the webview should load `url`.
pub fn handle_external(url: &Url) -> bool {
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
        assert!(stays_in_shell(&parse("http://127.0.0.1:3080/")));
        assert!(stays_in_shell(&parse("http://127.0.0.1:3080/settings")));
        assert!(stays_in_shell(&parse("http://localhost:1420/")));
        assert!(stays_in_shell(&parse("tauri://localhost/index.html")));
        assert!(stays_in_shell(&parse("https://tauri.localhost/index.html")));
    }

    #[test]
    fn oauth_and_docs_leave_the_shell() {
        assert!(!stays_in_shell(&parse("https://accounts.x.ai/authorize")));
        assert!(!stays_in_shell(&parse("https://auth.openai.com/log-in")));
        assert!(!stays_in_shell(&parse("https://github.com/kedoupi/xiaotaozi-dsh")));
        assert!(!stays_in_shell(&parse("http://127.0.0.1:3081/")));
    }

    #[test]
    fn oauth_loopback_is_local_not_safari() {
        assert!(is_loopback_http(&parse("http://127.0.0.1:56121/callback?code=abc")));
        assert!(is_loopback_http(&parse("http://localhost:1455/auth/callback")));
        assert!(is_loopback_http(&parse("http://127.0.0.1:56121/callback")));
        assert!(!is_loopback_http(&parse("https://auth.x.ai/callback")));
        assert!(deliver_loopback(&parse("http://127.0.0.1:56121/callback?code=x&state=y")));
        assert!(!deliver_loopback(&parse("http://127.0.0.1:3080/")));
        assert!(!open_in_system_browser(&parse("http://127.0.0.1:56121/callback?code=x")));
        assert!(!handle_external(&parse("http://127.0.0.1:56121/callback?code=x")));
        assert!(handle_external(&parse("http://127.0.0.1:3080/")));
        assert!(!handle_external(&parse("https://auth.x.ai/authorize")));
    }
}
