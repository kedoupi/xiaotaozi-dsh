function nonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

type QuestionOption = {
  label?: unknown;
  description?: unknown;
};

type HarnessQuestion = {
  id?: unknown;
  question?: unknown;
  header?: unknown;
  detail?: unknown;
  multiSelect?: unknown;
  options?: unknown;
};

function asQuestion(value: unknown): HarnessQuestion {
  return value as HarnessQuestion;
}

function asOption(value: unknown): QuestionOption | null | undefined {
  return value as QuestionOption | null | undefined;
}

export function validHarnessQuestion(question: unknown) {
  const value = asQuestion(question);
  return Boolean(value && typeof value.id === 'string' && typeof value.question === 'string'
    && (value.header === undefined || typeof value.header === 'string')
    && (value.detail === undefined || typeof value.detail === 'string')
    && (value.multiSelect === undefined || typeof value.multiSelect === 'boolean')
    && (value.options === undefined || (Array.isArray(value.options)
      && value.options.every((option: unknown) => {
        const item = asOption(option);
        return Boolean(item && typeof item.label === 'string'
          && (item.description === undefined || typeof item.description === 'string'));
      }))));
}

export function harnessQuestionText(
  question: unknown,
  index: number,
  total: number,
  { requiresMention = false }: { requiresMention?: boolean } = {},
) {
  const value = asQuestion(question);
  const lines: string[] = [];
  const progress = total > 1 ? `（${index + 1}/${total}）` : '';
  lines.push(`小桃子需要你补充信息${progress}：`);
  if (nonEmptyString(value.header)) lines.push('', (value.header as string).trim());
  lines.push('', nonEmptyString(value.question) ?? '请输入你的回答。');
  if (nonEmptyString(value.detail)) lines.push('', (value.detail as string).trim());

  const options = Array.isArray(value.options) ? value.options : [];
  if (options.length > 0) {
    lines.push('');
    options.forEach((option: unknown, optionIndex: number) => {
      const item = asOption(option);
      const label = typeof item?.label === 'string' ? item.label : '';
      const description = nonEmptyString(item?.description);
      lines.push(`${optionIndex + 1}. ${label}${description ? ` — ${description}` : ''}`);
    });
    lines.push('', value.multiSelect === true
      ? '请回复选项序号或文字；多选用逗号分隔，也可补充其他内容。'
      : '请回复一个选项序号或文字，也可直接输入其他答案。');
  } else {
    lines.push('', '请直接回复你的答案。');
  }
  if (requiresMention) lines.push('', '群聊中请 @机器人 后发送答案。');
  return lines.join('\n');
}

function optionLabel(token: string, options: unknown[]) {
  const normalized = token.trim();
  if (!normalized) return null;
  if (/^\d+$/.test(normalized)) {
    const option = asOption(options[Number(normalized) - 1]);
    return typeof option?.label === 'string' ? option.label : null;
  }
  const exact = options.find((option: unknown) => asOption(option)?.label === normalized);
  const label = asOption(exact)?.label;
  return typeof label === 'string' ? label : null;
}

export function harnessAnswerForQuestion(question: unknown, text: string) {
  const value = asQuestion(question);
  const options = Array.isArray(value.options) ? value.options : [];
  if (options.length === 0) {
    return { id: value.id, selected: [], custom: text };
  }

  const wholeLabel = optionLabel(text, options);
  if (value.multiSelect !== true) {
    return wholeLabel
      ? { id: value.id, selected: [wholeLabel] }
      : { id: value.id, selected: [], custom: text };
  }
  if (wholeLabel) return { id: value.id, selected: [wholeLabel] };

  const selected: string[] = [];
  const custom: string[] = [];
  for (const token of text.split(/[,，、;；\n]+/)) {
    const tokenValue = token.trim();
    if (!tokenValue) continue;
    const label = optionLabel(tokenValue, options);
    if (label) {
      if (!selected.includes(label)) selected.push(label);
    } else {
      custom.push(tokenValue);
    }
  }
  return {
    id: value.id,
    selected,
    ...(custom.length > 0 ? { custom: custom.join('、') } : {}),
  };
}
