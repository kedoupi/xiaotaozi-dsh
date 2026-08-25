/**
 * Git path installs are not the upstream npm package. The Plugin info card
 * used to hit registry.npmjs.org/dsh-context/latest and offer an upgrade to
 * bowenliang123's npm — that would send users off our fork.
 */

/** Always absent: no upgrade hint on a catalog fork. */
export function fetchLatestVersion(): Promise<string | null> {
  return Promise.resolve(null)
}

/** Numeric semver compare (pre-release suffix ignored): is `latest` strictly newer than `current`? */
export function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string): number[] =>
    v.replace(/^v/, '').split('-', 1)[0].split('.').map((n) => parseInt(n, 10) || 0)
  const a = parse(latest)
  const b = parse(current)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0
    const y = b[i] || 0
    if (x !== y) return x > y
  }
  return false
}
