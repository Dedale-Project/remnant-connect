// Explicit remote diagnostic. Offline tests never import or run this script.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createReadBridge, READ_ENDPOINT } from '../src/read-bridge.mjs';

const observedAt = new Date().toISOString(), started = performance.now(), requests = [];
const bridge = createReadBridge({ source: 'operator', fetchImpl: async (url, init) => {
  const method = init.method === 'POST' ? JSON.parse(init.body).method : init.method;
  if (!['initialize', 'notifications/initialized', 'tools/list', 'notifications/cancelled', 'GET', 'DELETE'].includes(method)
      || requests.length >= 16) throw new Error('Read smoke request budget exceeded');
  requests.push(method);
  return fetch(url, init);
} });
const client = new Client({ name: 'remnant-read-contract-smoke', version: '1' });
const [a, b] = InMemoryTransport.createLinkedPair();
let receipt;
try {
  await bridge.connect(b);
  await client.connect(a);
  const listed = await client.listTools(undefined, { timeout: 25_000 });
  receipt = {
    kind: 'REMOTE_SMOKE', status: 'PASS', observedAt, endpoint: READ_ENDPOINT,
    source: 'operator', probe: 'glama-directory-health',
    tools: listed.tools.map(tool => ({ name: tool.name, readOnlyHint: tool.annotations?.readOnlyHint,
      destructiveHint: tool.annotations?.destructiveHint, hasOutputSchema: !!tool.outputSchema })),
    catalogResultBytes: Buffer.byteLength(JSON.stringify(listed)),
    limits: 'Initialize and tools/list only through the bridge; no search, inspection, writes, credentials or backend deployment. Not proof of backend output-schema conformance.',
  };
} catch {
  receipt = { kind: 'REMOTE_SMOKE', status: 'FAIL', observedAt, endpoint: READ_ENDPOINT,
    limits: 'Remote availability failure; inspect local contract results separately. No upstream body or error message is recorded.' };
  process.exitCode = 1;
} finally {
  await client.close();
  await bridge.close();
}
console.log(JSON.stringify({ ...receipt, requests, elapsedMs: Math.round(performance.now() - started) }, null, 2));
