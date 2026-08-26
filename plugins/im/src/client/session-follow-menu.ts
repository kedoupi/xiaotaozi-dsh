// @ts-nocheck

const followIndexListeners = new Set();
let followIndexGeneration = 0;

export function subscribeFollowIndex(listener) {
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

export function isSessionActionsMenuLabels(labels) {
  const text = (Array.isArray(labels) ? labels : []).join('\n');
  if (text.includes('归档会话') && text.includes('分叉会话')) return true;
  if (/Archive/i.test(text) && /Fork session|Fork/i.test(text)) return true;
  return false;
}

export function collectMenuLabels(menu) {
  if (!menu || typeof menu.querySelectorAll !== 'function') return [];
  return [...menu.querySelectorAll('button, [role="menuitem"]')]
    .filter((el) => !el.dataset?.imFollowItem)
    .map((el) => String(el.textContent || '').replace(/\s+/gu, ' ').trim())
    .filter(Boolean);
}

function sessionIdFromProps(props) {
  if (!props || typeof props !== 'object') return null;
  if (typeof props.node?.id === 'string' && props.node.id) return props.node.id;
  if (typeof props.sessionId === 'string' && props.sessionId) return props.sessionId;
  return null;
}

export function sessionIdFromFiberNode(el) {
  if (!el) return null;
  const key = Object.keys(el).find((name) =>
    name.startsWith('__reactFiber') || name.startsWith('__reactInternalInstance'));
  let fiber = key ? el[key] : null;
  for (let depth = 0; fiber && depth < 32; depth += 1) {
    const id = sessionIdFromProps(fiber.memoizedProps) || sessionIdFromProps(fiber.pendingProps);
    if (id) return id;
    fiber = fiber.return;
  }
  return null;
}

export function isSessionActionButton(button) {
  const label = button?.getAttribute?.('aria-label') || '';
  return /会话.+的操作/.test(label) || /Session actions for /.test(label);
}

export function nearestSessionActionButton(menu) {
  if (!menu || typeof menu.getBoundingClientRect !== 'function'
    || typeof document === 'undefined') return null;
  const rect = menu.getBoundingClientRect();
  const buttons = [...document.querySelectorAll('button[aria-label]')].filter(isSessionActionButton);
  let best = null;
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

function appendFollowItem(menu, sessionId, onPick) {
  if (menu.querySelector('[data-im-follow-item]')) return;
  const sample = menu.querySelector('[role="menuitem"]');
  const item = sample ? sample.cloneNode(true) : document.createElement('button');
  item.type = 'button';
  item.setAttribute('role', 'menuitem');
  item.dataset.imFollowItem = '1';
  item.removeAttribute('aria-checked');
  item.removeAttribute('aria-selected');
  if (sample?.className) item.className = sample.className;
  const spans = [...item.querySelectorAll('span')];
  const icon = spans[0];
  const label = spans[1] ?? spans[spans.length - 1];
  if (icon) icon.innerHTML = FOLLOW_MENU_ICON;
  if (label && label !== icon) label.textContent = 'IM 跟进';
  else if (!label) {
    const text = document.createElement('span');
    text.textContent = 'IM 跟进';
    item.append(text);
  }
  for (const child of [...item.children]) {
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

export function installSessionMenuFollow(onPick) {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => {};
  }
  const scan = () => {
    for (const menu of document.querySelectorAll('[role="menu"]')) {
      if (!isSessionActionsMenuLabels(collectMenuLabels(menu))) continue;
      const button = nearestSessionActionButton(menu);
      const sessionId = sessionIdFromFiberNode(button);
      if (!sessionId) continue;
      appendFollowItem(menu, sessionId, onPick);
    }
  };
  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });
  scan();
  return () => observer.disconnect();
}
