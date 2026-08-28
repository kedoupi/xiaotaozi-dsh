import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import type { ClientContext, SessionListState } from "@deepseek-ai/dsh-client-runtime/client";
import { XTZ_UI_GG_PREFIX, XTZ_UI_GIT_GRAPH_NAMESPACE } from "../names.ts";
import { heroContext, heroViewport, paintedRight } from "../git-graph/hero.ts";
import {
  GRAPH_COL_W,
  GRAPH_ROW_H,
  graphPath,
  layoutGraph,
  type GraphCommit,
  type GraphLayout,
} from "../git-graph/parse.ts";
import type { GitGraphKey } from "./gitgraph-locales.ts";

export type UseSessions = <T>(selector: (state: SessionListState) => T) => T;

interface StatusPayload {
  repo?: boolean;
  branch?: string;
  dirtyFiles?: number;
}

interface BranchesPayload {
  repo?: boolean;
  branch?: string;
  branches?: Array<{ name: string; current: boolean }>;
}

const INITIAL_LIMIT = 80;
const PAGE_STEP = 80;

async function fetchJson(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, { cache: "no-store", ...init });
  const payload = await response.json() as { ok?: boolean; error?: string };
  if (!response.ok || payload.ok === false) throw new Error(payload.error ?? `http ${String(response.status)}`);
  return payload;
}

function qs(sessionId: string, extra: Record<string, string> = {}): string {
  return new URLSearchParams({ sessionId, ...extra }).toString();
}

function formatTime(epochSeconds: number, t: (key: GitGraphKey) => string): string {
  if (!Number.isFinite(epochSeconds) || epochSeconds <= 0) return "";
  const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - epochSeconds);
  if (elapsed < 60) return t("justNow");
  if (elapsed < 3600) return `${String(Math.floor(elapsed / 60))} ${t("minutesAgo")}`;
  if (elapsed < 86400) return `${String(Math.floor(elapsed / 3600))} ${t("hoursAgo")}`;
  if (elapsed < 30 * 86400) return `${String(Math.floor(elapsed / 86400))} ${t("daysAgo")}`;
  const date = new Date(epochSeconds * 1000);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function CloseIcon(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4l8 8M12 4 4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function GraphMarks(props: { layout: GraphLayout }): ReactElement {
  const { nodes, edges } = props.layout;
  return (
    <>
      {edges.map((edge, index) => {
        const lane = Math.max(edge.fromCol, edge.toCol) % 8;
        return (
          <path
            key={`e-${String(index)}`}
            d={graphPath(edge, GRAPH_COL_W, GRAPH_ROW_H)}
            fill="none"
            stroke={`var(--dshH-gg-lane-${String(lane)})`}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
      {nodes.map((node) => {
        const cx = (node.col + 0.5) * GRAPH_COL_W;
        const cy = (node.row + 0.5) * GRAPH_ROW_H;
        const color = `var(--dshH-gg-lane-${String(node.col % 8)})`;
        return (
          <g key={`n-${String(node.row)}`}>
            {node.merge ? (
              <>
                <circle cx={cx} cy={cy} r="5" fill="var(--dshH-gg-node-fill)" stroke={color} strokeWidth="1.5" />
                <circle cx={cx} cy={cy} r="1.75" fill={color} />
              </>
            ) : (
              <circle cx={cx} cy={cy} r="3.25" fill={color} />
            )}
          </g>
        );
      })}
    </>
  );
}

function GraphLaneCell(props: { row: number; layout: GraphLayout }): ReactElement {
  const width = Math.max(props.layout.laneCount, 1) * GRAPH_COL_W + 8;
  const y0 = props.row * GRAPH_ROW_H;
  return (
    <svg
      className="dshH-gg-graphSvg"
      width={width}
      height={GRAPH_ROW_H}
      viewBox={`0 ${String(y0)} ${String(width)} ${String(GRAPH_ROW_H)}`}
      overflow="hidden"
      aria-hidden="true"
    >
      <GraphMarks layout={props.layout} />
    </svg>
  );
}

function GraphDialog(props: {
  sessionId: string;
  t: (key: GitGraphKey) => string;
  onClose: () => void;
}): ReactElement | null {
  const [commits, setCommits] = useState<GraphCommit[]>([]);
  const [branch, setBranch] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const requestSeq = useRef(0);

  const load = useCallback((limit: number): void => {
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    setLoading(true);
    void fetchJson(`${XTZ_UI_GG_PREFIX}/log?${qs(props.sessionId, { limit: String(limit) })}`).then((payload) => {
      if (seq !== requestSeq.current) return;
      const body = payload as { commits?: GraphCommit[]; branch?: string; hasMore?: boolean };
      setCommits(Array.isArray(body.commits) ? body.commits : []);
      setBranch(typeof body.branch === "string" ? body.branch : undefined);
      setHasMore(body.hasMore === true);
      setError(undefined);
    }).catch((caught: unknown) => {
      if (seq !== requestSeq.current) return;
      setError(caught instanceof Error ? caught.message : props.t("loadFailed"));
    }).finally(() => {
      if (seq === requestSeq.current) setLoading(false);
    });
  }, [props.sessionId, props.t]);

  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    loadRef.current(INITIAL_LIMIT);
  }, [props.sessionId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.onClose]);

  const layout = useMemo(() => layoutGraph(commits), [commits]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      <div className="dshH-gg-dialogMask" role="presentation" onClick={props.onClose} />
      <div className="dshH-gg-dialog" role="dialog" aria-label={props.t("graph")} data-gitgraph-dialog="">
        <div className="dshH-gg-dialogHeader">
          <div className="dshH-gg-dialogHeading">
            <h3 className="dshH-gg-dialogTitle">{props.t("graph")}</h3>
            <div className="dshH-gg-graphSubtitle">
              {`${String(commits.length)} ${props.t("commits")} · ${String(layout.laneCount)} ${props.t("lanes")}`}
            </div>
          </div>
          <button
            type="button"
            className="dshH-gg-dialogClose"
            onClick={props.onClose}
            aria-label={props.t("close")}
          >
            <CloseIcon />
          </button>
        </div>
        {error !== undefined ? <p className="dshH-gg-notice">{error}</p> : null}
        <div className="dshH-gg-graphBody">
          {loading && commits.length === 0 ? <p className="dshH-gg-graphEmpty">{props.t("loading")}</p> : null}
          {error === undefined && !loading && commits.length === 0 ? <p className="dshH-gg-graphEmpty">{props.t("empty")}</p> : null}
          {commits.length > 0 ? (
            <div className="dshH-gg-graphRows">
              {commits.map((commit, index) => {
                const when = formatTime(commit.authorTime, props.t);
                const isHead = branch !== undefined && commit.refs.includes(branch);
                return (
                  <div
                    key={commit.oid}
                    className={`dshH-gg-graphRow${isHead ? " is-head" : ""}`}
                    title={commit.oid}
                  >
                    <GraphLaneCell row={index} layout={layout} />
                    <span className="dshH-gg-graphOid">{commit.oid.slice(0, 7)}</span>
                    <span className="dshH-gg-graphMain">
                      <span className="dshH-gg-graphSubject" title={commit.subject}>{commit.subject}</span>
                      <span className="dshH-gg-graphMeta">
                        {commit.refs.map((ref) => (
                          <span
                            key={ref}
                            title={ref}
                            className={`dshH-gg-graphRef${ref === branch ? " dshH-gg-graphRefCurrent" : ""}`}
                          >
                            {ref}
                          </span>
                        ))}
                        {commit.author !== "" ? <span>{commit.author}</span> : null}
                        {when !== "" ? <span className="dshH-gg-graphMetaSep">·</span> : null}
                        {when !== "" ? <span>{when}</span> : null}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
        {hasMore ? (
          <button
            type="button"
            className="dshH-gg-graphMore"
            onClick={() => load(commits.length + PAGE_STEP)}
          >
            {props.t("loadMore")}
          </button>
        ) : null}
      </div>
    </>,
    document.body,
  );
}

export function GitGraphChip(props: {
  ctx: ClientContext;
  sessionId?: string;
  useSessions?: UseSessions;
}): ReactElement | null {
  const t = props.ctx.locale.bind(XTZ_UI_GIT_GRAPH_NAMESPACE) as (key: GitGraphKey) => string;
  const current = props.useSessions?.((state) => state.current);
  const sessionId = props.sessionId ?? current;
  const blank = props.useSessions?.((state) => {
    if (sessionId === undefined) return false;
    return state.byId[sessionId]?.blank === true;
  });
  const [open, setOpen] = useState(false);
  const [graph, setGraph] = useState(false);
  const [status, setStatus] = useState<StatusPayload | undefined>(undefined);
  const [branches, setBranches] = useState<BranchesPayload | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [heroPlacement, setHeroPlacement] = useState<{ left: number; top: number } | undefined>(undefined);
  const anchorRef = useRef<HTMLSpanElement | null>(null);

  const loadStatus = useCallback(async (): Promise<void> => {
    if (sessionId === undefined) return;
    try {
      const payload = await fetchJson(`${XTZ_UI_GG_PREFIX}/status?${qs(sessionId)}`) as StatusPayload;
      setStatus(payload);
      setError(undefined);
    } catch {
      setStatus({ repo: false });
    }
  }, [sessionId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const show = sessionId !== undefined && blank !== false && status?.repo === true;

  useLayoutEffect(() => {
    if (!show) return;
    const anchor = anchorRef.current;
    if (anchor === null) return;
    const context = heroContext(anchor);
    if (context === undefined) {
      setHeroPlacement({ left: 0, top: 0 });
      return;
    }
    const measure = (): void => {
      const rowRect = context.heroRow.getBoundingClientRect();
      const anchorRect = anchor.getBoundingClientRect();
      if (rowRect.width <= 0 || anchorRect.width <= 0) return;
      const right = paintedRight(context.heroRow);
      if (right === null) return;
      const next = heroViewport(rowRect, anchorRect.height, right);
      setHeroPlacement((previous) => {
        if (previous !== undefined && Math.abs(previous.left - next.left) < 0.5 && Math.abs(previous.top - next.top) < 0.5) {
          return previous;
        }
        return next;
      });
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    observer?.observe(anchor);
    observer?.observe(context.heroRow);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [show, status?.branch]);

  useEffect(() => {
    if (!show) {
      setOpen(false);
      setGraph(false);
    }
  }, [show]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const closeGraph = useCallback((): void => {
    setGraph(false);
  }, []);

  if (!show || sessionId === undefined || status === undefined) return null;

  const label = status.branch ?? t("detached");
  const filtered = (branches?.branches ?? []).filter((row) =>
    query.trim() === "" || row.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const runSwitch = async (branch: string): Promise<void> => {
    try {
      await fetchJson(`${XTZ_UI_GG_PREFIX}/switch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, branch }),
      });
      setOpen(false);
      await loadStatus();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("switchFailed"));
    }
  };

  const openGraph = (): void => {
    setOpen(false);
    setGraph(true);
  };

  return (
    <span
      ref={anchorRef}
      className={`dshH-gg-anchor dshH-gg-anchorHero${heroPlacement === undefined ? "" : " is-placed"}`}
      data-gitgraph-chip-anchor=""
      style={heroPlacement === undefined || (heroPlacement.left === 0 && heroPlacement.top === 0)
        ? undefined
        : { position: "fixed", left: `${String(heroPlacement.left)}px`, top: `${String(heroPlacement.top)}px` }}
    >
    <span className="dshH-gg-chipWrap">
      <button
        type="button"
        className={`dshH-gg-chip dshH-gg-chipHero${open ? " dshH-gg-chipOpen" : ""}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          setOpen((value) => !value);
          if (!open) {
            void fetchJson(`${XTZ_UI_GG_PREFIX}/branches?${qs(sessionId)}`).then((payload) => {
              setBranches(payload as BranchesPayload);
            }).catch(() => setError(t("loadFailed")));
          }
        }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M4.5 3.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm0 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm7-4.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z" stroke="currentColor" strokeWidth="1.3" />
          <path d="M4.5 6.5v2.5m0 0c0 1.2 1.1 2 2.5 2h2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <span className="dshH-gg-chipLabel">{label}</span>
        {(status.dirtyFiles ?? 0) > 0 ? ` · ${String(status.dirtyFiles)}` : ""}
        <svg className="dshH-gg-chipChevron" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <>
          <div className="dshH-gg-backdrop" role="presentation" onClick={() => setOpen(false)} />
          <div className="dshH-gg-popover dshH-gg-popoverHero" role="listbox" aria-label={t("search")} data-gitgraph-popover="">
            {error !== undefined ? <p className="dshH-gg-notice">{error}</p> : null}
            <div className="dshH-gg-searchBox">
              <input className="dshH-gg-searchInput" value={query} placeholder={t("search")} autoFocus onChange={(event) => setQuery(event.target.value)} />
            </div>
            <div className="dshH-gg-list">
              {branches !== undefined && filtered.length === 0 ? <p className="dshH-gg-empty">{t("branchEmpty")}</p> : null}
              {filtered.map((row) => (
                <button
                  key={row.name}
                  type="button"
                  className="dshH-gg-item"
                  role="option"
                  aria-selected={row.current}
                  onClick={() => void runSwitch(row.name)}
                >
                  <span className="dshH-gg-itemText">
                    <span className="dshH-gg-itemName">{row.name}</span>
                  </span>
                  {row.current ? <span className="dshH-gg-check">✓</span> : null}
                </button>
              ))}
            </div>
            <div className="dshH-gg-footer">
              <button type="button" className="dshH-gg-footerItem" onClick={openGraph}>{t("graph")}</button>
            </div>
          </div>
        </>
      ) : null}
      {graph ? <GraphDialog sessionId={sessionId} t={t} onClose={closeGraph} /> : null}
    </span>
    </span>
  );
}
