/**
 * Plugin-pack CDN. Same CloudBase COS bucket as xiaotaozi
 * (`s.xiaotaozi.cc`), dedicated prefix so packs do not mix with
 * wallpaper / uploads / handwriting.
 *
 * Do not invent dsh.xiaotaozi.cc. Do not use GitHub Pages.
 */
export const CDN_HOST = "s.xiaotaozi.cc";
export const PACK_PREFIX = "dsh/packs";
export const TCB_ENV_ID = "xiaotaozi-5g279pi414331d52";
export const TCB_ENV_FILE = "~/.config/env/tencent/tcb.env";

export function packPublicUrl(fileName) {
  return `https://${CDN_HOST}/${PACK_PREFIX}/${fileName}`;
}

export const DEFAULT_INDEX_URL = packPublicUrl("latest.json");
