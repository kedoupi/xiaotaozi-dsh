// @ts-nocheck
import * as React from 'react';

import { h } from './i18n.ts';
import { WorkspaceProjectPicker } from './workspace-project-picker.ts';

export const WorkspaceProjectsContext = React.createContext(null);
export const WorkspaceBindPromptContext = React.createContext({
  promptBotId: null,
  consume() {},
});

export function useWorkspaceBindPrompt(bots = []) {
  const pendingBotId = (bots ?? []).find(
    (bot) => bot?.botId && bot.workspacePending === true,
  )?.botId ?? null;
  const [consumedBotId, setConsumedBotId] = React.useState(null);

  React.useEffect(() => {
    if (!pendingBotId || (consumedBotId && consumedBotId !== pendingBotId)) {
      setConsumedBotId(null);
    }
  }, [consumedBotId, pendingBotId]);

  const consumeWorkspacePrompt = React.useCallback(() => {
    setConsumedBotId(pendingBotId);
  }, [pendingBotId]);

  return {
    workspacePromptBotId: pendingBotId && pendingBotId !== consumedBotId
      ? pendingBotId
      : null,
    consumeWorkspacePrompt,
  };
}

export function WorkspaceBindPromptProvider({ promptBotId, consume, children }) {
  const value = React.useMemo(() => ({ promptBotId, consume }), [promptBotId, consume]);
  return h(WorkspaceBindPromptContext.Provider, { value }, children);
}

export function WorkspaceEditor({
  botId,
  workspaceId,
  workspaceTitle,
  workspacePending = false,
  disabled = false,
  onSave,
}) {
  const projects = React.useContext(WorkspaceProjectsContext);
  const bindPrompt = React.useContext(WorkspaceBindPromptContext);
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [feedback, setFeedback] = React.useState(null);
  const editButtonRef = React.useRef(null);
  const savingRef = React.useRef(false);
  const dismissedPromptRef = React.useRef(null);
  const shouldPrompt = Boolean(botId && bindPrompt.promptBotId === botId);

  React.useEffect(() => {
    if (!shouldPrompt) dismissedPromptRef.current = null;
  }, [shouldPrompt]);

  React.useEffect(() => {
    if (!shouldPrompt || disabled || !projects || dismissedPromptRef.current === botId) return;
    setOpen(true);
    setError(null);
    bindPrompt.consume?.();
  }, [botId, bindPrompt, disabled, projects, shouldPrompt]);

  const finish = React.useCallback(() => {
    setOpen(false);
    setError(null);
    queueMicrotask(() => editButtonRef.current?.focus?.());
  }, []);

  const pick = React.useCallback(async (selectedWorkspaceId) => {
    if (!selectedWorkspaceId || savingRef.current || disabled) return;
    if (selectedWorkspaceId === workspaceId && !workspacePending) {
      finish();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const selected = projects?.list?.getSnapshot?.()?.items?.find(
        (item) => item.workspaceId === selectedWorkspaceId,
      );
      await onSave?.(selectedWorkspaceId);
      if (selected?.title) setFeedback(`已切换到项目「${selected.title}」。`);
      finish();
    } catch (cause) {
      setError(cause?.message ?? '项目修改失败，请重试。');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [disabled, finish, onSave, projects, workspaceId, workspacePending]);

  const cancel = React.useCallback(() => {
    if (shouldPrompt) dismissedPromptRef.current = botId;
    finish();
  }, [botId, finish, shouldPrompt]);

  const displayTitle = workspacePending || !workspaceId || !workspaceTitle
    ? '未选择项目'
    : workspaceTitle;

  return h('div', {
    className: 'dim-workspace',
    'data-workspace-editor-bot-id': botId,
  },
  h('div', { className: 'dim-workspaceHeader' },
    h('span', null, '当前项目'),
    h('button', {
      type: 'button',
      ref: editButtonRef,
      className: 'dim-workspaceEdit',
      onClick: () => {
        setOpen(true);
        setError(null);
        setFeedback(null);
      },
      disabled: disabled || !projects,
    }, '选择项目')),
  workspacePending || !workspaceId || !workspaceTitle
    ? h('span', { className: 'dim-workspacePath' }, '未选择项目')
    : React.createElement('span', {
        className: 'dim-workspacePath',
        title: workspaceTitle,
      }, displayTitle),
  feedback ? h('p', { className: 'dim-workspaceFeedback', role: 'status' }, feedback) : null,
  open ? h(WorkspaceProjectPicker, {
    open,
    projects,
    workspaceId,
    busy: saving || disabled,
    saveError: error,
    onPicked: pick,
    onCancel: cancel,
  }) : null);
}
