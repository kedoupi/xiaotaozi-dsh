# Product README and Screenshot Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the public Xiaotaozi DSH README layer for users and add a privacy-safe, current-main functional screenshot gallery for all six first-party plugins.

**Architecture:** Keep the root README as a concise product landing page and each plugin README as the self-contained owner of its detailed screenshots. Capture the repository-root hub's merged-main sandbox on port 3081 with a temporary Playwright runner, store WebP assets under each owning plugin, and mirror only the images required by the VitePress site.

**Tech Stack:** Markdown, Playwright Python in a temporary `uv` environment, headless Chromium, `cwebp`, VitePress, pnpm, repository documentation checks.

**Spec:** `docs/superpowers/specs/2026-09-02-readme-product-gallery-design.md`

## Global Constraints

- Update the 18 approved README files: root, CLI, website, and six first-party plugin English/Chinese pairs.
- Screenshot only the merged `main` product; freeze and record one capture SHA before the first screenshot.
- Use 1440×900 CSS pixels, light mode, product UI only, and WebP output.
- Use Chinese product UI with localized English/Chinese Markdown captions and alt text.
- Keep every plugin's canonical screenshots under `plugins/<slug>/docs/` so Git path installs remain self-contained.
- Never use official `~/.dsh`, port 3080, real external writes, private sessions, private paths, identities, credentials, or secrets.
- The repository-root hub owns sandbox port 3081. The topic worktree never starts its own sandbox.
- Do not touch `.worktrees/market-ui-upgrade` or its uncommitted changes.
- Do not add a screenshot framework, Storybook, fixture subsystem, repository dependency, or product code.
- Preserve exact CLI command availability, Node range `^22.19.0 || >=24.0.0`, DSH pin `0.1.1-rc.2`, official port 3080, and sandbox port 3081.
- Do not bump `versions.json`, CLI version, or plugin package versions.
- If a requested state cannot be produced without private data or an external side effect, record the blocked image in the final report instead of fabricating it.

---

### Task 1: Freeze the capture baseline and create temporary capture checks

**Files:**
- Read: `docs/superpowers/specs/2026-09-02-readme-product-gallery-design.md`
- Create outside the repository: `/tmp/xiaotaozi-readme-capture.py`
- Create outside the repository: `/tmp/check-readme-images.mjs`
- Create outside the repository: `/tmp/xiaotaozi-readme-demo/`

**Interfaces:**
- Consumes: repository-root hub at `/Users/codepi/Coding/dsh-plugins` and topic worktree at `/Users/codepi/Coding/dsh-plugins/.worktrees/readme-product-gallery`.
- Produces: `CAPTURE_SHA`, a healthy main sandbox URL `http://127.0.0.1:3081`, a deterministic local demo Git project, a temporary Playwright capture command, and a local-image-link checker used by Tasks 2–10.

- [ ] **Step 1: Re-read the approved spec and confirm both checkouts are safe**

Run:

```bash
ROOT=/Users/codepi/Coding/dsh-plugins
WT="$ROOT/.worktrees/readme-product-gallery"
cd "$WT"
git status --short --branch
git log -2 --oneline --decorate
cd "$ROOT"
git status --short --branch
git branch --show-current
git rev-parse HEAD
```

Expected: the task worktree is `docs/readme-product-gallery`; the root hub is clean on `main`. Stop if the root is dirty, is not on `main`, or the task worktree contains changes not created by this plan.

- [ ] **Step 2: Update once before capture, then freeze the capture SHA**

Run:

```bash
ROOT=/Users/codepi/Coding/dsh-plugins
WT="$ROOT/.worktrees/readme-product-gallery"
cd "$ROOT"
git fetch origin main
git pull --ff-only origin main
CAPTURE_SHA=$(git rev-parse HEAD)
printf '%s\n' "$CAPTURE_SHA" | tee /tmp/xiaotaozi-readme-capture.sha
cd "$WT"
git merge --no-edit "$CAPTURE_SHA"
git rev-parse HEAD
git status --short --branch
```

Expected: the hub is fast-forwarded only; the worktree contains the capture baseline plus the approved design commit. From this step until all product screenshots are captured, do not mix a later `main` UI into the gallery.

- [ ] **Step 3: Verify or start only the hub-owned sandbox**

Run:

```bash
ROOT=/Users/codepi/Coding/dsh-plugins
if lsof -nP -iTCP:3081 -sTCP:LISTEN >/tmp/xiaotaozi-3081.txt; then
  cat /tmp/xiaotaozi-3081.txt
  PID=$(awk 'NR==2 {print $2}' /tmp/xiaotaozi-3081.txt)
  ps -p "$PID" -o pid=,ppid=,command=
else
  cd "$ROOT"
  nohup pnpm dev >/tmp/xiaotaozi-readme-sandbox.log 2>&1 &
  echo $! >/tmp/xiaotaozi-readme-sandbox.pid
fi
for attempt in $(seq 1 60); do
  curl -fsS http://127.0.0.1:3081/.well-known/xiaotaozi-dsh/identity/v1 >/tmp/xiaotaozi-identity.json && break
  sleep 1
done
cat /tmp/xiaotaozi-identity.json
lsof -nP -iTCP:3081 -sTCP:LISTEN
```

Expected: the exact Xiaotaozi identity endpoint responds and 3081 belongs to the root checkout's marked sandbox. If process inspection cannot prove ownership, stop; never signal or replace the listener. Do not inspect or restart 3080.

- [ ] **Step 4: Create a deterministic publishable demo repository**

Run:

```bash
rm -rf /tmp/xiaotaozi-readme-demo
mkdir -p /tmp/xiaotaozi-readme-demo/src /tmp/xiaotaozi-readme-demo/docs
cd /tmp/xiaotaozi-readme-demo
git init -b main
cat >README.md <<'EOF'
# Peach Notes

A small public demo workspace for Xiaotaozi DSH screenshots.
EOF
cat >src/peach.ts <<'EOF'
export function greeting(name: string): string {
  return `Hello, ${name}!`;
}
EOF
cat >docs/roadmap.md <<'EOF'
# Roadmap

- [x] Connect the workspace
- [ ] Review the first release
EOF
git add README.md src/peach.ts docs/roadmap.md
git -c user.name='Xiaotaozi Demo' -c user.email='demo@xiaotaozi.cc' commit -m 'feat: add peach notes demo'
printf '\n- [ ] Publish the guide\n' >> docs/roadmap.md
git status --short
git log --oneline --decorate -2
```

Expected: one public demo commit and one visible Markdown modification, with no private path or content inside the files.

- [ ] **Step 5: Create the temporary Playwright capture runner**

Write `/tmp/xiaotaozi-readme-capture.py` with exactly:

```python
from __future__ import annotations

import argparse
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument("--url", default="http://127.0.0.1:3081")
parser.add_argument("--output", required=True)
parser.add_argument("--click", action="append", default=[])
parser.add_argument("--wait-text")
parser.add_argument("--selector")
args = parser.parse_args()

output = Path(args.output)
output.parent.mkdir(parents=True, exist_ok=True)
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(
        viewport={"width": 1440, "height": 900},
        color_scheme="light",
        locale="zh-CN",
        device_scale_factor=1,
    )
    page = context.new_page()
    page.goto(args.url, wait_until="domcontentloaded", timeout=60_000)
    try:
        page.wait_for_load_state("networkidle", timeout=10_000)
    except Exception:
        pass
    for label in args.click:
        locator = page.get_by_text(label, exact=True)
        locator.last.click(timeout=15_000)
        page.wait_for_timeout(500)
    if args.wait_text:
        page.get_by_text(args.wait_text, exact=False).first.wait_for(timeout=15_000)
    body_text = page.locator("body").inner_text()
    output.with_suffix(".txt").write_text(body_text, encoding="utf-8")
    if args.selector:
        page.locator(args.selector).first.screenshot(path=str(output), type="png")
    else:
        page.screenshot(path=str(output), type="png", full_page=False)
    context.close()
    browser.close()
```

Run:

```bash
uv run --with playwright python -m playwright install chromium
uv run --with playwright python /tmp/xiaotaozi-readme-capture.py --help
```

Expected: help output lists `--output`, `--click`, `--wait-text`, and `--selector`. The temporary environment does not change a repository manifest.

- [ ] **Step 6: Create the temporary local-image-link checker**

Write `/tmp/check-readme-images.mjs` with exactly:

```javascript
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const files = process.argv.slice(2)
let failed = false
for (const file of files) {
  const markdown = readFileSync(file, 'utf8')
  const refs = [
    ...[...markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((match) => match[1]),
    ...[...markdown.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1]),
  ]
  for (const ref of refs) {
    if (/^(?:https?:|data:|#)/.test(ref)) continue
    const target = resolve(dirname(file), ref)
    if (!existsSync(target)) {
      console.error(`${file}: missing ${ref}`)
      failed = true
    }
  }
}
process.exitCode = failed ? 1 : 0
```

Run:

```bash
cd /Users/codepi/Coding/dsh-plugins/.worktrees/readme-product-gallery
node /tmp/check-readme-images.mjs README.md README.zh.md plugins/*/README.md plugins/*/README.zh.md
```

Expected: exit 0 against the starting tree.

- [ ] **Step 7: Register the demo workspace without exposing its absolute path in screenshots**

Open `http://127.0.0.1:3081`, add `/tmp/xiaotaozi-readme-demo` as a Web project named **Peach Notes Demo**, and select it. Confirm the visible workspace title is `Peach Notes Demo`. Any capture showing the absolute `/tmp/` path must be cropped or replaced.

Expected: the demo workspace is selectable by title and Git/sidebar views use only publishable files and commits.

### Task 2: Providers gallery and bilingual README

**Files:**
- Modify: `plugins/providers/README.md`
- Modify: `plugins/providers/README.zh.md`
- Create: `plugins/providers/docs/models-overview.webp`
- Create: `plugins/providers/docs/add-provider.webp`
- Create: `plugins/providers/docs/provider-setup.webp`
- Delete after references move: `plugins/providers/docs/models.jpg`
- Delete after references move: `plugins/providers/docs/add-provider.jpg`

**Interfaces:**
- Consumes: Task 1 capture runner and merged-main sandbox.
- Produces: three canonical provider screenshots used later by the root README and VitePress mirrors.

- [ ] **Step 1: Capture the model overview without private account detail**

Run a first pass:

```bash
WT=/Users/codepi/Coding/dsh-plugins/.worktrees/readme-product-gallery
uv run --with playwright python /tmp/xiaotaozi-readme-capture.py \
  --output /tmp/providers-models.png \
  --click 设置 --click 模型 --wait-text 添加服务商
```

Inspect `/tmp/providers-models.txt` and `/tmp/providers-models.png`. The selected detail must not show a real account, device name, authorization code, key, or endpoint. Select an unconnected or publishable demo provider before the final capture if necessary. Convert:

```bash
cwebp -quiet -q 84 /tmp/providers-models.png -o "$WT/plugins/providers/docs/models-overview.webp"
magick identify "$WT/plugins/providers/docs/models-overview.webp"
```

Expected: WebP, 1440×900 or a bounded crop no larger than that, with readable model navigation and selection controls.

- [ ] **Step 2: Capture Add provider and custom-provider setup**

Navigate through **设置 → 模型 → 添加服务商** and capture the provider catalog. Then click **添加自定义服务商** and capture the blank form. Do not enter a real URL or key. Save PNGs to `/tmp/providers-add.png` and `/tmp/providers-setup.png`, then run:

```bash
WT=/Users/codepi/Coding/dsh-plugins/.worktrees/readme-product-gallery
cwebp -quiet -q 84 /tmp/providers-add.png -o "$WT/plugins/providers/docs/add-provider.webp"
cwebp -quiet -q 84 /tmp/providers-setup.png -o "$WT/plugins/providers/docs/provider-setup.webp"
magick identify "$WT/plugins/providers/docs/"*.webp
```

Expected: the catalog shows available provider types; the setup image shows labels and empty inputs only.

- [ ] **Step 3: Rewrite both provider READMEs around the user journey**

Use these section orders:

```text
README.md: What it unlocks → Quick start → See it → Memberships and keys → Generated media → Data and privacy → Develop → Documentation → License
README.zh.md: 能做什么 → 快速开始 → 功能截图 → 订阅与密钥 → 图片和视频生成 → 数据与隐私 → 开发 → 文档 → License
```

Under **See it / 功能截图**, use these localized captions and paths:

```markdown
![Settings → Models overview and model selection](docs/models-overview.webp)
![Add provider catalog](docs/add-provider.webp)
![Custom provider setup form](docs/provider-setup.webp)
```

```markdown
![设置中的模型总览与模型选择](docs/models-overview.webp)
![添加服务商目录](docs/add-provider.webp)
![自定义服务商配置表单](docs/provider-setup.webp)
```

Preserve the truthful current facts about OAuth/device login, API keys, custom OpenAI-compatible endpoints, `image_generate`, `video_generate`, storage locations, and environment-provided read-only keys. Remove repeated monorepo narrative that the root README already owns.

- [ ] **Step 4: Verify and commit providers**

Run:

```bash
cd /Users/codepi/Coding/dsh-plugins/.worktrees/readme-product-gallery
node /tmp/check-readme-images.mjs plugins/providers/README.md plugins/providers/README.zh.md
git diff --check -- plugins/providers
git diff --stat -- plugins/providers
git add plugins/providers/README.md plugins/providers/README.zh.md plugins/providers/docs
git commit -m "docs(providers): add functional screenshot journey"
```

Expected: image check passes and the commit contains only provider docs/assets.

### Task 3: IM gallery and bilingual README

**Files:**
- Modify: `plugins/im/README.md`
- Modify: `plugins/im/README.zh.md`
- Create: `plugins/im/docs/channels-overview.webp`
- Create: `plugins/im/docs/add-bot.webp`
- Create: `plugins/im/docs/workspace-selection.webp`
- Delete after references move: `plugins/im/docs/imbot.png`

**Interfaces:**
- Consumes: Task 1 demo workspace and capture runner.
- Produces: three canonical IM screenshots used later by the root README and VitePress mirrors.

- [ ] **Step 1: Capture the channel overview and one credential-free add flow**

Open **IM机器人** from the sidebar. Capture the full channel list with a channel that has no private bot selected. Open a QR or blank manual setup path that does not reveal a real credential; prefer a blank QR/setup prompt over an existing bot card. Save and convert:

```bash
WT=/Users/codepi/Coding/dsh-plugins/.worktrees/readme-product-gallery
cwebp -quiet -q 84 /tmp/im-channels.png -o "$WT/plugins/im/docs/channels-overview.webp"
cwebp -quiet -q 84 /tmp/im-add-bot.png -o "$WT/plugins/im/docs/add-bot.webp"
magick identify "$WT/plugins/im/docs/channels-overview.webp" "$WT/plugins/im/docs/add-bot.webp"
```

Expected: channel names and setup method are visible; no bot identifier, private workspace, QR payload, secret, or user name is readable.

- [ ] **Step 2: Capture existing-project selection with a publishable demo bot or report the blocker**

Create a disconnected demonstration bot only if the product accepts non-secret demo values without contacting or mutating an external service. Open **选择项目**, select **Peach Notes Demo**, and capture the picker/configuration state as `/tmp/im-workspace.png`. Convert:

```bash
WT=/Users/codepi/Coding/dsh-plugins/.worktrees/readme-product-gallery
cwebp -quiet -q 84 /tmp/im-workspace.png -o "$WT/plugins/im/docs/workspace-selection.webp"
```

If no channel can persist a safe disconnected demo bot, do not use an existing private bot. Record `plugins/im/docs/workspace-selection.webp — blocked: safe disconnected bot unavailable` in `/tmp/xiaotaozi-readme-blockers.txt` and continue with the two safe captures.

- [ ] **Step 3: Rewrite both IM READMEs around connection, project choice, and chat boundaries**

Use these section orders:

```text
README.md: What it unlocks → Quick start → See it → Channels → Projects and sessions → Files and results → WeCom office boundary → Data and resilience → Develop → Documentation → License
README.zh.md: 能做什么 → 快速开始 → 功能截图 → 渠道 → 项目与会话 → 文件与结果 → 企业微信办公边界 → 数据与稳定性 → 开发 → 文档 → License
```

Use the two required images and include `workspace-selection.webp` only when Task 3 Step 2 produced it. Preserve the exact nine chat channels, experimental AI Office status, existing-project requirement, cancel behavior, command list, preset/role behavior, file return behavior, and WeCom chat-versus-office boundary.

- [ ] **Step 4: Verify and commit IM**

Run:

```bash
cd /Users/codepi/Coding/dsh-plugins/.worktrees/readme-product-gallery
node /tmp/check-readme-images.mjs plugins/im/README.md plugins/im/README.zh.md
git diff --check -- plugins/im
git add plugins/im/README.md plugins/im/README.zh.md plugins/im/docs
git commit -m "docs(im): show bot connection journeys"
```

Expected: no README references `docs/imbot.png`; the commit contains only IM docs/assets.

### Task 4: WeCom Office gallery and bilingual README

**Files:**
- Modify: `plugins/wecom-office/README.md`
- Modify: `plugins/wecom-office/README.zh.md`
- Create: `plugins/wecom-office/docs/office-setup.webp`
- Create: `plugins/wecom-office/docs/office-permissions.webp`
- Create when safe: `plugins/wecom-office/docs/office-result.webp`

**Interfaces:**
- Consumes: the IM-integrated WeCom card on the Task 1 sandbox.
- Produces: standalone WeCom Office assets used later by the root README.

- [ ] **Step 1: Capture the office entry and permission states without identity details**

Open **IM机器人 → 企业微信**. Capture a bounded WeCom office section showing the office entry/setup state, then the active-office/write-permission controls only if the card can be framed without a private bot name or identifier. Crop at the product surface rather than editing text. Convert:

```bash
WT=/Users/codepi/Coding/dsh-plugins/.worktrees/readme-product-gallery
cwebp -quiet -q 84 /tmp/wecom-office-setup.png -o "$WT/plugins/wecom-office/docs/office-setup.webp"
cwebp -quiet -q 84 /tmp/wecom-office-permissions.png -o "$WT/plugins/wecom-office/docs/office-permissions.webp"
magick identify "$WT/plugins/wecom-office/docs/office-"*.webp
```

Expected: the integrated location, active-office concept, and **允许修改企业微信数据** boundary are visible with no credentials or local CLI path.

- [ ] **Step 2: Capture a read-only result only when dedicated demo data already exists**

Use an existing dedicated demonstration calendar/document read that causes no external write. Capture the product's rendered result and save `office-result.webp`. If no such demo data exists, append this exact blocker instead:

```text
plugins/wecom-office/docs/office-result.webp — blocked: no pre-existing publishable read-only WeCom demo result; external writes are forbidden
```

Do not create a calendar event, send a message, or write a document for the screenshot.

- [ ] **Step 3: Rewrite both WeCom Office READMEs around the single integrated entry**

Use these section orders:

```text
README.md: What it unlocks → Quick start → See it → One office identity → Read and write boundary → Supported work → Data and dependencies → Develop → Documentation → License
README.zh.md: 能做什么 → 快速开始 → 功能截图 → 唯一办公身份 → 读写边界 → 支持的办公能力 → 数据与依赖 → 开发 → 文档 → License
```

State clearly that the plugin is host-only, UI lives on the WeCom robot card supplied by `dsh-im`, chat stays in `dsh-im`, `wecom-cli` is required, only one office bot is active, and writes fail closed when permission is off. Include only images produced safely.

- [ ] **Step 4: Verify and commit WeCom Office**

Run:

```bash
cd /Users/codepi/Coding/dsh-plugins/.worktrees/readme-product-gallery
node /tmp/check-readme-images.mjs plugins/wecom-office/README.md plugins/wecom-office/README.zh.md
git diff --check -- plugins/wecom-office
git add plugins/wecom-office/README.md plugins/wecom-office/README.zh.md plugins/wecom-office/docs
git commit -m "docs(wecom-office): document integrated office controls"
```

Expected: standalone README images resolve from the plugin directory; no sibling-plugin image dependency exists.

### Task 5: Xiaotaozi UI gallery and bilingual README

**Files:**
- Modify: `plugins/xtz-ui/README.md`
- Modify: `plugins/xtz-ui/README.zh.md`
- Create: `plugins/xtz-ui/docs/welcome.webp`
- Create: `plugins/xtz-ui/docs/xiaotaozi-settings.webp`
- Create: `plugins/xtz-ui/docs/task-board.webp`
- Create: `plugins/xtz-ui/docs/git-graph.webp`
- Delete after references move: `plugins/xtz-ui/docs/welcome.png`

**Interfaces:**
- Consumes: Task 1 demo Git repository and sandbox.
- Produces: four canonical chrome/workflow screenshots used later by the root README.

- [ ] **Step 1: Capture welcome and Xiaotaozi settings**

Reset only the welcome notice's local browser storage in the separate Playwright context, reload, and capture the welcome dialog. Dismiss it, open **设置 → 小桃子**, and capture archive/task-board/Git-graph switches. Convert:

```bash
WT=/Users/codepi/Coding/dsh-plugins/.worktrees/readme-product-gallery
cwebp -quiet -q 84 /tmp/xtz-welcome.png -o "$WT/plugins/xtz-ui/docs/welcome.webp"
cwebp -quiet -q 84 /tmp/xtz-settings.png -o "$WT/plugins/xtz-ui/docs/xiaotaozi-settings.webp"
```

Expected: the screenshot shows the current peach design rather than the stale blue-button welcome image.

- [ ] **Step 2: Create publishable board data and capture Task Board**

In **任务看板**, create these local demo tasks only:

```text
Review onboarding copy
Capture plugin screenshots
Publish the first guide
```

Place at least one task in a non-default column using the UI, then capture the board. Do not add cron or external automation. Convert to `plugins/xtz-ui/docs/task-board.webp`.

Expected: task cards demonstrate columns/search/detail affordances without project-sensitive content.

- [ ] **Step 3: Capture the Git graph from Peach Notes Demo**

With **Peach Notes Demo** selected, open the branch chip and **Git 图谱**. Capture lanes, commit text, branch badge, and search without exposing an absolute path. Convert to `plugins/xtz-ui/docs/git-graph.webp`.

Expected: the commit `feat: add peach notes demo` is readable and no unrelated repository history appears.

- [ ] **Step 4: Rewrite both Xiaotaozi UI READMEs**

Use these section orders:

```text
README.md: What it unlocks → Quick start → See it → Feature switches → Task Board → Git graph → Archive → Chrome and boundaries → Develop → Documentation → License
README.zh.md: 能做什么 → 快速开始 → 功能截图 → 功能开关 → 任务看板 → Git 图谱 → 归档 → 品牌壳与边界 → 开发 → 文档 → License
```

Keep archive/task board/Git graph ownership here, keep right-hand files/Git/terminal ownership in `dsh-sidebar`, and retain the current default-toggle and announce-to-agent facts.

- [ ] **Step 5: Verify and commit Xiaotaozi UI**

Run:

```bash
cd /Users/codepi/Coding/dsh-plugins/.worktrees/readme-product-gallery
node /tmp/check-readme-images.mjs plugins/xtz-ui/README.md plugins/xtz-ui/README.zh.md
git diff --check -- plugins/xtz-ui
git add plugins/xtz-ui/README.md plugins/xtz-ui/README.zh.md plugins/xtz-ui/docs
git commit -m "docs(xtz-ui): add workbench feature gallery"
```

Expected: four images resolve and the stale welcome PNG is unreferenced.

### Task 6: Sidebar gallery and bilingual README

**Files:**
- Modify: `plugins/sidebar/README.md`
- Modify: `plugins/sidebar/README.zh.md`
- Create: `plugins/sidebar/docs/workbench.webp`
- Create: `plugins/sidebar/docs/files-editor.webp`
- Create: `plugins/sidebar/docs/git.webp`
- Create: `plugins/sidebar/docs/terminal.webp`

**Interfaces:**
- Consumes: Task 1 demo repository and its one modified Markdown file.
- Produces: four canonical right-workbench screenshots used later by the root README and website.

- [ ] **Step 1: Capture the three-column workbench and file editor**

Select **Peach Notes Demo**. Open the right workbench, open `docs/roadmap.md`, and capture the full application with left workspace, center conversation, and right workbench. Then capture a closer file/editor view showing the safe demo Markdown only. Convert to `workbench.webp` and `files-editor.webp`.

Expected: no existing session title, message body, generated file, or non-demo workspace is visible; start a blank demo session if the center column otherwise contains private text.

- [ ] **Step 2: Capture Git and terminal using only the demo repository**

Open the Git tab so `docs/roadmap.md` appears as modified. Open a terminal and run only:

```bash
pwd | sed 's#^.*#Peach Notes Demo#'
git status --short
git log -1 --oneline
```

Capture the Git and terminal surfaces, then convert to `git.webp` and `terminal.webp`.

Expected: terminal output contains the demo title and safe Git data, not the absolute `/tmp/` path.

- [ ] **Step 3: Rewrite both Sidebar READMEs**

Use these section orders:

```text
README.md: What it unlocks → Quick start → See it → Files and editor → Git → Terminal → Side card settings → Security and boundaries → Develop → Documentation → License
README.zh.md: 能做什么 → 快速开始 → 功能截图 → 文件与编辑器 → Git → 终端 → Side card 设置 → 安全与边界 → 开发 → 文档 → License
```

Retain upstream attribution, session-scoped API, external-link behavior, and ownership boundary with `dsh-xtz-ui`. Do not claim that editor/terminal color systems are peach-themed.

- [ ] **Step 4: Verify and commit Sidebar**

Run:

```bash
cd /Users/codepi/Coding/dsh-plugins/.worktrees/readme-product-gallery
node /tmp/check-readme-images.mjs plugins/sidebar/README.md plugins/sidebar/README.zh.md
git diff --check -- plugins/sidebar
git add plugins/sidebar/README.md plugins/sidebar/README.zh.md plugins/sidebar/docs
git commit -m "docs(sidebar): show files git and terminal workflows"
```

Expected: four images resolve and only sidebar docs/assets are committed.

### Task 7: Market gallery and bilingual README

**Files:**
- Modify: `plugins/market/README.md`
- Modify: `plugins/market/README.zh.md`
- Create: `plugins/market/docs/catalog.webp`
- Create: `plugins/market/docs/plugin-detail.webp`
- Create: `plugins/market/docs/install-state.webp`

**Interfaces:**
- Consumes: frozen merged-main sandbox; does not consume the in-progress Market worktree.
- Produces: three canonical Market screenshots used later by the root README and VitePress.

- [ ] **Step 1: Capture catalog and plugin details from current main**

Open **小桃子市场**, capture the catalog with search/tabs/cards, then open one public catalog detail and capture its summary, source, version, and install specification. Convert to `catalog.webp` and `plugin-detail.webp`.

Expected: only public catalog metadata appears.

- [ ] **Step 2: Capture a truthful install state without adding a new external package**

Use a plugin already installed in the sandbox profile and capture its **已安装** state. If the current-main UI exposes a transient install lifecycle only by performing an install, do not install a new third-party package; capture the installed state and name the image `install-state.webp`.

Expected: no PATH `dsh`, remote source addition, or external install is triggered.

- [ ] **Step 3: Rewrite both Market READMEs**

Use these section orders:

```text
README.md: What it unlocks → Open the Market → See it → Catalog and details → Installation state → Sources and boundaries → Install → Documentation → License
README.zh.md: 能做什么 → 打开市场 → 功能截图 → 目录与详情 → 安装状态 → 来源与边界 → 安装 → 文档 → License
```

Keep the current-main truth: three curated catalog rows, first-party plugins are seeded rather than sold here, installed state is profile-specific, install uses the pinned runtime/current `DSH_HOME`, and remote source catalogs remain unsupported.

- [ ] **Step 4: Verify and commit Market**

Run:

```bash
cd /Users/codepi/Coding/dsh-plugins/.worktrees/readme-product-gallery
node /tmp/check-readme-images.mjs plugins/market/README.md plugins/market/README.zh.md
git diff --check -- plugins/market
git add plugins/market/README.md plugins/market/README.zh.md plugins/market/docs
git commit -m "docs(market): add catalog and install gallery"
```

Expected: three current-main Market images resolve; no file under `.worktrees/market-ui-upgrade` changed.

### Task 8: Root product landing README pair

**Files:**
- Modify: `README.md`
- Modify: `README.zh.md`

**Interfaces:**
- Consumes: canonical assets from Tasks 2–7.
- Produces: the concise public product landing page and selected six-to-eight-image gallery.

- [ ] **Step 1: Rewrite the English root README in product-first order**

Use these top-level sections:

```text
Quick start
What you get
See Xiaotaozi DSH
Plugins
Third-party Market
Official vs sandbox
Learn more
License
```

Keep the hero icons/badges, then place this minimal quick start before repository internals:

```bash
npm install -g xiaotaozi-dsh-cli
xtz start
```

Mention the install script and bun as alternatives, not as three simultaneous commands. Keep the exact open and disabled CLI command lists in a compact paragraph or link to `apps/cli/README.md`.

Use one workbench overview followed by a gallery selected from:

```text
plugins/sidebar/docs/workbench.webp
plugins/providers/docs/models-overview.webp
plugins/im/docs/channels-overview.webp
plugins/wecom-office/docs/office-permissions.webp
plugins/xtz-ui/docs/task-board.webp
plugins/xtz-ui/docs/git-graph.webp
plugins/market/docs/catalog.webp
plugins/sidebar/docs/files-editor.webp
```

If `office-permissions.webp` was blocked, use `office-setup.webp`. Keep each caption outcome-led and one sentence long.

- [ ] **Step 2: Rewrite the Chinese root README with matching facts and order**

Use these top-level sections:

```text
快速开始
你会得到什么
看看小桃子 DSH
插件
第三方市场
正式环境与沙箱
继续了解
License
```

Use the same image order and paths as English with Chinese alt text/captions. Preserve the terms **用户**, official `~/.dsh`/3080, sandbox `.dsh-home`/3081, first `xtz start` seed, and third-party Market install.

- [ ] **Step 3: Prove the root README is shorter and all images resolve**

Run:

```bash
cd /Users/codepi/Coding/dsh-plugins/.worktrees/readme-product-gallery
wc -l README.md README.zh.md
node /tmp/check-readme-images.mjs README.md README.zh.md
rg -n '^## ' README.md README.zh.md
git diff --check -- README.md README.zh.md
```

Expected: each README is materially shorter than the starting 243/241 lines, all selected images exist, and both languages have the approved eight-section structure.

- [ ] **Step 4: Commit the root landing page**

Run:

```bash
git add README.md README.zh.md
git commit -m "docs(repo): make README a product-first gallery"
```

Expected: only the root README pair is committed.

### Task 9: CLI and website README pairs plus VitePress mirrors

**Files:**
- Modify: `apps/cli/README.md`
- Modify: `apps/cli/README.zh.md`
- Modify: `apps/website/README.md`
- Modify: `apps/website/README.zh.md`
- Modify: `apps/website/guide/getting-started.md`
- Modify: `apps/website/guide/plugins.md`
- Modify: `apps/website/guide/market.md`
- Modify: `apps/website/zh/guide/getting-started.md`
- Modify: `apps/website/zh/guide/plugins.md`
- Modify: `apps/website/zh/guide/market.md`
- Create: `apps/website/public/site-preview.webp`
- Create mirrors: `apps/website/public/workbench.webp`, `models.webp`, `imbot.webp`, `market.webp`
- Delete after references move: `apps/website/public/workbench.jpg`, `models.jpg`, `imbot.jpg`, `market.jpg`

**Interfaces:**
- Consumes: canonical workbench/providers/IM/Market assets and the exact CLI contract.
- Produces: focused CLI docs, a website package preview, and fresh site guide media.

- [ ] **Step 1: Refine the CLI README pair without adding terminal screenshots**

Keep these sections and order:

```text
Install / 安装
Start Xiaotaozi / 启动小桃子
Available commands / 当前开放命令
Safety boundary / 安全边界
Intentionally disabled / 有意禁用
Develop in this repository / 本仓库开发
Exit codes / 退出码
```

Keep every command and exit code from the current README. Add one link near the top to the root product gallery. Do not change version literals, Node range, port behavior, process ownership, identity endpoint, fake-home tests, or disabled commands.

Run:

```bash
cd /Users/codepi/Coding/dsh-plugins/.worktrees/readme-product-gallery
rg -n '^## ' apps/cli/README.md apps/cli/README.zh.md
git diff --check -- apps/cli/README.md apps/cli/README.zh.md
```

Expected: matching seven-section structures and no image dependency.

- [ ] **Step 2: Refresh VitePress's required screenshot mirrors**

Run:

```bash
WT=/Users/codepi/Coding/dsh-plugins/.worktrees/readme-product-gallery
cp "$WT/plugins/sidebar/docs/workbench.webp" "$WT/apps/website/public/workbench.webp"
cp "$WT/plugins/providers/docs/models-overview.webp" "$WT/apps/website/public/models.webp"
cp "$WT/plugins/im/docs/channels-overview.webp" "$WT/apps/website/public/imbot.webp"
cp "$WT/plugins/market/docs/catalog.webp" "$WT/apps/website/public/market.webp"
for f in \
  apps/website/guide/getting-started.md apps/website/guide/plugins.md apps/website/guide/market.md \
  apps/website/zh/guide/getting-started.md apps/website/zh/guide/plugins.md apps/website/zh/guide/market.md; do
  perl -0pi -e 's#/workbench\.jpg#/workbench.webp#g; s#/models\.jpg#/models.webp#g; s#/imbot\.jpg#/imbot.webp#g; s#/market\.jpg#/market.webp#g' "$WT/$f"
done
rm "$WT/apps/website/public/workbench.jpg" "$WT/apps/website/public/models.jpg" \
   "$WT/apps/website/public/imbot.jpg" "$WT/apps/website/public/market.jpg"
```

Expected: guide references point to the new WebP names and canonical visual content matches the owning plugin captures.

- [ ] **Step 3: Build and serve the site, then capture its homepage**

First inspect the server helper contract as required:

```bash
python3 /Users/codepi/.pi/agent/skills/webapp-testing/scripts/with_server.py --help
```

Then build and serve VitePress from `apps/website` on a free non-product port such as 4173. Use the Task 1 capture runner against the local preview and save `/tmp/site-preview.png`. Convert:

```bash
WT=/Users/codepi/Coding/dsh-plugins/.worktrees/readme-product-gallery
cwebp -quiet -q 84 /tmp/site-preview.png -o "$WT/apps/website/public/site-preview.webp"
magick identify "$WT/apps/website/public/site-preview.webp"
```

Expected: the local homepage at 1440×900, no deployment, no CloudBase write.

- [ ] **Step 4: Rewrite the website README pair around package purpose and preview**

Use these section orders:

```text
README.md: Preview → Develop locally → Structure → Deployment boundary → Product documentation
README.zh.md: 预览 → 本地开发 → 结构 → 部署边界 → 产品文档
```

Reference `public/site-preview.webp`. Preserve the exact CloudBase environment, `dsh/` deployment directory, custom-domain origin-path requirement, locale structure, and warning that the default CloudBase URL does not match base `/`.

- [ ] **Step 5: Verify and commit CLI/website docs**

Run:

```bash
cd /Users/codepi/Coding/dsh-plugins/.worktrees/readme-product-gallery
node /tmp/check-readme-images.mjs apps/website/README.md apps/website/README.zh.md
pnpm --dir apps/website build
git diff --check -- apps/cli apps/website
git add apps/cli/README.md apps/cli/README.zh.md apps/website
git commit -m "docs(apps): focus CLI and website entry guides"
```

Expected: VitePress build exits 0, old JPEG guide references are gone, and no deployment command runs.

### Task 10: Privacy audit, full documentation gates, and final review

**Files:**
- Modify only when a check finds a concrete issue in the scoped README/assets.
- Read: all files changed since `fcb6a80`.

**Interfaces:**
- Consumes: Tasks 2–9.
- Produces: verified final branch, explicit blocker report, and clean handoff.

- [ ] **Step 1: Inventory every changed image and inspect dimensions/format**

Run:

```bash
cd /Users/codepi/Coding/dsh-plugins/.worktrees/readme-product-gallery
git diff --name-status fcb6a80..HEAD
find plugins apps/website/public -type f -name '*.webp' -print0 | xargs -0 magick identify
```

Expected: new functional captures are WebP; canonical plugin captures are no larger than the approved 1440×900 framing unless a bounded element screenshot is smaller.

- [ ] **Step 2: Review every new image for privacy and readability**

Open each new WebP at full size and at approximately 760px width. Reject and recapture any image containing:

```text
/Users/
/tmp/xiaotaozi-readme-demo
real bot/account/device names
bot IDs, app IDs, tokens, secrets, QR payloads, authorization codes
private session titles or message bodies
unrelated repository names or commits
loading spinners, clipped controls, unreadable text, or accidental focus state
```

The string **Peach Notes Demo** and the public demo file/commit text from Task 1 are allowed. Record any safety blocker in `/tmp/xiaotaozi-readme-blockers.txt` and ensure the affected README does not reference a missing image.

- [ ] **Step 3: Check every scoped README image and old screenshot reference**

Run:

```bash
cd /Users/codepi/Coding/dsh-plugins/.worktrees/readme-product-gallery
node /tmp/check-readme-images.mjs \
  README.md README.zh.md \
  apps/cli/README.md apps/cli/README.zh.md \
  apps/website/README.md apps/website/README.zh.md \
  plugins/*/README.md plugins/*/README.zh.md
rg -n 'models\.jpg|add-provider\.jpg|imbot\.png|welcome\.png|/models\.jpg|/imbot\.jpg|/market\.jpg|/workbench\.jpg' \
  README.md README.zh.md apps plugins || true
```

Expected: image checker exits 0 and the old screenshot search returns no matches. Icon/IP images such as `docs/ip.jpg` remain valid and are not part of this stale-reference search.

- [ ] **Step 4: Compare English/Chinese structure and contract literals**

Run:

```bash
cd /Users/codepi/Coding/dsh-plugins/.worktrees/readme-product-gallery
for base in README apps/cli/README apps/website/README \
  plugins/providers/README plugins/im/README plugins/wecom-office/README \
  plugins/xtz-ui/README plugins/sidebar/README plugins/market/README; do
  echo "--- $base ---"
  rg '^## ' "$base.md"
  rg '^## ' "$base.zh.md"
done
rg -n '\^22\.19\.0|>=24\.0\.0|0\.1\.1-rc\.2|3080|3081|\.dsh-home|~/.dsh' \
  README.md README.zh.md apps/cli/README*.md plugins/*/README*.md
```

Expected: paired heading order matches semantically and required contract literals remain truthful.

- [ ] **Step 5: Run repository and website gates**

Run:

```bash
cd /Users/codepi/Coding/dsh-plugins/.worktrees/readme-product-gallery
pnpm check
pnpm --dir apps/website build
git diff --check fcb6a80..HEAD
git status --short --branch
```

Expected: both commands exit 0; diff check is clean. Any modified file is either an intentional final correction or reported before completion.

- [ ] **Step 6: Commit any final concrete corrections**

If Step 1–5 required corrections, run:

```bash
cd /Users/codepi/Coding/dsh-plugins/.worktrees/readme-product-gallery
git add README.md README.zh.md apps/cli apps/website plugins/*/README.md plugins/*/README.zh.md plugins/*/docs
git commit -m "docs(repo): finish README gallery verification"
```

If no correction was needed, do not create an empty commit.

- [ ] **Step 7: Produce the execution handoff**

Report:

```text
branch and worktree path
capture SHA
README pairs changed
new/replaced/deleted screenshot assets by plugin
pnpm check exit code
VitePress build exit code
blocked captures and why
confirmation that official ~/.dsh and 3080 were untouched
whether the hub sandbox was started by this task or already running
```

Do not push, open a PR, merge, or clean the worktree until the user requests the integration step.
