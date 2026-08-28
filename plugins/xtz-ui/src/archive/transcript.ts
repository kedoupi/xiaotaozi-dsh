import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { zstdDecompressSync } from "node:zlib";

const ZSTD_MAGIC = 0xFD2FB528;

export interface ArchiveMessage {
  role: "user" | "assistant";
  time: number | undefined;
  content: string;
}

export interface SessionFileMeta {
  title: string | undefined;
  createdAt: number | undefined;
  turns: number;
}

export interface SessionDetail {
  messages: ArchiveMessage[];
  totalMessages: number;
}

interface FrameRange {
  start: number;
  end: number;
}

export function scanZstdFrames(buffer: Buffer): FrameRange[] {
  const frames: FrameRange[] = [];
  let offset = 0;
  while (offset < buffer.length) {
    const start = offset;
    if (buffer.length - offset < 4) break;
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) break;
    offset += 4;
    if (offset === buffer.length) break;
    const descriptor = buffer.readUInt8(offset);
    offset += 1;
    if ((descriptor & 24) !== 0) break;
    const contentSizeFlag = descriptor >>> 6;
    const singleSegment = (descriptor & 32) !== 0;
    const checksum = (descriptor & 4) !== 0;
    const dictionaryFlag = descriptor & 3;
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag;
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag;
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes;
    if (buffer.length - offset < remainingHeaderBytes) break;
    offset += remainingHeaderBytes;
    for (;;) {
      if (buffer.length - offset < 3) break;
      const blockHeader = buffer.readUIntLE(offset, 3);
      offset += 3;
      const lastBlock = (blockHeader & 1) !== 0;
      const blockType = (blockHeader >>> 1) & 3;
      const blockSize = blockHeader >>> 3;
      if (blockType === 3) break;
      const payloadBytes = blockType === 1 ? 1 : blockSize;
      if (buffer.length - offset < payloadBytes) break;
      offset += payloadBytes;
      if (lastBlock) break;
    }
    if (checksum) {
      if (buffer.length - offset < 4) break;
      offset += 4;
    }
    frames.push({ start, end: offset });
  }
  return frames;
}

export function decodeZstdLog(filePath: string): string {
  if (!existsSync(filePath)) return "";
  try {
    const buf = readFileSync(filePath);
    const frames = scanZstdFrames(buf);
    if (frames.length === 0) {
      try {
        return zstdDecompressSync(buf).toString("utf8");
      } catch {
        return "";
      }
    }
    const chunks: Buffer[] = [];
    for (const { start, end } of frames) {
      try {
        chunks.push(zstdDecompressSync(buf.subarray(start, end)));
      } catch {
        // tolerate trailing damaged frame
      }
    }
    return Buffer.concat(chunks).toString("utf8");
  } catch {
    return "";
  }
}

export function readTranscriptText(dataDir: string): string {
  const zstdPath = join(dataDir, "session.jsonl.zstd");
  const jsonlPath = join(dataDir, "session.jsonl");
  if (existsSync(zstdPath)) return decodeZstdLog(zstdPath);
  if (existsSync(jsonlPath)) {
    try {
      return readFileSync(jsonlPath, "utf8");
    } catch {
      return "";
    }
  }
  return "";
}

function cleanUserText(text: string): string {
  let clean = text;
  const reminderIdx = clean.indexOf("<system-reminder>");
  if (reminderIdx !== -1) clean = clean.slice(0, reminderIdx).trim();
  const runtimeIdx = clean.indexOf("Current runtime context.");
  if (runtimeIdx !== -1) clean = clean.slice(0, runtimeIdx).trim();
  return clean;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  return value as Record<string, unknown>;
}

export function readSessionMetaFromDataFile(dataDir: string): SessionFileMeta {
  const rawText = readTranscriptText(dataDir);
  let title: string | undefined;
  let createdAt: number | undefined;
  let firstUserMsg: string | undefined;
  let turns = 0;
  for (const line of rawText.split("\n")) {
    if (line === "") continue;
    try {
      const ev = asRecord(JSON.parse(line));
      if (ev === undefined) continue;
      const type = ev.type;
      if (type === "session") {
        if (typeof ev.createdAt === "number") createdAt = ev.createdAt;
      } else if (type === "session/title/set" || type === "title") {
        const data = asRecord(ev.data);
        if (typeof ev.title === "string") title = ev.title;
        else if (typeof data?.title === "string") title = data.title;
      } else if (type === "turn/start") {
        turns += 1;
      } else if (firstUserMsg === undefined && type === "user/message") {
        const data = asRecord(ev.data);
        const contents = Array.isArray(data?.content) ? data.content : [];
        for (const item of contents) {
          const rec = asRecord(item);
          if (rec?.type === "text" && typeof rec.text === "string") {
            const clean = cleanUserText(rec.text);
            if (clean !== "") {
              firstUserMsg = clean.slice(0, 50);
              break;
            }
          }
        }
      }
    } catch {
      // skip malformed lines
    }
  }
  return { title: title ?? firstUserMsg, createdAt, turns };
}

export function extractSessionDetail(dataDir: string, maxMessages = 50): SessionDetail {
  const rawText = readTranscriptText(dataDir);
  const messages: ArchiveMessage[] = [];
  let headerTime: number | undefined;
  for (const line of rawText.split("\n")) {
    if (line === "") continue;
    try {
      const ev = asRecord(JSON.parse(line));
      if (ev === undefined) continue;
      if (ev.type === "session" && typeof ev.createdAt === "number") headerTime = ev.createdAt;
      if (ev.type === "user/message") {
        const data = asRecord(ev.data);
        const contents = Array.isArray(data?.content) ? data.content : [];
        for (const item of contents) {
          const rec = asRecord(item);
          if (rec?.type === "text" && typeof rec.text === "string") {
            const clean = cleanUserText(rec.text);
            if (clean !== "") {
              messages.push({
                role: "user",
                time: typeof ev.time === "number" ? ev.time : headerTime,
                content: clean,
              });
            }
          }
        }
      } else if (ev.type === "assistant/message") {
        const data = asRecord(ev.data);
        const message = asRecord(data?.message);
        const contents = Array.isArray(message?.content) ? message.content : [];
        const textParts: string[] = [];
        for (const item of contents) {
          const rec = asRecord(item);
          if (rec?.type === "text" && typeof rec.text === "string" && rec.text.trim() !== "") {
            textParts.push(rec.text.trim());
          }
        }
        if (textParts.length > 0) {
          messages.push({
            role: "assistant",
            time: typeof ev.time === "number" ? ev.time : undefined,
            content: textParts.join("\n\n"),
          });
        }
      }
    } catch {
      // skip malformed lines
    }
  }
  return { messages: messages.slice(-maxMessages), totalMessages: messages.length };
}
