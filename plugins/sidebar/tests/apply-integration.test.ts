import { EventEmitter } from 'node:events'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WebSocket, WebSocketServer } from 'ws'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  Context,
  SidebarHttpRequest,
  SidebarHttpResponse,
  SidebarWebRoute,
  SidebarWebUpgradeRoute,
} from '../src/context-types.ts'
import { apply } from '../src/index.ts'
import { SIDEBAR_PREFS_DEFAULTS, SIDEBAR_PREFS_NS } from '../src/config.ts'
import { ensureWorkspaceWritePath } from '../src/path-security.ts'

const temporaryRoots: string[] = []
const effectDisposers: Array<() => void> = []

interface CapturedResponse {
  status: number
  headers: Record<string, string>
  body: string
}

interface SidebarHarness {
  ctx: Context
  routes: SidebarWebRoute[]
  upgrades: SidebarWebUpgradeRoute[]
  workspace: string
}

function makeJsonRequest(init: {
  url: string
  method?: string
  remote?: string
  host?: string
  origin?: string
  body?: string
}): SidebarHttpRequest {
  const payload = init.body ?? '{}'
  return {
    url: init.url,
    method: init.method ?? 'POST',
    headers: {
      host: init.host ?? '127.0.0.1:3081',
      ...(init.origin === undefined ? {} : { origin: init.origin }),
    },
    socket: { remoteAddress: init.remote ?? '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      yield payload
    },
  }
}

function makeUploadRequest(init: {
  url: string
  remote?: string
  host?: string
  origin?: string
  chunks?: Array<string | Uint8Array>
}): SidebarHttpRequest {
  const chunks = init.chunks ?? ['payload']
  return {
    url: init.url,
    method: 'POST',
    headers: {
      host: init.host ?? '127.0.0.1:3081',
      origin: init.origin ?? 'http://127.0.0.1:3081',
    },
    socket: { remoteAddress: init.remote ?? '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
}

function captureResponse(): { res: SidebarHttpResponse; snapshot: () => CapturedResponse } {
  let status = 200
  let headers: Record<string, string> = {}
  let body = ''
  const res: SidebarHttpResponse = {
    statusCode: 200,
    writeHead(nextStatus, nextHeaders) {
      status = nextStatus
      headers = { ...nextHeaders }
    },
    end(chunk) {
      body = chunk === undefined ? '' : typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
    },
  }
  return {
    res,
    snapshot: () => ({ status, headers, body }),
  }
}

function mockUpgradeSocket(): EventEmitter & { destroy(): void; write(chunk?: unknown): void; read(): void } {
  const socket = new EventEmitter() as EventEmitter & { destroy(): void; write(chunk?: unknown): void; read(): void }
  socket.destroy = () => undefined
  socket.write = () => true
  socket.read = () => undefined
  return socket
}

function terminalUpgradeRequest(query: string): SidebarHttpRequest {
  return {
    url: `/sidebar/ws/terminal?${query}`,
    method: 'GET',
    headers: {
      host: '127.0.0.1:3081',
      origin: 'http://127.0.0.1:3081',
      upgrade: 'websocket',
      connection: 'Upgrade',
      'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
      'sec-websocket-version': '13',
    },
    socket: { remoteAddress: '127.0.0.1' },
  }
}

async function readJsonResponse(snapshot: CapturedResponse): Promise<unknown> {
  return JSON.parse(snapshot.body) as unknown
}

function createHarness(sessions: Record<string, { header: { cwd?: string } }>): SidebarHarness {
  const routes: SidebarWebRoute[] = []
  const upgrades: SidebarWebUpgradeRoute[] = []
  const ctx = {
    get(_name: string) {
      return undefined
    },
    webServer: {
      register(route: SidebarWebRoute) {
        routes.push(route)
        return () => {
          const index = routes.indexOf(route)
          if (index >= 0) routes.splice(index, 1)
        }
      },
      registerUpgrade(route: SidebarWebUpgradeRoute) {
        upgrades.push(route)
        return () => {
          const index = upgrades.indexOf(route)
          if (index >= 0) upgrades.splice(index, 1)
        }
      },
    },
    sessions: {
      get(id: string) {
        return sessions[id]
      },
    },
    tools: {
      register() {
        return () => undefined
      },
    },
    inject(services: string[], callback: (scoped: Context) => void) {
      if (services.includes('settings')) {
        callback({
          settings: {
            register(_ns: unknown, _schema: unknown) {
              return {
                get: () => SIDEBAR_PREFS_DEFAULTS,
                watch: () => () => undefined,
              }
            },
            describe: () => [],
            update: async () => undefined,
          },
        } as unknown as Context)
      }
    },
    effect(fn: () => (() => void) | void) {
      const dispose = fn()
      if (typeof dispose === 'function') effectDisposers.push(dispose)
    },
    logger: {
      warn() {},
    },
  } as unknown as Context

  apply(ctx)
  return { ctx, routes, upgrades, workspace: sessions.session?.header.cwd ?? process.cwd() }
}

async function temporaryWorkspace(label: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `dsh-sidebar-apply-${label}-`))
  temporaryRoots.push(root)
  return root
}

afterEach(async () => {
  vi.restoreAllMocks()
  for (const dispose of effectDisposers.splice(0).reverse()) dispose()
  await Promise.all(temporaryRoots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })))
})

describe('sidebar apply() route integration', () => {
  it('mounts the fenced JSON, upload, media, and terminal upgrade routes', async () => {
    const workspace = await temporaryWorkspace('routes')
    const harness = createHarness({
      session: { header: { cwd: workspace } },
    })

    expect(harness.routes.map((route) => route.path)).toEqual(expect.arrayContaining([
      '/sidebar/api',
      '/sidebar/upload',
      '/sidebar/file',
      '/sidebar/html',
    ]))
    expect(harness.upgrades.map((route) => route.path)).toEqual(expect.arrayContaining([
      '/sidebar/ws/terminal',
      '/sidebar/ws/agent-terminals',
      '/sidebar/ws/agent-opens',
    ]))
  })

  it('accepts loopback sidebar API calls and rejects LAN peers', async () => {
    const workspace = await temporaryWorkspace('loopback')
    const harness = createHarness({
      session: { header: { cwd: workspace } },
    })
    const api = harness.routes.find((route) => route.path === '/sidebar/api')
    expect(api).toBeDefined()

    const allowed = captureResponse()
    await api!.handler(
      makeJsonRequest({
        url: '/sidebar/api/session.cwd',
        origin: 'http://127.0.0.1:3081',
        body: JSON.stringify({ sessionId: 'session' }),
      }),
      allowed.res,
    )
    const allowedBody = await readJsonResponse(allowed.snapshot()) as { ok: boolean; value?: { cwd?: string } }
    expect(allowed.snapshot().status).toBe(200)
    expect(allowedBody.ok).toBe(true)
    expect(allowedBody.value?.cwd).toBe(workspace)

    const denied = captureResponse()
    await api!.handler(
      makeJsonRequest({
        url: '/sidebar/api/session.cwd',
        remote: '192.168.1.20',
        origin: 'http://192.168.1.20:3081',
        body: JSON.stringify({ sessionId: 'session' }),
      }),
      denied.res,
    )
    const deniedBody = await readJsonResponse(denied.snapshot()) as { ok: boolean; error?: { code?: string } }
    expect(denied.snapshot().status).toBe(403)
    expect(deniedBody.ok).toBe(false)
    expect(deniedBody.error?.code).toBe('forbidden')
  })

  it('rejects traversal-shaped upload paths before writing bytes', async () => {
    const workspace = await temporaryWorkspace('upload')
    const uploads = join(workspace, 'uploads')
    await mkdir(uploads)
    const harness = createHarness({
      session: { header: { cwd: workspace } },
    })
    const upload = harness.routes.find((route) => route.path === '/sidebar/upload')
    expect(upload).toBeDefined()

    for (const relativePath of ['../escape.txt', 'nested/../escape.txt']) {
      const captured = captureResponse()
      await upload!.handler(
        makeUploadRequest({
          url: `/sidebar/upload?sessionId=session&dir=${encodeURIComponent(uploads)}&relativePath=${encodeURIComponent(relativePath)}`,
        }),
        captured.res,
      )
      const body = await readJsonResponse(captured.snapshot()) as { ok: boolean; error?: { code?: string } }
      expect(captured.snapshot().status).toBe(400)
      expect(body.ok).toBe(false)
      expect(body.error?.code).toBe('bad-request')
    }

    await expect(ensureWorkspaceWritePath(workspace, join(workspace, 'safe.txt'))).resolves.toBeTruthy()
  })

  it('returns not-found when the JSON API targets an unknown session', async () => {
    const workspace = await temporaryWorkspace('session')
    const harness = createHarness({})
    const api = harness.routes.find((route) => route.path === '/sidebar/api')
    expect(api).toBeDefined()

    const captured = captureResponse()
    await api!.handler(
      makeJsonRequest({
        url: '/sidebar/api/session.cwd',
        origin: 'http://127.0.0.1:3081',
        body: JSON.stringify({ sessionId: 'missing-session' }),
      }),
      captured.res,
    )
    const body = await readJsonResponse(captured.snapshot()) as { ok: boolean; error?: { code?: string } }
    expect(captured.snapshot().status).toBe(404)
    expect(body.ok).toBe(false)
    expect(body.error?.code).toBe('not-found')
  })

  it('requires sessionId and tab parameters on the terminal upgrade route', async () => {
    const workspace = await temporaryWorkspace('terminal')
    const harness = createHarness({
      session: { header: { cwd: workspace } },
    })
    const upgrade = harness.upgrades.find((route) => route.path === '/sidebar/ws/terminal')
    expect(upgrade).toBeDefined()

    const closeReasons: string[] = []
    const closeCodes: number[] = []
    vi.spyOn(WebSocketServer.prototype, 'handleUpgrade').mockImplementation((_req, _socket, _head, cb) => {
      const ws = {
        readyState: WebSocket.OPEN,
        close(code: number, reason: string) {
          closeCodes.push(code)
          closeReasons.push(reason)
        },
        on: vi.fn(),
        send: vi.fn(),
      } as unknown as WebSocket
      cb(ws)
    })

    upgrade!.handler(
      terminalUpgradeRequest('sessionId=session'),
      mockUpgradeSocket(),
      new Uint8Array(),
    )
    await vi.waitFor(() => {
      expect(closeCodes).toContain(1008)
    })
    expect(closeReasons.join(' ')).toMatch(/terminal parameters required/u)
  })

  it('destroys terminal upgrades from non-loopback callers and requires exact Origin', async () => {
    const workspace = await temporaryWorkspace('upgrade-fence')
    const harness = createHarness({
      session: { header: { cwd: workspace } },
    })
    const upgrade = harness.upgrades.find((route) => route.path === '/sidebar/ws/terminal')
    expect(upgrade).toBeDefined()

    const remoteDenied: unknown[] = []
    upgrade!.handler(
      {
        url: '/sidebar/ws/terminal?sessionId=session&tab=one',
        method: 'GET',
        headers: {
          host: '127.0.0.1:3081',
          origin: 'http://127.0.0.1:3081',
        },
        socket: { remoteAddress: '192.168.1.20' },
      },
      { destroy() { remoteDenied.push(true) } },
      new Uint8Array(),
    )
    expect(remoteDenied).toEqual([true])

    const originDenied: unknown[] = []
    upgrade!.handler(
      {
        url: '/sidebar/ws/terminal?sessionId=session&tab=one',
        method: 'GET',
        headers: {
          host: '127.0.0.1:3081',
        },
        socket: { remoteAddress: '127.0.0.1' },
      },
      { destroy() { originDenied.push(true) } },
      new Uint8Array(),
    )
    expect(originDenied).toEqual([true])
  })

  it('registers sidebar prefs through the settings inject seam', async () => {
    const registered: unknown[] = []
    const workspace = await temporaryWorkspace('settings')
    const routes: SidebarWebRoute[] = []
    const ctx = {
      get(_name: string) {
        return undefined
      },
      webServer: {
        register(route: SidebarWebRoute) {
          routes.push(route)
          return () => undefined
        },
        registerUpgrade() {
          return () => undefined
        },
      },
      sessions: { get: () => ({ header: { cwd: workspace } }) },
      tools: { register: () => () => undefined },
      inject(services: string[], callback: (scoped: Context) => void) {
        if (services.includes('settings')) {
          callback({
            settings: {
              register(ns: unknown, schema: unknown) {
                registered.push({ ns, schema })
                return {
                  get: () => SIDEBAR_PREFS_DEFAULTS,
                  watch: () => () => undefined,
                }
              },
              describe: () => [],
              update: async () => undefined,
            },
          } as unknown as Context)
        }
      },
      effect(fn: () => (() => void) | void) {
        const dispose = fn()
        if (typeof dispose === 'function') effectDisposers.push(dispose)
      },
      logger: { warn() {} },
    } as unknown as Context

    apply(ctx)
    expect(registered).toEqual([expect.objectContaining({ ns: SIDEBAR_PREFS_NS })])
  })
})
