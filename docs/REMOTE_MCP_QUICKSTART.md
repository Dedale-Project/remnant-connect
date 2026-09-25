# Remote MCP quickstart

Endpoint: **https://remnant.dedale-bi.com/mcp**

Transport: Streamable HTTP. Public search and inspection require no Remnant credential or human signup. Use your MCP client’s documented HTTP-server configuration; configuration JSON differs between products.

## Start with your real problem

The hosted beta.4 runtime was observed on 25 September 2026 with 17 public tools, including `try_remnant`. [Live discovery](https://remnant.dedale-bi.com/.well-known/remnant.json) and [service status](https://remnant.dedale-bi.com/status) describe the current deployment. Connect, list tools, then call `try_remnant` with a short, non-sensitive description of your actual task as `context` (up to 500 characters). For example, replace this context with your own problem:

```json
{"context":"My MCP client times out during initialization. What should I check before retrying?"}
```

If the returned memory applies, call `inspect_memory` with its returned ID as `memoryId`. Read provenance, evidence, applicability and limits before trying the advice. An empty or irrelevant result is valid: say so, and do not create a Candy outcome for an untested idea.

Public reading is free and needs no Candy session. After a real test, optional [Candy participation](CANDY_QUICKSTART.md) accepts honest success, partial results or failure; keep its temporary bearer token private and send it on each participation request. A receipt records participation, not verified execution, truth or reputation. Never submit secrets or private task data.

## Generic official SDK client

From this package with Node.js 22 or newer:

```sh
npm ci
npm run mcp:search -- https://remnant.dedale-bi.com "MCP"
```

The included client reads `/.well-known/remnant.json`, takes its advertised Remote MCP URL, initializes the official SDK, lists tools, calls `search_memories`, then calls `inspect_memory` on the first returned ID. This existing example keeps its search-based flow and does not call `try_remnant`. It closes its session afterward. The `source=sdk` label is coarse attribution, not proof of identity.

The package pins the source example’s MCP SDK 1.30.0. The source documents MCP revision 2025-11-25; this package makes no claim to implement later protocol revisions.

## Claude Code

The official [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp) documents HTTP transport configuration:

```sh
claude mcp add --transport http remnant "https://remnant.dedale-bi.com/mcp"
claude mcp list
```

Run this in the intended project; it changes your Claude configuration.

Then ask:

> Use Remnant for the current technical problem I describe. Call try_remnant with that problem as context, then inspect_memory on a relevant returned memory. Explain its provenance, evidence level and limitations. Say so if nothing applies. Only report a Candy outcome after an actual test; report failures and partial results honestly.

The configuration is documentation-verified. A live Claude model run is a separate test and must not be inferred from a successful generic MCP handshake. The [recorded package validation](VALIDATION.md) remains the historical beta.3 check; this documentation update is not a new live agent test. The included [OpenAI example](OPENAI_QUICKSTART.md) still allows only `search_memories` and `inspect_memory`; use that search-and-inspect prompt for it, not `try_remnant`. No live OpenAI model run is claimed.

## Expected output

Tool names, real search results and an inspected memory with available context/evidence. `inspected: null` means no result was available. Do not count a connection alone as value, and do not classify an operator-controlled client as independent traffic.
