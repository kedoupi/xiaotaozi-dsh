import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { CatalogEntry } from "../catalog.ts";
import { searchCatalog, tagsOf } from "../catalog.ts";
import type { InstallIntent } from "../intents.ts";
import {
  addSource,
  loadCatalog,
  loadIntents,
  queueIntent,
  removeSource,
  type CatalogSnapshot,
} from "./api.ts";
import { Icon, entryIconName } from "./icons.tsx";
import { installPresentation, type InstallPresentation } from "./install-presentation.ts";
import type { MarketKey } from "./locales.ts";

type Translate = (key: MarketKey) => string;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function Chips({ entry, presentation, t }: { entry: CatalogEntry; presentation: InstallPresentation; t: Translate }): JSX.Element {
  return (
    <>
      <span className="dsh-market-chip">{entry.kind === "plugin" ? t("kindPlugin") : t("kindWorkflow")}</span>
      {presentation.status !== "idle" && (
        <span
          className="dsh-market-chip"
          data-kind={presentation.tone === "success" ? "installed" : "queued"}
          data-status={presentation.status}
          data-tone={presentation.tone}
        >
          <Icon name={presentation.tone === "success" ? "check" : "clock"} size={12} />{t(presentation.label)}
        </span>
      )}
    </>
  );
}

function Card({ entry, sourceLabel, presentation, disabled, t, onOpen, onQueue }: {
  entry: CatalogEntry;
  sourceLabel: string;
  presentation: InstallPresentation;
  disabled: boolean;
  t: Translate;
  onOpen: () => void;
  onQueue: (entry: CatalogEntry, action: "install" | "remove") => void;
}): JSX.Element {
  const active = presentation.status === "installing" || presentation.status === "retrying";
  const blocked = active || presentation.status === "queued";
  const showGet = !entry.installed;
  return (
    <article className="dsh-market-card">
      <button
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
            data-kind={presentation.tone === "success" ? "installed" : "queued"}
            data-status={presentation.status}
            data-tone={presentation.tone}
          >
            <Icon name={presentation.tone === "success" ? "check" : "clock"} size={12} />{t(presentation.label)}
          </span>
        )}
      </div>
      {showGet && (
        <button
          type="button"
          className="dsh-market-get"
          disabled={disabled || blocked}
          aria-busy={active}
          aria-label={`${presentation.retryable ? t("retry") : t("install")}: ${entry.name}`}
          onClick={() => { if (!blocked) onQueue(entry, "install"); }}
        >
          {presentation.retryable
            ? t("retry")
            : blocked ? t(presentation.label) : t("install")}
        </button>
      )}
    </article>
  );
}

function Detail({ entry, snapshot, presentation, t, onBack, onQueue }: {
  entry: CatalogEntry;
  snapshot: CatalogSnapshot;
  presentation: InstallPresentation;
  t: Translate;
  onBack: () => void;
  onQueue: (entry: CatalogEntry, action: "install" | "remove") => void;
}): JSX.Element {
  const detailRef = useRef<HTMLHeadingElement>(null);
  const source = snapshot.sources.find((current) => current.id === entry.sourceId);
  const action = entry.installed ? "remove" : "install";
  const active = presentation.status === "installing" || presentation.status === "retrying";
  const blocked = active || presentation.status === "queued";
  const installSpec = entry.installSpec?.trim();
  const installOrigin = installSpec === undefined || installSpec === ""
    ? t("installSourceUndeclared")
    : /^(?:github:|git(?:\+|:))/.test(installSpec) ? t("upstreamGit") : t("upstreamNpm");
  const sourceRisk = source?.builtin === true
    ? t("bundledSourceRisk")
    : source === undefined ? t("unknownSourceRisk") : t("externalSourceRisk");
  useEffect(() => {
    detailRef.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="dsh-market-detail">
      <button type="button" className="dsh-market-back" onClick={onBack}>
        <Icon name="arrowLeft" size={14} />{t("back")}
      </button>
      <div className="dsh-market-detail-head">
        <span className="dsh-market-icon-tile" data-kind={entry.kind}>
          <Icon name={entryIconName(entry.id, entry.kind)} size={30} />
        </span>
        <div className="dsh-market-detail-titles">
          <h2 ref={detailRef} className="dsh-market-detail-name" tabIndex={-1}>{entry.name}</h2>
          <div className="dsh-market-detail-badges">
            <Chips entry={entry} presentation={presentation} t={t} />
          </div>
        </div>
      </div>
      <p className="dsh-market-detail-summary">{entry.summary}</p>
      <div className="dsh-market-meta">
        <span>{t("version")} <b>v{entry.version}</b></span>
        <span>{t("source")} <b>{source?.label ?? entry.sourceId}</b></span>
      </div>
      <div className="dsh-market-install-info">
        <span>{t("installOrigin")} <b>{installOrigin}</b></span>
        {installSpec !== undefined && installSpec !== "" ? (
          <>
            <span>{t("installSpec")} <code>{installSpec}</code></span>
            <span>{t("installCommand")} <code>dsh plugin --profile web add {installSpec}</code></span>
          </>
        ) : null}
      </div>
      <section className="dsh-market-risk">
        <h3>{t("riskCompatibility")}</h3>
        <p>{sourceRisk} {t("reviewSourceRisk")}</p>
        <p>{t("compatibilityUndeclared")}</p>
      </section>
      <button
        type="button"
        className="dsh-market-install"
        data-variant={action === "remove" ? "danger" : undefined}
        disabled={blocked}
        aria-busy={active}
        aria-label={`${presentation.retryable ? t("retry") : action === "install" ? t("install") : t("remove")}: ${entry.name}`}
        onClick={() => onQueue(entry, action)}
      >
        <Icon name={blocked ? "clock" : action === "install" ? "download" : "trash"} size={15} />
        {presentation.retryable
          ? t("retry")
          : blocked ? t(presentation.label) : action === "install" ? t("install") : t("remove")}
      </button>
      {presentation.status === "queued" && <p className="dsh-market-note" role="status" aria-live="polite">{t("queuedNote")}</p>}
    </div>
  );
}

function Sources({ snapshot, busy, t, onAdd, onRemove }: {
  snapshot: CatalogSnapshot;
  busy: boolean;
  t: Translate;
  onAdd: (label: string, indexUrl: string) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}): JSX.Element {
  const [label, setLabel] = useState("");
  const [indexUrl, setIndexUrl] = useState("");
  const [fieldError, setFieldError] = useState<"required" | "url">();
  const labelRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  return (
    <div className="dsh-market-sources">
      <p className="dsh-market-note">{t("sourcesHint")}</p>
      {snapshot.sources.map((source) => (
        <div key={source.id} className="dsh-market-source-row">
          <span className="dsh-market-icon-tile"><Icon name="globe" size={18} /></span>
          <div className="dsh-market-source-texts">
            <span className="dsh-market-source-label">
              {source.label}
              {source.builtin && <span className="dsh-market-chip" data-kind="queued">{t("official")}</span>}
            </span>
            <span className="dsh-market-source-url">{source.indexUrl}</span>
          </div>
          {!source.builtin && (
            <button
              type="button"
              className="dsh-market-source-remove"
              aria-label={`${t("removeSource")}: ${source.label}`}
              disabled={busy}
              onClick={() => { void onRemove(source.id); }}
            >
              <Icon name="trash" size={15} />
            </button>
          )}
        </div>
      ))}
      {snapshot.allowThirdPartySources
        ? (
          <form
            className="dsh-market-add"
            aria-busy={busy}
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (label.trim() === "" || indexUrl.trim() === "") {
                setFieldError("required");
                (label.trim() === "" ? labelRef.current : urlRef.current)?.focus();
                return;
              }
              let parsed: URL;
              try {
                parsed = new URL(indexUrl.trim());
              } catch {
                setFieldError("url");
                urlRef.current?.focus();
                return;
              }
              if (parsed.protocol !== "https:") {
                setFieldError("url");
                urlRef.current?.focus();
                return;
              }
              setFieldError(undefined);
              void onAdd(label.trim(), indexUrl.trim()).then((success) => {
                if (!success) return;
                setLabel("");
                setIndexUrl("");
              });
            }}
          >
            <div className="dsh-market-field">
              <label htmlFor="dsh-market-source-label">{t("addLabel")}</label>
              <input ref={labelRef} id="dsh-market-source-label" name="label" required autoComplete="off" value={label} disabled={busy} aria-invalid={fieldError === "required"} aria-describedby={fieldError === "required" ? errorId : undefined} onChange={(event) => { setLabel(event.target.value); setFieldError(undefined); }} />
            </div>
            <div className="dsh-market-field dsh-market-field-url">
              <label htmlFor="dsh-market-source-url">{t("addUrl")}</label>
              <input ref={urlRef} id="dsh-market-source-url" name="indexUrl" type="url" inputMode="url" required autoComplete="url" value={indexUrl} disabled={busy} aria-invalid={fieldError !== undefined} aria-describedby={fieldError !== undefined ? errorId : undefined} onChange={(event) => { setIndexUrl(event.target.value); setFieldError(undefined); }} />
            </div>
            <button type="submit" className="dsh-market-add-submit" disabled={busy}>
              <Icon name="plus" size={16} />{busy ? t("saving") : t("addSubmit")}
            </button>
            {fieldError !== undefined ? <p id={errorId} className="dsh-market-error dsh-market-source-form-error" role="alert">{t(fieldError === "required" ? "sourceRequired" : "sourceInvalidUrl")}</p> : null}
          </form>
        )
        : <p className="dsh-market-note">{t("thirdPartyDisabled")}</p>}
    </div>
  );
}

export function MarketPanel({ t }: { t: Translate }): JSX.Element {
  const [snapshot, setSnapshot] = useState<CatalogSnapshot>();
  const [intents, setIntents] = useState<InstallIntent[]>([]);
  const [fatalError, setFatalError] = useState<string>();
  const [operationError, setOperationError] = useState<string>();
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [installedOnly, setInstalledOnly] = useState(false);
  const [tab, setTab] = useState<"market" | "sources">("market");
  const [selectedId, setSelectedId] = useState<string>();
  const [busyId, setBusyId] = useState<string>();
  const [failure, setFailure] = useState<{ entryId: string; action: "install" | "remove"; message: string }>();
  const [retryingId, setRetryingId] = useState<string>();
  const [latestCompletion, setLatestCompletion] = useState<{ entryId: string; action: "install" | "remove" }>();
  const [announcement, setAnnouncement] = useState("");
  const [sourceBusy, setSourceBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    Promise.all([loadCatalog(), loadIntents()])
      .then(([catalog, queue]) => {
        if (!alive) return;
        setSnapshot(catalog);
        setIntents(queue);
        const queued = queue[queue.length - 1];
        const queuedEntry = catalog.entries.find((entry) => entry.id === queued?.entryId);
        if (queuedEntry !== undefined) setAnnouncement(`${queuedEntry.name}: ${t("queued")}`);
      })
      .catch((error: unknown) => {
        if (alive) setFatalError(errorMessage(error));
      });
    return () => {
      alive = false;
    };
  }, [reloadKey, t]);

  useEffect(() => {
    if (latestCompletion === undefined) return;
    const timer = setTimeout(() => setLatestCompletion((current) => current === latestCompletion ? undefined : current), 3_000);
    return () => clearTimeout(timer);
  }, [latestCompletion]);

  const entries = useMemo(
    () => (snapshot === undefined
      ? []
      : searchCatalog(snapshot.entries, query, tag).filter((entry) => !installedOnly || entry.installed)),
    [snapshot, query, tag, installedOnly],
  );
  const tags = useMemo(() => (snapshot === undefined ? [] : tagsOf(snapshot.entries)), [snapshot]);
  const selected = snapshot?.entries.find((entry) => entry.id === selectedId);

  const run = (task: Promise<CatalogSnapshot>): Promise<boolean> => {
    setSourceBusy(true);
    setOperationError(undefined);
    return task
      .then((next) => {
        setSnapshot(next);
        return true;
      })
      .catch((error: unknown) => {
        setOperationError(errorMessage(error));
        return false;
      })
      .finally(() => setSourceBusy(false));
  };
  const onQueue = (entry: CatalogEntry, action: "install" | "remove"): void => {
    if (busyId !== undefined) return;
    const retrying = failure?.entryId === entry.id;
    setBusyId(entry.id);
    setRetryingId(retrying ? entry.id : undefined);
    setLatestCompletion(undefined);
    setOperationError(undefined);
    setAnnouncement(`${entry.name}: ${t(retrying
      ? action === "install" ? "retryingInstall" : "retryingRemove"
      : action === "install" ? "installing" : "removing")}`);
    queueIntent(entry.id, entry.sourceId, action)
      .then((result) => {
        setIntents(result.intents);
        if (result.snapshot !== undefined) setSnapshot(result.snapshot);
        if (result.error !== undefined) {
          setFailure({ entryId: entry.id, action, message: result.error });
          setAnnouncement(`${entry.name}: ${t(action === "install" ? "installFailed" : "removeFailed")}`);
          return;
        }
        setFailure((current) => current?.entryId === entry.id ? undefined : current);
        setLatestCompletion({ entryId: entry.id, action });
        setAnnouncement(`${entry.name}: ${t(action === "install" ? "installCompleted" : "removeCompleted")}`);
      })
      .catch((error: unknown) => {
        const message = errorMessage(error);
        setFailure({ entryId: entry.id, action, message });
        setAnnouncement(`${entry.name}: ${t(action === "install" ? "installFailed" : "removeFailed")}`);
      })
      .finally(() => {
        setBusyId(undefined);
        setRetryingId(undefined);
      });
  };

  if (fatalError !== undefined) {
    return (
      <div className="dsh-market-feedback dsh-market-feedback-error" role="alert">
        <Icon name="package" size={28} />
        <p className="dsh-market-error">{t("loadError")} {fatalError}</p>
        <button
          type="button"
          className="dsh-market-secondary"
          onClick={() => {
            setFatalError(undefined);
            setSnapshot(undefined);
            setReloadKey((value) => value + 1);
          }}
        >
          {t("retry")}
        </button>
      </div>
    );
  }
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    let next: "market" | "sources" | undefined;
    if (event.key === "Home") next = "market";
    else if (event.key === "End") next = "sources";
    else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      next = tab === "market" ? "sources" : "market";
    }
    if (next === undefined) return;
    event.preventDefault();
    setTab(next);
    setSelectedId(undefined);
    document.getElementById(`dsh-market-tab-${next}`)?.focus();
  };
  return (
    <div className="dsh-market-panel" aria-busy={snapshot === undefined || busyId !== undefined || sourceBusy}>
      <div className="dsh-market-announcer" role="status" aria-live="polite" aria-atomic="true">
        {sourceBusy ? t("saving") : announcement}
      </div>
      {failure !== undefined && (
        <p className="dsh-market-error" role="alert">
          {snapshot?.entries.find((entry) => entry.id === failure.entryId)?.name ?? failure.entryId}: {failure.message}
        </p>
      )}
      {operationError !== undefined && <p className="dsh-market-error" role="alert">{operationError}</p>}
      <div className="dsh-market-toolbar">
        <div className="dsh-market-tabs" role="tablist" aria-label={t("sectionNavigation")}>
          <button
            id="dsh-market-tab-market"
            type="button"
            role="tab"
            aria-selected={tab === "market"}
            aria-controls="dsh-market-panel-market"
            tabIndex={tab === "market" ? 0 : -1}
            className="dsh-market-tab"
            data-active={tab === "market"}
            onKeyDown={onTabKeyDown}
            onClick={() => { setTab("market"); setSelectedId(undefined); }}
          >
            {t("tabMarket")}
          </button>
          <button
            id="dsh-market-tab-sources"
            type="button"
            role="tab"
            aria-selected={tab === "sources"}
            aria-controls="dsh-market-panel-sources"
            tabIndex={tab === "sources" ? 0 : -1}
            className="dsh-market-tab"
            data-active={tab === "sources"}
            onKeyDown={onTabKeyDown}
            onClick={() => { setTab("sources"); setSelectedId(undefined); }}
          >
            {t("tabSources")}
          </button>
        </div>
      </div>
      {snapshot === undefined ? (
        <div
          id={`dsh-market-panel-${tab}`}
          className="dsh-market-tabpanel"
          role="tabpanel"
          aria-labelledby={`dsh-market-tab-${tab}`}
        >
          <div className="dsh-market-feedback" role="status" aria-live="polite">
            <Icon name="clock" size={28} />
            <span>{t("loading")}</span>
          </div>
        </div>
      ) : tab === "sources" ? (
        <div id="dsh-market-panel-sources" className="dsh-market-tabpanel" role="tabpanel" aria-labelledby="dsh-market-tab-sources">
          <Sources
            snapshot={snapshot}
            busy={sourceBusy}
            t={t}
            onAdd={(label, indexUrl) => run(addSource(label, indexUrl))}
            onRemove={(id) => run(removeSource(id))}
          />
        </div>
      ) : (
        <div id="dsh-market-panel-market" className="dsh-market-tabpanel" role="tabpanel" aria-labelledby="dsh-market-tab-market">
          {selected !== undefined ? (
            <Detail
              entry={selected}
              snapshot={snapshot}
              presentation={installPresentation({
                entryId: selected.id,
                installed: selected.installed,
                pendingIntent: intents.find((intent) => intent.entryId === selected.id),
                activeMutationId: busyId,
                lastFailedId: failure?.entryId,
                retryingId,
                latestCompletion,
              })}
              t={t}
              onBack={() => {
                const cardId = selected.id;
                setSelectedId(undefined);
                requestAnimationFrame(() => document.getElementById(`dsh-market-card-${cardId}`)?.focus());
              }}
              onQueue={onQueue}
            />
          ) : (
            <>
              <div className="dsh-market-discovery">
                <div className="dsh-market-search-field">
                  <label htmlFor="dsh-market-search">{t("searchLabel")}</label>
                  <div className="dsh-market-search-wrap">
                    <Icon name="search" size={15} />
                    <input
                      id="dsh-market-search"
                      className="dsh-market-search"
                      type="search"
                      placeholder={t("searchPlaceholder")}
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </div>
                </div>
                <div className="dsh-market-tags">
                  <button type="button" className="dsh-market-tag" aria-pressed={tag === ""} data-active={tag === ""} onClick={() => setTag("")}>
                    {t("allTags")}
                  </button>
                  {tags.map((current) => (
                    <button
                      key={current}
                      type="button"
                      className="dsh-market-tag"
                      aria-pressed={tag === current}
                      data-active={tag === current}
                      onClick={() => setTag(tag === current ? "" : current)}
                    >
                      {current}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="dsh-market-tag"
                    aria-pressed={installedOnly}
                    data-active={installedOnly}
                    onClick={() => setInstalledOnly((value) => !value)}
                  >
                    {t("installed")}
                  </button>
                </div>
              </div>
              {entries.length === 0
                ? (
                  <div className="dsh-market-empty">
                    <Icon name="package" size={32} />
                    <span role="status">{t("empty")}</span>
                    <button
                      type="button"
                      className="dsh-market-secondary"
                      onClick={() => {
                        setQuery("");
                        setTag("");
                        setInstalledOnly(false);
                      }}
                    >
                      {t("resetFilters")}
                    </button>
                  </div>
                )
                : (
                  <div className="dsh-market-grid">
                    {entries.map((entry) => (
                      <Card
                        key={entry.id}
                        entry={entry}
                        sourceLabel={snapshot.sources.find((source) => source.id === entry.sourceId)?.label ?? entry.sourceId}
                        presentation={installPresentation({
                          entryId: entry.id,
                          installed: entry.installed,
                          pendingIntent: intents.find((intent) => intent.entryId === entry.id),
                          activeMutationId: busyId,
                          lastFailedId: failure?.entryId,
                          retryingId,
                          latestCompletion,
                        })}
                        disabled={busyId !== undefined}
                        t={t}
                        onOpen={() => setSelectedId(entry.id)}
                        onQueue={onQueue}
                      />
                    ))}
                  </div>
                )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
