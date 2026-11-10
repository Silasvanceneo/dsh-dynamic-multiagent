import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DynamicMultiagentRuntime } from '../src/core/runtime.js';
import { SubagentTaskExecutor } from '../src/core/subagent-bridge.js';
import { RoleRegistry, BUILTIN_ROLES } from '../src/core/roles.js';
import { ModelDirectory } from '../src/core/model-router.js';

function fakeSubagents({ result = { output: [{ type: 'text', text: 'child result' }], stopReason: 'completed' } } = {}) {
  const requests = [];
  const events = [];
  const provider = {
    name: 'spawn',
    capabilities: { depthLimit: true, toolFilter: true, persona: true, outputSchema: true },
  };
  return {
    requests,
    events,
    getProvider(name) { return name === provider.name ? provider : undefined; },
    async start(name, request) {
      events.push({ name, request });
      requests.push(request);
      return {
        id: `child-${requests.length}`,
        result: Promise.resolve(result),
        async dispose() { events.push({ type: 'disposed', id: `child-${requests.length}` }); },
      };
    },
  };
}

test('host bridge maps a graph node to a provider request and persists child lifecycle events', async () => {
  const subagents = fakeSubagents();
  const roles = new RoleRegistry({ roles: BUILTIN_ROLES });
  const models = new ModelDirectory({
    connections: [{ id: 'lab', protocol: 'openai-chat', baseUrl: 'http://127.0.0.1:9000/v1', models: [{ id: 'coder' }] }],
    profiles: [{ ref: 'lab:coder', capabilities: ['coding'] }],
  });
  const executor = new SubagentTaskExecutor({ subagents, roles, modelDirectory: models, providerName: 'spawn' });
  const seen = [];
  const result = await executor.execute({
    run: { id: 'run-1', assignments: [{ nodeId: 'n1', model: models.get('lab:coder') }] },
    node: {
      id: 'n1',
      title: 'Implement change',
      responsibility: 'Implement the bounded change',
      roleId: 'worker',
      categoryId: 'quick',
      model: 'lab:coder',
      skills: [],
      tools: ['read'],
      inputs: ['source'],
      outputs: ['patch'],
      acceptance: ['tests pass'],
      dependencies: [],
    },
    parent: { id: 'parent-agent' },
    onEvent: (event) => { seen.push(event); },
  });
  assert.equal(result.text, 'child result');
  assert.equal(result.stopReason, 'completed');
  assert.equal(result.childId, 'child-1');
  assert.equal(subagents.requests[0].parent.id, 'parent-agent');
  // Advanced connections are served by the plugin's own adapter under the `dma-` route prefix.
  assert.deepEqual(subagents.requests[0].agentOptions, { provider: 'dma-lab', model: 'coder' });
  assert.deepEqual(subagents.requests[0].toolFilter, { allow: ['read'] });
  assert.match(subagents.requests[0].prompt[0].text, /Implement the bounded change/);
  assert.doesNotMatch(subagents.requests[0].prompt[0].text, /You are the Leader/);
  assert.deepEqual(seen.map((event) => event.type), ['child-start', 'child-published', 'child-settled']);
});

test('host bridge treats a non-completed child stop reason as a node failure', async () => {
  const subagents = fakeSubagents({ result: { output: [], stopReason: 'refusal' } });
  const roles = new RoleRegistry({ roles: BUILTIN_ROLES });
  const models = new ModelDirectory({
    connections: [{ id: 'lab', protocol: 'openai-chat', baseUrl: 'http://127.0.0.1:9000/v1', models: [{ id: 'coder' }] }],
  });
  const executor = new SubagentTaskExecutor({ subagents, roles, modelDirectory: models });
  await assert.rejects(() => executor.execute({
    run: { id: 'run-2' },
    node: { id: 'n2', title: 'Refuse', responsibility: 'refuse', roleId: 'worker', skills: [], tools: [], inputs: [], outputs: [], acceptance: [], dependencies: [] },
    parent: { id: 'parent-agent' },
  }), (error) => error.code === 'child-stop');
});

test('host bridge rejects tools when the role allowlist is empty', async () => {
  const subagents = fakeSubagents();
  const roles = new RoleRegistry({ roles: {
    locked: {
      id: 'locked',
      description: 'No host tools',
      tools: [],
      workspace: { write: false, paths: [] },
      input: [],
      output: [],
      acceptance: [],
      skills: [],
      modelDefaults: {},
      delegation: { allowed: false, maxDepth: 0 },
    },
  } });
  const executor = new SubagentTaskExecutor({ subagents, roles });
  await assert.rejects(() => executor.execute({
    run: { id: 'run-locked' },
    node: { id: 'n-locked', title: 'Locked', responsibility: 'no tools', roleId: 'locked', skills: [], tools: ['read'], inputs: [], outputs: [], acceptance: [], dependencies: [] },
    parent: { id: 'parent-agent' },
  }), (error) => error.code === 'role-tool-widening');
  assert.equal(subagents.requests.length, 0);
});

test('runtime host execution records child events and forwards cancellation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-host-runtime-'));
  try {
    const runtime = new DynamicMultiagentRuntime({
      dataDir: dir,
      config: {
        version: 1,
        connections: [{ id: 'lab', protocol: 'openai-chat', baseUrl: 'http://127.0.0.1:9000/v1', models: [{ id: 'coder' }] }],
        modelProfiles: [{ ref: 'lab:coder', capabilities: ['coding'] }],
        defaults: { leader: 'lab:coder' },
      },
    });
    await runtime.initialize();
    const run = await runtime.startRun({ task: 'host execute' });
    await runtime.submitPlan(run.id, {
      mode: 'dependency-graph',
      summary: 'one node',
      rationale: 'host bridge',
      nodes: [{ id: 'n1', responsibility: 'do work', roleId: 'worker', model: 'lab:coder', outputs: ['result'], acceptance: ['done'] }],
    });
    const subagents = fakeSubagents();
    const finished = await runtime.executeWithHost(run.id, { ctx: { subagents }, parent: { id: 'parent-agent' } });
    assert.equal(finished.status, 'reviewing');
    const stored = await runtime.runStore.get(run.id);
    assert.ok(stored.events.some((event) => event.type === 'child-start'));
    assert.ok(stored.events.some((event) => event.type === 'child-settled'));
    assert.ok(stored.events.some((event) => event.type === 'node-completed'));
    assert.equal(subagents.events.filter((event) => event.type === 'disposed').length, 1);
    await runtime.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('runtime.cancel aborts an active host child and reaches a cancelled checkpoint', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-host-cancel-'));
  try {
    const runtime = new DynamicMultiagentRuntime({
      dataDir: dir,
      config: {
        version: 1,
        connections: [{ id: 'lab', protocol: 'openai-chat', baseUrl: 'http://127.0.0.1:9000/v1', models: [{ id: 'coder' }] }],
        modelProfiles: [{ ref: 'lab:coder', capabilities: ['coding'] }],
        defaults: { leader: 'lab:coder' },
      },
    });
    await runtime.initialize();
    const run = await runtime.startRun({ task: 'cancel host child' });
    await runtime.submitPlan(run.id, {
      mode: 'dependency-graph',
      summary: 'one node',
      rationale: 'cancellation',
      nodes: [{ id: 'n1', responsibility: 'wait', roleId: 'worker', model: 'lab:coder', outputs: ['result'], acceptance: ['stopped'] }],
    });
    let request;
    const subagents = {
      getProvider(name) { return { name, capabilities: { depthLimit: true, toolFilter: true, persona: true } }; },
      async start(_name, next) {
        request = next;
        return {
          id: 'slow-child',
          result: new Promise((resolve) => next.signal.addEventListener('abort', () => resolve({ output: [], stopReason: 'aborted' }), { once: true })),
          async dispose() {},
        };
      },
    };
    const execution = runtime.executeWithHost(run.id, { ctx: { subagents }, parent: { id: 'parent-agent' } });
    while (!request) await new Promise((resolve) => setTimeout(resolve, 0));
    await runtime.cancel(run.id, 'operator-stop');
    const finished = await execution;
    assert.equal(request.signal.aborted, true);
    assert.equal(finished.status, 'cancelled');
    const stored = await runtime.runStore.get(run.id);
    assert.equal(stored.checkpoint, 'cancelled');
    assert.ok(stored.events.some((event) => event.type === 'run-cancelled'));
    await runtime.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

