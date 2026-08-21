# __PACKAGE__

__DESCRIPTION__

Host + Web Client skeleton. Keep `src/index.ts` as the Cordis Host entry even when most work lives in `src/client`.

## Install

```bash
dsh plugin --profile <name> add ./plugins/__SLUG__
```

After changing Slot / theme / locale usage, update `dsh.client.inject` and the Client `export const inject` so they match the services you actually read.
