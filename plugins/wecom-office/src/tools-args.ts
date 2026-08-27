import { OfficeError } from "./errors.ts";
import type { OfficeToolName } from "./names.ts";

export interface ToolSpec {
  name: OfficeToolName;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  buildJson: (args: Record<string, unknown>) => Record<string, unknown>;
}

export function stringArg(args: Record<string, unknown>, key: string): string | undefined {
  return typeof args[key] === "string" && args[key].trim() ? args[key].trim() : undefined;
}

export function stringArray(args: Record<string, unknown>, key: string): string[] | undefined {
  const raw = args[key];
  if (typeof raw === "string" && raw.trim()) return [raw.trim()];
  if (!Array.isArray(raw)) return undefined;
  const values = raw.filter((item): item is string => typeof item === "string" && item.trim() !== "").map((item) => item.trim());
  return values.length > 0 ? values : undefined;
}

export function intArg(args: Record<string, unknown>, key: string): number | undefined {
  const raw = args[key];
  if (typeof raw === "number" && Number.isInteger(raw)) return raw;
  if (typeof raw === "string" && /^-?\d+$/u.test(raw.trim())) return Number(raw.trim());
  return undefined;
}

export function boolArg(args: Record<string, unknown>, key: string): boolean | undefined {
  const raw = args[key];
  if (typeof raw === "boolean") return raw;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return undefined;
}

export function parsedJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function jsonObject(args: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = parsedJson(args[key]);
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return value as Record<string, unknown>;
  return undefined;
}

export function jsonArray(args: Record<string, unknown>, key: string): unknown[] | undefined {
  const value = parsedJson(args[key]);
  return Array.isArray(value) ? value : undefined;
}

export function requireString(args: Record<string, unknown>, key: string, tool: string): string {
  const value = stringArg(args, key);
  if (!value) throw new OfficeError("invalid-args", `${tool} 需要 ${key}。`);
  return value;
}

export function requireArray(args: Record<string, unknown>, key: string, tool: string): unknown[] {
  const value = jsonArray(args, key) ?? stringArray(args, key);
  if (!value || value.length === 0) throw new OfficeError("invalid-args", `${tool} 需要 ${key}。`);
  return value;
}

export function optionalJson(args: Record<string, unknown>): Record<string, unknown> {
  const json: Record<string, unknown> = {};
  const assign = (key: string, value: unknown) => {
    if (value !== undefined) json[key] = value;
  };
  for (const key of Object.keys(args)) {
    if (key === "service" || key === "method" || key === "json") continue;
    assign(key, parsedJson(args[key]));
  }
  return json;
}

export function mergeOptional(
  json: Record<string, unknown>,
  args: Record<string, unknown>,
  strings: readonly string[] = [],
  arrays: readonly string[] = [],
  objects: readonly string[] = [],
  ints: readonly string[] = [],
  bools: readonly string[] = [],
): Record<string, unknown> {
  for (const key of strings) {
    const value = stringArg(args, key);
    if (value) json[key] = value;
  }
  for (const key of arrays) {
    const value = jsonArray(args, key) ?? stringArray(args, key);
    if (value) json[key] = value;
  }
  for (const key of objects) {
    const value = jsonObject(args, key);
    if (value) json[key] = value;
  }
  for (const key of ints) {
    const value = intArg(args, key);
    if (value !== undefined) json[key] = value;
  }
  for (const key of bools) {
    const value = boolArg(args, key);
    if (value !== undefined) json[key] = value;
  }
  return json;
}
