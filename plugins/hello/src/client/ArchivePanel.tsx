import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type { ArchiveRecord } from "../archive/ledger.ts";
import { filterArchives, groupArchives, workspaceNames, type ArchiveSort } from "../archive/query.ts";
import type { ArchiveMessage } from "../archive/transcript.ts";
import { HELLO_ARCHIVE_NAMESPACE, HELLO_ARCHIVE_PREFIX } from "../names.ts";
import { formatArchive, type ArchiveKey } from "./archive-locales.ts";

interface DetailPayload {
  ok?: boolean;
  messages?: ArchiveMessage[];
  error?: string;
}

function formatWhen(ms: number | undefined, locale: "zh" | "en"): string {
  if (ms === undefined) return "";
  return new Date(ms).toLocaleString(locale === "en" ? "en-US" : "zh-CN", { dateStyle: "medium", timeStyle: "short" });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function fetchJson(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, { cache: "no-store", ...init });
  const payload = await response.json() as { ok?: boolean; error?: string };
  if (!response.ok || payload.ok === false) throw new Error(payload.error ?? `http ${String(response.status)}`);
  return payload;
}

export function ArchivePanel(props: { ctx: ClientContext }): ReactElement {
  const locale = props.ctx.locale.getLocale().active === "en" ? "en" : "zh";
  const t = props.ctx.locale.bind(HELLO_ARCHIVE_NAMESPACE) as (key: ArchiveKey) => string;
  const untitled = t("noProject");

  const [archives, setArchives] = useState<ArchiveRecord[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ArchiveSort>("newest");
  const [workspace, setWorkspace] = useState("ALL");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | undefined>(undefined);
  const [preview, setPreview] = useState<{
    sid: string;
    title: string;
    loading: boolean;
    messages: ArchiveMessage[];
    error?: string;
  } | undefined>(undefined);
  const composing = useRef(false);

  const load = useCallback(async () => {
    try {
      const payload = await fetchJson(`${HELLO_ARCHIVE_PREFIX}/archives`) as { archives?: ArchiveRecord[] };
      setArchives(Array.isArray(payload.archives) ? payload.archives : []);
      setBanner(undefined);
    } catch {
      setBanner({ kind: "err", text: t("loadFailed") });
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !busy && preview === undefined) void load();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [busy, load, preview]);

  const filtered = useMemo(
    () => filterArchives(archives, { query, workspace, sort }, untitled),
    [archives, query, workspace, sort, untitled],
  );
  const groups = useMemo(() => groupArchives(filtered, untitled), [filtered, untitled]);
  const projects = useMemo(() => workspaceNames(archives, untitled), [archives, untitled]);

  const run = async (work: () => Promise<string>): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      setBanner({ kind: "ok", text: await work() });
      await load();
    } catch (error) {
      setBanner({ kind: "err", text: error instanceof Error ? error.message : t("loadFailed") });
    } finally {
      setBusy(false);
    }
  };

  const restore = (item: ArchiveRecord): void => {
    void run(async () => {
      await fetchJson(`${HELLO_ARCHIVE_PREFIX}/unarchive`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: item.sessionId }),
      });
      if (preview?.sid === item.sessionId) setPreview(undefined);
      return formatArchive(t("restored"), item.title);
    });
  };

  const remove = (ids: string[], confirmText: string, done: string): void => {
    if (!window.confirm(confirmText)) return;
    void run(async () => {
      await fetchJson(`${HELLO_ARCHIVE_PREFIX}/delete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionIds: ids }),
      });
      if (preview !== undefined && ids.includes(preview.sid)) setPreview(undefined);
      return done;
    });
  };

  const openPreview = (item: ArchiveRecord): void => {
    setPreview({ sid: item.sessionId, title: item.title, loading: true, messages: [] });
    void fetchJson(`${HELLO_ARCHIVE_PREFIX}/detail?sessionId=${encodeURIComponent(item.sessionId)}`)
      .then((payload) => {
        const detail = payload as DetailPayload;
        setPreview((current) => current?.sid !== item.sessionId ? current : {
          sid: item.sessionId,
          title: item.title,
          loading: false,
          messages: detail.messages ?? [],
        });
      })
      .catch((error: unknown) => {
        setPreview((current) => current?.sid !== item.sessionId ? current : {
          sid: item.sessionId,
          title: item.title,
          loading: false,
          messages: [],
          error: error instanceof Error ? error.message : t("previewFailed"),
        });
      });
  };

  return (
    <div className="dshH-arch" data-dsh-plugin="hello-archive">
      <h2 className="dshH-archTitle">{t("title")}</h2>
      <p className="dshH-archLede">{t("description")}</p>
      {banner !== undefined ? <p className={`dshH-archBanner is-${banner.kind}`}>{banner.text}</p> : null}
      <div className="dshH-archSearch">
        <input
          value={query}
          placeholder={t("searchPlaceholder")}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={(event) => {
            composing.current = false;
            setQuery(event.currentTarget.value);
          }}
          onChange={(event) => {
            if (!composing.current) setQuery(event.currentTarget.value);
          }}
        />
        {query !== "" ? (
          <button type="button" title={t("clearSearch")} onClick={() => setQuery("")}>x</button>
        ) : null}
      </div>
      <div className="dshH-archFilters">
        <select value={sort} onChange={(event) => setSort(event.currentTarget.value as ArchiveSort)}>
          <option value="newest">{t("sortNewest")}</option>
          <option value="oldest">{t("sortOldest")}</option>
        </select>
        <select value={workspace} onChange={(event) => setWorkspace(event.currentTarget.value)}>
          <option value="ALL">{t("allProjects")}</option>
          {projects.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <button
          type="button"
          className="dshH-archDanger"
          disabled={busy || archives.length === 0}
          title={t("deleteAllTip")}
          onClick={() => remove(
            archives.map((item) => item.sessionId),
            formatArchive(t("confirmDeleteAll"), archives.length),
            formatArchive(t("deletedAll"), archives.length),
          )}
        >
          {t("deleteAll")}
        </button>
      </div>
      {loading ? <div className="dshH-archLoading">{t("loading")}</div>
        : archives.length === 0 ? <div className="dshH-archEmpty">{t("empty")}</div>
          : groups.length === 0 ? <div className="dshH-archEmpty">{t("noMatch")}</div>
            : groups.map((group) => (
              <section key={group.title} className="dshH-archGroup">
                <div className="dshH-archGroupHead">
                  <div className="dshH-archGroupTitle">{group.title}</div>
                  <div className="dshH-archGroupMeta">
                    <span>{String(group.items.length) + t("countUnit")}</span>
                    <button
                      type="button"
                      className="dshH-archDanger"
                      disabled={busy}
                      onClick={() => remove(
                        group.items.map((item) => item.sessionId),
                        formatArchive(t("confirmDeleteWs"), group.title, group.items.length),
                        formatArchive(t("deletedWs"), group.title),
                      )}
                    >
                      {t("deleteAllInProject")}
                    </button>
                  </div>
                </div>
                {group.items.map((item) => (
                  <div key={item.sessionId} className="dshH-archItem">
                    <div>
                      <div className="dshH-archItemTitle">{item.title}</div>
                      <div className="dshH-archItemMeta">
                        <span>{formatWhen(item.createdAt, locale)}</span>
                        {item.turns > 0 ? <span>{String(item.turns) + t("turns")}</span> : null}
                        {item.dataSize > 0 ? <span>{formatSize(item.dataSize)}</span> : null}
                      </div>
                    </div>
                    <div className="dshH-archActions">
                      <button type="button" onClick={() => openPreview(item)}>{t("preview")}</button>
                      <button type="button" onClick={() => restore(item)}>{t("unarchive")}</button>
                      <button
                        type="button"
                        className="is-danger"
                        onClick={() => remove(
                          [item.sessionId],
                          formatArchive(t("confirmDelete"), item.title),
                          t("deleted"),
                        )}
                      >
                        {t("deletePermanently")}
                      </button>
                    </div>
                  </div>
                ))}
              </section>
            ))}
      {preview === undefined ? null : (
        <div className="dshH-archMask" onClick={(event) => {
          if (event.target === event.currentTarget) setPreview(undefined);
        }}>
          <div className="dshH-archModal">
            <h3>{t("previewTitle")}：{preview.title}</h3>
            {preview.loading ? <div className="dshH-archLoading">{t("loading")}</div>
              : preview.error !== undefined ? <div className="dshH-archEmpty">{t("previewFailed")}: {preview.error}</div>
                : preview.messages.length === 0 ? <div className="dshH-archEmpty">{t("previewEmpty")}</div>
                  : preview.messages.map((message, index) => (
                    <div key={index} className={`dshH-archMsg is-${message.role}`}>
                      <div className="dshH-archMsgRole">
                        {(message.role === "user" ? t("user") : t("assistant"))
                          + (message.time !== undefined ? ` · ${formatWhen(message.time, locale)}` : "")}
                      </div>
                      {message.content}
                    </div>
                  ))}
            <div className="dshH-archModalFoot">
              <button type="button" onClick={() => setPreview(undefined)}>{t("close")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
