import { DynamicMultiagentError } from './errors.js';
import { assertArray, assertEnum, assertRecord, assertString, cloneJson, deepFreeze, nowIso } from './validation.js';

export const TASK_CATEGORIES = Object.freeze({
  quick: { description: 'Small bounded changes or short tasks.', capabilities: [] },
  'visual-engineering': { description: 'UI, frontend, visual presentation, and interaction work.', capabilities: ['coding'] },
  writing: { description: 'Documents, reports, explanations, and other text deliverables.', capabilities: ['writing'] },
  ultrabrain: { description: 'Complex reasoning, algorithms, and difficult technical problems.', capabilities: ['reasoning'] },
  'deep-low': { description: 'One clear goal requiring ordinary autonomous execution.', capabilities: [] },
  'deep-high': { description: 'A complex goal requiring deep exploration and judgment.', capabilities: ['reasoning'] },
  artistry: { description: 'Creative expression, design exploration, and unconventional solutions.', capabilities: ['writing'] },
  architect: { description: 'System design and cross-module technical judgment.', capabilities: ['reasoning'] },
  'unspecified-low': { description: 'General work not covered by another category.', capabilities: [] },
  'unspecified-high': { description: 'Complex work not covered by another category.', capabilities: ['reasoning'] },
});

export const BUILTIN_ROLES = Object.freeze({
  leader: role('leader', 'Fixed user-facing entry point that plans, dispatches, verifies, and delivers.', ['orchestrate', 'read', 'private-write'], ['leader']),
  planner: role('planner', 'Forms goals, steps, dependencies, ownership, and acceptance conditions.', ['read', 'plan'], ['planner']),
  'plan-consultant': role('plan-consultant', 'Finds omissions, ambiguity, hidden dependencies, and failure points.', ['read', 'plan-review'], ['plan-consultant']),
  'plan-reviewer': role('plan-reviewer', 'Checks a plan for completeness, executability, and evidence.', ['read', 'plan-review'], ['plan-reviewer']),
  'architecture-consultant': role('architecture-consultant', 'Advises on architecture trade-offs and complex diagnosis.', ['read', 'architecture'], ['architecture-consultant']),
  explore: role('explore', 'Searches the project and maps implementation evidence.', ['read', 'search'], ['explore']),
  librarian: role('librarian', 'Researches documentation and reference implementations.', ['read', 'research'], ['librarian']),
  'multimodal-looker': role('multimodal-looker', 'Interprets images and supported media with evidence.', ['read', 'media'], ['multimodal-looker']),
  worker: role('worker', 'Completes one bounded task under a role and category contract.', ['read', 'write-assigned'], ['worker']),
  'deep-worker': role('deep-worker', 'Explores, implements, and checks a complex target autonomously.', ['read', 'write-assigned'], ['deep-worker']),
  'team-lead': role('team-lead', 'Coordinates an authorized subgraph and reports its combined result.', ['read', 'delegate-subgraph'], ['team-lead']),
  'code-reviewer': role('code-reviewer', 'Reviews changes for correctness, risk, and maintainability.', ['read', 'review'], ['code-reviewer']),
  'qa-executor': role('qa-executor', 'Runs tests and real behavior checks without changing product code.', ['read', 'test-artifacts'], ['qa-executor']),
  'gate-reviewer': role('gate-reviewer', 'Determines whether final completion conditions and evidence are met.', ['read', 'review'], ['gate-reviewer']),
});

export class RoleRegistry {
  constructor({ roles = BUILTIN_ROLES, availableSkills = [], knownTools = [] } = {}) {
    this.roles = new Map(Object.entries(roles).map(([id, value]) => [id, cloneJson(value)]));
    this.availableSkills = new Set(availableSkills);
    this.knownTools = new Set(knownTools);
    this.derived = new Map();
  }

  register(definition) {
    const normalized = normalizeRole(definition);
    if (this.roles.has(normalized.id) || this.derived.has(normalized.id)) throw new DynamicMultiagentError('role-duplicate', `Role "${normalized.id}" is already registered`);
    this.roles.set(normalized.id, normalized);
    return cloneJson(normalized);
  }

  get(id) {
    const role = this.roles.get(id) ?? this.derived.get(id);
    if (!role) throw new DynamicMultiagentError('role-not-found', `Role "${id}" is not registered`);
    return cloneJson(role);
  }

  list() {
    return [...this.roles.values(), ...this.derived.values()].map(cloneJson);
  }

  derive(input) {
    const definition = normalizeSpecialized(input);
    if (this.derived.has(definition.id) || this.roles.has(definition.id)) throw new DynamicMultiagentError('role-duplicate', `Role "${definition.id}" is already registered`);
    const base = this.get(definition.baseRole);
    validateInheritance(base, definition, { knownTools: this.knownTools, availableSkills: this.availableSkills });
    const derived = {
      ...definition,
      baseRole: base.id,
      version: definition.version ?? 1,
      inherited: {
        tools: [...(base.tools ?? [])],
        workspace: cloneJson(base.workspace ?? { write: false, paths: [] }),
        delegation: cloneJson(base.delegation ?? { allowed: false, maxDepth: 0 }),
      },
      createdAt: nowIso(),
    };
    this.derived.set(derived.id, deepFreeze(derived));
    return cloneJson(derived);
  }

  updateSkills(ids) {
    this.availableSkills = new Set(ids);
  }
}

export function normalizeRole(input) {
  const value = assertRecord(input, 'role');
  const id = assertString(value.id, 'role.id');
  return {
    id,
    description: assertString(value.description, `role(${id}).description`),
    promptVersion: value.promptVersion ?? '1.0.0',
    tools: assertArray(value.tools ?? [], `role(${id}).tools`).map((tool) => assertString(tool, `role(${id}).tools[]`)),
    workspace: normalizeWorkspace(value.workspace ?? {}, `role(${id}).workspace`),
    input: assertArray(value.input ?? [], `role(${id}).input`).map((item) => assertString(item, `role(${id}).input[]`)),
    output: assertArray(value.output ?? [], `role(${id}).output`).map((item) => assertString(item, `role(${id}).output[]`)),
    acceptance: assertArray(value.acceptance ?? [], `role(${id}).acceptance`).map((item) => assertString(item, `role(${id}).acceptance[]`)),
    skills: assertArray(value.skills ?? [], `role(${id}).skills`).map((item) => assertString(item, `role(${id}).skills[]`)),
    modelDefaults: value.modelDefaults ? cloneJson(value.modelDefaults) : {},
    delegation: normalizeDelegation(value.delegation ?? {}, `role(${id}).delegation`),
  };
}

export function normalizeSpecialized(input) {
  const value = assertRecord(input, 'specializedRole');
  const id = assertString(value.id, 'specializedRole.id');
  return {
    id,
    baseRole: assertString(value.baseRole, `specializedRole(${id}).baseRole`),
    version: value.version,
    specialization: assertString(value.specialization, `specializedRole(${id}).specialization`),
    whyNeeded: assertString(value.whyNeeded, `specializedRole(${id}).whyNeeded`),
    objective: assertString(value.objective, `specializedRole(${id}).objective`),
    inputs: assertArray(value.inputs ?? [], `specializedRole(${id}).inputs`).map((item) => assertString(item, `specializedRole(${id}).inputs[]`)),
    contextRefs: assertArray(value.contextRefs ?? [], `specializedRole(${id}).contextRefs`).map((item) => assertString(item, `specializedRole(${id}).contextRefs[]`)),
    promptSections: assertRecord(value.promptSections ?? {}, `specializedRole(${id}).promptSections`),
    tools: assertArray(value.tools ?? [], `specializedRole(${id}).tools`).map((item) => assertString(item, `specializedRole(${id}).tools[]`)),
    workspace: normalizeWorkspace(value.workspace ?? {}, `specializedRole(${id}).workspace`),
    delegation: normalizeDelegation(value.delegation ?? {}, `specializedRole(${id}).delegation`),
    modelAssignment: value.modelAssignment === undefined ? undefined : assertString(value.modelAssignment, `specializedRole(${id}).modelAssignment`),
    skills: assertArray(value.skills ?? [], `specializedRole(${id}).skills`).map((item) => assertString(item, `specializedRole(${id}).skills[]`)),
    deliverables: assertArray(value.deliverables ?? [], `specializedRole(${id}).deliverables`).map((item) => assertString(item, `specializedRole(${id}).deliverables[]`)),
    acceptance: assertArray(value.acceptance ?? [], `specializedRole(${id}).acceptance`).map((item) => assertString(item, `specializedRole(${id}).acceptance[]`)),
    evidenceRequired: assertArray(value.evidenceRequired ?? [], `specializedRole(${id}).evidenceRequired`).map((item) => assertString(item, `specializedRole(${id}).evidenceRequired[]`)),
    failureBehavior: assertString(value.failureBehavior ?? 'Report the failure with evidence and stop.', `specializedRole(${id}).failureBehavior`),
  };
}

function role(id, description, tools, skills) {
  return {
    id,
    description,
    promptVersion: '1.0.0',
    tools,
    workspace: { write: id === 'leader' || id === 'worker' || id === 'deep-worker', paths: id === 'leader' ? ['private-workspace'] : [] },
    input: ['task contract'],
    output: ['structured result and evidence'],
    acceptance: ['original task acceptance conditions'],
    skills,
    modelDefaults: {},
    delegation: { allowed: id === 'leader' || id === 'team-lead', maxDepth: id === 'leader' ? Number.POSITIVE_INFINITY : 1 },
  };
}

function normalizeWorkspace(value, path) {
  const input = assertRecord(value, path);
  return {
    write: Boolean(input.write ?? false),
    paths: assertArray(input.paths ?? [], `${path}.paths`).map((item) => assertString(item, `${path}.paths[]`)),
    reportPath: input.reportPath === undefined ? undefined : assertString(input.reportPath, `${path}.reportPath`),
  };
}

function normalizeDelegation(value, path) {
  const input = assertRecord(value, path);
  return {
    allowed: Boolean(input.allowed ?? false),
    maxDepth: input.maxDepth === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : Number.isSafeInteger(input.maxDepth ?? 0) && input.maxDepth >= 0 ? input.maxDepth ?? 0 : 0,
  };
}

function validateInheritance(base, derived, { knownTools, availableSkills }) {
  if (!derived.tools.every((tool) => (base.tools ?? []).includes(tool))) throw new DynamicMultiagentError('role-permission-widening', `Derived role "${derived.id}" requests a tool outside base role "${base.id}"`);
  if (!derived.workspace.write && base.workspace?.write) {
    // Narrowing is safe; a derived role may be read-only.
  }
  if (derived.workspace.write && !base.workspace?.write) throw new DynamicMultiagentError('role-permission-widening', `Derived role "${derived.id}" cannot add write access to base role "${base.id}"`);
  const basePaths = new Set(base.workspace?.paths ?? []);
  if (derived.workspace.paths.some((path) => !basePaths.has(path))) throw new DynamicMultiagentError('role-permission-widening', `Derived role "${derived.id}" requests a workspace path outside base role "${base.id}"`);
  if (derived.delegation.allowed && !base.delegation?.allowed) throw new DynamicMultiagentError('role-permission-widening', `Derived role "${derived.id}" cannot add delegation to base role "${base.id}"`);
  if (derived.delegation.maxDepth > (base.delegation?.maxDepth ?? 0)) throw new DynamicMultiagentError('role-permission-widening', `Derived role "${derived.id}" increases delegation depth`);
  for (const tool of derived.tools) if (knownTools.size && !knownTools.has(tool)) throw new DynamicMultiagentError('tool-not-found', `Derived role "${derived.id}" references unknown tool "${tool}"`);
  for (const skill of derived.skills) if (availableSkills.size && !availableSkills.has(skill)) throw new DynamicMultiagentError('skill-not-found', `Derived role "${derived.id}" references unavailable skill "${skill}"`);
}

