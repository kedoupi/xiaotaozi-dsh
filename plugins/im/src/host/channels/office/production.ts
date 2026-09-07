import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { OfficeConfigStore } from '../../../channels/office/config-store.ts';
import { OfficeController } from '../../../channels/office/office-controller.ts';
import { OfficeRuntime } from '../../../channels/office/office-runtime.ts';
import { HarnessClient } from '../../../channels/shared/harness-client.ts';
import { harnessOrigin } from '../shared/production.ts';

type OfficePathsConfig = {
  dshHome?: string;
  dataDir?: string;
  configPath?: string;
};

type OfficeProductionConfig = OfficePathsConfig & {
  harnessBaseUrl?: string | URL;
  dshBin?: string;
};

type OfficeHostContext = {
  logger?: ((name: string) => unknown) | { error?: (...args: unknown[]) => unknown };
  credentials?: unknown;
  webServer?: { port?: unknown } | null;
};

type OfficeControllerInstance = {
  initialize: () => unknown;
  close: () => unknown;
  status: () => unknown;
  configure: (payload: unknown) => unknown;
  reconnect: () => unknown;
  test: () => unknown;
  remove: () => unknown;
};

type OfficeConstructable<T> = new (options: unknown) => T;

export function officePaths(config: OfficePathsConfig = {}) {
  const dshHome = resolve(config.dshHome ?? process.env.DSH_HOME ?? join(homedir(), '.dsh'));
  const root = resolve(config.dataDir ?? join(dshHome, 'integrations', 'dsh-office'));
  return { root, config: resolve(config.configPath ?? join(root, 'config.json')) };
}

export async function createProductionController(
  ctx: unknown,
  config: Record<string, unknown> = {},
  internals: Record<string, unknown> = {},
) {
  const options = config as OfficeProductionConfig;
  const injected = internals as {
    ConfigStore?: new (path: string) => { load: () => Promise<unknown> | unknown };
    Controller?: OfficeConstructable<OfficeControllerInstance>;
    Runtime?: OfficeConstructable<unknown>;
    HarnessClient?: OfficeConstructable<unknown>;
    createHarness?: (options: { workspace?: unknown }) => unknown;
    transport?: unknown;
  };
  const Store = (injected.ConfigStore ?? OfficeConfigStore) as new (path: string) => {
    load: () => Promise<unknown> | unknown;
  };
  const Controller = (injected.Controller ?? OfficeController) as OfficeConstructable<OfficeControllerInstance>;
  const Runtime = (injected.Runtime ?? OfficeRuntime) as OfficeConstructable<unknown>;
  const ResolvedHarness = (injected.HarnessClient ?? HarnessClient) as OfficeConstructable<unknown>;
  const host = ctx as OfficeHostContext;
  const paths = officePaths(options);
  const configStore = await new Store(paths.config).load();
  const logger = typeof host.logger === 'function' ? host.logger('dsh-im:office') : (host.logger ?? console);
  const harnessBaseUrl = harnessOrigin(host.webServer, options.harnessBaseUrl);
  const createHarness = injected.createHarness ?? (({ workspace }) => new ResolvedHarness({
    baseUrl: harnessBaseUrl,
    workspace,
    autostart: false,
    dshBin: options.dshBin ?? 'dsh',
    rpcIdPrefix: 'office',
    logPrefix: 'dsh-im:office',
  }));
  const controller = new Controller({
    credentials: host.credentials,
    configStore,
    logger,
    createRuntime: (runtimeOptions: Record<string, unknown>) => new Runtime({
      ...runtimeOptions,
      createHarness,
      ...(injected.transport ? { transport: injected.transport } : {}),
    }),
  });
  await controller.initialize();
  return { controller, close: () => controller.close(), paths };
}
