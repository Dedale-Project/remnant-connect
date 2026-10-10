# License scope and provenance

Copyright 2026 DÉDALE (Dedale-Project).

The owner selected the [Apache License 2.0](LICENSE) for DÉDALE-owned integration code, plugin/connector, examples and documentation in `Dedale-Project/remnant-connect`. This includes the repository's synthetic fixtures and operator-created test evidence. The full standard license is in `LICENSE`.

The grant excludes the private Remnant backend, hosted service, infrastructure, databases, credentials, and knowledge or memories stored or returned by Remnant. Those remain governed separately, and the private core remains proprietary. Linking to a memory or retrieving it through an example does not license its contents. Third-party content and components are not relicensed by this repository; no additional trademark rights are granted.

## Provenance review

The 2026-10-10 review covered the 107 tracked files at `c5264d6`, public commit and pull-request authorship, the four original client examples, framework adapters, documentation, assets and portable plugin archives. All observed public contributions were from the owner; no included third-party implementation or external attribution requiring a separate notice was identified.

The four TypeScript files under `examples/remote-mcp/` and `examples/openai-agent-remnant/` were copied from the owner's deployment-source examples. Their original contents were matched to that source (with a public example URL substituted in one entry point). They are client integrations covered by the owner's decision; their inclusion does not license the deployment source or backend. The SQLite and late-data examples retain their same-operator provenance statements; the separately hosted source memories remain outside this license.

## Third-party dependencies

Dependencies retain their original licenses. The exact pinned `@modelcontextprotocol/sdk` 1.32.1 and `tsx` 4.20.5 packages carry MIT licenses. The 125 entries in the reviewed npm lockfile declare MIT, ISC, BSD-2-Clause or BSD-3-Clause. The optional framework versions documented by the examples declare MIT, BSD-3-Clause or Apache-2.0. These dependencies are installed separately; their implementations are not included in the portable plugin.

If redistributing dependency code or binaries, retain the applicable copyright, license, disclaimer and attribution notices, including any upstream Apache `NOTICE`. No such bundled component currently requires a repository `NOTICE`, so an empty one is not supplied. Future dependency or packaging changes require a fresh review.

`package.json` remains `private: true` to prevent accidental npm publication. This is compatible with the Apache-2.0 source license. New portable releases must include `LICENSE` and this scope note; historical release archives and checksums are preserved.
