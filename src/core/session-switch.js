import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DynamicMultiagentError } from './errors.js';
import { nowIso } from './validation.js';

const MAX_SESSIONS = 2000;

/**
 * Per-conversation on/off switch. Overrides live in the plugin's own data directory rather than
 * in the dsh session log: a custom session event would make the log unreadable for a host that
 * no longer loads this plugin.
 */
export class SessionSwitchStore {
  constructor(filePath) {
    this.filePath = resolve(filePath);
    this.sessions = new Map();
    this.loaded = false;
    this.writeChain = Promise.resolve();
    this.listeners = new Set();
  }

  async load() {
    if (this.loaded) return;
    try {
      const data = JSON.parse(await readFile(this.filePath, 'utf8'));
      if (data?.version === 1 && data.sessions && typeof data.sessions === 'object') {
        for (const [id, entry] of Object.entries(data.sessions)) {
          if (typeof entry?.enabled === 'boolean') this.sessions.set(id, { enabled: entry.enabled, updatedAt: entry.updatedAt });
        }
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw new DynamicMultiagentError('session-store-read-failed', `Cannot read ${this.filePath}`, { cause: error });
    }
    this.loaded = true;
  }

  /** Explicit override for one session, or undefined when it follows the default. */
  override(sessionId) {
    return this.sessions.get(String(sessionId))?.enabled;
  }

  async set(sessionId, enabled) {
    await this.load();
    const id = String(sessionId);
    if (enabled === null || enabled === undefined) this.sessions.delete(id);
    else this.sessions.set(id, { enabled: Boolean(enabled), updatedAt: nowIso() });
    while (this.sessions.size > MAX_SESSIONS) this.sessions.delete(this.sessions.keys().next().value);
    await this.persist();
    for (const listener of this.listeners) {
      try { listener(id); } catch { /* listeners are best effort */ }
    }
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  persist() {
    this.writeChain = this.writeChain.then(async () => {
      const data = { version: 1, sessions: Object.fromEntries(this.sessions) };
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporary = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
      await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, this.filePath);
    });
    return this.writeChain;
  }
}
