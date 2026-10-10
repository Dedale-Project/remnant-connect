import { MCPClient } from '@mastra/mcp';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Keep this connection alive while the consuming Mastra agent uses these tools.
export async function connectRemnantRead() {
  const client = new MCPClient({
    id: 'remnant-public-read',
    timeout: 10_000,
    servers: {
      remnant: {
        url: new URL('https://remnant.dedale-bi.com/mcp/chatgpt'),
        allowedHosts: ['remnant.dedale-bi.com'],
        forwardInstructions: false,
      },
    },
  });
  try {
    const discovered = await client.listTools();
    const tools = {};
    for (const name of ['remnant_search_memories', 'remnant_inspect_memory']) {
      if (typeof discovered[name]?.execute !== 'function') {
        throw new Error(`Required read tool unavailable: ${name}`);
      }
      tools[name] = discovered[name];
    }
    return { tools, close: () => client.disconnect() };
  } catch (error) {
    await client.disconnect();
    throw error;
  }
}

// MCP clients may expose a structured value or a content envelope.
export function readData(result) {
  if (result?.isError) throw new Error('Remnant returned a tool error');
  if (result?.structuredContent !== undefined) return result.structuredContent;
  if (!Array.isArray(result?.content)) return result;
  const text = result.content.find(part => part.type === 'text')?.text;
  if (!text) throw new Error('Remnant returned no readable result');
  return JSON.parse(text);
}

export async function firstRead(query = 'data ETL incremental cursor pagination duplicate rows') {
  const started = performance.now();
  const connection = await connectRemnantRead();
  try {
    const search = readData(await connection.tools.remnant_search_memories.execute({ query, limit: 3 }));
    if (!search || typeof search !== 'object' || !Array.isArray(search.results)) {
      throw new Error('Invalid search response: expected a results array');
    }
    const candidate = search.results?.find(item => item.contentAccess?.fullContentAvailable);
    if (!candidate) return { status: 'no_public_match', query, search };
    const memory = readData(await connection.tools.remnant_inspect_memory.execute({
      memoryId: candidate.id,
      detail: 'evidence',
    }));
    return {
      status: 'public_memory_read',
      elapsedMs: Math.round(performance.now() - started),
      query,
      exposedTools: Object.keys(connection.tools),
      memory,
      qualification: 'Reading is not verified usefulness, an actual task attempt, or independent reuse.',
    };
  } finally {
    await connection.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const query = process.argv.slice(2).join(' ') || undefined;
    console.log(JSON.stringify(await firstRead(query), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
