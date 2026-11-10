import { DynamicMultiagentError, asDynamicError } from './errors.js';
import { assembleSystemPrompt } from './prompt.js';
import { cloneJson, nowIso } from './validation.js';

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

    const toolFilter = buildToolFilter(node, role, capabilities);
    const maxDepth = resolveMaxDepth(role, capabilities);
    const skillSummaries = (node.skills ?? []).map((id) => this.skills?.get(id)).filter(Boolean);
    const modelRef = assignment?.ref;
    const prompt = this.buildPrompt({ run, node, role, modelRef, skillSummaries });
    const controller = new AbortController();
    const detachAbort = linkAbort(signal, controller);
    const request = {
      label: node.title,
      prompt: [{ type: 'text', text: prompt }],
      parent: resolvedParent,
      signal: controller.signal,
      ...(assignment ? {
        agentOptions: {
          provider: this.modelProviderMap[assignment.connectionId] ?? assignment.connectionId,
          model: assignment.model,
          ...(assignment.profile?.limits?.maxOutputTokens ? { maxTokens: assignment.profile.limits.maxOutputTokens } : {}),
        },
      } : {}),
      ...(capabilities.persona ? { persona: renderPersona(role, node) } : {}),
      ...(toolFilter ? { toolFilter } : {}),
      ...(maxDepth === undefined ? {} : { maxDepth }),
    };

    await emitEvent(onEvent, {
      type: 'child-start',
      nodeId: node.id,
      provider: this.providerName,
      model: modelRef,
      roleId: role.id,
      startedAt,
      contract: contractDigest(node, role, skillSummaries),
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
      const result = {
        nodeId: node.id,
        childId: child.id,
        provider: this.providerName,
        roleId: role.id,
        model: modelRef,
        startedAt,
        finishedAt,
        ...normalized,
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

  buildPrompt({ run, node, role, modelRef, skillSummaries }) {
    const task = {
      id: node.id,
      objective: node.responsibility,
      inputs: node.inputs ?? [],
      outputs: node.outputs ?? [],
      dependencies: node.dependencies ?? [],
      acceptance: node.acceptance ?? [],
      ...(node.writeScope === undefined ? {} : { writeScope: node.writeScope }),
    };
    const assembled = assembleSystemPrompt({
      roleId: role.id,
      stage: 'execution',
      categoryId: node.categoryId,
      modelRef,
      task,
      specializedDefinition: role.baseRole ? role : undefined,
      skillSummaries,
      contextRefs: [
        `dynamic-run:${run.id}`,
        ...(run.workspace?.integrationPath ? [`private-workspace:${run.workspace.integrationPath}`] : []),
      ],
    });
    return [
      assembled,
      `Task node: ${node.id} — ${node.title}`,
      `Role contract: ${role.description ?? role.id}`,
      `Declared tools: ${(node.tools ?? []).join(', ') || 'none beyond the host composition'}`,
      `Declared skills: ${(node.skills ?? []).join(', ') || 'none'}`,
      `Required outputs: ${(node.outputs ?? []).join(', ') || 'result'}`,
      `Acceptance criteria:\n${(node.acceptance ?? []).map((item) => `- ${item}`).join('\n') || '- Return a verifiable result with evidence.'}`,
      'Return a concise result and cite observable evidence. Do not claim work that was not performed.',
    ].join('\n\n');
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

function buildToolFilter(node, role, capabilities) {
  if (!(node.tools?.length)) return undefined;
  const allowedByRole = new Set(role.tools ?? []);
  const outside = node.tools.filter((tool) => !allowedByRole.has(tool));
  if (outside.length) {
    throw new DynamicMultiagentError('role-tool-widening', `Node "${node.id}" requests tools outside role "${role.id}": ${outside.join(', ')}`);
  }
  if (!capabilities.toolFilter) {
    throw new DynamicMultiagentError('provider-capability', `Host provider cannot enforce the tool filter required by node "${node.id}"`);
  }
  return { allow: [...node.tools] };
}

function resolveMaxDepth(role, capabilities) {
  const value = role.delegation?.maxDepth;
  if (value === undefined || value === Number.POSITIVE_INFINITY) return undefined;
  if (!capabilities.depthLimit) {
    throw new DynamicMultiagentError('provider-capability', `Host provider cannot enforce role delegation depth for "${role.id}"`);
  }
  return value;
}

function renderPersona(role, node) {
  return [
    `Role: ${role.id}`,
    role.description,
    `Write permission: ${role.workspace?.write ? 'assigned scope only' : 'read-only'}`,
    `Delegation: ${role.delegation?.allowed ? `allowed up to ${role.delegation.maxDepth}` : 'not allowed'}`,
    `Node: ${node.title}`,
  ].filter(Boolean).join('\n');
}

function contractDigest(node, role, skillSummaries) {
  return {
    roleId: role.id,
    roleVersion: role.version ?? role.promptVersion,
    tools: [...(node.tools ?? [])],
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

