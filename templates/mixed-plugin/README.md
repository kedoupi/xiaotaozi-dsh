# __PACKAGE__

English | [中文](README.zh.md)

__DESCRIPTION__

Host + Web Client skeleton. Keep `src/index.ts` as the Cordis Host entry even when most work lives in `src/client`.

Part of the [dsh-plugins](https://github.com/kedoupi/dsh-plugins) monorepo.

## Install

```bash
dsh plugin --profile <name> add github:kedoupi/dsh-plugins#path:plugins/__SLUG__
```

After changing Slot / theme / locale usage, update `dsh.client.inject` and the Client `export const inject` so they match the services you actually read.
