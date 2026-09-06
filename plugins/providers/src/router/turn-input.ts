/** Raster types the attachment catalog already admits as images. */
const IMAGE_MEDIA = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
const IMAGE_FILE_NAME = /\.(png|jpe?g|webp|gif)$/i;

export interface TurnContentBlock {
  type: string;
  attachment?: {
    name?: string;
    mediaType?: string;
  };
}

export function blockNeedsImage(block: TurnContentBlock): boolean {
  if (block.type === "image") return true;
  if (block.type !== "file") return false;
  const media = block.attachment?.mediaType;
  if (typeof media === "string" && IMAGE_MEDIA.has(media.toLowerCase())) return true;
  const name = block.attachment?.name;
  return typeof name === "string" && IMAGE_FILE_NAME.test(name);
}

/** True when this human turn carries image bytes or a file that is a raster image. */
export function messageNeedsImage(message: { content: readonly TurnContentBlock[] }): boolean {
  return message.content.some(blockNeedsImage);
}
