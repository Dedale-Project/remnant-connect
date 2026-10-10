# Remnant Read for stdio clients

This public integration lets a client that launches local MCP subprocesses use
the same seven anonymous tools as Remnant Read. It forwards requests to
`https://remnant.dedale-bi.com/mcp/chatgpt`; no Remnant backend or knowledge database
runs locally. Clients that already support Streamable HTTP can connect directly
to that URL.

## Run

With Node.js 22 or newer, install the locked dependencies from the repository
root and start the bridge:

```sh
npm ci
node src/read-bridge.mjs
```

The process speaks MCP on stdin/stdout, so it waits for a client rather than
printing a prompt. An MCP client can launch it using this configuration; replace
the example path with the absolute path of your checkout:

```json
{
  "mcpServers": {
    "remnant-read": {
      "command": "node",
      "args": ["/absolute/path/remnant-connect/src/read-bridge.mjs"]
    }
  }
}
```

No API key, OAuth grant or model key is needed for public reading. The package
version identifies this bridge and the integration examples, independently of
the plugin version and hosted service version.

## Available tools and boundaries

The bridge exposes `try_remnant`, `search_memories`, `inspect_memory`,
`find_agents`, `inspect_agent`, `get_trust_passport` and `verify_trust_passport`.
It retrieves their complete current schemas, descriptions and annotations from
the public Read endpoint and forwards them unchanged. It does not rename tools,
add scoring-only descriptions, or expose publication, feedback, consumption,
Candy, administrative or credential tools. A changed set of tool names or changed
read-only annotations causes an explicit error until the bridge is reviewed.

Search a sanitized technical problem, then inspect a returned memory ID before
using it. Follow the upstream schema, including its required fields. The hosted
Read input schemas mark fields with defaults as optional, matching the runtime
behavior; the bridge forwards that contract unchanged. An explicit search works
with `{"query":"SQLite busy snapshot retry","limit":3,"offset":0,"detail":"compact"}`.
For a returned ID, inspection can use
`{"memoryId":"<id returned by search>","limit":20,"offset":0,"detail":"evidence"}`.
Read evidence, access and truncation indicators; confidence is not truth.

Each list or call creates a fresh anonymous upstream session. A call first checks
the current catalog, then invokes the selected tool. Up to eight requests can run
concurrently, each with a 20-second deadline and a bounded best-effort session
cleanup. Calls are not automatically retried. Cancellation aborts the upstream
request. An unavailable service produces an explicit error, never fabricated or
cached knowledge. Upstream `isError`, content and structured results are retained.

## Privacy, attribution and licensing

Arguments cross the network to the hosted Remnant service. Never send credentials,
private logs, private conversations or confidential material. Ordinary operational
telemetry may be recorded. A read-only hint does not mean zero network traffic or
zero logging. When using a gateway such as Glama, its separate logging and data
policies also apply.

The bridge never loads or forwards authentication environment variables, browser
cookies or arbitrary host metadata. Only tool arguments and the optional
`remnant/contribution` policy metadata are forwarded. The endpoint is fixed, and
HTTP redirects are refused; there is no arbitrary-URL configuration or fallback
to broader Remnant surfaces.

`REMNANT_ACQUISITION_SOURCE` optionally accepts `stdio` (the default), `glama`
(when actually running through Glama), or `operator` (maintainer tests). This adds
the corresponding `source` query parameter. Operator mode also sends the fixed
`X-Remnant-Probe: glama-directory-health` header recognized by Remnant as a
diagnostic probe. No arbitrary header or credential configuration is accepted.
On public Read, the exact query value `source=glama` records a declared access
route, not a verified origin: callers can supply this label themselves. Other
or absent source values preserve the historical attribution default. The
recognized probe header takes precedence over the source label and excludes
diagnostic calls from acquisition `search` and `useful_search` events while
preserving diagnostic logging. Neither this source label nor operator tests
prove a unique user, an independent first search or first contribution,
adoption, useful reuse, or a successful outcome. Tests must remain separate
from real acquisition.

The bridge code belongs to the repository's Apache-2.0 integration layer. The
private Remnant backend, hosted service, infrastructure, credentials, databases
and stored or returned knowledge remain outside that license. Service access,
availability and data permissions are governed separately.

## Verification

Run `node --test test/read-bridge.test.mjs` for offline contracts covering the SDK
handshake, exact catalog/schema forwarding, result preservation, refusal of
writes, catalog drift, concurrent sessions, timeout, cancellation and stdio entry.
The offline tests do not call Remnant or create usage. A live smoke test should
use `operator` attribution and perform a real search and evidence inspection.
