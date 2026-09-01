import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type RefObject,
} from "react";
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type { ArchiveRecord } from "../archive/ledger.ts";
import { filterArchives, workspaceOptions } from "../archive/query.ts";
import type { ArchiveMessage } from "../archive/transcript.ts";
import { XTZ_UI_ARCHIVE_NAMESPACE, XTZ_UI_ARCHIVE_PREFIX } from "../names.ts";
import { formatArchive, type ArchiveKey } from "./archive-locales.ts";
import { useDialogFocus } from "./dialog-focus.ts";
import { APP_ICON } from "./logo.ts";
import { BackIcon, ClearIcon, CloseIcon, MoreIcon } from "./icons.tsx";

interface DetailPayload {
  messages?: ArchiveMessage[];
  totalMessages?: number;
}

interface PreviewState {
  item: ArchiveRecord;
  loading: boolean;
  messages: ArchiveMessage[];
  totalMessages: number;
  error?: string;
}

interface DeleteTarget {
  ids: string[];
  title: string;
  body: string;
  done: (doneIds: string[]) => string;
  requiredPhrase?: string;
}

interface ArchiveMutationWorkResult {
  appliedIds: string[];
  text: string;
  residualError?: string;
}

function formatWhen(ms: number | undefined, locale: "zh" | "en"): string {
  if (ms === undefined) return "";
  return new Date(ms).toLocaleString(locale === "en" ? "en-US" : "zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function fetchJson(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, { cache: "no-store", ...init });
  const payload = (await response.json()) as { ok?: boolean; error?: string };
  if (!response.ok || payload.ok === false)
    throw new Error(payload.error ?? `http ${String(response.status)}`);
  return payload;
}

export function archiveMutationResult(
  value: unknown,
  successText: (doneIds: string[]) => string,
  notFoundMessage: string,
): ArchiveMutationWorkResult {
  const payload = value as
    | { done?: unknown; errors?: unknown; notFound?: unknown }
    | undefined;
  const appliedIds = [
    ...new Set(
      (Array.isArray(payload?.done) ? payload.done : []).filter(
        (id): id is string => typeof id === "string",
      ),
    ),
  ];
  const errors = (Array.isArray(payload?.errors) ? payload.errors : []).map(
    String,
  );
  if (Array.isArray(payload?.notFound) && payload.notFound.length > 0)
    errors.push(notFoundMessage);
  return {
    appliedIds,
    text: appliedIds.length > 0 ? successText(appliedIds) : "",
    ...(errors.length > 0 ? { residualError: errors.join(" ") } : {}),
  };
}

export function canConfirmDelete(
  requiredPhrase: string | undefined,
  input: string,
): boolean {
  return requiredPhrase === undefined || input.trim() === requiredPhrase;
}

export function shouldShowArchiveEmpty(
  loading: boolean,
  loadError: string | undefined,
  archiveCount: number,
): boolean {
  return !loading && loadError === undefined && archiveCount === 0;
}

export async function settleArchiveMutation(
  work: () => Promise<ArchiveMutationWorkResult>,
  refresh: () => Promise<void>,
  onApplied: (appliedIds: string[]) => void = () => {},
): Promise<
  | ({ resolved: true; refreshError?: unknown } & ArchiveMutationWorkResult)
  | { resolved: false; mutationError: unknown }
> {
  let result: ArchiveMutationWorkResult;
  try {
    result = await work();
  } catch (mutationError) {
    return { resolved: false, mutationError };
  }

  if (result.appliedIds.length > 0) onApplied(result.appliedIds);
  try {
    await refresh();
    return { resolved: true, ...result };
  } catch (refreshError) {
    return { resolved: true, ...result, refreshError };
  }
}

function DeleteDialog(props: {
  target: DeleteTarget;
  t: (key: ArchiveKey) => string;
  busy: boolean;
  error?: string;
  fallbackFocus: RefObject<HTMLElement | null>;
  onClose: () => void;
  onConfirm: () => void;
}): ReactElement {
  const titleId = useId();
  const bodyId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useDialogFocus<HTMLFormElement>(
    props.onClose,
    cancelRef,
    props.fallbackFocus,
  );
  const [phrase, setPhrase] = useState("");
  const canConfirm = canConfirmDelete(props.target.requiredPhrase, phrase);

  return (
    <div
      className="dshH-archMask"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !props.busy)
          props.onClose();
      }}
    >
      <form
        ref={dialogRef}
        className="dshH-archConfirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        onSubmit={(event) => {
          event.preventDefault();
          if (!props.busy && canConfirm) props.onConfirm();
        }}
      >
        <div className="dshH-archModalHead">
          <h3 id={titleId}>{props.target.title}</h3>
          <button
            type="button"
            className="dshH-archIconButton"
            aria-label={props.t("close")}
            disabled={props.busy}
            onClick={props.onClose}
          >
            <CloseIcon />
          </button>
        </div>
        <div className="dshH-archConfirmBody">
          <p id={bodyId}>{props.target.body}</p>
          {props.target.requiredPhrase === undefined ? null : (
            <label className="dshH-archConfirmField">
              <span>
                {formatArchive(
                  props.t("deleteAllPhraseLabel"),
                  props.target.requiredPhrase,
                )}
              </span>
              <input
                autoComplete="off"
                value={phrase}
                disabled={props.busy}
                onChange={(event) => setPhrase(event.target.value)}
              />
            </label>
          )}
          {props.error === undefined ? null : (
            <p className="dshH-archDialogError" role="alert">
              {props.error}
            </p>
          )}
        </div>
        <div className="dshH-archModalFoot">
          <button
            ref={cancelRef}
            type="button"
            className="dshH-archButton"
            disabled={props.busy}
            onClick={props.onClose}
          >
            {props.t("cancel")}
          </button>
          <button
            type="submit"
            className="dshH-archDangerButton"
            disabled={props.busy || !canConfirm}
          >
            {props.busy ? props.t("deleting") : props.t("deletePermanently")}
          </button>
        </div>
      </form>
    </div>
  );
}

export function ArchiveRow(props: {
  item: ArchiveRecord;
  locale: "zh" | "en";
  untitled: string;
  t: (key: ArchiveKey) => string;
  busy: boolean;
  selecting: boolean;
  selected: boolean;
  onOpen: () => void;
  onRestore: () => void;
  onSelect: () => void;
  onDelete: () => void;
}): ReactElement {
  const item = props.item;
  const workspace =
    item.workspaceTitle && item.workspaceTitle !== ""
      ? item.workspaceTitle
      : props.untitled;
  return (
    <div className={`dshH-archItem${props.selected ? " is-selected" : ""}`}>
      {props.selecting ? (
        <label className="dshH-archCheck">
          <input
            type="checkbox"
            checked={props.selected}
            disabled={props.busy}
            onChange={props.onSelect}
          />
          <span className="dshH-srOnly">
            {formatArchive(props.t("selectChat"), item.title)}
          </span>
        </label>
      ) : null}
      <div className="dshH-archItemCopy">
        <button
          type="button"
          className="dshH-archItemTitle"
          disabled={props.busy}
          onClick={props.onOpen}
        >
          {item.title}
        </button>
        <div className="dshH-archItemMeta">
          <span>{workspace}</span>
          {item.createdAt === undefined ? null : (
            <span>{formatWhen(item.createdAt, props.locale)}</span>
          )}
          {item.turns > 0 ? (
            <span>{String(item.turns) + props.t("turns")}</span>
          ) : null}
          {item.dataSize > 0 ? <span>{formatSize(item.dataSize)}</span> : null}
        </div>
      </div>
      {props.selecting ? null : (
        <div className="dshH-archActions">
          <button
            type="button"
            className="dshH-archRestore"
            disabled={props.busy}
            onClick={props.onRestore}
          >
            {props.t("restore")}
          </button>
          <details className="dshH-archMenu">
            <summary
              className="dshH-archIconButton"
              aria-label={props.t("more")}
              aria-disabled={props.busy}
              tabIndex={props.busy ? -1 : 0}
              onClick={(event) => {
                if (props.busy) event.preventDefault();
              }}
            >
              <MoreIcon />
            </summary>
            <div>
              <button
                type="button"
                disabled={props.busy}
                onClick={props.onDelete}
              >
                {props.t("deletePermanently")}
              </button>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

export function ArchiveDetail(props: {
  preview: PreviewState;
  locale: "zh" | "en";
  t: (key: ArchiveKey) => string;
  busy: boolean;
  operationError?: string;
  onBack: () => void;
  onRestore: () => void;
  onDelete: () => void;
}): ReactElement {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  const preview = props.preview;
  const item = preview.item;
  return (
    <div className="dshH-archDetail" aria-busy={props.busy || preview.loading}>
      <button
        type="button"
        className="dshH-archBack"
        disabled={props.busy}
        onClick={props.onBack}
      >
        <BackIcon />
        {props.t("backToArchives")}
      </button>
      <div className="dshH-archDetailHead">
        <div>
          <h2 ref={headingRef} tabIndex={-1}>
            {item.title}
          </h2>
          <div className="dshH-archItemMeta">
            <span>{item.workspaceTitle || props.t("noProject")}</span>
            {item.createdAt === undefined ? null : (
              <span>{formatWhen(item.createdAt, props.locale)}</span>
            )}
            {item.turns > 0 ? (
              <span>{String(item.turns) + props.t("turns")}</span>
            ) : null}
          </div>
        </div>
      </div>
      {props.operationError === undefined ? null : (
        <p className="dshH-archDetailError" role="alert">
          {props.operationError}
        </p>
      )}
      <div className="dshH-archDetailBody">
        {preview.loading ? (
          <div className="dshH-archLoading" role="status" aria-live="polite">
            {props.t("loadingPreview")}
          </div>
        ) : preview.error === undefined ? preview.messages.length === 0 ? (
          <div className="dshH-archEmpty">{props.t("previewEmpty")}</div>
        ) : (
          <>
            {preview.totalMessages > preview.messages.length ? (
              <p className="dshH-archPreviewNote">
                {formatArchive(
                  props.t("previewTruncated"),
                  preview.messages.length,
                  preview.totalMessages,
                )}
              </p>
            ) : null}
            {preview.messages.map((message, index) => (
              <div key={index} className={`dshH-archMsg is-${message.role}`}>
                <div className="dshH-archMsgRole">
                  {(message.role === "user"
                    ? props.t("user")
                    : props.t("assistant")) +
                    (message.time === undefined
                      ? ""
                      : ` · ${formatWhen(message.time, props.locale)}`)}
                </div>
                {message.content}
              </div>
            ))}
          </>
        ) : (
          <div className="dshH-archEmpty" role="alert">
            {props.t("previewFailed")}: {preview.error}
          </div>
        )}
      </div>
      <div className="dshH-archDetailFoot">
        <button
          type="button"
          className="dshH-archPrimaryButton"
          disabled={props.busy || preview.loading}
          onClick={props.onRestore}
        >
          {props.t("restore")}
        </button>
        <details className="dshH-archMenu is-up">
          <summary
            className="dshH-archIconButton"
            aria-label={props.t("more")}
            aria-disabled={props.busy}
            tabIndex={props.busy ? -1 : 0}
            onClick={(event) => {
              if (props.busy) event.preventDefault();
            }}
          >
            <MoreIcon />
          </summary>
          <div>
            <button
              type="button"
              disabled={props.busy}
              onClick={props.onDelete}
            >
              {props.t("deletePermanently")}
            </button>
          </div>
        </details>
      </div>
    </div>
  );
}

export function ArchivePanel(props: {
  ctx: ClientContext;
  onBack: () => void;
}): ReactElement {
  const locale = props.ctx.locale.getLocale().active === "en" ? "en" : "zh";
  const t = useMemo(
    () =>
      props.ctx.locale.bind(XTZ_UI_ARCHIVE_NAMESPACE) as (
        key: ArchiveKey,
      ) => string,
    [props.ctx, locale],
  );
  const untitled = t("noProject");
  const [archives, setArchives] = useState<ArchiveRecord[]>([]);
  const [query, setQuery] = useState("");
  const [workspace, setWorkspace] = useState("ALL");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<
    { kind: "ok" | "err"; text: string } | undefined
  >(undefined);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [preview, setPreview] = useState<PreviewState | undefined>(undefined);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | undefined>(
    undefined,
  );
  const composing = useRef(false);
  const loadSequence = useRef(0);
  const previewSequence = useRef(0);
  const pendingLoads = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const archiveFallbackRef = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    pendingLoads.current += 1;
    try {
      const payload = (await fetchJson(
        `${XTZ_UI_ARCHIVE_PREFIX}/archives`,
      )) as { archives?: ArchiveRecord[] };
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
  }, [t]);

  useEffect(() => {
    void load().catch(() => {});
    const timer = window.setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        !busy &&
        !selecting &&
        preview === undefined &&
        deleteTarget === undefined &&
        pendingLoads.current === 0
      ) {
        void load().catch(() => {});
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [busy, deleteTarget, load, preview, selecting]);

  const filtered = useMemo(
    () =>
      filterArchives(archives, { query, workspace, sort: "newest" }, untitled),
    [archives, query, workspace, untitled],
  );
  const projects = useMemo(
    () => workspaceOptions(archives, untitled),
    [archives, untitled],
  );
  useEffect(() => {
    if (
      workspace !== "ALL" &&
      !projects.some((project) => project.key === workspace)
    )
      setWorkspace("ALL");
  }, [projects, workspace]);

  const run = async (
    work: () => Promise<ArchiveMutationWorkResult>,
    onApplied: (appliedIds: string[]) => void,
  ): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setBanner(undefined);
    try {
      const outcome = await settleArchiveMutation(work, load, onApplied);
      if (!outcome.resolved) {
        setBanner({
          kind: "err",
          text:
            outcome.mutationError instanceof Error
              ? outcome.mutationError.message
              : t("loadFailed"),
        });
        return false;
      }

      const text = outcome.residualError === undefined
        ? outcome.text
        : outcome.text === ""
          ? outcome.residualError
          : formatArchive(
              t("partialMutationResult"),
              outcome.text,
              outcome.residualError,
            );
      setBanner({
        kind: outcome.residualError === undefined ? "ok" : "err",
        text,
      });
      if (outcome.refreshError !== undefined) {
        const error =
          outcome.refreshError instanceof Error
            ? outcome.refreshError.message
            : t("loadFailed");
        setLoadError(
          formatArchive(t("refreshFailedAfterMutation"), text, error),
        );
      }
      return outcome.appliedIds.length > 0;
    } finally {
      setBusy(false);
    }
  };

  const restoreIds = (
    ids: string[],
    done: (doneIds: string[]) => string,
  ): void => {
    void run(
      async () => {
        const result = await fetchJson(`${XTZ_UI_ARCHIVE_PREFIX}/unarchive`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionIds: ids }),
        });
        return archiveMutationResult(result, done, t("noLongerArchived"));
      },
      (appliedIds) => {
        setArchives((current) =>
          current.filter((item) => !appliedIds.includes(item.sessionId)),
        );
        if (
          preview !== undefined &&
          appliedIds.includes(preview.item.sessionId)
        )
          setPreview(undefined);
        const unresolved = ids.filter((id) => !appliedIds.includes(id));
        setSelected(new Set(unresolved));
        setSelecting(unresolved.length > 0);
      },
    );
  };

  const removeTarget = (): void => {
    if (deleteTarget === undefined) return;
    const target = deleteTarget;
    void run(
      async () => {
        const result = await fetchJson(`${XTZ_UI_ARCHIVE_PREFIX}/delete`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionIds: target.ids }),
        });
        return archiveMutationResult(
          result,
          target.done,
          t("noLongerArchived"),
        );
      },
      (appliedIds) => {
        setArchives((current) =>
          current.filter((item) => !appliedIds.includes(item.sessionId)),
        );
        if (
          preview !== undefined &&
          appliedIds.includes(preview.item.sessionId)
        )
          setPreview(undefined);
        const unresolved = target.ids.filter(
          (id) => !appliedIds.includes(id),
        );
        setDeleteTarget(undefined);
        setSelected(new Set(unresolved));
        setSelecting(unresolved.length > 0);
      },
    );
  };

  const singleDeleteTarget = (item: ArchiveRecord): DeleteTarget => ({
    ids: [item.sessionId],
    title: formatArchive(t("confirmDeleteTitle"), item.title),
    body: t("confirmDeleteBody"),
    done: () => t("deleted"),
  });

  const openPreview = (item: ArchiveRecord): void => {
    const sequence = ++previewSequence.current;
    setBanner(undefined);
    setPreview({ item, loading: true, messages: [], totalMessages: 0 });
    void fetchJson(
      `${XTZ_UI_ARCHIVE_PREFIX}/detail?sessionId=${encodeURIComponent(item.sessionId)}`,
    )
      .then((payload) => {
        if (sequence !== previewSequence.current) return;
        const detail = payload as DetailPayload;
        setPreview((current) =>
          current?.item.sessionId === item.sessionId
            ? {
                item,
                loading: false,
                messages: detail.messages ?? [],
                totalMessages:
                  detail.totalMessages ?? detail.messages?.length ?? 0,
              }
            : current,
        );
      })
      .catch((error: unknown) => {
        if (sequence !== previewSequence.current) return;
        setPreview((current) =>
          current?.item.sessionId === item.sessionId
            ? {
                item,
                loading: false,
                messages: [],
                totalMessages: 0,
                error:
                  error instanceof Error ? error.message : t("previewFailed"),
              }
            : current,
        );
      });
  };

  if (preview !== undefined) {
    return (
      <>
        <ArchiveDetail
          preview={preview}
          locale={locale}
          t={t}
          busy={busy}
          operationError={banner?.kind === "err" ? banner.text : undefined}
          onBack={() => {
            previewSequence.current += 1;
            setPreview(undefined);
            window.setTimeout(() => searchRef.current?.focus(), 0);
          }}
          onRestore={() =>
            restoreIds(
              [preview.item.sessionId],
              () => formatArchive(t("restored"), preview.item.title),
            )
          }
          onDelete={() => setDeleteTarget(singleDeleteTarget(preview.item))}
        />
        {deleteTarget === undefined ? null : (
          <DeleteDialog
            key={deleteTarget.ids.join(":")}
            target={deleteTarget}
            t={t}
            busy={busy}
            error={banner?.kind === "err" ? banner.text : undefined}
            fallbackFocus={archiveFallbackRef}
            onClose={() => {
              if (!busy) setDeleteTarget(undefined);
            }}
            onConfirm={removeTarget}
          />
        )}
      </>
    );
  }

  const visibleBanner =
    loadError === undefined
      ? banner
      : { kind: "err" as const, text: loadError };
  const selectedIds = [...selected];

  return (
    <div
      className="dshH-arch"
      data-dsh-plugin="xtz-ui-archive"
      aria-busy={loading || busy}
    >
      <button
        type="button"
        className="dshH-archBack"
        disabled={busy}
        onClick={props.onBack}
      >
        <BackIcon />
        {t("backToSettings")}
      </button>
      <div className="dshH-archHeading">
        <div className="dshH-archTitleRow">
          <h2 ref={archiveFallbackRef} className="dshH-archTitle" tabIndex={-1}>
            {t("title")}
          </h2>
          {loading ? null : (
            <span className="dshH-archCount">
              {String(archives.length) + t("countUnit")}
            </span>
          )}
        </div>
        <p className="dshH-archLede">{t("description")}</p>
      </div>
      {visibleBanner === undefined ? null : (
        <div
          className={`dshH-archBanner is-${visibleBanner.kind}`}
          role={visibleBanner.kind === "err" ? "alert" : "status"}
          aria-live="polite"
        >
          <span>{visibleBanner.text}</span>
          {loadError === undefined ? null : (
            <button
              type="button"
              className="dshH-archLinkButton"
              disabled={busy || loading}
              onClick={() => {
                setLoading(true);
                void load().catch(() => {});
              }}
            >
              {t("retry")}
            </button>
          )}
        </div>
      )}
      <div className="dshH-archToolbar">
        <div className="dshH-archSearch">
          <input
            ref={searchRef}
            value={query}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            disabled={busy || loading}
            onCompositionStart={() => {
              composing.current = true;
            }}
            onCompositionEnd={(event) => {
              composing.current = false;
              setQuery(event.currentTarget.value);
              setSelected(new Set());
            }}
            onChange={(event) => {
              if (!composing.current) {
                setQuery(event.currentTarget.value);
                setSelected(new Set());
              }
            }}
          />
          {query === "" ? null : (
            <button
              type="button"
              aria-label={t("clearSearch")}
              disabled={busy || loading}
              onClick={() => {
                setQuery("");
                setSelected(new Set());
                searchRef.current?.focus();
              }}
            >
              <ClearIcon />
            </button>
          )}
        </div>
        <select
          aria-label={t("projectLabel")}
          value={workspace}
          disabled={busy || loading}
          onChange={(event) => {
            setWorkspace(event.currentTarget.value);
            setSelected(new Set());
          }}
        >
          <option value="ALL">{t("allProjects")}</option>
          {projects.map((project) => (
            <option key={project.key} value={project.key}>
              {project.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="dshH-archButton"
          disabled={busy || archives.length === 0}
          onClick={() => {
            setSelecting((current) => !current);
            setSelected(new Set());
          }}
        >
          {selecting ? t("cancelSelection") : t("select")}
        </button>
      </div>
      {loading ? (
        <div className="dshH-archLoading" role="status" aria-live="polite">
          {t("loading")}
        </div>
      ) : loadError !== undefined &&
        archives.length === 0 ? null : shouldShowArchiveEmpty(
          loading,
          loadError,
          archives.length,
        ) ? (
        <div className="dshH-archEmptyState">
          <img src={APP_ICON} alt="" />
          <h3>{t("emptyTitle")}</h3>
          <p>{t("emptyBody")}</p>
          <button
            type="button"
            className="dshH-archButton"
            onClick={props.onBack}
          >
            {t("backToSettings")}
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="dshH-archEmpty">
          <p>{t("noMatch")}</p>
          <button
            type="button"
            className="dshH-archButton"
            onClick={() => {
              setQuery("");
              setWorkspace("ALL");
              setSelected(new Set());
              searchRef.current?.focus();
            }}
          >
            {t("resetFilters")}
          </button>
        </div>
      ) : (
        <div className="dshH-archList">
          {filtered.map((item) => (
            <ArchiveRow
              key={item.sessionId}
              item={item}
              locale={locale}
              untitled={untitled}
              t={t}
              busy={busy}
              selecting={selecting}
              selected={selected.has(item.sessionId)}
              onOpen={() => openPreview(item)}
              onRestore={() =>
                restoreIds(
                  [item.sessionId],
                  () => formatArchive(t("restored"), item.title),
                )
              }
              onSelect={() =>
                setSelected((current) => {
                  const next = new Set(current);
                  if (next.has(item.sessionId)) next.delete(item.sessionId);
                  else next.add(item.sessionId);
                  return next;
                })
              }
              onDelete={() => setDeleteTarget(singleDeleteTarget(item))}
            />
          ))}
        </div>
      )}
      {selecting && filtered.length > 0 ? (
        <div
          className="dshH-archBulk"
          role="region"
          aria-label={t("bulkActions")}
        >
          <span>{formatArchive(t("selectedCount"), selected.size)}</span>
          <button
            type="button"
            className="dshH-archLinkButton"
            disabled={busy}
            onClick={() =>
              setSelected(new Set(filtered.map((item) => item.sessionId)))
            }
          >
            {t("selectAllResults")}
          </button>
          <button
            type="button"
            className="dshH-archButton"
            disabled={busy || selected.size === 0}
            onClick={() =>
              restoreIds(selectedIds, (doneIds) =>
                formatArchive(t("restoredSelected"), doneIds.length),
              )
            }
          >
            {t("restoreSelected")}
          </button>
          <button
            type="button"
            className="dshH-archDangerButton"
            disabled={busy || selected.size === 0}
            onClick={() =>
              setDeleteTarget({
                ids: selectedIds,
                title: formatArchive(t("confirmSelectedTitle"), selected.size),
                body: t("confirmSelectedBody"),
                done: (doneIds) =>
                  formatArchive(t("deletedSelected"), doneIds.length),
              })
            }
          >
            {t("deletePermanently")}
          </button>
        </div>
      ) : null}
      {!loading && archives.length > 0 && !selecting ? (
        <section className="dshH-archCleanup">
          <div>
            <h3>{t("dataCleanup")}</h3>
            <p>{t("dataCleanupHint")}</p>
          </div>
          <button
            type="button"
            className="dshH-archDangerOutline"
            disabled={busy}
            onClick={() =>
              setDeleteTarget({
                ids: archives.map((item) => item.sessionId),
                title: formatArchive(t("confirmAllTitle"), archives.length),
                body: t("confirmAllBody"),
                done: (doneIds) =>
                  formatArchive(t("deletedAll"), doneIds.length),
                requiredPhrase: t("deleteAllPhrase"),
              })
            }
          >
            {t("deleteAll")}
          </button>
        </section>
      ) : null}
      {deleteTarget === undefined ? null : (
        <DeleteDialog
          key={deleteTarget.ids.join(":")}
          target={deleteTarget}
          t={t}
          busy={busy}
          error={banner?.kind === "err" ? banner.text : undefined}
          fallbackFocus={archiveFallbackRef}
          onClose={() => {
            if (!busy) setDeleteTarget(undefined);
          }}
          onConfirm={removeTarget}
        />
      )}
    </div>
  );
}
