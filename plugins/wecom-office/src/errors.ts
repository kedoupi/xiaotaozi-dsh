export type OfficeErrorCode =
  | "cli-missing"
  | "unauthorized"
  | "im-bot-missing"
  | "im-unavailable"
  | "secret-missing"
  | "write-disabled"
  | "service-disabled"
  | "cli-failed"
  | "invalid-args"
  | "qr-failed"
  | "qr-expired"
  | "layout-rejected"
  | "local-file-denied";

export class OfficeError extends Error {
  readonly code: OfficeErrorCode;
  readonly errcode?: unknown;
  readonly errmsg?: string;

  constructor(code: OfficeErrorCode, message: string, extras: { errcode?: unknown; errmsg?: string } = {}) {
    super(message);
    this.name = "OfficeError";
    this.code = code;
    this.errcode = extras.errcode;
    this.errmsg = extras.errmsg;
  }
}

export function publicErrorMessage(error: unknown): { code: string; message: string } {
  if (error instanceof OfficeError) {
    return { code: error.code, message: error.message };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { code: "cli-failed", message: message.slice(0, 240) };
}

export const USER_MESSAGES: Record<OfficeErrorCode, string> = {
  "cli-missing": "未安装 wecom-cli。请先执行 npm install -g @wecom/cli，然后点检查。",
  unauthorized: "请先在 IM 机器人管理的企业微信机器人卡片里点“开通办公能力”。",
  "im-bot-missing": "选中的企业微信机器人已不在 IM 列表里，请重新选择后开通。",
  "im-unavailable": "暂时打不开 IM 机器人管理，请稍后重试。",
  "secret-missing": "凭据缺失，请在 IM 机器人卡片里移除后重新绑定。",
  "write-disabled": "当前不能修改企业微信里的数据。",
  "service-disabled": "这项企业微信能力未启用。",
  "cli-failed": "企业微信办公调用失败。",
  "invalid-args": "参数不完整。",
  "qr-failed": "扫码绑定没有完成。",
  "qr-expired": "二维码已过期，请重新生成。",
  "layout-rejected": "正文不符合腾讯文档排版纪律，请按系统提示改写后再创建。",
  "local-file-denied": "本地文件只能来自当前会话工作区。",
};
