# FAQ

## Is there a desktop app?

No. The user product is the `xtz` CLI; the UI is the official `dsh web` opened in your browser. A desktop client existed historically and is archived at the git tag `archive/desktop` — it will not come back.

## Which Node.js version do I need?

**`^22.19.0` or `>=24`**, matching [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). DSH itself stays pinned to `0.1.1-rc.2`. `xtz doctor` verifies both.

## `xtz start` says port 3080 is occupied

`xtz` never kills a process it did not start and never steals a port. If 3080 is taken:

- If it is a Xiaotaozi service that `xtz` started, `xtz start` reuses it.
- If it is something else, an interactive `xtz start` offers `3082+`, or you can pass `--port N` explicitly.
- Non-interactive runs refuse without `--port` — that is by design.

## Why does `xtz plugin` fail?

`init`, `plugin`, `run`, `ask`, `config dump`, `config defaults`, and `update` are intentionally disabled and fail closed. Extra plugins are installed from the in-app [Market](/guide/market), or through the official `dsh plugin --profile web add …`.

## Something feels broken — where do I start?

```bash
xtz doctor
```

It inspects the runtime versions, the xtz stamp, the profile, and the port, and reports exactly what is off. Exit codes are stable: `0` healthy, `1` stopped or failing readiness, `2` blocked by the safety policy.

## How do I upgrade from an older `xtz`?

There is no `xtz update` (that command fails closed). Reinstalling the CLI does **not** replace plugins that are already in `~/.dsh/profiles/web`. `xtz start` only seeds **missing** packages; it does not retarget an installed `dsh-im` from `#v0.2.2` to `#v0.2.3`.

To pick up a new product snapshot (for example 0.2.3):

```bash
xtz stop
npm install -g xiaotaozi-dsh-cli   # or bun / the install script — same method as first install
mv ~/.dsh/profiles/web ~/.dsh/profiles/web.bak
xtz start
xtz version    # should match the snapshot you installed
xtz doctor
```

Need Node `^22.19.0` or `>=24` (not Node 23). Do **not** `rm -rf ~/.dsh`. Model logins and IM credentials usually stay in the rest of `~/.dsh`; sessions that lived in the old web profile do not move. Delete `web.bak` only after the new profile works.

## How do I reset the official home?

Do **not** `rm -rf ~/.dsh`. The same move-aside as an upgrade re-seeds defaults into a fresh profile:

```bash
xtz stop
mv ~/.dsh/profiles/web ~/.dsh/profiles/web.bak
xtz start
```

## A tool call fails with `reading 'prepare'` or every later turn is `tool_calls`

That is a duplicate `@deepseek-ai/dsh-tools` in the web profile (two scheduler Symbols), not a failed CLI install. `/new` does not fix “every tool call crashes”. `xtz doctor` reports a remaining duplicate. After upgrading the CLI, re-seed as above so `xtz start` can heal the copy. Already-broken sessions stay broken; start a new session only after doctor is clean.

## Is my data sent anywhere?

The service listens on loopback only (`127.0.0.1`). Model traffic goes to the providers you sign in to under Settings → **Models**; IM traffic goes through the channels you connect in **IM bots**. Nothing else leaves your machine.

## Where do I report a bug?

[Open an issue](https://github.com/kedoupi/xiaotaozi-dsh/issues) on GitHub. Include `xtz version` and `xtz doctor` output when relevant.
