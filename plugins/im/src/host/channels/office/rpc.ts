import { resolveRpcAuthority } from '../../../rpc-authority.ts';
import { OFFICE_RPC_CHANNEL, OFFICE_RPC_ENDPOINTS } from '../../../channels/office/protocol.ts';

type OfficeController = {
  status: () => unknown;
  configure: (payload: unknown) => unknown;
  reconnect: () => unknown;
  test: () => unknown;
  remove: () => unknown;
};

type RpcContext = {
  connection?: {
    rpc?: {
      handle?: (channel: unknown, handler: unknown, options?: unknown) => unknown;
    };
  };
};

type CodedError = { code?: unknown };

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return record(value) && Object.keys(value).every((key) => keys.includes(key));
}

function validConfigure(payload: unknown) {
  return exact(payload, [
    'baseUrl', 'deviceId', 'deviceToken', 'maxConcurrency', 'heartbeatSeconds',
    'workspaces', 'instructionPresets',
  ]) && typeof payload.baseUrl === 'string' && typeof payload.deviceId === 'string'
    && (payload.deviceToken === undefined || typeof payload.deviceToken === 'string')
    && record(payload.workspaces) && record(payload.instructionPresets);
}

export function createOfficeRpcHandler(controller: OfficeController | null | undefined) {
  for (const method of ['status', 'configure', 'reconnect', 'test', 'remove'] as const) {
    if (typeof controller?.[method] !== 'function') throw new TypeError(`AI Office controller requires ${method}()`);
  }
  const office = controller as OfficeController;
  return async (endpoint: unknown, payload: unknown, signal?: AbortSignal | null) => {
    if (signal?.aborted) return { ok: false, error: { code: 'cancelled', message: 'The request was cancelled.' } };
    try {
      let value;
      if (endpoint === OFFICE_RPC_ENDPOINTS.status && exact(payload, [])) value = await office.status();
      else if (endpoint === OFFICE_RPC_ENDPOINTS.configure && validConfigure(payload)) value = await office.configure(payload);
      else if (endpoint === OFFICE_RPC_ENDPOINTS.reconnect && exact(payload, [])) value = await office.reconnect();
      else if (endpoint === OFFICE_RPC_ENDPOINTS.test && exact(payload, [])) value = await office.test();
      else if (endpoint === OFFICE_RPC_ENDPOINTS.remove && exact(payload, ['confirm']) && payload.confirm === true) value = await office.remove();
      else return { ok: false, error: { code: 'bad-request', message: 'Invalid AI Office connector request.' } };
      return { ok: true, value };
    } catch (error) {
      const code = (error as CodedError)?.code === 'invalid-device-token' ? 'invalid-device-token'
        : (error as CodedError)?.code === 'office-hook-unavailable' ? 'office-hook-unavailable' : 'office-operation-failed';
      const message = code === 'invalid-device-token' ? 'AI Office Device Token 无效。'
        : code === 'office-hook-unavailable' ? 'AI Office Hook 尚未上线或地址不正确。'
          : error instanceof TypeError ? error.message : 'AI Office 连接操作失败，请稍后重试。';
      return { ok: false, error: { code, message } };
    }
  };
}

export function installOfficeRpc(
  ctx: RpcContext | null | undefined,
  controller: OfficeController | null | undefined,
  authority?: unknown,
) {
  const host = ctx as {
    connection: {
      rpc: {
        handle: (channel: unknown, handler: unknown, options?: unknown) => unknown;
      };
    };
  };
  return host.connection.rpc.handle(
    OFFICE_RPC_CHANNEL,
    createOfficeRpcHandler(controller),
    { authority: resolveRpcAuthority(authority) },
  );
}
