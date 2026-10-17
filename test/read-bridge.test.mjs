import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResultSchema, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { acquisitionSource, BRIDGE_VERSION, MAX_RETRY_AFTER_SECONDS, parseRetryAfter } from '../src/read-bridge.mjs';
import { catalog, json, fakeUpstream, connected } from './fixtures/read-contract-v1.mjs';

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

test('Retry-After accepts bounded seconds and canonical HTTP dates, never arbitrary text', () => {
  const now = Date.parse('2026-10-17T12:00:00Z');
  for (const [value, expected] of [
    ['17', 17], ['0', 0], [' 17 ', 17], ['99999999999999999999', MAX_RETRY_AFTER_SECONDS],
    ['Sat, 17 Oct 2026 12:00:17 GMT', 17], ['Sat, 17 Oct 2026 11:00:00 GMT', 0],
    ['Sun, 18 Oct 2026 12:00:00 GMT', MAX_RETRY_AFTER_SECONDS],
    [null, undefined], ['', undefined], ['-1', undefined], ['+17', undefined], ['1.5', undefined],
    ['1e3', undefined], ['17, 18', undefined], ['9'.repeat(129), undefined], ['private fixture secret', undefined],
    ['2026-10-17T12:00:17Z', undefined], ['Sun, 17 Oct 2026 12:00:17 GMT', undefined],
    ['Sat, 17 Oct 2026 25:00:17 GMT', undefined],
  ]) assert.equal(parseRetryAfter(value, now), expected, String(value));
});

test('HTTP failures retain safe categories and retry hints without reading or echoing bodies', async t => {
  for (const [status, code] of [[429, 'UPSTREAM_RATE_LIMITED'], [503, 'UPSTREAM_UNAVAILABLE'],
    [401, 'UPSTREAM_ACCESS_DENIED'], [403, 'UPSTREAM_ACCESS_DENIED']]) {
    for (const method of ['tools/call', 'tools/list', 'initialize']) {
      let cancelled = 0;
      const fixture = fakeUpstream({ intercept: async message => {
        if (message.method !== method) return;
        const response = new Response(new ReadableStream({ cancel() { cancelled++; } }), {
          status, headers: { 'retry-after': '17', 'www-authenticate': 'Bearer private fixture secret' },
        });
        response.text = () => { throw new Error('Error body must never be read'); };
        return response;
      } });
      const { client } = await connected(t, fixture);
      const result = await client.callTool({ name: 'try_remnant', arguments: {} });
      assert.equal(result.isError, true);
      assert.equal(result.structuredContent.code, code);
      assert.equal(result.structuredContent.httpStatus, status);
      assert.equal(result.structuredContent.retryAfterSeconds, [429, 503].includes(status) ? 17 : undefined);
      assert.ok(JSON.stringify(result).length < 700);
      assert.doesNotMatch(JSON.stringify(result), /private fixture secret|Bearer|Error body/);
      assert.equal(cancelled, 1);
      assert.equal(fixture.requests.filter(x => x.method === method).length, 1, 'No retry at any request phase');
    }
  }
});

test('list failures carry safe machine-readable data and JSON-RPC invalid params never echo server messages', async t => {
  for (const method of ['tools/list', 'tools/call']) {
    const fixture = fakeUpstream({ intercept: async message => message.method === method
      ? json({ jsonrpc: '2.0', id: message.id, error: { code: -32602, message: 'private fixture secret', data: { token: 'private fixture secret' } } }) : undefined });
    const { client } = await connected(t, fixture);
    if (method === 'tools/list') {
      await assert.rejects(client.listTools(), error => {
        assert.equal(error.code, -32602);
        assert.equal(error.data.code, 'UPSTREAM_INVALID_PARAMS');
        assert.doesNotMatch(JSON.stringify(error) + error.message, /private fixture secret/);
        return true;
      });
    } else {
      const result = await client.callTool({ name: 'try_remnant', arguments: {} });
      assert.equal(result.structuredContent.code, 'UPSTREAM_INVALID_PARAMS');
      assert.equal(result.structuredContent.rpcCode, -32602);
      assert.doesNotMatch(JSON.stringify(result), /private fixture secret/);
    }
    assert.equal(fixture.requests.filter(x => x.method === method).length, 1);
  }
  const fixture = fakeUpstream({ intercept: async message => message.method === 'tools/list'
    ? new Response('private fixture secret', { status: 429, headers: { 'retry-after': '17' } }) : undefined });
  const { client } = await connected(t, fixture);
  await assert.rejects(client.listTools(), error => error.data.code === 'UPSTREAM_RATE_LIMITED' && error.data.retryAfterSeconds === 17);
});

test('malformed or excessive Retry-After is omitted or clamped and cannot leak between concurrent requests', async t => {
  const values = ['17', '-7', 'private fixture secret', '9'.repeat(129), '999999999999'];
  const expected = [17, undefined, undefined, undefined, MAX_RETRY_AFTER_SECONDS];
  const fixture = fakeUpstream({ intercept: async message => message.method === 'tools/call'
    ? new Response('private fixture secret', { status: 429, headers: { 'retry-after': values[message.params.arguments.index] } }) : undefined });
  const { client } = await connected(t, fixture);
  const results = await Promise.all(values.map((_, index) => client.callTool({ name: 'try_remnant', arguments: { index } })));
  assert.deepEqual(results.map(result => result.structuredContent.retryAfterSeconds), expected);
  assert.ok(results.every(result => result.structuredContent.code === 'UPSTREAM_RATE_LIMITED'));
  assert.doesNotMatch(JSON.stringify(results), /private fixture secret/);
  assert.equal(fixture.requests.filter(x => x.method === 'tools/call').length, values.length);
});

test('a timeout during a tool call remains bounded and makes no second call', async t => {
  const fixture = fakeUpstream({ intercept: async (message, init) => {
    if (message.method === 'tools/call') await new Promise((_resolve, reject) =>
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }));
  } });
  const { client } = await connected(t, fixture, { timeoutMs: 100 });
  const result = await client.callTool({ name: 'try_remnant', arguments: {} });
  assert.equal(result.structuredContent.code, 'UPSTREAM_TIMEOUT');
  assert.equal(fixture.requests.filter(x => x.method === 'tools/call').length, 1);
});

test('HTTP400 InvalidParams keeps only a bounded matching JSON-RPC code', async t => {
  for (const method of ['initialize', 'tools/list', 'tools/call']) {
    const fixture = fakeUpstream({ intercept: async message => message.method === method
      ? new Response(JSON.stringify({ jsonrpc: '2.0', id: message.id,
        error: { code: -32602, message: 'private fixture secret', data: { token: 'private fixture secret' } } }),
        { status: 400, headers: { 'content-type': 'application/json; charset=utf-8' } }) : undefined });
    const { client } = await connected(t, fixture);
    const result = await client.callTool({ name: 'try_remnant', arguments: {} });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.code, 'UPSTREAM_INVALID_PARAMS');
    assert.equal(result.structuredContent.rpcCode, -32602);
    assert.equal(result.structuredContent.httpStatus, 400);
    assert.doesNotMatch(JSON.stringify(result), /private fixture secret|token/);
    assert.equal(fixture.requests.filter(x => x.method === method).length, 1);
  }
});

test('HTTP400 malformed, unrelated and oversized bodies stay generic and bounded', async t => {
  const variants = [
    () => 'private fixture secret',
    () => JSON.stringify({ jsonrpc: '2.0', id: 'wrong-id', error: { code: -32602 } }),
    message => JSON.stringify({ jsonrpc: '2.0', id: message.id, result: {}, error: { code: -32602 } }),
    message => JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: 'private fixture secret' } }),
    message => JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32602, message: 'x'.repeat(16385) } }),
  ];
  for (const body of variants) {
    const fixture = fakeUpstream({ intercept: async message => message.method === 'tools/call'
      ? new Response(body(message), { status: 400, headers: { 'content-type': 'application/json' } }) : undefined });
    const { client } = await connected(t, fixture);
    const result = await client.callTool({ name: 'try_remnant', arguments: {} });
    assert.equal(result.structuredContent.code, 'UPSTREAM_UNAVAILABLE');
    assert.equal(result.structuredContent.rpcCode, undefined);
    assert.ok(JSON.stringify(result).length < 700);
    assert.doesNotMatch(JSON.stringify(result), /private fixture secret/);
  }
  let bytesRead = 0, cancelled = false;
  const fixture = fakeUpstream({ intercept: async message => message.method === 'tools/call'
    ? new Response(new ReadableStream({ pull(controller) { bytesRead += 4096; controller.enqueue(new Uint8Array(4096)); },
      cancel() { cancelled = true; } }), { status: 400, headers: { 'content-type': 'application/json' } }) : undefined });
  const { client } = await connected(t, fixture);
  const result = await client.callTool({ name: 'try_remnant', arguments: {} });
  assert.equal(result.structuredContent.code, 'UPSTREAM_UNAVAILABLE');
  assert.ok(cancelled); assert.ok(bytesRead <= 24576, 'bounded read plus one stream-prefetched chunk');
});

test('HTTP400 error-body stall obeys the same total deadline and cancels its stream', async t => {
  let cancelled = false;
  const fixture = fakeUpstream({ intercept: async message => message.method === 'tools/call'
    ? new Response(new ReadableStream({ cancel() { cancelled = true; } }),
      { status: 400, headers: { 'content-type': 'application/json' } }) : undefined });
  const { client } = await connected(t, fixture, { timeoutMs: 100 });
  const started = Date.now(), result = await client.callTool({ name: 'try_remnant', arguments: {} });
  assert.equal(result.structuredContent.code, 'UPSTREAM_TIMEOUT');
  assert.ok(cancelled); assert.ok(Date.now() - started < 1000);
  assert.equal(fixture.requests.filter(x => x.method === 'tools/call').length, 1);
});
