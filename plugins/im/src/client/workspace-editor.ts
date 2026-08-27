// @ts-nocheck
import * as React from 'react';

import { h } from './i18n.ts';
import { WorkspaceDirectoryPicker } from './workspace-directory-picker.ts';

export const WorkspaceDirectoryPickerContext = React.createContext(null);
export const WorkspaceBindPromptContext = React.createContext({
  promptBotId: null,
  consume() {},
});

export function addedBotId(previousBots, nextBots) {
  const known = new Set((previousBots ?? []).map((bot) => bot?.botId).filter(Boolean));
  return (nextBots ?? []).find((bot) => bot?.botId && !known.has(bot.botId))?.botId ?? null;
}

export function useWorkspaceBindPrompt() {
  const [promptBotId, setPromptBotId] = React.useState(null);
  const promptAfterBind = React.useCallback((botId, alreadyConnected = false) => {
    if (botId && !alreadyConnected) setPromptBotId(botId);
  }, []);
  const consumeWorkspacePrompt = React.useCallback(() => {
    setPromptBotId(null);
  }, []);
  return { workspacePromptBotId: promptBotId, promptAfterBind, consumeWorkspacePrompt };
}

export function WorkspaceBindPromptProvider({ promptBotId, consume, children }) {
  const value = React.useMemo(() => ({ promptBotId, consume }), [promptBotId, consume]);
  return h(WorkspaceBindPromptContext.Provider, { value }, children);
}

export function WorkspaceEditor({ botId, workspace, directoryPicker, disabled = false, onSave }) {
  const sharedDirectoryPicker = React.useContext(WorkspaceDirectoryPickerContext);
  const bindPrompt = React.useContext(WorkspaceBindPromptContext);
  const activeDirectoryPicker = directoryPicker ?? sharedDirectoryPicker;
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [fromBind, setFromBind] = React.useState(false);
  const editButtonRef = React.useRef(null);
  const savingRef = React.useRef(false);
  const fromBindRef = React.useRef(false);
  const shouldPrompt = Boolean(botId && bindPrompt.promptBotId === botId);

  React.useEffect(() => {
    if (!shouldPrompt || disabled || !activeDirectoryPicker) return;
    setOpen(true);
    setError(null);
    setFromBind(true);
    fromBindRef.current = true;
    bindPrompt.consume?.();
  }, [shouldPrompt, disabled, activeDirectoryPicker, bindPrompt]);

  const finish = React.useCallback((confirmBind) => {
    const shouldConfirm = fromBindRef.current && confirmBind;
    fromBindRef.current = false;
    setFromBind(false);
    setOpen(false);
    setError(null);
    queueMicrotask(() => editButtonRef.current?.focus?.());
    if (shouldConfirm && workspace) void onSave?.(workspace);
  }, [onSave, workspace]);

  const pick = React.useCallback(async (value) => {
    if (!value || savingRef.current || disabled) return;
    if (value === workspace && !fromBindRef.current) {
      finish(false);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSave?.(value);
      finish(false);
    } catch (cause) {
      setError(cause?.message ?? '工作区修改失败，请重试。');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [disabled, finish, onSave, workspace]);

  return h('div', { className: 'dim-workspace' },
    h('div', { className: 'dim-workspaceHeader' },
      h('span', null, '当前工作区'),
      h('button', {
        type: 'button',
        ref: editButtonRef,
        className: 'dim-workspaceEdit',
        onClick: () => { setOpen(true); setError(null); },
        disabled: disabled || !activeDirectoryPicker,
      }, '选择目录')),
    workspace && !fromBind
      ? React.createElement('code', {
          className: 'dim-workspacePath',
          title: workspace,
        }, workspace)
      : h('code', { className: 'dim-workspacePath' }, '未设置'),
    open ? h(WorkspaceDirectoryPicker, {
      open,
      startPath: fromBind ? undefined : workspace,
      picker: activeDirectoryPicker,
      busy: saving || disabled,
      saveError: error,
      onPicked: pick,
      onCancel: () => finish(true),
    }) : null,
  );
}
