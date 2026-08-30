/** Session ids must be a single path segment under `$DSH_HOME/sessions/<ws>/`. */
export function isSafeSessionId(id: string): boolean {
  return id !== "." && id.length > 0 && id.length < 256 && !/[\\/]/.test(id) && !id.includes("..");
}

/** Encode a session id the way DSH names on-disk directories. */
export function encodeSegment(raw: string): string {
  if (raw.length === 0) return "";
  if (raw === ".") return "~002E";
  if (raw === "..") return "~002E~002E";
  let out = "";
  for (let index = 0; index < raw.length; index += 1) {
    const ch = raw[index]!;
    if (ch !== "~" && /^[A-Za-z0-9._-]$/u.test(ch)) out += ch;
    else out += `~${raw.charCodeAt(index).toString(16).toUpperCase().padStart(4, "0")}`;
  }
  return out;
}
