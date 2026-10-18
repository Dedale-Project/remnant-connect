# Changelog

Repository integration releases use `v<package.json version>` tags. The portable plugin has its own version; the hosted service and MCP Registry manifest are independently versioned. See [the release procedure](docs/RELEASING.md).

## 0.2.0 — 2026-10-10

- License the DÉDALE-owned public integration layer under Apache-2.0 after reviewing source provenance and dependency licenses. Explicitly exclude the private backend, hosted service, infrastructure and data; preserve `private: true`.
- Add a stdio bridge for hosts that need a local MCP process, connecting to the canonical anonymous Remnant Read endpoint. It does not grant access to Agent writes or move the private backend into this repository. See [setup and behavior](docs/STDIO_READ.md).
- Add the official Glama maintainer configuration and pin its schema for offline checks. Directory builds and Glama releases are separately verified deployment steps, not implied by a GitHub tag.
- Publish portable plugin **0.1.8** with the license and scope note included, reproducible packaging and checksums. Preserve existing read-only endpoint, seven-tool surface, separate OAuth contribution connection and prior privacy/consent instructions.
- Add CI for metadata, license, package coherence and local MCP/client contracts, plus a permanent release and directory refresh procedure.

Compatibility: Node.js 22 or newer is required for the integration package. Existing Streamable HTTP clients can continue to use `https://remnant.dedale-bi.com/mcp/chatgpt` directly. The repository remains private to npm publication and is installed from source; no npm release is claimed. The optional local bridge requires outbound access to the hosted service. Plugin upgrades require a host refresh/new chat; existing credentials do not imply new write consent.

Release artifacts: [plugin 0.1.8 ZIP](releases/remnant-plugin-0.1.8.zip), [SHA-256](releases/remnant-plugin-0.1.8.sha256), and GitHub's source archives for tag `v0.2.0`. No private server implementation or dependency directory is included in the portable plugin.

## Plugin 0.1.8 — 2026-10-10

Portable integration licensing release: add the full Apache-2.0 license and explicit scope; keep the existing read-only connection and skill behavior. The plugin version is separate from integration package 0.2.0.

## Plugin 0.1.7 — 2026-10-10

Require the close-loop check before the final response and search for duplicates across domains/facets before claiming novelty or publishing. Existing lessons with new actual-use evidence require feedback or an attributed extension. [Archive](releases/remnant-plugin-0.1.7.zip).

## Plugin 0.1.6 — 2026-10-10

Move the completion rule earlier in the skill and enable automatic activation for non-trivial technical work, within existing consent and privacy boundaries. [Archive](releases/remnant-plugin-0.1.6.zip).

## Plugin 0.1.5 — 2026-10-09

Add consented automatic contribution with explicit task, session, project and workspace opt-outs; keep the public plugin read-only. [Archive](releases/remnant-plugin-0.1.5.zip).
