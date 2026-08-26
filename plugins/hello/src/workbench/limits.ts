/** One explorer level. Extra rows set `truncated`. */
export const MAX_TREE_ENTRIES = 500;

/** Text open/save ceiling. Larger files stay binary-preview-only. */
export const MAX_TEXT_BYTES = 1024 * 1024;

/** JSON write body = text plus envelope. */
export const MAX_WRITE_JSON_BYTES = MAX_TEXT_BYTES + 32 * 1024;

export const GIT_TIMEOUT_MS = 15_000;
export const GIT_STATUS_LIMIT = 400;
export const GIT_LOG_LIMIT = 30;
export const GIT_GRAPH_LIMIT = 80;
export const MAX_GIT_OUTPUT_BYTES = 1024 * 1024;

export const TERM_OUTPUT_BYTES = 256 * 1024;
export const TERM_WRITE_BYTES = 8 * 1024;
export const TERM_IDLE_MS = 30 * 60 * 1000;
