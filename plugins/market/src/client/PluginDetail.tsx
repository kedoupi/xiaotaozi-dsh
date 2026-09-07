import { useEffect, useRef, useState, type ReactNode } from "react";
import { PROFILE_SOURCE_ID, type CatalogEntry, type InstalledPlugin } from "../catalog.ts";
import type { CatalogSnapshot } from "./api.ts";
import { Icon, entryIconName } from "./icons.tsx";
import type { InstallPresentation } from "./install-presentation.ts";
import type { MarketKey } from "./locales.ts";
import type { RuntimeState } from "./plugin-inventory.ts";
import { RemoveConfirmation } from "./RemoveConfirmation.tsx";

const RUNTIME_LABELS: Record<RuntimeState, MarketKey> = {
  running: "running", loading: "runtimeLoading", error: "runtimeError", disabled: "disabled", unknown: "runtimeUnknown",
};

export type DetailTarget = { kind: "catalog"; entry: CatalogEntry } | { kind: "installed"; entry: InstalledPlugin };

export function PluginDetail({ target, snapshot, presentation, runtimeState, configuration, mutationDisabled = false, t, onBack, onQueue }: {
  target: DetailTarget;
  snapshot: CatalogSnapshot;
  presentation: InstallPresentation;
  runtimeState: RuntimeState;
  configuration?: ReactNode;
  mutationDisabled?: boolean;
  t: (key: MarketKey) => string;
  onBack: () => void;
  onQueue: (entryId: string, sourceId: string, action: "install" | "remove") => void;
}): JSX.Element {
  const { entry } = target;
  const catalog = target.kind === "catalog" ? target.entry : snapshot.entries.find(row => row.id === target.entry.catalogEntryId);
  const source = snapshot.sources.find(row => row.id === catalog?.sourceId);
  const detailRef = useRef<HTMLHeadingElement>(null);
  const removeTriggerRef = useRef<HTMLButtonElement>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const action = presentation.retryable ? presentation.action : target.kind === "installed" ? "remove" : "install";
  const active = presentation.status === "installing" || presentation.status === "retrying";
  const blocked = mutationDisabled || active || presentation.status === "queued";
  const installSpec = entry.installSpec?.trim();
  const installOrigin = !installSpec ? t("installSourceUndeclared")
    : /^(?:github:|git(?:\+|:))/.test(installSpec) ? t("upstreamGit") : t("upstreamNpm");
  const sourceRisk = source?.builtin === true ? t("bundledSourceRisk")
    : source === undefined ? t("unknownSourceRisk") : t("externalSourceRisk");
  const queue = (): void => {
    if (!blocked) onQueue(entry.id, target.kind === "installed" ? PROFILE_SOURCE_ID : target.entry.sourceId, action);
  };
  useEffect(() => { detailRef.current?.focus({ preventScroll: true }); }, [entry.id]);
  return (
    <div className="dsh-market-detail">
      <button type="button" className="dsh-market-back" onClick={onBack}><Icon name="arrowLeft" size={14} />{t("back")}</button>
      <div className="dsh-market-detail-head">
        <span className="dsh-market-icon-tile"><Icon name={entryIconName(catalog?.id ?? entry.id, catalog?.kind ?? "plugin")} size={30} /></span>
        <div className="dsh-market-detail-titles">
          <h2 ref={detailRef} className="dsh-market-detail-name" tabIndex={-1}>{entry.name}</h2>
          <div className="dsh-market-detail-badges">
            <span className="dsh-market-chip">{catalog?.kind === "workflow" ? t("kindWorkflow") : t("kindPlugin")}</span>
            {presentation.status !== "idle" && <span className="dsh-market-chip" data-status={presentation.status} data-tone={presentation.tone}
              data-kind={presentation.tone === "success" ? "installed" : presentation.tone === "danger" ? "failed" : "queued"}>
              <Icon name={presentation.tone === "success" ? "check" : presentation.tone === "danger" ? "close" : "clock"} size={12} />{t(presentation.label)}
            </span>}
          </div>
        </div>
      </div>
      {catalog && <p className="dsh-market-detail-summary">{catalog.summary}</p>}
      <div className="dsh-market-meta">
        {entry.version && <span>{t(catalog ? "catalogVersion" : "version")} <b>v{entry.version}</b></span>}
        <span>{t("source")} <b>{target.kind === "installed" && target.entry.source === "external" ? t("externalInstall") : source?.label ?? catalog?.sourceId ?? t("installSourceUndeclared")}</b></span>
        {target.kind === "installed" && <span>{t(RUNTIME_LABELS[runtimeState])}</span>}
      </div>
      <div className="dsh-market-install-info">
        <span>{t("installOrigin")} <b>{target.kind === "installed" && target.entry.source === "external" ? t("externalInstall") : installOrigin}</b></span>
        {installSpec && <>
          <span>{t("installSpec")} <code>{installSpec}</code></span>
          {target.kind === "catalog" && <span>{t("installCommand")} <code>dsh plugin --profile web add {installSpec}</code></span>}
        </>}
      </div>
      <section className="dsh-market-risk">
        <h3>{t("riskCompatibility")}</h3>
        <p>{sourceRisk} {t("reviewSourceRisk")}</p>
        <p>{t("compatibilityUndeclared")}</p>
      </section>
      {target.kind === "installed" && <p className="dsh-market-note">{t("runHint")}</p>}
      {configuration !== undefined && <section className="dsh-market-configuration" aria-label={t("configure")}><h3>{t("configure")}</h3>{configuration}</section>}
      <button ref={removeTriggerRef} type="button" className="dsh-market-install" data-variant={action === "remove" ? "danger" : undefined}
        disabled={blocked} aria-busy={active}
        aria-label={`${presentation.retryable ? t("retry") : action === "install" ? t("install") : t("remove")}: ${entry.name}`}
        onClick={() => { if (blocked) return; if (action === "remove") setConfirmingRemove(true); else queue(); }}>
        <Icon name={active ? "clock" : action === "install" ? "download" : "trash"} size={15} />
        {presentation.retryable ? t("retry") : active || presentation.status === "queued" ? t(presentation.label) : action === "install" ? t("install") : t("remove")}
      </button>
      {presentation.status === "failed" && presentation.detail && (
        <p className="dsh-market-error">{presentation.detail}</p>
      )}
      {presentation.status === "queued" && <p className="dsh-market-note">{t("queuedNote")}</p>}
      {confirmingRemove && <RemoveConfirmation entry={entry} t={t} trigger={removeTriggerRef.current} confirmedFocus={detailRef.current}
        onCancel={() => setConfirmingRemove(false)} onConfirm={() => { setConfirmingRemove(false); queue(); }} />}
    </div>
  );
}
