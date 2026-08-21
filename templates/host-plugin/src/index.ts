import type { Context } from "@deepseek-ai/cordis";
import Schema from "@deepseek-ai/schemastery";
import { greet } from "./greet.ts";

export { greet } from "./greet.ts";

export const name = "__ID__";
export const inject = ["tools"];

export interface Config {
  greeting: string;
}

export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default("Hello"),
});

/**
 * Register a plain tool object. Do not value-import `@deepseek-ai/dsh-tools`:
 * that package's peers come from the running harness, not this repo.
 */
type ToolHost = Context & {
  tools: {
    register(tool: {
      name: string;
      description: string;
      parameters: {
        type: "object";
        properties: { who: { type: "string"; description: string } };
        required: ["who"];
      };
      output: {
        schema: { type: "string" };
        render: (args: { who: string }, value: string) => Array<{ type: "text"; text: string }>;
      };
      execute: (args: { who: string }) => Promise<string>;
    }): void;
  };
};

export function apply(ctx: ToolHost, config: Config) {
  ctx.tools.register({
    name: "__ID__",
    description: "Greet someone by name.",
    parameters: {
      type: "object",
      properties: {
        who: { type: "string", description: "Name to greet" },
      },
      required: ["who"],
    },
    output: {
      schema: { type: "string" },
      render: (_args, value) => [{ type: "text", text: value }],
    },
    async execute({ who }) {
      return greet(who, config.greeting);
    },
  });
}
