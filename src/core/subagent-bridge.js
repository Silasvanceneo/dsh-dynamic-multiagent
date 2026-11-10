import { DynamicMultiagentError, asDynamicError } from './errors.js';
import { assembleChildPrompt, childPersona, isReviewRole } from './prompt.js';
import { resolveRoleTools, TASK_CATEGORIES } from './roles.js';
import { cloneJson, nowIso } from './validation.js';

/** Child-request field read by the effort bridge on hosts without native effort support. */
export const CHILD_EFFORT_KEY = 'dynamicMultiagentEffort';

/**
 * Adapter between a validated task-graph node and dsh's host subagent seam.
 *
 * The adapter deliberately does not create an HTTP client or a second agent
 * runtime. It forwards one-shot work to `ctx.subagents.start()`, keeping the
 * host provider responsible for child lifecycle, model routing, and cleanup.
 */
export class SubagentTaskExecutor {
  constructor({
    subagents,
    roles,
    skills,
    modelDirectory,
    providerName = 'spawn',
    modelProviderMap = {},
    parent,
    parentResolver,
    knownTools,
    logger = console,
  } = {}) {
    if (!subagents || typeof subagents.start !== 'function') {
      throw new DynamicMultiagentError('subagents-unavailable', 'A host ctx.subagents service with start() is required');
    }
    this.subagents = subagents;
    this.roles = roles;
    this.skills = skills;
    this.modelDirectory = modelDirectory;
    this.providerName = providerName;
    this.modelProviderMap = { ...modelProviderMap };
    this.parent = parent;
    this.parentResolver = parentResolver;
    this.knownTools = knownTools;
    this.logger = logger;
  }

  /** Execute one graph node as one host-managed one-shot child. */
  async execute({ run, node, signal, exec, parent, onEvent } = {}) {
    const startedAt = nowIso();
    const role = this.roles?.get(node.roleId ?? 'worker') ?? { id: node.roleId ?? 'worker' };
    const assignment = resolveAssignment(run, node, this.modelDirectory);
    const provider = this.subagents.getProvider?.(this.providerName);
    if (!provider && typeof this.subagents.getProvider === 'function') {
      throw new DynamicMultiagentError('subagent-provider-missing', `Host subagent provider "${this.providerName}" is not registered`);
    }
    const capabilities = provider?.capabilities ?? {};
    const resolvedParent = this.resolveParent({ parent, exec });
    if (!resolvedParent) {
      throw new DynamicMultiagentError('parent-agent-required', 'Host subagent execution requires the calling Agent (pass exec.agent or parent)');
    }

    const allowedTools = resolveAllowedTools(node, role, this.knownTools);
    const toolFilter = buildToolFilter(node, allowedTools, capabilities);
    const maxDepth = resolveMaxDepth(role, capabilities);
    const skillSummaries = (node.skills ?? []).map((id) => this.skills?.get(id)).filter(Boolean);
    const modelRef = assignment?.ref;
    const effort = assignment?.effort;
    const prompt = this.buildPrompt({ run, node, role, modelRef, effort, skillSummaries, tools: toolFilter?.allow ?? allowedTools });
    const controller = new AbortController();
    const detachAbort = linkAbort(signal, controller);
    const agentOptions = buildAgentOptions(assignment, this.modelProviderMap);
    const request = {
      label: node.title,
      prompt: [{ type: 'text', text: prompt }],
      parent: resolvedParent,
      signal: controller.signal,
      ...(agentOptions ? { agentOptions } : {}),
      ...(capabilities.persona ? { persona: childPersona(role, node) } : {}),
      ...(toolFilter ? { toolFilter } : {}),
      ...(maxDepth === undefined ? {} : { maxDepth }),
    };

    await emitEvent(onEvent, {
      type: 'child-start',
      nodeId: node.id,
      provider: this.providerName,
      model: modelRef,
      ...(effort === undefined ? {} : { effort }),
      roleId: role.id,
      startedAt,
      contract: contractDigest(node, role, skillSummaries, toolFilter?.allow ?? allowedTools),
    });

    let child;
    try {
      child = await this.subagents.start(this.providerName, request);
      await emitEvent(onEvent, {
        type: 'child-published',
        nodeId: node.id,
        childId: child.id,
        provider: this.providerName,
      });
      const childResult = await child.result;
      const normalized = normalizeChildResult(childResult);
      const finishedAt = nowIso();
      await emitEvent(onEvent, {
        type: 'child-settled',
        nodeId: node.id,
        childId: child.id,
        stopReason: normalized.stopReason,
        finishedAt,
      });
      if (normalized.stopReason !== 'completed') {
        throw new DynamicMultiagentError('child-stop', `Host child for node "${node.id}" ended with ${normalized.stopReason}`, {
          details: { stopReason: normalized.stopReason, childId: child.id, output: normalized.output },
        });
      }
      const review = isReviewRole(role) ? parseReviewVerdict(normalized.text) : undefined;
      const result = {
        nodeId: node.id,
        childId: child.id,
        provider: this.providerName,
        roleId: role.id,
        model: modelRef,
        ...(effort === undefined ? {} : { effort }),
        startedAt,
        finishedAt,
        ...normalized,
        ...(review === undefined ? {} : { review }),
        evidence: [
          ...(normalized.evidence ?? []),
          { kind: 'host-subagent', provider: this.providerName, childId: child.id },
        ],
      };
      return result;
    } catch (error) {
      const normalized = asDynamicError(error, 'subagent-execution-failed');
      await emitEvent(onEvent, {
        type: controller.signal.aborted ? 'child-cancelled' : 'child-error',
        nodeId: node.id,
        ...(child?.id ? { childId: child.id } : {}),
        code: normalized.code,
        message: normalized.message,
        ...(normalized.details === undefined ? {} : { details: normalized.details }),
        finishedAt: nowIso(),
      });
      throw normalized;
    } finally {
      detachAbort();
      if (child) {
        try {
          await child.dispose();
        } catch (error) {
          this.logger.warn?.(`dynamic-multiagent: child ${child.id} disposal failed: ${String(error)}`);
        }
      }
    }
  }

  buildPrompt({ run, node, role, modelRef, effort, skillSummaries, tools }) {
    const dependencyResults = (node.dependencies ?? []).map((id) => {
      const settled = run.graph?.nodes?.find((candidate) => candidate.id === id);
      const text = settled?.result?.text;
      return text ? `Result of ${id}${settled.title && settled.title !== id ? ` (${settled.title})` : ''}:\n${truncate(text, 6000)}` : undefined;
    }).filter(Boolean);
    return assembleChildPrompt({
      role,
      node: { ...node, inputs: [...(node.inputs ?? []), ...dependencyResults] },
      runId: run.id,
      modelRef,
      effort,
      categoryId: node.categoryId,
      categoryDescription: TASK_CATEGORIES[node.categoryId]?.description,
      tools,
      writeScope: node.writeScope,
      skillSummaries,
      workspacePath: run.workspace?.integrationPath,
      userConstraints: run.userConstraints ?? [],
    });
  }

  resolveParent({ parent, exec }) {
    if (parent) return parent;
    if (typeof this.parentResolver === 'function') {
      const resolved = this.parentResolver({ exec, subagents: this.subagents });
      if (resolved) return resolved;
    }
    return this.parent ?? exec?.agent;
  }
}

function resolveAssignment(run, node, modelDirectory) {
  const persisted = run?.assignments?.find((item) => item.nodeId === node.id)?.model;
  if (persisted) return cloneJson(persisted);
  if (!node.model || !modelDirectory) return undefined;
  return modelDirectory.get(node.model);
}

/**
 * Child agentOptions. An inherited assignment sends no route so dsh keeps the parent's
 * provider/model; the effort travels both as the native field (dsh ≥ 0.2.1) and as a private
 * field the plugin's effort bridge applies on hosts that drop the native one.
 */
function buildAgentOptions(assignment, modelProviderMap) {
  if (!assignment) return undefined;
  const route = assignment.inherited ? undefined : assignment.route ?? { provider: assignment.connectionId, model: assignment.model };
  const options = {
    ...(route ? { provider: modelProviderMap[assignment.connectionId] ?? route.provider, model: route.model } : {}),
    ...(assignment.maxOutputTokens ? { maxTokens: assignment.maxOutputTokens } : {}),
    ...(assignment.effort === undefined ? {} : { reasoningEffort: assignment.effort, [CHILD_EFFORT_KEY]: assignment.effort }),
  };
  return Object.keys(options).length ? options : undefined;
}

function resolveAllowedTools(node, role, knownTools) {
  const fromRole = resolveRoleTools(role);
  const known = knownTools ? new Set(knownTools) : undefined;
  return known ? fromRole.filter((tool) => known.has(tool)) : fromRole;
}

function buildToolFilter(node, allowedTools, capabilities) {
  const allowed = new Set(allowedTools);
  const requested = node.tools?.length ? node.tools : undefined;
  if (requested) {
    const outside = requested.filter((tool) => !allowed.has(tool));
    if (outside.length) {
      throw new DynamicMultiagentError('role-tool-widening', `Node "${node.id}" requests tools outside its role: ${outside.join(', ')}; allowed: ${[...allowed].join(', ') || 'none'}`);
    }
  }
  const allow = requested ?? [...allowed];
  if (!allow.length) return undefined;
  if (!capabilities.toolFilter) {
    if (requested) throw new DynamicMultiagentError('provider-capability', `Host provider cannot enforce the tool filter required by node "${node.id}"`);
    return undefined;
  }
  return { allow: [...allow] };
}

/** Extract a reviewer verdict from the child's fenced JSON block. */
export function parseReviewVerdict(text) {
  const blocks = [...String(text ?? '').matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((match) => match[1]);
  for (const block of blocks.reverse()) {
    try {
      const value = JSON.parse(block);
      if (value && typeof value.passed === 'boolean') {
        return { passed: value.passed, defects: Array.isArray(value.defects) ? value.defects : [], retry: Boolean(value.retry) };
      }
    } catch { /* not the verdict block */ }
  }
  return undefined;
}

function truncate(text, limit) {
  return text.length > limit ? `${text.slice(0, limit)}\n… (${text.length - limit} more characters)` : text;
}

function resolveMaxDepth(role, capabilities) {
  const value = role.delegation?.maxDepth;
  if (value === undefined || value === Number.POSITIVE_INFINITY) return undefined;
  if (!capabilities.depthLimit) {
    throw new DynamicMultiagentError('provider-capability', `Host provider cannot enforce role delegation depth for "${role.id}"`);
  }
  return value;
}

function contractDigest(node, role, skillSummaries, tools) {
  return {
    roleId: role.id,
    roleVersion: role.version ?? role.promptVersion,
    tools: [...tools],
    skills: skillSummaries.map((skill) => ({ id: skill.id, version: skill.version, contentHash: skill.contentHash })),
    writeScope: cloneJson(node.writeScope),
  };
}

function normalizeChildResult(result = {}) {
  const source = result && typeof result === 'object' ? result : {};
  const output = Array.isArray(source.output) ? cloneJson(source.output) : [];
  const text = output.filter((block) => block?.type === 'text' && typeof block.text === 'string').map((block) => block.text).join('');
  return {
    text,
    output,
    ...(source.structured === undefined ? {} : { structured: cloneJson(source.structured) }),
    stopReason: source.stopReason ?? 'error',
    ...(Array.isArray(source.evidence) ? { evidence: cloneJson(source.evidence) } : {}),
  };
}

function linkAbort(signal, controller) {
  if (!signal) return () => {};
  const abort = () => controller.abort(signal.reason ?? 'parent-cancelled');
  if (signal.aborted) abort();
  else signal.addEventListener('abort', abort, { once: true });
  return () => signal.removeEventListener('abort', abort);
}

async function emitEvent(handler, event) {
  if (typeof handler !== 'function') return;
  try {
    await handler(event);
  } catch {
    // Event persistence is best effort and must not turn a child result into a
    // provider failure. The parent run still records the child result itself.
  }
}

export { normalizeChildResult };

