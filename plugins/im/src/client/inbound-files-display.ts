const DUMP_TAG = '<dsh_im_files>';
const SHOW_TEXT = 4;

type Translate = (key: string, vars?: Record<string, string>) => string;

function uploadedLine(name: string, t?: Translate): string {
  const translate: Translate = typeof t === 'function' ? t : (key) => key;
  const withVars = translate('已上传文件 {name}', { name });
  if (typeof withVars === 'string' && !withVars.includes('{name}')) return withVars;
  return String(translate('已上传文件 {name}')).replaceAll('{name}', name);
}

function namesFromDump(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    const files = parsed !== null && typeof parsed === 'object' && 'files' in parsed
      ? (parsed as { files?: unknown }).files
      : undefined;
    if (!Array.isArray(files)) return [];
    return files
      .map((file) => (file !== null && typeof file === 'object' && 'name' in file
        ? (file as { name?: unknown }).name
        : undefined))
      .filter((name): name is string => typeof name === 'string' && name.trim() !== '');
  } catch {
    return [];
  }
}

/** Turn a stored `<dsh_im_files>` dump into the same human lines new turns write. */
export function friendlyInboundFilesText(text: string, t?: Translate): string {
  if (typeof text !== 'string' || !text.includes(DUMP_TAG)) return text;
  return text
    .replace(/<dsh_im_files>\s*([\s\S]*?)\s*<\/dsh_im_files>/g, (_match, raw: string) => {
      const names = namesFromDump(raw);
      if (names.length === 0) return typeof t === 'function' ? t('已上传文件') : '已上传文件';
      return names.map((name) => uploadedLine(name, t)).join('\n');
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function restyleInboundFileBubbles(root: ParentNode | Document | null | undefined, t?: Translate): number {
  const doc = root != null && 'nodeType' in root && root.nodeType === 9
    ? root as Document
    : root != null && 'ownerDocument' in root
      ? (root as Node).ownerDocument
      : null;
  const scope = root != null && 'body' in root && (root as Document).body != null
    ? (root as Document).body
    : root;
  if (doc == null || typeof doc.createTreeWalker !== 'function' || scope == null) return 0;
  const walker = doc.createTreeWalker(scope, SHOW_TEXT);
  const nodes: Array<{ nodeValue: string | null }> = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  let count = 0;
  for (const node of nodes) {
    const value = node.nodeValue;
    if (typeof value !== 'string' || !value.includes(DUMP_TAG)) continue;
    const next = friendlyInboundFilesText(value, t);
    if (next === value) continue;
    node.nodeValue = next;
    count += 1;
  }
  return count;
}

function coalesce(run: () => void, schedule: (callback: () => void) => void = queueMicrotask): () => void {
  let scheduled = false;
  return () => {
    if (scheduled) return;
    scheduled = true;
    schedule(() => {
      scheduled = false;
      run();
    });
  };
}

export function installInboundFileDumpRestyle(
  doc: Document | null | undefined,
  { t, schedule = queueMicrotask }: { t?: Translate; schedule?: (callback: () => void) => void } = {},
): () => void {
  if (doc?.body == null || typeof MutationObserver !== 'function') return () => {};
  const run = () => {
    restyleInboundFileBubbles(doc, t);
  };
  const scheduleRun = coalesce(run, schedule);
  const observer = new MutationObserver(scheduleRun);
  observer.observe(doc.body, { childList: true, subtree: true, characterData: true });
  run();
  return () => observer.disconnect();
}
