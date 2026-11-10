import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceManager } from '../src/core/workspace.js';

test('private workspace writeback preserves concurrent user edits and reports conflicts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-workspace-project-'));
  const data = await mkdtemp(join(tmpdir(), 'dsh-workspace-data-'));
  try {
    await writeFile(join(root, 'stable.txt'), 'base\n');
    await writeFile(join(root, 'conflict.txt'), 'base\n');
    const manager = new WorkspaceManager({ dataDir: data });
    const baseline = await manager.captureBaseline(root);
    const record = await manager.createPrivateWorkspace(baseline, { runId: 'test-run' });
    const agentPath = await manager.createAgentWorktree(record, 'worker');
    await writeFile(join(agentPath, 'stable.txt'), 'task\n');
    await writeFile(join(agentPath, 'conflict.txt'), 'task\n');
    await manager.integrateAgent(record, 'worker');
    await writeFile(join(root, 'conflict.txt'), 'user\n');
    const journal = await manager.writeBack(record);
    assert.deepEqual(await readFile(join(root, 'stable.txt'), 'utf8'), 'task\n');
    assert.deepEqual(await readFile(join(root, 'conflict.txt'), 'utf8'), 'user\n');
    assert.deepEqual(journal.conflicts.map((item) => item.path), ['conflict.txt']);
    await manager.dispose(record);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(data, { recursive: true, force: true });
  }
});

