import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'vitest';

import {
  cookieHeaderFromResponse,
  HarnessClient,
  HarnessTransportError,
  loopbackWebAuthUrl,
} from '../../../src/channels/shared/harness-client.ts';

const previousHome = process.env.DSH_HOME;

afterEach(() => {
  if (previousHome === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = previousHome;
});

function rpcOk(rpcId: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      type: 'server-response',
      rpcId,
      result: { ok: true, value: { ok: true } },
    }),
  };
}

test('cookieHeaderFromResponse reads Set-Cookie pairs', () => {
  assert.equal(
    cookieHeaderFromResponse({
      headers: { getSetCookie: () => ['dsh=abc; Path=/', 'other=1; HttpOnly'] },
    }),
    'dsh=abc; other=1',
  );
});

test('loopbackWebAuthUrl matches host and port from the xtz auth file', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-im-web-auth-'));
  await writeFile(
    join(home, 'xiaotaozi-xtz-web.auth'),
    JSON.stringify({ pid: 42, url: 'http://127.0.0.1:3081/?token=secret-token' }),
  );
  process.env.DSH_HOME = home;
  assert.equal(
    await loopbackWebAuthUrl(new URL('http://127.0.0.1:3081')),
    'http://127.0.0.1:3081/?token=secret-token',
  );
  assert.equal(await loopbackWebAuthUrl(new URL('http://127.0.0.1:3080')), undefined);
});

test('health retries host.describe with the launch-token cookie after 401', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-im-web-auth-'));
  await writeFile(
    join(home, 'xiaotaozi-xtz-web.auth'),
    JSON.stringify({ pid: 42, url: 'http://127.0.0.1:3081/?token=secret-token' }),
  );
  process.env.DSH_HOME = home;
  const requests: Array<{ url: string; method?: string; cookie?: string }> = [];
  const client = new HarnessClient({
    baseUrl: 'http://127.0.0.1:3081',
    workspace: '/tmp/workspace',
    rpcIdPrefix: 'im',
    fetchImpl: (async (url: URL | RequestInfo, options?: RequestInit) => {
      const href = String(url);
      const headers = new Headers(options?.headers);
      requests.push({
        url: href,
        method: options?.method,
        cookie: headers.get('cookie') ?? undefined,
      });
      if (options?.method === 'GET') {
        return {
          status: 303,
          ok: false,
          headers: { getSetCookie: () => ['dsh-web=cookie-value; Path=/'] },
        };
      }
      if (headers.get('cookie') === 'dsh-web=cookie-value') {
        const body = JSON.parse(String(options?.body ?? '{}'));
        return rpcOk(body.rpcId);
      }
      return { ok: false, status: 401 };
    }) as unknown as typeof fetch,
  });
  assert.equal(await client.health(), true);
  assert.deepEqual(
    requests.map((entry) => [entry.method, entry.url.includes('token='), Boolean(entry.cookie)]),
    [
      ['POST', false, false],
      ['GET', true, false],
      ['POST', false, true],
    ],
  );
});

test('health stays harness-auth-required when no launch-token file exists', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-im-web-auth-'));
  process.env.DSH_HOME = home;
  const client = new HarnessClient({
    baseUrl: 'http://127.0.0.1:3081',
    workspace: '/tmp/workspace',
    rpcIdPrefix: 'im',
    fetchImpl: (async () => ({ ok: false, status: 401 })) as unknown as typeof fetch,
  });
  await assert.rejects(
    client.health(),
    (error) => error instanceof HarnessTransportError && error.code === 'harness-auth-required',
  );
});
