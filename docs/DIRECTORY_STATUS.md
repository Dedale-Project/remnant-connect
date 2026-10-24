# Directory and guide review

Observed on **2026-10-17, 12:50–12:55 UTC**. This is a dated documentation review, not a new client compatibility test, a directory deployment or evidence of independent adoption. No external page was edited and no maintainer was contacted.

## Canonical sources and evidence labels

Use the [developer quickstart](DEVELOPER_QUICKSTART.md) for installation and [release version identities](RELEASING.md#version-identities) for artifact versions. Directory entries should link to that guide instead of maintaining another installation recipe. The package/lockfile identify integration **0.2.0** and JavaScript MCP SDK **1.32.1**; both plugin manifests identify portable plugin **0.1.8**. The Registry publication **0.1.0-beta.9.1** describes hosted application **0.1.0-beta.9**, not either package version.

- **EXAMPLE**: published runnable instructions, without inferring a successful run.
- **OPERATOR TESTED · date**: a recorded test under its stated versions, operating system and limits. This is not official framework support or independent reuse.
- **LISTING CHECKED · date**: a page was read and compared. This does not mean its install button was executed or its advertised runtime was tested.
- **UNKNOWN**: evidence was unavailable or that specific behavior was not tested. A pending correction is not a completed external change.

## Public copies checked

| Surface | Observation on 2026-10-17 | Remaining action or limit |
|---|---|---|
| [GitHub developer guide](https://github.com/Dedale-Project/remnant-connect/blob/main/docs/DEVELOPER_QUICKSTART.md) and [SDK guide](https://github.com/Dedale-Project/remnant-connect/blob/main/docs/REMOTE_MCP_QUICKSTART.md) | LISTING CHECKED. Public `main` still described plugin 0.1.6 and SDK 1.30.0; the current public package uses SDK 1.32.1. Both guides are corrected in the local candidate. | Publish the reviewed documentation revision, then recheck these URLs. This observation must remain historical after publication. |
| [GitHub release v0.2.0](https://github.com/Dedale-Project/remnant-connect/releases/tag/v0.2.0) | LISTING CHECKED. Published 2026-10-10 at 15:54:25 UTC; contains plugin 0.1.8 and its checksum. | Preserve the existing tag and archive bytes. Documentation corrections do not rewrite released snapshots. |
| [MCP Registry latest](https://registry.modelcontextprotocol.io/v0.1/servers/com.dedale-bi.remnant%2Fremnant/versions/latest) | LISTING CHECKED. Active/latest publication 0.1.0-beta.9.1, published/updated 2026-10-04 at 04:41:27 UTC. Its complete `server` object equals [the local manifest](server.registry.json), ignoring object-key order. It links to the canonical guide and the separate anonymous Read/OAuth contribution endpoints. | No manifest correction identified. The Registry snapshot is not a fresh attestation of the hosted runtime. |
| [mcpservers.org](https://mcpservers.org/servers/dedale-project/remnant-connect) | LISTING CHECKED through the web reader, crawled that day. Its README copy now includes integration 0.2.0, plugin 0.1.8, Apache-2.0 scope, seven anonymous Read tools and the guide link. The previously observed stale copy is no longer the current copy. | The directory-generated `npx add-mcp` shortcut advertises several clients. This alternate install path was not run: UNKNOWN. Prefer the canonical client-specific guide; draft A below. A separate direct Node HTTP fetch returned 403, so automated reachability is not claimed. |
| [Glama overview](https://glama.ai/mcp/servers/Dedale-Project/remnant-connect) and [source](https://glama.ai/mcp/servers/Dedale-Project/remnant-connect/tree) | LISTING CHECKED by fresh unauthenticated HTTP GET, both 200. Current source shows integration 0.2.0, plugin 0.1.8 and Apache-2.0 boundaries. Overview records seven tool updates under v0.2.0 on 2026-10-12. | Search/indexed excerpts still returned older license, missing-tools and deployment text. Fresh page content takes precedence; do not report those excerpts as today's state. No build, deployment or release was performed in this review. |
| [Glama schema](https://glama.ai/mcp/servers/Dedale-Project/remnant-connect/schema) | LISTING CHECKED by fresh HTTP GET 200. Protocol 2025-11-25 and seven tools are present, but the page leaves initialization instructions absent or unrecorded. The [public bridge source](https://github.com/Dedale-Project/remnant-connect/blob/main/src/read-bridge.mjs) supplies instructions. | UNKNOWN whether Glama inspected this bridge revision/entry point or another transport. Draft B asks for that verification; source code alone does not prove the published runtime sent those instructions. |
| [Hosted discovery](https://remnant.dedale-bi.com/.well-known/remnant.json) | LISTING CHECKED. Distinguishes anonymous Read, Agent OAuth, marketplace installation and public-directory approval; retains dated operator evidence and pending external acceptance. | No discovery change identified within this connector scope. Discovery publication does not prove independent client adoption. |
| [Agno showcase](https://github.com/agno-agi/agno/discussions/10803) | EXAMPLE; historical OPERATOR TESTED 2026-10-04 with Agno 3.1.1. LISTING CHECKED 2026-10-17. The post is by Dedale-Project in Show and tell and has no canonical installation-guide link. | No framework endorsement inferred. Keep its recorded pins/results; add the optional canonical-guide footer in draft C after authorization. No rerun occurred. |
| [smolagents showcase](https://github.com/huggingface/smolagents/discussions/2896) | EXAMPLE; OPERATOR TESTED update dated 2026-10-10. It records smolagents 1.26.0, Python MCP 1.30.0 and a pinned temporary MCPAdapt fork, with Linux fixture-test limits. LISTING CHECKED 2026-10-17; no canonical installation-guide link found. | These Python pins are distinct from the JavaScript package SDK 1.32.1. Preserve its historical limitations and unofficial-fork warning. Optional footer: draft C. No rerun or official framework support inferred. |

The portable 0.1.8 SHA-256 is `34ee9078f0f6150aedc82a37fb178d3096a4d926de3e770d30f30fe754ac0cb3`. Existing distribution checks verify the archive and older immutable archives. Full host/framework qualification is a separate task; this review does not wait on, or claim to replace, that matrix.

## Prepared external corrections — not sent

These drafts are reviewable proposals only. Editing an owned post on another site, using a directory update button, or contacting a maintainer requires separate authorization. Recheck the page before using a draft. No resync is needed merely to fix the old indexed Glama excerpts if fresh content remains current.

### A. mcpservers.org installation note

Target: the generated installation block on [the listing](https://mcpservers.org/servers/dedale-project/remnant-connect), not the already refreshed README copy. Its generic shortcut is untested here, not demonstrated broken.

Proposed note:

> For client-specific setup and dated compatibility limits, use the [Remnant installation guide](https://github.com/Dedale-Project/remnant-connect/blob/main/docs/DEVELOPER_QUICKSTART.md). Codex installation is documented through the repository plugin marketplace. Anonymous Read needs no Remnant account; contribution uses a separate OAuth connection. The generic directory installer has not been validated by Remnant for every listed client.

### B. Glama initialization-instructions verification

Target: the schema entry's missing/unrecorded instructions, not its seven-tool catalog.

Prepared request:

> On 2026-10-17, the fresh Remnant Read schema page displayed seven tools but no recorded initialization instructions. The public [bridge source](https://github.com/Dedale-Project/remnant-connect/blob/main/src/read-bridge.mjs) defines instructions for anonymous access, hosted data handling and evidence inspection. Please verify the published revision and inspected transport/entry point, then refresh the schema inspection if appropriate. For this repository's stdio bridge, the documented entry point is `node src/read-bridge.mjs`. Please retain the revision, transport and inspection time; the source declaration alone does not establish what the directory runtime returned. The [canonical guide](https://github.com/Dedale-Project/remnant-connect/blob/main/docs/DEVELOPER_QUICKSTART.md) describes the supported setup paths and their limits.

If the directory intentionally inspects the remote endpoint rather than this bridge, record that distinction instead of copying unverified instructions into the schema.

### C. Optional footer for the two operator showcases

Targets: the existing Agno and smolagents posts linked above. Append only; keep their original test dates, dependencies, errors and limitations.

> Installation reference, reviewed 2026-10-17: the [Remnant guide](https://github.com/Dedale-Project/remnant-connect/blob/main/docs/DEVELOPER_QUICKSTART.md) is the canonical source for current client setup. This post remains a dated Remnant-operator example with the versions and test limits stated above. Its presence in Show and tell does not establish official framework support or independent useful reuse.

For a future review, append a new dated observation rather than changing these observations to imply that a correction or compatibility run already happened.
