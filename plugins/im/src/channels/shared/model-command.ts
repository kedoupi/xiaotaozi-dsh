import { splitWorkspaceCommandMessage } from './workspace-command.ts';
import { t } from './i18n.ts';
import { WORKSPACE_SESSION_STALE } from './workspace-session.ts';
import { withSessionBindingLock } from './session-binding-lock.ts';

type CodedError = Error & {
  code?: unknown;
  expected?: unknown;
  actual?: unknown;
  source?: unknown;
  name?: unknown;
  failure?: {
    code?: unknown;
  };
};

type ReasoningEffort = {
  id: string;
  name: string;
  description?: string;
};

type ReasoningMeta = {
  efforts: ReasoningEffort[];
  defaultEffort?: string;
};

type CatalogModel = {
  id: string;
  name: string;
  description?: string;
  reasoning?: ReasoningMeta;
};

type CatalogGroup = {
  id: string;
  name: string;
  models: CatalogModel[];
};

type CatalogFailure = {
  id: string;
  name: string;
};

type ModelSelection = {
  provider: string;
  model: string;
  reasoningEffort?: string;
};

type SelectionLike = {
  provider?: unknown;
  model?: unknown;
  reasoningEffort?: unknown;
} | null | undefined;

type ModelCatalog = {
  groups: CatalogGroup[];
  failures: CatalogFailure[];
  current: ModelSelection | null;
};

type SessionCatalog = {
  groups: CatalogGroup[];
  failures: CatalogFailure[];
  current: ModelSelection;
};

type CommandResult = {
  handled: true;
  message: unknown;
  messages: string[];
};

type CommandOptions = {
  hasImages?: unknown;
  signal?: unknown;
  pendingInteraction?: unknown;
  control?: unknown;
};

type SessionState = {
  sessionFor?: (key: unknown) => unknown;
  clearSession?: (key: unknown) => unknown;
  setSession?: (key: unknown, sessionId: unknown) => unknown;
};

type ModelSession = {
  sessionExists?: (options?: unknown) => unknown;
  models?: (options?: unknown) => unknown;
  selectModel?: (selection: unknown, options?: unknown) => unknown;
  isRunning?: (options?: unknown) => unknown;
  hasActiveTurn?: (control?: unknown, options?: unknown) => unknown;
};

type ModelHarness = {
  workspaceSession?: (sessionId: string) => unknown;
  listModels?: (options?: unknown) => unknown;
  createSession?: (options?: unknown) => unknown;
};

type BoundSession = {
  sessionId: string;
  session: ModelSession;
};

type SelectModelResult = {
  selected?: SelectionLike;
};

type ReasoningRecord = {
  efforts?: unknown;
  defaultEffort?: unknown;
};

type EffortRecord = {
  id?: unknown;
  name?: unknown;
  description?: unknown;
};

type CatalogRecord = {
  groups?: unknown;
  failures?: unknown;
  current?: unknown;
};

type GroupRecord = {
  id?: unknown;
  name?: unknown;
  models?: unknown;
};

type ModelRecord = {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  reasoning?: unknown;
};

type FailureRecord = {
  id?: unknown;
  name?: unknown;
};

type CurrentRecord = {
  provider?: unknown;
  model?: unknown;
  reasoningEffort?: unknown;
};

const MODEL_COMMAND = /^\/model(?=$|\s)/i;
const MODELS_COMMAND = /^\/models(?=$|\s)/i;
const REASONING_COMMAND = /^\/reasoning(?=$|\s)/i;
const REASONINGS_COMMAND = /^\/reasonings(?=$|\s)/i;
const REASONING_LIST_COMMAND = /^\/reasoninglist(?=$|\s)/i;
const MODEL_USAGE = '用法：/model <序号或 provider/model> [推理等级ID]';
const MODELS_USAGE = '用法：/models（不带参数）';
const REASONING_USAGE = '用法：/reasoning [序号、等级ID或 --default]';
const REASONING_LIST_USAGE = '用法：/reasoninglist 或 /reasonings（不带参数）';
const SESSION_BINDING_CHANGED = 'session-binding-changed';
const MODEL_SELECTION_MISMATCH = 'model-selection-mismatch';
const UNSAFE_DISPLAY_TEXT_GLOBAL = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu;

function commandResult(message: unknown): CommandResult {
  return {
    handled: true,
    message,
    messages: splitWorkspaceCommandMessage(message as string),
  };
}

function safeDisplayText(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.replace(UNSAFE_DISPLAY_TEXT_GLOBAL, ' ').replace(/\s+/gu, ' ').trim();
}

function rpcOptions(signal: unknown) {
  return signal ? { signal } : {};
}

function normalizeReasoning(value: unknown): ReasoningMeta | undefined {
  if (value === undefined) return undefined;
  const record = value as ReasoningRecord | null;
  if (!record || typeof record !== 'object'
    || !Array.isArray(record.efforts) || record.efforts.length === 0) {
    throw new TypeError('Harness returned invalid model reasoning metadata');
  }
  const efforts = record.efforts.map((effort: unknown) => {
    const item = effort as EffortRecord | null;
    if (!item || typeof item !== 'object'
      || typeof item.id !== 'string' || !item.id
      || typeof item.name !== 'string' || !item.name
      || (item.description !== undefined && typeof item.description !== 'string')) {
      throw new TypeError('Harness returned an invalid reasoning effort');
    }
    return {
      id: item.id,
      name: item.name,
      ...(item.description === undefined ? {} : { description: item.description }),
    };
  });
  if (record.defaultEffort !== undefined
    && (typeof record.defaultEffort !== 'string' || !record.defaultEffort)) {
    throw new TypeError('Harness returned an invalid default reasoning effort');
  }
  return {
    efforts,
    ...(record.defaultEffort === undefined ? {} : { defaultEffort: record.defaultEffort }),
  };
}

function normalizeCatalog(
  value: unknown,
  { requireCurrent = false }: { requireCurrent?: boolean } = {},
): ModelCatalog {
  const record = value as CatalogRecord | null;
  if (!record || typeof record !== 'object'
    || !Array.isArray(record.groups) || !Array.isArray(record.failures)) {
    throw new TypeError('Harness returned an invalid model catalog');
  }
  const groups = record.groups.map((group: unknown) => {
    const item = group as GroupRecord | null;
    if (!item || typeof item !== 'object'
      || typeof item.id !== 'string' || !item.id
      || typeof item.name !== 'string' || !item.name
      || !Array.isArray(item.models)) {
      throw new TypeError('Harness returned an invalid model provider group');
    }
    return {
      id: item.id,
      name: item.name,
      models: item.models.map((model: unknown) => {
        const entry = model as ModelRecord | null;
        if (!entry || typeof entry !== 'object'
          || typeof entry.id !== 'string' || !entry.id
          || typeof entry.name !== 'string' || !entry.name
          || (entry.description !== undefined && typeof entry.description !== 'string')) {
          throw new TypeError('Harness returned an invalid model');
        }
        return {
          id: entry.id,
          name: entry.name,
          ...(entry.description === undefined ? {} : { description: entry.description }),
          ...(entry.reasoning === undefined
            ? {}
            : { reasoning: normalizeReasoning(entry.reasoning) }),
        };
      }),
    };
  });
  const failures = record.failures.map((failure: unknown) => {
    const item = failure as FailureRecord | null;
    if (!item || typeof item !== 'object'
      || typeof item.id !== 'string' || !item.id
      || typeof item.name !== 'string' || !item.name) {
      throw new TypeError('Harness returned an invalid model provider failure');
    }
    return { id: item.id, name: item.name };
  });
  let current: ModelSelection | null = null;
  if (record.current !== undefined) {
    const selection = record.current as CurrentRecord | null;
    if (!selection || typeof selection !== 'object'
      || typeof selection.provider !== 'string' || !selection.provider
      || typeof selection.model !== 'string' || !selection.model
      || (selection.reasoningEffort !== undefined
        && (typeof selection.reasoningEffort !== 'string'
          || !selection.reasoningEffort))) {
      throw new TypeError('Harness returned an invalid current model');
    }
    current = {
      provider: selection.provider,
      model: selection.model,
      ...(selection.reasoningEffort === undefined
        ? {}
        : { reasoningEffort: selection.reasoningEffort }),
    };
  } else if (requireCurrent) {
    throw new TypeError('Harness returned no current model');
  }
  return { groups, failures, current };
}

function modelId(provider: string, model: string) {
  return `${provider}/${model}`;
}

function sameModel(left: SelectionLike, right: SelectionLike) {
  return left?.provider === right?.provider && left?.model === right?.model;
}

function sameSelection(left: SelectionLike, right: SelectionLike) {
  return sameModel(left, right) && left?.reasoningEffort === right?.reasoningEffort;
}

function confirmsSelection(actual: SelectionLike, requested: ModelSelection) {
  return sameModel(actual, requested)
    && (requested.reasoningEffort === undefined
      || actual?.reasoningEffort === requested.reasoningEffort);
}

function selectionText(selection: SelectionLike) {
  if (!selection?.provider || !selection?.model) return '';
  const id = modelId(String(selection.provider), String(selection.model));
  return selection.reasoningEffort === undefined
    ? id
    : `${id} · reasoningEffort=${safeDisplayText(selection.reasoningEffort)}`;
}

function selectionMismatch(expected: unknown, actual: unknown, source: unknown) {
  const error = new Error(`Harness ${source} did not confirm the selected model`) as CodedError;
  error.code = MODEL_SELECTION_MISMATCH;
  error.expected = expected;
  error.actual = actual;
  error.source = source;
  return error;
}

function sessionBindingChanged() {
  const error = new Error('Conversation binding changed during model selection') as CodedError;
  error.code = SESSION_BINDING_CHANGED;
  return error;
}

function assertSessionBinding(state: unknown, key: unknown, expectedSessionId: unknown) {
  const current = state as SessionState | null | undefined;
  const currentSessionId = typeof current?.sessionFor === 'function'
    ? current.sessionFor(key)
    : null;
  if (currentSessionId !== expectedSessionId) throw sessionBindingChanged();
}

function matchingModel(catalog: ModelCatalog, requested: string) {
  for (const group of catalog.groups) {
    for (const model of group.models) {
      if (modelId(group.id, model.id) === requested) {
        return { provider: group.id, model: model.id } as ModelSelection;
      }
    }
  }
  return null;
}

function modelAt(catalog: ModelCatalog, requestedIndex: number) {
  let index = 0;
  for (const group of catalog.groups) {
    for (const model of group.models) {
      index += 1;
      if (index === requestedIndex) {
        return { provider: group.id, model: model.id } as ModelSelection;
      }
    }
  }
  return null;
}

function positiveNumberRequest(requested: string) {
  if (!/^\d+$/u.test(requested)) return null;
  const index = Number(requested);
  return { index: Number.isSafeInteger(index) && index > 0 ? index : null };
}

function modelForSelection(catalog: ModelCatalog, selection: SelectionLike) {
  if (!selection) return null;
  const group = catalog.groups.find(({ id }) => id === selection.provider);
  return group?.models.find(({ id }) => id === selection.model) ?? null;
}

function reasoningEffortAt(model: CatalogModel | null | undefined, requestedIndex: number) {
  return model?.reasoning?.efforts?.[requestedIndex - 1] ?? null;
}

function reasoningEffortById(model: CatalogModel | null | undefined, requestedId: string) {
  return model?.reasoning?.efforts?.find(({ id }) => id === requestedId) ?? null;
}

function effectiveReasoningEffort(current: SelectionLike, model: CatalogModel | null | undefined) {
  return current?.reasoningEffort ?? model?.reasoning?.defaultEffort;
}

function reasoningEffortText(model: CatalogModel | null | undefined, effortId: unknown) {
  if (effortId === undefined) return t('Default（由模型或 Provider 决定）');
  const effort = typeof effortId === 'string' ? reasoningEffortById(model, effortId) : null;
  if (!effort) return safeDisplayText(effortId);
  const name = safeDisplayText(effort.name);
  const id = safeDisplayText(effort.id);
  return name === id ? id : `${name} (${id})`;
}

function currentReasoningEffortText(catalog: ModelCatalog) {
  const model = modelForSelection(catalog, catalog.current);
  return reasoningEffortText(
    model,
    effectiveReasoningEffort(catalog.current, model),
  );
}

function reasoningMarker(effortId: unknown, currentId: unknown, defaultId: unknown) {
  if (effortId === currentId && effortId === defaultId) return t('（当前、默认）');
  if (effortId === currentId) return t('（当前）');
  if (effortId === defaultId) return t('（默认）');
  return '';
}

function invalidModelNumberMessage(requested: unknown) {
  return [
    t('模型序号无效：{input}', { input: safeDisplayText(requested) }),
    '',
    t('请发送 /models 查看并输入有效的正整数序号。'),
  ].join('\n');
}

function invalidReasoningNumberMessage(requested: unknown) {
  return [
    t('推理等级序号无效：{input}', { input: safeDisplayText(requested) }),
    '',
    t('请发送 /reasoninglist 查看并输入有效的正整数序号。'),
  ].join('\n');
}

function unsupportedReasoningMessage(
  selection: SelectionLike,
  requested: unknown,
  model: CatalogModel | null | undefined,
) {
  const lines = [
    t('模型不支持推理等级：{effort}', { effort: safeDisplayText(requested) }),
    '',
    safeDisplayText(selectionText(selection)),
  ];
  const ids = model?.reasoning?.efforts?.map(({ id }) => safeDisplayText(id)) ?? [];
  if (ids.length > 0) {
    lines.push(t('可用推理等级：{efforts}', { efforts: ids.join(', ') }));
  } else {
    lines.push(t('该模型不提供可切换的推理等级。'));
  }
  return lines.join('\n');
}

function formatCatalog(catalog: ModelCatalog) {
  const currentId = catalog.current
    ? modelId(catalog.current.provider, catalog.current.model)
    : null;
  const lines = [t('可用模型：')];
  let index = 0;
  if (catalog.groups.length === 0) lines.push('', t('当前没有可用模型。'));
  for (const group of catalog.groups) {
    lines.push('', safeDisplayText(group.name) || safeDisplayText(group.id));
    for (const model of group.models) {
      index += 1;
      const id = modelId(group.id, model.id);
      lines.push(`${index}. ${safeDisplayText(id)}${id === currentId ? t('（当前）') : ''}`);
    }
  }
  if (catalog.failures.length > 0) {
    lines.push('', t('以下模型提供方暂时不可用：'));
    for (const failure of catalog.failures) {
      lines.push(`- ${safeDisplayText(failure.name) || safeDisplayText(failure.id)}`);
    }
  }
  if (index > 0) lines.push('', t('切换模型：/model <序号> [推理等级ID]'));
  return lines.join('\n');
}

function currentModelMessage(catalog: SessionCatalog) {
  return [
    t('当前模型：'),
    modelId(catalog.current.provider, catalog.current.model),
    t('当前推理等级：{effort}', { effort: currentReasoningEffortText(catalog) }),
    '',
    t('查看全部模型：/models'),
    t('查看可用推理等级：/reasoninglist'),
    t('切换模型：/model <序号> [推理等级ID]'),
  ].join('\n');
}

function currentReasoningMessage(catalog: SessionCatalog) {
  return [
    t('当前模型：'),
    modelId(catalog.current.provider, catalog.current.model),
    t('当前推理等级：{effort}', { effort: currentReasoningEffortText(catalog) }),
    '',
    t('查看可用推理等级：/reasoninglist'),
    t('切换推理等级：/reasoning <序号或等级ID>'),
    t('恢复默认等级：/reasoning --default'),
  ].join('\n');
}

function formatReasoningCatalog(catalog: SessionCatalog) {
  const current = catalog.current;
  const model = modelForSelection(catalog, current);
  const currentEffort = effectiveReasoningEffort(current, model);
  const lines = [
    t('当前模型：'),
    modelId(current.provider, current.model),
    t('当前推理等级：{effort}', { effort: reasoningEffortText(model, currentEffort) }),
    '',
    t('可用推理等级：'),
  ];
  if (!model?.reasoning) {
    lines.push(
      t('该模型不提供可切换的推理等级。'),
      '',
      t('恢复默认等级：/reasoning --default'),
    );
    return lines.join('\n');
  }
  for (const [index, effort] of model.reasoning.efforts.entries()) {
    const label = reasoningEffortText(model, effort.id);
    const marker = reasoningMarker(
      effort.id,
      currentEffort,
      model.reasoning.defaultEffort,
    );
    lines.push(`${index + 1}. ${label}${marker}`);
    const description = safeDisplayText(effort.description);
    if (description) lines.push(`   ${description}`);
  }
  lines.push(
    '',
    t('切换推理等级：/reasoning <序号或等级ID>'),
    t('恢复默认等级：/reasoning --default'),
  );
  return lines.join('\n');
}

function noSessionMessage() {
  return [
    t('当前聊天还没有会话。'),
    '',
    t('查看模型：/models'),
    t('选择模型：/model <序号>'),
  ].join('\n');
}

function noReasoningSessionMessage() {
  return [
    t('当前聊天还没有会话。'),
    '',
    t('请先发送一条普通消息创建会话。'),
  ].join('\n');
}

function errorCode(error: unknown) {
  const coded = error as CodedError | undefined;
  return coded?.code ?? coded?.failure?.code;
}

function modelErrorMessage(error: unknown, action: unknown) {
  const code = errorCode(error);
  const coded = error as CodedError | undefined;
  if (code === 'agent-busy' || code === 'session/agent-busy') {
    return t('当前任务正在运行，请等待完成或先发送 /stop。');
  }
  if (code === 'session-not-found' || code === 'session/not-found') {
    return t('当前聊天绑定的会话已不存在，请重试。');
  }
  if (code === 'model-unavailable') {
    if (action === 'reasoning-select') {
      return t('无法切换推理等级。当前模型或推理等级不可用。');
    }
    return t('无法切换到该模型。模型当前不可用，或不支持当前会话中的图片。');
  }
  if (code === WORKSPACE_SESSION_STALE || code === 'workspace-bot-not-found') {
    return t('工作区或机器人状态已发生变化，请重试。');
  }
  if (code === SESSION_BINDING_CHANGED) {
    return t('当前聊天绑定的会话已发生变化，请重试。');
  }
  if (code === MODEL_SELECTION_MISMATCH) {
    const expected = coded?.expected as SelectionLike;
    const actual = coded?.actual as SelectionLike;
    const lines = [action === 'reasoning-select'
      ? t('推理等级切换失败，请稍后重试。')
      : t('模型切换失败，请稍后重试。')];
    if (expected?.provider && expected?.model) {
      lines.push('', `requested: ${safeDisplayText(selectionText(expected))}`);
    }
    if (actual?.provider && actual?.model) {
      const label = coded?.source === 'models.current'
        ? t('当前模型：')
        : 'selectModel.selected:';
      lines.push(`${label} ${safeDisplayText(selectionText(actual))}`);
    } else {
      lines.push(`${coded?.source ?? 'Harness'}: unconfirmed`);
    }
    return lines.join('\n');
  }
  if (code === 'cancelled' || coded?.name === 'AbortError') {
    if (action === 'list') return t('获取模型列表已取消。');
    if (action === 'reasoning-list') return t('获取推理等级列表已取消。');
    if (action === 'reasoning-select') return t('推理等级切换已取消。');
    return t('模型切换已取消。');
  }
  if (action === 'list') return t('暂时无法获取模型列表，请稍后重试。');
  if (action === 'reasoning-list') return t('暂时无法获取推理等级，请稍后重试。');
  if (action === 'reasoning-select') return t('推理等级切换失败，请稍后重试。');
  return t('模型切换失败，请稍后重试。');
}

async function boundSession(
  harness: unknown,
  state: unknown,
  key: unknown,
  options: unknown,
): Promise<BoundSession | null> {
  const current = state as SessionState | null | undefined;
  const host = harness as ModelHarness | null | undefined;
  if (typeof current?.sessionFor !== 'function') return null;
  const sessionId = current.sessionFor(key);
  if (typeof sessionId !== 'string' || !sessionId) return null;
  if (typeof host?.workspaceSession !== 'function') {
    throw new TypeError('Harness does not support workspace sessions');
  }
  const session = host.workspaceSession(sessionId) as ModelSession | null | undefined;
  if (!session || typeof session.sessionExists !== 'function') {
    throw new TypeError('Harness returned an invalid workspace session');
  }
  if (await session.sessionExists(options)) return { sessionId, session };
  if (typeof current.clearSession === 'function' && current.sessionFor(key) === sessionId) {
    await current.clearSession(key);
  }
  return null;
}

async function sessionIsBusy(session: unknown, control: unknown, options: unknown) {
  const handle = session as ModelSession | null | undefined;
  if (typeof handle?.isRunning !== 'function'
    || typeof handle?.hasActiveTurn !== 'function') {
    throw new TypeError('Harness session does not expose run state');
  }
  if (await handle.isRunning(options)) return true;
  return Boolean(await handle.hasActiveTurn(control, options));
}

async function listCatalog(harness: unknown, options: unknown) {
  const host = harness as ModelHarness | null | undefined;
  if (typeof host?.listModels !== 'function') {
    throw new TypeError('Harness does not support listing models');
  }
  return normalizeCatalog(await host.listModels(options));
}

async function sessionCatalog(session: unknown, options: unknown): Promise<SessionCatalog> {
  const handle = session as ModelSession | null | undefined;
  if (typeof handle?.models !== 'function') {
    throw new TypeError('Harness session does not support listing models');
  }
  return normalizeCatalog(await handle.models(options), { requireCurrent: true }) as SessionCatalog;
}

async function selectAndVerifyModel(
  session: unknown,
  selection: ModelSelection,
  options: unknown,
): Promise<ModelSelection> {
  const handle = session as ModelSession | null | undefined;
  if (typeof handle?.selectModel !== 'function') {
    throw new TypeError('Harness session does not support model selection');
  }
  const selected = ((await handle.selectModel(selection, options)) as SelectModelResult | undefined)?.selected;
  if (!confirmsSelection(selected, selection)) {
    throw selectionMismatch(selection, selected, 'selectModel.selected');
  }
  const current = (await sessionCatalog(session, options)).current;
  if (!sameSelection(current, selected)) {
    throw selectionMismatch(selected, current, 'models.current');
  }
  return current;
}

function isModelsCommand(command: string) {
  return MODELS_COMMAND.test(command);
}

function isReasoningListCommand(command: string) {
  return REASONING_LIST_COMMAND.test(command) || REASONINGS_COMMAND.test(command);
}

function isReasoningCommand(command: string) {
  return REASONING_COMMAND.test(command);
}

export function isModelCommand(text: unknown) {
  if (typeof text !== 'string') return false;
  const command = text.trim();
  return MODELS_COMMAND.test(command)
    || MODEL_COMMAND.test(command)
    || REASONING_LIST_COMMAND.test(command)
    || REASONINGS_COMMAND.test(command)
    || REASONING_COMMAND.test(command);
}

export async function runModelCommand(
  text: unknown,
  harness: unknown,
  state: unknown,
  key: unknown,
  options: CommandOptions = {},
) {
  if (!isModelCommand(text)) return null;
  const command = (text as string).trim();
  if (options.hasImages) {
    return commandResult(t('模型和推理等级命令仅支持纯文字，请移除图片后重试。'));
  }
  const requestOptions = rpcOptions(options.signal);

  if (isModelsCommand(command)) {
    if (!/^\/models[ \t]*$/iu.test(command)) return commandResult(t(MODELS_USAGE));
    try {
      const bound = await boundSession(harness, state, key, requestOptions);
      const catalog = bound
        ? await sessionCatalog(bound.session, requestOptions)
        : await listCatalog(harness, requestOptions);
      return commandResult(formatCatalog(catalog));
    } catch (error) {
      return commandResult(modelErrorMessage(error, 'list'));
    }
  }

  if (isReasoningListCommand(command)) {
    if (!/^\/(?:reasoninglist|reasonings)[ \t]*$/iu.test(command)) {
      return commandResult(t(REASONING_LIST_USAGE));
    }
    try {
      const bound = await boundSession(harness, state, key, requestOptions);
      if (!bound) return commandResult(noReasoningSessionMessage());
      return commandResult(formatReasoningCatalog(
        await sessionCatalog(bound.session, requestOptions),
      ));
    } catch (error) {
      return commandResult(modelErrorMessage(error, 'reasoning-list'));
    }
  }

  if (isReasoningCommand(command)) {
    const match = /^\/reasoning(?:[ \t]+([^\s]+))?[ \t]*$/iu.exec(command);
    if (!match) return commandResult(t(REASONING_USAGE));
    const requested = match[1];
    if (!requested) {
      try {
        const bound = await boundSession(harness, state, key, requestOptions);
        if (!bound) return commandResult(noReasoningSessionMessage());
        return commandResult(currentReasoningMessage(
          await sessionCatalog(bound.session, requestOptions),
        ));
      } catch (error) {
        return commandResult(modelErrorMessage(error, 'reasoning-list'));
      }
    }
    if (options.pendingInteraction) {
      return commandResult([
        t('当前任务正在等待你的回答或审批。'),
        '',
        t('请先处理当前请求，或者发送 /stop 停止任务。'),
      ].join('\n'));
    }
    try {
      return await withSessionBindingLock(state as object, key as string, async () => {
        const bound = await boundSession(harness, state, key, requestOptions);
        if (!bound) return commandResult(noReasoningSessionMessage());
        if (await sessionIsBusy(bound.session, options.control, requestOptions)) {
          return commandResult(t('当前任务正在运行，请等待完成或先发送 /stop。'));
        }
        const catalog = await sessionCatalog(bound.session, requestOptions);
        const current = catalog.current;
        const model = modelForSelection(catalog, current);

        let effort: string | undefined;
        if (requested.toLowerCase() === '--default') {
          effort = undefined;
        } else {
          if (!model?.reasoning) {
            return commandResult(unsupportedReasoningMessage(current, requested, model));
          }
          let selectedEffort = reasoningEffortById(model, requested);
          if (!selectedEffort) {
            const numberRequest = positiveNumberRequest(requested);
            if (numberRequest?.index === null) {
              return commandResult(invalidReasoningNumberMessage(requested));
            }
            if (!numberRequest) {
              return commandResult(unsupportedReasoningMessage(current, requested, model));
            }
            selectedEffort = reasoningEffortAt(model, numberRequest.index);
            if (!selectedEffort) return commandResult(invalidReasoningNumberMessage(requested));
          }
          effort = selectedEffort.id;
        }

        const selection = {
          provider: current.provider,
          model: current.model,
          ...(effort === undefined ? {} : { reasoningEffort: effort }),
        };
        const applied = await selectAndVerifyModel(bound.session, selection, requestOptions);
        assertSessionBinding(state, key, bound.sessionId);
        return commandResult(t(`推理等级已切换为：
{effort}

当前模型：{model}
后续消息将使用该推理等级。`, {
          model: modelId(applied.provider, applied.model),
          effort: reasoningEffortText(
            model,
            effectiveReasoningEffort(applied, model),
          ),
        }));
      });
    } catch (error) {
      return commandResult(modelErrorMessage(error, 'reasoning-select'));
    }
  }

  const match = /^\/model(?:[ \t]+([^\s]+)(?:[ \t]+([^\s]+))?)?[ \t]*$/iu.exec(command);
  if (!match) return commandResult(t(MODEL_USAGE));
  const requested = match[1];
  const requestedEffort = match[2];
  if (!requested) {
    try {
      const bound = await boundSession(harness, state, key, requestOptions);
      if (!bound) return commandResult(noSessionMessage());
      const catalog = await sessionCatalog(bound.session, requestOptions);
      return commandResult(currentModelMessage(catalog));
    } catch (error) {
      return commandResult(modelErrorMessage(error, 'select'));
    }
  }
  const numberRequest = positiveNumberRequest(requested);
  if (numberRequest?.index === null) {
    return commandResult(invalidModelNumberMessage(requested));
  }
  if (!numberRequest
    && (!requested.includes('/') || requested.startsWith('/') || requested.endsWith('/'))) {
    return commandResult(t(MODEL_USAGE));
  }
  if (options.pendingInteraction) {
    return commandResult([
      t('当前任务正在等待你的回答或审批。'),
      '',
      t('请先处理当前请求，或者发送 /stop 停止任务。'),
    ].join('\n'));
  }

  try {
    return await withSessionBindingLock(state as object, key as string, async () => {
      const bound = await boundSession(harness, state, key, requestOptions);
      if (bound && await sessionIsBusy(bound.session, options.control, requestOptions)) {
        return commandResult(t('当前任务正在运行，请等待完成或先发送 /stop。'));
      }

      const catalog = bound
        ? await sessionCatalog(bound.session, requestOptions)
        : await listCatalog(harness, requestOptions);
      const selection = numberRequest
        ? modelAt(catalog, numberRequest.index as number)
        : matchingModel(catalog, requested);
      if (!selection) {
        if (numberRequest) return commandResult(invalidModelNumberMessage(requested));
        return commandResult([
          t('没有找到模型：{model}', { model: safeDisplayText(requested) }),
          '',
          t('请发送 /models 查看可用模型。'),
        ].join('\n'));
      }
      const targetModel = modelForSelection(catalog, selection);
      if (requestedEffort !== undefined) {
        const effort = reasoningEffortById(targetModel, requestedEffort);
        if (!effort) {
          return commandResult(unsupportedReasoningMessage(
            selection,
            requestedEffort,
            targetModel,
          ));
        }
        selection.reasoningEffort = effort.id;
      }

      let applied: ModelSelection;
      const host = harness as ModelHarness | null | undefined;
      const current = state as SessionState | null | undefined;
      if (bound) {
        applied = await selectAndVerifyModel(bound.session, selection, requestOptions);
        assertSessionBinding(state, key, bound.sessionId);
      } else {
        if (typeof host?.createSession !== 'function'
          || typeof host?.workspaceSession !== 'function'
          || typeof current?.sessionFor !== 'function'
          || typeof current?.setSession !== 'function') {
          throw new TypeError('Harness cannot create a conversation session');
        }
        const sessionId = await host.createSession(requestOptions);
        if (typeof sessionId !== 'string' || !sessionId) {
          throw new TypeError('Harness returned an invalid session id');
        }
        const session = host.workspaceSession(sessionId);
        applied = await selectAndVerifyModel(session, selection, requestOptions);
        const currentSessionId = current.sessionFor(key);
        if (typeof currentSessionId === 'string' && currentSessionId) {
          throw sessionBindingChanged();
        }
        if (await current.setSession(key, sessionId) === false) {
          const stale = new Error('Workspace changed while binding the new session') as CodedError;
          stale.code = WORKSPACE_SESSION_STALE;
          throw stale;
        }
      }
      return commandResult(t(`模型已切换为：
{model}
推理等级：{effort}

后续消息将使用该模型和推理等级。`, {
        model: modelId(applied.provider, applied.model),
        effort: reasoningEffortText(
          targetModel,
          effectiveReasoningEffort(applied, targetModel),
        ),
      }));
    });
  } catch (error) {
    return commandResult(modelErrorMessage(error, 'select'));
  }
}
