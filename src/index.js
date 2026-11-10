import { join } from 'node:path';
import { DynamicMultiagentError, errorMessage } from './core/errors.js';
import { DEFAULT_CONFIG } from './core/config-store.js';
import { DynamicMultiagentRuntime } from './core/runtime.js';
import { validatePlan } from './core/task-graph.js';

export const name = 'dsh-dynamic-multiagent';
export const inject = ['systemPrompt', 'tools', 'credentials'];

export function apply(ctx, config = {}) {
  const logger = ctx.logger ?? console;
  const options = config && typeof config === 'object' ? config : {};
  const dataDir = expandPath(options.dataDir ?? join(process.env.DSH_HOME ?? process.cwd(), 'dynamic-multiagent'));
  const initialConfig = {
    ...DEFAULT_CONFIG,
    ...options,
    skillSources: {
      ...DEFAULT_CONFIG.skillSources,
      ...(options.skillSources ?? {}),
      autoInstall: options.autoInstallSkills ?? options.skillSources?.autoInstall ?? DEFAULT_CONFIG.skillSources.autoInstall,
    },
  };
  const defaultSubagentProvider = options.subagentProvider ?? options.subagents?.provider ?? 'spawn';
  const runtime = new DynamicMultiagentRuntime({
    dataDir,
    configPath: expandPath(options.configPath ?? join(dataDir, 'config.json')),
    runStorePath: expandPath(options.runStorePath ?? join(dataDir, 'runs.json')),
    config: initialConfig,
    credentialResolver: buildCredentialResolver(ctx),
    logger,
  });
  const disposers = [];
  const start = runtime.initialize().catch((error) => logger.error?.(`dynamic-multiagent initialization failed: ${errorMessage(error)}`));
  if (typeof ctx.provide === 'function') disposers.push(ctx.provide('dynamicMultiagent', runtime));
  ctx.dynamicMultiagent = runtime;
  if (typeof ctx.systemPrompt?.section === 'function') {
    disposers.push(ctx.systemPrompt.section({
      name: 'dynamic-multiagent:leader',
      order: 65,
      text: `You are the fixed Leader in a dynamic multi-agent runtime. Use the registered dynamic orchestration tools when a task benefits from delegation. Start by fixing the Leader model, then validate a DAG with explicit roles, categories, models, skills, tools, inputs, outputs, dependencies, and acceptance criteria. Explain the plan in this conversation and execute without asking for routine delegation approval. Never silently replace a user-specified model or claim that a role/skill/tool is available without runtime evidence.`,
    }));
  }
  if (options.exposeTools !== false && typeof ctx.tools?.register === 'function') {
    disposers.push(registerTools(ctx, runtime, start, { defaultSubagentProvider }));
  }
  if (typeof ctx.effect === 'function') {
    ctx.effect(() => async () => {
      for (const dispose of disposers.reverse()) {
        try { if (typeof dispose === 'function') dispose(); } catch (error) { logger.warn?.(`dynamic-multiagent disposer failed: ${errorMessage(error)}`); }
      }
      await runtime.close();
    }, 'dynamic-multiagent: dispose runtime');
  }
  return runtime;
}

function registerTools(ctx, runtime, ready, { defaultSubagentProvider = 'spawn' } = {}) {
  const handles = [];
  handles.push(ctx.tools.register({
    name: 'dynamic_multiagent_start',
    description: 'Start a recoverable dynamic multi-agent run with a fixed Leader model. Use only when the current conversation task needs explicit orchestration.',
    parameters: {
      task: { type: 'string', required: true, description: 'The user task to coordinate.' },
      leaderModel: { type: 'string', description: 'Configured connection:model reference for the fixed Leader. Omit to use the configured default.' },
      projectRoot: { type: 'string', description: 'Optional local project root for private workspace isolation.' },
      userConstraints: { type: 'array', items: { type: 'string' }, description: 'Constraints that must remain attached to the run.' },
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderToolValue },
    async execute(args) {
      await ready;
      return runtime.startRun(args);
    },
  }));
  handles.push(ctx.tools.register({
    name: 'dynamic_multiagent_plan',
    description: 'Validate and persist a collaboration plan for an existing dynamic run. The plan must be an acyclic task graph.',
    parameters: {
      runId: { type: 'string', required: true },
      plan: { type: 'object', required: true, additionalProperties: true },
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderToolValue },
    async execute(args) {
      await ready;
      return runtime.submitPlan(args.runId, args.plan);
    },
  }));
  handles.push(ctx.tools.register({
    name: 'dynamic_multiagent_execute',
    description: 'Execute a validated dynamic multi-agent DAG through the host ctx.subagents provider. The calling Agent is used as the parent authority.',
    parameters: {
      runId: { type: 'string', required: true },
      provider: { type: 'string', description: `Host subagent provider name (default: ${defaultSubagentProvider}).` },
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderToolValue },
    async execute(args, exec) {
      await ready;
      return runtime.executeWithHost(args.runId, {
        ctx,
        providerName: args.provider ?? defaultSubagentProvider,
        parent: exec?.agent,
        exec,
        signal: exec?.signal,
      });
    },
  }));
  handles.push(ctx.tools.register({
    name: 'dynamic_multiagent_status',
    description: 'Inspect recoverable runs, model/skill bindings, graph status, and checkpoints.',
    parameters: {
      runId: { type: 'string', description: 'Optional run id. Omit to list resumable runs.' },
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderToolValue },
    async execute(args) {
      await ready;
      return args.runId ? runtime.runStore.get(args.runId) : { runs: await runtime.runStore.resumable(), catalog: runtime.snapshot() };
    },
  }));
  handles.push(ctx.tools.register({
    name: 'dynamic_multiagent_derive_role',
    description: 'Create a validated task-specific role derived from a registered base role without widening permissions.',
    parameters: {
      runId: { type: 'string', required: true },
      definition: { type: 'object', required: true, additionalProperties: true },
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderToolValue },
    async execute(args) {
      await ready;
      return runtime.deriveRole(args.runId, args.definition);
    },
  }));
  handles.push(ctx.tools.register({
    name: 'dynamic_multiagent_cancel',
    description: 'Cancel a dynamic run and propagate cancellation to all unfinished graph nodes.',
    parameters: {
      runId: { type: 'string', required: true },
      reason: { type: 'string', description: 'Optional cancellation reason.' },
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderToolValue },
    async execute(args) {
      await ready;
      return runtime.cancel(args.runId, args.reason);
    },
  }));
  return () => {
    for (const dispose of handles.reverse()) {
      try { if (typeof dispose === 'function') dispose(); } catch { /* plugin teardown is best effort */ }
    }
  };
}

function buildCredentialResolver(ctx) {
  const provider = ctx.credentials ?? ctx.credentialProvider;
  if (!provider) return undefined;
  return (reference) => {
    if (typeof provider.resolve === 'function') return provider.resolve(reference);
    if (typeof provider.get === 'function') return provider.get(reference);
    throw new DynamicMultiagentError('credential-unavailable', `Credential provider cannot resolve ${reference}`);
  };
}

function renderToolValue(_args, value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? String(value);
  return [{ type: 'text', text }];
}

function expandPath(value) {
  return String(value)
    .replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, key) => process.env[key] ?? '')
    .replace(/^~(?=[\\/])/, process.env.USERPROFILE ?? process.env.HOME ?? '');
}

export { DynamicMultiagentRuntime } from './core/runtime.js';
export { ProtocolConnectionManager, ProviderError, parseToolArguments } from './core/protocols.js';
export { ConfigStore, DEFAULT_CONFIG, normalizeConfig, redactConfig } from './core/config-store.js';
export { ModelDirectory, MODEL_CAPABILITIES } from './core/model-router.js';
export { RoleRegistry, BUILTIN_ROLES, TASK_CATEGORIES, normalizeSpecialized } from './core/roles.js';
export { SkillRegistry } from './core/skills.js';
export { TaskGraph, validatePlan, makeSingleNodePlan, COLLABORATION_MODES } from './core/task-graph.js';
export { RunStore } from './core/run-store.js';
export { WorkspaceManager, snapshotTree } from './core/workspace.js';
export { SubagentTaskExecutor, normalizeChildResult } from './core/subagent-bridge.js';
export { assembleSystemPrompt, createPromptAssemblyRecord, PROMPT_TEMPLATE_VERSION } from './core/prompt.js';

