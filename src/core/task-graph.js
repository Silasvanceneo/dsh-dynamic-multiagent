import { DynamicMultiagentError } from './errors.js';
import { assertArray, assertEnum, assertRecord, assertString, cloneJson, makeId, nowIso } from './validation.js';

export const COLLABORATION_MODES = Object.freeze(['parallel', 'pipeline', 'execute-review', 'dependency-graph', 'multi-level']);
export const NODE_STATUSES = Object.freeze(['pending', 'ready', 'running', 'reviewing', 'completed', 'failed', 'blocked', 'cancelled']);

export class TaskGraphError extends DynamicMultiagentError {
  constructor(code, message, options = {}) {
    super(code, message, options);
    this.name = 'TaskGraphError';
  }
}

export class TaskGraph {
  constructor(plan, { roleRegistry, modelDirectory, skillRegistry } = {}) {
    this.plan = validatePlan(plan, { roleRegistry, modelDirectory, skillRegistry });
    this.nodes = new Map(this.plan.nodes.map((node) => [node.id, {
      ...cloneJson(node),
      status: node.status ?? 'pending',
      attempts: node.attempts ?? 0,
      result: node.result,
      review: node.review,
      failure: node.failure,
    }]));
    this.startedAt = undefined;
    this.updatedAt = nowIso();
  }

  ready() {
    const ready = [];
    for (const node of this.nodes.values()) {
      if (node.status !== 'pending' && node.status !== 'ready') continue;
      const dependencies = node.dependencies ?? [];
      const unresolved = dependencies.filter((id) => {
        const dependency = this.nodes.get(id);
        return !dependency || dependency.status !== 'completed';
      });
      const failed = dependencies.some((id) => ['failed', 'blocked', 'cancelled'].includes(this.nodes.get(id)?.status));
      if (failed) {
        node.status = 'blocked';
        node.failure = { code: 'dependency-failed', dependencies: unresolved };
        continue;
      }
      if (unresolved.length === 0) {
        node.status = 'ready';
        ready.push(cloneJson(node));
      }
    }
    this.updatedAt = nowIso();
    return ready;
  }

  start(nodeId) {
    const node = this.get(nodeId);
    if (!['pending', 'ready'].includes(node.status)) throw new TaskGraphError('node-not-ready', `Node "${nodeId}" is ${node.status}`);
    const blockers = (node.dependencies ?? []).filter((id) => this.nodes.get(id)?.status !== 'completed');
    if (blockers.length) throw new TaskGraphError('dependencies-incomplete', `Node "${nodeId}" is blocked by ${blockers.join(', ')}`);
    node.status = 'running';
    node.attempts += 1;
    this.startedAt ??= nowIso();
    this.updatedAt = nowIso();
    return cloneJson(node);
  }

  beginReview(nodeId) {
    const node = this.get(nodeId);
    if (node.status !== 'running') throw new TaskGraphError('node-not-running', `Node "${nodeId}" is ${node.status}`);
    node.status = 'reviewing';
    this.updatedAt = nowIso();
    return cloneJson(node);
  }

  complete(nodeId, result, { evidence = [], review = undefined } = {}) {
    const node = this.get(nodeId);
    if (!['running', 'reviewing'].includes(node.status)) throw new TaskGraphError('node-not-active', `Node "${nodeId}" is ${node.status}`);
    node.status = 'completed';
    node.result = cloneJson(result);
    node.evidence = cloneJson(evidence);
    if (review !== undefined) node.review = cloneJson(review);
    this.updatedAt = nowIso();
    return cloneJson(node);
  }

  fail(nodeId, failure, { retry = false } = {}) {
    const node = this.get(nodeId);
    if (!['running', 'reviewing', 'pending', 'ready'].includes(node.status)) throw new TaskGraphError('node-not-active', `Node "${nodeId}" is ${node.status}`);
    node.failure = cloneJson(failure);
    node.status = retry ? 'pending' : 'failed';
    this.updatedAt = nowIso();
    return cloneJson(node);
  }

  cancel(reason = 'cancelled') {
    for (const node of this.nodes.values()) {
      if (!['completed', 'failed', 'blocked', 'cancelled'].includes(node.status)) {
        node.status = 'cancelled';
        node.failure = { code: 'cancelled', reason };
      }
    }
    this.updatedAt = nowIso();
  }

  isComplete() {
    return [...this.nodes.values()].every((node) => ['completed', 'failed', 'blocked', 'cancelled'].includes(node.status));
  }

  hasFailure() {
    return [...this.nodes.values()].some((node) => ['failed', 'blocked'].includes(node.status));
  }

  get(nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node) throw new TaskGraphError('node-not-found', `Task node "${nodeId}" is not in the graph`);
    return node;
  }

  snapshot() {
    return {
      plan: cloneJson(this.plan),
      nodes: [...this.nodes.values()].map(cloneJson),
      startedAt: this.startedAt,
      updatedAt: this.updatedAt,
    };
  }
}

export function validatePlan(input, { roleRegistry, modelDirectory, skillRegistry, categoryIds } = {}) {
  const plan = assertRecord(input, 'plan');
  const mode = assertEnum(plan.mode, COLLABORATION_MODES, 'plan.mode');
  const nodes = assertArray(plan.nodes, 'plan.nodes').map((node, index) => normalizeNode(node, index));
  if (!nodes.length) throw new TaskGraphError('plan-empty', 'A collaboration plan must contain at least one task node');
  const ids = new Set();
  for (const node of nodes) {
    if (ids.has(node.id)) throw new TaskGraphError('node-duplicate', `Task node "${node.id}" appears more than once`);
    ids.add(node.id);
  }
  for (const node of nodes) {
    for (const dependency of node.dependencies) if (!ids.has(dependency)) throw new TaskGraphError('dependency-missing', `Node "${node.id}" depends on unknown node "${dependency}"`);
    if (node.roleId && roleRegistry) roleRegistry.get(node.roleId);
    if (node.model && modelDirectory) modelDirectory.get(node.model);
    if (node.categoryId && categoryIds && !categoryIds.includes(node.categoryId)) throw new TaskGraphError('category-not-found', `Node "${node.id}" uses unknown category "${node.categoryId}"; use one of ${categoryIds.join(', ')}`);
    if (node.skills && skillRegistry) for (const skill of node.skills) skillRegistry.get(skill);
  }
  assertAcyclic(nodes);
  const teams = assertArray(plan.teams ?? [], 'plan.teams').map(normalizeTeam);
  const teamIds = new Set(teams.map((team) => team.id));
  for (const node of nodes) if (node.teamId !== undefined && !teamIds.has(node.teamId)) throw new TaskGraphError('team-missing', `Node "${node.id}" references unknown team "${node.teamId}"`);
  return {
    planVersion: Number.isSafeInteger(plan.planVersion) && plan.planVersion > 0 ? plan.planVersion : 1,
    mode,
    summary: assertString(plan.summary ?? 'Dynamic collaboration plan', 'plan.summary'),
    rationale: assertString(plan.rationale ?? 'Delegation has a concrete benefit for this task.', 'plan.rationale'),
    userConstraints: assertArray(plan.userConstraints ?? [], 'plan.userConstraints').map((item) => assertString(item, 'plan.userConstraints[]')),
    teams,
    nodes,
    acceptance: assertArray(plan.acceptance ?? [], 'plan.acceptance').map((item) => assertString(item, 'plan.acceptance[]')),
    createdAt: plan.createdAt ?? nowIso(),
  };
}

function normalizeNode(input, index) {
  const path = `plan.nodes[${index}]`;
  const node = assertRecord(input, path);
  const id = assertString(node.id, `${path}.id`);
  const status = node.status === undefined ? 'pending' : assertEnum(node.status, NODE_STATUSES, `${path}.status`);
  return {
    id,
    title: assertString(node.title ?? id, `${path}.title`),
    responsibility: assertString(node.responsibility, `${path}.responsibility`),
    roleId: node.roleId === undefined ? undefined : assertString(node.roleId, `${path}.roleId`),
    categoryId: node.categoryId === undefined ? undefined : assertString(node.categoryId, `${path}.categoryId`),
    model: node.model === undefined || node.model === null || node.model === '' ? undefined : assertString(node.model, `${path}.model`),
    effort: node.effort === undefined || node.effort === null || node.effort === '' ? undefined : assertString(node.effort, `${path}.effort`),
    skills: assertArray(node.skills ?? [], `${path}.skills`).map((item) => assertString(item, `${path}.skills[]`)),
    tools: assertArray(node.tools ?? [], `${path}.tools`).map((item) => assertString(item, `${path}.tools[]`)),
    inputs: assertArray(node.inputs ?? [], `${path}.inputs`).map((item) => assertString(item, `${path}.inputs[]`)),
    outputs: assertArray(node.outputs ?? [], `${path}.outputs`).map((item) => assertString(item, `${path}.outputs[]`)),
    acceptance: assertArray(node.acceptance ?? [], `${path}.acceptance`).map((item) => assertString(item, `${path}.acceptance[]`)),
    dependencies: assertArray(node.dependencies ?? [], `${path}.dependencies`).map((item) => assertString(item, `${path}.dependencies[]`)),
    teamId: node.teamId === undefined ? undefined : assertString(node.teamId, `${path}.teamId`),
    writeScope: node.writeScope === undefined ? undefined : assertArray(node.writeScope, `${path}.writeScope`).map((item) => assertString(item, `${path}.writeScope[]`)),
    status,
    attempts: Number.isSafeInteger(node.attempts) && node.attempts >= 0 ? node.attempts : 0,
    ...(node.result === undefined ? {} : { result: cloneJson(node.result) }),
  };
}

function normalizeTeam(input) {
  const team = assertRecord(input, 'plan.teams[]');
  return {
    id: assertString(team.id, 'plan.teams[].id'),
    parentTeamId: team.parentTeamId === undefined ? undefined : assertString(team.parentTeamId, 'plan.teams[].parentTeamId'),
    leadNodeId: team.leadNodeId === undefined ? undefined : assertString(team.leadNodeId, 'plan.teams[].leadNodeId'),
    memberNodeIds: assertArray(team.memberNodeIds ?? [], 'plan.teams[].memberNodeIds').map((item) => assertString(item, 'plan.teams[].memberNodeIds[]')),
  };
}

function assertAcyclic(nodes) {
  const map = new Map(nodes.map((node) => [node.id, node.dependencies]));
  const visiting = new Set();
  const visited = new Set();
  const visit = (id, path) => {
    if (visiting.has(id)) throw new TaskGraphError('dependency-cycle', `Dependency cycle detected: ${[...path, id].join(' -> ')}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of map.get(id) ?? []) visit(dependency, [...path, id]);
    visiting.delete(id);
    visited.add(id);
  };
  for (const node of nodes) visit(node.id, []);
}

export function makeSingleNodePlan({ objective, responsibility = objective, roleId = 'worker', model, categoryId = 'unspecified-low', acceptance = ['Deliver the requested result with evidence'] } = {}) {
  return {
    planVersion: 1,
    mode: 'dependency-graph',
    summary: objective,
    rationale: 'The task is represented as one explicit contract before execution.',
    nodes: [{
      id: makeId('task'),
      title: objective,
      responsibility,
      roleId,
      model,
      categoryId,
      inputs: [],
      outputs: ['result'],
      acceptance,
      dependencies: [],
    }],
    acceptance,
  };
}

