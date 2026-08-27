import { useCallback, useEffect, useState, type JSX } from "react";
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import type {} from "@deepseek-ai/dsh-client-ui-slots";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import { IM_HUB_ENTRY_ATTR, OFFICE_STATUS_ROUTE, PLUGIN_ID, SETTINGS_TITLE } from "../names.ts";
import { isOfficeStatusPayload, type OfficeMainStatus, type OfficeStatusPayload } from "../office-types.ts";
import { css } from "./styles.ts";

export const name = PLUGIN_ID;
export const inject = ["slots", "locale"];

function detectImAvailable(): boolean {
  return typeof document !== "undefined" && document.querySelector(`[${IM_HUB_ENTRY_ATTR}]`) !== null;
}

function ensureStyles(): () => void {
  const existing = document.querySelector('style[data-plugin-css="dsh-wecom-office"]');
  if (existing !== null) return () => {};
  const node = document.createElement("style");
  node.dataset.pluginCss = "dsh-wecom-office";
  node.textContent = css;
  document.head.append(node);
  return () => node.remove();
}

const STATUS_LABEL: Record<OfficeMainStatus, string> = {
  "cli-missing": "未安装 wecom-cli",
  unbound: "尚未绑定企业微信机器人",
  inactive: "未开通",
  "bound-activate-failed": "已绑定，开通失败",
  "activate-failed": "开通失败",
  active: "已开通",
};

function statusColor(status: OfficeMainStatus | undefined): string {
  if (status === "active") return "var(--dshWo-ok)";
  if (status === "cli-missing" || status === "unbound") return "var(--dshWo-warn)";
  if (status === "activate-failed" || status === "bound-activate-failed") return "var(--dshWo-danger)";
  return "var(--dshWo-warn)";
}

async function post(payload: Record<string, unknown>): Promise<OfficeStatusPayload> {
  const response = await fetch(OFFICE_STATUS_ROUTE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...payload, imAvailableHint: detectImAvailable() }),
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("企业微信办公服务返回了无效数据。");
  }
  if (isOfficeStatusPayload(body)) return body;
  const record = typeof body === "object" && body !== null ? body as Record<string, unknown> : undefined;
  const message = typeof record?.error === "string" && record.error.trim()
    ? record.error
    : `企业微信办公请求失败（HTTP ${String(response.status)}）。`;
  throw new Error(message);
}

function showQr(status: OfficeStatusPayload): boolean {
  if (status.imAvailable) return false;
  const qr = status.qr;
  return Boolean(qr?.qrCodeDataUrl) && (qr?.status === "pending" || qr?.status === "refreshing" || qr?.status === "connecting");
}

function primaryLabel(status: OfficeStatusPayload | null): string {
  if (!status || !status.cliInstalled) return "开通办公能力";
  if (status.imAvailable && status.bots.length === 0) return "去绑定企业微信";
  if (!status.imAvailable && status.bots.length === 0) return "扫码绑定";
  if (!status.imAvailable && (status.mainStatus === "bound-activate-failed" || status.mainStatus === "activate-failed")) {
    return "重试开通";
  }
  if (status.imAvailable && status.selectedBotId && status.selectedBotId !== status.activeBotId) {
    return "开通这只机器人";
  }
  if (status.mainStatus === "active") return "重新开通";
  return "开通办公能力";
}

export function OfficeSettingsPanel(): JSX.Element {
  const [status, setStatus] = useState<OfficeStatusPayload | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [remoteBotId, setRemoteBotId] = useState("");
  const [secret, setSecret] = useState("");
  const [notice, setNotice] = useState<string>();

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      setStatus(await post({ action: "status" }));
    } catch {
      setStatus(null);
    } finally {
      setLoaded(true);
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let last = detectImAvailable();
    const sync = () => {
      const next = detectImAvailable();
      if (next === last) return;
      last = next;
      const action = next ? { action: "qrCancel" } : { action: "status" };
      void post(action).then(setStatus).catch(() => undefined);
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true });
    const interval = window.setInterval(sync, 1000);
    const timeout = window.setTimeout(() => window.clearInterval(interval), 15_000);
    return () => {
      observer.disconnect();
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    const qr = status?.qr;
    if (status?.imAvailable || !qr || (qr.status !== "pending" && qr.status !== "refreshing" && qr.status !== "connecting")) {
      return undefined;
    }
    const timer = setInterval(() => {
      void post({ action: "qrPoll", attemptId: qr.attemptId }).then(setStatus).catch(() => undefined);
    }, Math.max(500, qr.pollIntervalMs));
    return () => clearInterval(timer);
  }, [status?.imAvailable, status?.qr?.attemptId, status?.qr?.status, status?.qr?.pollIntervalMs]);

  const run = async (payload: Record<string, unknown>) => {
    setBusy(true);
    setNotice(undefined);
    try {
      const next = await post(payload);
      setStatus(next);
      if (next.lastError) setNotice(next.lastError.message);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const onPrimary = () => {
    if (!status?.cliInstalled) return;
    if (status.imAvailable && status.bots.length === 0) {
      const entry = document.querySelector(`[${IM_HUB_ENTRY_ATTR}]`);
      if (entry instanceof HTMLElement) entry.click();
      setNotice("在浮层左侧点「企业微信」，用扫码或手动接入。完成后回到本页点检查，再开通。");
      return;
    }
    if (!status.imAvailable && status.bots.length === 0) {
      void run({ action: "qrStart" });
      return;
    }
    const botId = status.selectedBotId || status.bots[0]?.botId;
    if (!botId) return;
    void run({ action: "activate", botId });
  };

  if (!loaded) {
    return <div className="dshWo-wrap"><p className="dshWo-intro" style={{ padding: 16 }}>加载中…</p></div>;
  }
  if (status === null) {
    return <div className="dshWo-wrap"><p className="dshWo-intro" style={{ padding: 16 }}>这个浏览器会话里企业微信办公不可用。</p></div>;
  }

  const intro = status.imAvailable
    ? "开通后可在对话里查日程、文档和会议。聊天仍在「IM机器人」。"
    : "开通后可在对话里查日程、文档和会议。若要在企业微信里跟机器人说话，再装 IM 机器人。现在没有 IM，就在本页扫码或填凭据。";
  const disabled = busy || !status.cliInstalled;

  return (
    <div className="dshWo-wrap">
      <div className="dshWo-body">
        <div className="dshWo-pane">
          <div>
            <h2 className="dshWo-title">{SETTINGS_TITLE}</h2>
            <p className="dshWo-intro">{intro}</p>
            {status.imAvailable && status.bots.length > 0 ? (
              <p className="dshWo-note">对话里查日程和文档时，用下面选中的这只机器人。</p>
            ) : null}
          </div>
          <div className="dshWo-card">
            <div className="dshWo-statusHead">
              <span className="dshWo-dot" style={{ background: statusColor(status.mainStatus) }} aria-hidden="true" />
              <strong>{STATUS_LABEL[status.mainStatus]}</strong>
            </div>
            {status.mainStatus === "cli-missing" ? (
              <p className="dshWo-note">请先执行 <code>npm install -g @wecom/cli</code>，然后点检查。</p>
            ) : null}
            {status.lastError ? <p className="dshWo-err" role="alert">{status.lastError.message}</p> : null}
            {notice ? <p className="dshWo-note" role="status">{notice}</p> : null}
          </div>
          {status.bots.length > 0 ? (
            <label className="dshWo-card">
              <span className="dshWo-note">企业微信机器人</span>
              {status.imAvailable ? (
                <select
                  className="dshWo-select"
                  value={status.selectedBotId}
                  disabled={busy}
                  onChange={(event) => void run({ action: "select", botId: event.target.value })}
                >
                  {status.bots.map((bot) => (
                    <option key={bot.botId} value={bot.botId}>
                      {bot.name} · {bot.remoteBotIdMasked}{bot.botId === status.activeBotId ? " · 当前办公" : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="dshWo-intro">{status.bots[0]?.name} · {status.bots[0]?.remoteBotIdMasked}</p>
              )}
            </label>
          ) : null}
          {showQr(status) ? (
            <div className="dshWo-card">
              <img className="dshWo-qr" src={status.qr?.qrCodeDataUrl} alt="企业微信办公绑定二维码" />
              <ol className="dshWo-ol">
                <li>打开企业微信 App，扫描二维码</li>
                <li>确认创建智能机器人</li>
                <li>返回这里等待开通完成</li>
              </ol>
              <div className="dshWo-actions">
                <button type="button" className="dshWo-btn" disabled={busy} onClick={() => void run({ action: "qrCancel" })}>取消</button>
              </div>
            </div>
          ) : null}
          <div className="dshWo-actions">
            <button type="button" className="dshWo-btn is-primary" disabled={disabled} onClick={onPrimary}>
              {primaryLabel(status)}
            </button>
            {status.bots.length === 0 ? (
              <button type="button" className="dshWo-btn" disabled={disabled} onClick={() => setManualOpen((open) => !open)}>
                {manualOpen ? "收起手动接入" : "手动接入"}
              </button>
            ) : null}
            <button type="button" className="dshWo-btn" disabled={busy} onClick={() => void refresh()}>检查</button>
          </div>
          {manualOpen ? (
            <div className="dshWo-card">
              <input className="dshWo-input" placeholder="Bot ID" value={remoteBotId} onChange={(event) => setRemoteBotId(event.target.value)} autoComplete="off" />
              <input className="dshWo-input" placeholder="Secret" type="password" value={secret} onChange={(event) => setSecret(event.target.value)} autoComplete="new-password" />
              <button
                type="button"
                className="dshWo-btn is-primary"
                disabled={disabled || remoteBotId.trim() === "" || secret.trim() === ""}
                onClick={() => void run({ action: "bindManual", remoteBotId, secret })}
              >
                绑定并开通
              </button>
            </div>
          ) : null}
          <details className="dshWo-details">
            <summary>高级</summary>
            <div className="dshWo-stack">
              <label className="dshWo-note">
                <input
                  type="checkbox"
                  checked={status.allowWrite === true}
                  disabled={busy || !status.writable}
                  onChange={(event) => void run({ action: "configure", field: "allowWrite", value: event.target.checked })}
                /> 允许修改企业微信数据（文档、日程、会议、待办、邮件、微盘、发消息）
              </label>
              <p className="dshWo-note">CLI 路径：{status.cliPath}</p>
              <p className="dshWo-note">configDir：{status.configDir}</p>
              {!status.imAvailable && status.bots.length > 0 ? (
                <button type="button" className="dshWo-btn" disabled={busy} onClick={() => void run({ action: "clearStandalone" })}>
                  清除办公身份
                </button>
              ) : null}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ensureStyles(), "dsh-wecom-office css");
  const Panel = (): JSX.Element => <OfficeSettingsPanel />;
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "wecom-office",
    order: 46,
    label: () => (ctx.locale.getLocale().active === "en" ? "WeCom Office" : SETTINGS_TITLE),
  }, Panel));
}
