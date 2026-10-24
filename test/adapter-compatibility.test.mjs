import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { searchAndInspect, toolValue } from '../examples/remote-mcp/client.ts';
import { firstRead, readData } from '../examples/mastra-remnant/remnant-read.mjs';
import { connected, fakeUpstream } from './fixtures/read-contract-v1.mjs';
const cases = JSON.parse(readFileSync(new URL('./fixtures/adapter-compatibility-v1.json', import.meta.url)));
const endpoint = new URL('https://remnant.dedale-bi.com/mcp/chatgpt');

function sdkFixture(search, inspect, errorEnvelope) {
  const calls = [];
  return { calls, fetcher: async (url, init) => {
    assert.equal(new URL(url).origin, endpoint.origin);
    if (init.method === 'GET') return new Response(null, { status: 405 });
    if (init.method === 'DELETE') return new Response(null, { status: 204 });
    const message = JSON.parse(init.body);
    calls.push(message);
    if (message.id === undefined) return new Response(null, { status: 202 });
    const result = message.method === 'initialize'
      ? { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'offline', version: '1' } }
      : message.method === 'tools/list'
        ? { tools: ['search_memories', 'inspect_memory'].map(name => ({ name, inputSchema: { type: 'object' } })) }
        : errorEnvelope ?? { content: [{ type: 'text', text: JSON.stringify(message.params.name === 'search_memories' ? search : inspect) }] };
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }), { headers: { 'content-type': 'application/json' } });
  } };
}

function mastraFixture(search, inspect, thrown) {
  const calls = [], fixture = { closed: 0, calls };
  fixture.connect = async () => ({ tools: {
    remnant_search_memories: { execute: async () => { calls.push('search'); if (thrown) throw thrown; return search; } },
    remnant_inspect_memory: { execute: async args => { calls.push(args.memoryId); return inspect; } },
  }, close: async () => { fixture.closed++; } });
  return fixture;
}
const searchFor = id => ({ results: [{ id, contentAccess: { fullContentAvailable: true } }] });

test('bridge with real SDK roundtrips common ID/Unicode data; it does not interpret selection identity', async t => {
  const { client } = await connected(t, fakeUpstream({ call: async params => ({ content: [],
    structuredContent: { kind: 'fixture', id: params.arguments.memoryId, insight: cases.unicode } }) }));
  for (const memoryId of cases.memoryIds) {
    const result = await client.callTool({ name: 'inspect_memory', arguments: { memoryId } });
    assert.equal(result.structuredContent.id, memoryId);
    assert.equal(result.structuredContent.insight, cases.unicode);
  }
});

for (const id of cases.memoryIds) {
  test(`real SDK 1.32.1 search/inspect: ${id.length - 4} hex and Unicode`, async () => {
    const memory = { id, insight: cases.unicode }, fixture = sdkFixture(searchFor(id), memory);
    const result = await searchAndInspect(endpoint, 'fixture', fixture.fetcher);
    assert.deepEqual(result.inspected, memory);
    assert.equal(fixture.calls.find(x => x.params?.name === 'inspect_memory').params.arguments.memoryId, id);
  });
  test(`Mastra adapter logic with injected connection: ${id.length - 4} hex and Unicode`, async () => {
    const memory = { id, insight: cases.unicode }, fixture = mastraFixture(searchFor(id), memory);
    assert.deepEqual((await firstRead('fixture', fixture.connect)).memory, memory);
    assert.deepEqual(fixture.calls, ['search', id]); assert.equal(fixture.closed, 1);
  });
}

test('SDK and Mastra adapters preserve successful empty results separately from malformed search', async () => {
  let fixture = sdkFixture(cases.emptySearch);
  assert.equal((await searchAndInspect(endpoint, 'fixture', fixture.fetcher)).inspected, null);
  assert.equal(fixture.calls.filter(x => x.method === 'tools/call').length, 1);
  const mastra = mastraFixture(cases.emptySearch);
  assert.equal((await firstRead('fixture', mastra.connect)).status, 'no_public_match');
  assert.deepEqual(mastra.calls, ['search']); assert.equal(mastra.closed, 1);
  for (const malformed of cases.malformedSearch) {
    fixture = sdkFixture(malformed);
    await assert.rejects(searchAndInspect(endpoint, 'fixture', fixture.fetcher));
    assert.equal(fixture.calls.filter(x => x.method === 'tools/call').length, 1);
    const other = mastraFixture(malformed);
    await assert.rejects(firstRead('fixture', other.connect));
    assert.deepEqual(other.calls, ['search']); assert.equal(other.closed, 1);
  }
});

test('SDK and Mastra refuse wrong inspection identity and unusable selected IDs', async () => {
  for (const selected of [cases.memoryIds[0], '', null]) {
    const fixture = sdkFixture(searchFor(selected), { id: cases.wrongIdentity });
    await assert.rejects(searchAndInspect(endpoint, 'fixture', fixture.fetcher));
    const other = mastraFixture(searchFor(selected), { id: cases.wrongIdentity });
    await assert.rejects(firstRead('fixture', other.connect)); assert.equal(other.closed, 1);
  }
});

test('isError overrides misleading structured empty results in both adapters and real SDK transport', async () => {
  assert.throws(() => toolValue(cases.errorEnvelope));
  assert.throws(() => readData(cases.errorEnvelope));
  const fixture = sdkFixture(undefined, undefined, cases.errorEnvelope);
  await assert.rejects(searchAndInspect(endpoint, 'fixture', fixture.fetcher));
  assert.equal(fixture.calls.filter(x => x.method === 'tools/call').length, 1);
  const other = mastraFixture(cases.errorEnvelope);
  await assert.rejects(firstRead('fixture', other.connect));
  assert.deepEqual(other.calls, ['search']); assert.equal(other.closed, 1);
});

test('Mastra adapter propagates an injected cancellation and closes once; native cancellation NOT_RUN', async () => {
  const error = new DOMException('fixture cancellation', 'AbortError');
  const fixture = mastraFixture(undefined, undefined, error);
  await assert.rejects(firstRead('fixture', fixture.connect), thrown => thrown === error);
  assert.deepEqual(fixture.calls, ['search']); assert.equal(fixture.closed, 1);
});
