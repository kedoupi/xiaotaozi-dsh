// Offline RC1 fixture. Domain data/transport are synthetic; slots, renderer,
// Session adapter, ConversationRoot, private InputBar and Lexical are published code.
window.mountComposerFixture = async () => {
  const modules = window.fixtureModules;
  const { Context } = modules["@deepseek-ai/cordis"];
  const React = modules.react;
  const { createSnapshotStore } = modules["@deepseek-ai/dsh-client-store"];
  const ctx = new Context();
  const dictionaries = new Map();
  const revision = createSnapshotStore({ revision: 0 });
  const locale = {
    ...revision,
    register(ns, values) {
      dictionaries.set(ns, values.en);
      return () => dictionaries.delete(ns);
    },
    bind: (ns) => (key) => dictionaries.get(ns)?.[key] ?? key,
  };
  ctx.reflect.provide("locale", locale);
  const list = createSnapshotStore({
    phase: "ready",
    current: undefined,
    byId: {},
  });
  const bindings = new Map();
  const sessions = {
    list,
    binding: (id) => bindings.get(id),
    scope: (id) => bindings.get(id)?.ctx,
    scopeOf: (scope) =>
      [...bindings.values()].find((binding) => binding.ctx === scope)
        ?.sessionId,
    open(id) {
      list.set({ ...list.getSnapshot(), current: id });
    },
  };
  ctx.reflect.provide("sessions", sessions);
  ctx.reflect.provide("settingsScope", { bind: () => undefined });
  ctx.reflect.provide("uiWorkspace", { connectWorkspace: async () => "A" });
  const workspaces = createSnapshotStore({
    phase: "ready",
    items: [
      {
        workspaceId: "fixture",
        title: "Disposable workspace",
        sessionIds: ["A", "B"],
      },
    ],
  });
  const requests = [];
  let hold;
  let mode = "smart";
  const rpc = {
    async call(channel, method, payload) {
      if (channel !== "/providers-auth" || method !== "routing")
        throw new Error("Unexpected fixture RPC");
      requests.push(payload);
      const sessionId = payload.sessionId;
      const value = {
        mode,
        candidateCount: 2,
        attribution: sessionId === undefined ? "historical" : "session",
        sessionId,
        lastSelected: {
          provider: "fixture",
          model: "fixture-model",
          displayName:
            sessionId === undefined
              ? "Historical fixture"
              : `Session ${sessionId}`,
        },
      };
      if (hold)
        return new Promise((resolve) =>
          hold.push(() => resolve({ ok: true, value })),
        );
      return { ok: true, value };
    },
  };
  ctx.reflect.provide("connection", { rpc });
  ctx.reflect.provide("remote", {});
  for (const key of ["remote.credentials", "remote.llm", "remote.settings"])
    ctx.reflect.provide(key, {});
  await ctx.plugin(modules["@deepseek-ai/dsh-client-ui-renderer"]);
  ctx.slots.installLocale(locale);
  ctx.slots.provideRoot({ hooks: { workspaces } });
  await ctx.plugin(modules["@deepseek-ai/dsh-client-ui-session"]);
  // Only the shell is fixture-owned. The real Conversation contribution declares
  // its real composer/input slots; no copied card markup or private exports.
  ctx.slots.register(
    {
      name: "root",
      children: {
        conversation: { kind: "single", scope: "session-maybe" },
        "shell.overlay": { kind: "list", scope: "root" },
      },
    },
    ({ renderSlot }) =>
      React.createElement(
        React.Fragment,
        null,
        renderSlot("conversation", {}),
        renderSlot("shell.overlay", {}),
      ),
  );
  await ctx.plugin(modules["@deepseek-ai/dsh-client-ui-conversation"]);
  for (const id of ["A", "B"]) {
    const session = createSnapshotStore({
      sessionId: id,
      running: false,
      blank: true,
      awaitingFirstTurn: true,
      promptAttempted: false,
      openState: "open",
      subagent: null,
      removed: false,
      promptError: null,
      pendingSubmissions: [],
      queue: [],
      permissions: "use_default",
    });
    session.projections = { faceOf: () => undefined };
    session.command = async () => ({ ok: true, value: { matched: false } });
    // No submission/model/service execution is permitted in this layout fixture.
    session.beginSubmission = () => {
      throw new Error("Unexpected fixture submission");
    };
    bindings.set(id, {
      sessionId: id,
      ctx,
      session,
      eventSource: createSnapshotStore({
        revision: 0,
        entries: [],
        hasMore: false,
        change: { kind: "replace" },
      }),
    });
  }
  for (const [id, order] of [
    ["todo", 0],
    ["queue", 20],
  ]) {
    ctx.slots.register(
      { name: "conversation.input.dock", id: `fixture-${id}`, order },
      () => React.createElement("div", { [`data-fixture-${id}`]: "" }, id),
    );
  }
  ctx.slots.register({ name: "conversation.input.model" }, () =>
    React.createElement("span", { "data-fixture-model": "" }, "Native model"),
  );
  let provider;
  const mountProvider = async () => {
    provider = ctx.plugin(modules["dsh-providers"]);
    await provider;
  };
  await mountProvider();
  document.getElementById("root").replaceChildren();
  const unmount = ctx.uiRenderer.mount(document.getElementById("root"));
  window.composerFixture = {
    requests,
    select(current, phase = "ready", active = false) {
      if (current !== undefined) {
        const session = bindings.get(current).session;
        session.set({
          ...session.getSnapshot(),
          blank: !active,
          awaitingFirstTurn: !active,
        });
      }
      list.set({
        phase,
        current,
        byId: { A: { blank: !active }, B: { blank: !active } },
      });
    },
    hold() {
      hold = [];
    },
    release() {
      const pending = hold;
      hold = undefined;
      for (const resolve of pending ?? []) resolve();
    },
    async mode(next) {
      mode = next;
      await provider.dispose();
      await mountProvider();
    },
    async hmr() {
      await provider.dispose();
      await mountProvider();
    },
    async disposeProvider() {
      await provider.dispose();
    },
    async dispose() {
      unmount();
      await ctx.fiber.dispose();
    },
    slots: () => ctx.slots.snapshot(),
  };
};
