import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import type { EditorState, TransactionSpec } from '@codemirror/state'
import type { EditorViewConfig, ViewUpdate } from '@codemirror/view'
import type { Context } from '../src/context-types.ts'
import type { FileViewerProps } from '../src/client/service.ts'
import { createBetterSidebarService } from '../src/client/service.ts'
import { SidebarStore, firstLeaf, floatTab, makeDefaultState } from '../src/client/state.ts'

// A controlled hook scheduler, not a DOM renderer. Component functions and
// their callbacks are real; tests choose exactly when passive effects run.
type Slot = { value?: unknown; deps?: readonly unknown[]; cleanup?: () => void }
type Frame = { slots: Slot[]; cursor: number; effects: Array<() => void> }
const hooks = vi.hoisted(() => ({ current: undefined as Frame | undefined }))
vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>()
  const slot = () => {
    const frame = hooks.current!
    return frame.slots[frame.cursor++] ?? (frame.slots[frame.cursor - 1] = {})
  }
  const changed = (previous: readonly unknown[] | undefined, next: readonly unknown[] | undefined) =>
    next === undefined || previous === undefined || next.some((value, i) => !Object.is(value, previous[i]))
  return {
    ...actual,
    useState: (initial: unknown) => {
      const cell = slot()
      if (!('value' in cell)) cell.value = typeof initial === 'function' ? initial() : initial
      return [cell.value, (next: unknown) => { cell.value = typeof next === 'function' ? next(cell.value) : next }]
    },
    useRef: (initial: unknown) => {
      const cell = slot()
      cell.value ??= { current: initial }
      return cell.value
    },
    useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => {
      const cell = slot()
      if (changed(cell.deps, deps)) {
        hooks.current!.effects.push(() => { cell.cleanup?.(); cell.cleanup = effect() ?? undefined })
      }
      cell.deps = deps
    },
    useMemo: (factory: () => unknown, deps: readonly unknown[]) => {
      const cell = slot()
      if (changed(cell.deps, deps)) cell.value = factory()
      cell.deps = deps
      return cell.value
    },
    useCallback: (callback: unknown) => { slot(); return callback },
    useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => { slot(); return snapshot() },
  }
})

// Keep real EditorState transactions/facets. Only replace the browser View
// constructor, forwarding its actual registered update listeners synchronously.
const cm = vi.hoisted(() => ({ views: [] as Array<{ state: EditorState; dispatch(spec: TransactionSpec): void; destroy: ReturnType<typeof vi.fn> }> }))
vi.mock('@codemirror/view', async importOriginal => {
  const actual = await importOriginal<typeof import('@codemirror/view')>()
  function View(config: EditorViewConfig) {
    const view = {
      state: config.state!,
      hasFocus: false,
      dispatch(spec: TransactionSpec) {
        const transaction = this.state.update(spec)
        this.state = transaction.state
        for (const callback of this.state.facet(actual.EditorView.updateListener)) {
          callback({ state: this.state, view: this, docChanged: transaction.docChanged } as unknown as ViewUpdate)
        }
      },
      destroy: vi.fn(),
      requestMeasure: vi.fn(),
    }
    cm.views.push(view)
    return view
  }
  Object.setPrototypeOf(View, actual.EditorView)
  return { ...actual, EditorView: View }
})
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: 'Button', Modal: 'Modal', MarkdownText: 'MarkdownText',
  IconCheckOutline16: 'Check', IconFolderOpen16: 'Folder', IconRefreshOutline14: 'Refresh',
}))
vi.mock('../src/client/TreePanel.tsx', () => ({ TreePanel: 'TreePanel' }))
vi.mock('../src/client/FileTree.tsx', () => ({ baseName: (path: string) => path.split('/').at(-1) }))
vi.mock('../src/client/intercept.tsx', () => ({ openSidebarFile: vi.fn() }))
vi.mock('../src/client/binary-download.tsx', () => ({ BinaryDownload: 'BinaryDownload' }))
vi.mock('../src/client/MarkdownHtml.tsx', () => ({ LazyMermaidMarkdown: 'LazyMermaidMarkdown', MarkdownDocument: 'MarkdownDocument' }))
vi.mock('../src/client/md-toc.tsx', () => ({ MdToc: 'MdToc' }))
vi.mock('../src/client/SandboxStatusBar.tsx', () => ({ SandboxStatusBar: 'SandboxStatusBar' }))
vi.mock('../src/client/lang.ts', () => ({ languageForPath: () => null }))
vi.mock('../src/client/theme.ts', () => ({ isDarkScheme: () => false, subscribeColorScheme: () => () => {} }))
vi.mock('../src/client/cm-themes.ts', () => ({ cmSurfaceTheme: [], CmThemeCompartment: class { of() { return [] } reconfigure() { return [] } } }))
vi.mock('../src/client/api.ts', () => ({ api: { fsRead: vi.fn(), fsWrite: vi.fn() }, mediaUrl: () => '', htmlUrl: () => '' }))

import { api } from '../src/client/api.ts'
import { EditorHost } from '../src/client/EditorHost.tsx'
import { TextEditor } from '../src/client/TextEditor.tsx'

type Element = ReactElement<Record<string, any>>
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!node || typeof node !== 'object' || !('props' in node)) return []
  const element = node as Element
  return [element, ...elements(element.props.children)]
}
function frame() {
  const state: Frame = { slots: [], cursor: 0, effects: [] }
  return {
    render<T>(component: () => T): T {
      state.cursor = 0
      hooks.current = state
      try {
        const tree = component()
        for (const element of elements(tree)) {
          const ref = (element as unknown as { ref?: { current: unknown } }).ref
          if (ref && typeof ref === 'object') ref.current ??= {}
        }
        return tree
      } finally { hooks.current = undefined }
    },
    flush: () => { for (const effect of state.effects.splice(0)) effect() },
    dispose: () => { for (const slot of state.slots) slot.cleanup?.() },
  }
}
const frames: ReturnType<typeof frame>[] = []
beforeEach(() => {
  vi.useFakeTimers()
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: vi.fn((key: string, value: string) => { values.set(key, value) }) }
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 800, location: { search: '', href: 'http://editor.fixture.invalid/', origin: 'http://editor.fixture.invalid' }, localStorage: storage, setTimeout, clearTimeout })
  cm.views.length = 0
  vi.mocked(api.fsRead).mockResolvedValue({ kind: 'text', content: 'saved', truncated: false })
  vi.mocked(api.fsWrite).mockResolvedValue({ ok: true })
})
afterEach(() => {
  for (const f of frames.splice(0).reverse()) f.dispose()
  vi.clearAllTimers()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.clearAllMocks()
})

async function fixture() {
  const store = new SidebarStore()
  store.setSession('session-a')
  store.setPrefs({ ...store.getPrefs(), editorExplorer: true })
  store.reduce(() => ({ ...makeDefaultState(), splits: { kind: 'leaf', id: 'pane-a', active: 'editor:a', tabs: [{ id: 'editor:a', type: 'editor', path: '/fixture/a.txt', title: 'a.txt' }] } }))
  const service = createBetterSidebarService(store)
  const onClose = vi.fn()
  service.registerTab({ id: 'editor', title: 'Editor', component: () => null, onClose })
  service.registerFileViewer({ id: 'code', exts: ['txt'], component: TextEditor, fetchStrategy: 'fsRead' })
  const ctx = { get: (key: string) => key === 'betterSidebar' ? service : undefined } as unknown as Context
  const host = frame(), editor = frame()
  frames.push(host, editor)
  const renderHost = () => host.render(() => EditorHost({ ctx, store, scope: { sessionId: 'session-a' }, tab: firstLeaf(store.getSnapshot().state!.splits).tabs[0]!, expanded: [], revealed: [], onToggleDir() {}, onReferenceFile() {} }))
  renderHost()
  host.flush()
  await Promise.resolve()
  await Promise.resolve()
  let tree = renderHost()
  const viewer = elements(tree).find(element => element.type === TextEditor)
  expect(viewer).toBeDefined()
  const props = viewer!.props as FileViewerProps
  const reported = vi.fn(props.onToolbarState)
  const controls = vi.fn(props.onToolbarControls)
  const renderEditor = () => editor.render(() => TextEditor({ ...props, onToolbarState: reported, onToolbarControls: controls }))
  renderEditor()
  editor.flush()
  expect(cm.views).toHaveLength(1)
  expect(reported).toHaveBeenCalledWith(expect.objectContaining({ dirty: false }))
  vi.advanceTimersByTime(200)
  expect(localStorage.getItem('dsh-sidebar:v1:session-a')).not.toBeNull()
  const notified = vi.fn()
  store.subscribe(notified)
  vi.mocked(localStorage.setItem).mockClear()
  const view = cm.views[0]!
  return {
    store, service, onClose, host, editor, reported, notified, view, renderHost, renderEditor,
    save() { expect(controls).toHaveBeenCalledWith(expect.objectContaining({ save: expect.any(Function) })); controls.mock.lastCall![0]!.save() },
    setMode(mode: 'edit' | 'preview') { controls.mock.lastCall![0]!.setMode(mode) },
    edit(text: string) { view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }); expect(view.state.doc.toString()).toBe(text) },
    openSamePath(path = '/fixture/a.txt', confirm = true) {
      tree = renderHost()
      // Open the tree through the actual host header toggle if it is closed.
      const toggle = elements(tree).find(element => element.type === 'button' && 'aria-pressed' in element.props)!
      if (!toggle.props['aria-pressed']) { toggle.props.onClick(); tree = renderHost() }
      const treePanel = elements(tree).find(element => element.type === 'TreePanel')!
      treePanel.props.onOpenFile(path)
      tree = renderHost()
      const modal = elements(tree).find(element => element.type === 'Modal')!
      expect(modal).toBeDefined()
      const buttons = elements(modal.props.footer).filter(element => element.type === 'Button')
      buttons[confirm ? 1 : 0]!.props.onClick()
    },
  }
}

function expectBlocked(f: Awaited<ReturnType<typeof fixture>>, action: 'float' | 'close') {
  const before = f.store.getSnapshot().state
  if (action === 'float') f.store.reduce(state => floatTab(state, 'editor:a', 400, 300))
  else f.service.closeTab('editor:a')
  expect(f.store.getSnapshot().state).toBe(before)
  expect(f.onClose).not.toHaveBeenCalled()
  expect(f.notified).not.toHaveBeenCalled()
  vi.advanceTimersByTime(200)
  expect(localStorage.setItem).not.toHaveBeenCalled()
  expect(f.view.destroy).not.toHaveBeenCalled()
}

it.each(['float', 'close'] as const)('blocks %s immediately after the actual editor mutation callback, before React effects', async action => {
  const f = await fixture()
  f.edit('new draft')
  expectBlocked(f, action)
  expect(f.reported).toHaveBeenLastCalledWith(expect.objectContaining({ dirty: true }))
})

it('cancel keeps the same document guarded without reloading', async () => {
  const f = await fixture()
  f.edit('retained draft')
  f.openSamePath('/fixture/other.txt', false)
  vi.advanceTimersByTime(200)
  f.notified.mockClear(); vi.mocked(localStorage.setItem).mockClear()
  f.renderHost(); f.host.flush()
  expect(api.fsRead).toHaveBeenCalledTimes(1)
  expect(firstLeaf(f.store.getSnapshot().state!.splits).tabs[0]!.path).toBe('/fixture/a.txt')
  expectBlocked(f, 'float')
})

it('confirmed different-path navigation is authorized once and reloads its target', async () => {
  const f = await fixture()
  f.edit('discarded draft')
  f.openSamePath('/fixture/other.txt')
  expect(firstLeaf(f.store.getSnapshot().state!.splits).tabs[0]!.path).toBe('/fixture/other.txt')
  vi.advanceTimersByTime(200)
  f.notified.mockClear(); vi.mocked(localStorage.setItem).mockClear()
  expectBlocked(f, 'close') // No permanent bypass while the old editor is still mounted.
  f.renderHost(); f.host.flush()
  expect(api.fsRead).toHaveBeenLastCalledWith(expect.objectContaining({ sessionId: 'session-a' }), '/fixture/other.txt')
})

it('a queued passive report cannot overwrite synchronous dirty notification', async () => {
  const f = await fixture()
  f.renderEditor() // Queue the clean render's toolbar effect, but do not run it.
  f.edit('typed before effects')
  f.editor.flush()
  expectBlocked(f, 'float')
  expect(f.reported).toHaveBeenLastCalledWith(expect.objectContaining({ dirty: true }))
})

it('same-path discard retains the guard until reload actually starts', async () => {
  const f = await fixture()
  f.edit('first draft'); f.renderEditor(); f.editor.flush()
  f.openSamePath()
  vi.advanceTimersByTime(200)
  f.notified.mockClear(); vi.mocked(localStorage.setItem).mockClear()
  expectBlocked(f, 'close')
})

it.each(['failed', 'superseded', 'current'] as const)('save %s only releases the current successfully saved document', async outcome => {
  const f = await fixture()
  let resolve!: (value: Awaited<ReturnType<typeof api.fsWrite>>) => void
  let reject!: (reason: Error) => void
  vi.mocked(api.fsWrite).mockReturnValue(new Promise((yes, no) => { resolve = yes; reject = no }))
  f.edit('submitted')
  f.save()
  expect(api.fsWrite).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'session-a' }), '/fixture/a.txt', 'submitted')
  if (outcome === 'superseded') f.edit('newer draft')
  if (outcome === 'failed') reject(new Error('fixture save failure'))
  else resolve({ ok: true })
  await Promise.resolve(); await Promise.resolve()
  if (outcome === 'current') {
    f.store.reduce(state => floatTab(state, 'editor:a', 400, 300))
    expect(f.store.getSnapshot().state!.floats[0]?.tab.id).toBe('editor:a')
  } else expectBlocked(f, 'close')
})

it('a queued clean saved effect cannot reload input received before it executes', async () => {
  const f = await fixture()
  f.edit('submitted'); f.save()
  await Promise.resolve(); await Promise.resolve()
  f.renderEditor(); f.editor.flush() // Report successful save from the actual editor.
  expect(f.reported).toHaveBeenLastCalledWith(expect.objectContaining({ dirty: false, saveState: 'saved' }))
  f.renderHost() // Queue the clean saved effect, deliberately do not flush it.
  f.edit('new draft after saved render')
  f.host.flush() // Executes the older clean closure; must consult the live ref.
  f.renderHost(); f.host.flush()
  expect(api.fsRead).toHaveBeenCalledTimes(1)
  expectBlocked(f, 'close')
})

it.each(['preview', 'edit', 'failed'] as const)('save refresh control: %s', async mode => {
  const f = await fixture()
  if (mode === 'edit') { f.setMode('edit'); f.renderEditor(); f.editor.flush() }
  if (mode === 'failed') vi.mocked(api.fsWrite).mockRejectedValue(new Error('fixture failure'))
  f.edit('submitted'); f.save()
  await Promise.resolve(); await Promise.resolve()
  f.renderEditor(); f.editor.flush()
  f.renderHost(); f.host.flush()
  f.renderHost(); f.host.flush()
  expect(api.fsRead).toHaveBeenCalledTimes(mode === 'preview' ? 2 : 1)
  f.renderHost(); f.host.flush()
  expect(api.fsRead).toHaveBeenCalledTimes(mode === 'preview' ? 2 : 1)
})

it.each(['float', 'close'] as const)('same-path discard cannot leave %s unguarded for subsequent input', async action => {
  const f = await fixture()
  f.edit('first draft')
  f.renderEditor(); f.editor.flush() // Establish the original deduplicated dirty report.
  f.openSamePath()
  vi.advanceTimersByTime(200)
  f.notified.mockClear(); vi.mocked(localStorage.setItem).mockClear()
  f.edit('draft after confirmation')
  expectBlocked(f, action) // No reload/effect flush has happened yet.
  f.renderHost(); f.host.flush()
  expect(api.fsRead).toHaveBeenCalledTimes(2) // Same-path confirmation really requests a reload.
})
