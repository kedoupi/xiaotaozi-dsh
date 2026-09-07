import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { PROFILE_SOURCE_ID, searchCatalog, tagsOf, type CatalogEntry, type InstalledPlugin } from "../catalog.ts";
import type { InstallIntent } from "../intents.ts";
import { loadCatalog, loadIntents, queueIntent, type CatalogSnapshot } from "./api.ts";
import type { CenterPageFace } from "./PluginCenterHost.tsx";
import { PluginDetail, type DetailTarget } from "./PluginDetail.tsx";
import { DETAIL_SLOT } from "./plugin-center-contract.ts";
import type { CenterLocation, CenterTab } from "./plugin-center-open.ts";
import { loadPluginInventory, runtimeStateFor, type InventoryEntry, type InventoryRemote, type RuntimeState } from "./plugin-inventory.ts";
import { Icon, entryIconName } from "./icons.tsx";
import { installPresentation, type InstallPresentation } from "./install-presentation.ts";
import type { MarketKey } from "./locales.ts";
import { PORTRAIT } from "./portrait.ts";

const RUNTIME_LABELS: Record<RuntimeState, MarketKey> = {
  running: "running", loading: "runtimeLoading", error: "runtimeError", disabled: "disabled", unknown: "runtimeUnknown",
};

type Translate = (key: MarketKey) => string;
type Action = "install" | "remove";
type Outcome = { entryId: string; action: Action };
const CAPABILITIES = [
  { id: "xiaotaozi", name: "capabilityXiaotaozi", summary: "summaryXiaotaozi" },
  { id: "side-workbench", name: "capabilityWorkbench", summary: "summaryWorkbench" },
  { id: "models", name: "capabilityModels", summary: "summaryModels" },
  { id: "im", name: "capabilityIm", summary: "summaryIm" },
] as const;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function PluginCenter({ ctx, center, t, onClose, renderSlot }: CenterPageFace): JSX.Element {
  const { location } = useSyncExternalStore(center.subscribe, center.getSnapshot, center.getSnapshot);
  useSyncExternalStore(listener => ctx.slots.subscribe(DETAIL_SLOT, listener), () => ctx.slots.getVersion(DETAIL_SLOT), () => 0);
  const available = new Set(ctx.slots.entriesOfSlot(DETAIL_SLOT).map(entry => entry.options.key));
  const [snapshot, setSnapshot] = useState<CatalogSnapshot>();
  const [intents, setIntents] = useState<InstallIntent[]>();
  const [catalogError, setCatalogError] = useState<string>();
  const [intentError, setIntentError] = useState<string>();
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState<string>();
  const busy = useRef(false);
  const generation = useRef(0);
  const readRevision = useRef(0);
  const [failure, setFailure] = useState<Outcome & { name: string; message: string }>();
  const [retryingId, setRetryingId] = useState<string>();
  const [latestCompletion, setLatestCompletion] = useState<Outcome>();
  const [announcement, setAnnouncement] = useState("");
  const [applied, setApplied] = useState<Outcome & { name: string; packageName?: string; warning: string; locked: boolean }>();
  const [refreshError, setRefreshError] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const [inventory, setInventory] = useState<readonly InventoryEntry[]>();
  const inventoryRequested = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const capabilityHeading = useRef<HTMLHeadingElement>(null);
  const tabRefs = useRef<Partial<Record<CenterTab, HTMLButtonElement | null>>>({});
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());
  const visits = useRef<Partial<Record<CenterTab, CenterLocation>>>({});
  const returnCard = useRef<string>();
  const restoreList = useRef(false);
  const focusListHeading = useRef(false);

  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => {
    let alive = true;
    const revision = readRevision.current;
    const isCurrent = (): boolean => alive && revision === readRevision.current;
    void loadCatalog().then(value => { if (isCurrent()) { setSnapshot(value); setCatalogError(undefined); } })
      .catch(error => { if (isCurrent()) setCatalogError(errorMessage(error)); });
    void loadIntents().then(value => { if (isCurrent()) { setIntents(value); setIntentError(undefined); } })
      .catch(error => { if (isCurrent()) setIntentError(errorMessage(error)); });
    return () => { alive = false; };
  }, [reloadKey]);
  useEffect(() => {
    if (latestCompletion === undefined) return;
    const timer = setTimeout(() => setLatestCompletion(current => current === latestCompletion ? undefined : current), 3_000);
    return () => clearTimeout(timer);
  }, [latestCompletion]);
  useLayoutEffect(() => {
    if (location.detail !== undefined && scrollRef.current) scrollRef.current.scrollTop = 0;
    if (location.detail?.kind === "capability") capabilityHeading.current?.focus({ preventScroll: true });
    if (location.detail !== undefined || !restoreList.current) return;
    restoreList.current = false;
    if (scrollRef.current) scrollRef.current.scrollTop = location.scrollTop;
    if (focusListHeading.current) headingRef.current?.focus({ preventScroll: true });
    else if (returnCard.current) cardRefs.current.get(returnCard.current)?.focus({ preventScroll: true });
    focusListHeading.current = false;
  }, [location]);

  const saveList = (): CenterLocation => {
    const current = center.getSnapshot().location;
    const value = { ...current, detail: undefined, scrollTop: scrollRef.current?.scrollTop ?? current.scrollTop };
    visits.current[current.tab] = value;
    return value;
  };
  const selectTab = (tab: CenterTab): void => {
    if (!location.detail) saveList();
    restoreList.current = true;
    returnCard.current = undefined;
    center.navigate(visits.current[tab] ?? { tab, query: "", tag: "", scrollTop: 0 });
  };
  const openDetail = (detail: NonNullable<CenterLocation["detail"]>, cardId: string): void => {
    returnCard.current = cardId;
    center.navigate({ ...saveList(), detail });
  };
  const back = (): void => { restoreList.current = true; center.navigate({ ...location, detail: undefined }); };
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.nativeEvent.isComposing) return;
    const next = event.key === "Home" ? "installed" : event.key === "End" ? "discover"
      : event.key === "ArrowLeft" || event.key === "ArrowRight" ? location.tab === "installed" ? "discover" : "installed" : undefined;
    if (!next) return;
    event.preventDefault(); selectTab(next); tabRefs.current[next]?.focus();
  };
  const rememberCard = (id: string, node: HTMLButtonElement | null): void => {
    if (node) cardRefs.current.set(id, node); else cardRefs.current.delete(id);
  };
  const installedMatch = (value: CatalogSnapshot, entryId: string, packageName?: string): InstalledPlugin | undefined =>
    value.installedPlugins.find(row => row.catalogEntryId === entryId || row.id === entryId)
      ?? value.installedPlugins.find(row => packageName !== undefined && row.packageName === packageName);
  const presentationFor = (entry: CatalogEntry | InstalledPlugin): InstallPresentation => {
    const alias = "catalogEntryId" in entry ? entry.catalogEntryId : undefined;
    const owns = (id: string | undefined): boolean => id !== undefined && (id === entry.id || id === alias);
    const pending = intents?.find(intent => owns(intent.entryId));
    return installPresentation({
      entryId: entry.id, installed: "installed" in entry ? entry.installed : true,
      pendingIntent: pending ? { ...pending, entryId: entry.id } : undefined,
      activeMutationId: owns(busyId) ? entry.id : undefined,
      lastFailedId: owns(failure?.entryId) ? entry.id : undefined, lastFailedAction: failure?.action,
      lastFailedDetail: owns(failure?.entryId) ? failure?.message : undefined,
      retryingId: owns(retryingId) ? entry.id : undefined,
      latestCompletion: owns(latestCompletion?.entryId) && latestCompletion ? { ...latestCompletion, entryId: entry.id } : undefined,
    });
  };
  const mutationDisabled = busyId !== undefined || refreshing || intents === undefined || intentError !== undefined || applied?.locked === true;
  const refreshApplied = async (outcome: NonNullable<typeof applied>): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    readRevision.current++;
    setRefreshing(true);
    const current = generation.current;
    try {
      const [value, queue] = await Promise.all([loadCatalog(), loadIntents()]);
      if (current !== generation.current) return;
      setSnapshot(value); setCatalogError(undefined); setIntents(queue); setIntentError(undefined); setRefreshError(undefined);
      const present = installedMatch(value, outcome.entryId, outcome.packageName) !== undefined;
      const settled = !queue.some(intent => intent.entryId === outcome.entryId);
      setApplied({ ...outcome, locked: !settled || present !== (outcome.action === "install") });
    } catch (error) {
      if (current === generation.current) setRefreshError(errorMessage(error));
    } finally {
      if (current === generation.current) { busy.current = false; setRefreshing(false); }
    }
  };
  const onQueue = (entryId: string, sourceId: string, action: Action): void => {
    if (busy.current || mutationDisabled || !snapshot || intents?.some(intent => intent.entryId === entryId)) return;
    const entry = sourceId === PROFILE_SOURCE_ID ? snapshot.installedPlugins.find(row => row.id === entryId) : snapshot.entries.find(row => row.id === entryId);
    if (!entry) return;
    busy.current = true;
    // Earlier browsing reads must not replace the mutation or its repaired snapshot.
    readRevision.current++;
    const current = generation.current;
    const retrying = failure?.entryId === entryId && failure.action === action;
    setBusyId(entryId); setRetryingId(retrying ? entryId : undefined); setLatestCompletion(undefined);
    setAnnouncement(`${entry.name}: ${t(retrying ? action === "install" ? "retryingInstall" : "retryingRemove" : action === "install" ? "installing" : "removing")}`);
    void queueIntent(entryId, sourceId, action).then(async result => {
      if (current !== generation.current) return;
      setIntents(result.intents);
      if (result.snapshot) setSnapshot(result.snapshot);
      if (result.error !== undefined && result.mutationApplied !== true) {
        setFailure({ entryId, action, name: entry.name, message: result.error });
        setAnnouncement(`${entry.name}: ${t(action === "install" ? "installFailed" : "removeFailed")}`);
        return;
      }
      setFailure(value => value?.entryId === entryId ? undefined : value);
      setLatestCompletion({ entryId, action });
      setAnnouncement(`${entry.name}: ${t(action === "install" ? "installCompleted" : "removeCompleted")}`);
      if (result.mutationApplied === true) {
        const outcome = { entryId, action, name: entry.name, packageName: entry.packageName, warning: result.error ?? t("appliedWarning"), locked: true };
        setApplied(outcome);
        busy.current = false;
        await refreshApplied(outcome);
        return;
      }
      if (action === "remove") {
        focusListHeading.current = true; restoreList.current = true;
        center.navigate({ tab: "installed", query: "", tag: "", scrollTop: 0 });
      } else if (result.snapshot) {
        const installed = installedMatch(result.snapshot, entryId, entry.packageName);
        if (installed) {
          if (!center.getSnapshot().location.detail) saveList();
          returnCard.current = installed.id;
          center.navigate({ tab: "installed", query: "", tag: "", scrollTop: 0, detail: { kind: "installed", id: installed.id } });
        }
      }
    }).catch(error => {
      if (current !== generation.current) return;
      setFailure({ entryId, action, name: entry.name, message: errorMessage(error) });
      setAnnouncement(`${entry.name}: ${t(action === "install" ? "installFailed" : "removeFailed")}`);
    }).finally(() => {
      if (current === generation.current) { busy.current = false; setBusyId(undefined); setRetryingId(undefined); }
    });
  };

  const selected = location.detail;
  const capability = selected?.kind === "capability" ? CAPABILITIES.find(row => row.id === selected.id) : undefined;
  let target: DetailTarget | undefined;
  if (snapshot && selected?.kind === "installed") {
    const entry = snapshot.installedPlugins.find(row => row.id === selected.id);
    if (entry) target = { kind: "installed", entry };
  } else if (snapshot && selected?.kind === "catalog") {
    const entry = snapshot.entries.find(row => row.id === selected.id);
    const installed = entry && installedMatch(snapshot, entry.id, entry.packageName);
    if (entry) target = installed && failure?.entryId !== entry.id ? { kind: "installed", entry: installed } : { kind: "catalog", entry };
  }
  useEffect(() => {
    if (inventoryRequested.current || (location.tab !== "installed" && target?.kind !== "installed")) return;
    inventoryRequested.current = true;
    const current = generation.current;
    void loadPluginInventory(ctx.get("remote") as InventoryRemote | undefined).then(value => {
      if (generation.current === current) setInventory(value);
    });
  }, [ctx, location.tab, target?.kind]);
  const selectedId = capability?.id ?? (target?.kind === "installed" ? target.entry.packageName : undefined);
  const embedded = selectedId !== undefined && available.has(selectedId);
  const unavailable = <p className="dsh-market-unavailable">{t("unavailable")} — {t("doctorHint")}</p>;
  const configuration = selectedId !== undefined ? renderSlot(DETAIL_SLOT, {}, { entryKey: selectedId, fallback: unavailable }) : undefined;
  const queueText = intents?.map(intent => `${snapshot?.entries.find(row => row.id === intent.entryId)?.name ?? snapshot?.installedPlugins.find(row => row.id === intent.entryId)?.name ?? intent.entryId}: ${t("queued")}`).join("; ");
  const statusText = [
    snapshot === undefined && !catalogError ? t("loading") : undefined,
    catalogError ? `${t("loadError")} ${catalogError}` : undefined,
    intentError ? `${t("intentLoadError")} ${intentError}` : undefined,
    failure && failure.entryId !== retryingId ? `${failure.name}: ${failure.message}` : undefined,
    applied ? `${applied.name}: ${t("appliedWarning")} ${applied.warning}` : undefined,
    refreshError, refreshing ? t("refreshing") : announcement || queueText,
  ].filter(Boolean).join(" ");
  const retryLoads = (): void => { if (busy.current) return; setCatalogError(undefined); setIntentError(undefined); setIntents(undefined); setReloadKey(value => value + 1); };
  const list = (tab: CenterTab): JSX.Element => {
    const entries = snapshot ? searchCatalog(snapshot.entries, location.query, location.tag) : [];
    const installed = snapshot?.installedPlugins.filter(row => row.name.toLocaleLowerCase().includes(location.query.toLocaleLowerCase())) ?? [];
    return <div className="dsh-market-list">
      <h2 ref={headingRef} tabIndex={-1}>{t(tab === "installed" ? "tabInstalled" : "tabDiscover")}</h2>
      {tab === "installed" && <section aria-label={t("builtIn")}><h3>{t("builtIn")}</h3><div className="dsh-market-capabilities">
        {CAPABILITIES.map(row => <button key={row.id} type="button" data-capability={row.id} className="dsh-market-capability"
          ref={node => rememberCard(row.id, node)} onClick={() => openDetail({ kind: "capability", id: row.id }, row.id)}>
          <Icon name={entryIconName(row.id, "plugin")} size={22} /><span>{t(row.name)}</span><span>{t(row.summary)}</span>
          <span>{available.has(row.id) ? t("builtIn") : `${t("unavailable")} — ${t("doctorHint")}`}</span>
        </button>)}
      </div></section>}
      {tab === "installed" && <h3>{t("thirdParty")}</h3>}
      {catalogError ? <p className="dsh-market-error">{t("loadError")}</p> : !snapshot ? <p>{t("loading")}</p> : <>
        <div className="dsh-market-discovery">
          <div className="dsh-market-search-field"><label htmlFor="dsh-market-search">{t("searchLabel")}</label><input id="dsh-market-search" className="dsh-market-search" type="search"
            value={location.query} placeholder={t("searchPlaceholder")} onChange={event => center.navigate({ ...location, query: event.target.value })} /></div>
          {tab === "discover" && <div className="dsh-market-tags">
            {["", ...tagsOf(snapshot.entries)].map(tag => <button key={tag} type="button" className="dsh-market-tag" aria-pressed={location.tag === tag} data-active={location.tag === tag}
              onClick={() => center.navigate({ ...location, tag: location.tag === tag ? "" : tag })}>{tag || t("allTags")}</button>)}
          </div>}
        </div>
        {(tab === "installed" ? installed.length : entries.length) === 0 ? <div className="dsh-market-empty"><span>{t(tab === "installed" && snapshot.installedPlugins.length === 0 ? "installedEmpty" : "empty")}</span>
          <button type="button" className="dsh-market-secondary" onClick={() => center.navigate({ ...location, query: "", tag: "" })}>{t("resetFilters")}</button></div>
          : <div className="dsh-market-grid">{tab === "installed" ? installed.map(entry => <article key={entry.id} className="dsh-market-card">
            <button type="button" id={`dsh-market-card-${entry.id}`} ref={node => rememberCard(entry.id, node)} className="dsh-market-card-open" aria-label={`${t("openDetails")}: ${entry.name}`}
              onClick={() => openDetail({ kind: "installed", id: entry.id }, entry.id)}><span className="dsh-market-card-name">{entry.name}</span>
              <span>{entry.source === "external" ? t("externalInstall") : snapshot.sources.find(source => source.id === snapshot.entries.find(row => row.id === entry.catalogEntryId)?.sourceId)?.label ?? t("installed")}</span>
              <span>{t(presentationFor(entry).label)}</span><span>{t(RUNTIME_LABELS[runtimeStateFor(entry.packageName, inventory)])}</span>
            </button></article>) : entries.map(entry => <Card key={entry.id} entry={entry} sourceLabel={snapshot.sources.find(source => source.id === entry.sourceId)?.label ?? entry.sourceId}
              presentation={presentationFor(entry)} disabled={mutationDisabled} t={t} buttonRef={node => rememberCard(entry.id, node)}
              onOpen={() => openDetail({ kind: "catalog", id: entry.id }, entry.id)} onQueue={(row, action) => onQueue(row.id, row.sourceId, action)} />)}</div>}
      </>}
    </div>;
  };
  return <section id="dsh-plugin-center" className="dsh-market-center" aria-labelledby="dsh-plugin-center-title">
    <header className="dsh-market-center-head"><span className="dsh-market-center-mark"><img src={PORTRAIT} alt="" width={36} height={36} /></span>
      <div className="dsh-market-center-titles"><h1 id="dsh-plugin-center-title" tabIndex={-1}>{t("nav")}</h1><p>{t("subtitle")}</p></div>
      <button type="button" className="dsh-market-center-close" aria-label={t("close")} onClick={onClose}><Icon name="close" /></button>
    </header>
    <div className="dsh-market-tabs" role="tablist" aria-label={t("sectionNavigation")}>{(["installed", "discover"] as const).map(tab => <button key={tab} type="button" role="tab"
      ref={node => { tabRefs.current[tab] = node; }} id={`dsh-market-tab-${tab}`} className="dsh-market-tab" aria-selected={location.tab === tab} aria-controls={`dsh-market-panel-${tab}`} tabIndex={location.tab === tab ? 0 : -1}
      onKeyDown={onTabKeyDown} onClick={() => selectTab(tab)}>{t(tab === "installed" ? "tabInstalled" : "tabDiscover")}</button>)}</div>
    <div ref={scrollRef} className="dsh-market-center-scroll">
      {embedded ? statusText && <p className="dsh-market-page-status">{statusText}</p> : <div className="dsh-market-announcer" role="status" aria-live="polite" aria-atomic="true">{statusText}</div>}
      {catalogError && <button type="button" className="dsh-market-secondary" data-retry="catalog" disabled={busyId !== undefined || refreshing} onClick={retryLoads}>{t("retry")}</button>}
      {intentError && <button type="button" className="dsh-market-secondary" data-retry="intents" disabled={busyId !== undefined || refreshing} onClick={retryLoads}>{t("retry")}</button>}
      {applied?.locked && <button type="button" className="dsh-market-secondary" data-retry="applied" disabled={busyId !== undefined || refreshing} onClick={() => { void refreshApplied(applied); }}>{t("refresh")}</button>}
      {(["installed", "discover"] as const).map(tab => <div key={tab} id={`dsh-market-panel-${tab}`} role="tabpanel" aria-labelledby={`dsh-market-tab-${tab}`} hidden={location.tab !== tab}>
        {location.tab === tab && (capability ? <div className="dsh-market-capability-detail"><button type="button" className="dsh-market-back" onClick={back}><Icon name="arrowLeft" />{t("back")}</button>
          <h2 ref={capabilityHeading} tabIndex={-1}>{t(capability.name)}</h2>{configuration}</div>
          : target && snapshot ? <PluginDetail key={`${target.kind}:${target.entry.id}`} target={target} snapshot={snapshot} presentation={presentationFor(target.entry)}
            runtimeState={target.kind === "installed" ? runtimeStateFor(target.entry.packageName, inventory) : "unknown"}
            configuration={embedded ? configuration : undefined} mutationDisabled={mutationDisabled} t={t} onBack={back} onQueue={onQueue} /> : list(tab))}
      </div>)}
    </div>
  </section>;
}

function Card({ entry, sourceLabel, presentation, disabled, t, buttonRef, onOpen, onQueue }: {
  entry: CatalogEntry;
  sourceLabel: string;
  presentation: InstallPresentation;
  disabled: boolean;
  t: Translate;
  buttonRef: (node: HTMLButtonElement | null) => void;
  onOpen: () => void;
  onQueue: (entry: CatalogEntry, action: "install" | "remove") => void;
}): JSX.Element {
  const active = presentation.status === "installing" || presentation.status === "retrying";
  const blocked = active || presentation.status === "queued";
  const action = presentation.retryable ? presentation.action : "install";
  const showGet = !entry.installed;
  return (
    <article className="dsh-market-card">
      <button
        ref={buttonRef}
        id={`dsh-market-card-${entry.id}`}
        type="button"
        className="dsh-market-card-open"
        aria-label={`${t("openDetails")}: ${entry.name}`}
        onClick={onOpen}
      >
        <span className="dsh-market-card-top">
          <span className="dsh-market-icon-tile" data-kind={entry.kind}>
            <Icon name={entryIconName(entry.id, entry.kind)} size={22} />
          </span>
          <span className="dsh-market-card-name">{entry.name}</span>
        </span>
        <span className="dsh-market-card-summary">{entry.summary}</span>
      </button>
      <div className="dsh-market-card-chips">
        <span className="dsh-market-chip">{sourceLabel}</span>
        {presentation.status !== "idle" && (
          <span
            className="dsh-market-chip"
            data-kind={presentation.tone === "success" ? "installed" : presentation.tone === "danger" ? "failed" : "queued"}
            data-status={presentation.status}
            data-tone={presentation.tone}
          >
            <Icon name={presentation.tone === "success" ? "check" : presentation.tone === "danger" ? "close" : "clock"} size={12} />{t(presentation.label)}
          </span>
        )}
      </div>
      {presentation.status === "failed" && presentation.detail && (
        <p className="dsh-market-error">{presentation.detail}</p>
      )}
      {showGet && (
        <button
          type="button"
          className="dsh-market-get"
          disabled={disabled || blocked}
          aria-busy={active}
          aria-label={`${presentation.retryable ? t("retry") : t("install")}: ${entry.name}`}
          onClick={() => { if (!disabled && !blocked) onQueue(entry, action); }}
        >
          {presentation.retryable
            ? t("retry")
            : blocked ? t(presentation.label) : t("install")}
        </button>
      )}
    </article>
  );
}
