// Unit checks of the real example using the installed MCPClient with mocked tools.
// No MCP transport, model, production memory or external outcome is exercised.
import assert from 'node:assert/strict';
import { Socket } from 'node:net';
import { after, mock, test } from 'node:test';

mock.method(globalThis, 'fetch', async () => { throw new Error('Network forbidden in unit tests'); });
mock.method(Socket.prototype, 'connect', () => { throw new Error('Network forbidden in unit tests'); });
after(() => mock.restoreAll());

const { MCPClient } = await import('@mastra/mcp');
const { firstRead } = await import('./remnant-read.mjs');
const QUERY = 'synthetic incremental import';
const ID = 'mem_' + 'a'.repeat(32);
const MEMORY = { id: ID, version: 3, content: { insight: 'Synthetic evidence only' } };

function fixture(t, search, inspected = { structuredContent: MEMORY }) {
  const calls = [];
  let disconnects = 0;
  t.mock.method(MCPClient.prototype, 'listTools', async () => ({
    remnant_search_memories: {
      execute: async args => {
        calls.push({ name: 'search', args });
        return { structuredContent: search };
      },
    },
    remnant_inspect_memory: {
      execute: async args => {
        calls.push({ name: 'inspect', args });
        return inspected;
      },
    },
  }));
  t.mock.method(MCPClient.prototype, 'disconnect', async () => { disconnects += 1; });
  return { calls, disconnects: () => disconnects };
}

test('missing results is an invalid search, never no_public_match', async t => {
  const observed = fixture(t, { status: 'synthetic unexpected response' });
  await assert.rejects(firstRead(QUERY), /Invalid search response: expected a results array/);
  assert.deepEqual(observed.calls, [{ name: 'search', args: { query: QUERY, limit: 3 } }]);
  assert.equal(observed.disconnects(), 1);
});

test('an empty results array remains a valid no_public_match', async t => {
  const search = { results: [] };
  const observed = fixture(t, search);
  assert.deepEqual(await firstRead(QUERY), { status: 'no_public_match', query: QUERY, search });
  assert.deepEqual(observed.calls, [{ name: 'search', args: { query: QUERY, limit: 3 } }]);
  assert.equal(observed.disconnects(), 1);
});

test('a readable candidate is still inspected and returned unchanged', async t => {
  const observed = fixture(t, { results: [{ id: ID, contentAccess: { fullContentAvailable: true } }] });
  const result = await firstRead(QUERY);
  assert.equal(result.status, 'public_memory_read');
  assert.deepEqual(result.memory, MEMORY);
  assert.deepEqual(observed.calls, [
    { name: 'search', args: { query: QUERY, limit: 3 } },
    { name: 'inspect', args: { memoryId: ID, detail: 'evidence' } },
  ]);
  assert.equal(observed.disconnects(), 1);
});

// Bind the returned evidence to the memory selected by this read.
for (const [label, memory] of [
  ['another ID', { ...MEMORY, id: 'mem_' + 'b'.repeat(32) }],
  ['missing ID', { version: MEMORY.version, content: MEMORY.content }],
  ['null', null],
  ['an array', []],
]) {
  test(`inspection returning ${label} is rejected and the connection closes`, async t => {
    const observed = fixture(t, { results: [{ id: ID, contentAccess: { fullContentAvailable: true } }] }, { structuredContent: memory });
    await assert.rejects(firstRead(QUERY), /Invalid inspection response: memory ID does not match the selected candidate/);
    assert.deepEqual(observed.calls, [
      { name: 'search', args: { query: QUERY, limit: 3 } },
      { name: 'inspect', args: { memoryId: ID, detail: 'evidence' } },
    ]);
    assert.equal(observed.disconnects(), 1);
  });
}

for (const [label, id] of [['missing', undefined], ['blank', '']]) {
  test(`a readable candidate with a ${label} ID is rejected before inspection`, async t => {
    const observed = fixture(t, { results: [{ id, contentAccess: { fullContentAvailable: true } }] });
    await assert.rejects(firstRead(QUERY), /Invalid search response: readable candidate must have a non-empty ID/);
    assert.deepEqual(observed.calls, [{ name: 'search', args: { query: QUERY, limit: 3 } }]);
    assert.equal(observed.disconnects(), 1);
  });
}

test('a matching text-envelope inspection preserves the complete current evidence', async t => {
  const memory = { ...MEMORY, version: 8, provenance: { source: 'synthetic' }, contradictions: [{ note: 'synthetic counterexample' }], futureField: { retained: true } };
  const observed = fixture(t, { results: [{ id: ID, version: 3, contentAccess: { fullContentAvailable: true } }] }, { content: [{ type: 'text', text: JSON.stringify(memory) }] });
  const result = await firstRead(QUERY);
  assert.equal(result.status, 'public_memory_read');
  assert.deepEqual(result.memory, memory);
  assert.deepEqual(observed.calls, [
    { name: 'search', args: { query: QUERY, limit: 3 } },
    { name: 'inspect', args: { memoryId: ID, detail: 'evidence' } },
  ]);
  assert.equal(observed.disconnects(), 1);
});
