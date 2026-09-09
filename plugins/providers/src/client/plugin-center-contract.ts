import type {} from "@deepseek-ai/dsh-client-ui-slots";

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface SlotMap {
    /** Pinned RC1 ui-layout declaration (not a new runtime slot). */
    "shell.overlay": { kind: "list"; scope: "root" };
    "xiaotaozi.plugin-center.detail": { kind: "keyed"; scope: "root" };
  }
}
