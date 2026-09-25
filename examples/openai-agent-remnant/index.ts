import { askWithRemnant, createResponseRequest } from "./client.js";

try {
  const serverUrl = process.env.REMNANT_MCP_URL;
  if (!serverUrl) throw new Error("Set REMNANT_MCP_URL to the public HTTPS MCP URL shown on /connect.");
  const options = { serverUrl, query: process.env.REMNANT_QUERY || "How can I make an experiment reproducible?", model: process.env.OPENAI_MODEL };
  if (process.argv.includes("--dry-run")) console.log(JSON.stringify(createResponseRequest(options), null, 2));
  else {
    const result = await askWithRemnant({ ...options, apiKey: process.env.OPENAI_API_KEY ?? "" });
    console.log(result.text);
    console.log(JSON.stringify({ mcpCalls: result.calls, searched: result.searched }));
    if (!result.searched) { console.error("The model did not complete a Remnant search. Inspect connectivity and tool availability before counting activation."); process.exitCode = 1; }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "OpenAI example failed.");
  process.exitCode = 1;
}
