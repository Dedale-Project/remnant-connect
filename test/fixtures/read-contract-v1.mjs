import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { BRIDGE_VERSION, createReadBridge, READ_ENDPOINT, READ_TOOL_NAMES } from '../../src/read-bridge.mjs';

export function catalog() {
  return READ_TOOL_NAMES.map(name => ({
    name, title: `Upstream ${name}`, description: `Unmodified upstream contract for ${name}.`,
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: { query: { type: 'string', description: 'An upstream field.' }, limit: { type: 'integer', default: 5 } },
      required: ['query', 'limit'],
    },
    outputSchema: { type: 'object', properties: { kind: { type: 'string' } }, required: ['kind'] },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    _meta: { 'example.com/provenance': { preserved: true } },
  }));
}

export function json(message, session) {
  return new Response(JSON.stringify(message), {
    headers: { 'content-type': 'application/json', ...(session ? { 'mcp-session-id': session } : {}) },
  });
}

export function fakeUpstream({ tools = catalog(), call = async params => ({ content: [{ type: 'text', text: params.name }], structuredContent: { kind: params.name } }), intercept, sessionsEnabled = true } = {}) {
  const requests = [];
  let sessions = 0;
  const fetchImpl = async (url, init) => {
    const headers = new Headers(init.headers);
    assert.equal(new URL(url).origin + new URL(url).pathname, READ_ENDPOINT);
    assert.equal(init.redirect, 'error');
    assert.equal(init.credentials, 'omit');
    assert.equal(headers.has('authorization'), false);
    assert.equal(headers.has('cookie'), false);
    init.signal.throwIfAborted();
    if (init.method === 'GET') return new Response(null, { status: 405 });
    if (init.method === 'DELETE') {
      requests.push({ method: 'DELETE', session: headers.get('mcp-session-id') });
      return new Response(null, { status: 204 });
    }
    const message = JSON.parse(init.body);
    requests.push({ ...message, session: headers.get('mcp-session-id'), source: new URL(url).searchParams.get('source'), probe: headers.get('x-remnant-probe') });
    if (intercept) {
      const response = await intercept(message, init);
      if (response) return response;
    }
    if (message.method === 'initialize') return json({ jsonrpc: '2.0', id: message.id, result: {
      protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'fake-remnant-read', version: 'test' },
    } }, sessionsEnabled ? `read-session-${++sessions}` : undefined);
    if (message.id === undefined) return new Response(null, { status: 202 });
    if (message.method === 'tools/list') return json({ jsonrpc: '2.0', id: message.id, result: { tools } });
    if (message.method === 'tools/call') return json({ jsonrpc: '2.0', id: message.id, result: await call(message.params, init) });
    throw new Error(`Unexpected upstream method ${message.method}`);
  };
  return { fetchImpl, requests };
}

export async function connected(t, fixture = fakeUpstream(), options = {}) {
  const bridge = createReadBridge({ fetchImpl: fixture.fetchImpl, ...options });
  const client = new Client({ name: 'offline-read-bridge-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await bridge.connect(serverTransport);
  await client.connect(clientTransport);
  t.after(async () => { await client.close(); await bridge.close(); });
  return { client, bridge, ...fixture };
}

