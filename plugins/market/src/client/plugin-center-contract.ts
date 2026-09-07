import type {} from "@deepseek-ai/dsh-client-ui-slots";

export const DETAIL_SLOT = "xiaotaozi.plugin-center.detail";

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface SlotMap {
    "xiaotaozi.plugin-center.detail": { kind: "keyed"; scope: "root" };
    // Exact DSH 0.1.1-rc.2 type mirror; the host declares this at runtime.
    "shell.overlay": { kind: "list"; scope: "root" };
  }
}
