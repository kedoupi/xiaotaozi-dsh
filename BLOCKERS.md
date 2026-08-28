# BLOCKERS

## 当前状态：无实现 blocker；本机 cold-start 有外部状态限制

- 2026-08-28，user 回复“全部”，已明确批准执行 `BACKLOG.md` 原 1–10；此前“未指定获批条目”的阻塞已解除。
- 自动集成 gate 已完成，不需要扩大业务范围。
- 本机 `pnpm smoke:sandbox` 未成功启动：固定 3081 被另一 checkout 的 sandbox 占用。`scripts/smoke-sandbox.mjs#assertSandboxPortEmpty` 在任何写入/构建前安全拒绝，未杀该进程、未碰 official；PR #3 clean Ubuntu `sandbox-smoke` 已通过。按约束不能抢占或停止不属于本 checkout 的 sandbox。
- Website 的 Vite major 安全升级不是 blocker：它被本轮“不要 major upgrade”约束明确延期，当前 audit 告警保留在 `RISKS.md#9-未消除Website-审计告警与生产暴露未知`。
- Market 真实 add/remove、外部 Provider/IM/WeCom、浏览器 WebSocket 等未实跑项属于已知未知，不冒充完成，也不阻塞本轮有边界的修复交付；详见 `PROGRESS.md` 与 `RISKS.md`。
