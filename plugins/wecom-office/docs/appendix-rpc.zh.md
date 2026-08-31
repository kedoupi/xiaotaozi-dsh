# 附录 B：办公状态 HTTP 合同

路由：

```text
POST /_dsh/dsh-wecom-office/status
Content-Type: application/json
仅 loopback + Origin / Sec-Fetch-Site 校验
```

无 GET。所有动作一个 POST，body 含 `action`。调用方是 `dsh-im` 的企业微信机器人卡片；本包不再有独立设置页。

旧合同（独立设置页时代的 `select` / `qrStart` / `qrPoll` / `qrCancel` / `bindManual` / `clearStandalone` 与扫码字段）已随该页面删除，不再实现；下文是当前唯一合同。

---

## B.1 动作

| action | 谁调用 | 作用 |
| :-- | :-- | :-- |
| `status` 或不传 | 卡片渲染 / 重新检查 | 只读快照 |
| `activate` | 开通 / 设为办公机器人 / 重试 | 对 `botId` 做 `auth init`；失败回滚原身份 |
| `configure` | 当前办公机器人卡片 | `{ field: "allowWrite" \| "guidance", value: boolean }` |

`activate` 必须带非空 `botId`。未知 action / 未知 configure field → 400。

Secret 出现在任何请求或响应里都是缺陷。响应里永远没有 secret、secretRef 或完整 `remoteBotId`。

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
  botId: string;           // IM: wecom_<digest>；旧 standalone 数据: office_<digest>
  remoteBotIdMasked: string;
  name: string;
  source: "im" | "standalone";  // standalone 仅旧数据兼容读取
  listed: true;
}

interface OfficeStatusPayload {
  ok: boolean;
  imAvailable: boolean;
  cliInstalled: boolean;
  cliVersion?: string;
  mainStatus: OfficeMainStatus;
  selectedBotId: string;   // 旧设置页遗留字段，兼容保留
  activeBotId: string;
  authorized: boolean;
  bots: OfficeBotOption[];
  qr: null;                // 独立扫码已删；字段保留恒为 null
  lastError?: { code: string; message: string };
  configDir: string;
  cliPath: string;
  writable: boolean;       // 会话权限，与「允许修改企微数据」无关
  allowWrite: boolean;
  guidance: boolean;
}
```

`mainStatus` 与 PRD §5.2 卡片状态对应：`cli-missing` → 未安装 CLI；`unbound` / `inactive` → 未开通；`activate-failed` / `bound-activate-failed` → 开通失败可重试；`active` → 已开通。

---

## B.3 `imAvailable`

IM client 调路由时把探测结果带为 `imAvailableHint`（或 `imAvailable`）。Host 快照的 `imAvailable` 为：

```text
imAvailable = hint OR (Cordis registry 里有名为 im / dsh-im 的已加载插件)
```

**磁盘存在 `integrations/dsh-wecom/config.json` 不算有 IM。**

有 IM 时 Host 读该 JSON 填 `bots`。无 IM 时 `bots` 最多一项旧 standalone 数据（只读兼容）。

---

## B.4 安全

- loopback-only：非回环来源 403。
- same-origin：Origin / Sec-Fetch-Site 校验，失败 403。
- 仅 POST + `application/json` body；其他方法 405，非 JSON 415；body 上限 16KB。
- 错误消息经 `publicErrorMessage` 清洗；`cli-failed` 带 errcode/errmsg 但不含 secret 或路径外信息。
- 响应头：`no-store`、`nosniff`、`cross-origin-resource-policy: same-origin`、`referrer-policy: no-referrer`。

---

## B.5 卡片显示约束

卡片只显示名字 + 打码 Bot ID +「当前办公」。不展示 IM WebSocket 在线/离线，办公插件不猜测连接状态；办公身份不跟随消息来源 bot。
