import { surfacesFor, type XtzUiConfig } from "./config.ts";

/** System-prompt copy when Settings → Xiaotaozi "announce to agent" is on. */
export function workbenchGuidanceText(config: XtzUiConfig): string {
  if (!config.announceToAgent) return "";
  const surfaces = surfacesFor(config).filter((key) => key !== "announceToAgent");
  if (surfaces.length === 0) return "";
  const parts: string[] = ["Xiaotaozi chrome is enabled in this session."];
  if (surfaces.includes("archive")) {
    parts.push("Archived conversations can be restored or permanently deleted from Plugin Center → Installed → Xiaotaozi → Manage archived chats.");
  }
  if (surfaces.includes("gitGraph")) {
    parts.push("A Git branch chip can switch local branches and show a commit graph. The right Git tab shows status and diff.");
  }
  return parts.join(" ");
}
