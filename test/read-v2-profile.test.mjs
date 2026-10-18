import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog, json } from './fixtures/read-contract-v1.mjs';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createReadBridge } from '../src/read-bridge.mjs';
import { READ_PROFILES, chooseReadProfile, isReadV2Resource, readProfile, READ_V2_RESOURCE_TEMPLATES } from '../src/read-profiles.mjs';
import { searchInspectEvidence } from '../examples/read-v2/client.mjs';

const uri = 'remnant://read-v2/memory/mem_fixture/evidence?limit=5&offset=0';
const signedUri = 'remnant://read-v2/agent/agt_fixture/signed/ps_' + 'a'.repeat(32);
const signedText = '{\n "payload": {"untrusted":"report"}, "signature": "fixture-only"\n}\n';
function fixture({ resources = true, metadata = true, outputSchema = true, resource, intercept } = {}) {
  const requests = [];
  const tools = catalog().map(tool => ({ ...tool, inputSchema: { type: 'object' }, outputSchema: outputSchema ? { type: 'object' } : undefined,
    _meta: metadata ? { 'remnant/outputContract': 'remnant-public-read-v2', 'remnant/readProjection': 'remnant-read-minimal-v1', 'remnant/resourcesRequired': true } : {} }));
  return { requests, fetchImpl: async (url, init) => {
    assert.equal(new URL(url).origin + new URL(url).pathname, READ_PROFILES['minimal-v2'].endpoint);
    assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit');
    const headers = new Headers(init.headers);
    assert.equal(headers.has('authorization'), false); assert.equal(headers.has('cookie'), false);
    if (init.method === 'GET') return new Response(null, { status: 405 });
    if (init.method === 'DELETE') return new Response(null, { status: 204 });
    const message = JSON.parse(init.body); requests.push(message);
    const overridden = await intercept?.(message, init); if (overridden) return overridden;
    if (message.id === undefined) return new Response(null, { status: 202 });
    let result;
    switch (message.method) {
      case 'initialize': result = { protocolVersion: message.params.protocolVersion, capabilities: { tools: {}, ...(resources ? { resources: {} } : {}) }, serverInfo: { name: 'v2-fixture', version: '1' } }; break;
      case 'tools/list': result = { tools }; break;
      case 'tools/call': result = { content: [{ type: 'text', text: 'untrusted evidence' }], structuredContent: message.params.name === 'search_memories' ? { results: [{ id: 'mem_fixture' }] } : { evidenceResource: uri, audience: 'public', trust: 'untrusted_reports_not_truth' } }; break;
      case 'resources/list': result = { resources: [] }; break;
      case 'resources/templates/list': result = { resourceTemplates: READ_V2_RESOURCE_TEMPLATES.map((uriTemplate, index) => ({ name: 'evidence' + index, uriTemplate })) }; break;
      case 'resources/read': result = resource ?? { contents: [{ uri: message.params.uri, mimeType: 'application/json', text: message.params.uri === signedUri ? signedText : '{"audience":"public","independence":"UNKNOWN","untrusted":true}' }] }; break;
      default: throw Error('Unexpected request');
    }
    return json({ jsonrpc: '2.0', id: message.id, result });
  } };
}

test('profile selection requires demonstrated support and availability; default stays v1', () => {
  assert.equal(readProfile().endpoint, READ_PROFILES['full-v1'].endpoint);
  for (const state of ['UNKNOWN', 'UNSUPPORTED', 'SUPPORTED']) {
    assert.equal(chooseReadProfile(state, false), 'full-v1');
    assert.equal(chooseReadProfile(state, true), state === 'SUPPORTED' ? 'minimal-v2' : 'full-v1');
  }
  assert.throws(() => readProfile('auto')); assert.throws(() => chooseReadProfile('Codex', true));
});
const sdks = [{ version: '1.32.1', Client, InMemoryTransport }];
if (process.env.REMNANT_HISTORICAL_SDK_ROOT) {
  const root = resolve(process.env.REMNANT_HISTORICAL_SDK_ROOT);
  assert.equal(JSON.parse(readFileSync(join(root, 'package.json'))).version, '1.30.0');
  const load = path => import(pathToFileURL(join(root, 'dist/esm', path)).href);
  sdks.push({ version: '1.30.0', ...await load('client/index.js'), ...await load('inMemory.js') });
}
test('historical SDK environment is supplied explicitly', { skip: !process.env.REMNANT_HISTORICAL_SDK_ROOT }, () => assert.equal(sdks.length, 2));
for (const sdk of sdks) {
const connected = async (t, fixture, options) => {
  const bridge = createReadBridge({ fetchImpl: fixture.fetchImpl, ...options });
  const client = new sdk.Client({ name: 'v2-resource-test', version: sdk.version });
  const [clientTransport, serverTransport] = sdk.InMemoryTransport.createLinkedPair();
  await bridge.connect(serverTransport); await client.connect(clientTransport);
  t.after(async () => { await client.close(); await bridge.close(); });
  return { client, bridge, ...fixture };
};
test(`SDK ${sdk.version}: actual example selects v2, inspects and reads evidence through the bridge`, async t => {
  const f = await connected(t, fixture(), { profile: 'minimal-v2' });
  assert.ok(f.client.getServerCapabilities().resources);
  const result = await searchInspectEvidence(f.client, 'retry idempotency');
  assert.equal(result.profile, 'minimal-v2');
  assert.match(result.evidence.contents[0].text, /UNKNOWN/);
  assert.deepEqual(f.requests.filter(r => r.method === 'tools/call').map(r => r.params.name), ['search_memories', 'inspect_memory']);
  assert.equal(f.requests.filter(r => r.method === 'resources/read').length, 1);
  assert.deepEqual((await f.client.listResources()).resources, []);
  assert.equal((await f.client.listResourceTemplates()).resourceTemplates.length, 3);
});
test(`SDK ${sdk.version}: resource signed text and restrictive metadata are preserved; host secrets are not forwarded`, async t => {
  const f = await connected(t, fixture(), { profile: 'minimal-v2' });
  const policy = { overrides: [{ scope: 'task', read: 'off' }] };
  const result = await f.client.readResource({ uri: signedUri, _meta: { 'remnant/contribution': policy, authorization: 'not-forwarded' } });
  assert.equal(result.contents[0].text, signedText);
  const request = f.requests.find(r => r.method === 'resources/read');
  assert.deepEqual(request.params._meta, { 'remnant/contribution': policy });
});
test(`SDK ${sdk.version}: resources reject foreign URLs and malformed cursors without upstream traffic`, async t => {
  const f = await connected(t, fixture(), { profile: 'minimal-v2' });
  for (const value of ['https://private.invalid', 'file:///private', uri + '&limit=6', 'remnant://read-v2/agent/agt_x/../../secret']) {
    assert.equal(isReadV2Resource(value), false);
    await assert.rejects(f.client.readResource({ uri: value }));
  }
  await assert.rejects(f.client.listResources({ cursor: 'bad' }));
  assert.equal(f.requests.length, 0);
});
test(`SDK ${sdk.version}: v2 refuses missing server resources or mismatched contract without fallback`, async t => {
  for (const settings of [{ resources: false }, { metadata: false }]) {
    const f = await connected(t, fixture(settings), { profile: 'minimal-v2' });
    await assert.rejects(f.client.listTools());
    assert.equal(f.requests.filter(r => r.method === 'tools/call').length, 0);
  }
});
test(`SDK ${sdk.version}: v2 requires outputSchema and refuses an unvalidated call before dispatch`, async t => {
  const f = await connected(t, fixture({ outputSchema: false }), { profile: 'minimal-v2' });
  await assert.rejects(f.client.listTools(), /UPSTREAM_CATALOG_CHANGED/);
  const result = await f.client.callTool({ name: 'inspect_memory', arguments: { memoryId: 'mem_fixture' } });
  assert.equal(result.isError, true); assert.equal(result.structuredContent.code, 'UPSTREAM_CATALOG_CHANGED');
  assert.equal(result.structuredContent.status, 502); assert.equal(result.structuredContent.retryable, false);
  assert.equal(f.requests.filter(r => r.method === 'tools/call').length, 0);
});
test(`SDK ${sdk.version}: v2 tool transport failures use canonical shape and retain HTTP/RPC/retry observations`, async t => {
  for (const status of [302, 400, 401, 403, 429, 503]) {
    const f = await connected(t, fixture({ intercept: message => message.method === 'tools/call' ?
      new Response(status === 400 ? JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32602, message: 'secret invalid details' } }) : 'secret body',
        { status, headers: { 'content-type': 'application/json', 'retry-after': '4', ...(status === 302 ? { location: 'https://private.invalid' } : {}) } }) : undefined }), { profile: 'minimal-v2' });
    const result = await f.client.callTool({ name: 'inspect_memory', arguments: { memoryId: 'mem_fixture' } });
    assert.equal(result.isError, true);
    const error = result.structuredContent;
    assert.equal(error.status, status === 302 ? 502 : status);
    assert.equal(error.httpStatus, status);
    assert.equal(typeof error.error, 'string'); assert.equal('message' in error, false);
    assert.equal(error.retryable, [429, 503].includes(status));
    if (status === 400) assert.equal(error.rpcCode, -32602);
    if ([429, 503].includes(status)) assert.equal(error.retryAfter, 4);
    assert.doesNotMatch(JSON.stringify(result), /secret|private.invalid/);
    assert.equal(f.requests.filter(r => r.method === 'tools/call').length, 1);
  }
});
test(`SDK ${sdk.version}: resource RPC errors under HTTP200 preserve bounded absence/policy/rate-limit identity`, async t => {
  for (const [code, status, rpcCode, retryable] of [['RESOURCE_NOT_FOUND', 404, -32002, false], ['REMNANT_DISABLED', 403, -32603, false], ['RATE_LIMITED', 429, -32603, true], ['INVALID_OUTPUT', 500, -32603, true]]) {
    const f = await connected(t, fixture({ intercept: message => message.method === 'resources/read' ?
      json({ jsonrpc: '2.0', id: message.id, error: { code: rpcCode, message: 'secret upstream message', data: { code, status, retryable, retryAfter: 4, secret: 'never copy' } } }) : undefined }), { profile: 'minimal-v2' });
    await assert.rejects(f.client.readResource({ uri }), error => {
      assert.equal(error.code, rpcCode); assert.equal(error.data.rpcCode, rpcCode);
      assert.equal(error.data.code, code); assert.equal(error.data.status, status); assert.equal(error.data.retryable, retryable);
      assert.equal(error.data.retryAfterSeconds, 4); assert.equal(error.data.httpStatus, undefined, 'logical status is not HTTP status');
      assert.doesNotMatch(JSON.stringify(error), /secret|never copy/); return true;
    });
    assert.equal(f.requests.filter(r => r.method === 'resources/read').length, 1);
  }
  const malformed = await connected(t, fixture({ intercept: message => message.method === 'resources/read' ?
    json({ jsonrpc: '2.0', id: message.id, error: { code: -32002, message: 'secret', data: { code: 'SECRET_CODE', status: 404, retryable: false } } }) : undefined }), { profile: 'minimal-v2' });
  await assert.rejects(malformed.client.readResource({ uri }), error => { assert.equal(error.data.code, 'UPSTREAM_UNAVAILABLE'); assert.doesNotMatch(JSON.stringify(error), /SECRET_CODE|secret/); return true; });
});
test(`SDK ${sdk.version}: resource identity, byte budget, error bodies and cancellation fail closed`, async t => {
  for (const contents of [[], [{ uri, mimeType: 'application/json', blob: 'e30=' }], [{ uri, mimeType: 'text/plain', text: '{}' }], [{ uri, mimeType: 'application/json', text: 'invalid' }], [{ uri, mimeType: 'application/json', text: 'null' }]]) {
    const invalid = await connected(t, fixture({ resource: { contents } }), { profile: 'minimal-v2' });
    await assert.rejects(invalid.client.readResource({ uri }), /one JSON text document/);
  }
  const wrong = await connected(t, fixture({ resource: { contents: [{ uri: signedUri, text: 'wrong' }] } }), { profile: 'minimal-v2' });
  await assert.rejects(wrong.client.readResource({ uri }), /identity mismatch/);
  const large = await connected(t, fixture({ resource: { contents: [{ uri, text: 'x'.repeat(1_100_000) }] } }), { profile: 'minimal-v2' });
  await assert.rejects(large.client.readResource({ uri }), /byte budget/);
  const unavailable = await connected(t, fixture({ intercept: message => message.method === 'resources/read' ? new Response('secret body', { status: 503, headers: { 'retry-after': '4' } }) : undefined }), { profile: 'minimal-v2' });
  await assert.rejects(unavailable.client.readResource({ uri }), error => { assert.doesNotMatch(String(error), /secret body/); assert.equal(error.data.retryAfterSeconds, 4); return true; });
  const stalled = await connected(t, fixture({ intercept: (message, init) => message.method === 'resources/read' ? new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })) : undefined }), { profile: 'minimal-v2', timeoutMs: 80 });
  await assert.rejects(stalled.client.readResource({ uri }), /timed out or was cancelled/);
  assert.equal(stalled.requests.filter(r => r.method === 'resources/read').length, 1);
});
}
