import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export function safeUrl(value: string, allowLoopback = true): URL {
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.hash || (url.protocol !== "https:" && !(allowLoopback && local && url.protocol === "http:"))) {
    throw new Error("Use an HTTPS URL without credentials or a fragment; HTTP is allowed only for local tests.");
  }
  return url;
}

export async function discoverRemoteMcp(origin: string, fetcher: typeof fetch = fetch): Promise<URL> {
  const base = safeUrl(origin);
  if (base.pathname !== "/" || base.search) throw new Error("Supply only the Remnant origin, or set REMNANT_MCP_URL to an explicit MCP endpoint.");
  const response = await fetcher(new URL("/.well-known/remnant.json", base), { redirect: "error", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Remnant discovery returned HTTP ${response.status}.`);
  const value = await response.json() as { remoteMcp?: { url?: unknown; publicRead?: unknown; enabled?: unknown } };
  if (value.remoteMcp?.publicRead !== true || value.remoteMcp?.enabled === false || typeof value.remoteMcp?.url !== "string") {
    throw new Error("This Remnant origin has not enabled anonymous Remote MCP. Ask the operator to enable public read.");
  }
  const url = safeUrl(value.remoteMcp.url);
  if (url.origin !== base.origin) throw new Error("Discovery returned a different origin; review it and set REMNANT_MCP_URL explicitly if intended.");
  return url;
}

export function toolValue(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") throw new Error("Remote MCP did not return a tool result.");
  const result = raw as { isError?: boolean; structuredContent?: unknown; content?: unknown };
  let value = result.structuredContent;
  if (!value && Array.isArray(result.content)) {
    const text = result.content.find(item => item?.type === "text" && typeof item.text === "string");
    if (text) value = JSON.parse(text.text);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Remote MCP did not return structured tool data.");
  const data = value as Record<string, unknown>;
  if (result.isError) {
    const code = typeof data.code === "string" ? data.code.replace(/[^A-Z_]/g, "").slice(0, 60) : "TOOL_ERROR";
    const delay = typeof data.retryAfterSeconds === "number" ? ` Retry after ${data.retryAfterSeconds} seconds.` : "";
    throw new Error(`${code}.${delay} Inspect the endpoint configuration or retry as directed.`);
  }
  return data;
}

export async function searchAndInspect(url: URL, query: string, fetcher: typeof fetch = fetch) {
  const endpoint = safeUrl(url.href);
  endpoint.searchParams.set("source", "sdk");
  const client = new Client({ name: "remnant-external-example", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(endpoint, { fetch: fetcher, requestInit: { redirect: "error" } });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    for (const required of ["search_memories", "inspect_memory"]) {
      if (!tools.some(tool => tool.name === required)) throw new Error(`Remote MCP does not expose ${required}.`);
    }
    const search = toolValue(await client.callTool({ name: "search_memories", arguments: { query, limit: 3 } }));
    const first = Array.isArray(search.results) ? search.results[0] as { id?: unknown } | undefined : undefined;
    const inspected = typeof first?.id === "string"
      ? toolValue(await client.callTool({ name: "inspect_memory", arguments: { memoryId: first.id } }))
      : null;
    return { tools: tools.map(tool => tool.name), search, inspected };
  } finally {
    try { if (transport.sessionId) await transport.terminateSession(); }
    finally { await client.close(); }
  }
}
