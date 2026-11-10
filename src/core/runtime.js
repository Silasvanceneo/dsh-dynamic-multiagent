import { join, resolve } from 'node:path';
import { ConfigStore, DEFAULT_CONFIG, redactConfig } from './config-store.js';
import { DynamicMultiagentError, asDynamicError } from './errors.js';
import { ModelDirectory } from './model-router.js';
import { assembleChildPrompt, assembleSystemPrompt, createPromptAssemblyRecord, LEADER_BASE_PROMPT, PROMPT_TEMPLATE_VERSION } from './prompt.js';
import { RoleRegistry, BUILTIN_ROLES, TASK_CATEGORIES, resolveRoleTools } from './roles.js';
import { SessionSwitchStore } from './session-switch.js';
import { suggestThinking } from './thinking.js';
import { SkillRegistry } from './skills.js';
import { TaskGraph, validatePlan } from './task-graph.js';
import { RunStore } from './run-store.js';
import { WorkspaceManager } from './workspace.js';
import { ProtocolConnectionManager } from './protocols.js';
import { SubagentTaskExecutor } from './subagent-bridge.js';
import { cloneJson, makeId, nowIso } from './validation.js';

export class DynamicMultiagentRuntime {
  constructor({
    dataDir,
    configPath,
    runStorePath,
    credentialResolver,
    fetchImpl,
    logger = console,
    config = DEFAULT_CONFIG,
  } = {}) {
    this.logger = logger;
    this.dataDir = resolve(dataDir ?? join(process.cwd(), '.dsh-dynamic-multiagent'));
    this.configStore = new ConfigStore(configPath ?? join(this.dataDir, 'config.json'), { initial: config });
    this.runStore = new RunStore(runStorePath ?? join(this.dataDir, 'runs.json'), { maxRuns: config.retention?.maxRuns ?? 200 });
    this.modelDirectory = new ModelDirectory(config);
    this.roles = new RoleRegistry({ roles: BUILTIN_ROLES, availableSkills: [], knownTools: [] });
    this.skills = new SkillRegistry({
      managedRoot: join(this.dataDir, 'skills'),
      localRoots: config.skillSources?.localRoots ?? [],
      gitRepos: config.skillSources?.gitRepos ?? [],
      autoInstall: config.skillSources?.autoInstall ?? false,
      logger,
    });
    this.connections = new ProtocolConnectionManager({ connections: config.connections ?? [], credentialResolver, fetchImpl, logger });
    this.workspace = new WorkspaceManager({ dataDir: join(this.dataDir, 'workspaces'), logger });
    this.sessionSwitches = new SessionSwitchStore(join(this.dataDir, 'sessions.json'));
    this.activeRuns = new Map();
    this.closed = false;
    this.config = undefined;
    this.listeners = new Set();
    this.hostCatalogSource = undefined;
    this.knownTools = undefined;
  }

  async initialize() {
    const config = await this.configStore.load();
    this.config = config;
    this.modelDirectory.set(config);
    this.connections.setConnections(config.connections);
    await this.sessionSwitches.load();
    this.skills.localRoots = config.skillSources.localRoots.map(resolve);
    this.skills.gitRepos = config.skillSources.gitRepos.map((repo) => ({ ...repo }));
    this.skills.autoInstall = config.skillSources.autoInstall;
    await this.skills.discover();
    this.roles.updateSkills(this.skills.list().map((skill) => skill.id));
    await this.runStore.load();
    return this.snapshot();
  }

  snapshot() {
    return {
      dataDir: this.dataDir,
      enabled: this.config?.enabled ?? true,
      models: this.modelDirectory.list(),
      roles: this.roles.list().map((role) => ({ ...role, hostTools: this.filterKnownTools(resolveRoleTools(role)) })),
      categories: cloneJson(TASK_CATEGORIES),
      skills: this.skills.list(),
      closed: this.closed,
    };
  }

  /** Compact catalog for the model: what it may put into a plan. */
  modelCatalog() {
    const defaults = this.modelDirectory.defaults;
    return {
      models: this.modelDirectory.list().filter((model) => model.available !== false).map((model) => ({
        ref: model.ref,
        ...(model.label ? { label: model.label } : {}),
        ...(model.capabilities.length ? { capabilities: model.capabilities } : {}),
        ...(model.efforts?.length ? { efforts: model.efforts } : {}),
      })),
      defaults: {
        ...(defaults.leader ? { leader: defaults.leader } : {}),
        roles: defaults.roles,
        categories: defaults.categories,
        roleEfforts: defaults.roleEfforts,
        categoryEfforts: defaults.categoryEfforts,
      },
      roles: this.roles.list().map((role) => ({ id: role.id, description: role.description, writes: Boolean(role.workspace?.write), tools: this.filterKnownTools(resolveRoleTools(role)) })),
      categories: Object.fromEntries(Object.entries(TASK_CATEGORIES).map(([id, value]) => [id, value.description])),
      skills: this.skills.list().map((skill) => ({ id: skill.id, ...(skill.summary ? { summary: skill.summary } : {}) })),
      modelNote: this.modelDirectory.list().length ? undefined : 'No models are configured: leave "model" empty and every child inherits your model.',
    };
  }

  filterKnownTools(tools) {
    return this.knownTools ? tools.filter((tool) => this.knownTools.has(tool)) : tools;
  }

  setKnownTools(names) {
    this.knownTools = names ? new Set(names) : undefined;
  }

  /** Install a function returning the host model catalog (used for effort validation and the UI). */
  setHostCatalogSource(source) {
    this.hostCatalogSource = source;
  }

  async refreshHostCatalog() {
    if (typeof this.hostCatalogSource !== 'function') return [];
    try {
      const catalog = await this.hostCatalogSource();
      this.modelDirectory.setHostCatalog(catalog.flatMap((provider) => provider.models.map((model) => ({ ...model, provider: provider.id }))));
      return catalog;
    } catch (error) {
      this.logger.warn?.(`dynamic-multiagent: host model catalog unavailable: ${error?.message ?? error}`);
      return [];
    }
  }

  async reloadConfig() {
    this.configStore.loaded = false;
    const config = await this.configStore.load();
    this.applyConfig(config);
    return this.snapshot();
  }

  applyConfig(config) {
    this.config = config;
    this.modelDirectory.set(config);
    this.connections.setConnections(config.connections);
    for (const listener of this.listeners) {
      try { listener(config); } catch (error) { this.logger.warn?.(`dynamic-multiagent: config listener failed: ${error?.message ?? error}`); }
    }
  }

  onConfigChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Whether orchestration is active for one conversation (global switch AND session switch). */
  isEnabledFor(sessionId) {
    if (this.config?.enabled === false) return false;
    if (sessionId === undefined) return this.config?.sessionDefault !== false;
    return this.sessionSwitches.override(sessionId) ?? this.config?.sessionDefault !== false;
  }

  sessionState(sessionId) {
    const override = sessionId === undefined ? undefined : this.sessionSwitches.override(sessionId);
    return {
      sessionId,
      globalEnabled: this.config?.enabled !== false,
      sessionDefault: this.config?.sessionDefault !== false,
      override: override ?? null,
      enabled: this.isEnabledFor(sessionId),
    };
  }

  async setSessionEnabled(sessionId, enabled) {
    if (typeof sessionId !== 'string' || !sessionId) throw new DynamicMultiagentError('session-required', 'A session id is required');
    await this.sessionSwitches.set(sessionId, enabled);
    return this.sessionState(sessionId);
  }

  /** Redacted configuration plus revision for the settings UI. */
  async readConfig() {
    const config = await this.configStore.load();
    return redactConfig(config);
  }

  async writeConfig(next, { expectedRevision } = {}) {
    const current = await this.configStore.load();
    // Header values that were redacted on the way out must survive a round trip unchanged.
    const restored = {
      ...next,
      connections: (next.connections ?? []).map((connection) => {
        const previous = current.connections.find((candidate) => candidate.id === connection.id);
        if (!previous || !connection.headers) return connection;
        const headers = { ...connection.headers };
        for (const [key, value] of Object.entries(headers)) if (value === '<redacted>' && previous.headers?.[key] !== undefined) headers[key] = previous.headers[key];
        return { ...connection, headers };
      }),
    };
    const saved = await this.configStore.save(restored, { expectedRevision });
    this.applyConfig(saved);
    return redactConfig(saved);
  }

  async setGlobalEnabled(enabled) {
    const current = await this.configStore.load();
    const saved = await this.configStore.save({ ...current, enabled: Boolean(enabled) });
    this.applyConfig(saved);
    return redactConfig(saved);
  }

  suggestThinking(protocol, modelId) {
    return suggestThinking(protocol, modelId);
  }

  /** Prompt previews for the UI (exactly what the Leader section and a child receive). */
  previewPrompts({ roleId = 'worker', categoryId = 'quick' } = {}) {
    const role = this.roles.get(roleId);
    const sample = {
      id: 'example',
      title: 'Example node',
      responsibility: '<the node responsibility written by the Leader>',
      inputs: ['<inputs listed in the plan>'],
      outputs: ['<expected outputs>'],
      acceptance: ['<acceptance criteria>'],
      writeScope: role.workspace?.write ? ['src/feature'] : undefined,
    };
    const child = assembleChildPrompt({
      role,
      node: sample,
      runId: 'run-preview',
      categoryId,
      categoryDescription: TASK_CATEGORIES[categoryId]?.description,
      tools: this.filterKnownTools(resolveRoleTools(role)),
      writeScope: sample.writeScope,
    });
    return {
      version: PROMPT_TEMPLATE_VERSION,
      leader: LEADER_BASE_PROMPT,
      child,
      leaderChars: LEADER_BASE_PROMPT.length,
      childChars: child.length,
    };
  }

  async listRuns({ sessionId, limit = 50 } = {}) {
    const runs = await this.runStore.list();
    return runs
      .filter((run) => sessionId === undefined || run.sessionId === sessionId)
      .slice(0, limit)
      .map((run) => summarizeRun(run));
  }

  ensureOpen() {
    if (this.closed) throw new DynamicMultiagentError('runtime-closed', 'Dynamic multi-agent runtime is closed');
  }

  async startRun({ task, sessionId, leaderModel, projectRoot, userConstraints = [], currentModel } = {}) {
    this.ensureOpen();
    if (typeof task !== 'string' || task.trim() === '') throw new DynamicMultiagentError('task-required', 'A non-empty task is required');
    const leader = this.modelDirectory.resolveLeader(leaderModel, { current: currentModel });
    const baseline = projectRoot ? await this.workspace.captureBaseline(projectRoot) : undefined;
    const workspace = baseline ? await this.workspace.createPrivateWorkspace(baseline) : undefined;
    const run = await this.runStore.create({
      sessionId,
      task,
      status: 'analyzing',
      leader,
      workspace,
      roles: [{ id: 'leader', version: '1.0.0', model: leader.ref }],
      checkpoint: 'leader-fixed',
    });
    if (userConstraints.length) await this.runStore.checkpoint(run.id, { userConstraints: [...userConstraints] });
    return this.runStore.get(run.id);
  }

  async submitPlan(runId, plan) {
    this.ensureOpen();
    const run = await this.runStore.get(runId);
    if (!run.leader?.ref) throw new DynamicMultiagentError('leader-missing', `Run "${runId}" has no fixed Leader`);
    await this.refreshHostCatalog();
    const options = { roleRegistry: this.roles, modelDirectory: this.modelDirectory, skillRegistry: this.skills, categoryIds: Object.keys(TASK_CATEGORIES) };
    const graphPlan = validatePlan(plan, options);
    const graph = new TaskGraph(graphPlan, options);
    const assignments = [];
    for (const node of graphPlan.nodes) {
      const role = node.roleId ? this.roles.get(node.roleId) : this.roles.get('worker');
      const assignment = this.modelDirectory.assign({
        roleId: role.id,
        categoryId: node.categoryId,
        explicitRef: node.model,
        effort: node.effort,
        // Category capabilities only rank profiled models; nodes never fail for lack of profiles.
        requirements: [],
        inherit: run.leader,
      });
      assignments.push({ nodeId: node.id, roleId: role.id, model: assignment });
    }
    return this.runStore.update(runId, (current) => ({
      ...current,
      status: 'planning',
      planVersion: graphPlan.planVersion,
      plan: graphPlan,
      graph: graph.snapshot(),
      assignments,
      checkpoint: 'plan-validated',
    }));
  }

  async deriveRole(runId, definition) {
    this.ensureOpen();
    if (definition?.modelAssignment !== undefined) this.modelDirectory.get(definition.modelAssignment);
    const derived = this.roles.derive(definition);
    await this.runStore.update(runId, (run) => ({
      ...run,
      roles: [...(run.roles ?? []), { id: derived.id, baseRole: derived.baseRole, version: derived.version, definition: derived }],
      checkpoint: 'role-derived',
    }));
    return derived;
  }

  assemblePrompt({ roleId = 'leader', stage = 'conversation', modelRef, task, specializedDefinition, skillIds = [], contextRefs = [] } = {}) {
    const skillSummaries = skillIds.map((id) => this.skills.get(id));
    const prompt = assembleSystemPrompt({ roleId, stage, modelRef, task, specializedDefinition, skillSummaries, contextRefs });
    const record = createPromptAssemblyRecord({
      agentId: roleId,
      roleId,
      stage,
      modules: ['leader-base', `stage:${stage}`, ...(specializedDefinition ? ['specialized-role'] : []), ...(skillIds.length ? ['skill-summary'] : [])],
      definitionVersion: specializedDefinition?.version,
      taskId: task?.id,
    });
    return { prompt, record };
  }

  async execute(runId, { executeNode, reviewNode, signal } = {}) {
    this.ensureOpen();
    if (typeof executeNode !== 'function') throw new DynamicMultiagentError('executor-required', 'executeNode callback is required');
    const run = await this.runStore.get(runId);
    if (!run.plan || !run.graph) throw new DynamicMultiagentError('plan-required', `Run "${runId}" has no validated plan`);
    const graph = new TaskGraph(run.plan, { roleRegistry: this.roles, modelDirectory: this.modelDirectory, skillRegistry: this.skills });
    restoreGraph(graph, run.graph);
    const controller = new AbortController();
    const detachSignal = linkAbortSignal(signal, controller);
    this.activeRuns.set(runId, controller);
    try {
      await this.runStore.checkpoint(runId, { status: 'running', graph: graph.snapshot(), checkpoint: 'execution-started' });
      await this.recordEvent(runId, { type: 'run-start', checkpoint: 'execution-started' });
      let recordedResults = [...(run.results ?? [])];
      while (!graph.isComplete()) {
        if (controller.signal.aborted) {
          graph.cancel(controller.signal.reason ?? 'user-cancelled');
          await this.recordEvent(runId, { type: 'run-cancelled', reason: String(controller.signal.reason ?? 'user-cancelled'), checkpoint: 'cancelled' });
          await this.runStore.checkpoint(runId, { status: 'cancelled', graph: graph.snapshot(), checkpoint: 'cancelled' });
          return this.runStore.get(runId);
        }
        const ready = graph.ready();
        if (!ready.length) {
          if (graph.isComplete()) break;
          const active = [...graph.nodes.values()].some((node) => node.status === 'running' || node.status === 'reviewing');
          if (!active) {
            await this.runStore.checkpoint(runId, { status: 'blocked', graph: graph.snapshot(), checkpoint: 'no-progress' });
            await this.recordEvent(runId, { type: 'run-blocked', checkpoint: 'no-progress' });
            throw new DynamicMultiagentError('graph-no-progress', `Run "${runId}" has no runnable node`);
          }
          await delay(0);
          continue;
        }
        const results = await Promise.all(ready.map(async (candidate) => {
          const started = graph.start(candidate.id);
          await this.runStore.checkpoint(runId, { graph: graph.snapshot(), checkpoint: `node:${candidate.id}:started` });
          await this.recordEvent(runId, { type: 'node-start', nodeId: candidate.id, checkpoint: `node:${candidate.id}:started` });
          try {
            const result = await executeNode({ run: await this.runStore.get(runId), node: started, signal: controller.signal, recordEvent: (event) => this.recordEvent(runId, { ...event, nodeId: candidate.id }) });
            if (reviewNode) {
              graph.beginReview(candidate.id);
              await this.recordEvent(runId, { type: 'node-review-start', nodeId: candidate.id });
              const review = await reviewNode({ run: await this.runStore.get(runId), node: started, result, signal: controller.signal, recordEvent: (event) => this.recordEvent(runId, { ...event, nodeId: candidate.id }) });
              if (review?.passed === false) {
                graph.fail(candidate.id, { code: 'review-failed', review }, { retry: Boolean(review.retry) });
                await this.recordEvent(runId, { type: 'node-review-failed', nodeId: candidate.id, review });
                return { nodeId: candidate.id, review };
              }
              graph.complete(candidate.id, result, { review, evidence: review?.evidence ?? [] });
              await this.recordEvent(runId, { type: 'node-review-passed', nodeId: candidate.id, review });
              return { nodeId: candidate.id, result, review };
            }
            if (result?.review?.passed === false) {
              // A reviewer node rejected the work: the defect lives upstream, so the Leader re-plans.
              graph.fail(candidate.id, { code: 'review-failed', review: result.review, text: result.text });
              await this.recordEvent(runId, { type: 'node-review-failed', nodeId: candidate.id, review: result.review });
              return { nodeId: candidate.id, result, review: result.review };
            }
            graph.complete(candidate.id, result, { evidence: result?.evidence ?? [], ...(result?.review ? { review: result.review } : {}) });
            await this.recordEvent(runId, { type: 'node-completed', nodeId: candidate.id, result: summarizeEventResult(result) });
            return { nodeId: candidate.id, result };
          } catch (error) {
            const normalized = asDynamicError(error, 'node-execution-failed');
            graph.fail(candidate.id, { code: normalized.code, message: normalized.message, details: normalized.details });
            await this.recordEvent(runId, { type: controller.signal.aborted ? 'node-cancelled' : 'node-failed', nodeId: candidate.id, error: { code: normalized.code, message: normalized.message } });
            return { nodeId: candidate.id, error: normalized };
          }
        }));
        recordedResults = [...recordedResults, ...results.map((result) => ({ ...result, recordedAt: nowIso() }))];
        await this.runStore.checkpoint(runId, {
          graph: graph.snapshot(),
          results: recordedResults,
          checkpoint: 'execution-checkpoint',
        });
        await this.recordEvent(runId, { type: 'execution-checkpoint', checkpoint: 'execution-checkpoint', nodeIds: results.map((item) => item.nodeId) });
      }
      if (controller.signal.aborted) {
        graph.cancel(controller.signal.reason ?? 'user-cancelled');
        await this.recordEvent(runId, { type: 'run-cancelled', reason: String(controller.signal.reason ?? 'user-cancelled'), checkpoint: 'cancelled' });
        return this.runStore.checkpoint(runId, { status: 'cancelled', graph: graph.snapshot(), checkpoint: 'cancelled' });
      }
      const finalStatus = graph.hasFailure() ? 'blocked' : 'reviewing';
      await this.recordEvent(runId, { type: 'run-awaiting-gate', status: finalStatus, checkpoint: finalStatus === 'reviewing' ? 'awaiting-gate' : 'failed' });
      return this.runStore.checkpoint(runId, { status: finalStatus, graph: graph.snapshot(), checkpoint: finalStatus === 'reviewing' ? 'awaiting-gate' : 'failed' });
    } finally {
      detachSignal();
      if (this.activeRuns.get(runId) === controller) this.activeRuns.delete(runId);
    }
  }

  async executeWithHost(runId, { ctx, providerName = 'spawn', modelProviderMap, parent, exec, reviewNode, signal } = {}) {
    this.ensureOpen();
    const subagents = ctx?.subagents ?? ctx?.get?.('subagents');
    const executor = new SubagentTaskExecutor({
      subagents,
      roles: this.roles,
      skills: this.skills,
      modelDirectory: this.modelDirectory,
      providerName,
      modelProviderMap,
      parent,
      parentResolver: ({ exec: currentExec }) => currentExec?.agent ?? exec?.agent,
      knownTools: this.knownTools ? [...this.knownTools] : undefined,
      logger: this.logger,
    });
    return this.execute(runId, {
      signal,
      reviewNode,
      executeNode: ({ run: currentRun, node, signal: currentSignal, recordEvent }) => executor.execute({
        run: currentRun,
        node,
        signal: currentSignal,
        parent,
        exec,
        onEvent: recordEvent,
      }),
    });
  }

  async recordEvent(runId, event) {
    return this.runStore.appendEvent(runId, event);
  }

  async cancel(runId, reason = 'user-cancelled') {
    this.ensureOpen();
    const active = this.activeRuns.get(runId);
    if (active && !active.signal.aborted) active.abort(reason);
    const run = await this.runStore.get(runId);
    if (run.graph && run.plan) {
      const graph = new TaskGraph(run.plan, { roleRegistry: this.roles, modelDirectory: this.modelDirectory, skillRegistry: this.skills });
      restoreGraph(graph, run.graph);
      graph.cancel(reason);
      return this.runStore.checkpoint(runId, { status: 'cancelled', graph: graph.snapshot(), checkpoint: 'cancelled' });
    }
    return this.runStore.checkpoint(runId, { status: 'cancelled', checkpoint: 'cancelled' });
  }

  async close() {
    this.closed = true;
    for (const controller of this.activeRuns.values()) controller.abort('runtime-closed');
  }
}

function summarizeRun(run) {
  const nodes = run.graph?.nodes ?? [];
  const counts = {};
  for (const node of nodes) counts[node.status] = (counts[node.status] ?? 0) + 1;
  return {
    id: run.id,
    sessionId: run.sessionId,
    task: run.task,
    status: run.status,
    checkpoint: run.checkpoint,
    leader: run.leader?.ref,
    mode: run.plan?.mode,
    summary: run.plan?.summary,
    nodes: nodes.map((node) => {
      const assignment = run.assignments?.find((item) => item.nodeId === node.id)?.model;
      return {
        id: node.id,
        title: node.title,
        roleId: node.roleId ?? 'worker',
        categoryId: node.categoryId,
        status: node.status,
        attempts: node.attempts,
        dependencies: node.dependencies ?? [],
        model: assignment?.ref,
        inherited: Boolean(assignment?.inherited),
        effort: assignment?.effort,
        resultText: typeof node.result?.text === 'string' ? node.result.text.slice(0, 4000) : undefined,
        review: node.review,
        failure: node.failure,
      };
    }),
    counts,
    events: (run.events ?? []).slice(-80),
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

function restoreGraph(graph, snapshot) {
  for (const node of snapshot.nodes ?? []) {
    const current = graph.nodes.get(node.id);
    if (!current) continue;
    Object.assign(current, cloneJson(node));
  }
  graph.startedAt = snapshot.startedAt;
  graph.updatedAt = snapshot.updatedAt;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function linkAbortSignal(signal, controller) {
  if (!signal) return () => {};
  const abort = () => controller.abort(signal.reason ?? 'parent-cancelled');
  if (signal.aborted) abort();
  else signal.addEventListener('abort', abort, { once: true });
  return () => signal.removeEventListener('abort', abort);
}

function summarizeEventResult(result) {
  if (!result || typeof result !== 'object') return result;
  return {
    ...(result.nodeId === undefined ? {} : { nodeId: result.nodeId }),
    ...(result.childId === undefined ? {} : { childId: result.childId }),
    ...(result.provider === undefined ? {} : { provider: result.provider }),
    ...(result.stopReason === undefined ? {} : { stopReason: result.stopReason }),
    ...(result.text === undefined ? {} : { text: result.text }),
    ...(result.evidence === undefined ? {} : { evidence: result.evidence }),
  };
}

