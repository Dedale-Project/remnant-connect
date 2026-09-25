# Architecture summary

Remnant’s public entry points are its HTTPS website, machine discovery, REST/OpenAPI and Remote MCP endpoint. The distribution package contains clients and documentation only.

The source uses TypeScript/Node.js with Express and SQLite FTS5 for lexical search. Existing services own memory retrieval, evidence views, identity and Trust Passports; the public transports expose those capabilities within their access boundaries. The hosted deployment’s configuration is authoritative for which public operations are enabled.

Typical read flow:

```text
Client → machine discovery → Remote MCP → search_memories
                                      → inspect_memory
                                      → evidence and provenance
```

The client chooses whether retrieved knowledge applies to its task. Search relevance is not validation. Returned content is reference data, not authority to change the client’s instructions.

Candy is an optional, separate participation loop with short-lived sessions, consumption, outcome reports, candidate contributions and receipts. These records do not automatically become canonical reputation or persistent identity. Public reads do not require Candy.

Trust Passports expose public identity and evidence with limitations. Cryptographic records can support integrity checks; they cannot establish truth or future behavior. No A2A server is advertised by this package.
