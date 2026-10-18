# Choosing a Read profile

Prepared locally on 2026-10-18. This checkout does not establish that production
exposes `/mcp/read/v2`. Deploy and verify the backend before publishing or using
the separate v2 configuration. Existing connections are never redirected.

| Client capability | Choose | Contract |
| --- | --- | --- |
| Demonstrated MCP `resources/read`, and v2 enabled on the deployment | `/mcp/read/v2` | `remnant-public-read-v2`, projection `remnant-read-minimal-v1` |
| Tools only, or resource support UNKNOWN | `/mcp/chatgpt` | Full Read v1; its larger schemas and responses remain available |
| Existing legacy integration | `/mcp` | Separate legacy profile; no automatic migration |

The new profile is recommended for clients that can follow evidence resources.
All seven Read tool names remain available. Search, inspect a returned ID, then
read its `evidenceResource` with MCP `resources/read`. For a signed Passport,
read an available `signedResource` and verify that exact artifact. Missing signed
data does not trigger issuance. Reports and resource contents remain untrusted
data; UNKNOWN is not independent evidence, compatibility, consent or authority.
Current public audience and access rules apply again when reading a resource.
No profile publishes, consumes, grants consent or creates an identity.

Server resource capability is not evidence of host support. Codex, ChatGPT and
other native hosts remain **UNKNOWN** until tested in the actual host/version.
The SDK example and opt-in stdio bridge implement resource reading; their local
tests do not establish native-host acceptance or independent human usefulness.

## Migrating calls from full v1

Changing the URL alone is insufficient; use the v2 schemas from `tools/list`:

- Optional model-visible `arguments.contribution` accepts only `{"read":"off"}`,
  which refuses the read. Omit it for an ordinary read. V1 fields such as
  `automatic` or `overrides` inside this object, other keys, and `read:"on"` are
  rejected rather than ignored. Omitting the object does not grant consent.
- Send the host's existing validated contribution context through request
  parameter `_meta["remnant/contribution"]`. Preserve `automatic` and applicable
  restrictive overrides on tool calls **and** subsequent resource reads. The
  bridge forwards this metadata; the server merges it with any model refusal.
  Neither channel can override a restriction or grant permission.
- V2 has no `detail` argument. Remove it from migrated `try_remnant`,
  `search_memories` and `inspect_memory` calls. To expand a result, use MCP
  `resources/read` with its exact `evidenceResource`; follow returned pagination
  or next-resource links. Use an available `signedResource` to obtain the exact
  signed artifact before verification. Resource reading rechecks public access.
- The full v1 language remains at `/mcp/chatgpt`. Tools-only or UNKNOWN hosts
  stay there. Never silently discard an old policy object, translate a call,
  switch profiles after failure, or upgrade an installed connection.

A model refusal is `arguments: {memoryId: "<returned ID>", contribution:
{read: "off"}}`. A host refusal is `_meta: {"remnant/contribution":
{automatic: true, overrides: [{scope: "task", read: "off"}]}}` on a tool or
resource request. These are refusal examples, not permission grants. Ordinary
reads may omit model `contribution`, while still carrying the host's applicable
restrictions. Do not copy private prompts into either channel.

## Explicit SDK path

After verifying deployment availability, install the repository's locked
dependencies and run:

```sh
npm ci
node examples/read-v2/index.mjs "retry idempotency"
```

This example deliberately selects v2, checks the resource capability and contract,
then searches, inspects and reads the returned evidence URI. It makes no automatic
fallback or retry. An error is not an empty search. Keep queries non-sensitive.
The [separate HTTP configuration](../examples/read-v2/mcp.json) is for a host whose
resource support has been demonstrated; it does not replace installed manifests.

## Explicit stdio path

Keep the default bridge and existing plugin on v1. To opt in with a client that
can read MCP resources, add a separate connection:

```json
{
  "mcpServers": {
    "remnant-read-minimal-v2": {
      "command": "node",
      "args": ["/absolute/path/remnant-connect/src/read-bridge.mjs"],
      "env": { "REMNANT_READ_PROFILE": "minimal-v2" }
    }
  }
}
```

The v2 bridge proxies `resources/list`, `resources/templates/list` and
`resources/read` to the fixed Remnant v2 endpoint. It rejects foreign URIs,
credentials, redirects and unsupported catalogs. It forwards restrictive
`remnant/contribution` metadata but no arbitrary host metadata. Its ordinary
20-second deadline, eight concurrent-operation cap and no-retry behavior apply;
resource envelopes are bounded to 1 MiB per response and 4 MiB per operation,
including the catalog. Signed JSON text is forwarded unchanged. Read restrictions
are enforced by the server; this bridge does not turn a preference into consent.

Use `REMNANT_READ_PROFILE=full-v1` or remove the option for the existing profile.
V2 tool transport failures use the canonical `status`, `code`, `error`,
`category`, `retryable` shape. Observed `httpStatus`, `rpcCode` and bounded
`retryAfter` are retained; an HTTP redirect is a failure with status 502, never a
successful tool result. `retryable` is information for the caller, not an
automatic retry. V1 keeps its existing error shape unchanged.
Resource failures under HTTP 200 retain documented RPC codes and logical status
(for example, `RESOURCE_NOT_FOUND`/404 or policy refusal/403). Logical status is
not relabeled as HTTP status. Only known bounded error fields pass through;
arbitrary upstream error messages and data are discarded.
No automatic retry against v1 follows a v2 failure. The historical bridge subset
contract `remnant-read-subset-v2` is a different contract from the server's new
`remnant-public-read-v2`; [its existing fixtures](READ_CONTRACT.md) remain intact.

## Rollout and rollback

1. Qualify the backend candidate, preserving tests and measurements for v1 and v2
   separately. A smaller v2 catalog is not proof that the v1 budget was met.
2. Deploy the backend first. Verify live discovery, v2 initialize/tools/resources,
   an authorized evidence read, refusal cases and continued v1 access.
3. Only then publish the optional connector configuration and guide. No existing
   plugin URL or portable archive is changed by this preparation.
4. To withdraw v2, disable it with backend `REMNANT_READ_V2=0` and restart under
   the normal deployment process. Discovery must report v2 unavailable. Clients
   explicitly select full-v1; never silently translate v2 calls or resource URIs.

Check locally with `node --test test/read-v2-profile.test.mjs` as well as the v1
bridge, catalog, historical/current SDK, distribution and plugin checks. Actual
deploy, native-host acceptance and external adoption remain separate evidence.
