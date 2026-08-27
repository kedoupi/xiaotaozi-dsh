# 附录 B：设置页 HTTP 合同与扫码字段

路由（对齐 memory）：

```text
POST /_dsh/dsh-wecom-office/status
Content-Type: application/json
仅 loopback + 与 memory 相同的 Origin / Sec-Fetch-Site 校验
```

无 GET。所有动作一个 POST，body 含 `action`。

---

## B.1 动作

| action | 谁调用 | 作用 |
| :-- | :-- | :-- |
| `status` 或不传 | 打开页面 / 检查 | 只读快照 |
| `activate` | 开通 / 开通这只 / 重试开通 | 对 `botId` 做 `auth init` |
| `select` | 改下拉（未点开通） | 只写 `selectedBotId`，不改 CLI 凭据 |
| `qrStart` | 无 IM 扫码 | 开始官方 QR |
| `qrPoll` | 无 IM 轮询 | 与 IM 相同 TTL/间隔 |
| `qrCancel` | 无 IM 取消扫码 | — |
| `bindManual` | 无 IM 或有 IM 逃生门 | `{ remoteBotId, secret }`，Host 写入 office 或走 activate |
| `clearStandalone` | 无 IM 清除身份 | 清 office secretRef + CLI 凭据 |

`secret` 只出现在 `bindManual` 的 **请求** 里（loopback）。响应里永远没有 secret。

---

## B.2 快照（所有成功响应都带，动作用更新后的快照）

```ts
type OfficeMainStatus =
  | "cli-missing"
  | "unbound"
  | "inactive"
  | "bound-activate-failed"
  | "activate-failed"
  | "active";

interface OfficeBotOption {
  botId: string;           // IM: wecom_<digest>；无 IM: office_<digest>
  remoteBotIdMasked: string;
  name: string;
  source: "im" | "standalone";
  /** 第一刀不表示 WebSocket 是否在线，只表示出现在可选列表里 */
  listed: true;
}

interface OfficeQrView {
  attemptId: string;
  status: "pending" | "refreshing" | "connecting" | "connected" | "failed" | "cancelled";
  expiresAt: number;
  pollIntervalMs: number;
  qrRevision: number;
  qrCodeDataUrl?: string;  // data:image/png;base64,...
  error?: { code: string; message: string };
}

interface OfficeStatusPayload {
  ok: boolean;
  imAvailable: boolean;
  cliInstalled: boolean;
  cliVersion?: string;
  mainStatus: OfficeMainStatus;
  selectedBotId: string;
  activeBotId: string;
  authorized: boolean;
  bots: OfficeBotOption[];
  qr: OfficeQrView | null;
  lastError?: { code: string; message: string };
  configDir: string;
  cliPath: string;
  writable: boolean;       // 本页能否改设置（会话权限），与「允许修改企微数据」无关
}
```

`mainStatus` 与 PRD §5.3 对应：`cli-missing` / `unbound` / `inactive` / `bound-activate-failed` / `activate-failed` / `active`。

---

## B.3 `imAvailable`（冻）

Client 打开页时把探测结果 POST 为 `imAvailableHint`。Host 快照的 `imAvailable` 为：

```text
imAvailable = imAvailableHint OR (Cordis registry 里有名为 im / dsh-im 的已加载插件)
```

Host 侧 OR 是为了避免设置页先于 IM 侧栏入口挂上时误走无 IM 扫码。  
**磁盘存在 `integrations/dsh-wecom/config.json` 不算有 IM。**

Client 规则：

```text
imAvailableHint = document.querySelector('[data-im-hub-entry]') != null
```

该属性由 `dsh-im` 侧栏入口写入（`plugins/im/src/client/sidebar-entry.ts` `IM_ENTRY_ATTR`）。Client 在入口晚到时再探测一次并 POST `qrCancel` / `status`。

有 IM 时 Host 仍读该 JSON 填 `bots`。无 IM 时 `bots` 最多一项 `source: "standalone"`。

---

## B.4 打开 IM 浮层（第一刀，冻）

`openImHub()` 是 `dsh-im` **模块内**函数，默认渠道 state 是 `weixin`，**没有**「打开并选中企业微信」的公开 API。第一刀 **不改 dsh-im**。

「去绑定企业微信」行为：

1. 文案主路径：请用户点侧栏 **IM机器人**，再在浮层左侧点 **企业微信**。  
2. 辅助：若存在 `[data-im-hub-entry]`，对它 `click()`（与用户手点侧栏同一效果）。  
3. **不**程序化选中企业微信 tab。  
4. **不**自动关设置、**不**自动跳回设置（FR-IM-5 降级）。

第二刀再改 IM：`openImHub({ channel: 'wecom' })` + 顶条回跳。

---

## B.5 官方扫码 poll（无 IM，从 IM 源码抄死）

与 `plugins/im/src/channels/wecom/qr-auth.ts` 相同：

| | URL |
| :-- | :-- |
| 生成 | `GET https://work.weixin.qq.com/ai/qc/generate?source=dsh-wecom-office&plat=<1\|2\|3>` |
| 轮询 | `GET https://work.weixin.qq.com/ai/qc/query_result?scode=<scode>` |

`plat`：mac=1，win=2，linux=3。TTL 5 分钟，poll 3 秒。

`auth_url` 必须 `https://work.weixin.qq.com` 且无非 443 端口，否则丢弃。

poll `data.status`（大小写不敏感）：

| status | 本包 |
| :-- | :-- |
| `success` | 读 `data.bot_info.botid` + `bot_info.secret`（缺一则失败）。可选 `name` / `bot_name` / `nickname` |
| `expired` / `timeout` | `expired` |
| `fail` / `failed` / `error` | `failed` |
| 其他 | `waiting` |

success 的 secret **只进** `ctx.credentials.set('DSH_WECOM_OFFICE_BOT_SECRET_<DIGEST>')`，再 `auth init`。不要出现在 RPC 响应。

QR 图：Host 把 `auth_url` 编成二维码 data URL 放在 `qr.qrCodeDataUrl`（与 IM 设置页相同），Client 不直接打开腾讯页也行；IM 用 verificationUrl 生成图。无 IM 第一刀：Host 用与 IM 相同方式出 `qrCodeDataUrl`（可依赖 `qrcode` 包，或返回 https URL 让 Client 自己画——**冻：Host 返回 data URL**，Client 只 `<img>`）。

---

## B.6 下拉「在线」

第一刀 **不展示** IM WebSocket 在线/离线。选项只显示名字 + 打码 Bot ID +「当前办公」。避免办公插件猜测连接状态。
