import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { searchInspectEvidence } from './client.mjs';
import { READ_PROFILES } from '../../src/read-profiles.mjs';

// Explicit candidate choice. Verify deployment availability before running; no fallback or retries.
const client = new Client({ name: 'remnant-read-v2-resource-example', version: '1.0.0' });
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(READ_PROFILES['minimal-v2'].endpoint), {
    requestInit: { redirect: 'error', credentials: 'omit' },
  }), { timeout: 20_000, maxTotalTimeout: 20_000 });
  console.log(JSON.stringify(await searchInspectEvidence(client, process.argv.slice(2).join(' ') || 'retry idempotency'), null, 2));
} catch { process.stderr.write('Read v2 example failed. Check deployment availability and resource support; no fallback was made.\n'); process.exitCode = 1; }
finally { await client.close(); }
