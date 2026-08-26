import { surfacesFor, type HelloConfig } from "./config.ts";

/** System-prompt copy when Settings → Xiaotaozi "announce to agent" is on. */
export function workbenchGuidanceText(config: HelloConfig): string {
  if (!config.announceToAgent) return "";
  const surfaces = surfacesFor(config).filter((key) => key !== "announceToAgent");
  if (surfaces.length === 0) return "";
  const parts: string[] = ["Xiaotaozi chrome is enabled in this session."];
  if (surfaces.includes("archive")) {
    parts.push("Archived conversations can be restored or permanently deleted from Settings → Archives.");
  }
  if (surfaces.includes("board")) {
    parts.push("A task board with optional cron is available from the tools row.");
  }
  if (surfaces.includes("gitGraph")) {
    parts.push("On a blank session, a Git branch chip next to the mode pill can switch local branches and show a commit graph.");
  }
  return parts.join(" ");
}
