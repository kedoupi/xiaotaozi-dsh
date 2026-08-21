/** Loader entry id in cordis.patch.yml. */
export const PLUGIN_NAME = "memory";

/** JSON overlay under $DSH_HOME/plugins/memory/settings.json. */
export const MEMORY_SETTINGS_FILE = "settings.json";

/** Loopback HTTP route the settings panel uses. */
export const NOEMA_STATUS_ROUTE = "/_dsh/dsh-memory/status";

export const NOEMA_TOOL_NAMES = [
  "noema_recall",
  "noema_search",
  "noema_browse",
  "noema_catalog",
  "noema_recall_graph",
  "noema_neighbors",
  "noema_explain",
  "noema_remember",
  "noema_review_list",
  "noema_review_decide",
  "noema_forget",
  "noema_policy_get",
  "noema_policy_set",
  "noema_status",
  "noema_import",
] as const;

export const NOEMA_GUIDANCE_SECTION_NAME = "memory-guidance";
export const NOEMA_GUIDANCE_SECTION_ORDER = 120;
