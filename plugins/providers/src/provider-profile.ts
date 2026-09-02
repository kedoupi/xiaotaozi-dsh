export function getPath(value: unknown, path: readonly string[]): Record<string, unknown> | undefined {
  let current = value;
  for (const key of path) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  if (typeof current !== "object" || current === null) return undefined;
  return current as Record<string, unknown>;
}

export function keyRef(provider: string, profile: unknown): string {
  if (typeof profile === "object" && profile !== null) {
    const named = (profile as { apiKeyEnv?: unknown }).apiKeyEnv;
    if (typeof named === "string" && named.length > 0) return named;
  }
  return `${provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`;
}

/** `undefined` means every advertised model is on; `[]` means the user turned them all off. */
export function pickedIds(profile: unknown): string[] | undefined {
  if (typeof profile !== "object" || profile === null) return undefined;
  const models = (profile as { models?: unknown }).models;
  if (!Array.isArray(models)) return undefined;
  if (models.length === 0) return [];
  const ids = models.flatMap((entry) => {
    if (typeof entry === "object" && entry !== null && typeof (entry as { id?: unknown }).id === "string") {
      return [(entry as { id: string }).id];
    }
    return [];
  });
  return ids.length === 0 ? undefined : ids;
}
