import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply, name } from '../src/index.js';

test('Cordis plugin exposes a runtime, prompt section, and orchestration tools', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-plugin-'));
  const tools = [];
  const sections = [];
  const disposers = [];
  const ctx = {
    logger: { error() {}, warn() {} },
    provide(key, value) { assert.equal(key, 'dynamicMultiagent'); assert.ok(value); return () => {}; },
    systemPrompt: { section(value) { sections.push(value); return () => {}; } },
    tools: { register(tool) { tools.push(tool); return () => {}; } },
    effect(fn) { disposers.push(fn); },
  };
  const runtime = apply(ctx, { dataDir, exposeTools: true });
  await runtime.initialize();
  assert.equal(name, 'dsh-dynamic-multiagent');
  assert.ok(ctx.dynamicMultiagent === runtime);
  assert.equal(sections.length, 1);
  assert.deepEqual(tools.map((tool) => tool.name), [
    'dynamic_multiagent_start',
    'dynamic_multiagent_plan',
    'dynamic_multiagent_execute',
    'dynamic_multiagent_status',
    'dynamic_multiagent_derive_role',
    'dynamic_multiagent_cancel',
  ]);
  for (const tool of tools) {
    assert.equal(typeof tool.output?.render, 'function', `${tool.name} must expose output.render`);
    assert.deepEqual(tool.output.render({}, { ok: true }), [{ type: 'text', text: '{\n  "ok": true\n}' }]);
  }
  await runtime.close();
  await rm(dataDir, { recursive: true, force: true });
});

