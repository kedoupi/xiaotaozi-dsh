import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import type {
  ClientContext,
  SettingsScope,
  SettingsScopeSnapshot,
} from "../src/client/dsh-client-types.ts";
import type {
  SettingsDescribeFace,
  SettingsMirrorSnapshot,
} from "@deepseek-ai/dsh-client-ui-settings/client";
import { AdvancedRuntimeSettings } from "../src/client/AdvancedRuntimeSettings.tsx";
import {
  advancedEn,
  advancedZh,
} from "../src/client/advanced-runtime-locales.ts";
import {
  createRuntimeForm,
  type RuntimeForm,
  type RuntimeNamespace,
  type RuntimeValues,
} from "../src/client/advanced-runtime.ts";
import { css } from "../src/client/styles.ts";

const owned: RuntimeForm[] = [];
afterEach(() => {
  owned.splice(0).forEach((form) => form.dispose());
});
function fixture(
  status: SettingsMirrorSnapshot["status"] = "loading",
  writable = false,
) {
  const state: SettingsMirrorSnapshot = {
    status,
    view: undefined,
    error: null,
  };
  const mirror: SettingsDescribeFace = {
    getSnapshot: () => state,
    subscribe: () => () => {},
    ensure: vi.fn(async () => {}),
    acceptView: () => {},
  };
  const scopes = {} as Record<RuntimeNamespace, SettingsScope<RuntimeValues>>;
  const forms = {} as Record<RuntimeNamespace, RuntimeForm>;
  for (const namespace of [
    "shell",
    "agent-loop",
    "web-search-deepseek",
  ] as const) {
    const snapshot: SettingsScopeSnapshot<RuntimeValues> = {
      status: status === "idle" ? "loading" : status,
      value: {
        timeoutMs: 1000,
        maxOutputBytes: 500,
        maxParallelToolCalls: 4,
        baseURL: "https://search.test",
        maxUses: 3,
        apiKey: "SERVER_LITERAL_MUST_NOT_RENDER",
      },
      base: {},
      user: { maxOutputBytes: 500 },
      revision: 1,
      writable,
      mode: "host",
    };
    const scope: SettingsScope<RuntimeValues> = {
      getSnapshot: () => snapshot,
      subscribe: () => () => {},
      set: vi.fn(async () => {}),
      unset: vi.fn(async () => {}),
    };
    scopes[namespace] = scope;
    forms[namespace] = createRuntimeForm(namespace, scope, {
      describe: async () => ({
        result: {
          ok: true,
          value: {
            credentials: { DEEPSEEK_API_KEY: { configured: true, writable } },
          },
        },
      }),
      set: async () => ({
        result: { ok: false, error: { message: "denied" } },
      }),
    });
    owned.push(forms[namespace]);
  }
  const render = (english = false) =>
    renderToStaticMarkup(
      createElement(AdvancedRuntimeSettings, {
        forms,
        mirror,
        t: (key) => (english ? advancedEn : advancedZh)[key],
      }),
    );
  return { state, mirror, forms, scopes, render };
}

it("renders a loading Advanced page, three named sections and persistent labels for every runtime field", () => {
  const html = fixture().render();
  expect(html).toMatch(/<h[12][^>]*>高级<\/h[12]>/);
  for (const name of ["Shell", "Agent loop", "DeepSeek 搜索"])
    expect(html).toContain(name);
  for (const id of [
    "shell-timeoutMs",
    "shell-maxOutputBytes",
    "agent-loop-maxParallelToolCalls",
    "web-search-deepseek-baseURL",
    "web-search-deepseek-maxUses",
    "web-search-deepseek-apiKey",
  ]) {
    expect(html).toContain(`for="${id}"`);
    expect(html).toContain(`id="${id}"`);
    expect(html).toContain(`id="${id}-hint"`);
  }
  expect(html.match(/role="status"/g)).toHaveLength(1);
  expect(html).toContain('aria-atomic="true"');
  expect(html).toContain('aria-busy="true"');
  expect(html).toContain(advancedZh.loading);
  expect(html.match(/<button[^>]*disabled=""/g)).toHaveLength(12);
  expect(html.match(/<input[^>]*disabled=""/g)).toHaveLength(6);
  expect(html).toMatch(
    /type="password"[^>]*autoComplete="new-password"[^>]*value=""/,
  );
  expect(html).not.toContain("SERVER_LITERAL_MUST_NOT_RENDER");
});

it("shows invalid numeric text linked to one inline error while URL stays an ordinary text draft", () => {
  const f = fixture("ready", true);
  f.forms.shell.edit("timeoutMs", "not finite");
  const html = f.render();
  expect(html).toMatch(
    /id="shell-timeoutMs"[^>]*type="text"[^>]*inputMode="decimal"[^>]*aria-invalid="true"[^>]*aria-describedby="shell-timeoutMs-hint"[^>]*value="not finite"/,
  );
  expect(html).toContain(advancedZh.invalidNumber);
  expect(html).toMatch(/id="web-search-deepseek-baseURL"[^>]*type="text"/);
  expect(html).toContain(advancedZh.overridden);
  expect(html).toContain(advancedZh.inherited);
  expect(html.match(/role="status"/g)).toHaveLength(1);
  expect(html).not.toContain('role="alert"');
  expect(f.scopes.shell.set).not.toHaveBeenCalled();
});

it.each(["unavailable", "ready"] as const)(
  "renders %s namespaces as unavailable/read-only rather than editable defaults",
  (status) => {
    const f = fixture(status, false);
    const html = f.render();
    expect(html).toContain(
      status === "unavailable" ? advancedZh.unavailable : advancedZh.readOnly,
    );
    expect(html.match(/<input[^>]*disabled=""/g)).toHaveLength(6);
  },
);

it("renders mirror errors and enables retry only from idle, not ready with a retained refresh error", () => {
  const f = fixture("idle");
  f.state.error = "Synthetic describe error";
  let html = f.render();
  expect(html).toContain("Synthetic describe error");
  expect(html).toMatch(/<button(?![^>]*disabled)[^>]*>重试<\/button>/);
  f.state.status = "ready";
  html = f.render();
  expect(html).toContain("Synthetic describe error");
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>重试<\/button>/);
});

it("keeps failed ordinary and replacement drafts across view rendering and displays failure in one status", async () => {
  const f = fixture("ready", true);
  await f.forms["web-search-deepseek"].refreshCredential();
  f.forms.shell.edit("timeoutMs", "2000");
  await f.forms.shell.save();
  f.forms["web-search-deepseek"].edit("apiKey", "new-typed-only");
  await f.forms["web-search-deepseek"].save();
  for (let i = 0; i < 2; i++) {
    const html = f.render();
    expect(html).toContain('value="2000"');
    expect(html).toContain('value="new-typed-only"');
    expect(html).toContain(advancedZh.saveFailed);
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).not.toContain("SERVER_LITERAL_MUST_NOT_RENDER");
  }
  f.forms["web-search-deepseek"].discard();
  expect(f.render()).not.toContain("new-typed-only");
});

it("aggregates busy state and disables the saving namespace without losing visible drafts", async () => {
  const f = fixture("ready", true);
  let finish!: () => void;
  vi.mocked(f.scopes.shell.set).mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  f.forms.shell.edit("timeoutMs", "2000");
  const pending = f.forms.shell.save();
  const html = f.render();
  expect(html).toContain(advancedZh.saving);
  expect(html).toContain('aria-busy="true"');
  expect(html).toMatch(/id="shell-timeoutMs"[^>]*disabled=""[^>]*value="2000"/);
  expect(html.match(/role="status"/g)).toHaveLength(1);
  finish();
  await pending;
});

it("does not report a missing key when credential metadata is unknown", async () => {
  const f = fixture("ready", true);
  const form = createRuntimeForm(
    "web-search-deepseek",
    f.scopes["web-search-deepseek"],
    {
      describe: async () => {
        throw new Error("metadata unavailable");
      },
      set: async () => ({ result: { ok: true, value: undefined } }),
    },
  );
  owned.push(form);
  f.forms["web-search-deepseek"] = form;
  await form.refreshCredential();
  const html = f.render();
  expect(html).toContain(advancedZh.credentialError);
  expect(html).not.toContain(advancedZh.credentialMissing);
  expect(html.match(/role="status"/g)).toHaveLength(1);
});

it("renders English runtime explanations, not plugin inventory copy", () => {
  const html = fixture().render(true);
  for (const name of ["Advanced", "Shell", "Agent loop", "DeepSeek search"])
    expect(html).toContain(name);
  expect(html).toContain(advancedEn.lede);
  expect(html).not.toContain("插件清单");
  expect(Object.keys(advancedEn).sort()).toEqual(
    Object.keys(advancedZh).sort(),
  );
  for (const value of Object.values(advancedEn))
    expect(value.trim()).not.toBe("");
});

it("binds original namespaces once per activation and uses receiver-preserving credential methods", () => {
  const source = readFileSync(
    new URL("../src/client/index.ts", import.meta.url),
    "utf8",
  );
  expect(source).toMatch(/export const inject = .*"settingsScope".*"remote"/);
  for (const namespace of ["shell", "agent-loop", "web-search-deepseek"]) {
    expect(source).toContain(`namespace: "${namespace}"`);
  }
  expect(source).toContain("ctx.settingsScope.describe()");
  expect(source).toContain('id: "advanced-runtime"');
  expect(source).not.toMatch(/id:\s*["']plugins["']/);
  expect(source).toContain('"remote.credentials"');
  expect(source).toContain("runtimeCredentialsFromRemote(remoteCredentials)");
  expect(source).toContain("credentials/reference-updated");
  expect(source).toContain("form.dispose()");
  const view = readFileSync(
    new URL("../src/client/AdvancedRuntimeSettings.tsx", import.meta.url),
    "utf8",
  );
  expect(view).toContain("useSyncExternalStore");
  expect(view).toContain("mirror.ensure()");
  expect(view).not.toContain(".dispose()");
  expect(view).not.toContain("onBlur");
});

it("activation passes shared forms to Advanced, preserves credential receivers and disposes forms and metadata subscription", async () => {
  const { apply } = await import("../src/client/index.ts");
  const f = fixture("ready", true);
  const cleanups: Array<() => void> = [];
  let update: (() => void) | undefined;
  const offMetadata = vi.fn();
  const credentials = {
    describe: vi.fn(async function (this: unknown, refs: string[]) {
      expect(this).toBe(credentials);
      return {
        ok: true as const,
        value: { [refs[0]]: { configured: true, writable: true } },
      };
    }),
    set: vi.fn(async function (this: unknown, _ref: string, _value: string) {
      expect(this).toBe(credentials);
      return { ok: true as const, value: undefined };
    }),
  };
  const bind = vi.fn(
    ({ namespace }: { namespace: RuntimeNamespace }) => f.scopes[namespace],
  );
  let registration!: {
    id: string;
    order: number;
    label: () => string;
    inject: () => Parameters<typeof AdvancedRuntimeSettings>[0];
  };
  let component: unknown;
  const ctx = {
    get(name: string) {
      if (name === "remote")
        return {
          credentials,
          $on: (event: string, listener: () => void) => {
            expect(event).toBe("credentials/reference-updated");
            update = listener;
            return offMetadata;
          },
        };
      throw new Error(`Unexpected service ${name}`);
    },
    settingsScope: { describe: () => f.mirror, bind },
    locale: {
      register: () => () => {},
      bind: () => (key: keyof typeof advancedZh) => advancedZh[key],
    },
    effect(run: () => () => void, name: string) {
      if (
        [
          "dsh-xtz-ui advanced copy",
          "dsh-xtz-ui runtime forms",
          "dsh-xtz-ui runtime credential metadata",
        ].includes(name)
      )
        cleanups.push(run());
    },
    slots: {
      inject(name: string, run: () => void) {
        if (name === "settings.section") run();
      },
      register(options: typeof registration, view: unknown) {
        registration = options;
        component = view;
      },
    },
  } as unknown as ClientContext;
  apply(ctx);
  expect(bind.mock.calls.map(([payload]) => payload)).toEqual([
    { namespace: "shell" },
    { namespace: "agent-loop" },
    { namespace: "web-search-deepseek" },
  ]);
  expect(component).toBe(AdvancedRuntimeSettings);
  expect(registration.id).toBe("advanced-runtime");
  expect(registration.order).toBe(90);
  expect(registration.label()).toBe("高级");
  const props = registration.inject();
  expect(props.mirror).toBe(f.mirror);
  expect(registration.inject().forms).toBe(props.forms);
  owned.push(...Object.values(props.forms));
  await props.forms["web-search-deepseek"].refreshCredential();
  expect(
    props.forms["web-search-deepseek"].getSnapshot().credential.configured,
  ).toBe(true);
  const reads = credentials.describe.mock.calls.length;
  update!();
  expect(credentials.describe).toHaveBeenCalledTimes(reads + 1);
  await props.forms["web-search-deepseek"].refreshCredential();
  props.forms["web-search-deepseek"].edit("apiKey", "new-replacement");
  await props.forms["web-search-deepseek"].save();
  expect(credentials.set).toHaveBeenCalledWith(
    "DEEPSEEK_API_KEY",
    "new-replacement",
  );
  expect(props.forms["web-search-deepseek"].getSnapshot().status).toBe("saved");
  props.forms["web-search-deepseek"].edit("apiKey", "unsaved");
  cleanups.reverse().forEach((cleanup) => cleanup());
  expect(offMetadata).toHaveBeenCalledOnce();
  expect(
    props.forms["web-search-deepseek"].getSnapshot().fields.apiKey.text,
  ).toBe("");
  for (const form of Object.values(props.forms))
    expect(form.getSnapshot().writable).toBe(false);
});

it("scopes responsive controls, neutral fields, primary save and visible reduced-motion-safe focus", () => {
  expect(css).toContain(".dshH-advanced");
  const advanced = css.slice(css.indexOf(".dshH-advanced"));
  expect(advanced).toContain("outline: 2px solid");
  expect(advanced).toContain("min-width: 0");
  expect(advanced).toContain("@media (max-width: 768px), (pointer: coarse)");
  expect(advanced).toContain("min-height: 44px");
  expect(advanced).toContain("min-width: 44px");
  expect(advanced).toContain("prefers-reduced-motion");
  expect(advanced).toContain("transition: none");
  expect(advanced).toContain("--dsw-alias-button-info-fill");
  expect(advanced).toContain("--dsw-alias-label-secondary");
});

it("keeps Advanced status atomic in English and Chinese and links every invalid field hint", () => {
  const f = fixture("ready", true);
  f.forms.shell.edit("maxOutputBytes", "Infinity");
  for (const english of [false, true]) {
    const html = f.render(english);
    expect(html.match(/aria-live="polite"/g)).toHaveLength(1);
    expect(html).toMatch(
      /role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/,
    );
    expect(html).not.toMatch(/role="(?:alert|dialog)"/);
    expect(html).toMatch(
      /id="shell-maxOutputBytes"[^>]*aria-invalid="true"[^>]*aria-describedby="shell-maxOutputBytes-hint"/,
    );
    expect(html).toContain(
      english ? advancedEn.invalidNumber : advancedZh.invalidNumber,
    );
    expect(html).not.toMatch(/<button[^>]*>(?:(?!<\/button>)[\s\S])*<button/);
    expect(html).not.toMatch(/role="button"|[×‹]/);
  }
});

it("explains unavailable removal without disabling supported replacement", async () => {
  const f = fixture("ready", true);
  const form = f.forms["web-search-deepseek"];
  await form.refreshCredential();
  const html = f.render(true);
  expect(html).toContain("The Host cannot remove this key");
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Remove key<\/button>/);
  expect(html).toMatch(
    /id="web-search-deepseek-apiKey"(?![^>]*disabled)[^>]*type="password"/,
  );
});

it("explains readonly keys and exposes staged removal only behind explicit Save", async () => {
  const f = fixture("ready", true);
  let configured = true;
  const unset = vi.fn(async () => {
    configured = false;
    return { result: { ok: true as const, value: undefined } };
  });
  const form = createRuntimeForm(
    "web-search-deepseek",
    f.scopes["web-search-deepseek"],
    {
      describe: async () => ({
        result: {
          ok: true,
          value: {
            credentials: { DEEPSEEK_API_KEY: { configured, writable: true } },
          },
        },
      }),
      set: async () => ({ result: { ok: true, value: undefined } }),
      unset,
    },
  );
  owned.push(form);
  f.forms["web-search-deepseek"] = form;
  await form.refreshCredential();
  expect(f.render(true)).toMatch(
    /<button(?![^>]*disabled)[^>]*>Remove key<\/button>/,
  );
  form.reset("apiKey");
  expect(unset).not.toHaveBeenCalled();
  expect(f.render(true)).toContain("Removal is staged");
  await form.save();
  expect(unset).toHaveBeenCalledOnce();
  expect(f.render(true)).toContain("Key not configured");
  const readonly = fixture("ready", false);
  await readonly.forms["web-search-deepseek"].refreshCredential();
  expect(readonly.render(true)).toContain("cannot be replaced or removed");
});
