import type { CSSProperties } from "react";
import { imageDataUrl } from "../image-ref.ts";
import { ImageGallery } from "./ImageGallery.tsx";
import type { ImageAttachmentRef, ImageLoader, MessageImageLabels } from "./ImageGallery.tsx";
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
  content?: Array<{ type: string; text?: string; attachment?: ImageAttachmentRef }>;
}

interface ToolCallOwnerProps {
  callId: string;
  toolName: string;
  block: ToolCallBlock;
  cwd?: string;
  openFile: (path: string) => void;
  inspect?: () => void;
}

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface SlotMap {
    "tool.call.toolview": { kind: "keyed"; scope: "session"; owner: ToolCallOwnerProps };
  }
}

export interface ImageGenerateToolviewInjected {
  load: ImageLoader;
}

export type ImageGenerateToolviewProps =
  Partial<ToolCallOwnerProps>
  & Partial<ImageGenerateToolviewInjected>
  & { t?: ((key: ProvidersKey, vars?: Record<string, string>) => string) | undefined };

interface ImageEndpointResult {
  mediaType: string;
  dataBase64: string;
}

export function createImageLoader(rpc: Rpc): ImageLoader {
  return async (attachment) => {
    const result = await rpc.call(CHANNEL, "image", { ...attachment }) as RpcResult<ImageEndpointResult>;
    return imageDataUrl(result);
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

function resultImages(block: ToolCallBlock): { attachment: ImageAttachmentRef }[] {
  if (!("kind" in block)) return [];
  const images: { attachment: ImageAttachmentRef }[] = [];
  for (const part of block.content ?? []) {
    if (part.type === "image" && part.attachment !== undefined) images.push({ attachment: part.attachment });
  }
  return images;
}

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
  subtle: { margin: 0, fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-label-secondary)" },
  output: {
    margin: 0,
    fontSize: 12,
    lineHeight: "18px",
    color: "var(--dsw-alias-label-secondary)",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },
  error: {
    margin: 0,
    fontSize: 12,
    lineHeight: "18px",
    color: "color-mix(in srgb, var(--dsw-alias-state-error-primary, #ec1313) 64%, var(--dsw-alias-label-primary, #111827))",
  },
};

function SparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 1.2l1.1 3.4 3.5.1-2.8 2.2 1 3.4L8 8.3 4.2 10.3l1-3.4-2.8-2.2 3.5-.1L8 1.2zm5.4 7.1.7 2.1 2.2.1-1.8 1.3.6 2.1-1.7-1.2-1.8 1.2.6-2.1-1.7-1.3 2.1-.1.8-2.1z" />
    </svg>
  );
}

export function ImageGenerateToolview(props: ImageGenerateToolviewProps) {
  const { block, load } = props;
  const t = props.t ?? fallbackTranslate;
  if (block === undefined) return null;
  const settled = "kind" in block;
  const argsRaw = (settled ? block.call?.argsRaw : block.argsRaw) ?? "";
  const title = `image_generate: ${derivePrompt(argsRaw)}`;
  const images = resultImages(block);
  const text = settled ? resultText(block) : "";
  const labels: MessageImageLabels = {
    image: t("image"),
    open: t("viewImage"),
    openNamed: (name) => t("viewImageNamed", { name }),
    loading: t("imageLoading"),
    loadFailed: t("imageLoadFailed"),
    lightbox: { dialog: t("imagePreview"), close: t("imageClose") },
  };
  return (
    <div style={styles.container}>
      <div style={styles.row}>
        <span style={styles.icon}><SparkleIcon /></span>
        <span style={styles.title}>{title}</span>
      </div>
      {!settled && <p role="status" aria-live="polite" style={styles.subtle}>{t("generating")}</p>}
      {settled && block.isError && text !== "" && (
        <p role="alert" style={styles.error}>{text.split("\n", 1)[0]}</p>
      )}
      {settled && !block.isError && images.length > 0 && load !== undefined && (
        <ImageGallery images={images} load={load} labels={labels} />
      )}
      {settled && !block.isError && (images.length === 0 || load === undefined) && text !== "" && (
        <p style={styles.output}>{text}</p>
      )}
    </div>
  );
}
