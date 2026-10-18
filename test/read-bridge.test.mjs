import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CallToolResultSchema, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { acquisitionSource, BRIDGE_VERSION, createReadBridge, READ_ENDPOINT, READ_TOOL_NAMES } from '../src/read-bridge.mjs';

function catalog() {
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

function json(message, session) {
  return new Response(JSON.stringify(message), {
    headers: { 'content-type': 'application/json', ...(session ? { 'mcp-session-id': session } : {}) },
  });
}

function fakeUpstream({ tools = catalog(), call = async params => ({ content: [{ type: 'text', text: params.name }], structuredContent: { kind: params.name } }), intercept } = {}) {
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
    } }, `read-session-${++sessions}`);
    if (message.id === undefined) return new Response(null, { status: 202 });
    if (message.method === 'tools/list') return json({ jsonrpc: '2.0', id: message.id, result: { tools } });
    if (message.method === 'tools/call') return json({ jsonrpc: '2.0', id: message.id, result: await call(message.params, init) });
    throw new Error(`Unexpected upstream method ${message.method}`);
  };
  return { fetchImpl, requests };
}

async function connected(t, fixture = fakeUpstream(), options = {}) {
  const bridge = createReadBridge({ fetchImpl: fixture.fetchImpl, ...options });
  const client = new Client({ name: 'offline-read-bridge-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await bridge.connect(serverTransport);
  await client.connect(clientTransport);
  t.after(async () => { await client.close(); await bridge.close(); });
  return { client, bridge, ...fixture };
}

test('forwards all seven full upstream definitions without rewriting required defaults', async t => {
  const tools = catalog();
  const { client, requests } = await connected(t, fakeUpstream({ tools }));
  const listed = await client.listTools();
  assert.deepEqual(listed.tools, tools);
  assert.equal(client.getServerVersion().version, BRIDGE_VERSION);
  assert.equal(requests.filter(x => x.method === 'DELETE').length, 1);
  assert.deepEqual(requests.find(x => x.method === 'initialize').params.clientInfo, { name: 'remnant-read-stdio', version: BRIDGE_VERSION });
});

test('preserves tool results, isError and structuredContent; forwards args without injecting defaults', async t => {
  const expected = {
    isError: true,
    content: [{ type: 'text', text: 'An honest upstream refusal.' }],
    structuredContent: { kind: 'upstream-error', code: 'MEMORY_NOT_FOUND', retryAfterSeconds: 3 },
    _meta: { 'example.com/result': { retained: true } },
  };
  const { client, requests } = await connected(t, fakeUpstream({ call: async () => expected }));
  const policy = { automatic: true, overrides: [{ scope: 'task', noExternalWrite: true }] };
  const result = await client.callTool({ name: 'inspect_memory', arguments: { memoryId: 'public-example' }, _meta: { 'remnant/contribution': policy, 'host/private': 'must-not-forward' } });
  assert.deepEqual(result, expected);
  const forwarded = requests.find(x => x.method === 'tools/call').params;
  assert.deepEqual(forwarded.arguments, { memoryId: 'public-example' });
  assert.deepEqual(forwarded._meta, { 'remnant/contribution': policy });
});

test('rejects write, unknown, background-task and cursor requests without upstream traffic', async t => {
  const { client, requests } = await connected(t);
  for (const name of ['publish_memory', 'retrieve_memory', 'candy_start', 'unknown_tool']) {
    await assert.rejects(client.callTool({ name, arguments: {} }), error => error.code === ErrorCode.InvalidParams);
  }
  // The SDK itself rejects task creation before the ordinary handler is reached.
  await assert.rejects(client.request({ method: 'tools/call', params: { name: 'search_memories', task: { ttl: 1000 }, arguments: {} } }, CallToolResultSchema), /does not support task creation/);
  await assert.rejects(client.listTools({ cursor: 'unexpected' }), error => error.code === ErrorCode.InvalidParams);
  assert.equal(requests.length, 0);
});

test('fails closed on added, missing, duplicate or no-longer-read-only upstream tools', async t => {
  const mutations = [
    tools => [...tools, { ...tools[0], name: 'publish_memory' }],
    tools => tools.slice(1),
    tools => [tools[0], ...tools.slice(0, -1)],
    tools => tools.map((tool, i) => i ? tool : { ...tool, annotations: { ...tool.annotations, readOnlyHint: false } }),
    tools => tools.map((tool, i) => i ? tool : { ...tool, annotations: { ...tool.annotations, destructiveHint: true } }),
  ];
  for (const mutate of mutations) {
    const { client, requests } = await connected(t, fakeUpstream({ tools: mutate(catalog()) }));
    const result = await client.callTool({ name: 'search_memories', arguments: { query: 'test' } });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.code, 'UPSTREAM_CATALOG_CHANGED');
    assert.equal(requests.some(x => x.method === 'tools/call'), false);
  }
});

test('concurrent calls have isolated sessions and keep their own results', async t => {
  const { client, requests } = await connected(t, fakeUpstream({
    call: async params => {
      await new Promise(resolve => setTimeout(resolve, params.arguments.delay));
      return { content: [{ type: 'text', text: params.arguments.query }], structuredContent: { kind: params.arguments.query } };
    },
  }));
  const queries = ['one', 'two', 'three', 'four'];
  const results = await Promise.all(queries.map((query, i) => client.callTool({ name: 'search_memories', arguments: { query, delay: (4 - i) * 5 } })));
  assert.deepEqual(results.map(x => x.structuredContent.kind), queries);
  const calls = requests.filter(x => x.method === 'tools/call');
  assert.equal(new Set(calls.map(x => x.session)).size, queries.length);
  assert.equal(requests.filter(x => x.method === 'DELETE').length, queries.length);
});

test('enforces finite concurrency before starting a ninth upstream session', async t => {
  let release;
  let reached;
  const held = new Promise(resolve => { release = resolve; });
  const ready = new Promise(resolve => { reached = resolve; });
  let inFlight = 0;
  const { client, requests } = await connected(t, fakeUpstream({ call: async () => {
    if (++inFlight === 8) reached();
    await held;
    return { content: [], structuredContent: { kind: 'completed' } };
  } }));
  const pending = Array.from({ length: 8 }, () => client.callTool({ name: 'try_remnant', arguments: {} }));
  try {
    await ready;
    const ninth = await client.callTool({ name: 'try_remnant', arguments: {} });
    assert.equal(ninth.isError, true);
    assert.equal(ninth.structuredContent.code, 'BRIDGE_BUSY');
    assert.equal(requests.filter(x => x.method === 'initialize').length, 8);
  } finally { release(); await Promise.all(pending); }
});

test('times out a stalled upstream connection and never echoes upstream bodies', async t => {
  const fixture = fakeUpstream({ intercept: async (message, init) => {
    if (message.method === 'initialize') await new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
    });
  } });
  const { client } = await connected(t, fixture, { timeoutMs: 40 });
  const started = Date.now();
  const result = await client.callTool({ name: 'search_memories', arguments: { query: 'test' } });
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.code, 'UPSTREAM_TIMEOUT');
  assert.ok(Date.now() - started < 1000);
  const failed = await connected(t, fakeUpstream({ intercept: async () => new Response('private echoed body', { status: 503 }) }));
  const error = await failed.client.callTool({ name: 'search_memories', arguments: { query: 'test' } });
  assert.equal(error.structuredContent.code, 'UPSTREAM_UNAVAILABLE');
  assert.equal(JSON.stringify(error).includes('private echoed body'), false);
});

test('propagates cancellation to a pending upstream request', async t => {
  let started;
  let aborted;
  const running = new Promise(resolve => { started = resolve; });
  const cancellation = new Promise(resolve => { aborted = resolve; });
  const { client } = await connected(t, fakeUpstream({ intercept: async (message, init) => {
    if (message.method !== 'tools/call') return;
    started();
    await new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => { aborted(); reject(init.signal.reason); }, { once: true }));
  } }));
  const controller = new AbortController();
  const call = client.callTool({ name: 'try_remnant', arguments: {} }, undefined, { signal: controller.signal });
  await running;
  controller.abort();
  await assert.rejects(call);
  await cancellation;
});

test('source labels are constrained route attribution, not arbitrary URLs or headers', async t => {
  for (const value of ['stdio', 'glama', 'operator']) assert.equal(acquisitionSource(value), value);
  for (const value of ['', 'https://elsewhere.example', 'glama&secret=x', 'GLAMA']) {
    assert.throws(() => acquisitionSource(value));
  }
  const { client, requests } = await connected(t, fakeUpstream(), { source: 'glama' });
  await client.listTools();
  assert.ok(requests.filter(x => x.source).every(x => x.source === 'glama'));
  assert.ok(requests.every(x => !x.probe));
  const operator = await connected(t, fakeUpstream(), { source: 'operator' });
  await operator.client.listTools();
  assert.ok(operator.requests.filter(x => x.source).every(x => x.probe === 'glama-directory-health'));
});

test('reads every bounded upstream catalog page and refuses redirect destinations', async t => {
  const tools = catalog();
  const pages = fakeUpstream({ intercept: async message => {
    if (message.method !== 'tools/list') return;
    return json({ jsonrpc: '2.0', id: message.id, result: message.params?.cursor === 'second'
      ? { tools: tools.slice(3) } : { tools: tools.slice(0, 3), nextCursor: 'second' } });
  } });
  const { client } = await connected(t, pages);
  assert.deepEqual((await client.listTools()).tools, tools);
  const redirect = fakeUpstream({ intercept: async () => new Response(null, { status: 307, headers: { location: 'https://elsewhere.example/collect' } }) });
  const other = await connected(t, redirect);
  await assert.rejects(other.client.listTools(), /UPSTREAM_REDIRECT_REFUSED|UPSTREAM_UNAVAILABLE/);
  assert.equal(redirect.requests.length, 1);
});

test('the real stdio executable initializes and refuses writes without network access', async t => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../src/read-bridge.mjs', import.meta.url))],
    env: { REMNANT_ACQUISITION_SOURCE: 'operator' },
    stderr: 'pipe',
  });
  let stderr = '';
  transport.stderr?.on('data', chunk => { stderr += chunk.toString(); });
  const client = new Client({ name: 'offline-stdio-contract', version: '1.0.0' });
  t.after(() => client.close());
  await client.connect(transport, { timeout: 5000 });
  assert.equal(client.getServerVersion().name, 'remnant-read-stdio');
  assert.equal(client.getServerVersion().version, BRIDGE_VERSION);
  await assert.rejects(client.callTool({ name: 'publish_memory', arguments: {} }), error => error.code === ErrorCode.InvalidParams);
  assert.equal(stderr, '');
});
