import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const manifest = read('schemas/adapter-compatibility-v2.json');

test('matrix contains exactly seven honest framework rows and explicit native/model gaps', () => {
  assert.deepEqual(manifest.frameworks.map(row => row.framework),
    ['LangGraph', 'PydanticAI', 'AutoGen', 'Mastra', 'Agno', 'smolagents', 'Codex']);
  for (const row of manifest.frameworks) {
    assert.equal(row.status, 'EXPERIMENTAL');
    assert.equal(row.nativeFrameworkExecution, 'NOT_RUN');
    assert.equal(row.modelExecution, 'NOT_RUN');
    assert.equal(row.latestUpstreamVersion, 'UNKNOWN_NOT_QUERIED');
    assert.ok(row.maintenanceOwner);
    assert.match(row.reviewDue, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(row.historicalObservation);
  }
  const smol = manifest.frameworks.find(row => row.framework === 'smolagents');
  assert.equal(smol.source.kind, 'INTEGRATED_SOURCE_IDENTIFIED_NOT_EVALUATED');
  assert.equal(smol.priorSource.kind, 'UNINTEGRATED_BRANCH_SOURCE');
  assert.ok(smol.privateSeam.owner && smol.privateSeam.exit);
  assert.equal(smol.privateSeam.upstreamFix, 'UNKNOWN');
});

test('evidence is bound to the corpus and reviewed source bytes, normalized to LF across platforms', () => {
  const files = [manifest.corpus, ...manifest.frameworks.flatMap(row => row.source.files ?? []),
    ...Object.values(manifest.auxiliary).flatMap(row => row.files)];
  for (const file of files) {
    const data = readFileSync(new URL(file.path, root), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(createHash('sha256').update(data, 'utf8').digest('hex'), file.sha256,
      `${file.path}: source changed; review and update the evidence, never keep a stale compatibility claim`);
  }
});

test('common corpus and v2 subset retain explicit semantics without rewriting the historical v1 manifest', () => {
  const corpus = read(manifest.corpus.path);
  assert.deepEqual(corpus.memoryIds.map(id => id.length - 4), [16, 24, 32]);
  assert.ok(corpus.memoryIds.every(id => /^mem_[0-9a-f]{16,32}$/.test(id)));
  assert.ok(corpus.invalidMemoryIds.every(id => !/^mem_[0-9a-f]{16,32}$/.test(id)));
  assert.equal(corpus.errorEnvelope.isError, true);
  assert.deepEqual(corpus.emptySearch.results, []);
  assert.equal(read('schemas/read-contract-v1.json').contractVersion, 'remnant-read-bridge-v1');
  assert.equal(read('schemas/read-contract-v2.json').contractVersion, manifest.readContract);
});

// Current source reviews must never rewrite their historical evidence.
test('current integration matrix retains the exact historical observation', () => {
  const previous=readFileSync(new URL(manifest.priorManifest.path,root));
  assert.equal(createHash('sha256').update(previous).digest('hex'),manifest.priorManifest.sha256);
  assert.equal(JSON.parse(previous).manifestVersion,'remnant-adapter-compatibility-v1');
  assert.equal(manifest.manifestVersion,'remnant-adapter-compatibility-v2');
});
