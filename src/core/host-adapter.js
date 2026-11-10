import { DynamicMultiagentError, errorMessage } from './errors.js';
import { ProviderError } from './protocols.js';
import { anthropicThinkingParams } from './thinking.js';
import { connectionRoute } from './model-router.js';

/**
 * dsh LLM adapter serving advanced connections (`dma-<id>` routes) so a child agent can run on a
 * relay the user configured inside this plugin. It speaks the host stream vocabulary
 * (`block-start` / `*-delta` / `block-end` / `usage` / `finish`) and maps reasoning effort to the
 * wire: `reasoning_effort` for OpenAI-compatible routes, adaptive `output_config.effort` or a
 * thinking budget for Anthropic routes.
 */
export class ConnectionAdapter {
  constructor({ getConnections, resolveCredential, fetchImpl = globalThis.fetch, attribution = {} } = {}) {
    this.getConnections = getConnections;
    this.resolveCredential = resolveCredential;
    this.fetchImpl = fetchImpl;
    this.attribution = attribution;
  }

  connection(provider) {
    const connection = this.getConnections().find((candidate) => connectionRoute(candidate.id) === provider);
    if (!connection) throw new DynamicMultiagentError('connection-not-found', `No advanced connection serves route "${provider}"`);
    return connection;
  }

  modelEntry(provider, modelId) {
    const connection = this.connection(provider);
    return { connection, model: connection.models.find((candidate) => candidate.id === modelId) ?? { id: modelId, efforts: [] } };
  }

  providerInfo(provider) {
    const connection = this.getConnections().find((candidate) => connectionRoute(candidate.id) === provider);
    return { id: provider, name: connection ? `${connection.id} (multi-agent)` : provider };
  }

  providerRetryPolicy() {
    return undefined;
  }

  imageRequestPricing() {
    return undefined;
  }

  imageRequestTarget(_provider, _model, image) {
    return { width: image.width, height: image.height, maxBytes: image.bytes };
  }

  async listModels(provider) {
    const connection = this.connection(provider);
    return connection.models.map((model) => ({
      provider,
      id: model.id,
      name: model.label ?? model.id,
      inputModalities: model.vision ? ['text', 'image'] : ['text'],
    }));
  }

  async resolveModel(provider, modelId) {
    const { model } = this.modelEntry(provider, modelId);
    return {
      provider,
      id: model.id,
      name: model.label ?? model.id,
      inputModalities: model.vision ? ['text', 'image'] : ['text'],
      ...(model.contextWindow ? { context: { contextWindow: model.contextWindow } } : {}),
      ...(model.maxTokens ? { defaultMaxTokens: model.maxTokens } : {}),
      ...(model.efforts?.length ? { reasoning: { efforts: model.efforts.map((id) => ({ id, name: id.charAt(0).toUpperCase() + id.slice(1) })) } } : {}),
    };
  }

  async prepareCall(provider, modelId, signal) {
    return { model: await this.resolveModel(provider, modelId, signal), stream: (options) => this.stream(options) };
  }

  async *stream(options) {
    const { connection, model } = this.modelEntry(options.provider, options.model);
    const effort = options.reasoningEffort;
    if (effort !== undefined && model.efforts?.length && !model.efforts.includes(effort)) {
      throw Object.assign(new Error(`Model "${model.id}" on ${connection.id} does not offer reasoning effort "${effort}"`), { code: 'UNSUPPORTED_REASONING_EFFORT' });
    }
    const credential = await this.resolveCredential(connection);
    if (connection.credentialRef && !credential) {
      throw Object.assign(new Error(`Credential "${connection.credentialRef}" for connection ${connection.id} is not configured; set it as an environment variable or a dsh credential`), { code: 'AUTH' });
    }
    const headers = {
      accept: 'text/event-stream',
      'content-type': 'application/json',
      ...this.attribution,
      ...Object.fromEntries(Object.entries(connection.headers ?? {}).filter(([, value]) => value !== '<redacted>')),
    };
    if (connection.protocol === 'anthropic-messages') {
      if (credential) headers['x-api-key'] = credential;
      headers['anthropic-version'] ??= '2023-06-01';
    } else if (credential) {
      headers.authorization = `Bearer ${credential}`;
    }
    const body = connection.protocol === 'anthropic-messages'
      ? anthropicBody(options, model, effort)
      : openAiBody(options, model, effort);
    const url = endpoint(connection);
    const timeout = AbortSignal.timeout(connection.requestTimeoutMs ?? 120_000);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    let response;
    try {
      response = await this.fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
    } catch (error) {
      throw Object.assign(new Error(`Request to ${url} failed: ${errorMessage(error)}`), { code: signal.aborted ? 'ABORTED' : 'NETWORK' });
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const status = response.status;
      throw Object.assign(new Error(`${connection.id} returned HTTP ${status}: ${text.slice(0, 500) || response.statusText}`), {
        code: status === 401 || status === 403 ? 'AUTH' : status === 429 ? 'RATE_LIMITED' : status >= 500 ? 'PROVIDER_UNAVAILABLE' : 'BAD_REQUEST',
        status,
      });
    }
    const translator = connection.protocol === 'anthropic-messages' ? new AnthropicTranslator() : new OpenAiTranslator();
    for await (const frame of sseFrames(response, signal)) yield* translator.push(frame);
    yield* translator.finish();
  }
}

function endpoint(connection) {
  const base = connection.baseUrl.replace(/\/+$/, '');
  if (connection.protocol === 'openai-chat') {
    if (base.endsWith('/chat/completions')) return base;
    return `${base}${/\/v\d+$/.test(base) ? '' : '/v1'}/chat/completions`;
  }
  if (base.endsWith('/messages')) return base;
  return `${base}${/\/v\d+$/.test(base) ? '' : '/v1'}/messages`;
}

function textOf(content) {
  return content.filter((block) => block.type === 'text').map((block) => block.text).join('');
}

function openAiBody(options, model, effort) {
  const messages = [];
  if (options.system) messages.push({ role: 'system', content: options.system });
  for (const message of options.messages ?? []) {
    if (message.role === 'assistant') {
      const calls = message.content.filter((block) => block.type === 'tool-call');
      messages.push({
        role: 'assistant',
        content: textOf(message.content) || null,
        ...(calls.length ? { tool_calls: calls.map((call) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments || '{}' } })) } : {}),
      });
      continue;
    }
    const results = message.content.filter((block) => block.type === 'tool-result');
    for (const result of results) messages.push({ role: 'tool', tool_call_id: result.toolCallId, content: textOf(result.content) || (result.isError ? 'error' : '') });
    const text = textOf(message.content);
    if (text || !results.length) messages.push({ role: 'user', content: text });
  }
  return {
    model: model.id,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    ...(options.tools?.length ? { tools: options.tools.map((tool) => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } })) } : {}),
    ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
    ...(options.maxTokens === undefined ? {} : { max_tokens: options.maxTokens }),
    ...(effort === undefined || effort === 'off' || model.thinking === 'none' ? {} : { reasoning_effort: effort }),
  };
}

function anthropicBody(options, model, effort) {
  const messages = [];
  for (const message of options.messages ?? []) {
    const content = [];
    for (const block of message.content) {
      if (block.type === 'text' && block.text) content.push({ type: 'text', text: block.text });
      else if (block.type === 'tool-call') content.push({ type: 'tool_use', id: block.id, name: block.name, input: safeParse(block.arguments) });
      else if (block.type === 'tool-result') content.push({ type: 'tool_result', tool_use_id: block.toolCallId, content: textOf(block.content), ...(block.isError ? { is_error: true } : {}) });
    }
    if (!content.length) content.push({ type: 'text', text: ' ' });
    const role = message.role === 'assistant' ? 'assistant' : 'user';
    const last = messages.at(-1);
    if (last && last.role === role) last.content.push(...content);
    else messages.push({ role, content });
  }
  const thinking = anthropicThinkingParams(model.thinking, effort);
  const budget = thinking.thinking?.budget_tokens ?? 0;
  const maxTokens = Math.max(options.maxTokens ?? model.maxTokens ?? 8192, budget + 1024);
  return {
    model: model.id,
    max_tokens: maxTokens,
    messages,
    stream: true,
    ...(options.system ? { system: options.system } : {}),
    ...(options.tools?.length ? { tools: options.tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.parameters })) } : {}),
    ...(options.temperature === undefined || thinking.thinking?.type === 'enabled' || thinking.thinking?.type === 'adaptive' ? {} : { temperature: options.temperature }),
    ...thinking,
  };
}

function safeParse(text) {
  try { return JSON.parse(text || '{}'); } catch { return {}; }
}

async function* sseFrames(response, signal) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let event = '';
  let data = [];
  try {
    while (true) {
      if (signal.aborted) throw Object.assign(new Error('request aborted'), { code: 'ABORTED' });
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line === '') {
          if (data.length) yield { event, data: data.join('\n') };
          event = '';
          data = [];
        } else if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      if (done) break;
    }
    if (data.length) yield { event, data: data.join('\n') };
  } finally {
    try { await reader.cancel(); } catch { /* already closed */ }
  }
}

/** Accumulates provider deltas into dsh blocks with stable indexes. */
class BlockBuilder {
  constructor() {
    this.blocks = new Map();
    this.next = 0;
    this.finished = false;
  }

  *open(key, blockType, extra = {}) {
    if (this.blocks.has(key)) return this.blocks.get(key);
    const block = { index: this.next++, blockType, text: '', ...extra };
    this.blocks.set(key, block);
    yield { type: 'block-start', index: block.index, blockType };
    return block;
  }

  *close(key) {
    const block = this.blocks.get(key);
    if (!block || block.closed) return;
    block.closed = true;
    if (block.blockType === 'tool-call') yield { type: 'block-end', index: block.index, block: { type: 'tool-call', id: block.id, name: block.name, arguments: block.text || '{}' } };
    else yield { type: 'block-end', index: block.index, block: { type: block.blockType, text: block.text } };
  }

  *closeAll() {
    for (const key of this.blocks.keys()) yield* this.close(key);
  }
}

class OpenAiTranslator {
  constructor() {
    this.builder = new BlockBuilder();
    this.usage = undefined;
    this.reason = undefined;
  }

  *push(frame) {
    if (frame.data === '[DONE]') return;
    let data;
    try { data = JSON.parse(frame.data); } catch { return; }
    if (data.error) throw Object.assign(new Error(data.error.message ?? 'provider error'), { code: 'PROVIDER_ERROR' });
    if (data.usage) this.usage = data.usage;
    const choice = data.choices?.[0];
    if (!choice) return;
    const delta = choice.delta ?? {};
    const reasoning = delta.reasoning_content ?? delta.reasoning;
    if (typeof reasoning === 'string' && reasoning) {
      const block = yield* this.builder.open('reasoning', 'reasoning');
      block.text += reasoning;
      yield { type: 'reasoning-delta', index: block.index, text: reasoning };
    }
    if (typeof delta.content === 'string' && delta.content) {
      yield* this.builder.close('reasoning');
      const block = yield* this.builder.open('text', 'text');
      block.text += delta.content;
      yield { type: 'text-delta', index: block.index, text: delta.content };
    }
    for (const call of delta.tool_calls ?? []) {
      const key = `tool:${call.index ?? 0}`;
      const block = yield* this.builder.open(key, 'tool-call', { id: call.id, name: call.function?.name });
      if (call.id) block.id = call.id;
      if (call.function?.name) block.name = call.function.name;
      const args = call.function?.arguments ?? '';
      block.text += args;
      yield { type: 'tool-call-delta', index: block.index, id: block.id, ...(block.name ? { name: block.name } : {}), argumentsDelta: args };
    }
    if (choice.finish_reason) this.reason = choice.finish_reason;
  }

  *finish() {
    yield* this.builder.closeAll();
    if (this.usage) {
      const cached = this.usage.prompt_tokens_details?.cached_tokens ?? this.usage.prompt_cache_hit_tokens ?? 0;
      yield {
        type: 'usage',
        usage: {
          inputTokens: Math.max(0, (this.usage.prompt_tokens ?? 0) - cached),
          outputTokens: this.usage.completion_tokens ?? 0,
          ...(cached ? { cacheReadTokens: cached } : {}),
          ...(this.usage.completion_tokens_details?.reasoning_tokens ? { reasoningTokens: this.usage.completion_tokens_details.reasoning_tokens } : {}),
        },
      };
    }
    yield { type: 'finish', reason: finishReason(this.reason) };
  }
}

class AnthropicTranslator {
  constructor() {
    this.builder = new BlockBuilder();
    this.usage = { inputTokens: 0, outputTokens: 0 };
    this.reason = undefined;
  }

  *push(frame) {
    let data;
    try { data = JSON.parse(frame.data); } catch { return; }
    const type = data.type ?? frame.event;
    if (type === 'error') throw Object.assign(new Error(data.error?.message ?? 'provider error'), { code: 'PROVIDER_ERROR' });
    if (type === 'message_start') {
      const usage = data.message?.usage ?? {};
      this.usage.inputTokens = usage.input_tokens ?? 0;
      if (usage.cache_read_input_tokens) this.usage.cacheReadTokens = usage.cache_read_input_tokens;
      if (usage.cache_creation_input_tokens) this.usage.cacheWriteTokens = usage.cache_creation_input_tokens;
    } else if (type === 'content_block_start') {
      const block = data.content_block ?? {};
      const key = `b:${data.index}`;
      if (block.type === 'tool_use') yield* this.builder.open(key, 'tool-call', { id: block.id, name: block.name });
      else if (block.type === 'thinking') yield* this.builder.open(key, 'reasoning');
      else if (block.type === 'text') yield* this.builder.open(key, 'text');
    } else if (type === 'content_block_delta') {
      const key = `b:${data.index}`;
      const block = this.builder.blocks.get(key);
      if (!block) return;
      const delta = data.delta ?? {};
      if (delta.type === 'text_delta') {
        block.text += delta.text ?? '';
        yield { type: 'text-delta', index: block.index, text: delta.text ?? '' };
      } else if (delta.type === 'thinking_delta') {
        block.text += delta.thinking ?? '';
        yield { type: 'reasoning-delta', index: block.index, text: delta.thinking ?? '' };
      } else if (delta.type === 'input_json_delta') {
        block.text += delta.partial_json ?? '';
        yield { type: 'tool-call-delta', index: block.index, id: block.id, name: block.name, argumentsDelta: delta.partial_json ?? '' };
      }
    } else if (type === 'content_block_stop') {
      yield* this.builder.close(`b:${data.index}`);
    } else if (type === 'message_delta') {
      if (data.delta?.stop_reason) this.reason = data.delta.stop_reason;
      if (data.usage?.output_tokens !== undefined) this.usage.outputTokens = data.usage.output_tokens;
    }
  }

  *finish() {
    yield* this.builder.closeAll();
    yield { type: 'usage', usage: { ...this.usage } };
    yield { type: 'finish', reason: finishReason(this.reason) };
  }
}

function finishReason(reason) {
  if (reason === 'tool_calls' || reason === 'tool_use') return { kind: 'tool-calls' };
  if (reason === 'length' || reason === 'max_tokens') return { kind: 'max-tokens' };
  return { kind: 'stop' };
}

export { ProviderError };
