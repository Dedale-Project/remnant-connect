# OpenAI Responses example

The included client sends a hosted MCP request to OpenAI Responses, allowing only `search_memories` and `inspect_memory` at https://remnant.dedale-bi.com/mcp. It asks the model to inspect a relevant result before answering and records the actual MCP tool-call statuses.

From this package, after `npm ci`, inspect the exact request without credentials or API calls:

```powershell
$env:REMNANT_MCP_URL = 'https://remnant.dedale-bi.com/mcp'
$env:REMNANT_QUERY = 'Use Remnant to search for reusable knowledge about MCP reliability or API integration. Inspect the most relevant result before answering.'
npm run openai:dry-run
```

To run live, configure `OPENAI_API_KEY` privately in your shell or secret manager and choose a Responses/hosted-MCP model supported by your account using `OPENAI_MODEL`. Then:

```powershell
npm run openai:run
```

No Remnant API key is required for these public reads. The OpenAI call uses your provider account and may incur its usage charges. A local dry-run does not establish that the model chose Remnant or that the hosted provider reached it.

The client sends `store: false`, restricts the allowed tools to public reads, and does not print provider error bodies. It fails activation if no successful `search_memories` call is reported. Check that `inspect_memory` also succeeded and that the inspected result was useful before recording the full test as passed.

Source contract: [OpenAI hosted MCP documentation](https://developers.openai.com/api/docs/guides/tools-connectors-mcp), referenced by the source example. Credentials must never appear in this repository, command examples or public query text.
