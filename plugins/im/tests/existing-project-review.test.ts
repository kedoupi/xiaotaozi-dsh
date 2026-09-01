// @ts-nocheck
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "vitest";

import { BotWorkspaceStore } from "../src/channels/shared/bot-workspace-store.ts";
import { HarnessClient } from "../src/channels/shared/harness-client.ts";
import { setImHostLanguage, t } from "../src/channels/shared/i18n.ts";
import { validWorkspacePayload } from "../src/host/channels/shared/workspace-rpc.ts";

afterEach(() => setImHostLanguage("zh"));

test("title-less Host projects use a non-path display title", async () => {
  const client = new HarnessClient({
    baseUrl: "http://127.0.0.1:3080",
    workspace: "/tmp/default-workspace",
  });
  client.ensureRunning = async () => true;
  client.rpc = async () => ({
    items: [
      { workspaceId: "project-a", title: "", path: "/private/project-a", sessionIds: [] },
      { workspaceId: "project-b", title: "   ", path: "/private/project-b", sessionIds: [] },
      { workspaceId: "project-c", title: "  Project C  ", path: "/private/project-c", sessionIds: [] },
    ],
    archivedSessionIds: [],
  });

  assert.deepEqual(await client.listProjects(), [
    { workspaceId: "project-a", title: "未命名项目", path: "/private/project-a" },
    { workspaceId: "project-b", title: "未命名项目", path: "/private/project-b" },
    { workspaceId: "project-c", title: "Project C", path: "/private/project-c" },
  ]);
});

test("a malformed selected Host project preserves its binding and sessions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dsh-im-project-snapshot-"));
  try {
    const client = new HarnessClient({
      baseUrl: "http://127.0.0.1:3080",
      workspace: "/tmp/default-workspace",
    });
    client.ensureRunning = async () => true;
    let response = {
      items: [{ workspaceId: "project-a", title: "Alpha", path: "/private/project-a" }],
      archivedSessionIds: [],
    };
    client.rpc = async () => response;

    const store = await new BotWorkspaceStore(join(directory, "workspaces.json")).load();
    store.setProjectCatalog(() => client.listProjects());
    await store.ensure("bot-a");
    await store.setProject("bot-a", "project-a");
    const sessions = { direct: "session-a" };
    const clearSessions = async () => {
      for (const key of Object.keys(sessions)) delete sessions[key];
    };

    response = {
      items: [{ workspaceId: "project-a", title: "Alpha", path: "relative/project-a" }],
      archivedSessionIds: [],
    };
    await assert.rejects(client.listProjects(), { code: "workspace-catalog-unavailable" });
    await assert.rejects(store.reconcileProjects({ clearSessions }), {
      code: "workspace-catalog-unavailable",
    });
    assert.equal(store.projectFor("bot-a").workspaceId, "project-a");
    assert.deepEqual(sessions, { direct: "session-a" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("public workspace payload rejects coerced bot ids", () => {
  assert.equal(validWorkspacePayload({ botId: 123, workspaceId: "project-a" }), false);
});

test("English runtime project help maps the active source strings", () => {
  setImHostLanguage("en");
  assert.equal(
    t("/workspace  按列表序号或唯一项目名切换项目"),
    "/workspace  Switch projects by list number or unique project title",
  );
  assert.equal(
    t("/workspacelist  列出 Web 中已创建的项目"),
    "/workspacelist  List projects created in Web",
  );
  assert.equal(
    t("/sessionlist  列出当前项目的会话；可带项目序号"),
    "/sessionlist  List sessions in the current project; accepts a project number",
  );
  assert.equal(
    t("/session Session ID 或当前项目会话序号  将当前聊天绑定到指定会话"),
    "/session <Session ID or current project session index>  Bind this chat to the specified session",
  );
  assert.equal(t("未命名项目"), "Untitled project");
});
