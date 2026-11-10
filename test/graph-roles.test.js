import test from 'node:test';
import assert from 'node:assert/strict';
import { ModelDirectory } from '../src/core/model-router.js';
import { RoleRegistry } from '../src/core/roles.js';
import { TaskGraph, validatePlan } from '../src/core/task-graph.js';
import { assembleSystemPrompt } from '../src/core/prompt.js';

function modelDirectory() {
  return new ModelDirectory({
    connections: [
      { id: 'openai', protocol: 'openai-chat', baseUrl: 'http://127.0.0.1:9000/v1', models: [{ id: 'coder' }] },
      { id: 'anthropic', protocol: 'anthropic-messages', baseUrl: 'http://127.0.0.1:9001/v1', models: [{ id: 'researcher' }] },
    ],
    profiles: [
      { ref: 'openai:coder', capabilities: ['coding', 'tool-calling'] },
      { ref: 'anthropic:researcher', capabilities: ['reasoning', 'writing', 'long-context'] },
    ],
    defaults: { leader: 'openai:coder' },
  });
}

test('validates and schedules an acyclic graph', () => {
  const directory = modelDirectory();
  const roles = new RoleRegistry({ availableSkills: [], knownTools: [] });
  const plan = validatePlan({
    mode: 'dependency-graph',
    summary: 'two-stage task',
    rationale: 'research then implement',
    nodes: [
      { id: 'research', responsibility: 'collect evidence', roleId: 'librarian', model: 'anthropic:researcher', outputs: ['notes'], acceptance: ['sources'] },
      { id: 'implement', responsibility: 'apply the result', roleId: 'worker', model: 'openai:coder', dependencies: ['research'], outputs: ['patch'], acceptance: ['tests'] },
    ],
  }, { roleRegistry: roles, modelDirectory: directory });
  const graph = new TaskGraph(plan);
  assert.deepEqual(graph.ready().map((node) => node.id), ['research']);
  graph.start('research');
  graph.complete('research', { notes: 'evidence' });
  assert.deepEqual(graph.ready().map((node) => node.id), ['implement']);
});

test('rejects dependency cycles', () => {
  assert.throws(() => validatePlan({
    mode: 'dependency-graph',
    summary: 'cycle',
    rationale: 'invalid',
    nodes: [
      { id: 'a', responsibility: 'a', dependencies: ['b'] },
      { id: 'b', responsibility: 'b', dependencies: ['a'] },
    ],
  }), (error) => error.code === 'dependency-cycle');
});

test('derived role cannot widen write or delegation permissions', () => {
  const roles = new RoleRegistry();
  assert.throws(() => roles.derive({
    id: 'unsafe',
    baseRole: 'code-reviewer',
    specialization: 'unsafe',
    whyNeeded: 'test',
    objective: 'test',
    tools: [],
    workspace: { write: true, paths: [] },
    delegation: { allowed: false, maxDepth: 0 },
    skills: [],
    deliverables: ['report'],
    acceptance: ['evidence'],
    evidenceRequired: ['diff'],
  }), (error) => error.code === 'role-permission-widening');
});

test('prompt assembly contains only the active stage', () => {
  const prompt = assembleSystemPrompt({ roleId: 'planner', stage: 'planning', modelRef: 'openai:coder', task: { objective: 'plan a task', acceptance: ['valid DAG'] } });
  assert.match(prompt, /You are the Leader of this conversation/);
  assert.match(prompt, /structured collaboration plan/);
  assert.doesNotMatch(prompt, /Execute only nodes whose dependencies are complete/);
});

