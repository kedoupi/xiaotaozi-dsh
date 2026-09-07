/** Nested MarkdownText labels required since DSH 0.1.2 (A1-29). */
export type MarkdownCopyLabels = { copyLabel: string; copiedLabel: string };

const cache = new Map<string, { labels: { code: MarkdownCopyLabels; footnotes: string } }>();

/** Stable-per-locale labels object so streaming markdown caches stay valid. */
export function markdownTextProps(code: MarkdownCopyLabels) {
  const key = `${code.copyLabel}\0${code.copiedLabel}`;
  const existing = cache.get(key);
  if (existing !== undefined) return existing;
  const props = { labels: { code, footnotes: "" } };
  cache.set(key, props);
  return props;
}
