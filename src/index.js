import { join } from 'node:path';
import { DynamicMultiagentError, errorMessage } from './core/errors.js';
import { DEFAULT_CONFIG } from './core/config-store.js';
import { DynamicMultiagentRuntime } from './core/runtime.js';
import { LEADER_BASE_PROMPT } from './core/prompt.js';
import { BUILTIN_ROLES, TASK_CATEGORIES } from './core/roles.js';
import { COLLABORATION_MODES } from './core/task-graph.js';
import { CHILD_EFFORT_KEY } from './core/subagent-bridge.js';
import { ConnectionAdapter } from './core/host-adapter.js';
import { connectionRoute } from './core/model-router.js';
import { EFFORT_LEVELS } from './core/thinking.js';

export const name = 'dsh-dynamic-multiagent';
export const inject = ['systemPrompt', 'tools', 'credentials'];

/** Generic RPC channel the browser half talks to (loopback-only, see `ctx.connection.rpc.handle`). */
export const RPC_CHANNEL = '/dynamic-multiagent';

const TOOL_NAMES = [
  'dynamic_multiagent_start',
  'dynamic_multiagent_plan',
  'dynamic_multiagent_execute',
  'dynamic_multiagent_status',
  'dynamic_multiagent_derive_role',
  'dynamic_multiagent_cancel',
];

export function apply(ctx, config = {}) {
  const logger = ctx.logger ?? console;
  const options = config && typeof config === 'object' ? config : {};
  const dataDir = expandPath(options.dataDir ?? join(process.env.DSH_HOME ?? join(homeDir(), '.dsh'), 'dynamic-multiagent'));
  const initialConfig = {
    ...DEFAULT_CONFIG,
    skillSources: {
      ...DEFAULT_CONFIG.skillSources,
      ...(options.skillSources ?? {}),
      autoInstall: options.autoInstallSkills ?? options.skillSources?.autoInstall ?? DEFAULT_CONFIG.skillSources.autoInstall,
    },
  };
  const defaultSubagentProvider = options.subagentProvider ?? options.subagents?.provider ?? 'spawn';
  const credentialResolver = buildCredentialResolver(ctx);
  const runtime = new DynamicMultiagentRuntime({
    dataDir,
    configPath: expandPath(options.configPath ?? join(dataDir, 'config.json')),
    runStorePath: expandPath(options.runStorePath ?? join(dataDir, 'runs.json')),
    config: initialConfig,
    credentialResolver,
    logger,
  });
  runtime.deployment = { dataDir, subagentProvider: defaultSubagentProvider, exposeTools: options.exposeTools !== false };
  const disposers = [];
  const start = runtime.initialize().catch((error) => logger.error?.(`dynamic-multiagent initialization failed: ${errorMessage(error)}`));
  if (typeof ctx.provide === 'function') disposers.push(ctx.provide('dynamicMultiagent', runtime));
  ctx.dynamicMultiagent = runtime;

  // The Leader section renders only for conversations where orchestration is on, so a switched-off
  // session pays nothing and keeps its prompt prefix.
  if (typeof ctx.systemPrompt?.section === 'function') {
    disposers.push(ctx.systemPrompt.section({
      name: 'dynamic-multiagent:leader',
      order: 65,
      text: (context) => (isChildAgent(context?.agent) || !runtime.isEnabledFor(sessionIdOf(context?.agent)) ? '' : LEADER_BASE_PROMPT),
    }));
  }
  if (options.exposeTools !== false && typeof ctx.tools?.register === 'function') {
    disposers.push(registerTools(ctx, runtime, start, { defaultSubagentProvider }));
    disposers.push(registerSessionGate(ctx, runtime));
  }
  disposers.push(installEffortBridge(ctx));
  disposers.push(installHostCatalog(ctx, runtime));
  disposers.push(installConnectionAdapter(ctx, runtime, start, credentialResolver));
  disposers.push(installRpcChannel(ctx, runtime, start));

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

function sessionIdOf(agent) {
  return agent?.session?.header?.id ?? agent?.id;
}

function isChildAgent(agent) {
  return agent?.session?.header?.origin === 'subagent';
}

/** Current `provider:model` of the calling agent, taken from its latest request when available. */
function currentModelOf(agent) {
  const config = agent?.session?.requestHeader?.()?.config;
  const provider = config?.provider ?? agent?.options?.provider;
  const model = config?.model ?? agent?.options?.model;
  return provider && model ? { ref: `${provider}:${model}`, provider, model, ...(config?.reasoningEffort ? { effort: config.reasoningEffort } : {}) } : undefined;
}

/**
 * Hide the orchestration tools from conversations where it is switched off (and from child
 * agents, which must not orchestrate). Uses a per-agent `tools.restrict` so the mask follows the
 * agent's scope; the guard is a second line for agents created before a switch flipped.
 */
function registerSessionGate(ctx, runtime) {
  const masks = new Map();
  const apply = (agent) => {
    if (!agent?.ctx?.tools?.restrict) return;
    const off = isChildAgent(agent) || !runtime.isEnabledFor(sessionIdOf(agent));
    const existing = masks.get(agent);
    if (off && !existing) {
      try { masks.set(agent, agent.ctx.tools.restrict({ deny: TOOL_NAMES })); } catch { /* tools not visible in this scope */ }
    } else if (!off && existing) {
      masks.delete(agent);
      try { existing(); } catch { /* scope already gone */ }
    }
  };
  const handles = [];
  if (typeof ctx.on === 'function') {
    handles.push(ctx.on('agent/created', ({ agent }) => apply(agent)));
    handles.push(ctx.on('agent/disposed', ({ agent }) => { masks.delete(agent); }));
  }
  const refresh = () => {
    const agents = ctx.get?.('agents') ?? ctx.agents;
    for (const agent of agents?.list?.() ?? []) apply(agent);
  };
  handles.push(runtime.sessionSwitches.onChange(refresh));
  handles.push(runtime.onConfigChange(refresh));
  if (typeof ctx.tools.guard === 'function') {
    handles.push(ctx.tools.guard((execution) => {
      if (!TOOL_NAMES.includes(execution.name)) return undefined;
      if (isChildAgent(execution.agent)) return 'Delegated sub-agents cannot start nested orchestration runs.';
      if (!runtime.isEnabledFor(sessionIdOf(execution.agent))) return 'Multi-agent orchestration is switched off for this conversation.';
      return undefined;
    }));
  }
  return () => {
    for (const dispose of masks.values()) { try { dispose(); } catch { /* best effort */ } }
    masks.clear();
    for (const dispose of handles.reverse()) { try { if (typeof dispose === 'function') dispose(); } catch { /* best effort */ } }
  };
}

/**
 * dsh 0.1.x children inherit only provider/model/maxTokens; the requested reasoning effort is
 * dropped. The child's `agent.options` still carries our private field, so an agent-scoped
 * `agent/request` listener restores it on every request of that child. dsh ≥ 0.2.1 applies the
 * native `reasoningEffort` itself and this listener simply re-states the same value.
 */
function installEffortBridge(ctx) {
  if (typeof ctx.on !== 'function') return () => {};
  const handles = [];
  handles.push(ctx.on('agent/created', ({ agent }) => {
    const effort = agent?.options?.[CHILD_EFFORT_KEY];
    if (typeof effort !== 'string' || !agent.ctx?.on) return;
    try {
      agent.ctx.on('agent/request', async (_payload, next) => {
        const config = await next();
        return { ...config, reasoningEffort: effort };
      });
    } catch { /* scope already disposed */ }
  }));
  return () => { for (const dispose of handles) { try { dispose(); } catch { /* best effort */ } } };
}

/** Feed the router the host model catalog (models + reasoning efforts) when `ctx.llm` exists. */
function installHostCatalog(ctx, runtime) {
  const llm = () => ctx.get?.('llm') ?? ctx.llm;
  runtime.setHostCatalogSource(async () => readHostCatalog(llm()));
  const tools = () => ctx.get?.('tools') ?? ctx.tools;
  runtime.setKnownToolsSource((scope) => tools()?.schemas?.(scope)?.map((schema) => schema.name));
  const handles = [];
  if (typeof ctx.on === 'function') handles.push(ctx.on('llm/adapters-updated', () => { runtime.refreshHostCatalog(); }));
  return () => { for (const dispose of handles) { try { dispose(); } catch { /* best effort */ } } };
}

async function readHostCatalog(llm, signal) {
  if (!llm?.listProviders) return [];
  const providers = llm.listProviders();
  const result = [];
  for (const provider of providers) {
    if (provider.id.startsWith('dma-')) continue;
    let models = [];
    try { models = await llm.listModels(provider.id); } catch { models = []; }
    const resolved = await Promise.all(models.map(async (model) => {
      let info;
      try { info = typeof llm.resolveModelInfo === 'function' ? await llm.resolveModelInfo(provider.id, model.id, signal) : undefined; } catch { info = undefined; }
      return {
        id: model.id,
        name: model.name ?? model.id,
        efforts: (info?.reasoning?.efforts ?? []).map((effort) => String(effort.id)),
        ...(info?.reasoning?.defaultEffort ? { defaultEffort: String(info.reasoning.defaultEffort) } : {}),
        ...(info?.context?.contextWindow ? { contextWindow: info.context.contextWindow } : {}),
        vision: (model.inputModalities ?? info?.inputModalities ?? []).includes('image'),
      };
    }));
    result.push({ id: provider.id, name: provider.name ?? provider.id, models: resolved });
  }
  return result;
}

/** Register advanced connections as dsh provider routes (`dma-<id>`) so children can use them. */
function installConnectionAdapter(ctx, runtime, ready, credentialResolver) {
  const llm = ctx.get?.('llm') ?? ctx.llm;
  if (!llm?.registerAdapter) return () => {};
  const adapter = new ConnectionAdapter({
    getConnections: () => runtime.config?.connections ?? [],
    resolveCredential: async (connection) => {
      if (!connection.credentialRef || !credentialResolver) return undefined;
      const resolved = await credentialResolver(connection.credentialRef);
      return typeof resolved === 'string' ? resolved : resolved?.value;
    },
  });
  let handle;
  const sync = (config) => {
    const routes = (config?.connections ?? []).map((connection) => connectionRoute(connection.id));
    try {
      if (!handle && routes.length) handle = llm.registerAdapter(routes, adapter);
      else if (handle) handle.replace(routes);
    } catch (error) {
      ctx.logger?.warn?.(`dynamic-multiagent: cannot register connection routes: ${errorMessage(error)}`);
    }
  };
  ready.then(() => sync(runtime.config));
  const off = runtime.onConfigChange(sync);
  return () => {
    off();
    try { handle?.(); } catch { /* fiber teardown already released it */ }
  };
}

/**
 * Browser ↔ host channel. `ctx.connection` exists only in compositions with a web server; the
 * channel is registered loopback-only because it reads and writes local configuration.
 */
function installRpcChannel(ctx, runtime, ready) {
  if (typeof ctx.inject !== 'function') return () => {};
  const answer = async (endpoint, payload) => {
    await ready;
    try {
      return { ok: true, value: await handleRpc(ctx, runtime, endpoint, payload ?? {}) };
    } catch (error) {
      return { ok: false, error: { code: 'bad-request', message: `${error?.code ? `[${error.code}] ` : ''}${errorMessage(error)}`, details: { issues: [] } } };
    }
  };
  const fiber = ctx.inject(['connection'], (connectionCtx) => {
    const connection = connectionCtx.connection;
    // dsh 0.2.x: authenticated exact routes under /api (the browser carries the session cookie).
    if (typeof connection?.fetch?.register === 'function') {
      for (const endpoint of RPC_ENDPOINTS) {
        connectionCtx.effect(() => connection.fetch.register({
          path: `/api/${FETCH_PREFIX}/${endpoint}`,
          methods: ['POST'],
          requestBody: 'buffered',
          fetch: async (request) => {
            let body;
            try { body = await request.json(); } catch { return new Response('body is not JSON', { status: 400 }); }
            return Response.json({ type: 'server-response', rpcId: body?.rpcId ?? 'none', result: await answer(endpoint, body?.payload) });
          },
        }), `dynamic-multiagent: /api/${FETCH_PREFIX}/${endpoint}`);
      }
      return;
    }
    // dsh 0.1.x: generic loopback channel.
    if (typeof connection?.rpc?.handle === 'function') {
      connection.rpc.handle(RPC_CHANNEL, (endpoint, payload) => answer(endpoint, payload), { authority: 'loopback' });
    }
  });
  return () => { try { fiber?.dispose?.(); } catch { /* best effort */ } };
}

/** Exact paths for dsh 0.2.x routes: `/api/dynamic-multiagent.<endpoint>` (no nested segments). */
const FETCH_PREFIX = 'dynamic-multiagent';
const RPC_ENDPOINTS = ['overview', 'config/save', 'config/enabled', 'session/get', 'session/set', 'runs/list', 'runs/cancel', 'prompts/preview', 'thinking/suggest'];

async function handleRpc(ctx, runtime, endpoint, payload) {
  switch (endpoint) {
    case 'overview': {
      const config = await runtime.readConfig();
      const catalog = await runtime.refreshHostCatalog();
      const subagents = ctx.get?.('subagents') ?? ctx.subagents;
      const provider = subagents?.getProvider?.(runtime.deployment.subagentProvider);
      return {
        config,
        deployment: runtime.deployment,
        hostModels: catalog,
        directory: runtime.modelDirectory.list(),
        roles: Object.values(BUILTIN_ROLES).map((role) => ({ id: role.id, description: role.description, writes: Boolean(role.workspace?.write), tools: runtime.snapshot().roles.find((entry) => entry.id === role.id)?.hostTools ?? [] })),
        categories: Object.entries(TASK_CATEGORIES).map(([id, value]) => ({ id, description: value.description })),
        skills: runtime.skills.list(),
        efforts: EFFORT_LEVELS,
        host: {
          subagentProvider: runtime.deployment.subagentProvider,
          subagentAvailable: Boolean(provider),
          toolFilter: Boolean(provider?.capabilities?.toolFilter ?? provider?.capabilities?.agentOptions),
          depthLimit: Boolean(provider?.capabilities?.depthLimit),
          llm: Boolean(ctx.get?.('llm') ?? ctx.llm),
        },
      };
    }
    case 'config/save':
      return runtime.writeConfig(payload.config, { expectedRevision: payload.expectedRevision });
    case 'config/enabled':
      return runtime.setGlobalEnabled(payload.enabled);
    case 'session/get':
      return runtime.sessionState(payload.sessionId);
    case 'session/set':
      return runtime.setSessionEnabled(payload.sessionId, payload.enabled);
    case 'runs/list':
      return runtime.listRuns({ sessionId: payload.sessionId, limit: payload.limit });
    case 'runs/cancel':
      return runtime.cancel(payload.runId, 'cancelled from the settings page');
    case 'prompts/preview':
      return runtime.previewPrompts({ roleId: payload.roleId, categoryId: payload.categoryId });
    case 'thinking/suggest':
      return runtime.suggestThinking(payload.protocol, payload.model);
    default:
      throw new DynamicMultiagentError('unknown-endpoint', `Unknown endpoint ${endpoint}`);
  }
}

const NODE_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'Unique node id, e.g. "research-api".' },
    title: { type: 'string', description: 'Short label shown in progress views.' },
    responsibility: { type: 'string', description: 'Self-contained instructions for the child: goal, context, and constraints. The child cannot see this conversation.' },
    roleId: { type: 'string', enum: Object.keys(BUILTIN_ROLES), description: 'Role; defaults to worker. Derived role ids are also accepted.' },
    categoryId: { type: 'string', enum: Object.keys(TASK_CATEGORIES), description: 'Task category used for default model/effort routing.' },
    model: { type: 'string', description: 'Model ref from dynamic_multiagent_status. Omit to use defaults or inherit your model.' },
    effort: { type: 'string', enum: EFFORT_LEVELS, description: 'Reasoning effort; only a level the chosen model offers.' },
    dependencies: { type: 'array', items: { type: 'string' }, description: 'Ids of nodes that must complete first; their results are passed to this node.' },
    inputs: { type: 'array', items: { type: 'string' }, description: 'Facts, files, or data the child needs.' },
    outputs: { type: 'array', items: { type: 'string' }, description: 'What the child must return.' },
    acceptance: { type: 'array', items: { type: 'string' }, description: 'Checkable completion criteria.' },
    writeScope: { type: 'array', items: { type: 'string' }, description: 'Paths a writing node may modify; keep parallel scopes disjoint.' },
    skills: { type: 'array', items: { type: 'string' }, description: 'Skill ids from dynamic_multiagent_status.' },
    tools: { type: 'array', items: { type: 'string' }, description: 'Optional subset of the role tools; omit to allow all role tools.' },
    teamId: { type: 'string', description: 'Team id for multi-level plans.' },
  },
  required: ['id', 'responsibility'],
};

function registerTools(ctx, runtime, ready, { defaultSubagentProvider = 'spawn' } = {}) {
  const handles = [];
  handles.push(ctx.tools.register({
    name: 'dynamic_multiagent_start',
    description: 'Start a multi-agent run for the current task. Call this after deciding delegation is worthwhile and after reading dynamic_multiagent_status. Your own model is fixed as the Leader for the run.',
    parameters: {
      task: { type: 'string', required: true, description: 'The task to coordinate, restated precisely.' },
      userConstraints: { type: 'array', items: { type: 'string' }, description: 'User constraints every child must respect (paths not to touch, style, deadlines, ...).' },
      projectRoot: { type: 'string', description: 'Optional absolute project root for private workspace isolation.' },
      leaderModel: { type: 'string', description: 'Optional model ref to record as Leader; defaults to the configured Leader or your current model.' },
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderToolValue },
    async execute(args, exec) {
      await ready;
      const run = await runtime.startRun({ ...args, sessionId: sessionIdOf(exec?.agent), currentModel: currentModelOf(exec?.agent) });
      return { runId: run.id, leader: run.leader?.ref, status: run.status, next: 'Submit a task graph with dynamic_multiagent_plan.' };
    },
  }));
  handles.push(ctx.tools.register({
    name: 'dynamic_multiagent_plan',
    description: 'Validate and store the task graph for a run. Nodes form an acyclic dependency graph; each node becomes one child agent. Returns the model and effort chosen for every node.',
    parameters: {
      runId: { type: 'string', required: true },
      plan: {
        type: 'object',
        required: true,
        description: 'Example: {"mode":"dependency-graph","summary":"...","rationale":"...","nodes":[{"id":"explore","roleId":"explore","responsibility":"...","outputs":["file list"],"acceptance":["..."]},{"id":"implement","roleId":"worker","dependencies":["explore"],"responsibility":"...","writeScope":["src/x"],"acceptance":["tests pass"]},{"id":"review","roleId":"code-reviewer","dependencies":["implement"],"responsibility":"...","acceptance":["..."]}]}',
        properties: {
          mode: { type: 'string', enum: [...COLLABORATION_MODES], description: 'Dominant collaboration pattern.' },
          summary: { type: 'string', description: 'One-line plan summary.' },
          rationale: { type: 'string', description: 'Why delegation helps here.' },
          nodes: { type: 'array', items: NODE_SCHEMA },
          acceptance: { type: 'array', items: { type: 'string' }, description: 'Run-level completion criteria.' },
          teams: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Optional teams for multi-level plans.' },
        },
        additionalProperties: true,
      },
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderToolValue },
    async execute(args) {
      await ready;
      const run = await runtime.submitPlan(args.runId, args.plan);
      return {
        runId: run.id,
        planVersion: run.planVersion,
        nodes: run.assignments.map((assignment) => ({
          nodeId: assignment.nodeId,
          roleId: assignment.roleId,
          model: assignment.model.ref,
          ...(assignment.model.inherited ? { inherited: true } : {}),
          ...(assignment.model.effort ? { effort: assignment.model.effort } : {}),
          ...(assignment.model.compatible === false ? { warning: `missing ${assignment.model.missingCapabilities.join(', ')}`, suggestion: assignment.model.suggestion?.ref } : {}),
          ...(assignment.model.effortNote ? { note: assignment.model.effortNote } : {}),
        })),
        next: 'Tell the user the plan in one or two sentences, then call dynamic_multiagent_execute.',
      };
    },
  }));
  handles.push(ctx.tools.register({
    name: 'dynamic_multiagent_execute',
    description: 'Run the validated graph. Ready nodes run in parallel as child agents; returns each node\'s status and result text when the graph settles.',
    parameters: {
      runId: { type: 'string', required: true },
      provider: { type: 'string', description: `Host subagent provider (default: ${defaultSubagentProvider}).` },
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderToolValue },
    async execute(args, exec) {
      await ready;
      const run = await runtime.executeWithHost(args.runId, {
        ctx,
        providerName: args.provider ?? defaultSubagentProvider,
        parent: exec?.agent,
        exec,
        signal: exec?.signal,
      });
      const summary = (await runtime.listRuns()).find((item) => item.id === run.id);
      return {
        runId: run.id,
        status: run.status,
        nodes: summary?.nodes.map((node) => ({
          id: node.id,
          status: node.status,
          model: node.model,
          ...(node.effort ? { effort: node.effort } : {}),
          ...(node.resultText ? { result: node.resultText } : {}),
          ...(node.review ? { review: node.review } : {}),
          ...(node.failure ? { failure: node.failure } : {}),
        })) ?? [],
        next: run.status === 'reviewing' ? 'Verify the results against the acceptance criteria, then report to the user.' : 'Inspect failed or blocked nodes, fix the cause, and re-plan or retry.',
      };
    },
  }));
  handles.push(ctx.tools.register({
    name: 'dynamic_multiagent_status',
    description: 'Without runId: list models (with reasoning efforts), routing defaults, roles, categories, and skills you may use in a plan. With runId: the run\'s graph, node results, and recent events.',
    parameters: {
      runId: { type: 'string', description: 'Optional run id.' },
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderToolValue },
    async execute(args) {
      await ready;
      if (args.runId) return (await runtime.listRuns()).find((run) => run.id === args.runId) ?? runtime.runStore.get(args.runId);
      await runtime.refreshHostCatalog();
      return { ...runtime.modelCatalog(), resumableRuns: (await runtime.runStore.resumable()).slice(0, 10).map((run) => ({ id: run.id, task: run.task, status: run.status })) };
    },
  }));
  handles.push(ctx.tools.register({
    name: 'dynamic_multiagent_derive_role',
    description: 'Create a task-specific role derived from a built-in role. It inherits (and may only narrow) the base role\'s tools, write access, and delegation.',
    parameters: {
      runId: { type: 'string', required: true },
      definition: {
        type: 'object',
        required: true,
        additionalProperties: true,
        description: 'Required: id, baseRole, specialization, whyNeeded, objective. Optional: tools (subset of the base role tools), workspace {write, paths}, skills, deliverables, acceptance, evidenceRequired, modelAssignment.',
      },
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderToolValue },
    async execute(args) {
      await ready;
      return runtime.deriveRole(args.runId, args.definition);
    },
  }));
  handles.push(ctx.tools.register({
    name: 'dynamic_multiagent_cancel',
    description: 'Cancel a run and stop all unfinished child agents.',
    parameters: {
      runId: { type: 'string', required: true },
      reason: { type: 'string', description: 'Optional cancellation reason.' },
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderToolValue },
    async execute(args) {
      await ready;
      const run = await runtime.cancel(args.runId, args.reason);
      return { runId: run.id, status: run.status };
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

function homeDir() {
  return process.env.USERPROFILE ?? process.env.HOME ?? process.cwd();
}

function expandPath(value) {
  return String(value)
    .replace(/\$\{DSH_HOME\}/g, () => process.env.DSH_HOME || join(homeDir(), '.dsh'))
    .replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, key) => process.env[key] ?? '')
    .replace(/^~(?=[\\/])/, homeDir());
}

export { DynamicMultiagentRuntime } from './core/runtime.js';
export { ProtocolConnectionManager, ProviderError, parseToolArguments } from './core/protocols.js';
export { ConfigStore, DEFAULT_CONFIG, normalizeConfig, redactConfig } from './core/config-store.js';
export { ModelDirectory, MODEL_CAPABILITIES } from './core/model-router.js';
export { RoleRegistry, BUILTIN_ROLES, TASK_CATEGORIES, normalizeSpecialized, resolveRoleTools } from './core/roles.js';
export { SkillRegistry } from './core/skills.js';
export { TaskGraph, validatePlan, makeSingleNodePlan, COLLABORATION_MODES } from './core/task-graph.js';
export { RunStore } from './core/run-store.js';
export { WorkspaceManager, snapshotTree } from './core/workspace.js';
export { SubagentTaskExecutor, normalizeChildResult, parseReviewVerdict } from './core/subagent-bridge.js';
export { assembleSystemPrompt, assembleChildPrompt, createPromptAssemblyRecord, PROMPT_TEMPLATE_VERSION } from './core/prompt.js';
export { suggestThinking, EFFORT_LEVELS } from './core/thinking.js';
