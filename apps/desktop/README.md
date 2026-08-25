# Xiaotaozi DSH (Tauri)

Win / Mac tray app plus a system WebView shell. Home is the official default `~/.dsh`, port **3080**. The installer bundles Node + dsh; the user's machine does not need a toolchain.

Spec: [DESIGN.md](DESIGN.md). Chinese: [README.zh.md](README.zh.md).

## Dev (this machine already has `dsh`)

```bash
cd apps/desktop
pnpm install
pnpm tauri dev
```

Debug without `src-tauri/runtime/` uses `dsh` on `PATH`. Release without a runtime shows a Chinese error; it will not tell the user to install Node.

## Pack the 小白 runtime

Reads Node, Python, dsh, pnpm, and app pins from the repository [`versions.json`](../../versions.json), packs `hello` / `providers` / `memory` / `im` as tarballs, and writes a hoisted `web` profile. Staging is `apps/desktop/.runtime-build/` — never `~/.dsh`.

```bash
cd apps/desktop
pnpm bundle-runtime
pnpm tauri build
```

`tauri build` runs the packer first. First launch copies `runtime/profile` if `~/.dsh/profiles/web` is missing; otherwise it overlays the four official plugins from the packed tree (no `pnpm install`). After that, the client silently fetches plugin packs from `https://s.xiaotaozi.cc/dsh/packs/` (existing TCB COS, not GitHub, not `dsh.xiaotaozi.cc`). Fail closed. Do not `link:` this workspace into `~/.dsh`.

```bash
pnpm pack-plugins    # tar + signed latest.json
pnpm publish-pack    # tcb upload, then PurgeUrlsCache on s.xiaotaozi.cc/dsh/packs/
```

## Signed plugin-pack release

`latest.json` is an Ed25519 envelope: `keyId`, base64 `signed` payload bytes, and a signature over those exact bytes. The client matches the embedded public key, verifies before parsing, then checks `minApp`, runtime versions, and target metadata. An old client that cannot verify this envelope must receive an app upgrade first; never publish unsigned compatibility JSON.

```bash
pnpm generate-pack-key
```

The command writes the ignored private key to `.pack-signing/pack-signing-key.pem` and the committed public DER to `src-tauri/keys/pack-signing-key.der`. Never commit or copy the private key into artifacts. Release automation provides the PEM contents or path through the `XIAOTAOZI_PACK_SIGNING_KEY` secret.

Build each native target on that target OS. Transfer the complete `plugin-packs/` directory between builders: when metadata matches and the target is new, `pack-plugins` keeps one `packVersion` and adds the target. The final publisher must hold every tarball referenced by the aggregate index.

The release client accepts only HTTPS URLs on `s.xiaotaozi.cc` under `/dsh/packs/` (debug-only loopback override), no credentials/query/fragment/redirects. It requires declared `Content-Length`, a nonzero size no larger than 512 MiB, exact byte count and SHA-256, and tar entries limited to normal files/directories without traversal or links. Updates are unpacked to temporary storage, overlaid into `.web-staging`, validated, and atomically swapped with `.web-backup`; failed health checks and interrupted swaps restore the known-good profile.

If this app owns the sidecar, it stops, swaps, restarts, and health-checks it. If another process owns port 3080, the app never kills it; the update is written for the next launch.

Before release run the repository `pnpm check`, `pnpm check:build`, `pnpm check:path`, and `pnpm check:desktop`. Test fresh install, valid update, rejected signature/URL/hash/size/tar, rollback after failed health check, crash recovery, and externally owned port 3080. Routine verification must not run `publish-pack` or a real installer/runtime pack.

Spec: repo [docs/conventions.md](../../docs/conventions.md) § Desktop plugin packs and [DESIGN.md](DESIGN.md).

Icons: `pnpm icons` rebuilds the original Xiaotaozi peach crop (face in the corner, hugging a tiny DeepSeek computer-app icon) for Dock, and a padded 18pt tray so the orange plate does not fill the menu bar.
