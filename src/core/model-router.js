import { DynamicMultiagentError } from './errors.js';
import { assertArray, assertString, cloneJson, nowIso } from './validation.js';
import { EFFORT_LEVELS } from './thinking.js';

export const MODEL_CAPABILITIES = Object.freeze([
  'reasoning',
  'coding',
  'writing',
  'long-context',
  'tool-calling',
  'multimodal',
  'low-latency',
]);

/** Advanced connections are registered with dsh as their own provider routes under this prefix. */
export const CONNECTION_ROUTE_PREFIX = 'dma-';

export function connectionRoute(connectionId) {
  return `${CONNECTION_ROUTE_PREFIX}${connectionId}`;
}

/**
 * Directory of models the orchestrator may assign. Two sources feed it:
 * - `connection`: models declared on an advanced (plugin-owned) connection;
 * - `host`: dsh provider routes the user added through a model profile (`provider:model`).
 * Reasoning efforts come from the connection entry or from the host catalog
 * (`ctx.llm.resolveModelInfo`), so routing can validate an effort before a child starts.
 */
export class ModelDirectory {
  constructor({ connections = [], modelProfiles, profiles, defaults = {} } = {}) {
    this.hostCatalog = new Map();
    this.hostCatalogLoaded = false;
    this.set({ connections, modelProfiles: modelProfiles ?? profiles ?? [], defaults });
  }

  set({ connections = [], modelProfiles, profiles, defaults = {} } = {}) {
    this.connections = new Map(connections.map((connection) => [connection.id, cloneJson(connection)]));
    this.profiles = new Map((modelProfiles ?? profiles ?? []).map((profile) => [profile.ref, normalizeProfile(profile)]));
    this.defaults = {
      leader: defaults.leader,
      roles: { ...(defaults.roles ?? {}) },
      categories: { ...(defaults.categories ?? {}) },
      roleEfforts: { ...(defaults.roleEfforts ?? {}) },
      categoryEfforts: { ...(defaults.categoryEfforts ?? {}) },
    };
    this.models = new Map();
    for (const connection of this.connections.values()) {
      for (const model of connection.models) {
        const ref = `${connection.id}:${model.id}`;
        this.models.set(ref, {
          ref,
          source: 'connection',
          connectionId: connection.id,
          model: model.id,
          label: model.label,
          route: { provider: connectionRoute(connection.id), model: model.id },
          declared: model,
        });
      }
    }
    for (const profile of this.profiles.values()) {
      if (this.models.has(profile.ref)) continue;
      const separator = profile.ref.indexOf(':');
      if (separator <= 0 || separator === profile.ref.length - 1) continue;
      const prefix = profile.ref.slice(0, separator);
      const model = profile.ref.slice(separator + 1);
      if (this.connections.has(prefix)) {
        this.models.set(profile.ref, { ref: profile.ref, source: 'connection', connectionId: prefix, model, route: { provider: connectionRoute(prefix), model } });
      } else {
        this.models.set(profile.ref, { ref: profile.ref, source: 'host', connectionId: prefix, model, route: { provider: prefix, model } });
      }
    }
  }

  /** Replace the host catalog snapshot: `[{ provider, id, name, efforts, defaultEffort, contextWindow, vision }]`. */
  setHostCatalog(models) {
    this.hostCatalog = new Map(models.map((model) => [`${model.provider}:${model.id}`, cloneJson(model)]));
    this.hostCatalogLoaded = true;
  }

  list() {
    return [...this.models.values()].map((entry) => this.describe(entry));
  }

  get(ref) {
    const entry = this.models.get(ref);
    if (!entry) {
      const known = [...this.models.keys()];
      throw new DynamicMultiagentError('model-not-found', `Model "${ref}" is not available${known.length ? `; configured models: ${known.join(', ')}` : '; no models are configured, leave "model" empty to inherit the Leader model'}`);
    }
    return { ...this.describe(entry), profile: cloneJson(this.profiles.get(ref)) };
  }

  has(ref) {
    return this.models.has(ref);
  }

  describe(entry) {
    const profile = this.profiles.get(entry.ref);
    const host = entry.source === 'host' ? this.hostCatalog.get(entry.ref) : undefined;
    const declared = entry.declared;
    const efforts = entry.source === 'connection'
      ? [...(declared?.efforts ?? [])]
      : host ? [...(host.efforts ?? [])] : undefined;
    return {
      ref: entry.ref,
      source: entry.source,
      connectionId: entry.connectionId,
      provider: entry.route.provider,
      model: entry.model,
      route: { ...entry.route },
      label: entry.label ?? profile?.label ?? host?.name,
      capabilities: [...(profile?.capabilities ?? [])],
      limitations: [...(profile?.limitations ?? [])],
      evidence: cloneJson(profile?.evidence ?? []),
      efforts,
      defaultEffort: host?.defaultEffort,
      contextWindow: profile?.limits?.contextWindow ?? declared?.contextWindow ?? host?.contextWindow,
      maxOutputTokens: profile?.limits?.maxOutputTokens ?? declared?.maxTokens,
      available: entry.source === 'host' ? (this.hostCatalogLoaded ? host !== undefined : undefined) : true,
    };
  }

  /**
   * Resolve the fixed Leader. The Leader is the conversation's own model in dsh; a configured
   * default or an explicit ref is recorded when it names a directory model.
   */
  resolveLeader(explicitRef, { current } = {}) {
    const ref = explicitRef ?? this.defaults.leader ?? current?.ref;
    if (!ref) throw new DynamicMultiagentError('leader-model-required', 'No Leader model: select a model for this conversation or configure a default Leader');
    const assignment = explicitRef ? 'leader-explicit' : this.defaults.leader ? 'leader-default' : 'leader-session';
    if (this.models.has(ref)) return { ...this.get(ref), assignment, resolvedAt: nowIso() };
    if (current && ref === current.ref) {
      return {
        ref,
        source: 'host',
        connectionId: current.provider,
        provider: current.provider,
        model: current.model,
        route: { provider: current.provider, model: current.model },
        capabilities: [],
        efforts: this.hostCatalog.get(ref)?.efforts,
        assignment,
        resolvedAt: nowIso(),
      };
    }
    return { ...this.get(ref), assignment, resolvedAt: nowIso() };
  }

  /**
   * Pick a model and reasoning effort for one task node.
   * Order: explicit node model → role default → category default → best profiled match →
   * inherit the Leader's model. An explicit effort the model does not offer is rejected;
   * a default effort the model does not offer is dropped with a note.
   */
  assign({ roleId, categoryId, explicitRef, requirements = [], permittedConnections, effort, inherit } = {}) {
    const requested = explicitRef ?? this.defaults.roles?.[roleId] ?? this.defaults.categories?.[categoryId];
    const candidates = this.list().filter((candidate) => candidate.available !== false && (permittedConnections === undefined || permittedConnections.includes(candidate.connectionId)));
    let result;
    if (requested !== undefined) {
      const selected = this.get(requested);
      const missing = requirements.filter((required) => !(selected.capabilities ?? []).includes(required));
      result = {
        ...selected,
        assignment: explicitRef ? 'task-explicit' : roleId && this.defaults.roles?.[roleId] ? 'role-default' : 'category-default',
        requirements: [...requirements],
        compatible: missing.length === 0,
        missingCapabilities: missing,
        suggestion: missing.length ? this.suggest({ requirements, candidates }) : undefined,
      };
    } else {
      const selected = this.suggest({ requirements, candidates });
      if (selected) {
        result = { ...selected, assignment: 'leader-selected', requirements: [...requirements], compatible: true, missingCapabilities: [] };
      } else if (inherit) {
        result = {
          ...cloneJson(inherit),
          assignment: 'leader-inherited',
          inherited: true,
          requirements: [...requirements],
          compatible: true,
          missingCapabilities: [],
          note: candidates.length
            ? `No configured model satisfies ${requirements.join(', ') || 'the task'}; the child inherits the Leader model`
            : 'No models are configured; the child inherits the Leader model',
        };
      } else {
        throw new DynamicMultiagentError('no-compatible-model', `No available model satisfies ${requirements.join(', ') || 'the task requirements'}`);
      }
    }
    return { ...result, ...this.resolveEffort(result, { roleId, categoryId, effort }), resolvedAt: nowIso() };
  }

  resolveEffort(model, { roleId, categoryId, effort }) {
    const source = effort !== undefined ? 'task-explicit'
      : this.defaults.roleEfforts?.[roleId] !== undefined ? 'role-default'
        : this.defaults.categoryEfforts?.[categoryId] !== undefined ? 'category-default' : undefined;
    const wanted = effort ?? this.defaults.roleEfforts?.[roleId] ?? this.defaults.categoryEfforts?.[categoryId];
    if (wanted === undefined || wanted === '') return { effort: undefined };
    const offered = model.efforts;
    if (offered === undefined) {
      if (!EFFORT_LEVELS.includes(wanted)) throw new DynamicMultiagentError('effort-unsupported', `Reasoning effort "${wanted}" is not a known level (${EFFORT_LEVELS.join(', ')})`);
      return { effort: wanted, effortSource: source };
    }
    if (offered.includes(wanted)) return { effort: wanted, effortSource: source };
    if (source === 'task-explicit') {
      throw new DynamicMultiagentError('effort-unsupported', `Model "${model.ref}" does not offer reasoning effort "${wanted}"${offered.length ? `; offered: ${offered.join(', ')}` : '; it has no selectable effort, omit "effort"'}`);
    }
    return { effort: undefined, effortNote: `Default effort "${wanted}" is not offered by ${model.ref}; the model default applies` };
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
