import { cp, mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DynamicMultiagentError, errorMessage } from './errors.js';
import { assertArray, assertRecord, assertString, sha256, nowIso } from './validation.js';

const execFileAsync = promisify(execFile);

export class SkillRegistry {
  constructor({ managedRoot, localRoots = [], gitRepos = [], autoInstall = false, logger = console } = {}) {
    this.managedRoot = resolve(managedRoot ?? join(process.cwd(), '.dsh-skills'));
    this.localRoots = localRoots.map((root) => resolve(root));
    this.gitRepos = gitRepos.map((repo) => ({ ...repo }));
    this.autoInstall = Boolean(autoInstall);
    this.logger = logger;
    this.skills = new Map();
  }

  register(skill) {
    const normalized = normalizeSkill(skill);
    this.skills.set(normalized.id, normalized);
    return cloneSkill(normalized);
  }

  get(id) {
    const skill = this.skills.get(id);
    if (!skill) throw new DynamicMultiagentError('skill-not-found', `Skill "${id}" is not registered`);
    return cloneSkill(skill);
  }

  list() {
    return [...this.skills.values()].map(cloneSkill).sort((left, right) => left.id.localeCompare(right.id));
  }

  async discover() {
    for (const root of this.localRoots) {
      const entries = await walkSkillFiles(root);
      for (const file of entries) {
        try { this.register(await readSkill(file, { source: 'local', sourceRef: root })); }
        catch (error) { this.logger.warn?.(`dynamic-multiagent: ignored skill ${file}: ${errorMessage(error)}`); }
      }
    }
    return this.list();
  }

  async importLocal(sourceDir, { id, version = 'local', copy = true } = {}) {
    const source = resolve(sourceDir);
    const sourceSkill = await findSkillFile(source);
    if (!sourceSkill) throw new DynamicMultiagentError('skill-invalid', `No SKILL.md found below ${source}`);
    const targetId = id ?? basename(source);
    const target = resolve(this.managedRoot, targetId);
    await mkdir(this.managedRoot, { recursive: true });
    if (copy) await cp(source, target, { recursive: true, force: true });
    const registered = await readSkill(copy ? join(target, 'SKILL.md') : sourceSkill, { source: 'local-import', sourceRef: source, id: targetId, version });
    return this.register(registered);
  }

  async importGit(url, { revision, id, version } = {}) {
    assertString(url, 'skill git URL');
    const targetId = id ?? basename(url.replace(/\/+$/, '').replace(/\.git$/, ''));
    const target = resolve(this.managedRoot, targetId);
    await mkdir(this.managedRoot, { recursive: true });
    try {
      await execFileAsync('git', ['clone', '--depth', '1', ...(revision ? ['--branch', revision] : []), url, target], { windowsHide: true });
    } catch (error) {
      throw new DynamicMultiagentError('skill-install-failed', `Cannot clone skill ${url}: ${errorMessage(error)}`, { cause: error, retriable: true });
    }
    const file = await findSkillFile(target);
    if (!file) throw new DynamicMultiagentError('skill-invalid', `Git skill ${url} did not contain SKILL.md`);
    const commit = await gitRevision(target);
    return this.register(await readSkill(file, { source: 'git', sourceRef: url, id: targetId, version: version ?? commit }));
  }

  async ensure(id, { install = this.autoInstall } = {}) {
    if (this.skills.has(id)) return this.get(id);
    await this.discover();
    if (this.skills.has(id)) return this.get(id);
    if (!install) throw new DynamicMultiagentError('skill-not-found', `Skill "${id}" is not available and automatic installation is disabled`);
    const candidate = this.gitRepos.find((repo) => repo.id === id || repo.name === id);
    if (!candidate?.url) throw new DynamicMultiagentError('skill-not-found', `No configured source can install skill "${id}"`);
    return this.importGit(candidate.url, { revision: candidate.revision, id, version: candidate.version });
  }

  async load(id) {
    const skill = this.get(id);
    return readFile(skill.path, 'utf8');
  }
}

function normalizeSkill(input) {
  const value = assertRecord(input, 'skill');
  const id = assertString(value.id, 'skill.id');
  return {
    id,
    version: assertString(value.version ?? 'unversioned', `skill(${id}).version`),
    source: assertString(value.source ?? 'unknown', `skill(${id}).source`),
    sourceRef: assertString(value.sourceRef ?? value.path ?? id, `skill(${id}).sourceRef`),
    path: resolve(assertString(value.path, `skill(${id}).path`)),
    summary: value.summary === undefined ? undefined : assertString(value.summary, `skill(${id}).summary`, { nonEmpty: false }),
    contentHash: assertString(value.contentHash, `skill(${id}).contentHash`),
    dependencies: assertArray(value.dependencies ?? [], `skill(${id}).dependencies`).map((dependency) => assertString(dependency, `skill(${id}).dependencies[]`)),
    loadedAt: value.loadedAt ?? nowIso(),
  };
}

async function readSkill(file, { source, sourceRef, id, version } = {}) {
  const content = await readFile(file, 'utf8');
  const metadata = parseFrontmatter(content);
  return normalizeSkill({
    id: id ?? metadata.name ?? basename(resolve(file, '..')),
    version: version ?? metadata.version ?? 'unversioned',
    source,
    sourceRef,
    path: file,
    summary: metadata.description ?? firstParagraph(content),
    contentHash: sha256(content),
    dependencies: metadata.dependencies ? metadata.dependencies.split(',').map((item) => item.trim()).filter(Boolean) : [],
  });
}

function parseFrontmatter(content) {
  if (!content.startsWith('---')) return {};
  const end = content.indexOf('\n---', 3);
  if (end < 0) return {};
  const metadata = {};
  for (const line of content.slice(3, end).split(/\r?\n/)) {
    const match = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line.trim());
    if (match) metadata[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return metadata;
}

function firstParagraph(content) {
  const text = content.replace(/^---[\s\S]*?---\s*/m, '').trim();
  const paragraph = text.split(/\n\s*\n/)[0] ?? '';
  return paragraph.replace(/^#+\s*/, '').slice(0, 240);
}

async function findSkillFile(root) {
  const candidate = resolve(root);
  try {
    const info = await stat(candidate);
    if (info.isFile() && basename(candidate).toUpperCase() === 'SKILL.MD') return candidate;
    if (info.isDirectory()) {
      const direct = join(candidate, 'SKILL.md');
      try { await stat(direct); return direct; } catch { /* continue */ }
      const nested = await walkSkillFiles(candidate);
      return nested[0];
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return undefined;
}

async function walkSkillFiles(root) {
  const files = [];
  const visit = async (directory, depth) => {
    if (depth > 6) return;
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path, depth + 1);
      else if (entry.isFile() && entry.name.toUpperCase() === 'SKILL.MD') files.push(path);
    }
  };
  await visit(resolve(root), 0);
  return files;
}

async function gitRevision(directory) {
  try {
    const result = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: directory, windowsHide: true });
    return result.stdout.trim();
  } catch {
    return 'unknown';
  }
}

function cloneSkill(skill) {
  return JSON.parse(JSON.stringify(skill));
}

