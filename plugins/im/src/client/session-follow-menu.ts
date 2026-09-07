type FollowIndexListener = () => void;
type FollowPick = (sessionId: string) => void;

type SessionProps = {
  node?: { sessionId?: unknown; id?: unknown };
  sessionId?: unknown;
  session?: { id?: unknown };
  id?: unknown;
};

type FiberNode = {
  memoizedProps?: unknown;
  pendingProps?: unknown;
  return?: FiberNode | null;
};

type MenuItemEl = HTMLElement & { type?: string };

const followIndexListeners = new Set<FollowIndexListener>();
let followIndexGeneration = 0;

export function subscribeFollowIndex(listener: FollowIndexListener) {
  followIndexListeners.add(listener);
  return () => followIndexListeners.delete(listener);
}

export function getFollowIndexGeneration() {
  return followIndexGeneration;
}

export function notifyFollowIndex() {
  followIndexGeneration += 1;
  for (const listener of followIndexListeners) listener();
}

export function isSessionActionsMenuLabels(labels: unknown) {
  const text = (Array.isArray(labels) ? labels : []).join('\n');
  if (text.includes('归档会话') && text.includes('分叉会话')) return true;
  if (/Archive/i.test(text) && /Fork session|Fork/i.test(text)) return true;
  return false;
}

export function collectMenuLabels(menu: unknown) {
  if (!menu || typeof (menu as { querySelectorAll?: unknown }).querySelectorAll !== 'function') return [];
  return Array.from((menu as Element).querySelectorAll('button, [role="menuitem"]'))
    .filter((el) => !('dataset' in el && (el as HTMLElement).dataset?.imFollowItem))
    .map((el) => String(el.textContent || '').replace(/\s+/gu, ' ').trim())
    .filter(Boolean);
}

function sessionIdFromProps(props: unknown) {
  if (!props || typeof props !== 'object') return null;
  const { node, sessionId, session, id } = props as SessionProps;
  if (typeof node?.sessionId === 'string' && node.sessionId) return node.sessionId;
  if (typeof sessionId === 'string' && sessionId) return sessionId;
  if (typeof session?.id === 'string' && session.id) return session.id;
  if (typeof node?.id === 'string' && node.id.startsWith('session-')) return node.id;
  if (typeof id === 'string' && id.startsWith('session-')) return id;
  return null;
}

function fiberOf(el: unknown) {
  if (!el || typeof el !== 'object') return null;
  const record = el as Record<string, FiberNode | undefined>;
  const key = Object.keys(record).find((name) =>
    name.startsWith('__reactFiber') || name.startsWith('__reactInternalInstance'));
  return key ? record[key] ?? null : null;
}

export function sessionIdFromFiberNode(el: unknown) {
  let fiber = fiberOf(el);
  for (let depth = 0; fiber && depth < 48; depth += 1) {
    const id = sessionIdFromProps(fiber.memoizedProps) || sessionIdFromProps(fiber.pendingProps);
    if (id) return id;
    fiber = fiber.return ?? null;
  }
  return null;
}

export function sessionIdFromActionButton(button: unknown) {
  const closest = button && typeof button === 'object'
    ? (button as { closest?: (selector: string) => unknown }).closest?.('[role="treeitem"]')
    : undefined;
  return sessionIdFromFiberNode(closest) ?? sessionIdFromFiberNode(button);
}

export function isSessionActionButton(button: unknown) {
  const getAttribute = button && typeof button === 'object'
    ? (button as { getAttribute?: (name: string) => string | null }).getAttribute
    : undefined;
  const label = typeof getAttribute === 'function' ? getAttribute.call(button, 'aria-label') || '' : '';
  return /会话.+的操作/.test(label) || /Session actions for /.test(label);
}

export function nearestSessionActionButton(menu: unknown) {
  if (!menu || typeof (menu as { getBoundingClientRect?: unknown }).getBoundingClientRect !== 'function'
    || typeof document === 'undefined') return null;
  const rect = (menu as Element).getBoundingClientRect();
  const buttons = Array.from(document.querySelectorAll('button[aria-label]')).filter(isSessionActionButton);
  let best: Element | null = null;
  let bestDist = Infinity;
  for (const button of buttons) {
    const box = button.getBoundingClientRect();
    const dx = box.left - rect.left;
    const dy = box.bottom - rect.top;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = button;
    }
  }
  return best;
}

const FOLLOW_MENU_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.2 4.25h9.6c.72 0 1.3.58 1.3 1.3v5c0 .72-.58 1.3-1.3 1.3H8.4L5.5 14.2v-2.35H3.2c-.72 0-1.3-.58-1.3-1.3v-5c0-.72.58-1.3 1.3-1.3Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M5 7.15h6M5 9.35h3.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;

function appendFollowItem(menu: Element, sessionId: string, onPick: FollowPick) {
  if (menu.querySelector('[data-im-follow-item]')) return;
  const sample = menu.querySelector('[role="menuitem"]');
  const item = (sample ? sample.cloneNode(true) : document.createElement('button')) as MenuItemEl;
  item.type = 'button';
  item.setAttribute('role', 'menuitem');
  item.dataset.imFollowItem = '1';
  item.removeAttribute('aria-checked');
  item.removeAttribute('aria-selected');
  if (sample?.className) item.className = sample.className;
  const spans = Array.from(item.querySelectorAll('span'));
  const icon = spans[0];
  const label = spans[1] ?? spans[spans.length - 1];
  if (icon) icon.innerHTML = FOLLOW_MENU_ICON;
  if (label && label !== icon) label.textContent = '在 IM 中继续此会话';
  else if (!label) {
    const text = document.createElement('span');
    text.textContent = '在 IM 中继续此会话';
    item.append(text);
  }
  for (const child of Array.from(item.children)) {
    if (child.tagName === 'svg') child.remove();
  }
  item.addEventListener('mousedown', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  item.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onPick(sessionId);
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  menu.append(item);
}

export function installSessionMenuFollow(onPick: FollowPick) {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => {};
  }
  const scan = () => {
    for (const menu of Array.from(document.querySelectorAll('[role="menu"]'))) {
      if (!isSessionActionsMenuLabels(collectMenuLabels(menu))) continue;
      const button = nearestSessionActionButton(menu);
      const sessionId = sessionIdFromActionButton(button);
      if (!sessionId) continue;
      appendFollowItem(menu, sessionId, onPick);
    }
  };
  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });
  scan();
  return () => observer.disconnect();
}
