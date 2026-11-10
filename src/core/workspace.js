import { cp, mkdir, readFile, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DynamicMultiagentError, errorMessage } from './errors.js';
import { assertSafeRelativePath, sha256, cloneJson, makeId, nowIso } from './validation.js';

const execFileAsync = promisify(execFile);

export class WorkspaceManager {
  constructor({ dataDir, logger = console } = {}) {
    this.dataDir = resolve(dataDir ?? join(process.cwd(), '.dsh-workspaces'));
    this.logger = logger;
  }

  async captureBaseline(projectRoot) {
    const root = resolve(projectRoot);
    const tree = await snapshotTree(root);
    const git = await gitMetadata(root);
    const specialCases = await inspectProjectShape(root);
    if (specialCases.unsupported.length) {
      throw new DynamicMultiagentError('workspace-unsupported', `Project shape requires explicit handling: ${specialCases.unsupported.join(', ')}`, { details: specialCases });
    }
    return { root, capturedAt: nowIso(), tree, git, specialCases };
  }

  async createPrivateWorkspace(baseline, { runId = makeId('run') } = {}) {
    const base = resolve(this.dataDir, runId);
    const repo = join(base, 'repo');
    const integration = join(base, 'integration');
    await mkdir(base, { recursive: true });
    if (baseline.specialCases?.excluded?.length) {
      this.logger.warn?.(`dynamic-multiagent: excluded resources from private workspace: ${baseline.specialCases.excluded.join(', ')}`);
    }
    await copyProject(baseline.root, repo);
    await initGit(repo, 'baseline');
    await execGit(repo, ['worktree', 'add', '--detach', integration, 'baseline']);
    return {
      id: runId,
      projectRoot: baseline.root,
      baseline,
      privateRepo: repo,
      integration,
      agents: [],
      createdAt: nowIso(),
    };
  }

  async createAgentWorktree(record, agentId) {
    const safeId = agentId.replace(/[^A-Za-z0-9._-]/g, '-');
    const path = join(dirname(record.privateRepo), `agent-${safeId}-${Date.now().toString(36)}`);
    await mkdir(dirname(path), { recursive: true });
    try {
      await execGit(record.privateRepo, ['worktree', 'add', '--detach', path, 'baseline']);
    } catch (error) {
      throw new DynamicMultiagentError('worktree-create-failed', `Cannot create worktree for ${agentId}: ${errorMessage(error)}`, { cause: error });
    }
    record.agents.push({ agentId, path, createdAt: nowIso() });
    return path;
  }

  async integrateAgent(record, agentId) {
    const agent = record.agents.find((item) => item.agentId === agentId);
    if (!agent) throw new DynamicMultiagentError('worktree-not-found', `No worktree is registered for ${agentId}`);
    const status = await execGit(agent.path, ['status', '--porcelain']);
    if (!status.trim()) return { changed: false, commit: await gitHead(agent.path) };
    await execGit(agent.path, ['add', '-A']);
    await execGit(agent.path, ['commit', '-m', `Agent ${agentId}`]);
    const commit = await gitHead(agent.path);
    await execGit(record.integration, ['merge', '--no-ff', '--no-edit', commit]);
    return { changed: true, commit };
  }

  async writeBack(record, { operationId = makeId('writeback') } = {}) {
    const targetTree = await snapshotTree(record.integration);
    const currentTree = await snapshotTree(record.projectRoot);
    const baselineTree = record.baseline.tree;
    const paths = new Set([...Object.keys(baselineTree), ...Object.keys(currentTree), ...Object.keys(targetTree)]);
    const journal = { operationId, startedAt: nowIso(), files: [], conflicts: [], completed: false };
    for (const path of [...paths].sort()) {
      const baseline = baselineTree[path]?.hash;
      const current = currentTree[path]?.hash;
      const target = targetTree[path]?.hash;
      if (current === target) continue;
      if (current !== baseline && target !== baseline) {
        journal.conflicts.push({ path, baseline, current, target, reason: 'user-and-task-both-changed' });
        continue;
      }
      if (target === baseline) continue;
      const relativePath = assertSafeRelativePath(path, 'writeback path');
      const destination = join(record.projectRoot, relativePath.split('/').join(sep));
      const source = join(record.integration, relativePath.split('/').join(sep));
      const targetEntry = targetTree[path];
      if (targetEntry === undefined) {
        try { await unlink(destination); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
        journal.files.push({ path, action: 'delete' });
      } else {
        await mkdir(dirname(destination), { recursive: true });
        await cp(source, destination, { force: true });
        journal.files.push({ path, action: 'write', hash: target });
      }
    }
    journal.completed = journal.conflicts.length === 0;
    journal.finishedAt = nowIso();
    return journal;
  }

  async dispose(record) {
    for (const agent of record.agents ?? []) {
      try { await execGit(record.privateRepo, ['worktree', 'remove', '--force', agent.path]); } catch (error) { this.logger.warn?.(`dynamic-multiagent: worktree cleanup failed for ${agent.agentId}: ${errorMessage(error)}`); }
    }
  }
}

async function copyProject(source, target) {
  await mkdir(target, { recursive: true });
  await cp(source, target, {
    recursive: true,
    force: true,
    filter: (sourcePath) => {
      const name = sourcePath.split(sep).pop();
      return name !== '.git' && name !== '.dsh-workspaces' && name !== 'node_modules';
    },
  });
}

async function inspectProjectShape(root) {
  const unsupported = [];
  const excluded = [];
  try {
    const nodeModules = await stat(join(root, 'node_modules'));
    if (nodeModules.isDirectory()) excluded.push('node_modules');
  } catch { /* absent */ }
  try {
    const gitmodules = await readFile(join(root, '.gitmodules'), 'utf8');
    if (gitmodules.trim()) unsupported.push('git-submodules');
  } catch { /* absent */ }
  try {
    const attributes = await readFile(join(root, '.gitattributes'), 'utf8');
    if (/filter=lfs/.test(attributes)) unsupported.push('git-lfs');
  } catch { /* absent */ }
  const visit = async (directory, depth) => {
    if (depth > 5) return;
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name === '.git' && directory !== root) {
        unsupported.push(`nested-git:${relative(root, directory).split(sep).join('/')}`);
        continue;
      }
      if (entry.isSymbolicLink()) {
        unsupported.push(`symlink:${relative(root, join(directory, entry.name)).split(sep).join('/')}`);
        continue;
      }
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.dsh-workspaces') await visit(join(directory, entry.name), depth + 1);
    }
  };
  await visit(root, 0);
  return { excluded, unsupported: [...new Set(unsupported)] };
}

async function initGit(directory, message) {
  await execGit(directory, ['init', '--initial-branch=baseline']);
  await execGit(directory, ['config', 'core.autocrlf', 'false']);
  // The private repository commits and merges on its own; never depend on a global git identity.
  await execGit(directory, ['config', 'user.name', 'dsh-dynamic-multiagent']);
  await execGit(directory, ['config', 'user.email', 'dsh@localhost']);
  await execGit(directory, ['add', '-A']);
  await execGit(directory, ['commit', '--allow-empty', '-m', message]);
}

async function gitMetadata(directory) {
  try {
    const [head, branch, status] = await Promise.all([
      gitHead(directory),
      execGit(directory, ['branch', '--show-current']),
      execGit(directory, ['status', '--porcelain=v2', '-z']),
    ]);
    return { present: true, head, branch: branch.trim(), status: status.replaceAll('\0', '\n') };
  } catch {
    return { present: false };
  }
}

async function gitHead(directory) {
  return (await execGit(directory, ['rev-parse', 'HEAD'])).trim();
}

async function execGit(directory, args) {
  try {
    const result = await execFileAsync('git', args, { cwd: directory, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
    return result.stdout;
  } catch (error) {
    throw new DynamicMultiagentError('git-command-failed', `git ${args.join(' ')} failed: ${errorMessage(error)}`, { cause: error });
  }
}

export async function snapshotTree(root) {
  const tree = {};
  const base = resolve(root);
  const visit = async (directory) => {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.dsh-workspaces') continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) {
        const relativePath = relative(base, absolute).split(sep).join('/');
        const content = await readFile(absolute);
        tree[relativePath] = { hash: sha256(content), size: content.length };
      }
    }
  };
  await visit(base);
  return tree;
}

