import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { ProtocolConnectionManager } from '../src/core/protocols.js';

async function withServer(handler, fn) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  try { return await fn(`http://127.0.0.1:${address.port}`); } finally { server.close(); await once(server, 'close'); }
}

test('normalizes OpenAI-compatible streamed text and tool calls', async () => {
  await withServer((request, response) => {
    assert.equal(request.url, '/v1/chat/completions');
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'hello ' } }] })}\n\n`);
    response.write(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-1', function: { name: 'lookup', arguments: '{"q":"x"}' } }] } }] })}\n\n`);
    response.write(`data: ${JSON.stringify({ choices: [{ finish_reason: 'tool_calls', delta: {} }] })}\n\n`);
    response.write('data: [DONE]\n\n');
    response.end();
  }, async (baseUrl) => {
    const manager = new ProtocolConnectionManager({
      connections: [{ id: 'openai', protocol: 'openai-chat', baseUrl: `${baseUrl}/v1`, models: [{ id: 'coder' }] }],
      credentialResolver: () => 'secret',
    });
    const result = await manager.collect({ connectionId: 'openai', model: 'coder', messages: [{ role: 'user', content: 'hi' }] });
    assert.equal(result.text, 'hello ');
    assert.deepEqual(result.toolCalls, [{ index: 0, id: 'call-1', name: 'lookup', arguments: '{"q":"x"}' }]);
    assert.equal(result.finish.reason, 'stop');
  });
});

test('normalizes Anthropic Messages stream and maps authentication failures', async () => {
  await withServer((request, response) => {
    assert.equal(request.headers['x-api-key'], 'secret');
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.write('event: content_block_delta\n');
    response.write(`data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'research' } })}\n\n`);
    response.write('event: message_delta\n');
    response.write(`data: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' } })}\n\n`);
    response.end();
  }, async (baseUrl) => {
    const manager = new ProtocolConnectionManager({
      connections: [{ id: 'anthropic', protocol: 'anthropic-messages', baseUrl: `${baseUrl}/v1`, models: [{ id: 'researcher' }], credentialRef: 'LAB_API_KEY' }],
      credentialResolver: (ref) => ref === 'LAB_API_KEY' ? 'secret' : undefined,
    });
    const result = await manager.collect({ connectionId: 'anthropic', model: 'researcher', messages: [{ role: 'user', content: 'hi' }] });
    assert.equal(result.text, 'research');
    assert.equal(result.finish.reason, 'end_turn');
  });
});

test('reports provider auth failures with a stable code', async () => {
  await withServer((_request, response) => {
    response.writeHead(401, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: { message: 'bad key' } }));
  }, async (baseUrl) => {
    const manager = new ProtocolConnectionManager({
      connections: [{ id: 'openai', protocol: 'openai-chat', baseUrl, models: [{ id: 'coder' }] }],
    });
    await assert.rejects(manager.collect({ connectionId: 'openai', model: 'coder', messages: [] }), (error) => error.code === 'authentication-failed' && error.status === 401);
  });
});

