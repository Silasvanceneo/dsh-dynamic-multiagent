import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigStore } from '../src/core/config-store.js';
import { RunStore } from '../src/core/run-store.js';
import { DynamicMultiagentRuntime } from '../src/core/runtime.js';

test('config and run stores persist atomically and redact credentials', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-dynamic-'));
  try {
    const configPath = join(dir, 'config.json');
    const configStore = new ConfigStore(configPath, { initial: {
      version: 1,
      connections: [{ id: 'lab', protocol: 'openai-chat', baseUrl: 'http://127.0.0.1:9000/v1', credentialRef: 'lab/key', models: [{ id: 'coder' }], headers: { Authorization: 'Bearer secret' } }],
      modelProfiles: [{ ref: 'lab:coder', capabilities: ['coding'] }],
      defaults: { leader: 'lab:coder' },
    } });
    await configStore.save(await configStore.load());
    const redacted = await configStore.redacted();
    assert.equal(redacted.connections[0].credentialRef, 'lab/key');
    assert.equal(redacted.connections[0].headers.Authorization, '<redacted>');
    assert.match(await readFile(configPath, 'utf8'), /lab\/key/);
    assert.doesNotMatch(await readFile(configPath, 'utf8'), /secret/);

    const runs = new RunStore(join(dir, 'runs.json'));
    const created = await runs.create({ task: 'test', leader: { ref: 'lab:coder' } });
    await runs.beginEffect(created.id, { key: 'effect-1', kind: 'writeback' });
    await runs.commitEffect(created.id, 'effect-1', { ok: true });
    const resumed = await runs.get(created.id);
    assert.equal(resumed.effects.pending.length, 0);
    assert.equal(resumed.effects.committed[0].key, 'effect-1');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('runtime fixes Leader model, validates plan, and executes dependency order', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-runtime-'));
  try {
    const runtime = new DynamicMultiagentRuntime({
      dataDir: dir,
      config: {
        version: 1,
        connections: [{ id: 'lab', protocol: 'openai-chat', baseUrl: 'http://127.0.0.1:9000/v1', models: [{ id: 'coder' }] }],
        modelProfiles: [{ ref: 'lab:coder', capabilities: ['coding', 'tool-calling'] }],
        defaults: { leader: 'lab:coder' },
      },
    });
    await runtime.initialize();
    const run = await runtime.startRun({ task: 'run a two-node task' });
    assert.equal(run.leader.ref, 'lab:coder');
    await runtime.submitPlan(run.id, {
      mode: 'dependency-graph',
      summary: 'two nodes',
      rationale: 'dependency evidence',
      nodes: [
        { id: 'a', responsibility: 'first', roleId: 'worker', model: 'lab:coder', outputs: ['a'], acceptance: ['a'] },
        { id: 'b', responsibility: 'second', roleId: 'worker', model: 'lab:coder', dependencies: ['a'], outputs: ['b'], acceptance: ['b'] },
      ],
    });
    const order = [];
    const finished = await runtime.execute(run.id, {
      executeNode: async ({ node }) => { order.push(node.id); return { ok: node.id }; },
    });
    assert.deepEqual(order, ['a', 'b']);
    assert.equal(finished.status, 'reviewing');
    assert.equal(finished.graph.nodes.every((node) => node.status === 'completed'), true);
    await runtime.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

