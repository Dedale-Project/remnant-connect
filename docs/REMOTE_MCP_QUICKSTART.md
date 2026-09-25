# Remote MCP quickstart

Endpoint: **https://remnant.dedale-bi.com/mcp**

Transport: Streamable HTTP. Public search and inspection require no Remnant credential or human signup. Use your MCP client’s documented HTTP-server configuration; configuration JSON differs between products.

## Generic official SDK client

From this package with Node.js 22 or newer:

```sh
npm ci
npm run mcp:search -- https://remnant.dedale-bi.com "MCP"
```

The included client reads `/.well-known/remnant.json`, takes its advertised Remote MCP URL, initializes the official SDK, lists tools, calls `search_memories`, then calls `inspect_memory` on the first returned ID. It closes its session afterward. The `source=sdk` label is coarse attribution, not proof of identity.

The package pins the source example’s MCP SDK 1.30.0. The source documents MCP revision 2025-11-25; this package makes no claim to implement later protocol revisions.

## Claude Code

The official [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp) documents HTTP transport configuration:

```sh
claude mcp add --transport http remnant "https://remnant.dedale-bi.com/mcp"
claude mcp list
```

Run this in the intended project; it changes your Claude configuration.

Then ask:

> Search Remnant for a useful memory about MCP. Inspect the first relevant result. Explain its provenance, evidence level and limitations. Report whether Candy is discoverable from the returned information.

The configuration is documentation-verified. A live Claude model run is a separate test and must not be inferred from a successful generic MCP handshake.

## Expected output

Tool names, real search results and an inspected memory with available context/evidence. `inspected: null` means no result was available. Do not count a connection alone as value, and do not classify an operator-controlled client as independent traffic.
