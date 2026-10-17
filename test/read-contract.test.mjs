import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { createReadBridge, READ_TOOL_NAMES } from '../src/read-bridge.mjs';
import { catalog, fakeUpstream, json } from './fixtures/read-contract-v1.mjs';

const contract = JSON.parse(await readFile(new URL('../schemas/read-contract-v2.json', import.meta.url), 'utf8'));
const packageInfo = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const installedCurrentSdk = JSON.parse(await readFile(new URL('../node_modules/@modelcontextprotocol/sdk/package.json', import.meta.url), 'utf8'));
const clients = [{ version: '1.32.1', Client, InMemoryTransport, CallToolResultSchema }];
const historicalRoot = process.env.REMNANT_HISTORICAL_SDK_ROOT;
if (historicalRoot) {
  const root = resolve(historicalRoot);
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.name, '@modelcontextprotocol/sdk');
  assert.equal(pkg.version, '1.30.0', 'Do not relabel a different SDK as the historical client');
  const module = async path => import(pathToFileURL(join(root, 'dist/esm', path)).href);
  clients.push({ version: pkg.version, ...(await module('client/index.js')),
    ...(await module('inMemory.js')), ...(await module('types.js')) });
}

test('contract identifies the actual current and historical client versions', () => {
  assert.equal(packageInfo.dependencies['@modelcontextprotocol/sdk'], contract.clients[0].version);
  assert.equal(installedCurrentSdk.version, contract.clients[0].version);
  assert.deepEqual(READ_TOOL_NAMES, contract.toolNames);
  assert.deepEqual(contract.clients.map(x => x.version), ['1.32.1', '1.30.0']);
});
test('historical SDK 1.30.0 environment is supplied explicitly', { skip: !historicalRoot }, () => {
  assert.ok(clients.some(client => client.version === '1.30.0'));
});

for (const sdk of clients) {
  async function connect(t, fixture) {
    const bridge = createReadBridge({ fetchImpl: fixture.fetchImpl });
    const client = new sdk.Client({ name: 'remnant-read-contract', version: sdk.version });
    const [a, b] = sdk.InMemoryTransport.createLinkedPair();
    await bridge.connect(b);
    await client.connect(a);
    t.after(async () => { await client.close(); await bridge.close(); });
    return { client, ...fixture };
  }
  test(`SDK ${sdk.version}: initialize, seven schemas, extensions and stateless/session lifecycle`, async t => {
    for (const sessionsEnabled of [false, true]) {
      const tools = catalog();
      tools[0].inputSchema.properties.optionalExtension = { type: 'string' };
      const { client, requests } = await connect(t, fakeUpstream({ tools, sessionsEnabled }));
      const listed = await client.listTools();
      assert.deepEqual(listed.tools, tools);
      assert.deepEqual(listed.tools.map(tool => tool.name), contract.toolNames);
      assert.ok(listed.tools.every(tool => tool.annotations.readOnlyHint && tool.annotations.destructiveHint === false));
      assert.equal(requests[0].method, 'initialize');
      assert.equal(requests[0].params.protocolVersion, contract.protocolVersion);
      assert.equal(requests[1].method, 'notifications/initialized');
      assert.equal(requests.filter(request => request.method === 'DELETE').length, sessionsEnabled ? 1 : 0);
      for (const name of contract.toolNames) {
        const result = await client.callTool({ name, arguments: { query: 'fixture' } });
        assert.equal(result.structuredContent.kind, name);
      }
      assert.ok(requests.filter(request => request.method === 'tools/call').every(request => contract.toolNames.includes(request.params.name)));
    }
  });

  test(`SDK ${sdk.version}: valid, empty, absent content, structured output and isError retain meaning`, async t => {
    const cases = [
      { output: true, result: { content: [], structuredContent: { kind: 'empty', results: [], additionalField: { retained: true } } } },
      { output: true, result: { structuredContent: { kind: 'without-content' } } },
      { output: true, result: { isError: true, content: [{ type: 'text', text: 'Observed refusal' }], structuredContent: { kind: 'refusal', code: 'NOT_FOUND' } } },
      { output: true, result: { isError: true, content: [] } },
      { output: false, result: { content: [] } },
      { output: false, result: { content: [{ type: 'text', text: 'Unicode evidence: é / 日本語' }], _meta: { retained: true } } },
    ];
    for (const entry of cases) {
      const tools = catalog().map(tool => {
        if (!entry.output) { const { outputSchema, ...rest } = tool; return rest; }
        return tool;
      });
      const { client, requests } = await connect(t, fakeUpstream({ tools, call: async () => entry.result }));
      await client.listTools();
      const result = await client.callTool({ name: 'search_memories', arguments: { query: 'fixture', optionalExtension: 'retained' } });
      assert.deepEqual(result, { content: [], ...entry.result });
      assert.equal(result.isError, entry.result.isError);
      assert.deepEqual(requests.find(request => request.method === 'tools/call').params.arguments,
        { query: 'fixture', optionalExtension: 'retained' });
      assert.equal(requests.filter(request => request.method === 'tools/call').length, 1);
    }
  });

  test(`SDK ${sdk.version}: malformed outputs are refused as output errors without a retry or secret echo`, async t => {
    for (const result of [
      { content: [], structuredContent: { kind: 42, private: 'private fixture secret' } },
      { content: [] }, { content: 'private fixture secret' },
      { content: [{ type: 'text', text: 42 }], structuredContent: { kind: 'bad-block' } },
    ]) {
      const { client, requests } = await connect(t, fakeUpstream({ call: async () => result }));
      // Inspect the wire result separately from downstream SDK output validation.
      // Bridge errors are isError outcomes, never a successful schema-conforming result.
      const error = await client.request({ method: 'tools/call', params: { name: 'search_memories', arguments: {} } }, sdk.CallToolResultSchema);
      assert.equal(error.isError, true);
      assert.equal(error.structuredContent.code, 'UPSTREAM_INVALID_RESPONSE');
      assert.doesNotMatch(JSON.stringify(error), /private fixture secret/);
      assert.equal(requests.filter(request => request.method === 'tools/call').length, 1);
    }
  });

  test(`SDK ${sdk.version}: transport errors stay distinct; writes and unsafe catalog additions cannot dispatch`, async t => {
    for (const [failure, expected] of [[429, 'UPSTREAM_RATE_LIMITED'], [503, 'UPSTREAM_UNAVAILABLE'],
      [403, 'UPSTREAM_ACCESS_DENIED'], [-32602, 'UPSTREAM_INVALID_PARAMS']]) {
      const tools = catalog().map(({ outputSchema, ...tool }) => tool);
      const fixture = fakeUpstream({ tools, intercept: async message => {
        if (message.method !== 'tools/call') return;
        return failure < 0 ? json({ jsonrpc: '2.0', id: message.id, error: { code: failure, message: 'private fixture secret' } })
          : new Response('private fixture secret', { status: failure, headers: { 'retry-after': '17' } });
      } });
      const { client, requests } = await connect(t, fixture);
      await client.listTools();
      const error = await client.callTool({ name: 'try_remnant', arguments: {} });
      assert.equal(error.isError, true);
      assert.equal(error.structuredContent.code, expected);
      assert.equal(error.structuredContent.retryAfterSeconds, [429, 503].includes(failure) ? 17 : undefined);
      assert.equal(requests.filter(request => request.method === 'tools/call').length, 1);
      assert.doesNotMatch(JSON.stringify(error), /private fixture secret/);
    }
    const fixture = fakeUpstream();
    const { client, requests } = await connect(t, fixture);
    for (const name of ['publish_memory', 'feedback_memory', 'retrieve_memory', 'unknown'])
      await assert.rejects(client.callTool({ name, arguments: {} }), error => error.code === -32602);
    assert.equal(requests.length, 0);
    for (const addedName of ['publish_memory', 'future_read_tool']) {
      const unsafe = await connect(t, fakeUpstream({ tools: [...catalog(), { ...catalog()[0], name: addedName }] }));
      assert.deepEqual((await unsafe.client.listTools()).tools.map(tool => tool.name), contract.toolNames);
      await assert.rejects(unsafe.client.callTool({ name: addedName, arguments: {} }), error => error.code === -32602);
      assert.equal(unsafe.requests.filter(request => request.method === 'tools/call').length, 0);
    }
  });
}
