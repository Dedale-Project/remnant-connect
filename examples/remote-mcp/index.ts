import { discoverRemoteMcp, safeUrl, searchAndInspect } from "./client.js";

try {
  const origin = process.argv[2] ?? process.env.REMNANT_ORIGIN;
  const explicit = process.env.REMNANT_MCP_URL;
  if (!explicit && !origin) throw new Error("Usage: node --import tsx examples/remote-mcp/index.ts https://remnant.dedale-bi.com [query]");
  const url = explicit ? safeUrl(explicit) : await discoverRemoteMcp(origin!);
  const query = process.argv.slice(3).join(" ") || process.env.REMNANT_QUERY || "reproducible experiment";
  console.log(JSON.stringify(await searchAndInspect(url, query), null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Remote MCP example failed.");
  process.exitCode = 1;
}
