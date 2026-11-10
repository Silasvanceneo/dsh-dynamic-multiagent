import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DynamicMultiagentError } from './errors.js';
import { cloneJson, makeId, nowIso } from './validation.js';

export class RunStore {
  constructor(filePath, { maxRuns = 200 } = {}) {
    this.filePath = resolve(filePath);
    this.maxRuns = maxRuns;
    this.runs = new Map();
    this.loaded = false;
    this.writeChain = Promise.resolve();
  }

  async load() {
    if (this.loaded) return this.list();
    let data;
    try {
      data = JSON.parse(await readFile(this.filePath, 'utf8'));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw new DynamicMultiagentError('run-store-read-failed', `Cannot read run store ${this.filePath}`, { cause: error });
      data = { version: 1, runs: [] };
    }
    if (data.version !== 1 || !Array.isArray(data.runs)) throw new DynamicMultiagentError('run-store-corrupt', `Run store ${this.filePath} has an unsupported format`);
    this.runs = new Map(data.runs.filter((run) => run && typeof run.id === 'string').map((run) => [run.id, run]));
    this.loaded = true;
    return this.list();
  }

  async create(input) {
    await this.load();
    const id = input.id ?? makeId('run');
    if (this.runs.has(id)) throw new DynamicMultiagentError('run-duplicate', `Run "${id}" already exists`);
    const run = {
      id,
      sessionId: input.sessionId,
      task: input.task,
      status: input.status ?? 'analyzing',
      leader: cloneJson(input.leader),
      planVersion: input.planVersion ?? 0,
      plan: input.plan,
      graph: input.graph,
      roles: input.roles ?? [],
      promptAssemblies: input.promptAssemblies ?? [],
      skills: input.skills ?? [],
      workspace: input.workspace,
      effects: input.effects ?? { pending: [], committed: [] },
      results: input.results ?? [],
      events: input.events ?? [],
      errors: input.errors ?? [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
      checkpoint: 'created',
    };
    this.runs.set(id, run);
    await this.persist();
    return cloneJson(run);
  }

  async get(id) {
    await this.load();
    const run = this.runs.get(id);
    if (!run) throw new DynamicMultiagentError('run-not-found', `Run "${id}" is not persisted`);
    return cloneJson(run);
  }

  async update(id, mutator) {
    await this.load();
    const current = this.runs.get(id);
    if (!current) throw new DynamicMultiagentError('run-not-found', `Run "${id}" is not persisted`);
    const next = await mutator(cloneJson(current));
    if (!next || next.id !== id) throw new DynamicMultiagentError('run-update-invalid', `Run update for "${id}" must return the same run id`);
    next.updatedAt = nowIso();
    this.runs.set(id, next);
    await this.persist();
    return cloneJson(next);
  }

  async checkpoint(id, patch) {
    return this.update(id, (run) => ({ ...run, ...cloneJson(patch), checkpoint: patch.checkpoint ?? run.checkpoint }));
  }

  async appendEvent(id, event, { maxEvents = 2000 } = {}) {
    return this.update(id, (run) => {
      const entry = {
        ...cloneJson(event),
        eventId: event?.eventId ?? makeId('event'),
        recordedAt: event?.recordedAt ?? nowIso(),
      };
      const events = [...(run.events ?? []), entry];
      return { ...run, events: events.slice(-maxEvents), checkpoint: event?.checkpoint ?? run.checkpoint };
    });
  }

  async list({ statuses } = {}) {
    await this.loadIfNeeded();
    const accepted = statuses ? new Set(statuses) : undefined;
    return [...this.runs.values()]
      .filter((run) => !accepted || accepted.has(run.status))
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
      .map(cloneJson);
  }

  async resumable() {
    return this.list({ statuses: ['analyzing', 'planning', 'running', 'reviewing', 'replanning', 'awaiting_input', 'blocked', 'recovering', 'writing_back'] });
  }

  async beginEffect(id, effect) {
    return this.update(id, (run) => {
      const key = effect.key ?? makeId('effect');
      if (run.effects.committed.some((item) => item.key === key) || run.effects.pending.some((item) => item.key === key)) return run;
      run.effects.pending.push({ ...cloneJson(effect), key, startedAt: nowIso() });
      return run;
    });
  }

  async commitEffect(id, key, result) {
    return this.update(id, (run) => {
      const index = run.effects.pending.findIndex((item) => item.key === key);
      if (index < 0 && run.effects.committed.some((item) => item.key === key)) return run;
      const pending = index >= 0 ? run.effects.pending.splice(index, 1)[0] : { key };
      run.effects.committed.push({ ...pending, result: cloneJson(result), committedAt: nowIso() });
      return run;
    });
  }

  async persist() {
    this.writeChain = this.writeChain.then(async () => {
      const data = JSON.stringify({ version: 1, runs: [...this.runs.values()].slice(-this.maxRuns) }, null, 2);
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporary = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
      try {
        await writeFile(temporary, `${data}\n`, { encoding: 'utf8', mode: 0o600 });
        await rename(temporary, this.filePath);
      } catch (error) {
        throw new DynamicMultiagentError('run-store-write-failed', `Cannot persist run store ${this.filePath}`, { cause: error });
      }
    });
    return this.writeChain;
  }

  async loadIfNeeded() {
    if (!this.loaded) await this.load();
  }
}

