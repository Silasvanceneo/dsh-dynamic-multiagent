import { DynamicMultiagentError } from './errors.js';
import { assertArray, assertString, cloneJson, nowIso } from './validation.js';

export const MODEL_CAPABILITIES = Object.freeze([
  'reasoning',
  'coding',
  'writing',
  'long-context',
  'tool-calling',
  'multimodal',
  'low-latency',
]);

export class ModelDirectory {
  constructor({ connections = [], profiles = [], defaults = {} } = {}) {
    this.set({ connections, profiles, defaults });
  }

  set({ connections = [], profiles = [], defaults = {} }) {
    this.connections = new Map(connections.map((connection) => [connection.id, cloneJson(connection)]));
    this.profiles = new Map(profiles.map((profile) => [profile.ref, normalizeProfile(profile)]));
    this.defaults = {
      leader: defaults.leader,
      roles: { ...(defaults.roles ?? {}) },
      categories: { ...(defaults.categories ?? {}) },
    };
    this.models = new Map();
    for (const connection of this.connections.values()) {
      for (const model of connection.models) {
        const ref = `${connection.id}:${model.id}`;
        this.models.set(ref, { ref, connectionId: connection.id, model: model.id, label: model.label, profile: this.profiles.get(ref) });
      }
    }
    for (const profile of this.profiles.values()) {
      if (!this.models.has(profile.ref)) {
        const separator = profile.ref.indexOf(':');
        if (separator > 0) {
          const connectionId = profile.ref.slice(0, separator);
          const model = profile.ref.slice(separator + 1);
          if (this.connections.has(connectionId)) this.models.set(profile.ref, { ref: profile.ref, connectionId, model, profile });
        }
      }
    }
  }

  list() {
    return [...this.models.values()].map((entry) => ({
      ref: entry.ref,
      connectionId: entry.connectionId,
      model: entry.model,
      label: entry.label ?? entry.profile?.label,
      capabilities: entry.profile?.capabilities ?? [],
      limitations: entry.profile?.limitations ?? [],
      evidence: entry.profile?.evidence ?? [],
    }));
  }

  get(ref) {
    const model = this.models.get(ref);
    if (!model) throw new DynamicMultiagentError('model-not-found', `Model "${ref}" is not available`);
    return cloneJson(model);
  }

  resolveLeader(explicitRef) {
    const ref = explicitRef ?? this.defaults.leader;
    if (!ref) throw new DynamicMultiagentError('leader-model-required', 'A fixed Leader model must be configured before starting a run');
    const model = this.get(ref);
    return {
      ...model,
      assignment: 'leader-explicit',
      resolvedAt: nowIso(),
    };
  }

  assign({ roleId, categoryId, explicitRef, requirements = [], permittedConnections } = {}) {
    const requested = explicitRef ?? this.defaults.roles?.[roleId] ?? this.defaults.categories?.[categoryId];
    const candidates = this.list().filter((candidate) => permittedConnections === undefined || permittedConnections.includes(candidate.connectionId));
    if (requested !== undefined) {
      const selected = this.get(requested);
      const missing = requirements.filter((required) => !(selected.profile?.capabilities ?? []).includes(required));
      return {
        ...selected,
        assignment: explicitRef ? 'task-explicit' : roleId && this.defaults.roles?.[roleId] ? 'role-default' : 'category-default',
        requirements: [...requirements],
        compatible: missing.length === 0,
        missingCapabilities: missing,
        suggestion: missing.length ? this.suggest({ requirements, candidates }) : undefined,
        resolvedAt: nowIso(),
      };
    }
    const selected = this.suggest({ requirements, candidates });
    if (!selected) throw new DynamicMultiagentError('no-compatible-model', `No available model satisfies ${requirements.join(', ') || 'the task requirements'}`);
    return {
      ...selected,
      assignment: 'leader-selected',
      requirements: [...requirements],
      compatible: true,
      missingCapabilities: [],
      resolvedAt: nowIso(),
    };
  }

  suggest({ requirements = [], candidates = this.list() } = {}) {
    const required = new Set(requirements);
    const ranked = candidates
      .map((candidate) => {
        const capabilities = new Set(candidate.capabilities ?? []);
        const matches = [...required].filter((requirement) => capabilities.has(requirement)).length;
        const missing = [...required].filter((requirement) => !capabilities.has(requirement));
        return { candidate, matches, missing };
      })
      .filter((entry) => entry.missing.length === 0)
      .sort((left, right) => right.matches - left.matches || left.candidate.ref.localeCompare(right.candidate.ref));
    return ranked[0]?.candidate;
  }

  ensureCompatible(assignment, { allowSuggestion = false } = {}) {
    if (assignment.compatible) return assignment;
    if (allowSuggestion && assignment.suggestion) return assignment.suggestion;
    throw new DynamicMultiagentError('model-incompatible', `Model "${assignment.ref}" does not satisfy: ${assignment.missingCapabilities.join(', ')}`, {
      details: { assignment, suggestion: assignment.suggestion },
    });
  }
}

function normalizeProfile(profile) {
  if (!profile || typeof profile !== 'object') throw new DynamicMultiagentError('invalid-model-profile', 'Model profile must be an object');
  const ref = assertString(profile.ref, 'modelProfile.ref');
  const capabilities = assertArray(profile.capabilities ?? [], `modelProfile(${ref}).capabilities`).map((capability) => {
    if (!MODEL_CAPABILITIES.includes(capability)) throw new DynamicMultiagentError('invalid-model-profile', `Unknown capability "${capability}" in ${ref}`);
    return capability;
  });
  return {
    ref,
    label: profile.label,
    capabilities,
    limitations: assertArray(profile.limitations ?? [], `modelProfile(${ref}).limitations`),
    evidence: assertArray(profile.evidence ?? [], `modelProfile(${ref}).evidence`),
    limits: profile.limits ? cloneJson(profile.limits) : {},
  };
}

