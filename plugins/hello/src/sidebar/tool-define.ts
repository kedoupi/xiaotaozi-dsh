import type { Agent } from "@deepseek-ai/dsh-agent";

/** Local stand-in for the harness execute context. Do not import @deepseek-ai/dsh-tools. */
export interface ToolRunContext {
  agent?: Agent;
  signal: AbortSignal;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Lift `{ type, required: true }` on properties into a JSON Schema `required` array. */
function stripRequired(schema: unknown): unknown {
  if (!isRecord(schema)) return schema;
  if (!isRecord(schema.properties)) return schema;
  const properties: Record<string, unknown> = {};
  const required: string[] = Array.isArray(schema.required) ? schema.required.map(String) : [];
  for (const [key, raw] of Object.entries(schema.properties)) {
    const prop = isRecord(raw) ? { ...raw } : raw;
    if (isRecord(prop) && prop.required === true) {
      if (!required.includes(key)) required.push(key);
      delete prop.required;
    }
    properties[key] = stripRequired(prop);
  }
  const next: Record<string, unknown> = { ...schema, properties };
  if (required.length > 0) next.required = required;
  else delete next.required;
  return next;
}

function parametersToSchema(parameters: unknown): unknown {
  if (parameters === undefined || parameters === null) {
    return { type: "object", properties: {} };
  }
  if (isRecord(parameters) && parameters.type === "object") {
    return stripRequired(parameters);
  }
  if (!isRecord(parameters)) return { type: "object", properties: {} };
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [key, raw] of Object.entries(parameters)) {
    const prop = isRecord(raw) ? { ...raw } : raw;
    if (isRecord(prop) && prop.required === true) {
      required.push(key);
      delete prop.required;
    }
    properties[key] = stripRequired(prop);
  }
  return { type: "object", properties, ...required.length > 0 ? { required } : {} };
}

/** Plain tool object plus JSON Schema conversion so we do not import dsh-tools. */
export function defineTool(tool: {
  name: string;
  description: string;
  parameters?: unknown;
  output?: {
    schema?: unknown;
    render?: (args: any, value: any) => unknown;
  };
  execute: (args: any, exec: ToolRunContext) => unknown;
}): typeof tool {
  return {
    ...tool,
    parameters: parametersToSchema(tool.parameters),
    ...tool.output === undefined
      ? {}
      : {
          output: {
            ...tool.output,
            ...tool.output.schema === undefined ? {} : { schema: stripRequired(tool.output.schema) },
          },
        },
  };
}
