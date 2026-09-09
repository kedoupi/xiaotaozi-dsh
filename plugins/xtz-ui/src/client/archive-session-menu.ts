type MenuItemEl = HTMLElement & { type?: string };

const ARCHIVE_ITEM_ATTR = "data-dsh-xtz-ui-archive-item";

const ARCHIVE_MENU_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2.5" y="5.5" width="11" height="8" rx="1.2" stroke="currentColor" stroke-width="1.3"/><path d="M2.5 6.5h11M6 9.5h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M5.5 5.5 6.4 3.5h3.2l.9 2" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>`;

export function isSessionActionsMenuLabels(labels: unknown): boolean {
  const text = (Array.isArray(labels) ? labels : []).join("\n");
  if (text.includes("归档会话") && text.includes("分叉会话")) return true;
  if (/Archive/i.test(text) && /Fork session|Fork/i.test(text)) return true;
  return false;
}

export function collectMenuLabels(menu: unknown): string[] {
  if (!menu || typeof (menu as { querySelectorAll?: unknown }).querySelectorAll !== "function") {
    return [];
  }
  return Array.from((menu as Element).querySelectorAll("button, [role='menuitem']"))
    .filter((el) => {
      const has = (el as HTMLElement).hasAttribute;
      return !(typeof has === "function" && has.call(el, ARCHIVE_ITEM_ATTR));
    })
    .map((el) => String(el.textContent || "").replace(/\s+/gu, " ").trim())
    .filter(Boolean);
}

export function archiveMenuItemLabel(labels: readonly string[]): string {
  return labels.some((label) => label.includes("归档会话"))
    ? "查看已归档会话"
    : "View archived chats";
}

function appendArchiveItem(menu: Element, label: string, onOpen: () => void): void {
  if (menu.querySelector(`[${ARCHIVE_ITEM_ATTR}]`)) return;
  const sample = menu.querySelector("[role='menuitem']");
  const item = (sample ? sample.cloneNode(true) : document.createElement("button")) as MenuItemEl;
  item.type = "button";
  item.setAttribute("role", "menuitem");
  item.setAttribute(ARCHIVE_ITEM_ATTR, "1");
  item.removeAttribute("aria-checked");
  item.removeAttribute("aria-selected");
  if (sample?.className) item.className = sample.className;
  const spans = Array.from(item.querySelectorAll("span"));
  const icon = spans[0];
  const text = spans[1] ?? spans[spans.length - 1];
  if (icon) icon.innerHTML = ARCHIVE_MENU_ICON;
  if (text && text !== icon) text.textContent = label;
  else if (!text) {
    const copy = document.createElement("span");
    copy.textContent = label;
    item.append(copy);
  }
  for (const child of Array.from(item.children)) {
    if (child.tagName === "svg") child.remove();
  }
  item.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  item.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onOpen();
    menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  menu.append(item);
}

export function installArchiveSessionMenu(options: {
  isArchiveOn: () => boolean;
  onOpen: () => void;
  doc?: Document;
}): () => void {
  const doc = options.doc ?? (typeof document === "undefined" ? undefined : document);
  if (doc === undefined || typeof MutationObserver === "undefined") return () => {};
  const scan = (): void => {
    for (const menu of Array.from(doc.querySelectorAll("[role='menu']"))) {
      const labels = collectMenuLabels(menu);
      if (!isSessionActionsMenuLabels(labels)) continue;
      const existing = menu.querySelector(`[${ARCHIVE_ITEM_ATTR}]`);
      if (!options.isArchiveOn()) {
        existing?.remove();
        continue;
      }
      if (existing) continue;
      appendArchiveItem(menu, archiveMenuItemLabel(labels), options.onOpen);
    }
  };
  const observer = new MutationObserver(scan);
  observer.observe(doc.body, { childList: true, subtree: true });
  scan();
  return () => observer.disconnect();
}
