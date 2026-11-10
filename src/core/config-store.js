import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DynamicMultiagentError } from './errors.js';
import { assertArray, assertRecord, assertString, cloneJson, isRecord, nowIso } from './validation.js';

export const CONFIG_VERSION = 1;

export const THINKING_MODES = Object.freeze(['none', 'openai', 'adaptive', 'budget']);

export const DEFAULT_CONFIG = Object.freeze({
  version: CONFIG_VERSION,
  revision: 0,
  enabled: true,
  sessionDefault: true,
  connections: [],
  modelProfiles: [],
  defaults: {
    leader: undefined,
    roles: {},
    categories: {},
    roleEfforts: {},
    categoryEfforts: {},
  },
  skillSources: {
    localRoots: [],
    gitRepos: [],
    autoInstall: false,
  },
  retention: {
    maxRuns: 200,
  },
});

export class ConfigStore {
  constructor(filePath, { initial = DEFAULT_CONFIG } = {}) {
    this.filePath = resolve(filePath);
    this.initial = cloneJson(initial);
    this.value = undefined;
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return cloneJson(this.value);
    let parsed;
    try {
      parsed = JSON.parse(await readFile(this.filePath, 'utf8'));
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw new DynamicMultiagentError('config-read-failed', `Cannot read ${this.filePath}`, { cause: error });
      }
      parsed = this.initial;
    }
    this.value = normalizeConfig(parsed);
    this.loaded = true;
    return cloneJson(this.value);
  }

  async save(next = this.value ?? this.initial, { expectedRevision } = {}) {
    const current = await this.load();
    if (expectedRevision !== undefined && expectedRevision !== current.revision) {
      throw new DynamicMultiagentError('config-conflict', `Configuration changed elsewhere (revision ${current.revision}, expected ${expectedRevision})`);
    }
    const normalized = normalizeConfig({ ...next, revision: current.revision + 1, updatedAt: nowIso() });
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    try {
      await writeFile(temporary, `${JSON.stringify(normalized, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, this.filePath);
    } catch (error) {
      try { await writeFile(this.filePath, `${JSON.stringify(normalized, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 }); } catch { /* preserve original failure */ }
      throw new DynamicMultiagentError('config-write-failed', `Cannot write ${this.filePath}`, { cause: error });
    }
    this.value = normalized;
    this.loaded = true;
    return cloneJson(normalized);
  }

  async update(mutator) {
    const current = await this.load();
    const changed = await mutator(cloneJson(current));
    return this.save(changed ?? current);
  }

  async redacted() {
    const config = await this.load();
    return redactConfig(config);
  }

  async connection(id) {
    const config = await this.load();
    const connection = config.connections.find((candidate) => candidate.id === id);
    if (!connection) throw new DynamicMultiagentError('connection-not-found', `Connection "${id}" is not configured`);
    return cloneJson(connection);
  }
}

export function normalizeConfig(input) {
  const source = assertRecord(input, 'config');
  const version = source.version ?? CONFIG_VERSION;
  if (version !== CONFIG_VERSION) {
    throw new DynamicMultiagentError('config-version-unsupported', `Config version ${String(version)} is not supported`);
  }
  const connections = assertArray(source.connections ?? [], 'config.connections').map((connection, index) => normalizeConnection(connection, index));
  const modelProfiles = assertArray(source.modelProfiles ?? [], 'config.modelProfiles').map((profile, index) => normalizeModelProfile(profile, index));
  const defaults = normalizeDefaults(source.defaults ?? {});
  const skillSources = normalizeSkillSources(source.skillSources ?? {});
  const retention = normalizeRetention(source.retention ?? {});
  const ids = new Set();
  for (const connection of connections) {
    if (ids.has(connection.id)) throw new DynamicMultiagentError('invalid-config', `Connection id "${connection.id}" is used more than once`);
    ids.add(connection.id);
  }
  return {
    version,
    revision: Number.isSafeInteger(source.revision) && source.revision >= 0 ? source.revision : 0,
    enabled: source.enabled === undefined ? true : Boolean(source.enabled),
    sessionDefault: source.sessionDefault === undefined ? true : Boolean(source.sessionDefault),
    connections,
    modelProfiles,
    defaults,
    skillSources,
    retention,
    updatedAt: source.updatedAt ?? nowIso(),
  };
}

function normalizeConnection(input, index) {
  const path = `config.connections[${index}]`;
  const value = assertRecord(input, path);
  const id = assertString(value.id, `${path}.id`);
  if (!/^[A-Za-z0-9._-]+$/.test(id)) throw new DynamicMultiagentError('invalid-config', `${path}.id may only contain letters, digits, ".", "_" and "-"`);
  const protocol = value.protocol;
  if (protocol !== 'openai-chat' && protocol !== 'anthropic-messages') {
    throw new DynamicMultiagentError('invalid-config', `${path}.protocol must be openai-chat or anthropic-messages`);
  }
  const baseUrl = assertString(value.baseUrl, `${path}.baseUrl`).replace(/\/+$/, '');
  let parsedUrl;
  try { parsedUrl = new URL(baseUrl); } catch (error) { throw new DynamicMultiagentError('invalid-config', `${path}.baseUrl must be a URL`, { cause: error }); }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new DynamicMultiagentError('invalid-config', `${path}.baseUrl must use http or https`);
  const models = assertArray(value.models ?? [], `${path}.models`).map((model, modelIndex) => normalizeModelRef(model, `${path}.models[${modelIndex}]`));
  if (models.length === 0) throw new DynamicMultiagentError('invalid-config', `${path}.models must not be empty`);
  const headers = value.headers === undefined ? {} : normalizeHeaders(value.headers, `${path}.headers`);
  const headerRefs = value.headerRefs === undefined ? {} : normalizeStringMap(value.headerRefs, `${path}.headerRefs`);
  return {
    id,
    protocol,
    baseUrl,
    credentialRef: normalizeCredentialRef(value.credentialRef, `${path}.credentialRef`),
    models,
    headers,
    headerRefs,
    requestTimeoutMs: normalizePositiveInt(value.requestTimeoutMs ?? 120_000, `${path}.requestTimeoutMs`),
  };
}

// dsh credential references are environment-variable style names (DEEPSEEK_API_KEY).
function normalizeCredentialRef(value, path) {
  if (value === undefined || value === null || value === '') return undefined;
  const ref = assertString(value, path).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(ref)) throw new DynamicMultiagentError('invalid-config', `${path} must be an environment-variable style name such as MY_API_KEY`);
  return ref;
}

function normalizeModelRef(input, path) {
  if (typeof input === 'string') return { id: assertString(input, path) };
  const value = assertRecord(input, path);
  const thinking = value.thinking ?? undefined;
  if (thinking !== undefined && !THINKING_MODES.includes(thinking)) {
    throw new DynamicMultiagentError('invalid-config', `${path}.thinking must be one of ${THINKING_MODES.join(', ')}`);
  }
  return {
    id: assertString(value.id, `${path}.id`),
    label: value.label === undefined || value.label === '' ? undefined : assertString(value.label, `${path}.label`),
    efforts: assertArray(value.efforts ?? [], `${path}.efforts`).map((effort) => assertString(effort, `${path}.efforts[]`)),
    thinking,
    contextWindow: value.contextWindow === undefined || value.contextWindow === null ? undefined : normalizePositiveInt(value.contextWindow, `${path}.contextWindow`),
    maxTokens: value.maxTokens === undefined || value.maxTokens === null ? undefined : normalizePositiveInt(value.maxTokens, `${path}.maxTokens`),
    vision: Boolean(value.vision ?? false),
  };
}

function normalizeModelProfile(input, index) {
  const path = `config.modelProfiles[${index}]`;
  const value = assertRecord(input, path);
  const ref = assertString(value.ref, `${path}.ref`);
  const capabilities = assertArray(value.capabilities ?? [], `${path}.capabilities`).map((capability) => assertString(capability, `${path}.capabilities[]`));
  const limits = value.limits === undefined ? {} : assertRecord(value.limits, `${path}.limits`);
  return {
    ref,
    label: value.label === undefined ? undefined : assertString(value.label, `${path}.label`),
    capabilities,
    limitations: assertArray(value.limitations ?? [], `${path}.limitations`).map((item) => assertString(item, `${path}.limitations[]`)),
    evidence: assertArray(value.evidence ?? [], `${path}.evidence`).map((item, evidenceIndex) => normalizeEvidence(item, `${path}.evidence[${evidenceIndex}]`)),
    limits: {
      contextWindow: limits.contextWindow === undefined ? undefined : normalizePositiveInt(limits.contextWindow, `${path}.limits.contextWindow`),
      maxOutputTokens: limits.maxOutputTokens === undefined ? undefined : normalizePositiveInt(limits.maxOutputTokens, `${path}.limits.maxOutputTokens`),
    },
  };
}

function normalizeEvidence(input, path) {
  const value = assertRecord(input, path);
  return {
    kind: assertString(value.kind, `${path}.kind`),
    source: assertString(value.source, `${path}.source`),
    date: assertString(value.date, `${path}.date`),
    strength: assertString(value.strength, `${path}.strength`),
    notes: value.notes === undefined ? undefined : assertString(value.notes, `${path}.notes`, { nonEmpty: false }),
  };
}

function normalizeDefaults(input) {
  const value = assertRecord(input, 'config.defaults');
  return {
    leader: value.leader === undefined || value.leader === null || value.leader === '' ? undefined : assertString(value.leader, 'config.defaults.leader'),
    roles: normalizeStringMap(value.roles ?? {}, 'config.defaults.roles'),
    categories: normalizeStringMap(value.categories ?? {}, 'config.defaults.categories'),
    roleEfforts: normalizeStringMap(value.roleEfforts ?? {}, 'config.defaults.roleEfforts'),
    categoryEfforts: normalizeStringMap(value.categoryEfforts ?? {}, 'config.defaults.categoryEfforts'),
  };
}

function normalizeSkillSources(input) {
  const value = assertRecord(input, 'config.skillSources');
  return {
    localRoots: assertArray(value.localRoots ?? [], 'config.skillSources.localRoots').map((root) => assertString(root, 'config.skillSources.localRoots[]')),
    gitRepos: assertArray(value.gitRepos ?? [], 'config.skillSources.gitRepos').map((repo) => assertRecord(repo, 'config.skillSources.gitRepos[]')),
    autoInstall: Boolean(value.autoInstall ?? false),
  };
}

function normalizeRetention(input) {
  const value = assertRecord(input, 'config.retention');
  return { maxRuns: normalizePositiveInt(value.maxRuns ?? 200, 'config.retention.maxRuns') };
}

function normalizeHeaders(input, path) {
  const value = assertRecord(input, path);
  const output = {};
  for (const [key, header] of Object.entries(value)) {
    const normalizedKey = assertString(key, `${path} key`);
    // Secrets must use credentialRef/headerRefs and never be serialized in the
    // ordinary connection record. Non-secret custom headers remain supported.
    if (/authorization|api[-_]?key|token|secret/i.test(normalizedKey)) {
      output[normalizedKey] = '<redacted>';
      continue;
    }
    output[normalizedKey] = assertString(header, `${path}.${key}`, { nonEmpty: false });
  }
  return output;
}

function normalizeStringMap(input, path) {
  const value = assertRecord(input, path);
  const output = {};
  for (const [key, item] of Object.entries(value)) output[assertString(key, `${path} key`)] = assertString(item, `${path}.${key}`);
  return output;
}

function normalizePositiveInt(value, path) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new DynamicMultiagentError('invalid-config', `${path} must be a positive integer`);
  return value;
}

export function redactConfig(config) {
  const redacted = cloneJson(config);
  for (const connection of redacted.connections ?? []) {
    delete connection.apiKey;
    delete connection.secret;
    if (connection.headers) {
      for (const key of Object.keys(connection.headers)) {
        if (/authorization|api[-_]?key|token|secret/i.test(key)) connection.headers[key] = '<redacted>';
      }
    }
  }
  return redacted;
}

export function resolveCredentialValue(connection, resolver) {
  if (connection.credentialRef === undefined) return undefined;
  if (typeof resolver !== 'function') throw new DynamicMultiagentError('credential-unavailable', `Credential resolver is required for ${connection.credentialRef}`);
  return Promise.resolve(resolver(connection.credentialRef)).then(unwrapCredential);
}

// dsh credential providers resolve to `{ value, source }`; plain resolvers may return the string.
function unwrapCredential(resolved) {
  if (resolved === undefined || resolved === null) return undefined;
  return typeof resolved === 'string' ? resolved : resolved.value;
}

