import { useEffect, useMemo, useState } from "react";
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
import type { MarketKey } from "./locales.ts";

type Translate = (key: MarketKey) => string;

function Chips({ entry, intents, busy, t }: { entry: CatalogEntry; intents: InstallIntent[]; busy: boolean; t: Translate }): JSX.Element {
  const queued = busy || intents.some((intent) => intent.entryId === entry.id);
  return (
    <>
      <span className="dsh-market-chip">{entry.kind === "plugin" ? t("kindPlugin") : t("kindWorkflow")}</span>
      {entry.installed && (
        <span className="dsh-market-chip" data-kind="installed"><Icon name="check" size={11} />{t("installed")}</span>
      )}
      {queued && !entry.installed && (
        <span className="dsh-market-chip" data-kind="queued"><Icon name="clock" size={11} />{busy ? t("installing") : t("queued")}</span>
      )}
    </>
  );
}

function Card({ entry, intents, busy, t, onOpen, onQueue }: {
  entry: CatalogEntry;
  intents: InstallIntent[];
  busy: boolean;
  t: Translate;
  onOpen: () => void;
  onQueue: (entry: CatalogEntry, action: "install" | "remove") => void;
}): JSX.Element {
  const queued = busy || intents.some((intent) => intent.entryId === entry.id);
  const showGet = !entry.installed;
  return (
    <div
      className="dsh-market-card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="dsh-market-card-top">
        <span className="dsh-market-icon-tile" data-kind={entry.kind}>
          <Icon name={entryIconName(entry.id, entry.kind)} size={22} />
        </span>
        <div className="dsh-market-card-id">
          <span className="dsh-market-card-name">{entry.name}</span>
          <span className="dsh-market-card-version">v{entry.version}</span>
        </div>
      </div>
      <p className="dsh-market-card-summary">{entry.summary}</p>
      <div className="dsh-market-card-foot">
        <Chips entry={entry} intents={intents} busy={busy} t={t} />
        {showGet && (
          <button
            type="button"
            className="dsh-market-get"
            disabled={queued}
            onClick={(event) => {
              event.stopPropagation();
              if (!queued) onQueue(entry, "install");
            }}
          >
            {busy ? t("installing") : queued ? t("queued") : t("install")}
          </button>
        )}
      </div>
    </div>
  );
}

function Detail({ entry, snapshot, intents, busy, t, onBack, onQueue }: {
  entry: CatalogEntry;
  snapshot: CatalogSnapshot;
  intents: InstallIntent[];
  busy: boolean;
  t: Translate;
  onBack: () => void;
  onQueue: (entry: CatalogEntry, action: "install" | "remove") => void;
}): JSX.Element {
  const source = snapshot.sources.find((current) => current.id === entry.sourceId);
  const queued = busy || intents.some((intent) => intent.entryId === entry.id);
  const action = entry.installed ? "remove" : "install";
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
          <span className="dsh-market-detail-name">{entry.name}</span>
          <div className="dsh-market-detail-badges">
            <Chips entry={entry} intents={intents} busy={busy} t={t} />
          </div>
        </div>
      </div>
      <p className="dsh-market-detail-summary">{entry.summary}</p>
      <div className="dsh-market-meta">
        <span>{t("version")} <b>v{entry.version}</b></span>
        <span>{t("source")} <b>{source?.label ?? entry.sourceId}</b></span>
      </div>
      {entry.installSpec !== undefined && entry.installSpec !== "" ? (
        <p className="dsh-market-note"><code>{t("installSpec")}</code> <code>dsh plugin --profile web add {entry.installSpec}</code></p>
      ) : null}
      <button
        type="button"
        className="dsh-market-install"
        data-variant={action === "remove" ? "danger" : undefined}
        disabled={queued}
        onClick={() => onQueue(entry, action)}
      >
        <Icon name={queued ? "clock" : action === "install" ? "download" : "trash"} size={15} />
        {busy ? t("installing") : queued ? t("queued") : action === "install" ? t("install") : t("remove")}
      </button>
      {queued && <p className="dsh-market-note">{t("queuedNote")}</p>}
    </div>
  );
}

function Sources({ snapshot, t, onAdd, onRemove }: {
  snapshot: CatalogSnapshot;
  t: Translate;
  onAdd: (label: string, indexUrl: string) => void;
  onRemove: (id: string) => void;
}): JSX.Element {
  const [label, setLabel] = useState("");
  const [indexUrl, setIndexUrl] = useState("");
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
              aria-label={t("removeSource")}
              onClick={() => onRemove(source.id)}
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
            onSubmit={(event) => {
              event.preventDefault();
              if (label.trim() === "" || indexUrl.trim() === "") return;
              onAdd(label.trim(), indexUrl.trim());
              setLabel("");
              setIndexUrl("");
            }}
          >
            <input name="label" placeholder={t("addLabel")} value={label} onChange={(event) => setLabel(event.target.value)} />
            <input name="indexUrl" placeholder={t("addUrl")} value={indexUrl} onChange={(event) => setIndexUrl(event.target.value)} />
            <button type="submit" className="dsh-market-add-submit"><Icon name="plus" size={14} />{t("addSubmit")}</button>
          </form>
        )
        : <p className="dsh-market-note">{t("thirdPartyDisabled")}</p>}
    </div>
  );
}

export function MarketPanel({ t }: { t: Translate }): JSX.Element {
  const [snapshot, setSnapshot] = useState<CatalogSnapshot>();
  const [intents, setIntents] = useState<InstallIntent[]>([]);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [tab, setTab] = useState<"market" | "sources">("market");
  const [selectedId, setSelectedId] = useState<string>();
  const [busyId, setBusyId] = useState<string>();

  useEffect(() => {
    let alive = true;
    Promise.all([loadCatalog(), loadIntents()])
      .then(([catalog, queue]) => {
        if (!alive) return;
        setSnapshot(catalog);
        setIntents(queue);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const entries = useMemo(
    () => (snapshot === undefined ? [] : searchCatalog(snapshot.entries, query, tag)),
    [snapshot, query, tag],
  );
  const tags = useMemo(() => (snapshot === undefined ? [] : tagsOf(snapshot.entries)), [snapshot]);
  const selected = snapshot?.entries.find((entry) => entry.id === selectedId);

  const run = (task: Promise<CatalogSnapshot>): void => {
    task.then(setSnapshot).catch(() => setError(true));
  };
  const onQueue = (entry: CatalogEntry, action: "install" | "remove"): void => {
    setBusyId(entry.id);
    queueIntent(entry.id, entry.sourceId, action)
      .then((result) => {
        setIntents(result.intents);
        if (result.snapshot !== undefined) setSnapshot(result.snapshot);
        if (result.error !== undefined) setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setBusyId(undefined));
  };

  if (error) return <p className="dsh-market-error">{t("loadError")}</p>;
  return (
    <div className="dsh-market-panel">
      <div className="dsh-market-toolbar">
        <div className="dsh-market-tabs">
          <button type="button" className="dsh-market-tab" data-active={tab === "market"} onClick={() => setTab("market")}>
            {t("tabMarket")}
          </button>
          <button type="button" className="dsh-market-tab" data-active={tab === "sources"} onClick={() => setTab("sources")}>
            {t("tabSources")}
          </button>
        </div>
        {tab === "market" && selected === undefined && (
          <div className="dsh-market-search-wrap">
            <Icon name="search" size={15} />
            <input
              className="dsh-market-search"
              placeholder={t("searchPlaceholder")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        )}
      </div>
      {tab === "sources" && snapshot !== undefined && (
        <Sources
          snapshot={snapshot}
          t={t}
          onAdd={(label, indexUrl) => run(addSource(label, indexUrl))}
          onRemove={(id) => run(removeSource(id))}
        />
      )}
      {tab === "market" && selected !== undefined && snapshot !== undefined && (
        <Detail
          entry={selected}
          snapshot={snapshot}
          intents={intents}
          busy={busyId === selected.id}
          t={t}
          onBack={() => setSelectedId(undefined)}
          onQueue={onQueue}
        />
      )}
      {tab === "market" && selected === undefined && (
        <>
          <div className="dsh-market-tags">
            <button type="button" className="dsh-market-tag" data-active={tag === ""} onClick={() => setTag("")}>
              {t("allTags")}
            </button>
            {tags.map((current) => (
              <button
                key={current}
                type="button"
                className="dsh-market-tag"
                data-active={tag === current}
                onClick={() => setTag(tag === current ? "" : current)}
              >
                {current}
              </button>
            ))}
          </div>
          {entries.length === 0
            ? (
              <div className="dsh-market-empty">
                <Icon name="package" size={32} />
                <span>{t("empty")}</span>
              </div>
            )
            : (
              <div className="dsh-market-grid">
                {entries.map((entry) => (
                  <Card
                    key={entry.id}
                    entry={entry}
                    intents={intents}
                    busy={busyId === entry.id}
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
  );
}
