import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type { ArchiveRecord } from "../archive/ledger.ts";
import { filterArchives, groupArchives, workspaceOptions, type ArchiveSort } from "../archive/query.ts";
import type { ArchiveMessage } from "../archive/transcript.ts";
import { XTZ_UI_ARCHIVE_NAMESPACE, XTZ_UI_ARCHIVE_PREFIX } from "../names.ts";
import { formatArchive, type ArchiveKey } from "./archive-locales.ts";
import { useDialogFocus } from "./dialog-focus.ts";
import { ClearIcon, CloseIcon } from "./icons.tsx";

interface DetailPayload {
  ok?: boolean;
  messages?: ArchiveMessage[];
  error?: string;
}

interface PreviewState {
  sid: string;
  title: string;
  loading: boolean;
  messages: ArchiveMessage[];
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

function throwMutationErrors(value: unknown, notFoundMessage: string): void {
  const payload = value as { errors?: unknown; notFound?: unknown } | undefined;
  if (Array.isArray(payload?.errors) && payload.errors.length > 0) throw new Error(String(payload.errors[0]));
  if (Array.isArray(payload?.notFound) && payload.notFound.length > 0) throw new Error(notFoundMessage);
}

function ArchivePreview(props: {
  preview: PreviewState;
  locale: "zh" | "en";
  t: (key: ArchiveKey) => string;
  onClose: () => void;
}): ReactElement {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useDialogFocus<HTMLDivElement>(props.onClose, closeRef);

  return (
    <div className="dshH-archMask" onMouseDown={(event) => {
      if (event.target === event.currentTarget) props.onClose();
    }}>
      <div
        ref={dialogRef}
        className="dshH-archModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={props.preview.loading}
        tabIndex={-1}
      >
        <div className="dshH-archModalHead">
          <h3 id={titleId}>{props.t("previewTitle")}：{props.preview.title}</h3>
          <button ref={closeRef} type="button" className="dshH-archModalClose" aria-label={props.t("close")} onClick={props.onClose}>
            <CloseIcon />
          </button>
        </div>
        <div className="dshH-archModalBody">
          {props.preview.loading ? <div className="dshH-archLoading" role="status" aria-live="polite">{props.t("loading")}</div>
            : props.preview.error !== undefined ? <div className="dshH-archEmpty" role="alert">{props.t("previewFailed")}: {props.preview.error}</div>
              : props.preview.messages.length === 0 ? <div className="dshH-archEmpty">{props.t("previewEmpty")}</div>
                : props.preview.messages.map((message, index) => (
                  <div key={index} className={`dshH-archMsg is-${message.role}`}>
                    <div className="dshH-archMsgRole">
                      {(message.role === "user" ? props.t("user") : props.t("assistant"))
                        + (message.time !== undefined ? ` · ${formatWhen(message.time, props.locale)}` : "")}
                    </div>
                    {message.content}
                  </div>
                ))}
        </div>
        <div className="dshH-archModalFoot">
          <button type="button" onClick={props.onClose}>{props.t("close")}</button>
        </div>
      </div>
    </div>
  );
}

export function ArchivePanel(props: { ctx: ClientContext }): ReactElement {
  const locale = props.ctx.locale.getLocale().active === "en" ? "en" : "zh";
  const t = props.ctx.locale.bind(XTZ_UI_ARCHIVE_NAMESPACE) as (key: ArchiveKey) => string;
  const untitled = t("noProject");

  const [archives, setArchives] = useState<ArchiveRecord[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ArchiveSort>("newest");
  const [workspace, setWorkspace] = useState("ALL");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [preview, setPreview] = useState<PreviewState | undefined>(undefined);
  const composing = useRef(false);
  const loadSequence = useRef(0);
  const pendingLoads = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    pendingLoads.current += 1;
    try {
      const payload = await fetchJson(`${XTZ_UI_ARCHIVE_PREFIX}/archives`) as { archives?: ArchiveRecord[] };
      if (sequence !== loadSequence.current) return;
      setArchives(Array.isArray(payload.archives) ? payload.archives : []);
      setLoadError(undefined);
    } catch (error) {
      if (sequence !== loadSequence.current) return;
      setLoadError(error instanceof Error ? error.message : t("loadFailed"));
      throw error;
    } finally {
      pendingLoads.current -= 1;
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    void load().catch(() => {});
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !busy && preview === undefined && pendingLoads.current === 0) {
        void load().catch(() => {});
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [busy, load, preview]);

  const filtered = useMemo(
    () => filterArchives(archives, { query, workspace, sort }, untitled),
    [archives, query, workspace, sort, untitled],
  );
  const groups = useMemo(() => groupArchives(filtered, untitled), [filtered, untitled]);
  const projects = useMemo(() => workspaceOptions(archives, untitled), [archives, untitled]);
  const projectLabels = useMemo(() => new Map(projects.map((project) => [project.key, project.label])), [projects]);
  useEffect(() => {
    if (workspace !== "ALL" && !projects.some((project) => project.key === workspace)) setWorkspace("ALL");
  }, [projects, workspace]);

  const run = async (work: () => Promise<string>): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setBanner(undefined);
    try {
      const text = await work();
      try {
        await load();
      } catch {
        return;
      }
      setBanner({ kind: "ok", text });
    } catch (error) {
      await load().catch(() => {});
      setBanner({ kind: "err", text: error instanceof Error ? error.message : t("loadFailed") });
    } finally {
      setBusy(false);
    }
  };

  const restore = (item: ArchiveRecord): void => {
    void run(async () => {
      const result = await fetchJson(`${XTZ_UI_ARCHIVE_PREFIX}/unarchive`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: item.sessionId }),
      });
      throwMutationErrors(result, t("noLongerArchived"));
      if (preview?.sid === item.sessionId) setPreview(undefined);
      return formatArchive(t("restored"), item.title);
    });
  };

  const remove = (ids: string[], confirmText: string, done: string): void => {
    if (!window.confirm(confirmText)) return;
    void run(async () => {
      const result = await fetchJson(`${XTZ_UI_ARCHIVE_PREFIX}/delete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionIds: ids }),
      });
      throwMutationErrors(result, t("noLongerArchived"));
      if (preview !== undefined && ids.includes(preview.sid)) setPreview(undefined);
      return done;
    });
  };

  const openPreview = (item: ArchiveRecord): void => {
    setPreview({ sid: item.sessionId, title: item.title, loading: true, messages: [] });
    void fetchJson(`${XTZ_UI_ARCHIVE_PREFIX}/detail?sessionId=${encodeURIComponent(item.sessionId)}`)
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

  const visibleBanner = loadError === undefined ? banner : { kind: "err" as const, text: loadError };

  return (
    <div className="dshH-arch" data-dsh-plugin="xtz-ui-archive" aria-busy={loading || busy}>
      <h2 className="dshH-archTitle">{t("title")}</h2>
      <p className="dshH-archLede">{t("description")}</p>
      {visibleBanner !== undefined ? (
        <p className={`dshH-archBanner is-${visibleBanner.kind}`} role={visibleBanner.kind === "err" ? "alert" : "status"} aria-live="polite">
          {visibleBanner.text}
        </p>
      ) : null}
      <div className="dshH-archSearch">
        <input
          ref={searchRef}
          value={query}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
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
          <button type="button" aria-label={t("clearSearch")} onClick={() => { setQuery(""); searchRef.current?.focus(); }}><ClearIcon /></button>
        ) : null}
      </div>
      <div className="dshH-archFilters">
        <select aria-label={t("sortLabel")} value={sort} onChange={(event) => setSort(event.currentTarget.value as ArchiveSort)}>
          <option value="newest">{t("sortNewest")}</option>
          <option value="oldest">{t("sortOldest")}</option>
        </select>
        <select aria-label={t("projectLabel")} value={workspace} onChange={(event) => setWorkspace(event.currentTarget.value)}>
          <option value="ALL">{t("allProjects")}</option>
          {projects.map((project) => <option key={project.key} value={project.key}>{project.label}</option>)}
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
      {loading ? <div className="dshH-archLoading" role="status" aria-live="polite">{t("loading")}</div>
        : archives.length === 0 ? <div className="dshH-archEmpty">{t("empty")}</div>
          : groups.length === 0 ? <div className="dshH-archEmpty">{t("noMatch")}</div>
            : groups.map((group) => (
              <section key={group.key} className="dshH-archGroup" aria-label={projectLabels.get(group.key) ?? group.title}>
                <div className="dshH-archGroupHead">
                  <h3 className="dshH-archGroupTitle">{projectLabels.get(group.key) ?? group.title}</h3>
                  <div className="dshH-archGroupMeta">
                    <span>{String(group.items.length) + t("countUnit")}</span>
                    <button
                      type="button"
                      className="dshH-archDanger"
                      disabled={busy}
                      onClick={() => remove(
                        group.items.map((item) => item.sessionId),
                        formatArchive(t("confirmDeleteWs"), projectLabels.get(group.key) ?? group.title, group.items.length),
                        formatArchive(t("deletedWs"), projectLabels.get(group.key) ?? group.title),
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
                      <button type="button" disabled={busy} onClick={() => openPreview(item)}>{t("preview")}</button>
                      <button type="button" disabled={busy} onClick={() => restore(item)}>{t("unarchive")}</button>
                      <button
                        type="button"
                        className="is-danger"
                        disabled={busy}
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
        <ArchivePreview preview={preview} locale={locale} t={t} onClose={() => setPreview(undefined)} />
      )}
    </div>
  );
}
