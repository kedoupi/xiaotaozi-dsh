export function fmt(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/gu, (_, key: string) => String(vars[key] ?? ""));
}
