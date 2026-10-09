import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultMapReadResult } from 'darwin-agents/memory/bridge';
import { inspectedLesson, readLessons } from './reader.mjs';

const id = 'mem_example';
const publicAccess = { mode: 'public_full', fullContentAvailable: true };
const candidate = { id, title: 'Synthetic test fixture', problem: 'Metadata is not a lesson', contentAccess: publicAccess };
const memory = { id, version: 1, lifecycle: 'active', contentAccess: publicAccess,
  content: { insight: 'Synthetic data only', conditions: ['Only in a test'], failedApproaches: ['Failed method'] },
  provenance: { selfReported: true }, evidence: { independentValidators: 0 } };
const result = data => ({ content: [], structuredContent: data });

test('Darwin mapper drops metadata-only search; inspected adaptation retains limits and provenance', async () => {
  const search = { results: [candidate] };
  assert.deepEqual(defaultMapReadResult(search), []);
  const calls = [];
  const lessons = await readLessons(async request => {
    calls.push(request.name);
    return result(request.name === 'search_memories' ? search : memory);
  }, { query: 'synthetic public query', limit: 1 });
  assert.deepEqual(calls, ['search_memories', 'inspect_memory']);
  assert.equal(lessons.length, 1);
  assert.deepEqual(JSON.parse(lessons[0].content).inspected, memory);
  assert.equal('score' in lessons[0], false);
});

test('private/summary candidates are skipped without an inspect', async () => {
  let calls = 0;
  const lessons = await readLessons(async () => { calls++; return result({ results: [
    { ...candidate, contentAccess: { mode: 'summary_only', fullContentAvailable: false } },
    { ...candidate, id: 'mem_private', contentAccess: undefined },
  ] }); }, { query: 'synthetic public query', limit: 2 });
  assert.deepEqual(lessons, []); assert.equal(calls, 1);
});

test('inspection failure, changed visibility or wrong identity never become a lesson', async () => {
  for (const bad of [{ ...memory, id: 'mem_wrong' }, { ...memory, lifecycle: 'archived' },
    { ...memory, contentAccess: { mode: 'summary_only' } }, { ...memory, content: {} }])
    assert.throws(() => inspectedLesson(bad, id, 'test'), /FULL_PUBLIC_MEMORY_REQUIRED/);
  await assert.rejects(readLessons(async () => ({ isError: true }), 'test'), /PUBLIC_READ_TOOL_FAILED/);
});

test('empty search is distinct from a malformed successful response', async () => {
  assert.deepEqual(await readLessons(async () => result({ results: [] }), 'test'), []);
  await assert.rejects(readLessons(async () => result({ status: 'error' }), 'test'), /INVALID_SEARCH_RESPONSE/);
});

test('bounds and unsupported filters reject before any call', async () => {
  for (const opts of [{ query: '' }, { query: 'x'.repeat(501) }, { query: 'x', limit: 4 },
    { query: 'x', timeoutMs: 0 }, { query: 'x', tags: ['unimplemented'] }]) {
    let called = false;
    await assert.rejects(readLessons(async () => { called = true; }, opts));
    assert.equal(called, false);
  }
});

test('unknown versions stay unknown and oversized content is not silently truncated', () => {
  assert.equal(JSON.parse(inspectedLesson({ ...memory, version: undefined }, id, 'test').content).memoryVersion, null);
  assert.throws(() => inspectedLesson({ ...memory, content: { insight: 'x'.repeat(48001) } }, id, 'test'), /MEMORY_TOO_LARGE/);
});

test('JSON text MCP envelopes are supported and duplicate candidates do not double inspect', async () => {
  let reads = 0;
  const lessons = await readLessons(async request => {
    const data = request.name === 'search_memories' ? { results: [candidate, candidate] } : (reads++, memory);
    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
  }, 'test', 2);
  assert.equal(reads, 1); assert.equal(lessons.length, 1);
});
