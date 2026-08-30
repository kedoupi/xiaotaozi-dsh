// @ts-nocheck
import { createRoot } from 'react-dom/client';

import { FollowChannelLogo } from './channel-logos.ts';
import { h, localizeText } from './i18n.ts';
import { TOOLS_ROW_ATTR } from './sidebar-entry.ts';
import {
  isSessionActionButton,
  sessionIdFromFiberNode,
  subscribeFollowIndex,
} from './session-follow-menu.ts';

export const FOLLOW_ROW_ATTR = 'data-im-follow-badge';
export const FOLLOW_HEADER_ATTR = 'data-im-follow-header';
export const FOLLOW_HOVER_ATTR = 'data-im-follow-hover';

const CHANNEL_LABEL_KEYS = Object.freeze({
  weixin: '微信',
  feishu: '飞书',
  dingtalk: '钉钉',
  wecom: '企业微信',
  qq: 'QQ',
  slack: 'Slack',
  telegram: 'Telegram',
  discord: 'Discord',
  whatsapp: 'WhatsApp',
});

const GENERIC_BOT_NAME_KEYS = Object.freeze({
  weixin: '微信机器人',
  feishu: '飞书机器人',
  wecom: '企业微信机器人',
  dingtalk: '钉钉机器人',
  qq: 'QQ机器人',
  whatsapp: 'WhatsApp机器人',
});

export function followChannelLabel(channel) {
  const key = CHANNEL_LABEL_KEYS[channel];
  return key ? localizeText(key) : (typeof channel === 'string' ? channel : '');
}

export function followBotDisplayName(item) {
  if (typeof item?.name === 'string' && item.name.trim()) return item.name.trim();
  const label = typeof item?.label === 'string' ? item.label.trim() : '';
  if (!label) return '';
  const sep = ' · ';
  const index = label.indexOf(sep);
  return index >= 0 ? label.slice(index + sep.length).trim() : label;
}

function isGenericBotName(name, channel) {
  if (!name) return true;
  const channelLabel = followChannelLabel(channel);
  if (name === channel || name === channelLabel) return true;
  const genericKey = GENERIC_BOT_NAME_KEYS[channel];
  return genericKey ? name === localizeText(genericKey) : false;
}

export function followBadgeCaption(item) {
  const name = followBotDisplayName(item);
  const detail = typeof item?.detail === 'string' ? item.detail.trim() : '';
  if (name && !isGenericBotName(name, item?.channel)) return name;
  if (detail) return detail;
  return name || followChannelLabel(item?.channel) || localizeText('IM 跟进');
}

export function followHoverBotLine(item) {
  const channel = followChannelLabel(item?.channel);
  const name = followBotDisplayName(item);
  const detail = typeof item?.detail === 'string' ? item.detail.trim() : '';
  const distinctive = name && !isGenericBotName(name, item?.channel) && name !== channel;
  if (distinctive) {
    if (detail && detail !== name && !name.includes(detail) && !detail.includes(name)) {
      return `${name} · ${detail}`;
    }
    return name;
  }
  if (detail && detail !== channel) return detail;
  if (name && name !== channel) return name;
  return '';
}

export function followHoverMeta(item) {
  return followHoverBotLine(item);
}

export function followHoverHintText(item) {
  const channel = followChannelLabel(item?.channel);
  const name = followBotDisplayName(item);
  const detail = typeof item?.detail === 'string' ? item.detail.trim() : '';
  const parts = [];
  const push = (value) => {
    if (value && !parts.includes(value)) parts.push(value);
  };
  push(channel);
  if (name && !isGenericBotName(name, item?.channel)) push(name);
  push(detail);
  if (parts.length === 0 || (parts.length === 1 && parts[0] === channel && name)) push(name);
  return parts.join(' · ') || localizeText('IM 跟进');
}

export function followBadgeLabel(item) {
  return followHoverHintText(item);
}

function classNameOf(node) {
  const value = node?.className;
  if (typeof value === 'string') return value;
  if (value && typeof value.baseVal === 'string') return value.baseVal;
  return typeof node?.getAttribute === 'function' ? (node.getAttribute('class') || '') : '';
}

export function titleNodeFromRow(row) {
  if (!row) return null;
  const children = [...(row.children ?? [])];
  for (const child of children) {
    const cls = classNameOf(child);
    if (cls.includes('hover')) continue;
    if (cls.includes('title')) return child;
  }
  if (typeof row.querySelector === 'function') {
    const found = [...row.querySelectorAll('[class*="title"]')]
      .find((node) => !classNameOf(node).includes('hover'));
    if (found && found.parentElement === row) return found;
  }
  return null;
}

export function sessionRowFromActionButton(button) {
  if (!button) return null;
  if (typeof button.closest === 'function') {
    const listed = button.closest('li, [role="treeitem"], [role="option"], [role="listitem"]');
    if (listed && typeof listed.closest === 'function' && !listed.closest(`[${TOOLS_ROW_ATTR}]`)) {
      return listed;
    }
  }
  let node = button.parentElement;
  for (let depth = 0; depth < 8 && node; depth += 1) {
    if (node.getAttribute?.(TOOLS_ROW_ATTR) != null) return null;
    const actions = [...(node.querySelectorAll?.('button[aria-label]') ?? [])]
      .filter(isSessionActionButton);
    if (actions.length === 1 && actions[0] === button && node !== button) return node;
    node = node.parentElement;
  }
  return button.parentElement;
}

/**
 * Official `.rowActions` (the ⋯) is `display:none` until hover, and the
 * relative-time label hides on hover. Pin the logo immediately before the
 * title so it stays put: logo · 获取最新远程分支代码.
 */
export function followBadgePlacement(button) {
  const row = sessionRowFromActionButton(button);
  if (!row || !button) {
    return { parent: button?.parentElement ?? null, before: button ?? null };
  }
  return followBadgePlacementForRow(row, button);
}

export function followBadgePlacementForRow(row, button) {
  if (!row) {
    return { parent: button?.parentElement ?? null, before: button ?? null };
  }
  const title = titleNodeFromRow(row);
  if (title && title.parentElement === row) {
    return { parent: row, before: title };
  }
  if (!button) return { parent: row, before: null };
  let cluster = button;
  while (cluster.parentElement && cluster.parentElement !== row) {
    cluster = cluster.parentElement;
  }
  if (cluster.parentElement !== row) return { parent: row, before: null };
  return { parent: row, before: cluster };
}

function sessionActionButtons(doc) {
  return [...doc.querySelectorAll('button[aria-label]')].filter((button) => (
    isSessionActionButton(button)
    && typeof button.closest === 'function'
    && !button.closest(`[${TOOLS_ROW_ATTR}]`)
    && !button.closest(`[${FOLLOW_ROW_ATTR}]`)
    && !button.closest(`[${FOLLOW_HEADER_ATTR}]`)
  ));
}

function sessionRows(doc) {
  const rows = new Set();
  for (const el of doc.querySelectorAll('[role="treeitem"]')) {
    if (typeof el.closest === 'function' && el.closest(`[${TOOLS_ROW_ATTR}]`)) continue;
    rows.add(el);
  }
  for (const button of sessionActionButtons(doc)) {
    const row = sessionRowFromActionButton(button);
    if (row) rows.add(row);
  }
  return [...rows];
}

function overflowButtonOnRow(row) {
  return [...(row.querySelectorAll?.('button[aria-label]') ?? [])].find(isSessionActionButton) ?? null;
}

export function selectedSessionRow(doc) {
  const selected = doc.querySelector?.(
    '[role="treeitem"][aria-selected="true"], [role="treeitem"][aria-current="true"], [role="treeitem"][aria-current="page"]',
  );
  if (selected && typeof selected.closest === 'function' && !selected.closest(`[${TOOLS_ROW_ATTR}]`)) {
    return selected;
  }
  const button = sessionActionButtons(doc).find((item) => {
    const row = sessionRowFromActionButton(item);
    if (!row) return false;
    if (row.getAttribute?.('aria-current') === 'true' || row.getAttribute?.('aria-current') === 'page') {
      return true;
    }
    if (row.getAttribute?.('aria-selected') === 'true' || row.getAttribute?.('data-selected') === 'true') {
      return true;
    }
    return Boolean(row.closest?.('[aria-current="true"], [aria-current="page"], [aria-selected="true"]'));
  });
  return button ? sessionRowFromActionButton(button) : null;
}

export function selectedSessionId(doc) {
  const row = selectedSessionRow(doc);
  if (!row) return null;
  return sessionIdFromFiberNode(row)
    ?? sessionIdFromFiberNode(overflowButtonOnRow(row));
}

function sessionIdForRow(row) {
  return sessionIdFromFiberNode(row) ?? sessionIdFromFiberNode(overflowButtonOnRow(row));
}

function paintBadge(host, item, onOpen) {
  const label = followBadgeLabel(item);
  host.setAttribute('aria-label', label);
  if (/\bdim-followHeader\b/.test(host.className)) host.title = label;
  else host.removeAttribute('title');
  if (item.botId) host.setAttribute('data-im-follow-bot', item.botId);
  else host.removeAttribute('data-im-follow-bot');
  host.onclick = onOpen
    ? (event) => {
      event.preventDefault();
      event.stopPropagation();
      onOpen(item.sessionId);
    }
    : null;
  if (!host._imFollowRoot) host._imFollowRoot = createRoot(host);
  host._imFollowRoot.render(h(FollowChannelLogo, { channel: item.channel }));
}

function removeBadgeHost(host) {
  if (!host) return;
  host._imFollowRoot?.unmount();
  host._imFollowRoot = null;
  host.remove();
}

function badgeHostsOn(parent, attr) {
  if (!parent?.querySelectorAll) return [];
  return [...parent.querySelectorAll(`:scope > [${attr}]`)];
}

function ensureBadge(parent, attr, before, item, onOpen, className) {
  if (!parent) return;
  const hosts = badgeHostsOn(parent, attr);
  if (!item) {
    for (const host of hosts) removeBadgeHost(host);
    return;
  }
  let host = hosts[0];
  for (const extra of hosts.slice(1)) removeBadgeHost(extra);
  if (!host) {
    host = parent.ownerDocument.createElement('button');
    host.type = 'button';
    host.setAttribute(attr, item.channel);
    host.className = className || 'dim-followBadge';
  }
  if (before && before.parentElement === parent) {
    if (host.nextElementSibling !== before || host.parentElement !== parent) {
      parent.insertBefore(host, before);
    }
  } else if (host.parentElement !== parent || host.nextElementSibling) {
    parent.append(host);
  }
  host.className = className || 'dim-followBadge';
  host.setAttribute(attr, item.channel);
  paintBadge(host, item, onOpen);
}

function headerActionsHost(doc) {
  return doc.querySelector('[data-slot="conversation.session.header.actions"]')
    ?? doc.querySelector('[data-slot="conversation.session.header"]')
    ?? null;
}

export function isSessionHoverCard(el) {
  return classNameOf(el).includes('hoverContent');
}

function hoverCards(doc) {
  return [...doc.querySelectorAll('div')].filter(isSessionHoverCard);
}

function rowTitleText(row) {
  const title = titleNodeFromRow(row);
  const text = title?.textContent ?? '';
  return String(text).replace(/\s+/gu, ' ').trim();
}

function itemForHoverCard(card, itemsBySession, doc) {
  const title = String(card.querySelector?.('[class*="hoverTitle"]')?.textContent || '')
    .replace(/\s+/gu, ' ')
    .trim();
  const hovered = doc.querySelector?.('[role="treeitem"]:hover, [role="listitem"]:hover, li:hover');
  if (hovered) {
    const id = sessionIdForRow(hovered);
    if (id && itemsBySession.has(id)) return itemsBySession.get(id);
  }
  if (!title) return null;
  for (const row of sessionRows(doc)) {
    if (rowTitleText(row) !== title) continue;
    const id = sessionIdForRow(row);
    if (id && itemsBySession.has(id)) return itemsBySession.get(id);
  }
  return null;
}

function paintHoverHint(host, item) {
  const label = followHoverHintText(item);
  const channel = followChannelLabel(item?.channel);
  const bot = followHoverBotLine(item);
  host.setAttribute('aria-label', label);
  if (item.botId) host.setAttribute('data-im-follow-bot', item.botId);
  else host.removeAttribute('data-im-follow-bot');
  if (!host._imFollowRoot) host._imFollowRoot = createRoot(host);
  host._imFollowRoot.render(h('span', { className: 'dim-followHoverInner' },
    h(FollowChannelLogo, { channel: item.channel }),
    h('span', { className: 'dim-followHoverCopy' },
      h('strong', null, channel || localizeText('IM 跟进')),
      bot && bot !== channel ? h('small', null, bot) : null,
    ),
  ));
}

function ensureHoverHint(card, item) {
  let host = card.querySelector?.(`[${FOLLOW_HOVER_ATTR}]`);
  if (!item) {
    host?._imFollowRoot?.unmount();
    host?.remove();
    return;
  }
  if (!host) {
    host = card.ownerDocument.createElement('div');
    host.setAttribute(FOLLOW_HOVER_ATTR, item.channel);
    host.className = 'dim-followHover';
    card.append(host);
  }
  host.setAttribute(FOLLOW_HOVER_ATTR, item.channel);
  paintHoverHint(host, item);
}

export function installSessionFollowBadges({ rpcCall, onOpen }) {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => {};
  }
  let itemsBySession = new Map();
  let timer = 0;
  let inflight = false;
  let pending = false;
  let generation = 0;
  let stopped = false;
  const watchAbort = typeof AbortController === 'function' ? new AbortController() : null;

  const applyItems = (raw, nextGeneration) => {
    const items = Array.isArray(raw) ? raw : [];
    itemsBySession = new Map(
      items
        .filter((item) => item && typeof item.sessionId === 'string' && item.channel)
        .map((item) => [item.sessionId, item]),
    );
    if (Number.isInteger(nextGeneration)) generation = nextGeneration;
    paint();
  };

  const load = async () => {
    if (stopped || typeof rpcCall !== 'function') return;
    if (inflight) {
      pending = true;
      return;
    }
    inflight = true;
    try {
      const result = await rpcCall('session.follow.index', {});
      if (stopped) return;
      const items = result?.ok === false ? [] : (result?.value?.items ?? result?.items ?? []);
      applyItems(items, result?.value?.generation ?? result?.generation);
    } catch {
      // A missing index must not hide the rest of the IM client.
    } finally {
      inflight = false;
      if (pending && !stopped) {
        pending = false;
        void load();
      }
    }
  };

  const watch = async () => {
    if (typeof rpcCall !== 'function') return;
    while (!stopped) {
      try {
        const result = await rpcCall(
          'session.follow.watch',
          { generation },
          watchAbort?.signal,
        );
        if (stopped) return;
        if (result?.ok === false) {
          await new Promise((resolve) => setTimeout(resolve, 1_500));
          void load();
          continue;
        }
        const value = result?.value ?? result;
        applyItems(value?.items ?? [], value?.generation);
      } catch {
        if (stopped) return;
        await new Promise((resolve) => setTimeout(resolve, 1_500));
        void load();
      }
    }
  };

  const paint = () => {
    const seen = new Set();
    for (const row of sessionRows(document)) {
      const overflow = overflowButtonOnRow(row);
      const sessionId = sessionIdForRow(row);
      const { parent, before } = followBadgePlacementForRow(row, overflow);
      if (!parent || !sessionId) continue;
      seen.add(parent);
      ensureBadge(parent, FOLLOW_ROW_ATTR, before, itemsBySession.get(sessionId) ?? null, onOpen);
    }
    for (const stale of document.querySelectorAll(`[${FOLLOW_ROW_ATTR}]`)) {
      if (!seen.has(stale.parentElement)) {
        stale._imFollowRoot?.unmount();
        stale.remove();
      }
    }

    const slot = headerActionsHost(document);
    if (slot) {
      const currentId = selectedSessionId(document);
      const item = currentId ? itemsBySession.get(currentId) : null;
      if (slot.querySelector('.dim-follow') && item) {
        const extra = slot.querySelector(`[${FOLLOW_HEADER_ATTR}]`);
        extra?._imFollowRoot?.unmount();
        extra?.remove();
      } else {
        ensureBadge(
          slot,
          FOLLOW_HEADER_ATTR,
          null,
          item ?? null,
          onOpen,
          'dim-followBadge dim-followHeader',
        );
      }
    }

    const liveCards = new Set();
    for (const card of hoverCards(document)) {
      liveCards.add(card);
      ensureHoverHint(card, itemForHoverCard(card, itemsBySession, document));
    }
    for (const stale of document.querySelectorAll(`[${FOLLOW_HOVER_ATTR}]`)) {
      if (!liveCards.has(stale.parentElement)) {
        stale._imFollowRoot?.unmount();
        stale.remove();
      }
    }
  };

  const observer = new MutationObserver(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      paint();
      void load();
    }, 80);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  const unsubscribe = subscribeFollowIndex(() => {
    void load();
  });
  void load();
  void watch();
  return () => {
    stopped = true;
    watchAbort?.abort();
    observer.disconnect();
    unsubscribe();
    window.clearTimeout(timer);
    for (const host of document.querySelectorAll(`[${FOLLOW_ROW_ATTR}], [${FOLLOW_HEADER_ATTR}], [${FOLLOW_HOVER_ATTR}]`)) {
      host._imFollowRoot?.unmount();
      host.remove();
    }
  };
}
