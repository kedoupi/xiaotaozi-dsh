# CLI Reference

`xtz` is intentionally small: it starts, stops, and inspects the official web service, and nothing else. Anything it cannot verify, it refuses — with a non-zero exit code.

## Commands

| Command | What it does |
| :-- | :-- |
| `xtz` | Same as `xtz start` |
| `xtz start [--port N]` | Seed defaults if needed, start in the background, print the authenticated URL (`/?token=…`), open the browser |
| `xtz stop` | Stop the process `xtz` started |
| `xtz restart` | Stop, then start |
| `xtz open` | Open the current authenticated URL in the browser |
| `xtz status` | Inspect the remembered port without changing anything |
| `xtz doctor` | Inspect runtime, xtz stamp, profile, and port |
| `xtz config path` | Print the official web profile patch path |
| `xtz version` | Print CLI, Node, and pinned DSH versions |
| `xtz help` | Show help |

## Ports

The default listen address is `127.0.0.1:3080`.

- If 3080 is occupied by something that is **not** Xiaotaozi, an interactive `xtz start` can offer `3082+`.
- Non-interactive runs refuse unless `--port` is set explicitly.
- `xtz` never kills a process it did not start, and never steals a port.

A service is accepted as healthy only when the loopback-only, versioned Xiaotaozi identity endpoint returns the exact v1 contract. DSH 0.1.2 still requires a one-time `/?token=` launch URL to mint the browser cookie; opening `/` without that cookie is 401. `xtz` stores that URL in `$DSH_HOME/xiaotaozi-xtz-web.auth` (mode 0600) for the process it started. Do not paste the token into issues or logs.

## Intentionally disabled

These subcommands fail closed by design:

```text
init · plugin · run · ask · config dump · config defaults · update
```

Extra plugins are installed from **Plugin Center → Discover plugins** (see [Plugin Market](/guide/market)), not from the command line.

## Exit codes

| Code | Meaning |
| :-- | :-- |
| `0` | The requested operation succeeded |
| `1` | The service is stopped, or a readiness check failed |
| `2` | Invalid usage, an unverified port occupant, or an operation blocked by the safety policy |

Exit codes are stable, so `xtz status` and `xtz doctor` are safe to script against.
