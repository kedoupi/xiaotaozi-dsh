export const VIDEO_NAME_PATTERN = /^[\w.-]+\.mp4$/;

export function readVideoName(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) throw new Error("视频参数无效");
  const name = (payload as Record<string, unknown>).name;
  if (typeof name !== "string" || !VIDEO_NAME_PATTERN.test(name)) throw new Error("视频参数无效");
  return name;
}

export interface VideoBytes {
  mediaType: string;
  dataBase64: string;
}

export function readVideoBytes(result: {
  ok: boolean;
  value?: VideoBytes;
  error?: { message: string };
}): VideoBytes {
  if (!result.ok || result.value === undefined) {
    throw new Error(result.error?.message ?? "video load failed");
  }
  return result.value;
}
