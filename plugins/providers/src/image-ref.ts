import type { ImageAttachmentRef } from "@deepseek-ai/dsh-attachment";

export const IMAGE_MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

export function readImageRef(payload: unknown): ImageAttachmentRef {
  if (typeof payload !== "object" || payload === null) throw new Error("图片参数无效");
  const record = payload as Record<string, unknown>;
  const attachmentId = record.attachmentId;
  if (typeof attachmentId !== "string" || attachmentId.length === 0) throw new Error("图片参数无效");
  const mediaType = record.mediaType;
  if (typeof mediaType !== "string" || !(IMAGE_MEDIA_TYPES as readonly string[]).includes(mediaType)) {
    throw new Error("图片参数无效");
  }
  for (const field of ["bytes", "width", "height"] as const) {
    const value = record[field];
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) throw new Error("图片参数无效");
  }
  const name = record.name;
  if (name !== undefined && typeof name !== "string") throw new Error("图片参数无效");
  return {
    attachmentId: attachmentId as ImageAttachmentRef["attachmentId"],
    mediaType: mediaType as ImageAttachmentRef["mediaType"],
    bytes: record.bytes as number,
    width: record.width as number,
    height: record.height as number,
    ...name === undefined ? {} : { name },
  };
}

export function imageDataUrl(result: {
  ok: boolean;
  value?: { mediaType: string; dataBase64: string };
  error?: { message: string };
}): string {
  if (!result.ok || result.value === undefined) {
    throw new Error(result.error?.message ?? "image load failed");
  }
  return `data:${result.value.mediaType};base64,${result.value.dataBase64}`;
}
