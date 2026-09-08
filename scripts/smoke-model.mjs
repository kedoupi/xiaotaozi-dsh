import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Opt-in real-model check; uses only a new sandbox project and never sends an IM message. */
export async function smokeModel(page, origin) {
  const project = await mkdtemp(join(tmpdir(), 'xtz-cr-model-'));
  try {
    const post = async (path, data) => {
      const response = await page.request.post(`${origin}${path}`, { data, headers: { origin } });
      assert.equal(response.status(), 200, `Smoke request failed: ${path}`);
      return response.json();
    };
    const rpc = async (method, args) => {
      const response = await post(`/api/${method}`, { type: 'client-request', rpcId: randomUUID(), method, payload: { args } });
      assert.equal(response.result?.ok, true, `${method}: ${response.result?.error?.message ?? 'invalid response'}`);
      return response.result.value;
    };
    const { workspace } = await rpc('workspace/create', { request: { path: project } });
    const board = '/api/dsh-xtz-ui/board';
    const created = await post(`${board}/tasks`, { title: 'CR live model smoke', prompt: 'Do not use tools or write files. Reply with exactly CR_SMOKE_OK.', workspaceId: workspace.workspaceId });
    assert.equal(created.ok, true);
    const taskId = created.tasks.find(task => task.title === 'CR live model smoke').id;
    await post(`${board}/run`, { id: taskId });
    let task;
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      const response = await page.request.get(`${origin}${board}`);
      task = (await response.json()).tasks.find(row => row.id === taskId);
      if (task.status === 'done' || task.status === 'failed') break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.equal(task?.status, 'done', `Live board execution did not succeed: ${JSON.stringify(task?.executions)}`);
    const execution = task.executions.at(-1);
    const listed = await rpc('session/list', { _request: {} });
    const throughSeq = listed.items.find(row => row.sessionId === execution.sessionId)?.projections?.asOfSeq;
    assert.equal(typeof throughSeq, 'number', 'Session list did not publish its durable projection cursor');
    const history = await rpc('session/page', { request: { address: { kind: 'session', sessionId: execution.sessionId }, throughSeq, maxMessages: 10 } });
    const assistantRecords = history.records.filter(record => record.event?.type?.startsWith('assistant/') || record.event?.type === 'chunkrow/text-chunks');
    assert.ok(JSON.stringify(assistantRecords).includes('CR_SMOKE_OK'), 'The live model did not return the expected text');
    // Re-read persisted board state independently of the run response.
    assert.equal(execution.result, 'succeeded');
    console.log('live model smoke: explicit temporary workspace, board create/run, model reply and persisted successful outcome passed');
  } finally { await rm(project, { recursive: true, force: true }); }
}
