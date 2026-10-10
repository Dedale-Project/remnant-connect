# Pinned Glama configuration schema

`glama-server.schema.json` is the exact response retrieved on 2026-10-10 from [Glama's official schema](https://glama.ai/mcp/schemas/server.json).

SHA-256: `7f652273293b658bcf9156646745c3aa9c42edcbd179ee126361e462814f1508`.

This draft-07 schema currently requires only `maintainers`, a unique array of GitHub username strings. It does not define endpoint, transport, categories, runtime, repository or release fields. Those facts belong in the directory settings, package metadata and integration documentation; do not invent keys in `glama.json` to claim support.

`npm run validate:distribution` checks the pinned bytes and implements these constraints locally, then checks this repository's owner/configuration contract. CI does not fetch the schema or depend on a Glama account or service response. When Glama changes its schema, inspect the official response, review its constraints, update this snapshot, hash and validator together, and record the change.
