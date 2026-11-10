import { createHash } from 'node:crypto';
import { DynamicMultiagentError } from './errors.js';

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function assertRecord(value, path) {
  if (!isRecord(value)) throw new DynamicMultiagentError('invalid-config', `${path} must be an object`);
  return value;
}

export function assertString(value, path, { nonEmpty = true } = {}) {
  if (typeof value !== 'string' || (nonEmpty && value.trim() === '')) {
    throw new DynamicMultiagentError('invalid-config', `${path} must be a${nonEmpty ? ' non-empty' : ''} string`);
  }
  return value;
}

export function optionalString(value, path) {
  if (value === undefined || value === null) return undefined;
  return assertString(value, path);
}

export function assertArray(value, path) {
  if (!Array.isArray(value)) throw new DynamicMultiagentError('invalid-config', `${path} must be an array`);
  return value;
}

export function assertEnum(value, values, path) {
  if (!values.includes(value)) {
    throw new DynamicMultiagentError('invalid-config', `${path} must be one of ${values.join(', ')}`);
  }
  return value;
}

export function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

export function stableJson(value) {
  return JSON.stringify(sortJson(value));
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key])]));
  }
  return value;
}

export function sha256(value) {
  const input = Buffer.isBuffer(value) || value instanceof Uint8Array ? value : String(value);
  return createHash('sha256').update(input).digest('hex');
}

export function nowIso() {
  return new Date().toISOString();
}

export function makeId(prefix = 'id') {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

export function assertSafeRelativePath(relativePath, pathName = 'path') {
  assertString(relativePath, pathName);
  if (relativePath.includes('\0')) throw new DynamicMultiagentError('invalid-path', `${pathName} contains NUL`);
  const normalized = relativePath.replaceAll('\\', '/');
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) {
    throw new DynamicMultiagentError('invalid-path', `${pathName} must be relative`);
  }
  const parts = normalized.split('/');
  if (parts.includes('..')) throw new DynamicMultiagentError('invalid-path', `${pathName} escapes its root`);
  return parts.filter(Boolean).join('/');
}

export function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return value;
}

