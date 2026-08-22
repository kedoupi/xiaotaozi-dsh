import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { readVideoBytes } from "../video-ref.ts";
import type { VideoBytes } from "../video-ref.ts";
import { zh } from "./locales.ts";
import type { ProvidersKey } from "./locales.ts";
import { format } from "./workspace-shared.ts";
import type { Rpc, RpcResult } from "./workspace-shared.ts";

const CHANNEL = "/providers-auth";
const PROMPT_MAX_LENGTH = 60;

interface ToolCallBlock {
  kind?: string;
  isError?: boolean;
  error?: { name: string; code: string };
  argsRaw?: string;
  call?: { argsRaw?: string };
  meta?: { fileName?: string };
  content?: Array<{ type: string; text?: string }>;
}

interface ToolCallOwnerProps {
  callId: string;
  toolName: string;
  block: ToolCallBlock;
  cwd?: string;
  openFile: (path: string) => void;
  inspect?: () => void;
}

export interface VideoGenerateToolviewInjected {
  loadVideo: (name: string) => Promise<VideoBytes>;
}

export type VideoGenerateToolviewProps =
  Partial<ToolCallOwnerProps>
  & Partial<VideoGenerateToolviewInjected>
  & { t?: ((key: ProvidersKey, vars?: Record<string, string>) => string) | undefined };

export function createVideoLoader(rpc: Rpc): (name: string) => Promise<VideoBytes> {
  return async (name) => {
    const result = await rpc.call(CHANNEL, "video", { name }) as RpcResult<VideoBytes>;
    return readVideoBytes(result);
  };
}

function fallbackTranslate(key: ProvidersKey, vars?: Record<string, string>): string {
  return format(zh[key], vars);
}

function derivePrompt(argsRaw: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(argsRaw);
  } catch {
    parsed = undefined;
  }
  let prompt: string | undefined;
  if (typeof parsed === "object" && parsed !== null) {
    const args = parsed as Record<string, unknown>;
    if (typeof args.prompt === "string" && args.prompt !== "") prompt = args.prompt;
    else {
      for (const value of Object.values(args)) {
        if (typeof value === "string" && value !== "") {
          prompt = value;
          break;
        }
      }
    }
  }
  const line = (prompt ?? argsRaw).split("\n", 1)[0] ?? "";
  return line.length > PROMPT_MAX_LENGTH ? `${line.slice(0, PROMPT_MAX_LENGTH)}…` : line;
}

function resultText(block: ToolCallBlock): string {
  if (!("kind" in block)) return "";
  const parts: string[] = [];
  for (const part of block.content ?? []) {
    if (part.type === "text" && typeof part.text === "string") parts.push(part.text);
  }
  if (parts.length === 0 && block.error !== undefined) parts.push(`${block.error.name}: ${block.error.code}`);
  return parts.join("\n");
}

function resolveFileName(block: ToolCallBlock): string | undefined {
  if (!("kind" in block)) return undefined;
  const fileName = block.meta?.fileName;
  if (typeof fileName === "string" && fileName.length > 0) return fileName;
  const match = /^Saved video to (.+\.mp4)/m.exec(resultText(block));
  if (match === null) return undefined;
  const path = match[1] ?? "";
  return path.slice(path.lastIndexOf("/") + 1);
}

function base64Bytes(dataBase64: string): Uint8Array {
  const binary = atob(dataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

type LoadState =
  | { phase: "loading" }
  | { phase: "ready"; url: string }
  | { phase: "failed"; message: string };

const styles: Record<string, CSSProperties> = {
  container: { display: "flex", flexDirection: "column", gap: 6, padding: "4px 0" },
  row: { display: "flex", alignItems: "center", gap: 6, minWidth: 0 },
  icon: { display: "inline-flex", flexShrink: 0, color: "var(--dsw-alias-label-tertiary)" },
  title: {
    fontSize: 13,
    lineHeight: "20px",
    color: "var(--dsw-alias-label-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  subtle: { margin: 0, fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-label-tertiary)" },
  output: {
    margin: 0,
    fontSize: 12,
    lineHeight: "18px",
    color: "var(--dsw-alias-label-secondary)",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },
  error: { margin: 0, fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-state-error-primary)" },
  video: {
    display: "block",
    maxWidth: 480,
    width: "100%",
    borderRadius: 8,
    backgroundColor: "var(--dsw-alias-fill-tertiary)",
  },
};

function SparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 1.2l1.1 3.4 3.5.1-2.8 2.2 1 3.4L8 8.3 4.2 10.3l1-3.4-2.8-2.2 3.5-.1L8 1.2zm5.4 7.1.7 2.1 2.2.1-1.8 1.3.6 2.1-1.7-1.2-1.8 1.2.6-2.1-1.7-1.3 2.1-.1.8-2.1z" />
    </svg>
  );
}

export function VideoGenerateToolview(props: VideoGenerateToolviewProps) {
  const { block, loadVideo } = props;
  const t = props.t ?? fallbackTranslate;
  const settled = block !== undefined && "kind" in block;
  const isError = settled && block.isError;
  const fileName = block !== undefined && settled && !isError ? resolveFileName(block) : undefined;
  const [load, setLoad] = useState<LoadState>({ phase: "loading" });

  useEffect(() => {
    if (fileName === undefined || loadVideo === undefined) return;
    let cancelled = false;
    let objectUrl: string | undefined;
    setLoad({ phase: "loading" });
    loadVideo(fileName).then(
      (video) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(new Blob([base64Bytes(video.dataBase64).slice()], { type: video.mediaType }));
        setLoad({ phase: "ready", url: objectUrl });
      },
      (error: unknown) => {
        if (cancelled) return;
        setLoad({ phase: "failed", message: error instanceof Error ? error.message : String(error) });
      },
    );
    return () => {
      cancelled = true;
      if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl);
    };
  }, [fileName, loadVideo]);

  if (block === undefined) return null;
  const argsRaw = (settled ? block.call?.argsRaw : block.argsRaw) ?? "";
  const title = `video_generate: ${derivePrompt(argsRaw)}`;
  const text = settled ? resultText(block) : "";
  return (
    <div style={styles.container}>
      <div style={styles.row}>
        <span style={styles.icon}><SparkleIcon /></span>
        <span style={styles.title}>{title}</span>
      </div>
      {!settled && <p style={styles.subtle}>{t("generatingVideo")}</p>}
      {settled && isError && text !== "" && (
        <p style={styles.error}>{text.split("\n", 1)[0]}</p>
      )}
      {settled && !isError && fileName !== undefined && loadVideo !== undefined && load.phase === "loading" && (
        <p style={styles.subtle}>{t("videoLoading")}</p>
      )}
      {settled && !isError && fileName !== undefined && loadVideo !== undefined && load.phase === "failed" && (
        <p style={styles.error}>{t("videoLoadFailed", { message: load.message })}</p>
      )}
      {settled && !isError && fileName !== undefined && loadVideo !== undefined && load.phase === "ready" && (
        <video style={styles.video} src={load.url} controls preload="metadata" />
      )}
      {settled && !isError && (fileName === undefined || loadVideo === undefined) && text !== "" && (
        <p style={styles.output}>{text}</p>
      )}
    </div>
  );
}
