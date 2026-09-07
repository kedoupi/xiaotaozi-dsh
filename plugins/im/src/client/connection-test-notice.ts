export const CONNECTION_TEST_SENT = '测试消息已发送，请到对应机器人会话中确认。';
export const CONNECTION_TEST_NO_TARGET = '连接检查完成。请先在会话里给这个机器人发一条消息，然后再点检查连接。';
export const CONNECTION_TEST_CANNOT_PUSH = '连接检查完成。无法主动发送测试消息，请先在会话里发一条，然后再点检查连接。';

export type ConnectionTestCopy = {
  sent?: string;
  unavailable?: string;
  failed?: string;
};

export function connectionTestFeedback(result?: unknown, copy: ConnectionTestCopy = {}): string | null {
  const record = result && typeof result === 'object' && !Array.isArray(result)
    ? result as { sent?: unknown; code?: unknown }
    : null;
  if (record?.sent === true) return copy.sent ?? CONNECTION_TEST_SENT;
  if (record?.code === 'test-target-unavailable') return copy.unavailable ?? CONNECTION_TEST_NO_TARGET;
  return result ? (copy.failed ?? CONNECTION_TEST_CANNOT_PUSH) : null;
}
