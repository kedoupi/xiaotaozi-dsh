// @ts-nocheck
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { OfficeConfigStore } from '../../../channels/office/config-store.ts';
import { OfficeController } from '../../../channels/office/office-controller.ts';
import { OfficeRuntime } from '../../../channels/office/office-runtime.ts';
import { HarnessClient } from '../../../channels/shared/harness-client.ts';
import { harnessOrigin } from '../shared/production.ts';

export function officePaths(config = {}) {
  const dshHome = resolve(config.dshHome ?? process.env.DSH_HOME ?? join(homedir(), '.dsh'));
  const root = resolve(config.dataDir ?? join(dshHome, 'integrations', 'dsh-office'));
  return { root, config: resolve(config.configPath ?? join(root, 'config.json')) };
}

export async function createProductionController(ctx, config = {}, internals = {}) {
  const Store = internals.ConfigStore ?? OfficeConfigStore;
  const Controller = internals.Controller ?? OfficeController;
  const Runtime = internals.Runtime ?? OfficeRuntime;
  const ResolvedHarness = internals.HarnessClient ?? HarnessClient;
  const paths = officePaths(config);
  const configStore = await new Store(paths.config).load();
  const logger = typeof ctx.logger === 'function' ? ctx.logger('dsh-im:office') : (ctx.logger ?? console);
  const harnessBaseUrl = harnessOrigin(ctx.webServer, config.harnessBaseUrl);
  const createHarness = internals.createHarness ?? (({ workspace }) => new ResolvedHarness({
    baseUrl: harnessBaseUrl,
    workspace,
    autostart: false,
    dshBin: config.dshBin ?? 'dsh',
    rpcIdPrefix: 'office',
    logPrefix: 'dsh-im:office',
  }));
  const controller = new Controller({
    credentials: ctx.credentials,
    configStore,
    logger,
    createRuntime: (options) => new Runtime({
      ...options,
      createHarness,
      ...(internals.transport ? { transport: internals.transport } : {}),
    }),
  });
  await controller.initialize();
  return { controller, close: () => controller.close(), paths };
}
