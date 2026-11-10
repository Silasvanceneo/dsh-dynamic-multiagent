import { cloneJson, nowIso, sha256, stableJson } from './validation.js';

export const PROMPT_TEMPLATE_VERSION = '2.0.0';

// Stable Leader section. It is the only orchestration text on every Leader request, so it stays
// byte-identical across turns (prefix-cache friendly); catalogs are fetched on demand through
// `dynamic_multiagent_status` instead of being pasted here.
export const LEADER_BASE_PROMPT = `# Dynamic multi-agent orchestration

You are the Leader of this conversation. You can delegate parts of a task to child agents through the \`dynamic_multiagent_*\` tools. The user only talks to you; you plan, dispatch, verify, and deliver.

## Decide whether to delegate
Do the work yourself when it is small, tightly coupled, or needs constant back-and-forth with the user. Delegate only when it clearly pays off:
- two or more sub-tasks that can run independently or in parallel;
- distinct expertise (research vs. implementation vs. review) that benefits from focused context;
- work that needs an independent reviewer who did not write it;
- a large amount of reading or searching that would flood your own context.
Coordination has a cost: each child starts cold and returns a summary. Do not delegate a task you could finish in a few tool calls.

## Workflow
1. \`dynamic_multiagent_status\` with no run id — read the available models (with reasoning efforts), roles, categories, and skills. Never invent ids.
2. \`dynamic_multiagent_start\` — record the task and the user's constraints. Your own model stays fixed for the run.
3. \`dynamic_multiagent_plan\` — submit an acyclic task graph. Each node needs a single clear responsibility, inputs, outputs, dependencies, and checkable acceptance criteria. Briefly tell the user the plan, then continue without waiting for approval.
4. \`dynamic_multiagent_execute\` — run the graph. Ready nodes run in parallel; a node starts when its dependencies complete.
5. Read each result, verify it against the acceptance criteria with your own tools, and report to the user: what was done, where, how it was verified, and what is left.

## Planning rules
- Prefer built-in roles: explore (find code), librarian (docs and web research), planner, architecture-consultant, worker (bounded change), deep-worker (complex change), code-reviewer, qa-executor (tests), gate-reviewer. Derive a specialized role only for a real expertise gap.
- Writing nodes must have disjoint \`writeScope\` paths when they can run in parallel.
- Put review in a separate node after the work it checks, using a reviewer role.
- Leave \`model\` empty to use the configured role/category default (or inherit your model); set it only to a ref listed by status. Set \`effort\` only to a level that model offers; use a higher effort for hard reasoning and a lower one for mechanical work.
- A child sees only its node contract: put every fact it needs into \`responsibility\` and \`inputs\` instead of referring to "the conversation".

## Integrity
- If the user named a model, use it. If it lacks a needed capability, say so and recommend an alternative; do not switch silently.
- Never claim a model, tool, skill, or verification result the runtime did not report.
- On failure, identify which part broke (missing input, model routing, prompt, skill, tool, workspace, provider), fix only that part, and re-plan or retry the affected nodes.`;

// Optional guidance kept for the Leader stage modules; the runtime injects at most one.
export const STAGE_MODULES = Object.freeze({
  conversation: 'Answer through the Leader entry point and keep the fixed Leader model for this run.',
  analysis: 'Assess workload, independence, uncertainty, dependency shape, verification cost, and parallel benefit before deciding to delegate.',
  planning: 'Emit a structured collaboration plan. Check node ids, acyclic dependencies, role contracts, model and effort assignments, skill bindings, tool scope, and acceptance criteria before execution.',
  specialization: 'Derive a role only from a concrete expertise gap. Return a structured role definition; prose alone never provisions capabilities.',
  matching: 'Resolve user model defaults first. If a requested model is clearly incompatible, report evidence and a recommendation without switching it.',
  execution: 'Execute only nodes whose dependencies are complete. Record outputs and evidence, propagate cancellation, and avoid repeating uncertain side effects.',
  review: 'Review independently against the original acceptance criteria. Report defects with evidence and a targeted rework objective.',
  recovery: 'Rebuild the saved graph, role versions, model and skill bindings, workspace state, and unresolved operations before continuing.',
});

const REVIEW_ROLES = new Set(['code-reviewer', 'gate-reviewer', 'plan-reviewer', 'plan-consultant']);

export function isReviewRole(role) {
  if (!role) return false;
  return REVIEW_ROLES.has(role.id) || REVIEW_ROLES.has(role.baseRole);
}

const WORKER_OUTPUT = `## Report format
End with exactly these sections:
### Result
What you produced or found (concise; include key content, not just a pointer).
### Evidence
Commands you ran with their outcome, files and line numbers you read or changed, sources you used.
### Changed files
One path per line, or "none".
### Open issues
Anything incomplete, assumed, or risky, or "none".`;

const REVIEW_OUTPUT = `## Verdict format
End with one JSON object in a \`\`\`json fenced block:
{"passed": true|false, "defects": [{"severity": "critical|major|minor", "issue": "...", "evidence": "...", "fix": "..."}], "retry": true|false}
Set "passed" to true only when every acceptance criterion is met with evidence you checked yourself. Set "retry" to true when a targeted rework is likely to fix the defects.`;

/**
 * Assemble a child agent's prompt. Children never receive the Leader section: they get their
 * role boundary, the task contract, their real tools, and a fixed report format.
 */
export function assembleChildPrompt({
  role = { id: 'worker' },
  node,
  runId,
  modelRef,
  effort,
  categoryId,
  categoryDescription,
  tools = [],
  writeScope,
  skillSummaries = [],
  workspacePath,
  userConstraints = [],
} = {}) {
  const review = isReviewRole(role);
  const writes = Boolean(role.workspace?.write);
  const sections = [
    `# Delegated task: ${node.title ?? node.id}`,
    `You are a ${role.id} sub-agent started by a Leader agent (run ${runId}, node ${node.id}). You do not talk to the user; your final message is returned to the Leader, who verifies it.`,
    `## Role\n${role.description ?? role.id}${role.specialization ? `\nSpecialization: ${role.specialization}` : ''}${review ? '\nYou review independently: inspect the work yourself and do not modify it.' : ''}`,
    `## Task\n${node.responsibility}`,
    node.inputs?.length ? `## Inputs\n${node.inputs.map((item) => `- ${item}`).join('\n')}` : '',
    node.outputs?.length ? `## Expected outputs\n${node.outputs.map((item) => `- ${item}`).join('\n')}` : '',
    `## Acceptance criteria\n${(node.acceptance?.length ? node.acceptance : ['Return a verifiable result with evidence.']).map((item) => `- ${item}`).join('\n')}`,
    userConstraints.length ? `## User constraints\n${userConstraints.map((item) => `- ${item}`).join('\n')}` : '',
    [
      '## Boundaries',
      `- Tools available to you: ${tools.length ? tools.join(', ') : 'the host default set'}.`,
      writes
        ? `- You may modify files${writeScope?.length ? ` only under: ${writeScope.join(', ')}` : ' that the task requires'}. Do not touch unrelated files.`
        : '- Read-only: do not create, modify, or delete project files.',
      workspacePath ? `- Work inside ${workspacePath}.` : '',
      '- Do not ask the user questions. If information is missing, make the smallest safe assumption and list it under Open issues.',
      '- Report only work you actually did; never claim a test passed without running it.',
    ].filter(Boolean).join('\n'),
    categoryId ? `## Category\n${categoryId}${categoryDescription ? `: ${categoryDescription}` : ''}` : '',
    skillSummaries.length ? `## Skills\nLoad these with the skill tool when relevant:\n${skillSummaries.map((skill) => `- ${skill.id}${skill.version ? ` (${skill.version})` : ''}: ${skill.summary ?? skill.description ?? ''}`).join('\n')}` : '',
    modelRef || effort ? `## Runtime\n${modelRef ? `Model: ${modelRef}.` : ''}${effort ? ` Reasoning effort: ${effort}.` : ''}`.trim() : '',
    review ? REVIEW_OUTPUT : WORKER_OUTPUT,
  ];
  return sections.filter(Boolean).join('\n\n');
}

/** Short persona registered on providers that support one (shadows the deployment persona). */
export function childPersona(role, node) {
  return [
    `You are a delegated ${role.id} sub-agent.`,
    role.description,
    role.workspace?.write ? 'You may write only within your assigned scope.' : 'You are read-only.',
    `Current node: ${node.title ?? node.id}.`,
  ].filter(Boolean).join(' ');
}

/** Leader prompt for previews and the runtime's Leader-side assembly. */
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
    roleId === 'leader' ? '' : `Active role: ${roleId}.`,
    modelRef ? `Resolved model: ${modelRef}.` : '',
    categoryId ? `Execution category: ${categoryId}.` : '',
    task ? `Task contract:\n${renderTask(task)}` : '',
    specializedDefinition ? `Specialized role contract:\n${JSON.stringify(cloneJson(specializedDefinition), null, 2)}` : '',
    skillSummaries.length ? `Available skill bindings:\n${skillSummaries.map((skill) => `- ${skill.id} (${skill.version ?? 'unversioned'}): ${skill.summary ?? skill.description ?? 'no summary'}`).join('\n')}` : '',
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
  return JSON.stringify(cloneJson({
    objective: task.objective,
    inputs: task.inputs ?? [],
    outputs: task.outputs ?? [],
    dependencies: task.dependencies ?? [],
    acceptance: task.acceptance ?? [],
    ...(task.writeScope === undefined ? {} : { writeScope: task.writeScope }),
  }), null, 2);
}
