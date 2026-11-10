import { DynamicMultiagentError, errorMessage } from './errors.js';
import { resolveCredentialValue } from './config-store.js';

export class ProviderError extends DynamicMultiagentError {
  constructor(code, message, options = {}) {
    super(code, message, options);
    this.name = 'ProviderError';
  }
}

export class ProtocolConnectionManager {
  constructor({ connections = [], credentialResolver, fetchImpl = globalThis.fetch, logger = console } = {}) {
    this.connections = new Map(connections.map((connection) => [connection.id, connection]));
    this.credentialResolver = credentialResolver;
    this.fetchImpl = fetchImpl;
    this.logger = logger;
  }

  setConnections(connections) {
    this.connections = new Map(connections.map((connection) => [connection.id, connection]));
  }

  getConnection(id) {
    const connection = this.connections.get(id);
    if (!connection) throw new ProviderError('connection-not-found', `Connection "${id}" is not configured`, { provider: id });
    return connection;
  }

  async *stream(request, { signal } = {}) {
    const connection = this.getConnection(request.connectionId);
    if (typeof this.fetchImpl !== 'function') throw new ProviderError('network-unavailable', 'fetch is not available in this runtime', { provider: connection.id });
    const credential = await resolveCredentialValue(connection, this.credentialResolver);
    const headers = await buildHeaders(connection, credential, this.credentialResolver);
    const body = connection.protocol === 'openai-chat'
      ? buildOpenAiBody(request)
      : buildAnthropicBody(request);
    const endpoint = endpointFor(connection);
    const timeout = connection.requestTimeoutMs ?? 120_000;
    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(new Error(`request timed out after ${timeout}ms`)), timeout);
    const combinedSignal = signal ? AbortSignal.any([signal, timeoutController.signal]) : timeoutController.signal;
    let response;
    try {
      response = await this.fetchImpl(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: combinedSignal,
      });
    } catch (error) {
      clearTimeout(timer);
      if (combinedSignal.aborted) throw new ProviderError('request-cancelled', `${connection.id} request was cancelled`, { provider: connection.id, cause: error, retriable: true });
      throw new ProviderError('network-error', `Request to ${endpoint} failed: ${errorMessage(error)}`, { provider: connection.id, cause: error, retriable: true });
    }
    try {
      if (!response.ok) throw await providerResponseError(connection, response);
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('text/event-stream')) {
        yield* parseProviderStream(connection.protocol, response, combinedSignal);
      } else {
        const json = await safeJson(response);
        yield* normalizeNonStream(connection.protocol, json);
      }
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (combinedSignal.aborted) throw new ProviderError('request-cancelled', `${connection.id} request was cancelled`, { provider: connection.id, cause: error, retriable: true });
      throw new ProviderError('protocol-error', `${connection.id} response could not be decoded: ${errorMessage(error)}`, { provider: connection.id, cause: error });
    } finally {
      clearTimeout(timer);
    }
  }

  async collect(request, options = {}) {
    const text = [];
    const toolCalls = new Map();
    let finish;
    for await (const event of this.stream(request, options)) {
      if (event.type === 'text-delta') text.push(event.text);
      if (event.type === 'tool-call-delta') {
        const current = toolCalls.get(event.index) ?? { index: event.index, id: event.id, name: event.name, arguments: '' };
        if (event.id !== undefined) current.id = event.id;
        if (event.name !== undefined) current.name = event.name;
        current.arguments += event.arguments ?? '';
        toolCalls.set(event.index, current);
      }
      if (event.type === 'finish') finish = event;
    }
    return { text: text.join(''), toolCalls: [...toolCalls.values()], finish };
  }
}

async function buildHeaders(connection, credential, resolver) {
  const headers = {
    accept: 'text/event-stream',
    'content-type': 'application/json',
    ...Object.fromEntries(Object.entries(connection.headers ?? {}).filter(([, value]) => value !== '<redacted>')),
  };
  for (const [headerName, reference] of Object.entries(connection.headerRefs ?? {})) {
    const value = await resolveCredentialValue({ credentialRef: reference }, resolver);
    if (value !== undefined) headers[headerName] = value;
  }
  if (connection.protocol === 'anthropic-messages') {
    if (credential) headers['x-api-key'] = credential;
    headers['anthropic-version'] ??= '2023-06-01';
  } else if (credential) {
    headers.authorization ??= `Bearer ${credential}`;
  }
  return headers;
}

function endpointFor(connection) {
  const base = connection.baseUrl.replace(/\/+$/, '');
  if (connection.protocol === 'openai-chat') {
    if (base.endsWith('/chat/completions')) return base;
    return `${base}${base.endsWith('/v1') ? '' : '/v1'}/chat/completions`;
  }
  if (base.endsWith('/messages')) return base;
  return `${base}${base.endsWith('/v1') ? '' : '/v1'}/messages`;
}

function buildOpenAiBody(request) {
  return {
    model: request.model,
    messages: request.messages ?? [],
    stream: true,
    ...(request.tools?.length ? { tools: request.tools } : {}),
    ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
    ...(request.maxTokens === undefined ? {} : { max_tokens: request.maxTokens }),
    ...(request.reasoningEffort === undefined ? {} : { reasoning_effort: request.reasoningEffort }),
  };
}

function buildAnthropicBody(request) {
  return {
    model: request.model,
    max_tokens: request.maxTokens ?? 4096,
    messages: request.messages ?? [],
    stream: true,
    ...(request.system ? { system: request.system } : {}),
    ...(request.tools?.length ? { tools: request.tools } : {}),
    ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
  };
}

async function providerResponseError(connection, response) {
  const body = await safeJson(response).catch(() => undefined);
  const message = body?.error?.message ?? body?.message ?? response.statusText ?? `HTTP ${response.status}`;
  const retryAfter = response.headers.get('retry-after');
  const retryAfterMs = retryAfter === null ? undefined : parseRetryAfter(retryAfter);
  const code = response.status === 401 || response.status === 403
    ? 'authentication-failed'
    : response.status === 404
      ? 'model-or-endpoint-not-found'
      : response.status === 429
        ? 'rate-limited'
        : response.status >= 500
          ? 'provider-unavailable'
          : 'provider-request-rejected';
  return new ProviderError(code, `${connection.id} returned ${response.status}: ${message}`, {
    provider: connection.id,
    status: response.status,
    retryAfterMs,
    retriable: response.status === 429 || response.status >= 500,
    details: body,
  });
}

function parseRetryAfter(value) {
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

async function safeJson(response) {
  const text = await response.text();
  if (!text) return undefined;
  try { return JSON.parse(text); } catch { return { message: text }; }
}

async function* parseProviderStream(protocol, response, signal) {
  if (!response.body) throw new ProviderError('protocol-error', 'Provider returned no response body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventName = '';
  let dataLines = [];
  const emitEvent = (name, data) => normalizeEvent(protocol, name, data);
  try {
    while (true) {
      if (signal.aborted) throw new ProviderError('request-cancelled', 'Provider stream cancelled', { retriable: true });
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line === '') {
          const event = parseEventFrame(eventName, dataLines);
          eventName = '';
          dataLines = [];
          if (event !== undefined) {
            const normalized = emitEvent(event.name, event.data);
            if (normalized !== undefined) yield* asIterable(normalized);
          }
        } else if (line.startsWith(':')) {
          continue;
        } else if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).replace(/^ /, ''));
        }
      }
      if (done) break;
    }
    if (buffer.length || dataLines.length) {
      const event = parseEventFrame(eventName, dataLines.length ? dataLines : [buffer]);
      if (event !== undefined) {
        const normalized = emitEvent(event.name, event.data);
        if (normalized !== undefined) yield* asIterable(normalized);
      }
    }
  } finally {
    try { await reader.cancel(); } catch { /* provider already closed */ }
  }
}

function parseEventFrame(name, lines) {
  if (!lines.length) return undefined;
  return { name, data: lines.join('\n') };
}

function* asIterable(value) {
  if (Array.isArray(value)) yield* value;
  else yield value;
}

function normalizeEvent(protocol, eventName, rawData) {
  if (rawData === '[DONE]') return { type: 'finish', reason: 'stop' };
  let data;
  try { data = JSON.parse(rawData); } catch { return undefined; }
  return protocol === 'openai-chat' ? normalizeOpenAiEvent(data) : normalizeAnthropicEvent(eventName || data.type, data);
}

function normalizeOpenAiEvent(data) {
  if (data.error) throw new ProviderError('provider-error', data.error.message ?? 'Provider returned an error', { details: data.error });
  const choice = data.choices?.[0];
  if (!choice) return undefined;
  const delta = choice.delta ?? {};
  const events = [];
  if (typeof delta.content === 'string' && delta.content.length) events.push({ type: 'text-delta', text: delta.content });
  if (typeof delta.reasoning_content === 'string' && delta.reasoning_content.length) events.push({ type: 'reasoning-delta', text: delta.reasoning_content });
  for (const toolCall of delta.tool_calls ?? []) {
    events.push({
      type: 'tool-call-delta',
      index: toolCall.index ?? 0,
      ...(toolCall.id === undefined ? {} : { id: toolCall.id }),
      ...(toolCall.function?.name === undefined ? {} : { name: toolCall.function.name }),
      arguments: toolCall.function?.arguments ?? '',
    });
  }
  if (choice.finish_reason) events.push({ type: 'finish', reason: choice.finish_reason, usage: data.usage });
  return events;
}

function normalizeAnthropicEvent(eventName, data) {
  if (eventName === 'error' || data.type === 'error') throw new ProviderError('provider-error', data.error?.message ?? 'Provider returned an error', { details: data.error ?? data });
  if (data.type === 'content_block_delta') {
    if (data.delta?.type === 'text_delta') return { type: 'text-delta', text: data.delta.text ?? '' };
    if (data.delta?.type === 'input_json_delta') return { type: 'tool-call-delta', index: data.index ?? 0, arguments: data.delta.partial_json ?? '' };
  }
  if (data.type === 'content_block_start' && data.content_block?.type === 'tool_use') {
    return { type: 'tool-call-delta', index: data.index ?? 0, id: data.content_block.id, name: data.content_block.name, arguments: JSON.stringify(data.content_block.input ?? {}) };
  }
  if (data.type === 'message_delta') return { type: 'finish', reason: data.delta?.stop_reason ?? 'stop', usage: data.usage };
  return undefined;
}

function normalizeNonStream(protocol, data) {
  if (protocol === 'openai-chat') {
    const choice = data?.choices?.[0];
    return [{
      ...(choice?.message?.content ? { type: 'text-delta', text: choice.message.content } : {}),
      ...(choice?.finish_reason ? { finish: { type: 'finish', reason: choice.finish_reason, usage: data.usage } } : {}),
    }].flatMap((event) => event.type ? [event] : event.finish ? [event.finish] : []);
  }
  const events = [];
  for (const block of data?.content ?? []) {
    if (block.type === 'text') events.push({ type: 'text-delta', text: block.text ?? '' });
    if (block.type === 'tool_use') events.push({ type: 'tool-call-delta', index: block.index ?? events.length, id: block.id, name: block.name, arguments: JSON.stringify(block.input ?? {}) });
  }
  events.push({ type: 'finish', reason: data?.stop_reason ?? 'stop', usage: data?.usage });
  return events;
}

export function parseToolArguments(toolCall) {
  try { return JSON.parse(toolCall.arguments || '{}'); } catch (error) { throw new ProviderError('tool-arguments-invalid', `Tool call ${toolCall.name ?? '<unknown>'} returned invalid JSON`, { cause: error }); }
}

