import { isReadV2Resource, chooseReadProfile } from '../../src/read-profiles.mjs';

/** This concrete SDK client implements resources/read. This says nothing about other hosts. */
export async function searchInspectEvidence(client, query) {
  const options = { timeout: 20_000, maxTotalTimeout: 20_000 };
  if (!client.getServerCapabilities()?.resources) throw new Error('Selected server does not expose resources/read; select full-v1 explicitly.');
  const { tools } = await client.listTools(undefined, options);
  if (!tools.length || tools.some(tool => tool._meta?.['remnant/outputContract'] !== 'remnant-public-read-v2'))
    throw new Error('Expected the explicitly selected Remnant Read v2 contract.');
  const search = await client.callTool({ name: 'search_memories', arguments: { query, limit: 1 } }, undefined, options);
  if (search.isError) return { profile: 'minimal-v2', search };
  const memoryId = search.structuredContent?.results?.[0]?.id;
  if (!memoryId) return { profile: 'minimal-v2', search };
  const inspect = await client.callTool({ name: 'inspect_memory', arguments: { memoryId } }, undefined, options);
  if (inspect.isError) return { profile: 'minimal-v2', search, inspect };
  const uri = inspect.structuredContent?.evidenceResource;
  if (!isReadV2Resource(uri)) throw new Error('Inspection did not return a supported evidence URI.');
  const evidence = await client.readResource({ uri }, options);
  return { profile: chooseReadProfile('SUPPORTED', true), search, inspect, evidence };
}
