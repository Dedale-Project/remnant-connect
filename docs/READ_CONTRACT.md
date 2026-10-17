# Read bridge contract v1

`schemas/read-contract-v1.json` names the public integration contract. The fixtures
in `test/fixtures/read-contract-v1.mjs` are synthetic, account-free transport and
schema examples. They are not captured backend memories or the real per-tool
output schemas. `outputSchema` is optional MCP functionality; its absence from a
live tool is not a protocol violation.

## Local verification

```sh
npm run test:bridge
npm run test:read-contract
```

The production bridge uses the pinned MCP SDK 1.32.1. The same local fixture suite
also runs with historical client SDK **1.30.0**, when supplied explicitly:

```sh
npm install --prefix /tmp/remnant-historical-sdk --no-save --ignore-scripts @modelcontextprotocol/sdk@1.30.0
REMNANT_HISTORICAL_SDK_ROOT=/tmp/remnant-historical-sdk/node_modules/@modelcontextprotocol/sdk npm run test:read-contract
```

PowerShell accepts the same directory through
`$env:REMNANT_HISTORICAL_SDK_ROOT = 'C:/path/to/node_modules/@modelcontextprotocol/sdk'`.
The test reads that package's manifest and refuses any version other than 1.30.0.
It does not download a package or touch the main dependency lock. Without the
variable, the historical check is explicitly skipped. CI installs the historical
package in a separate temporary prefix and runs both clients.

| Client | Role | What the suite exercises |
| --- | --- | --- |
| MCP TypeScript SDK 1.32.1 | Current pinned client | Initialization, definitions, optional output-schema validation, result shapes, failures and read boundary |
| MCP TypeScript SDK 1.30.0 | Named historical representative | Identical fixtures against the current bridge |

This is a named historical compatibility check, not a claim about the immediately
preceding SDK release, all older clients or native host integrations. Both clients
negotiate protocol revision 2025-11-25 in these fixtures.

The suite covers the seven supported tool names, schema/metadata fields and
extensions, `isError`, Unicode, empty content, missing content normalized by the
SDK to an empty array, valid structured results and malformed outputs. A supplied
output schema is validated using the SDK's JSON Schema validator; an invalid
result becomes `UPSTREAM_INVALID_RESPONSE`, never an input-parameter diagnosis.
The low-level wire assertion checks this bridge error independently of a client's
optional output-schema checks. A client's schema-checking convenience method can
also reject an error object that does not match the advertised success schema;
future backend output schemas must account for supported client behavior.

The exposed subset remains exactly seven tools. Missing, duplicate, unsafe or
additional catalog entries fail closed. Unknown/write tools cannot dispatch.
Tolerating catalog additions through a versioned subset is still the separately
approved adapter-compatibility work (014); these tests do not claim it is done.

## Safe errors and retry hints

| Observation | Public code | Preserved detail |
| --- | --- | --- |
| HTTP 429 | `UPSTREAM_RATE_LIMITED` | `httpStatus`, validated `retryAfterSeconds` |
| HTTP 503 or other HTTP failure | `UPSTREAM_UNAVAILABLE` | `httpStatus`; Retry-After for 503 |
| HTTP 401/403 | `UPSTREAM_ACCESS_DENIED` | `httpStatus`; no auth attempt |
| JSON-RPC -32602 | `UPSTREAM_INVALID_PARAMS` | `rpcCode`; correct the input |
| Malformed tool result/output | `UPSTREAM_INVALID_RESPONSE` | No raw result |
| Deadline / caller cancellation | `UPSTREAM_TIMEOUT` / `REQUEST_CANCELLED` | No retry |

Tool-call failures retain `isError` and the bounded machine-readable fields in
`structuredContent`. Catalog failures use JSON-RPC error `data` for the same safe
fields. Messages are fixed; upstream HTTP bodies are cancelled before the SDK can
buffer them, and upstream protocol error messages/data are not copied.

Retry-After accepts unsigned integer seconds or a canonical IMF-fixdate HTTP date
(`Sat, 17 Oct 2026 12:00:17 GMT`). Past dates become zero. Values cap at 3,600 seconds;
headers over 128 characters and invalid dates/numbers are omitted. Obsolete date
formats are omitted conservatively. The hint does not authorize or schedule a
retry. No automatic retries, credential recovery or mutation replay are added.

## Separate remote smoke

```sh
npm run smoke:read-contract
```

This opt-in command performs only initialization and tools/list through the
canonical bridge endpoint with `source=operator` and its existing diagnostic
probe marker. It has a request budget and the bridge's 20-second deadline; no
search, inspection or tool execution occurs. Its JSON receipt reports
`REMOTE_SMOKE` separately from offline test output. Operational diagnostic logging
can still occur. A remote failure is not evidence that the local fixtures failed.

## Remaining backend acceptance

This connector change does not modify the backend or complete all of proposal
003. Real per-tool output schemas, their result validation and the backend's
compatibility suite remain to be delivered and reviewed. No live output-schema
coverage is inferred from a successful catalog smoke. The catalog/description
size target in 018 and the seven-framework matrix in 014 are separate work.
