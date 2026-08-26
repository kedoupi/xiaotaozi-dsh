/** Open an auth/docs URL. Browser: `window.open`. Desktop shell intercepts that into the OS browser. */
export function openExternalUrl(url: string, open = defaultOpen): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  // Only web URLs may leave the app; javascript:, data:, file: etc. must never reach window.open.
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const path = parsed.pathname;
  if (path.includes("/oauth2/authorize") || path.includes("/oauth/authorize")) {
    // Mirror the post-build check in providers/grok.ts buildAuthorizeUrl:
    // an authorize URL without response_type=code and a non-empty client_id is broken.
    const clientId = parsed.searchParams.get("client_id");
    if (parsed.searchParams.get("response_type") !== "code" || clientId === null || clientId.length === 0) {
      return false;
    }
  }
  const opened = open(url, "_blank", "noopener,noreferrer");
  return opened !== null;
}

function defaultOpen(url: string, target: string, features: string): Window | null {
  return window.open(url, target, features);
}
