/** Open an auth/docs URL. Browser: `window.open`. Desktop shell intercepts that into the OS browser. */
export function openExternalUrl(url: string, open = defaultOpen): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  const opened = open(url, "_blank", "noopener,noreferrer");
  return opened !== null;
}

function defaultOpen(url: string, target: string, features: string): Window | null {
  return window.open(url, target, features);
}
