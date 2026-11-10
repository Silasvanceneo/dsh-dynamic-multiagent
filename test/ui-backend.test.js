import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DynamicMultiagentRuntime } from '../src/core/runtime.js';
import { ModelDirectory } from '../src/core/model-router.js';
import { resolveRoleTools, BUILTIN_ROLES } from '../src/core/roles.js';
import { assembleChildPrompt } from '../src/core/prompt.js';
import { parseReviewVerdict } from '../src/core/subagent-bridge.js';
import { suggestThinking, anthropicThinkingParams } from '../src/core/thinking.js';
import { apply } from '../src/index.js';

const quiet = { warn() {}, error() {}, info() {} };

async function withRuntime(config, fn) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-ui-'));
  try {
    const runtime = new DynamicMultiagentRuntime({ dataDir: dir, logger: quiet, config: { version: 1, ...config } });
    await runtime.initialize();
    await fn(runtime, dir);
    await runtime.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('configured model profiles reach the router', async () => {
  await withRuntime({
    connections: [{ id: 'lab', protocol: 'openai-chat', baseUrl: 'http://127.0.0.1:1/v1', models: [{ id: 'coder', efforts: ['low', 'high'] }] }],
    modelProfiles: [{ ref: 'lab:coder', capabilities: ['coding', 'tool-calling'] }],
  }, async (runtime) => {
    const [model] = runtime.modelDirectory.list();
    assert.deepEqual(model.capabilities, ['coding', 'tool-calling']);
    assert.deepEqual(model.efforts, ['low', 'high']);
  });
});

test('effort routing: explicit, role default, unsupported default dropped, unsupported explicit rejected', () => {
  const directory = new ModelDirectory({
    connections: [{ id: 'lab', protocol: 'anthropic-messages', baseUrl: 'http://127.0.0.1:1', models: [{ id: 'claude-opus-4-6', efforts: ['off', 'low', 'high', 'max'] }] }],
    defaults: { roles: { worker: 'lab:claude-opus-4-6' }, roleEfforts: { worker: 'high', 'code-reviewer': 'xhigh' } },
  });
  assert.equal(directory.assign({ roleId: 'worker', effort: 'max' }).effort, 'max');
  assert.equal(directory.assign({ roleId: 'worker' }).effort, 'high');
  const dropped = directory.assign({ roleId: 'code-reviewer', explicitRef: 'lab:claude-opus-4-6' });
  assert.equal(dropped.effort, undefined);
  assert.match(dropped.effortNote, /not offered/);
  assert.throws(() => directory.assign({ roleId: 'worker', effort: 'xhigh' }), (error) => error.code === 'effort-unsupported');
});

test('host catalog models carry efforts and nodes without models inherit the Leader', () => {
  const directory = new ModelDirectory({ modelProfiles: [{ ref: 'anthropic:claude-sonnet-4-6', capabilities: ['coding'] }] });
  directory.setHostCatalog([{ provider: 'anthropic', id: 'claude-sonnet-4-6', efforts: ['off', 'low', 'medium', 'high', 'max'] }]);
  const model = directory.get('anthropic:claude-sonnet-4-6');
  assert.equal(model.source, 'host');
  assert.deepEqual(model.route, { provider: 'anthropic', model: 'claude-sonnet-4-6' });
  assert.deepEqual(model.efforts, ['off', 'low', 'medium', 'high', 'max']);

  const empty = new ModelDirectory({});
  const inherited = empty.assign({ roleId: 'worker', inherit: { ref: 'openai:gpt', provider: 'openai', model: 'gpt' } });
  assert.equal(inherited.inherited, true);
  assert.equal(inherited.ref, 'openai:gpt');
});

test('session switch overrides the default and the global switch wins', async () => {
  await withRuntime({ enabled: true, sessionDefault: true }, async (runtime) => {
    assert.equal(runtime.isEnabledFor('s1'), true);
    await runtime.setSessionEnabled('s1', false);
    assert.equal(runtime.isEnabledFor('s1'), false);
    assert.equal(runtime.isEnabledFor('s2'), true);
    await runtime.setSessionEnabled('s1', null);
    assert.equal(runtime.sessionState('s1').override, null);
    await runtime.setGlobalEnabled(false);
    assert.equal(runtime.isEnabledFor('s2'), false);
  });
});

test('config writes are revision-fenced and keep redacted header values', async () => {
  await withRuntime({
    connections: [{ id: 'lab', protocol: 'openai-chat', baseUrl: 'http://127.0.0.1:1/v1', headers: { 'x-team': 'a' }, models: [{ id: 'coder' }] }],
  }, async (runtime) => {
    const read = await runtime.readConfig();
    const saved = await runtime.writeConfig({ ...read, sessionDefault: false }, { expectedRevision: read.revision });
    assert.equal(saved.revision, read.revision + 1);
    assert.equal(saved.sessionDefault, false);
    await assert.rejects(() => runtime.writeConfig(read, { expectedRevision: read.revision }), (error) => error.code === 'config-conflict');
  });
});

test('role capabilities expand to real dsh tool names', () => {
  assert.deepEqual(resolveRoleTools(BUILTIN_ROLES['code-reviewer']).sort(), ['glob', 'grep', 'read', 'read_image', 'skill']);
  assert.ok(resolveRoleTools(BUILTIN_ROLES.worker).includes('edit'));
  assert.ok(!resolveRoleTools(BUILTIN_ROLES.explore).includes('write'));
});

test('child prompts carry the contract and the right output format', () => {
  const worker = assembleChildPrompt({ role: BUILTIN_ROLES.worker, node: { id: 'n', title: 'T', responsibility: 'do x', acceptance: ['y'] }, runId: 'r', tools: ['read', 'edit'], writeScope: ['src'] });
  assert.match(worker, /only under: src/);
  assert.match(worker, /### Changed files/);
  assert.doesNotMatch(worker, /Leader of this conversation/);
  const review = assembleChildPrompt({ role: BUILTIN_ROLES['code-reviewer'], node: { id: 'r', responsibility: 'check x' }, runId: 'r' });
  assert.match(review, /"passed": true\|false/);
  assert.match(review, /Read-only/);
  assert.deepEqual(parseReviewVerdict('ok\n```json\n{"passed": false, "defects": [{"issue": "x"}], "retry": true}\n```'), { passed: false, defects: [{ issue: 'x' }], retry: true });
});

test('thinking suggestions follow the Claude generations', () => {
  assert.equal(suggestThinking('anthropic-messages', 'claude-opus-4-5').thinking, 'budget');
  assert.equal(suggestThinking('anthropic-messages', 'claude-opus-4-6').thinking, 'adaptive');
  assert.deepEqual(suggestThinking('anthropic-messages', 'claude-fable-5-1').efforts, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.deepEqual(anthropicThinkingParams('adaptive', 'high'), { thinking: { type: 'adaptive', display: 'summarized' }, output_config: { effort: 'high' } });
  assert.deepEqual(anthropicThinkingParams('budget', 'off'), { thinking: { type: 'disabled' } });
});

test('Leader section and tools follow the per-session switch', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-gate-'));
  const sections = [];
  const guards = [];
  const restricts = [];
  const listeners = {};
  const ctx = {
    logger: quiet,
    provide() { return () => {}; },
    on(name, fn) { (listeners[name] ??= []).push(fn); return () => {}; },
    systemPrompt: { section(value) { sections.push(value); return () => {}; } },
    tools: { register() { return () => {}; }, guard(fn) { guards.push(fn); return () => {}; } },
    effect() {},
  };
  const runtime = apply(ctx, { dataDir });
  await runtime.initialize();
  const agent = (id, origin) => ({ id, session: { header: { id, ...(origin ? { origin } : {}) } }, ctx: { tools: { restrict(filter) { restricts.push({ id, filter }); return () => {}; } } } });
  const section = sections[0];
  assert.match(section.text({ agent: agent('on') }), /Leader of this conversation/);
  await runtime.setSessionEnabled('off', false);
  assert.equal(section.text({ agent: agent('off') }), '');
  assert.equal(section.text({ agent: agent('child', 'subagent') }), '');
  for (const listener of listeners['agent/created']) listener({ agent: agent('off') });
  assert.equal(restricts[0].id, 'off');
  assert.match(guards[0]({ name: 'dynamic_multiagent_start', agent: agent('off') }), /switched off/);
  assert.equal(guards[0]({ name: 'dynamic_multiagent_start', agent: agent('on') }), undefined);
  await runtime.close();
  await rm(dataDir, { recursive: true, force: true });
});
