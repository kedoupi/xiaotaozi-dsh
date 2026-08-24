import { expect, it } from "vitest";
import { defineTool } from "../src/tool-define.ts";

it("lifts property-level required: true into the JSON Schema required array", () => {
  const tool = defineTool({
    name: "agent_teams_create",
    description: "create a team",
    parameters: {
      name: { type: "string", required: true },
      description: { type: "string" },
    },
    execute: () => undefined,
  });
  expect(tool.parameters).toEqual({
    type: "object",
    properties: {
      name: { type: "string" },
      description: { type: "string" },
    },
    required: ["name"],
  });
});

it("keeps an already-object schema and nested required flags", () => {
  const tool = defineTool({
    name: "agent_teams_update_task",
    description: "update a task",
    parameters: {
      type: "object",
      properties: {
        task_id: { type: "string", required: true },
        output: {
          type: "object",
          properties: {
            text: { type: "string", required: true },
          },
        },
      },
    },
    execute: () => undefined,
  });
  expect(tool.parameters).toEqual({
    type: "object",
    properties: {
      task_id: { type: "string" },
      output: {
        type: "object",
        properties: {
          text: { type: "string" },
        },
        required: ["text"],
      },
    },
    required: ["task_id"],
  });
});
