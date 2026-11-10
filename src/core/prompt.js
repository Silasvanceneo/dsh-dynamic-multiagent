import { cloneJson, nowIso, sha256, stableJson } from './validation.js';

export const PROMPT_TEMPLATE_VERSION = '1.0.0';

export const LEADER_BASE_PROMPT = `You are the fixed Leader for this conversation.
Decide whether delegation has a concrete benefit before creating child agents. Keep simple, bounded work yourself.
When collaboration helps, describe a validated task graph with explicit responsibilities, inputs, outputs, dependencies, model assignments, skills, tools, workspace rules, and acceptance criteria.
Reuse a suitable role before deriving a specialized role. A specialized role must inherit permissions, model-selection rules, workspace boundaries, and review independence.
Do not claim a skill, tool, model capability, or verification result that the runtime did not provide.
Keep the user informed in this same conversation, execute after the plan is explained, and verify every result against observable evidence.
Persist progress before risky external effects. On failure distinguish missing input, routing, prompt, skill, tool, workspace, and provider faults; repair only the diagnosed boundary.`;

export const STAGE_MODULES = Object.freeze({
  conversation: 'Answer the user through the Leader entry point. Preserve the fixed Leader model for this run.',
  analysis: 'Assess workload, independence, uncertainty, dependency shape, verification cost, and parallel benefit. Do not use message length or keywords as the only signal.',
  planning: 'Emit a structured collaboration plan. Validate node IDs, acyclic dependencies, role contracts, model assignments, skill bindings, tool scope, and acceptance criteria before execution.',
  specialization: 'Design or reuse a role from a concrete expertise gap. Return a structured role definition; prose alone never provisions capabilities.',
  matching: 'Resolve user model defaults first. If a requested model is clearly incompatible, report evidence and a recommendation without silently switching it.',
  execution: 'Execute only nodes whose dependencies are complete. Record outputs and evidence, propagate cancellation, and avoid repeating uncertain side effects.',
  review: 'Review independently against the original acceptance criteria. Report defects with evidence and a targeted rework objective; do not modify the submitted product implementation.',
  recovery: 'Reconstruct the saved graph, role versions, model and skill bindings, workspace state, effects ledger, and unresolved operations before continuing.',
});

export function assembleSystemPrompt({
  roleId = 'leader',
  stage = 'conversation',
  categoryId,
  modelRef,
  task,
  specializedDefinition,
  skillSummaries = [],
  contextRefs = [],
} = {}) {
  const sections = [
    LEADER_BASE_PROMPT,
    STAGE_MODULES[stage] ?? STAGE_MODULES.conversation,
    `Active role: ${roleId}.`,
    modelRef ? `Resolved model for this role: ${modelRef}.` : '',
    categoryId ? `Execution category: ${categoryId}.` : '',
    task ? `Task contract:\n${renderTask(task)}` : '',
    specializedDefinition ? `Specialized role contract:\n${renderSpecialized(specializedDefinition)}` : '',
    skillSummaries.length ? `Available skill bindings:\n${renderSkillSummaries(skillSummaries)}` : '',
    contextRefs.length ? `Context references:\n${contextRefs.map((ref) => `- ${ref}`).join('\n')}` : '',
  ].filter(Boolean);
  return sections.join('\n\n');
}

export function createPromptAssemblyRecord({ agentId, roleId, stage, modules = [], definitionVersion, taskId } = {}) {
  const record = {
    version: PROMPT_TEMPLATE_VERSION,
    assemblyId: `prompt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    agentId,
    roleId,
    stage,
    modules: [...modules],
    ...(definitionVersion === undefined ? {} : { definitionVersion }),
    ...(taskId === undefined ? {} : { taskId }),
    assembledAt: nowIso(),
  };
  return Object.freeze(record);
}

export function promptFingerprint(prompt) {
  return sha256(stableJson({ template: PROMPT_TEMPLATE_VERSION, prompt }));
}

function renderTask(task) {
  const value = {
    objective: task.objective,
    inputs: task.inputs ?? [],
    outputs: task.outputs ?? [],
    dependencies: task.dependencies ?? [],
    acceptance: task.acceptance ?? [],
    ...(task.writeScope === undefined ? {} : { writeScope: task.writeScope }),
  };
  return JSON.stringify(cloneJson(value), null, 2);
}

function renderSpecialized(definition) {
  return JSON.stringify({
    id: definition.id,
    baseRole: definition.baseRole,
    specialization: definition.specialization,
    whyNeeded: definition.whyNeeded,
    objective: definition.objective,
    promptSections: definition.promptSections,
    tools: definition.tools,
    workspace: definition.workspace,
    delegation: definition.delegation,
    modelAssignment: definition.modelAssignment,
    skills: definition.skills,
    deliverables: definition.deliverables,
    acceptance: definition.acceptance,
    evidenceRequired: definition.evidenceRequired,
    failureBehavior: definition.failureBehavior,
  }, null, 2);
}

function renderSkillSummaries(skills) {
  return skills.map((skill) => `- ${skill.id} (${skill.version ?? 'unversioned'}): ${skill.summary ?? skill.description ?? 'no summary'}`).join('\n');
}

