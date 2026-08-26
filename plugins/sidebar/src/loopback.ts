function isIpv4LoopbackAddress(address: string): boolean {
  const parts = address.split(".");
  return parts.length === 4
    && parts[0] === "127"
    && parts.every((part) => /^\d{1,3}$/u.test(part) && Number(part) <= 255);
}

export function isLoopbackRemoteAddress(address: string | undefined): boolean {
  if (address === undefined) return false;
  const normalized = address.toLowerCase().split("%", 1)[0]!;
  if (normalized === "::1" || isIpv4LoopbackAddress(normalized)) return true;
  if (!normalized.startsWith("::ffff:")) return false;
  const mapped = normalized.slice("::ffff:".length);
  if (isIpv4LoopbackAddress(mapped)) return true;
  const hexadecimal = /^([a-f0-9]{1,4}):([a-f0-9]{1,4})$/u.exec(mapped);
  return hexadecimal !== null && (Number.parseInt(hexadecimal[1]!, 16) >>> 8) === 127;
}
